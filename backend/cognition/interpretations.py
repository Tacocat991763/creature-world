"""Pydantic models for structured LLM output."""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class MemoryCandidate(BaseModel):
    content: str
    importance: float = Field(ge=0.0, le=1.0)


class CreationRequest(BaseModel):
    intent: str                 # e.g. "create_object", "add_mechanic"
    description: str
    reason: str


class DesirePacket(BaseModel):
    """
    A nudge the LLM can inject into the CTRNN.
    delta is clamped to [-0.5, 0.5] — LLM can influence but never override physics.
    """
    channel: str                # one of: reward, distress, curiosity, attachment,
                                #         arousal, fatigue, threat, familiarity
    delta: float = Field(ge=-0.5, le=0.5)
    reason: str = ""


class NarrativeOutput(BaseModel):
    thought: str = ""
    speech: str = ""
    action_interpretation: str = ""
    experience_interpretation: str = ""
    memory_candidate: Optional[MemoryCandidate] = None
    creation_request: Optional[CreationRequest] = None

    # --- new fields ---
    desires: list[DesirePacket] = Field(default_factory=list)
    new_goal: Optional[str] = None      # name of a goal Luma wants to pursue
    economy_earn: int = Field(default=0, ge=0, le=10)   # credits earned this tick


FALLBACK_OUTPUT = NarrativeOutput(
    thought="I observe my surroundings.",
    speech="",
    action_interpretation="I continue moving.",
    experience_interpretation="Everything feels ordinary.",
)
