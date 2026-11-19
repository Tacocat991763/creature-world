# Architecture Audit — creature-world
*Written 2026-11-18. Evidence-based; no speculation marked as confirmed.*

---

## 1. Which backend is deployed

**TypeScript/Bun (`server/`)** is the deployed runtime.
`start.sh` runs `bun run server/src/main.ts` on the Nest host at port 8000.
The Python/FastAPI backend (`backend/`) is present in the repo but has no startup script
and no reference in the deployment configuration. It is not running.

---

## 2. What the TypeScript backend actually does

| Subsystem | File | Confirmed behaviour |
|---|---|---|
| World simulation | `world/engine.ts` | 25 Hz physics, SQLite persistence every 10 s |
| Stimulation | `simulation/network.ts` | 15 Hz CTRNN (8 ch), **not persisted across restart** |
| Movement | `simulation/movement.ts` | Drive states: wander / rest / flee / seek_novel / seek_familiar |
| Personality | `personality/engine.ts` | 1 Hz trait → stimulation injector; traits from seed only |
| Memory | `memory/store.ts` | Single episodic table, decay × 0.95 / consolidation, no capacity limit |
| Goals | `goals/engine.ts` | SQLite-backed; 2 seed goals; LLM can add goals |
| Economy | `economy/credits.ts` | Credits earned by LLM; no defined world events that earn credits |
| Narrator | `cognition/narrator.ts` | 8–12 s LLM cycle; **directly injects desires into CTRNN** (spec violation) |
| Planner | `planning/agent.ts` | Separate OpenAI-only agent; not yet wired to narrator |
| WebSocket | `api/ws.ts` | 10 Hz world_state broadcast; rule-based thought pools as fallback |
| HTTP | `api/http.ts` | Static files + 7 API routes; **no conversation endpoint** |
| Frontend | `frontend/src/` | React/Three.js; debug dashboard; **no conversation UI** |

---

## 3. What the Python backend adds (not in TypeScript)

| Feature | Python module | Notes |
|---|---|---|
| Episodic + long-term memory tiers | `memory/episodic.py`, `memory/long_term.py` | Bounded capacity, recall scoring |
| World editor with schema + validation | `backend/world_editor/` | OpenAI-only, extension schema, creation queue |
| MCP server | `backend/mcp/server.py` | Not wired |
| Richer stimulation learning | `stimulation/learning.py`, `stimulation/dynamics.py` | Hebbian-style |
| Tests | `backend/tests/` | 5 test files covering movement, stimulation, memory, world editor |

The TypeScript backend has **no tests** at all.

---

## 4. Critical spec violations in the current TypeScript implementation

### 4a. Narrator directly injects desires into CTRNN
`narrator.ts` lines 113–116:
```ts
for (const d of output.desires) {
  this._stimulation.inject({ [d.channel]: d.delta } as any)
}
```
The spec requires this to be redesigned. Desires must become narrative concerns
stored separately; a bounded mediation layer controls any downstream stimulation effect.

### 4b. Narrator silently falls back to GPT-4o
If `NARRATOR_BASE_URL` / `NARRATOR_MODEL` are not set, the narrator uses whatever
`OPENAI_API_KEY` is set for ordinary narration. The spec forbids this: private
narration must not go to the OpenAI API silently.

### 4c. Stimulation state is not persisted
The 8 CTRNN activations (`_x`) are reset to zero on every server restart.
The spec requires persistence with time-based evolution capping.

### 4d. No conversation interface
No endpoint for English conversation exists. This is the highest-priority
user-facing missing feature per the spec.

### 4e. Env var names are inconsistent
`.env.example` uses `LOCAL_LLM_BASE_URL` / `LOCAL_LLM_MODEL`.
`narrator.ts` uses `NARRATOR_BASE_URL` / `NARRATOR_MODEL`.

---

## 5. Pino reference — confirmed features worth adapting

From direct inspection of pinos.world and its public API:

| Pino feature | Pino implementation evidence | Luma adaptation plan |
|---|---|---|
| Bounded memory (long + short term, 44 slots each) | `/memories` page shows "82 of 88 slots used", "2 parts full" | Implement tiered bounded memory |
| Memory scoring (importance × recall × recency) | Each memory shows recall count, last recalled, current worth | Add recall tracking + composite score |
| Open concerns / threads | `/brain` shows promises, questions, wants, pieces of work | Implement concerns table |
| Character sheet with LLM additions during sleep | Fixed traits + "added by him" section requiring N nights of evidence | Personality evolution system |
| Natural language for all public-facing content | No JSON exposed to visitors; narration in plain English | Conversation-first UI |
| Public read-only API (no auth) | `pinos.world/api/v1/now` etc. | Nice to have; not blocking |

Pino's exact implementation is not inspected; the above is derived from public UI + API responses only.

---

## 6. Chosen architecture going forward

**Single runtime: TypeScript/Bun.** The Python backend is preserved until all its
unique features (tiered memory, world editor, tests) are ported. It is not removed
until that is complete and verified.

**Immediate priorities:**
1. Remove CTRNN injection from narrator; introduce ConcernsStore + ConcernMediator
2. Fix LLM fallback: local only for narration and conversation
3. Persist stimulation state
4. Add ConversationAgent + endpoints + frontend UI
5. Port Python tiered memory to TypeScript
6. Add sleep cycle, activities, daily journal (Priority 5–6)
7. Port Python world editor to TypeScript (Priority 7)

---

## 7. What is not changed until verified

- Database schema: migrations will be additive; existing tables untouched
- Deployment: `start.sh` unchanged until new code passes local testing
- Python backend: preserved as reference; not deleted until port is complete
