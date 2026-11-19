"""Stimulus definitions — what environmental events inject into which channels."""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class StimulusPacket:
    """One environmental input to the stimulation network."""
    reward: float = 0.0
    distress: float = 0.0
    curiosity: float = 0.0
    attachment: float = 0.0
    arousal: float = 0.0
    fatigue: float = 0.0
    threat: float = 0.0
    familiarity: float = 0.0

    def as_array(self) -> list[float]:
        return [
            self.reward, self.distress, self.curiosity, self.attachment,
            self.arousal, self.fatigue, self.threat, self.familiarity,
        ]

    @classmethod
    def from_event_type(cls, event_type: str, payload: dict) -> "StimulusPacket":
        from ..world.events import EventType
        mapping: dict[str, "StimulusPacket"] = {
            EventType.OBJECT_APPROACHED:    cls(curiosity=0.4, arousal=0.2),
            EventType.OBJECT_INTERACTED:    cls(reward=0.3, curiosity=0.2, familiarity=0.3),
            EventType.OBSTACLE_ENCOUNTERED: cls(distress=0.3, arousal=0.4, threat=0.2),
            EventType.PERSON_GAVE_GIFT:     cls(reward=0.6, attachment=0.5, arousal=0.3),
            EventType.PERSON_INTERACTED:    cls(attachment=0.3, arousal=0.2, reward=0.1),
            EventType.DAY_STARTED:          cls(arousal=0.3, curiosity=0.2),
            EventType.NIGHT_STARTED:        cls(fatigue=0.2, familiarity=0.1),
            EventType.CREATURE_RESTED:      cls(reward=0.2, fatigue=-0.4),
            EventType.USER_INTERACTED:      cls(arousal=0.3, curiosity=0.3, attachment=0.1),
        }
        return mapping.get(event_type, cls())
