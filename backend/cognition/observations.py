"""Build the structured observation fed to the local LLM."""
from __future__ import annotations
import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..world.engine import WorldEngine
    from ..stimulation.network import StimulationNetwork
    from ..world.events import GameEvent


def build_observation(
    engine: "WorldEngine",
    stimulation: "StimulationNetwork",
    recent_events: list["GameEvent"],
    relevant_memories: list[str],
) -> dict:
    state = engine.state
    creature = state.creature
    env = state.environment

    nearby = state.objects_near(creature.position, radius=12.0)
    nearby_names = [
        f"{e.name or e.type}" + (" (interactable)" if e.components.interactable else "")
        for e in nearby
    ]

    recent_desc = []
    for ev in recent_events[-8:]:
        desc = _event_description(ev, engine)
        if desc:
            recent_desc.append(desc)

    stim = stimulation.get_outputs() if stimulation else {}

    return {
        "creature": {
            "name": creature.name,
            "position": {"x": round(creature.position.x, 1), "y": round(creature.position.y, 1)},
            "energy": round(creature.energy, 2),
        },
        "environment": {
            "time_of_day": env.period_name,
            "hour": round(env.time_of_day, 1),
            "weather": env.weather,
            "day": env.day_number,
            "nearby_objects": nearby_names,
        },
        "recent_events": recent_desc,
        "internal_experience": {k: round(v, 3) for k, v in stim.items()},
        "relevant_memories": relevant_memories,
    }


def _event_description(ev, engine) -> str:
    from ..world.events import EventType
    type_map = {
        EventType.MOVEMENT_COMPLETED: lambda e: f"You moved to {_pos_str(e.payload.get('position'))}.",
        EventType.OBJECT_APPROACHED:  lambda e: f"You approached the {_entity_name(e.target_id, engine)}.",
        EventType.OBSTACLE_ENCOUNTERED: lambda e: f"You were blocked by the {_entity_name(e.target_id, engine)}.",
        EventType.PERSON_GAVE_GIFT:   lambda e: f"Someone gave you a gift.",
        EventType.PERSON_INTERACTED:  lambda e: f"You interacted with a person.",
        EventType.DAY_STARTED:        lambda e: f"A new day began (day {e.payload.get('day', '?')}).",
        EventType.NIGHT_STARTED:      lambda e: f"Night fell.",
        EventType.USER_INTERACTED:    lambda e: f"The world changed: {e.payload.get('action', 'something happened')}.",
    }
    fn = type_map.get(ev.type)
    return fn(ev) if fn else ""


def _pos_str(pos: dict | None) -> str:
    if not pos:
        return "somewhere"
    return f"({pos.get('x', '?'):.0f}, {pos.get('y', '?'):.0f})"


def _entity_name(entity_id: str, engine) -> str:
    entity = engine.state.entities.get(entity_id)
    if entity:
        return entity.name or entity.type
    return "something"
