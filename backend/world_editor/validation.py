"""Validation and safety checks for world extensions before they are applied."""
from __future__ import annotations
from .extension_schema import WorldExtension, WorldObjectExtension


MAX_OBJECTS_PER_SESSION = 50
RESERVED_IDS = {"creature_1"}
ALLOWED_EXTENSION_TYPES = {"object", "mechanic"}


class ValidationError(Exception):
    pass


def validate_extension(ext: WorldExtension, existing_entity_count: int) -> None:
    if ext.extension_type not in ALLOWED_EXTENSION_TYPES:
        raise ValidationError(f"Unknown extension type: {ext.extension_type!r}")

    if ext.extension_type == "object":
        if ext.object_def is None:
            raise ValidationError("object extension missing object_def")
        _validate_object(ext.object_def, existing_entity_count)

    if ext.extension_type == "mechanic":
        if ext.mechanic_def is None:
            raise ValidationError("mechanic extension missing mechanic_def")
        if ext.mechanic_def.requires_plugin:
            raise ValidationError(
                "Plugin extensions require separate authorization and cannot be auto-applied."
            )


def _validate_object(obj: WorldObjectExtension, existing_count: int) -> None:
    if existing_count >= MAX_OBJECTS_PER_SESSION:
        raise ValidationError(f"World object limit reached ({MAX_OBJECTS_PER_SESSION}).")
    if not obj.name or len(obj.name) > 80:
        raise ValidationError("Object name must be 1–80 characters.")
    if not obj.type or len(obj.type) > 40:
        raise ValidationError("Object type must be 1–40 characters.")
    # Stimulus effects must be in valid channels and reasonable range
    from ..stimulation.dynamics import CHANNEL_NAMES
    for eff_name, eff_val in [(i.name, v) for i in obj.interactions for v in [i.stimulus_effects]]:
        for k, val in eff_val.items():
            if k not in CHANNEL_NAMES:
                raise ValidationError(f"Unknown stimulus channel: {k!r}")
            if abs(val) > 1.0:
                raise ValidationError(f"Stimulus effect {k}={val} out of range [-1, 1].")
