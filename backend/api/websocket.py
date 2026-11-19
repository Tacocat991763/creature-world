"""WebSocket handler — broadcasts world state to all connected browsers."""
from __future__ import annotations
import asyncio
import json
from fastapi import WebSocket, WebSocketDisconnect
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..world.engine import WorldEngine
    from ..stimulation.network import StimulationNetwork


class ConnectionManager:
    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.remove(ws)

    async def broadcast(self, data: dict) -> None:
        dead = []
        msg = json.dumps(data)
        for ws in self._connections:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.remove(ws)


manager = ConnectionManager()


async def world_state_broadcaster(engine: "WorldEngine", stimulation: "StimulationNetwork | None") -> None:
    """Runs forever, pushing world state to all WebSocket clients at ~10Hz."""
    while True:
        await asyncio.sleep(0.1)
        try:
            s = engine.state
            c = s.creature
            stim = stimulation.get_outputs() if stimulation else {}
            payload = {
                "type": "world_state",
                "sim_time": round(s.sim_time, 2),
                "version": s.version,
                "creature": {
                    "id": c.id,
                    "name": c.name,
                    "x": round(c.position.x, 2),
                    "y": round(c.position.y, 2),
                    "orientation": round(c.orientation, 1),
                    "energy": round(c.energy, 3),
                    "vx": round(c.velocity.x, 2),
                    "vy": round(c.velocity.y, 2),
                },
                "entities": [
                    {
                        "id": e.id, "type": e.type, "name": e.name,
                        "x": round(e.position.x, 2), "y": round(e.position.y, 2),
                        "radius": e.radius,
                        "color": e.properties.get("visual_color", "#666"),
                        "shape": e.properties.get("visual_shape", "circle"),
                        "interactable": e.components.interactable,
                    }
                    for e in s.entities.values() if e.alive
                ],
                "environment": {
                    "time_of_day": s.environment.period_name,
                    "hour": round(s.environment.time_of_day, 1),
                    "ambient_light": round(s.environment.ambient_light, 2),
                    "weather": s.environment.weather,
                    "day": s.environment.day_number,
                },
                "stimulation": {k: round(v, 3) for k, v in stim.items()},
            }
            await manager.broadcast(payload)
        except Exception as exc:
            pass   # don't crash the broadcaster on stale state


async def handle_ws(ws: WebSocket, engine: "WorldEngine") -> None:
    await manager.connect(ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                action = msg.get("action")
                if action == "user_interact":
                    await engine.apply_user_interaction(
                        msg.get("type", "unknown"),
                        msg.get("payload", {}),
                    )
                elif action == "place_object":
                    from ..world.entities import WorldObject, ComponentSet, Vec2
                    obj = WorldObject(
                        type=msg.get("obj_type", "rock"),
                        name=msg.get("name", ""),
                        position=Vec2(x=msg.get("x", 50), y=msg.get("y", 50)),
                        radius=msg.get("radius", 1.5),
                        components=ComponentSet(collidable=True, interactable=True),
                        properties={"from_user": True},
                    )
                    await engine.add_entity(obj)
            except Exception as e:
                await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
    except WebSocketDisconnect:
        manager.disconnect(ws)
