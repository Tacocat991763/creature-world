"""
Personality trait definitions.

A trait is a persistent bias that fires stimulus packets into the CTRNN
whenever Luma is near a matching object, or as a constant background mood.

Traits are seeded at startup and stored in SQLite so they can grow over time
(the LLM can propose new ones via creation_request; GPT-4o world editor validates).
"""
from __future__ import annotations
import time
import uuid
from dataclasses import dataclass, field


@dataclass
class Trait:
    id: str
    name: str
    description: str
    # Which CTRNN channel this trait biases
    channel: str
    # Constant low-level stimulus every tick (keeps the trait "in background")
    base_bias: float
    # Additional stimulus when near a matching world object (< proximity_radius)
    proximity_bias: float
    proximity_radius: float
    # Keywords found in entity name/type that trigger proximity bias
    trigger_keywords: list[str]
    # For display / LLM awareness
    created_at: float = field(default_factory=time.time)


# ── Seed traits ───────────────────────────────────────────────────────────────
# These are always loaded on first run. The personality engine merges them
# with anything already stored in the DB.

SEED_TRAITS: list[Trait] = [
    Trait(
        id="trait_trains",
        name="affinity_for_trains",
        description="Luma is inexplicably drawn to trains, tracks, and mechanical motion. "
                    "Seeing or imagining them produces deep satisfaction.",
        channel="curiosity",
        base_bias=0.06,          # constant gentle curiosity pull
        proximity_bias=0.45,     # strong spark when near train-like objects
        proximity_radius=25.0,
        trigger_keywords=["train", "track", "rail", "locomotive", "station",
                          "mechanical", "wheel", "vehicle", "engine"],
    ),
    Trait(
        id="trait_movement_joy",
        name="love_of_movement",
        description="Luma finds deep pleasure in the act of moving — running, wandering, "
                    "exploring. Stillness feels uncomfortable.",
        channel="arousal",
        base_bias=0.05,
        proximity_bias=0.0,      # not proximity-triggered
        proximity_radius=0.0,
        trigger_keywords=[],
    ),
    Trait(
        id="trait_social",
        name="social_warmth",
        description="Luma is happier near other beings and feels the absence of company acutely.",
        channel="attachment",
        base_bias=0.04,
        proximity_bias=0.30,
        proximity_radius=15.0,
        trigger_keywords=["person", "human", "figure", "friend", "companion"],
    ),
    Trait(
        id="trait_wonder",
        name="wonder_at_machines",
        description="Complex or unfamiliar mechanisms trigger a sense of awe and the urge to understand.",
        channel="curiosity",
        base_bias=0.03,
        proximity_bias=0.25,
        proximity_radius=18.0,
        trigger_keywords=["machine", "gear", "pump", "motor", "device", "contraption"],
    ),
]
