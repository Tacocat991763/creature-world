/**
 * WebSocket broadcaster — sends world_state frames at 10 Hz to all connected clients.
 */
import type { ServerWebSocket } from "bun"
import type { WorldEngine } from "../world/engine"
import type { StimulationNetwork } from "../simulation/network"
import type { MovementModel } from "../simulation/movement"
import type { NarratorAgent } from "../cognition/narrator"
import { bus } from "../world/events"

const HZ = 10

// Rule-based inner monologue — pools indexed by drive + dominant emotion
const THOUGHTS: Record<string, string[]> = {
  rest_fatigue:      ["so tired... just a moment", "rest feels good right now", "the light is soft today"],
  rest_reward:       ["this is nice", "content to just be here", "peaceful"],
  rest_default:      ["taking a moment", "nothing pulling me anywhere", "stillness"],
  flee_threat:       ["something's wrong here", "not safe — moving away", "that doesn't feel right"],
  flee_distress:     ["away from whatever that is", "this direction feels better", "uncomfortable there"],
  seek_novel_curiosity: ["what is that?", "something I haven't seen before...", "need to get closer"],
  seek_novel_arousal:   ["interesting...", "can't help but look", "drawn to it"],
  seek_familiar_attachment: ["I know that place", "going back", "feels like somewhere I've been"],
  seek_familiar_familiarity: ["that's known to me", "returning...", "familiar pull"],
  wander_curiosity:  ["I wonder what's out here", "just exploring", "see where this goes"],
  wander_arousal:    ["restless today", "need to move", "can't stay still"],
  wander_fatigue:    ["moving slowly", "dragging a little", "one step at a time"],
  wander_default:    ["no particular destination", "drifting", "open to whatever comes"],
}

function pickThought(drive: string, stim: Record<string, number>): string {
  // Find dominant emotion above threshold
  const dominant = ["curiosity","attachment","reward","distress","threat","fatigue","arousal","familiarity"]
    .filter(k => (stim[k] ?? 0) > 0.55)
    .sort((a, b) => (stim[b] ?? 0) - (stim[a] ?? 0))[0]

  const key = dominant ? `${drive}_${dominant}` : `${drive}_default`
  const pool = THOUGHTS[key] ?? THOUGHTS[`${drive}_default`] ?? THOUGHTS["wander_default"]
  const idx = Math.floor(Date.now() / 12_000) % pool.length  // rotate every 12s
  return pool[idx]
}

const DRIVE_NARRATION: Record<string, string> = {
  rest:           "Luma is resting quietly",
  flee:           "Luma senses something unsettling and moves away",
  seek_novel:     "Something new has caught Luma's attention",
  seek_familiar:  "Luma is heading somewhere remembered",
  wander:         "Luma drifts, following the feeling of the moment",
}

export interface WsData { id: string }

export class WsBroadcaster {
  private _sockets = new Set<ServerWebSocket<WsData>>()
  private _worldEngine: WorldEngine
  private _stimulation: StimulationNetwork
  private _movement: MovementModel
  private _narrator: NarratorAgent
  private _intervalId: ReturnType<typeof setInterval> | null = null

  constructor(
    worldEngine: WorldEngine,
    stimulation: StimulationNetwork,
    movement: MovementModel,
    narrator: NarratorAgent,
  ) {
    this._worldEngine = worldEngine
    this._stimulation = stimulation
    this._movement    = movement
    this._narrator    = narrator

    // Relay events to all connected clients
    bus.subscribeAll(ev => {
      this._broadcast({ type: "event", data: ev })
    })
  }

  start() {
    this._intervalId = setInterval(() => this._tick(), 1000 / HZ)
    console.log("[WS] broadcaster started at 10 Hz")
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId)
  }

  onOpen(ws: ServerWebSocket<WsData>) {
    this._sockets.add(ws)
    // Send initial state immediately
    ws.send(JSON.stringify({ type: "world_state", ...this._buildFrame() }))
  }

  onClose(ws: ServerWebSocket<WsData>) {
    this._sockets.delete(ws)
  }

  onMessage(ws: ServerWebSocket<WsData>, msg: string | Buffer) {
    try {
      const data = JSON.parse(msg.toString())
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }))
      }
    } catch {}
  }

  private _tick() {
    if (this._sockets.size === 0) return
    this._broadcast({ type: "world_state", ...this._buildFrame() })
  }

  private _broadcast(msg: unknown) {
    const text = JSON.stringify(msg)
    for (const ws of this._sockets) {
      try { ws.send(text) } catch {}
    }
  }

  private _buildFrame() {
    const state = this._worldEngine.state
    const c = state.creature
    const env = state.environment
    const stim = this._stimulation.getOutputs()
    const drive = this._movement.getDrive()
    const stimObj = stim as unknown as Record<string, number>
    const narration = DRIVE_NARRATION[drive] || "Luma exists"
    const thought   = this._narrator.lastThought  || pickThought(drive, stimObj)
    const speech    = this._narrator.lastSpeech   || null

    return {
      sim_time: state.simTime,
      version: state.version,
      drive,
      narration,
      thought,
      speech,
      environment: {
        time_of_day: env.periodName,
        hour: env.timeOfDay,
        ambient_light: env.ambientLight,
        weather: "clear",
        day: env.dayNumber,
      },
      creature: {
        id: c.id,
        name: c.name,
        x: c.position.x,
        y: c.position.y,
        vx: c.velocity.x,
        vy: c.velocity.y,
        orientation: c.orientation,
        energy: c.energy,
      },
      entities: Array.from(state.entities.values())
        .filter(e => e.alive)
        .map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          x: e.position.x,
          y: e.position.y,
          radius: e.radius,
          color: "#888888",
          shape: "circle",
          interactable: e.components.interactable,
        })),
      stimulation: stim,
    }
  }
}
