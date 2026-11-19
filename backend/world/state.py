from __future__ import annotations
import time
from typing import Any
from pydantic import BaseModel, Field
from .entities import Creature, Entity, EnvironmentState, Vec2, EntityType, WorldObject, ComponentSet


class WorldState(BaseModel):
    """Complete, serialisable snapshot of the world."""
    version: int = 0
    sim_time: float = 0.0           # monotonic simulation seconds
    wall_time: float = Field(default_factory=time.time)
    creature: Creature
    entities: dict[str, Entity] = Field(default_factory=dict)
    environment: EnvironmentState = Field(default_factory=EnvironmentState)

    def all_entities(self) -> list[Entity]:
        return list(self.entities.values())

    def objects_near(self, pos: Vec2, radius: float) -> list[Entity]:
        return [
            e for e in self.entities.values()
            if e.alive and pos.distance_to(e.position) <= radius
        ]

    def add_entity(self, entity: Entity) -> None:
        self.entities[entity.id] = entity

    def remove_entity(self, entity_id: str) -> None:
        if entity_id in self.entities:
            self.entities[entity_id].alive = False


def build_default_world() -> WorldState:
    """Create the initial populated world."""
    creature = Creature(
        id="creature_1",
        name="Luma",
        position=Vec2(x=50.0, y=50.0),
        orientation=0.0,
        energy=1.0,
    )

    objects: list[Entity] = [
        WorldObject(
            id="tree_1", type=EntityType.TREE, name="oak tree",
            position=Vec2(x=30.0, y=35.0), radius=2.5,
            components=ComponentSet(collidable=True, interactable=True, climbable=True),
            properties={"height": 4.2, "climbable": True},
        ),
        WorldObject(
            id="tree_2", type=EntityType.TREE, name="pine tree",
            position=Vec2(x=70.0, y=25.0), radius=2.0,
            components=ComponentSet(collidable=True, interactable=True, climbable=True),
            properties={"height": 5.0, "climbable": True},
        ),
        WorldObject(
            id="bench_1", type=EntityType.BENCH, name="wooden bench",
            position=Vec2(x=55.0, y=60.0), radius=1.5,
            components=ComponentSet(collidable=True, interactable=True),
            properties={"capacity": 2, "comfort": 0.8},
        ),
        WorldObject(
            id="flower_1", type=EntityType.FLOWER, name="wildflowers",
            position=Vec2(x=40.0, y=65.0), radius=0.8,
            components=ComponentSet(interactable=True),
            properties={"color": "purple", "scented": True},
        ),
        WorldObject(
            id="flower_2", type=EntityType.FLOWER, name="yellow flowers",
            position=Vec2(x=62.0, y=42.0), radius=0.6,
            components=ComponentSet(interactable=True),
            properties={"color": "yellow", "scented": False},
        ),
        WorldObject(
            id="rock_1", type=EntityType.ROCK, name="large rock",
            position=Vec2(x=22.0, y=55.0), radius=2.0,
            components=ComponentSet(collidable=True, climbable=True),
            properties={"size": "large"},
        ),
        WorldObject(
            id="stream_1", type=EntityType.STREAM, name="stream",
            position=Vec2(x=80.0, y=50.0), radius=3.0,
            components=ComponentSet(collidable=True),
            properties={"crossable": False, "sound": "babbling"},
        ),
    ]

    state = WorldState(creature=creature)
    for obj in objects:
        state.add_entity(obj)

    return state
