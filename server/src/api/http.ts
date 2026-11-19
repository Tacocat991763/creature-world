/**
 * HTTP routes — Bun.serve() handler.
 * Static files served from ../../frontend/build (rsync'd from React build).
 */
import { readFileSync, existsSync } from "fs"
import { join, extname } from "path"
import type { WorldEngine } from "../world/engine"
import type { StimulationNetwork } from "../simulation/network"
import type { GoalEngine } from "../goals/engine"
import type { EconomySystem } from "../economy/credits"
import type { NarratorAgent } from "../cognition/narrator"
import type { PersonalityEngine } from "../personality/engine"
import type { ConversationAgent } from "../cognition/conversation"
import { makeEntity } from "../world/state"

// Try dist (Vite) first, fall back to build (CRA)
const STATIC_ROOT = existsSync(join(import.meta.dir, "../../../frontend/dist"))
  ? join(import.meta.dir, "../../../frontend/dist")
  : join(import.meta.dir, "../../../frontend/build")
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".json": "application/json",
  ".woff2":"font/woff2",
  ".svg":  "image/svg+xml",
}

function staticFile(urlPath: string): Response | null {
  let fsPath = join(STATIC_ROOT, urlPath === "/" ? "index.html" : urlPath)
  if (!existsSync(fsPath)) {
    fsPath = join(STATIC_ROOT, "index.html")
  }
  if (!existsSync(fsPath)) return null
  const ext = extname(fsPath)
  const type = MIME[ext] ?? "application/octet-stream"
  return new Response(readFileSync(fsPath), { headers: { "Content-Type": type } })
}

export function makeHttpHandler(
  worldEngine: WorldEngine,
  stimulation: StimulationNetwork,
  goals: GoalEngine,
  economy: EconomySystem,
  narrator: NarratorAgent,
  personality: PersonalityEngine,
  conversation: ConversationAgent,
) {
  return async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname

    // ── API routes ──────────────────────────────────────────────────
    if (path === "/api/world" && req.method === "GET") {
      return Response.json({
        creature: {
          ...worldEngine.state.creature,
          position: worldEngine.state.creature.position.toJSON(),
          velocity: worldEngine.state.creature.velocity.toJSON(),
        },
        entities: Array.from(worldEngine.state.entities.values()).map(e => ({
          ...e,
          position: e.position.toJSON(),
        })),
        environment: worldEngine.state.environment,
        simTime: worldEngine.state.simTime,
      })
    }

    if (path === "/api/stimulation" && req.method === "GET") {
      return Response.json(stimulation.getSnapshot())
    }

    if (path === "/api/goals" && req.method === "GET") {
      return Response.json(goals.goalsSummary())
    }

    if (path === "/api/economy" && req.method === "GET") {
      return Response.json(economy.status())
    }

    if (path === "/api/personality" && req.method === "GET") {
      return Response.json(personality.getTraitsSummary())
    }

    if (path === "/api/llm/status" && req.method === "GET") {
      return Response.json({
        enabled: narrator.enabled,
        has_key: Boolean(process.env.OPENAI_API_KEY),
      })
    }

    if (path === "/api/llm/toggle" && req.method === "POST") {
      narrator.enabled = !narrator.enabled
      return Response.json({ enabled: narrator.enabled })
    }

    if (path === "/api/place_object" && req.method === "POST") {
      try {
        const body = await req.json() as { type: string; name: string; x: number; y: number }
        const entity = makeEntity(body.type, body.name, body.x, body.y, {
          components: { interactable: true, collidable: false, emitsLight: false, consumable: false },
        })
        worldEngine.addEntity(entity)
        return Response.json({ ok: true, entity: { ...entity, position: entity.position.toJSON() } })
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 400 })
      }
    }

    if (path === "/api/interact" && req.method === "POST") {
      try {
        const body = await req.json() as { action: string; [k: string]: unknown }
        worldEngine.applyUserInteraction(body.action, body)
        return Response.json({ ok: true })
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 400 })
      }
    }

    // ── Conversation ────────────────────────────────────────────────
    if (path === "/api/chat" && req.method === "POST") {
      try {
        const body = await req.json() as { visitor_id: string; message: string; display_name?: string }
        if (!body.visitor_id || !body.message?.trim()) {
          return Response.json({ ok: false, error: "visitor_id and message required" }, { status: 400 })
        }
        const { reply, visitor } = await conversation.chat(body.visitor_id, body.message.trim(), body.display_name)
        return Response.json({ ok: true, reply, visitor })
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 500 })
      }
    }

    if (path === "/api/chat/history" && req.method === "GET") {
      const visitorId = url.searchParams.get("visitor_id")
      if (!visitorId) return Response.json({ ok: false, error: "visitor_id required" }, { status: 400 })
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50")))
      const messages = conversation.getHistory(visitorId, limit)
      const visitor  = conversation.getOrCreateVisitor(visitorId)
      return Response.json({ ok: true, messages, visitor })
    }

    if (path === "/api/visitor" && req.method === "POST") {
      try {
        const body = await req.json() as { visitor_id: string; display_name?: string }
        if (!body.visitor_id) return Response.json({ ok: false, error: "visitor_id required" }, { status: 400 })
        const visitor = conversation.getOrCreateVisitor(body.visitor_id, body.display_name)
        return Response.json({ ok: true, visitor })
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 400 })
      }
    }

    if (path === "/api/visitor/delete" && req.method === "POST") {
      try {
        const body = await req.json() as { visitor_id: string }
        if (!body.visitor_id) return Response.json({ ok: false, error: "visitor_id required" }, { status: 400 })
        conversation.deleteVisitorData(body.visitor_id)
        return Response.json({ ok: true })
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 400 })
      }
    }

    if (path === "/api/status" && req.method === "GET") {
      return Response.json({
        ok: true,
        narrator_enabled: narrator.enabled,
        narrator_local_available: narrator.localAvailable,
        conversation_available: conversation.available,
        world_day: worldEngine.state.environment.dayNumber,
        world_time: worldEngine.state.environment.timeOfDay.toFixed(1),
        creature_name: worldEngine.state.creature.name,
      })
    }

    // ── Static files ────────────────────────────────────────────────
    const staticResp = staticFile(path)
    if (staticResp) return staticResp

    return new Response("Not found", { status: 404 })
  }
}
