"""
Autonomous movement state-change model.

Runs at MOVEMENT_HZ. Reads world state + stimulation outputs.
Writes velocity to creature. Never calls any LLM.
"""
from __future__ import annotations
import asyncio
import random
import time
from typing import TYPE_CHECKING

from ..config import cfg
from ..world.entities import Vec2
from ..world.events import EventBus, GameEvent, EventType, bus as default_bus
from ..world.persistence import persist_event
from .behaviors import (
    wander, seek, flee, rest_in_place,
    find_novel_target, find_familiar_target,
)
from .physics import steer_toward, angle_to_vec

if TYPE_CHECKING:
    from ..world.engine import WorldEngine
    from ..stimulation.network import StimulationNetwork

# Stimulation thresholds that influence drive selection
CURIOSITY_SEEK_THRESHOLD = 0.4
THREAT_FLEE_THRESHOLD = 0.5
FATIGUE_REST_THRESHOLD = 0.75
ATTACHMENT_SEEK_THRESHOLD = 0.5
INTERACTION_APPROACH_DISTANCE = 3.5


class MovementModel:
    def __init__(
        self,
        engine: WorldEngine,
        stimulation: StimulationNetwork | None = None,
        event_bus: EventBus | None = None,
    ):
        self.engine = engine
        self.stimulation = stimulation
        self.bus = event_bus or default_bus
        self._dt = 1.0 / cfg.movement_hz
        self._running = False

        # Internal movement state
        self._visited_ids: set[str] = set()
        self._current_target_id: str | None = None
        self._current_target_pos: Vec2 | None = None
        self._move_decision: str = "wander"
        self._last_decision_time: float = 0.0
        self._decision_interval: float = 1.5   # re-decide every 1.5s
        self._resting_until: float = 0.0

    async def start(self) -> None:
        self._running = True
        asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False

    # ------------------------------------------------------------------

    async def _loop(self) -> None:
        interval = self._dt
        while self._running:
            t0 = time.monotonic()
            try:
                await self._update()
            except Exception as exc:
                print(f"[MovementModel] error: {exc}")
            elapsed = time.monotonic() - t0
            await asyncio.sleep(max(0.0, interval - elapsed))

    async def _update(self) -> None:
        state = self.engine.state
        creature = state.creature
        now = self.engine.state.sim_time

        # Read stimulation outputs (defaults if network not connected)
        stim = self._read_stimulation()

        # Possibly re-decide drive every _decision_interval sim-seconds
        if now - self._last_decision_time >= self._decision_interval:
            self._last_decision_time = now
            self._decide_drive(stim, state)

        # Execute drive
        direction, speed_scalar = await self._execute_drive(stim, state)

        # Apply to creature velocity
        base_speed = creature.speed * creature.energy
        creature.velocity = Vec2(
            x=direction.x * base_speed * speed_scalar,
            y=direction.y * base_speed * speed_scalar,
        )

        # Update orientation smoothly
        if direction.length() > 0.01:
            creature.orientation = steer_toward(
                creature.orientation,
                Vec2(x=creature.position.x + direction.x,
                     y=creature.position.y + direction.y),
                creature.position,
                turn_rate=5.0,
                dt=self._dt,
            )

        # Check proximity to target
        if self._current_target_pos is not None:
            dist = creature.position.distance_to(self._current_target_pos)
            if dist < INTERACTION_APPROACH_DISTANCE and self._current_target_id:
                await self._on_reached_target(self._current_target_id)

    def _read_stimulation(self) -> dict[str, float]:
        defaults = {
            "reward": 0.1, "distress": 0.0, "curiosity": 0.3,
            "attachment": 0.1, "arousal": 0.3, "fatigue": 0.1,
            "threat": 0.0, "familiarity": 0.2,
        }
        if self.stimulation is None:
            return defaults
        return self.stimulation.get_outputs()

    def _decide_drive(self, stim: dict[str, float], state) -> None:
        now_real = time.time()

        # Priority order: rest > flee > seek-novel > seek-familiar > wander
        if stim["fatigue"] > FATIGUE_REST_THRESHOLD:
            self._move_decision = "rest"
            self._resting_until = now_real + 2.0 + random.random() * 3.0
            self._current_target_pos = None
            self._current_target_id = None
            return

        if stim["threat"] > THREAT_FLEE_THRESHOLD:
            self._move_decision = "flee"
            # find nearest collidable as threat proxy
            threats = [e for e in state.entities.values() if e.alive and e.components.collidable]
            if threats:
                nearest = min(threats, key=lambda e: state.creature.position.distance_to(e.position))
                self._current_target_pos = nearest.position
                self._current_target_id = nearest.id
            return

        if stim["curiosity"] > CURIOSITY_SEEK_THRESHOLD:
            target = find_novel_target(
                state.creature.position,
                list(state.entities.values()),
                self._visited_ids,
            )
            if target:
                self._move_decision = "seek_novel"
                self._current_target_pos = target.position
                self._current_target_id = target.id
                return

        if stim["attachment"] > ATTACHMENT_SEEK_THRESHOLD:
            target = find_familiar_target(
                state.creature.position,
                list(state.entities.values()),
                self._visited_ids,
            )
            if target:
                self._move_decision = "seek_familiar"
                self._current_target_pos = target.position
                self._current_target_id = target.id
                return

        self._move_decision = "wander"
        self._current_target_pos = None
        self._current_target_id = None

    async def _execute_drive(self, stim: dict[str, float], state) -> tuple[Vec2, float]:
        creature = state.creature

        if self._move_decision == "rest" and time.time() < self._resting_until:
            return rest_in_place()

        if self._move_decision == "flee" and self._current_target_pos:
            result = flee(creature.position, self._current_target_pos)
            if result:
                return result

        if self._move_decision in ("seek_novel", "seek_familiar") and self._current_target_pos:
            result = seek(creature.position, self._current_target_pos)
            if result:
                return result

        # Default: wander
        direction, speed = wander(creature.position, creature.orientation)
        return direction, speed

    async def _on_reached_target(self, target_id: str) -> None:
        if target_id in self._visited_ids:
            return
        self._visited_ids.add(target_id)
        self._current_target_id = None
        self._current_target_pos = None
        self._move_decision = "wander"
        self._last_decision_time = 0.0  # force re-decide

        entity = self.engine.state.entities.get(target_id)
        ev = GameEvent(
            source="movement_model",
            type=EventType.OBJECT_APPROACHED,
            entity_id=self.engine.state.creature.id,
            target_id=target_id,
            payload={
                "object_type": entity.type if entity else "unknown",
                "position": self.engine.state.creature.position.model_dump(),
            },
        )
        await self.bus.publish(ev)
        await persist_event(ev, self.engine.db_path)
