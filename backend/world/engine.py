"""
World engine — authoritative physical simulation.

Runs at SIM_HZ.  It does NOT call any language model.
"""
from __future__ import annotations
import asyncio
import time
from typing import TYPE_CHECKING

from ..config import cfg
from .entities import EnvironmentState, Vec2
from .events import EventBus, GameEvent, EventType, bus as default_bus
from .persistence import init_db, save_world, persist_event
from .state import WorldState, build_default_world

if TYPE_CHECKING:
    from ..movement.model import MovementModel
    from ..stimulation.network import StimulationNetwork


class WorldEngine:
    def __init__(
        self,
        state: WorldState | None = None,
        event_bus: EventBus | None = None,
        db_path: str | None = None,
    ):
        self.state: WorldState = state or build_default_world()
        self.bus: EventBus = event_bus or default_bus
        self.db_path: str = db_path or cfg.db_path

        self._tick_dt: float = 1.0 / cfg.sim_hz
        self._running: bool = False
        self._last_save: float = 0.0
        self._save_interval: float = 10.0   # save every 10 real seconds

        # plugged in by the orchestrator
        self.movement_model: MovementModel | None = None
        self.stimulation_network: StimulationNetwork | None = None

        # Monotonic clock for simulation steps
        self._last_wall: float = time.monotonic()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        await init_db(self.db_path)
        self._running = True
        self._last_wall = time.monotonic()
        asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False
        await save_world(self.state, self.db_path)

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _loop(self) -> None:
        interval = self._tick_dt
        while self._running:
            t0 = time.monotonic()
            try:
                await self._tick(interval)
            except Exception as exc:
                print(f"[WorldEngine] tick error: {exc}")
            elapsed = time.monotonic() - t0
            await asyncio.sleep(max(0.0, interval - elapsed))

    async def _tick(self, dt: float) -> None:
        self.state.sim_time += dt
        self.state.version += 1
        self.state.wall_time = time.time()

        # 1. Advance day/night cycle
        await self._advance_time(dt)

        # 2. Movement model (if running at its own rate, it pushes velocity;
        #    here we integrate position from current velocity)
        self._integrate_position(dt)

        # 3. Persist periodically
        if time.time() - self._last_save > self._save_interval:
            await save_world(self.state, self.db_path)
            self._last_save = time.time()

    # ------------------------------------------------------------------
    # Physics helpers
    # ------------------------------------------------------------------

    def _integrate_position(self, dt: float) -> None:
        c = self.state.creature
        if c.velocity.length() < 1e-6:
            return

        new_x = c.position.x + c.velocity.x * dt
        new_y = c.position.y + c.velocity.y * dt

        # Clamp to world bounds
        new_x = max(c.radius, min(cfg.world_width - c.radius, new_x))
        new_y = max(c.radius, min(cfg.world_height - c.radius, new_y))

        # Collision with collidable entities
        new_pos = Vec2(x=new_x, y=new_y)
        blocked = False
        blocking_id = ""

        for eid, entity in self.state.entities.items():
            if not entity.alive or not entity.components.collidable:
                continue
            dist = new_pos.distance_to(entity.position)
            min_dist = c.radius + entity.radius
            if dist < min_dist:
                blocked = True
                blocking_id = eid
                # Push out along normal
                if dist > 1e-9:
                    nx = (new_pos.x - entity.position.x) / dist
                    ny = (new_pos.y - entity.position.y) / dist
                    new_x = entity.position.x + nx * min_dist
                    new_y = entity.position.y + ny * min_dist
                    new_pos = Vec2(x=new_x, y=new_y)
                break

        c.position = Vec2(x=new_x, y=new_y)

        if blocked:
            # Zero out velocity component into the obstacle
            c.velocity = Vec2()
            asyncio.create_task(self._emit_blocked(blocking_id))

    async def _emit_blocked(self, blocking_id: str) -> None:
        ev = GameEvent(
            source="world_engine",
            type=EventType.OBSTACLE_ENCOUNTERED,
            entity_id=self.state.creature.id,
            target_id=blocking_id,
            payload={"position": self.state.creature.position.model_dump()},
        )
        await self.bus.publish(ev)
        await persist_event(ev, self.db_path)

    # ------------------------------------------------------------------
    # Day/night
    # ------------------------------------------------------------------

    async def _advance_time(self, dt: float) -> None:
        env = self.state.environment
        prev_hour = int(env.time_of_day)

        # 1 real minute = 1 game hour → game_hours_per_real_second = 1/60
        env.time_of_day += cfg.game_hours_per_real_second * dt

        if env.time_of_day >= 24.0:
            env.time_of_day -= 24.0
            env.day_number += 1
            ev = GameEvent(
                source="world_engine",
                type=EventType.DAY_STARTED,
                payload={"day": env.day_number},
            )
            await self.bus.publish(ev)

        # Ambient light
        h = env.time_of_day
        if 6 <= h <= 18:
            env.ambient_light = min(1.0, (h - 5) / 3) if h < 8 else (1.0 if h < 17 else max(0.1, (19 - h) / 2))
        else:
            env.ambient_light = 0.1

        # Day/night transition events
        new_hour = int(env.time_of_day)
        if prev_hour != new_hour:
            if new_hour == 20:
                ev = GameEvent(source="world_engine", type=EventType.NIGHT_STARTED,
                               payload={"hour": new_hour})
                await self.bus.publish(ev)
            elif new_hour == 6:
                ev = GameEvent(source="world_engine", type=EventType.DAY_STARTED,
                               payload={"hour": new_hour})
                await self.bus.publish(ev)

    # ------------------------------------------------------------------
    # External commands (user/world-editor)
    # ------------------------------------------------------------------

    async def add_entity(self, entity) -> None:
        self.state.add_entity(entity)
        ev = GameEvent(
            source="world_editor",
            type=EventType.OBJECT_ADDED,
            entity_id=entity.id,
            payload={"type": entity.type, "position": entity.position.model_dump()},
        )
        await self.bus.publish(ev)
        await persist_event(ev, self.db_path)

    async def apply_user_interaction(self, action: str, payload: dict) -> None:
        ev = GameEvent(
            source="user",
            type=EventType.USER_INTERACTED,
            payload={"action": action, **payload},
        )
        await self.bus.publish(ev)
        await persist_event(ev, self.db_path)
