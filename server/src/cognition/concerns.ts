/**
 * ConcernsStore — persistent narrative threads and desires.
 *
 * The narrator LLM deposits desires/concerns here instead of injecting them
 * directly into the CTRNN. ConcernMediator (separate) applies a capped,
 * bounded influence from active concerns back into stimulation on its own
 * schedule — the LLM cannot force arbitrary network states.
 */
import { Database } from "bun:sqlite"
import type { ChannelName } from "../types"

export type ConcernType =
  | "desire"    // something Luma wants to do
  | "question"  // something Luma is wondering about
  | "worry"     // something causing unease
  | "want"      // a persistent preference
  | "project"   // ongoing work
  | "promise"   // something Luma committed to

export type ConcernStatus = "open" | "resolved" | "faded"

export interface Concern {
  id: string
  content: string           // natural-language description
  type: ConcernType
  priority: number          // 0–1, decays over time
  channel_hint: ChannelName | null  // which channel this relates to
  delta_hint: number | null // direction of influence (-1 to 1)
  origin: string            // "narrator", "event", "visitor:<id>"
  created_at: number
  updated_at: number
  status: ConcernStatus
  supporting_memory_ids: string[]
}

// Max influence the mediator can apply per channel per mediation tick (bounded)
export const MAX_CONCERN_DELTA = 0.08

export class ConcernsStore {
  private _db: Database

  constructor(db: Database) {
    this._db = db
    this._initDb()
  }

  add(params: {
    content: string
    type: ConcernType
    priority?: number
    channel_hint?: ChannelName | null
    delta_hint?: number | null
    origin: string
  }): Concern {
    const id = `concern_${Math.random().toString(36).slice(2, 12)}`
    const now = Date.now() / 1000
    const c: Concern = {
      id,
      content: params.content,
      type: params.type,
      priority: params.priority ?? 0.5,
      channel_hint: params.channel_hint ?? null,
      delta_hint: params.delta_hint ?? null,
      origin: params.origin,
      created_at: now,
      updated_at: now,
      status: "open",
      supporting_memory_ids: [],
    }
    this._db.run(
      `INSERT INTO concerns
       (id,content,type,priority,channel_hint,delta_hint,origin,created_at,updated_at,status,supporting_memory_ids)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        c.id, c.content, c.type, c.priority,
        c.channel_hint, c.delta_hint, c.origin,
        c.created_at, c.updated_at, c.status,
        JSON.stringify(c.supporting_memory_ids),
      ]
    )
    return c
  }

  getOpen(): Concern[] {
    return this._db.query<any, []>(
      "SELECT * FROM concerns WHERE status='open' ORDER BY priority DESC, created_at DESC"
    ).all().map(this._rowToObj)
  }

  decay() {
    // Fade priorities over time; mark very weak concerns as faded
    this._db.run("UPDATE concerns SET priority = priority * 0.97 WHERE status='open'")
    this._db.run("UPDATE concerns SET status='faded', updated_at=? WHERE status='open' AND priority < 0.05",
      [Date.now() / 1000])
  }

  resolve(id: string) {
    this._db.run("UPDATE concerns SET status='resolved', updated_at=? WHERE id=?",
      [Date.now() / 1000, id])
  }

  summaryForLlm(limit = 5): string[] {
    return this.getOpen().slice(0, limit).map(c =>
      `[${c.type}] ${c.content} (priority ${c.priority.toFixed(2)})`
    )
  }

  private _rowToObj(r: any): Concern {
    return {
      id: r.id,
      content: r.content,
      type: r.type as ConcernType,
      priority: r.priority,
      channel_hint: r.channel_hint ?? null,
      delta_hint: r.delta_hint ?? null,
      origin: r.origin,
      created_at: r.created_at,
      updated_at: r.updated_at,
      status: r.status as ConcernStatus,
      supporting_memory_ids: JSON.parse(r.supporting_memory_ids ?? "[]"),
    }
  }

  private _initDb() {
    this._db.run(`
      CREATE TABLE IF NOT EXISTS concerns (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        priority REAL NOT NULL DEFAULT 0.5,
        channel_hint TEXT,
        delta_hint REAL,
        origin TEXT NOT NULL,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        supporting_memory_ids TEXT NOT NULL DEFAULT '[]'
      )
    `)
    this._db.run("CREATE INDEX IF NOT EXISTS idx_concerns_status ON concerns(status, priority DESC)")
  }
}

/**
 * ConcernMediator — applies bounded, capped stimulation from active concerns.
 * Runs at 0.1 Hz (every 10 s). The LLM cannot exceed MAX_CONCERN_DELTA per
 * channel per tick, regardless of how many concerns exist.
 */
import type { StimulationNetwork } from "../simulation/network"

const MEDIATOR_HZ = 0.1

export class ConcernMediator {
  private _concerns: ConcernsStore
  private _stimulation: StimulationNetwork
  private _intervalId: ReturnType<typeof setInterval> | null = null

  constructor(concerns: ConcernsStore, stimulation: StimulationNetwork) {
    this._concerns = concerns
    this._stimulation = stimulation
  }

  start() {
    this._intervalId = setInterval(() => this._tick(), 1000 / MEDIATOR_HZ)
    console.log("[ConcernMediator] started at 0.1 Hz")
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId)
  }

  private _tick() {
    const open = this._concerns.getOpen()
    if (open.length === 0) return

    // Accumulate per-channel influence; cap at MAX_CONCERN_DELTA per channel
    const channelInfluence: Record<string, number> = {}
    for (const c of open) {
      if (!c.channel_hint || c.delta_hint === null) continue
      const existing = channelInfluence[c.channel_hint] ?? 0
      channelInfluence[c.channel_hint] = existing + c.delta_hint * c.priority
    }

    for (const [ch, raw] of Object.entries(channelInfluence)) {
      const clamped = Math.max(-MAX_CONCERN_DELTA, Math.min(MAX_CONCERN_DELTA, raw))
      if (Math.abs(clamped) > 0.001) {
        this._stimulation.inject({ [ch]: clamped } as any)
      }
    }

    // Decay concerns periodically
    this._concerns.decay()
  }
}
