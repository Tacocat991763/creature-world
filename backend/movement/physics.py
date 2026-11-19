"""Lightweight 2D physics helpers. No LLM dependency."""
from __future__ import annotations
import math
from ..world.entities import Vec2


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def angle_to_vec(degrees: float) -> Vec2:
    r = math.radians(degrees)
    return Vec2(x=math.cos(r), y=math.sin(r))


def vec_to_angle(v: Vec2) -> float:
    return math.degrees(math.atan2(v.y, v.x))


def lerp_angle(a: float, b: float, t: float) -> float:
    """Shortest-path angular lerp (degrees)."""
    diff = ((b - a) + 180) % 360 - 180
    return a + diff * t


def steer_toward(current_angle: float, target: Vec2, pos: Vec2, turn_rate: float, dt: float) -> float:
    """Return new orientation (degrees) steered toward target."""
    dx = target.x - pos.x
    dy = target.y - pos.y
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        return current_angle
    desired = math.degrees(math.atan2(dy, dx))
    return lerp_angle(current_angle, desired, min(1.0, turn_rate * dt))


def wrap_angle(a: float) -> float:
    return a % 360
