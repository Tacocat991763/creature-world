"""Tests verifying movement is independent of any LLM."""
import pytest
import asyncio
from backend.world.state import build_default_world
from backend.world.entities import Vec2
from backend.world.engine import WorldEngine
from backend.world.events import EventBus
from backend.movement.model import MovementModel
from backend.world.persistence import init_db


@pytest.fixture
async def setup(tmp_path):
    db = str(tmp_path / "mv.db")
    world = build_default_world()
    world.creature.position = Vec2(x=50.0, y=50.0)
    bus = EventBus()
    engine = WorldEngine(state=world, db_path=db, event_bus=bus)
    await init_db(db)
    model = MovementModel(engine=engine, stimulation=None, event_bus=bus)
    return engine, model


@pytest.mark.asyncio
async def test_movement_works_without_llm(setup):
    engine, model = setup
    initial_pos = Vec2(x=engine.state.creature.position.x,
                       y=engine.state.creature.position.y)
    # Run several movement updates
    for _ in range(20):
        await model._update()
        await engine._tick(0.04)
    final_pos = engine.state.creature.position
    # Creature should have moved somewhere
    dist = initial_pos.distance_to(final_pos)
    assert dist > 0.0, "Creature did not move at all"


@pytest.mark.asyncio
async def test_high_fatigue_slows_movement(setup):
    engine, model = setup
    # Inject high fatigue via stimulation dict override
    class FakeStim:
        def get_outputs(self):
            return {
                "reward": 0.0, "distress": 0.0, "curiosity": 0.1,
                "attachment": 0.0, "arousal": 0.0,
                "fatigue": 0.9,   # very fatigued
                "threat": 0.0, "familiarity": 0.0,
            }
    model.stimulation = FakeStim()
    await model._update()
    # Should be resting or very slow
    speed = engine.state.creature.velocity.length()
    assert speed < engine.state.creature.speed * 0.6, f"Expected slow movement, got speed={speed:.2f}"


@pytest.mark.asyncio
async def test_high_threat_increases_speed(setup):
    engine, model = setup
    class HighThreat:
        def get_outputs(self):
            return {
                "reward": 0.0, "distress": 0.5, "curiosity": 0.0,
                "attachment": 0.0, "arousal": 0.6,
                "fatigue": 0.0, "threat": 0.8, "familiarity": 0.0,
            }
    model.stimulation = HighThreat()
    # Place a threat object near creature
    from backend.world.entities import WorldObject, ComponentSet
    threat_obj = WorldObject(
        type="rock", name="threat",
        position=Vec2(x=52.0, y=50.0), radius=1.0,
        components=ComponentSet(collidable=True),
    )
    engine.state.add_entity(threat_obj)
    model._decide_drive(HighThreat().get_outputs(), engine.state)
    assert model._move_decision == "flee"


@pytest.mark.asyncio
async def test_curiosity_seeks_novel_objects(setup):
    engine, model = setup
    class HighCuriosity:
        def get_outputs(self):
            return {
                "reward": 0.0, "distress": 0.0, "curiosity": 0.9,
                "attachment": 0.0, "arousal": 0.3,
                "fatigue": 0.0, "threat": 0.0, "familiarity": 0.0,
            }
    model.stimulation = HighCuriosity()
    model._decide_drive(HighCuriosity().get_outputs(), engine.state)
    assert model._move_decision in ("seek_novel", "wander")
