from __future__ import annotations
import asyncio
import time
import uuid
from collections import defaultdict, deque
from typing import Any, Callable, Awaitable
from pydantic import BaseModel, Field


class GameEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:12])
    timestamp: float = Field(default_factory=time.time)
    source: str = "unknown"
    type: str
    entity_id: str = ""
    target_id: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    result: str = "success"


# Well-known event types
class EventType:
    MOVEMENT_STARTED = "movement_started"
    MOVEMENT_COMPLETED = "movement_completed"
    MOVEMENT_BLOCKED = "movement_blocked"
    OBJECT_APPROACHED = "object_approached"
    OBJECT_INTERACTED = "object_interacted"
    OBJECT_ADDED = "object_added"
    OBJECT_REMOVED = "object_removed"
    CREATURE_RESTED = "creature_rested"
    PERSON_INTERACTED = "person_interacted"
    PERSON_GAVE_GIFT = "person_gave_gift"
    OBSTACLE_ENCOUNTERED = "obstacle_encountered"
    DAY_STARTED = "day_started"
    NIGHT_STARTED = "night_started"
    TIME_ADVANCED = "time_advanced"
    CREATION_REQUESTED = "creation_requested"
    WORLD_EXTENDED = "world_extended"
    MEMORY_FORMED = "memory_formed"
    LLM_INTERPRETED = "llm_interpreted"
    USER_INTERACTED = "user_interacted"
    STIMULATION_SPIKE = "stimulation_spike"
    # --- personality / goals / economy ---
    PERSONALITY_FIRED = "personality_fired"
    GOAL_REGISTERED = "goal_registered"
    GOAL_PROGRESSED = "goal_progressed"
    CREDITS_EARNED = "credits_earned"
    PLAN_GENERATED = "plan_generated"


Handler = Callable[[GameEvent], Awaitable[None]]


class EventBus:
    def __init__(self, maxlen: int = 500):
        self._handlers: dict[str, list[Handler]] = defaultdict(list)
        self._wildcard: list[Handler] = []
        self._history: deque[GameEvent] = deque(maxlen=maxlen)
        self._lock = asyncio.Lock()

    def subscribe(self, event_type: str, handler: Handler) -> None:
        self._handlers[event_type].append(handler)

    def subscribe_all(self, handler: Handler) -> None:
        self._wildcard.append(handler)

    async def publish(self, event: GameEvent) -> None:
        async with self._lock:
            self._history.append(event)
        handlers = list(self._handlers.get(event.type, []) + self._wildcard)
        for h in handlers:
            try:
                await h(event)
            except Exception as exc:
                print(f"[EventBus] handler error for {event.type}: {exc}")

    def recent(self, n: int = 20) -> list[GameEvent]:
        return list(self._history)[-n:]

    def since(self, timestamp: float) -> list[GameEvent]:
        return [e for e in self._history if e.timestamp > timestamp]


# Module-level singleton
bus = EventBus()
