"""
OpenAI-powered world editor.

ONLY this module may call the OpenAI API for world creation.
Consumes creation requests from CreationQueue, generates WorldExtension proposals,
validates them, then applies them to the world engine.
"""
from __future__ import annotations
import asyncio
import json
import time
from typing import TYPE_CHECKING

from openai import AsyncOpenAI
from pydantic import ValidationError

from ..config import cfg
from ..world.events import EventType, GameEvent, bus as default_bus
from ..world.persistence import persist_event
from .creation_queue import CreationQueue
from .extension_schema import WorldExtension, WorldObjectExtension, ComponentSpec
from .registry import ExtensionRegistry
from .validation import validate_extension, ValidationError as ExtValidationError

if TYPE_CHECKING:
    from ..world.engine import WorldEngine


WORLD_EDITOR_SYSTEM = """\
You are the world editor for a 2D creature simulation. Your job is to generate new world \
objects or mechanics based on creation requests.

Always respond with valid JSON matching the WorldExtension schema:
{
  "extension_type": "object",   // or "mechanic"
  "object_def": {
    "name": "...",
    "type": "...",
    "description": "...",
    "radius": 1.5,
    "components": {"collidable": true, "interactable": true, ...},
    "properties": {},
    "interactions": [{"name": "...", "description": "...", "stimulus_effects": {"reward": 0.3}}],
    "visual_color": "#8B4513",
    "visual_shape": "circle"
  },
  "mechanic_def": null
}

Constraints:
- radius must be between 0.1 and 10.0
- stimulus_effects keys must be one of: reward, distress, curiosity, attachment, arousal, fatigue, threat, familiarity
- stimulus_effects values must be in [-1.0, 1.0]
- Do not set requires_plugin to true
- Keep descriptions under 200 characters
"""


class OpenAIWorldEditor:
    def __init__(self, engine: "WorldEngine", db_path: str | None = None):
        self.engine = engine
        self.db_path = db_path or cfg.db_path
        self._client: AsyncOpenAI | None = None   # created lazily on first use
        self._registry = ExtensionRegistry(self.db_path)
        self._queue = CreationQueue.instance()
        self._running = False
        self._last_call_time: float = 0.0
        self._min_interval: float = 10.0   # don't spam the API

    async def start(self) -> None:
        if not cfg.openai_api_key:
            print("[WorldEditor] No OPENAI_API_KEY set — world editor disabled.")
            return
        self._running = True
        asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False

    async def _loop(self) -> None:
        while self._running:
            try:
                req = await asyncio.wait_for(self._queue.get(), timeout=5.0)
                await self._process_request(req)
            except asyncio.TimeoutError:
                pass
            except Exception as exc:
                print(f"[WorldEditor] error: {exc}")

    async def _process_request(self, req) -> None:
        # Rate limiting
        now = time.time()
        gap = now - self._last_call_time
        if gap < self._min_interval:
            await asyncio.sleep(self._min_interval - gap)
        self._last_call_time = time.time()

        # Build context
        world_summary = self._build_world_summary()
        user_msg = (
            f"Creation request:\n"
            f"Intent: {req.intent}\n"
            f"Description: {req.description}\n"
            f"Reason: {req.reason}\n\n"
            f"Current world objects:\n{world_summary}"
        )

        # Call OpenAI — create client lazily
        if self._client is None:
            self._client = AsyncOpenAI(api_key=cfg.openai_api_key)
        try:
            resp = await self._client.chat.completions.create(
                model=cfg.openai_world_editor_model,
                messages=[
                    {"role": "system", "content": WORLD_EDITOR_SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
                response_format={"type": "json_object"},
                max_tokens=800,
            )
            raw = resp.choices[0].message.content or "{}"
            ext = WorldExtension.model_validate_json(raw)
        except (ValidationError, Exception) as e:
            print(f"[WorldEditor] generation failed: {e}")
            return

        # Validate
        try:
            validate_extension(ext, len(self.engine.state.entities))
        except ExtValidationError as e:
            print(f"[WorldEditor] validation failed: {e}")
            return

        # Apply
        await self._apply_extension(ext, req.description)

    async def _apply_extension(self, ext: WorldExtension, original_description: str) -> None:
        if ext.extension_type == "object" and ext.object_def:
            obj_def = ext.object_def
            from ..world.entities import WorldObject, ComponentSet, Vec2
            # Place near creature with offset
            import random
            cx = self.engine.state.creature.position.x
            cy = self.engine.state.creature.position.y
            angle = random.uniform(0, 360)
            import math
            dist = random.uniform(10, 20)
            px = cx + math.cos(math.radians(angle)) * dist
            py = cy + math.sin(math.radians(angle)) * dist
            px = max(5, min(cfg.world_width - 5, px))
            py = max(5, min(cfg.world_height - 5, py))

            comp = ComponentSet(**obj_def.components.model_dump())
            new_entity = WorldObject(
                type=obj_def.type,
                name=obj_def.name,
                position=Vec2(x=px, y=py),
                radius=obj_def.radius,
                components=comp,
                properties={
                    **obj_def.properties,
                    "description": obj_def.description,
                    "visual_color": obj_def.visual_color,
                    "visual_shape": obj_def.visual_shape,
                    "interactions": [i.model_dump() for i in obj_def.interactions],
                    "from_world_editor": True,
                },
            )

        # Save to registry
        ext_id = await self._registry.save(ext)
        await self.engine.add_entity(new_entity)

        # Notify
        ev = GameEvent(
            source="world_editor",
            type=EventType.WORLD_EXTENDED,
            entity_id=new_entity.id,
            payload={
                "extension_id": ext_id,
                "name": obj_def.name,
                "description": obj_def.description,
            },
        )
        await default_bus.publish(ev)
        await persist_event(ev, self.db_path)
        await self._queue.mark_done(original_description, ext_id)
        print(f"[WorldEditor] Added '{obj_def.name}' to world (extension {ext_id}).")

    def _build_world_summary(self) -> str:
        lines = []
        for eid, entity in self.engine.state.entities.items():
            if entity.alive:
                lines.append(f"- {entity.type} '{entity.name}' at ({entity.position.x:.0f},{entity.position.y:.0f})")
        return "\n".join(lines) if lines else "(empty world)"
