"""Tests for world simulation independence from LLM."""
import pytest
import asyncio
from backend.world.state import build_default_world, WorldState
from backend.world.entities import Vec2, Creature, WorldObject, ComponentSet
from backend.world.events import EventBus, GameEvent, EventType
from backend.world.engine import WorldEngine


@pytest.fixture
def world():
    return build_default_world()


@pytest.fixture
def engine(world, tmp_path):
    db = str(tmp_path / "test.db")
    return WorldEngine(state=world, db_path=db)


def test_default_world_has_creature(world):
    assert world.creature is not None
    assert world.creature.id == "creature_1"


def test_default_world_has_entities(world):
    assert len(world.entities) > 0


def test_objects_near(world):
    close = WorldObject(
        type="flower", name="test",
        position=Vec2(x=50.5, y=50.5), radius=0.5,
        components=ComponentSet(interactable=True),
    )
    world.add_entity(close)
    near = world.objects_near(world.creature.position, radius=5.0)
    ids = [e.id for e in near]
    assert close.id in ids


def test_world_serialises(world):
    data = world.model_dump_json()
    restored = WorldState.model_validate_json(data)
    assert restored.creature.id == world.creature.id
    assert len(restored.entities) == len(world.entities)


@pytest.mark.asyncio
async def test_engine_ticks_without_llm(engine, tmp_path):
    from backend.world.persistence import init_db
    await init_db(engine.db_path)
    # Manual tick — no LLM connected
    initial_version = engine.state.version
    await engine._tick(0.04)
    assert engine.state.version == initial_version + 1


@pytest.mark.asyncio
async def test_collision_pushes_creature(engine, tmp_path):
    from backend.world.persistence import init_db
    await init_db(engine.db_path)
    # Place a wall directly where creature is heading
    creature = engine.state.creature
    creature.position = Vec2(x=50.0, y=50.0)
    creature.velocity = Vec2(x=10.0, y=0.0)
    wall = WorldObject(
        id="wall_test", type="rock", name="wall",
        position=Vec2(x=51.5, y=50.0), radius=2.0,
        components=ComponentSet(collidable=True),
    )
    engine.state.add_entity(wall)
    await engine._tick(0.1)
    # Creature should not overlap wall
    dist = engine.state.creature.position.distance_to(wall.position)
    min_ok = creature.radius + wall.radius - 0.1
    assert dist >= min_ok, f"Creature overlaps wall: dist={dist:.3f}, min={min_ok:.3f}"


@pytest.mark.asyncio
async def test_event_bus_delivers(tmp_path):
    bus = EventBus()
    received = []
    async def handler(ev: GameEvent):
        received.append(ev)
    bus.subscribe(EventType.OBJECT_APPROACHED, handler)
    ev = GameEvent(source="test", type=EventType.OBJECT_APPROACHED)
    await bus.publish(ev)
    assert len(received) == 1
    assert received[0].id == ev.id
