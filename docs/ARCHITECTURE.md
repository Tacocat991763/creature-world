# Creature World — Architecture

## Principle

**The world produces happenings. The movement model produces physical behaviour.
The stimulation network produces evolving internal experiences.
The local LLM interprets, narrates, and rationalises.
Memory preserves history. The OpenAI API expands the world.**

The LLM never controls movement. The simulation never waits on the LLM.

---

## Subsystem overview

```
World Engine (25 Hz)
  Authoritative 2D physics, entity state, day/night, persistence

Movement Model (8 Hz)
  Rule/probability-based: reads stimulation → writes velocity
  No LLM calls ever

Stimulation Network (15 Hz)
  CTRNN with 8 channels: reward, distress, curiosity, attachment,
  arousal, fatigue, threat, familiarity
  Receives environmental events → updates activation → feeds movement

Event Bus
  Pub/sub between all subsystems

Local LLM (event-triggered, ≥6s intervals)
  Receives observation JSON (world state + stimulation + memories)
  Returns: thought, speech, action_interpretation, memory_candidate, creation_request
  NEVER controls movement or directly edits world

Memory System (SQLite)
  Working: sliding window deque
  Episodic: significant events with importance + stimulation snapshot
  Long-term: persistent facts; decay and consolidation

World Editor (OpenAI API, on-demand)
  Sole authority for world extensions
  Consumes creation requests from local LLM via CreationQueue
  Generates validated WorldExtension → applied by WorldEngine

MCP Server
  Exposes world-reading tools and creation queue to world editor
  Local LLM cannot access write tools

FastAPI + WebSocket
  HTTP: /api/world, /api/stimulation, /api/events, /api/interact, /api/place_object
  WS /ws: 10 Hz world state broadcast + user interaction commands

Frontend (React + Canvas)
  2D canvas rendering, stimulation bar charts, thought/speech log, debug panel
```

---

## Data flow

```
Environment event (collision, approach, user action)
  → EventBus.publish()
    → StimulationNetwork (updates pending stimuli)
    → LocalLLMClient (queues notable events)
    → Persistence (saves to DB)

StimulationNetwork tick (15 Hz)
  → CTRNN step with pending stimuli + ambient
  → Outputs activation dict

MovementModel tick (8 Hz)
  → Reads stimulation outputs
  → Selects drive: rest | flee | seek_novel | seek_familiar | wander
  → Writes creature.velocity

WorldEngine tick (25 Hz)
  → Integrates velocity → new position
  → Collision resolution
  → Emits OBSTACLE_ENCOUNTERED events

LocalLLM inference (async, every ≥6s or on notable events)
  → Builds observation from world state + stimulation + memories
  → Calls local ~20B model
  → Parses NarrativeOutput
  → Publishes LLM_INTERPRETED event
  → Stores memory if importance ≥ 0.4
  → Routes creation_request to CreationQueue

OpenAIWorldEditor (on creation requests)
  → Calls gpt-4o with world summary + request
  → Parses WorldExtension
  → Validates (stimulus channels, entity count, no plugins)
  → Applies: adds entity to world via WorldEngine
  → Logs to DB

WebSocket broadcaster (10 Hz)
  → Serialises world state → pushes to all browser clients
```

---

## Stimulation network channels

| Index | Channel | Time constant | Bias | Key connections |
|---|---|---|---|---|
| 0 | reward | 2s | -0.2 | ← familiarity, attachment; → (attenuates curiosity) |
| 1 | distress | 3s | -0.5 | ← threat, arousal |
| 2 | curiosity | 1.5s | +0.1 | ← arousal; ↓ familiarity, fatigue |
| 3 | attachment | 5s | -0.3 | → reward, familiarity |
| 4 | arousal | 1s | -0.1 | ← threat, curiosity; ↓ fatigue |
| 5 | fatigue | 6s | -0.3 | ← distress; ↓ arousal, curiosity |
| 6 | threat | 1.5s | -0.6 | → arousal, distress; ↓ familiarity |
| 7 | familiarity | 8s | -0.2 | → reward, attachment; ↓ threat, curiosity |

Update rule: τ_i * dx_i/dt = -x_i + tanh(Σ_j W_ij * tanh(x_j) + I_i + bias_i)

---

## Extension system

World extensions are JSON-validated before application:
- `extension_type`: "object" or "mechanic"
- Object definitions include: name, type, radius, components, properties, interactions
- Each interaction carries `stimulus_effects` (channel → float in [-1,1])
- `requires_plugin=true` is always rejected
- Entity count capped at 50

The local LLM places a `creation_request` in a queue.
The OpenAI world editor reads from that queue via MCP.
The local LLM never calls the world editor directly.

---

## Simulation scheduling

| Subsystem | Hz | Notes |
|---|---|---|
| World engine | 25 | Physics integration, persistence |
| Movement model | 8 | Drive selection + velocity output |
| Stimulation network | 15 | CTRNN step |
| WebSocket broadcast | 10 | State push to clients |
| Local LLM | event/periodic | Never blocks simulation |
| Memory consolidation | 1/300s | Decay, pruning |
| OpenAI world editor | on-demand | Rate-limited, deduped |

---

## Incomplete / future work

- **Learning**: `stimulation/learning.py` has Hebbian plasticity scaffold but it is off by default.
- **Vector memory retrieval**: Currently recency+importance ranked. Should be replaced with embedding-based similarity search for the production version.
- **MCP authentication**: The MCP server currently has no auth. Add before exposing over a network.
- **Frontend speech bubbles**: Thought/speech text appears in the sidebar panel; inline speech bubbles over the creature on the canvas are not yet implemented.
- **Mechanic extensions**: `WorldMechanicExtension` schema exists and validates, but mechanics are not yet wired into the event system dynamically.
- **Plugin review pipeline**: Extension generation with `requires_plugin=true` is blocked; a human-reviewed plugin system could unblock this safely.
