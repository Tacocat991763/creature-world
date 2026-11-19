"""
MCP server exposing world-reading and creation tools.

The local LLM may read world state.
Only the OpenAI world editor may apply extensions (via the creation queue).
"""
from __future__ import annotations
import json
from typing import TYPE_CHECKING, Any

try:
    from mcp.server.fastmcp import FastMCP
    _mcp_available = True
except ImportError:
    _mcp_available = False

if TYPE_CHECKING:
    from ..world.engine import WorldEngine
    from ..world_editor.creation_queue import CreationQueue


def build_mcp_server(engine: "WorldEngine", queue: "CreationQueue") -> Any:
    if not _mcp_available:
        print("[MCP] mcp package not installed — MCP server disabled.")
        return None

    mcp = FastMCP("creature-world")

    @mcp.tool()
    async def get_world_state() -> dict:
        """Return a snapshot of the current world state."""
        s = engine.state
        return {
            "sim_time": s.sim_time,
            "day": s.environment.day_number,
            "time_of_day": s.environment.period_name,
            "creature": {
                "name": s.creature.name,
                "position": s.creature.position.model_dump(),
                "energy": s.creature.energy,
            },
            "entity_count": len(s.entities),
        }

    @mcp.tool()
    async def list_objects() -> list[dict]:
        """List all world objects."""
        return [
            {
                "id": e.id,
                "type": e.type,
                "name": e.name,
                "position": e.position.model_dump(),
                "alive": e.alive,
            }
            for e in engine.state.entities.values()
        ]

    @mcp.tool()
    async def inspect_object(object_id: str) -> dict:
        """Inspect a specific world object."""
        e = engine.state.entities.get(object_id)
        if not e:
            return {"error": "not found"}
        return {
            "id": e.id, "type": e.type, "name": e.name,
            "position": e.position.model_dump(),
            "components": e.components.model_dump(),
            "properties": e.properties,
        }

    @mcp.tool()
    async def get_event_history(limit: int = 20) -> list[dict]:
        """Return recent world events."""
        return [ev.model_dump() for ev in engine.bus.recent(limit)]

    @mcp.tool()
    async def get_creation_requests() -> list[dict]:
        """Return pending world creation requests."""
        return await queue.pending()

    @mcp.tool()
    async def get_creature_state() -> dict:
        """Return full creature state including stimulation."""
        stim = {}
        if hasattr(engine, '_stimulation') and engine._stimulation:
            stim = engine._stimulation.get_outputs()
        c = engine.state.creature
        return {
            "name": c.name,
            "position": c.position.model_dump(),
            "orientation": c.orientation,
            "energy": c.energy,
            "velocity": c.velocity.model_dump(),
            "stimulation": stim,
        }

    return mcp
