/**
 * StimulationNetwork — wraps the CTRNN and processes incoming stimulus packets.
 *
 * Runs at STIMULATION_HZ (15 Hz). Accumulates packets in a queue between ticks,
 * sums them on each tick, then runs a CTRNN Euler step.
 *
 * inject(packet)   — called by personality engine, movement model, event handlers
 * getOutputs()     — returns current sigmoid outputs (0–1 mapped from [-1,1] range)
 * getSnapshot()    — returns raw activations for memory/LLM context
 */

import { ctrnnStep, ambientStimulus } from "./ctrnn"
import { packetToArray } from "./stimuli"
import type { StimulusPacket } from "./stimuli"
import type { StimSnapshot } from "../types"
import { CHANNEL_NAMES } from "../types"
import type { Database } from "bun:sqlite"

const N = 8
const HZ = 15
const DT = 1 / HZ
const SAVE_INTERVAL_MS = 30_000
// When restarting after offline, cap catch-up to this many simulated seconds
// to avoid a huge burst of fatigue/etc from missed time.
const MAX_OFFLINE_CATCHUP_S = 300

export class StimulationNetwork {
  private _x: number[] = Array(N).fill(0)       // CTRNN activations [-1, 1]
  private _pending: number[] = Array(N).fill(0)
  private _outputs: StimSnapshot = {
    reward: 0.1, distress: 0, curiosity: 0.3, attachment: 0.1,
    arousal: 0.3, fatigue: 0.1, threat: 0, familiarity: 0.2,
  }
  private _intervalId: ReturnType<typeof setInterval> | null = null
  private _lastSaveMs = 0
  private _getTimeOfDay: () => number
  private _db: Database | null

  constructor(getTimeOfDay: () => number, db?: Database) {
    this._getTimeOfDay = getTimeOfDay
    this._db = db ?? null
    if (db) {
      this._initDb(db)
      this._loadState(db)
    }
  }

  start() {
    this._intervalId = setInterval(() => this._tick(), 1000 / HZ)
    console.log("[Stimulation] started at 15 Hz")
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId)
    if (this._db) this._saveState(this._db)
  }

  inject(packet: StimulusPacket) {
    const arr = Array.from(packetToArray(packet))
    for (let i = 0; i < N; i++) this._pending[i] += arr[i]
  }

  getOutputs(): StimSnapshot {
    return { ...this._outputs }
  }

  getSnapshot(): number[] {
    return [...this._x]
  }

  private _tick() {
    // Add ambient stimulus
    const ambient = ambientStimulus(this._getTimeOfDay())

    // Build total stimulus = pending + ambient
    const stimuli = Array.from({ length: N }, (_, i) => this._pending[i] + ambient[i])
    const nextX = ctrnnStep(
      new Float64Array(this._x),
      new Float64Array(stimuli),
      DT
    )
    this._x = Array.from(nextX)

    // Reset pending
    this._pending = Array(N).fill(0)

    // Map [-1,1] → sigmoid-like [0,1] outputs for easy reading
    const snap: Partial<StimSnapshot> = {}
    for (let i = 0; i < N; i++) {
      snap[CHANNEL_NAMES[i] as keyof StimSnapshot] = (this._x[i] + 1) / 2
    }
    this._outputs = snap as StimSnapshot

    // Periodic persistence
    if (this._db && Date.now() - this._lastSaveMs > SAVE_INTERVAL_MS) {
      this._saveState(this._db)
      this._lastSaveMs = Date.now()
    }
  }

  private _initDb(db: Database) {
    db.run(`
      CREATE TABLE IF NOT EXISTS stimulation_state (
        id TEXT PRIMARY KEY,
        activations TEXT NOT NULL,
        saved_at REAL NOT NULL
      )
    `)
  }

  private _saveState(db: Database) {
    db.run(
      "INSERT OR REPLACE INTO stimulation_state (id, activations, saved_at) VALUES ('main', ?, ?)",
      [JSON.stringify(this._x), Date.now() / 1000]
    )
  }

  private _loadState(db: Database) {
    const row = db.query<{ activations: string; saved_at: number }, []>(
      "SELECT activations, saved_at FROM stimulation_state WHERE id='main'"
    ).get()
    if (!row) return

    const offline = Math.min(Date.now() / 1000 - row.saved_at, MAX_OFFLINE_CATCHUP_S)
    this._x = JSON.parse(row.activations)

    // Apply brief ambient catch-up for time offline (capped to avoid burst)
    const steps = Math.floor(offline * HZ * 0.1) // 10% of real steps, max 300s worth
    const ambientCatchup = ambientStimulus(this._getTimeOfDay())
    for (let i = 0; i < steps; i++) {
      this._x = Array.from(ctrnnStep(new Float64Array(this._x), new Float64Array(ambientCatchup), DT))
    }

    const snap: Partial<StimSnapshot> = {}
    for (let i = 0; i < N; i++) {
      snap[CHANNEL_NAMES[i] as keyof StimSnapshot] = (this._x[i] + 1) / 2
    }
    this._outputs = snap as StimSnapshot
    console.log(`[Stimulation] state restored (${offline.toFixed(0)}s offline, ${steps} catch-up steps)`)
  }
}
