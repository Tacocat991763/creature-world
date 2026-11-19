"""
Application entry point.

Starts all subsystems in dependency order:
  World engine → Stimulation network → Movement model
  → Local LLM → Memory consolidation → World editor → FastAPI
"""
from __future__ import annotations
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .config import cfg
from .world.engine import WorldEngine
from .world.persistence import load_world
from .movement.model import MovementModel
from .stimulation.network import StimulationNetwork
from .cognition.local_llm import LocalLLMClient
from .memory.retrieval import MemoryRetrieval
from .world_editor.creation_queue import CreationQueue
from .world_editor.openai_agent import OpenAIWorldEditor
from .world.persistence import init_db
from .api.routes import router, deps
from .api.websocket import handle_ws, world_state_broadcaster
from .personality.engine import PersonalityEngine
from .goals.engine import GoalEngine
from .economy.credits import EconomySystem
from .planning.agent import PlanningAgent
from .world.events import bus as event_bus, GameEvent, EventType

# --- Global subsystem references ------------------------------------------
_engine: WorldEngine | None = None
_stimulation: StimulationNetwork | None = None
_movement: MovementModel | None = None
_llm: LocalLLMClient | None = None
_memory: MemoryRetrieval | None = None
_world_editor: OpenAIWorldEditor | None = None
_queue: CreationQueue | None = None
_personality: PersonalityEngine | None = None
_goals: GoalEngine | None = None
_economy: EconomySystem | None = None
_planner: PlanningAgent | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _engine, _stimulation, _movement, _llm, _memory, _world_editor, _queue
    global _personality, _goals, _economy, _planner

    # 0. Init DB schema before anything else
    await init_db(cfg.db_path)

    # 1. World
    world_state = await load_world(cfg.db_path)
    _engine = WorldEngine(state=world_state, db_path=cfg.db_path)

    # 2. Stimulation
    _stimulation = StimulationNetwork(engine=_engine)
    _engine.stimulation_network = _stimulation

    # 3. Movement
    _movement = MovementModel(engine=_engine, stimulation=_stimulation)
    _engine.movement_model = _movement

    # 4. Memory
    _memory = MemoryRetrieval(db_path=cfg.db_path)

    # 5. Personality traits engine
    _personality = PersonalityEngine(
        engine=_engine, stimulation=_stimulation, db_path=cfg.db_path
    )

    # 6. Goal engine
    _goals = GoalEngine(db_path=cfg.db_path)

    # 7. Economy
    _economy = EconomySystem(db_path=cfg.db_path)

    # 8. LLM — now aware of personality/goals/economy
    _llm = LocalLLMClient(
        engine=_engine,
        stimulation=_stimulation,
        memory=_memory,
        personality=_personality,
        goals=_goals,
        economy=_economy,
    )

    # 9. Planning agent
    async def _plan_event_callback(event_type: str, data: dict) -> None:
        ev = GameEvent(source="planning_agent", type=event_type, payload=data)
        await event_bus.publish(ev)

    _planner = PlanningAgent(
        goal_engine=_goals,
        economy=_economy,
        events_callback=_plan_event_callback,
        db_path=cfg.db_path,
    )

    # 10. Creation queue + world editor
    _queue = CreationQueue(db_path=cfg.db_path)
    CreationQueue.set_instance(_queue)
    _world_editor = OpenAIWorldEditor(engine=_engine, db_path=cfg.db_path)
    _world_editor._queue = _queue

    # Inject into HTTP routes
    deps.engine = _engine
    deps.stimulation = _stimulation
    deps.queue = _queue
    deps.llm = _llm

    # Start all subsystems in order
    await _engine.start()
    await _stimulation.start()
    await _movement.start()
    await _personality.start()
    await _goals.start()
    await _economy.start()
    await _llm.start()
    await _planner.start()
    await _world_editor.start()

    # WebSocket broadcaster
    asyncio.create_task(world_state_broadcaster(_engine, _stimulation))

    # Memory consolidation loop
    asyncio.create_task(_memory_consolidation_loop(_memory))

    print(f"[main] Creature World started. World: {world_state.creature.name} at "
          f"({world_state.creature.position.x:.1f}, {world_state.creature.position.y:.1f})")

    yield

    # Shutdown (reverse order)
    await _planner.stop()
    await _movement.stop()
    await _personality.stop()
    await _goals.stop()
    await _economy.stop()
    await _stimulation.stop()
    await _llm.stop()
    await _world_editor.stop()
    await _engine.stop()
    print("[main] Shut down cleanly.")


async def _memory_consolidation_loop(memory: MemoryRetrieval) -> None:
    interval = cfg.memory_consolidation_minutes * 60
    while True:
        await asyncio.sleep(interval)
        try:
            await memory.consolidate()
        except Exception as e:
            print(f"[memory] consolidation error: {e}")


# --- FastAPI app -----------------------------------------------------------
app = FastAPI(title="Creature World", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await handle_ws(ws, _engine)


# Serve frontend build if present
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=cfg.host, port=cfg.port, reload=False)
