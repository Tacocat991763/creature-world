"""
Schemas for world extensions — new objects, mechanics, and interactions.
All OpenAI-generated content must validate against these before being applied.
"""
from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field


class ComponentSpec(BaseModel):
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


class InteractionDef(BaseModel):
    name: str
    description: str = ""
    stimulus_effects: dict[str, float] = Field(default_factory=dict)
    # e.g. {"reward": 0.3, "curiosity": -0.1}


class WorldObjectExtension(BaseModel):
    name: str
    type: str
    description: str = ""
    radius: float = Field(default=1.0, gt=0, le=10)
    components: ComponentSpec = Field(default_factory=ComponentSpec)
    properties: dict[str, Any] = Field(default_factory=dict)
    interactions: list[InteractionDef] = Field(default_factory=list)
    visual_color: str = "#8B4513"   # CSS hex for rendering
    visual_shape: str = "circle"    # "circle" | "rect" | "triangle"


class WorldMechanicExtension(BaseModel):
    name: str
    description: str
    trigger_event: str              # event type that activates this mechanic
    effect_description: str
    stimulus_effects: dict[str, float] = Field(default_factory=dict)
    requires_plugin: bool = False   # if True, needs separate code review


class WorldExtension(BaseModel):
    id: str = ""
    version: int = 1
    extension_type: str             # "object" | "mechanic"
    object_def: WorldObjectExtension | None = None
    mechanic_def: WorldMechanicExtension | None = None
