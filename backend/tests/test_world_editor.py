"""Tests for world editor — validates only OpenAI can create world extensions."""
import pytest
from backend.world_editor.extension_schema import (
    WorldExtension, WorldObjectExtension, ComponentSpec, InteractionDef
)
from backend.world_editor.validation import validate_extension, ValidationError


def _make_valid_ext() -> WorldExtension:
    return WorldExtension(
        extension_type="object",
        object_def=WorldObjectExtension(
            name="test bridge",
            type="bridge",
            description="A simple bridge",
            radius=1.5,
            components=ComponentSpec(collidable=True, interactable=True),
            properties={"traversable": True},
            interactions=[
                InteractionDef(
                    name="walk_across",
                    description="Walk across the bridge",
                    stimulus_effects={"reward": 0.2, "curiosity": 0.1},
                )
            ],
            visual_color="#8B4513",
        ),
    )


def test_valid_extension_passes():
    ext = _make_valid_ext()
    validate_extension(ext, existing_entity_count=5)  # should not raise


def test_too_many_entities_rejected():
    ext = _make_valid_ext()
    with pytest.raises(ValidationError, match="limit"):
        validate_extension(ext, existing_entity_count=50)


def test_missing_object_def_rejected():
    ext = WorldExtension(extension_type="object", object_def=None)
    with pytest.raises(ValidationError):
        validate_extension(ext, existing_entity_count=0)


def test_unknown_extension_type_rejected():
    ext = WorldExtension(extension_type="malicious_code", object_def=None)
    with pytest.raises(ValidationError, match="Unknown extension type"):
        validate_extension(ext, existing_entity_count=0)


def test_bad_stimulus_channel_rejected():
    ext = _make_valid_ext()
    # inject bad channel into an interaction
    ext.object_def.interactions[0].stimulus_effects = {"happiness": 0.5}
    with pytest.raises(ValidationError, match="Unknown stimulus channel"):
        validate_extension(ext, existing_entity_count=5)


def test_out_of_range_stimulus_rejected():
    ext = _make_valid_ext()
    ext.object_def.interactions[0].stimulus_effects = {"reward": 2.0}
    with pytest.raises(ValidationError, match="out of range"):
        validate_extension(ext, existing_entity_count=5)


def test_plugin_extension_rejected():
    from backend.world_editor.extension_schema import WorldMechanicExtension
    ext = WorldExtension(
        extension_type="mechanic",
        mechanic_def=WorldMechanicExtension(
            name="teleport",
            description="Instant teleport",
            trigger_event="user_interacted",
            effect_description="Teleports creature",
            requires_plugin=True,
        )
    )
    with pytest.raises(ValidationError, match="Plugin"):
        validate_extension(ext, existing_entity_count=0)
