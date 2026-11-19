from __future__ import annotations
import uuid
from typing import Any
from pydantic import BaseModel, Field


def new_id() -> str:
    return str(uuid.uuid4())[:8]


class Vec2(BaseModel):
    x: float = 0.0
    y: float = 0.0

    def __add__(self, other: Vec2) -> Vec2:
        return Vec2(x=self.x + other.x, y=self.y + other.y)

    def __mul__(self, scalar: float) -> Vec2:
        return Vec2(x=self.x * scalar, y=self.y * scalar)

    def length(self) -> float:
        return (self.x ** 2 + self.y ** 2) ** 0.5

    def normalized(self) -> Vec2:
        l = self.length()
        if l < 1e-9:
            return Vec2()
        return Vec2(x=self.x / l, y=self.y / l)

    def distance_to(self, other: Vec2) -> float:
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5


class EntityType(str):
    CREATURE = "creature"
    TREE = "tree"
    BENCH = "bench"
    FLOWER = "flower"
    ROCK = "rock"
    STREAM = "stream"
    BRIDGE = "bridge"
    FOOD = "food"
    PERSON = "person"
    CUSTOM = "custom"


class ComponentSet(BaseModel):
    """Flags indicating which components this entity carries."""
    transform: bool = True
    renderable: bool = True
    collidable: bool = False
    interactable: bool = False
    movable: bool = False
    consumable: bool = False
    climbable: bool = False
    breakable: bool = False
    repairable: bool = False
    social: bool = False


class Entity(BaseModel):
    id: str = Field(default_factory=new_id)
    type: str
    name: str = ""
    position: Vec2 = Field(default_factory=Vec2)
    orientation: float = 0.0          # degrees, 0 = right
    velocity: Vec2 = Field(default_factory=Vec2)
    radius: float = 1.0               # collision radius
    components: ComponentSet = Field(default_factory=ComponentSet)
    properties: dict[str, Any] = Field(default_factory=dict)
    alive: bool = True

    @property
    def display_name(self) -> str:
        return self.name or self.type


class Creature(Entity):
    type: str = EntityType.CREATURE
    components: ComponentSet = Field(
        default_factory=lambda: ComponentSet(
            movable=True, interactable=True, social=True
        )
    )
    energy: float = 1.0      # [0, 1]
    speed: float = 4.0       # units/sec at full energy


class WorldObject(Entity):
    components: ComponentSet = Field(
        default_factory=lambda: ComponentSet(collidable=True, interactable=True)
    )


class EnvironmentState(BaseModel):
    time_of_day: float = 6.0          # 0-24 game hours
    weather: str = "sunny"
    day_number: int = 1
    ambient_light: float = 1.0        # [0, 1]

    @property
    def period_name(self) -> str:
        h = self.time_of_day
        if 5 <= h < 8:
            return "dawn"
        if 8 <= h < 12:
            return "morning"
        if 12 <= h < 15:
            return "midday"
        if 15 <= h < 18:
            return "afternoon"
        if 18 <= h < 21:
            return "dusk"
        return "night"
