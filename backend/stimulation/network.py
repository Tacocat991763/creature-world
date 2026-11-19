"""
StimulationNetwork — persistent CTRNN emotional state.

Runs at STIMULATION_HZ.  Receives environmental events via the event bus.
Outputs activation values to the movement model and cognition layer.
State persists across restarts via SQLite (serialised as JSON).
"""
from __future__ import annotations
import asyncio
import json
import time
from typing import TYPE_CHECKING

import numpy as np

from ..config import cfg
from ..world.events import EventBus, GameEvent, bus as default_bus
from .dynamics import (
    CHANNEL_NAMES, N, TAU, step, compute_ambient_stimulus
)
from .stimuli import StimulusPacket

if TYPE_CHECKING:
    from ..world.engine import WorldEngine


_SAVE_KEY = "stimulation_state_v1"


class StimulationNetwork:
    def __init__(
        self,
        engine: WorldEngine | None = None,
        event_bus: EventBus | None = None,
    ):
        self.engine = engine
        self.bus = event_bus or default_bus
        self._dt = 1.0 / cfg.stimulation_hz
        self._running = False

        # Persistent activation state
        self._x: np.ndarray = np.zeros(N, dtype=float)
        # Pending stimuli buffered from events
        self._pending: np.ndarray = np.zeros(N, dtype=float)
        self._pending_lock = asyncio.Lock()

        # Subscribe to world events
        self.bus.subscribe_all(self._on_event)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        await self._load_state()
        self._running = True
        asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False
        await self._save_state()

    # ------------------------------------------------------------------
    # Persistence (piggybacks on world DB)
    # ------------------------------------------------------------------

    async def _save_state(self) -> None:
        if self.engine is None:
            return
        try:
            import aiosqlite
            async with aiosqlite.connect(self.engine.db_path) as db:
                # Store as a single-row config table
                await db.execute(
                    "CREATE TABLE IF NOT EXISTS stimulation_state "
                    "(key TEXT PRIMARY KEY, value TEXT)"
                )
                await db.execute(
                    "INSERT OR REPLACE INTO stimulation_state VALUES (?, ?)",
                    (_SAVE_KEY, json.dumps(self._x.tolist())),
                )
                await db.commit()
        except Exception as e:
            print(f"[StimulationNetwork] save error: {e}")

    async def _load_state(self) -> None:
        if self.engine is None:
            return
        try:
            import aiosqlite
            async with aiosqlite.connect(self.engine.db_path) as db:
                await db.execute(
                    "CREATE TABLE IF NOT EXISTS stimulation_state "
                    "(key TEXT PRIMARY KEY, value TEXT)"
                )
                await db.commit()
                async with db.execute(
                    "SELECT value FROM stimulation_state WHERE key = ?", (_SAVE_KEY,)
                ) as cur:
                    row = await cur.fetchone()
            if row:
                self._x = np.array(json.loads(row[0]), dtype=float)
        except Exception as e:
            print(f"[StimulationNetwork] load error: {e}")

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _loop(self) -> None:
        interval = self._dt
        save_every = int(30 * cfg.stimulation_hz)   # save every 30s
        tick_count = 0
        while self._running:
            t0 = time.monotonic()
            try:
                await self._tick()
                tick_count += 1
                if tick_count % save_every == 0:
                    await self._save_state()
            except Exception as exc:
                print(f"[StimulationNetwork] tick error: {exc}")
            elapsed = time.monotonic() - t0
            await asyncio.sleep(max(0.0, interval - elapsed))

    async def _tick(self) -> None:
        # Collect pending stimuli
        async with self._pending_lock:
            stimuli = self._pending.copy()
            self._pending = np.zeros(N, dtype=float)

        # Ambient stimulus from time of day
        if self.engine:
            env = self.engine.state.environment
            ambient = compute_ambient_stimulus(env.time_of_day, env.ambient_light)
            stimuli += ambient

        # CTRNN step
        self._x = step(self._x, stimuli, self._dt)

    # ------------------------------------------------------------------
    # Event handler (runs in event bus)
    # ------------------------------------------------------------------

    async def _on_event(self, event: GameEvent) -> None:
        packet = StimulusPacket.from_event_type(event.type, event.payload)
        arr = np.array(packet.as_array(), dtype=float)
        async with self._pending_lock:
            self._pending += arr

    # ------------------------------------------------------------------
    # Outputs
    # ------------------------------------------------------------------

    def get_outputs(self) -> dict[str, float]:
        """Return current activations as a dict for other systems."""
        return {name: float(v) for name, v in zip(CHANNEL_NAMES, self._x)}

    def get_snapshot(self) -> dict[str, float]:
        return self.get_outputs()

    def inject(self, packet: StimulusPacket) -> None:
        """Directly inject a stimulus (e.g., from tests or the world editor)."""
        arr = np.array(packet.as_array(), dtype=float)
        # Fire-and-forget: use asyncio.create_task when in async context
        async def _inject() -> None:
            async with self._pending_lock:
                self._pending += arr
        asyncio.create_task(_inject())
