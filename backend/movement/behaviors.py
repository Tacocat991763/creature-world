"""
Behavioral drives that the movement model weighs against each other.
Each returns a (direction_vec, speed_scalar) or None.
None means "this drive has no opinion right now".
"""
from __future__ import annotations
import math
import random
from ..world.entities import Vec2, Entity
from ..config import cfg


def wander(pos: Vec2, orientation: float, momentum: float = 0.7) -> tuple[Vec2, float]:
    """Random walk with orientation momentum."""
    angle_noise = random.gauss(0, 25)   # degrees
    new_angle = orientation + angle_noise
    # Steer away from edges
    margin = 8.0
    if pos.x < margin:
        new_angle = random.uniform(-60, 60)
    elif pos.x > cfg.world_width - margin:
        new_angle = random.uniform(120, 240)
    if pos.y < margin:
        new_angle = random.uniform(30, 150)
    elif pos.y > cfg.world_height - margin:
        new_angle = random.uniform(210, 330)

    r = math.radians(new_angle)
    return Vec2(x=math.cos(r), y=math.sin(r)), 0.5


def seek(pos: Vec2, target: Vec2, arrival_radius: float = 3.0) -> tuple[Vec2, float] | None:
    """Move toward target, slow near arrival."""
    d = pos.distance_to(target)
    if d < 0.5:
        return None
    dx = target.x - pos.x
    dy = target.y - pos.y
    dist = math.sqrt(dx * dx + dy * dy)
    speed = min(1.0, d / arrival_radius)
    return Vec2(x=dx / dist, y=dy / dist), speed


def flee(pos: Vec2, threat: Vec2, fear_radius: float = 15.0) -> tuple[Vec2, float] | None:
    """Run away from threat."""
    d = pos.distance_to(threat)
    if d > fear_radius:
        return None
    dx = pos.x - threat.x
    dy = pos.y - threat.y
    dist = max(1e-6, math.sqrt(dx * dx + dy * dy))
    urgency = 1.0 - d / fear_radius
    return Vec2(x=dx / dist, y=dy / dist), 0.5 + urgency * 0.5


def find_novel_target(pos: Vec2, entities: list[Entity], visited_ids: set[str]) -> Entity | None:
    """Return nearest unvisited interactable object."""
    candidates = [
        e for e in entities
        if e.alive and e.components.interactable and e.id not in visited_ids
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda e: pos.distance_to(e.position))


def find_familiar_target(pos: Vec2, entities: list[Entity], visited_ids: set[str]) -> Entity | None:
    """Return nearest previously-visited object (comfort seeking)."""
    candidates = [
        e for e in entities
        if e.alive and e.id in visited_ids
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda e: pos.distance_to(e.position))


def rest_in_place() -> tuple[Vec2, float]:
    return Vec2(), 0.0
