/**
 * Luma — Autonomous Artificial Creature
 * Entry point: wires all subsystems and starts the Bun HTTP/WS server.
 */
import { Database } from "bun:sqlite"
import { join } from "path"

import { WorldEngine } from "./world/engine"
import { StimulationNetwork } from "./simulation/network"
import { MovementModel } from "./simulation/movement"
import { PersonalityEngine } from "./personality/engine"
import { GoalEngine } from "./goals/engine"
import { EconomySystem } from "./economy/credits"
import { MemoryStore } from "./memory/store"
import { ConcernsStore, ConcernMediator } from "./cognition/concerns"
import { NarratorAgent } from "./cognition/narrator"
import { ConversationAgent } from "./cognition/conversation"
import { PlanningAgent } from "./planning/agent"
import { WsBroadcaster } from "./api/ws"
import { makeHttpHandler } from "./api/http"
import type { WsData } from "./api/ws"

const PORT = parseInt(process.env.PORT ?? "8000")
const DB_PATH = join(import.meta.dir, "../../creature.db")

console.log("╔═══════════════════════════════════════╗")
console.log("║   Luma — Creature World               ║")
console.log(`║   Port: ${PORT}                           ║`)
console.log(`║   DB:   ${DB_PATH.slice(-30).padEnd(30)} ║`)
console.log("╚═══════════════════════════════════════╝")

// ── Database ────────────────────────────────────────────────────────
const db = new Database(DB_PATH)

// ── Subsystems ──────────────────────────────────────────────────────
const worldEngine    = new WorldEngine(db)
const stimulation    = new StimulationNetwork(() => worldEngine.state.environment.timeOfDay, db)
const movement       = new MovementModel(worldEngine, stimulation, db)
const personality    = new PersonalityEngine(stimulation, worldEngine, db)
const goals          = new GoalEngine(db)
const economy        = new EconomySystem(db)
const memory         = new MemoryStore(db)
const concerns       = new ConcernsStore(db)
const mediator       = new ConcernMediator(concerns, stimulation)
const narrator       = new NarratorAgent(worldEngine, stimulation, memory, goals, economy, personality, concerns, db)
const conversation   = new ConversationAgent(db, worldEngine, stimulation, memory, concerns, narrator)
const planner        = new PlanningAgent(process.env.OPENAI_API_KEY ?? "", goals, economy, db)
const broadcaster    = new WsBroadcaster(worldEngine, stimulation, movement, narrator)

const handleHttp = makeHttpHandler(worldEngine, stimulation, goals, economy, narrator, personality, conversation)

// ── Start order ─────────────────────────────────────────────────────
worldEngine.start()
stimulation.start()
movement.start()
personality.start()
mediator.start()
broadcaster.start()
narrator.start()
planner.start()

// Memory consolidation every 5 minutes
setInterval(() => memory.consolidate(), 5 * 60 * 1000)

console.log("[Main] All subsystems started")

// ── Bun HTTP + WebSocket server ─────────────────────────────────────
const server = Bun.serve<WsData>({
  port: PORT,
  fetch(req, server) {
    if (req.headers.get("upgrade") === "websocket") {
      const success = server.upgrade(req, { data: { id: crypto.randomUUID() } })
      if (success) return
      return new Response("WebSocket upgrade failed", { status: 400 })
    }
    return handleHttp(req)
  },
  websocket: {
    open(ws)        { broadcaster.onOpen(ws) },
    close(ws)       { broadcaster.onClose(ws) },
    message(ws, msg){ broadcaster.onMessage(ws, msg) },
  },
})

console.log(`[Main] Server listening on http://0.0.0.0:${server.port}`)

// ── Graceful shutdown ───────────────────────────────────────────────
process.on("SIGINT",  shutdown)
process.on("SIGTERM", shutdown)

function shutdown() {
  console.log("\n[Main] Shutting down…")
  narrator.stop()
  planner.stop()
  broadcaster.stop()
  mediator.stop()
  personality.stop()
  movement.stop()
  stimulation.stop()
  worldEngine.stop()
  db.close()
  process.exit(0)
}
