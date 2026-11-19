"""HTTP REST routes."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..world.engine import WorldEngine
    from ..stimulation.network import StimulationNetwork
    from ..world_editor.creation_queue import CreationQueue

router = APIRouter(prefix="/api")


class _Deps:
    engine: "WorldEngine" = None
    stimulation: "StimulationNetwork" = None
    queue: "CreationQueue" = None
    llm: Any = None          # LocalLLMClient | None


deps = _Deps()


@router.get("/llm/status")
async def llm_status() -> dict:
    enabled = getattr(deps.llm, "enabled", False) if deps.llm else False
    has_key = bool(__import__("os").getenv("OPENAI_API_KEY", ""))
    return {"enabled": enabled, "has_key": has_key}


@router.post("/llm/toggle")
async def llm_toggle() -> dict:
    if deps.llm is None:
        raise HTTPException(status_code=503, detail="LLM not initialised")
    deps.llm.enabled = not deps.llm.enabled
    return {"enabled": deps.llm.enabled}


@router.get("/world")
async def get_world() -> dict:
    return deps.engine.state.model_dump()


@router.get("/stimulation")
async def get_stimulation() -> dict:
    if deps.stimulation is None:
        return {}
    return deps.stimulation.get_outputs()


@router.get("/events")
async def get_events(limit: int = 50) -> list:
    return [e.model_dump() for e in deps.engine.bus.recent(limit)]


@router.get("/creation_requests")
async def get_creation_requests() -> list:
    return await deps.queue.pending()


class InteractionRequest(BaseModel):
    action: str
    payload: dict[str, Any] = {}


@router.post("/interact")
async def interact(req: InteractionRequest) -> dict:
    await deps.engine.apply_user_interaction(req.action, req.payload)
    return {"ok": True}


class PlaceObjectRequest(BaseModel):
    obj_type: str = "rock"
    name: str = ""
    x: float = 50.0
    y: float = 50.0
    radius: float = 1.5


@router.post("/place_object")
async def place_object(req: PlaceObjectRequest) -> dict:
    from ..world.entities import WorldObject, ComponentSet, Vec2
    obj = WorldObject(
        type=req.obj_type,
        name=req.name or req.obj_type,
        position=Vec2(x=req.x, y=req.y),
        radius=req.radius,
        components=ComponentSet(collidable=True, interactable=True),
        properties={"from_user": True},
    )
    await deps.engine.add_entity(obj)
    return {"id": obj.id, "ok": True}
