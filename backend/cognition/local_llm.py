"""
Local LLM client — async, event-triggered narrative interpreter.

Calls the local ~20B model via any OpenAI-compatible endpoint (Ollama, llama.cpp, vLLM).
Runs asynchronously; the simulation never waits on this.
"""
from __future__ import annotations
import asyncio
import json
import time
from typing import TYPE_CHECKING

from openai import AsyncOpenAI
from pydantic import ValidationError

from ..config import cfg
from ..world.events import EventBus, GameEvent, EventType, bus as default_bus
from ..world.persistence import persist_event
from .interpretations import NarrativeOutput, FALLBACK_OUTPUT
from .observations import build_observation
from .prompts import build_messages

if TYPE_CHECKING:
    from ..world.engine import WorldEngine
    from ..stimulation.network import StimulationNetwork
    from ..memory.retrieval import MemoryRetrieval
    from ..personality.engine import PersonalityEngine
    from ..goals.engine import GoalEngine
    from ..economy.credits import EconomySystem


class LocalLLMClient:
    def __init__(
        self,
        engine: "WorldEngine",
        stimulation: "StimulationNetwork | None" = None,
        memory: "MemoryRetrieval | None" = None,
        event_bus: EventBus | None = None,
        personality: "PersonalityEngine | None" = None,
        goals: "GoalEngine | None" = None,
        economy: "EconomySystem | None" = None,
    ):
        self.engine = engine
        self.stimulation = stimulation
        self.memory = memory
        self.bus = event_bus or default_bus
        self.personality = personality
        self.goals = goals
        self.economy = economy

        self._client = AsyncOpenAI(
            base_url=cfg.local_llm_base_url,
            api_key=cfg.local_llm_api_key,
        )
        self._running = False
        # Start disabled if no API key is configured; user can toggle in the UI
        self.enabled: bool = bool(cfg.local_llm_api_key and cfg.local_llm_api_key != "ollama")
        self._last_inference: float = 0.0
        self._inference_lock = asyncio.Lock()
        self._pending_events: list[GameEvent] = []

        # Subscribe to notable events that should trigger inference
        for ev_type in [
            EventType.OBJECT_APPROACHED,
            EventType.PERSON_GAVE_GIFT,
            EventType.PERSON_INTERACTED,
            EventType.OBSTACLE_ENCOUNTERED,
            EventType.USER_INTERACTED,
            EventType.WORLD_EXTENDED,
        ]:
            self.bus.subscribe(ev_type, self._on_notable_event)

    async def start(self) -> None:
        self._running = True
        asyncio.create_task(self._periodic_loop())

    async def stop(self) -> None:
        self._running = False

    # ------------------------------------------------------------------
    # Triggers
    # ------------------------------------------------------------------

    async def _on_notable_event(self, event: GameEvent) -> None:
        self._pending_events.append(event)
        # Trigger inference if enough time has passed
        now = time.time()
        if now - self._last_inference >= cfg.llm_interval_seconds / 2:
            asyncio.create_task(self._run_inference())

    async def _periodic_loop(self) -> None:
        while self._running:
            await asyncio.sleep(cfg.llm_interval_seconds)
            asyncio.create_task(self._run_inference())

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    async def _run_inference(self) -> None:
        if not self.enabled:
            return
        if self._inference_lock.locked():
            return   # already running
        async with self._inference_lock:
            self._last_inference = time.time()
            await self._do_inference()

    async def _do_inference(self) -> None:
        # Gather recent events
        recent_events = self.bus.recent(15)
        self._pending_events.clear()

        # Retrieve relevant memories
        memories: list[str] = []
        if self.memory:
            try:
                mems = await self.memory.retrieve(query="", limit=5)
                memories = [m.get("content", "") for m in mems]
            except Exception:
                pass

        obs = build_observation(self.engine, self.stimulation, recent_events, memories)
        obs_json = json.dumps(obs, indent=2)

        # Build personality/goal/economy context for the prompt
        import json as _json
        traits_json = _json.dumps(
            self.personality.get_traits_summary() if self.personality else []
        )
        goals_json = _json.dumps(
            self.goals.goals_summary() if self.goals else []
        )
        economy_json = _json.dumps(
            self.economy.status() if self.economy else {"balance": 0}
        )

        messages = build_messages(
            self.engine.state.creature.name,
            obs_json,
            traits_json=traits_json,
            goals_json=goals_json,
            economy_json=economy_json,
        )

        output = await self._call_model(messages)

        # Publish interpretation event
        ev = GameEvent(
            source="local_llm",
            type=EventType.LLM_INTERPRETED,
            entity_id=self.engine.state.creature.id,
            payload={
                "thought": output.thought,
                "speech": output.speech,
                "action_interpretation": output.action_interpretation,
                "experience_interpretation": output.experience_interpretation,
            },
        )
        await self.bus.publish(ev)
        await persist_event(ev, self.engine.db_path)

        # Form memory if significant
        if output.memory_candidate and output.memory_candidate.importance >= 0.4:
            if self.memory:
                stim_snapshot = self.stimulation.get_snapshot() if self.stimulation else {}
                await self.memory.store_episodic(
                    content=output.memory_candidate.content,
                    importance=output.memory_candidate.importance,
                    sim_time=self.engine.state.sim_time,
                    location=self.engine.state.creature.position.model_dump(),
                    stimulation_snapshot=stim_snapshot,
                )

        # Route creation request
        if output.creation_request:
            from ..world_editor.creation_queue import CreationQueue
            await CreationQueue.instance().enqueue(output.creation_request)

        # Inject desires into CTRNN
        if output.desires and self.stimulation:
            from ..stimulation.stimuli import StimulusPacket
            channels = ["reward", "distress", "curiosity", "attachment",
                        "arousal", "fatigue", "threat", "familiarity"]
            for desire in output.desires:
                if desire.channel not in channels:
                    continue
                packet_kwargs = {ch: 0.0 for ch in channels}
                packet_kwargs[desire.channel] = float(desire.delta)
                self.stimulation.inject(StimulusPacket(**packet_kwargs))

        # Register new goal
        if output.new_goal and self.goals:
            await self.goals.register_goal_from_llm(output.new_goal)

        # Award economy credits
        if output.economy_earn > 0 and self.economy:
            await self.economy.earn(output.economy_earn, "LLM: narrative activity")

    async def _call_model(self, messages: list[dict]) -> NarrativeOutput:
        try:
            resp = await self._client.chat.completions.create(
                model=cfg.local_llm_model,
                messages=messages,
                response_format={"type": "json_object"},
                max_tokens=512,
                temperature=0.8,
            )
            raw = resp.choices[0].message.content or "{}"
            return NarrativeOutput.model_validate_json(raw)
        except ValidationError as ve:
            print(f"[LocalLLM] parse error: {ve}")
            return FALLBACK_OUTPUT
        except Exception as exc:
            print(f"[LocalLLM] inference error: {exc}")
            return FALLBACK_OUTPUT
