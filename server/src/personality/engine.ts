/**
 * PersonalityEngine — 1 Hz loop that fires trait-based StimulusPackets.
 * Proximity to relevant entities amplifies the trait's effect.
 */
import { SEED_TRAITS } from "./traits"
import type { Trait } from "./traits"
import type { StimulationNetwork } from "../simulation/network"
import type { WorldEngine } from "../world/engine"
import { bus, EventType, makeEvent } from "../world/events"
import type { Database } from "bun:sqlite"

const HZ = 1

export class PersonalityEngine {
  private _traits: Map<string, Trait>
  private _stimulation: StimulationNetwork
  private _worldEngine: WorldEngine
  private _db: Database
  private _intervalId: ReturnType<typeof setInterval> | null = null

  constructor(stimulation: StimulationNetwork, worldEngine: WorldEngine, db: Database) {
    this._stimulation = stimulation
    this._worldEngine = worldEngine
    this._db = db
    this._traits = new Map()
    this._initDb()
    for (const t of SEED_TRAITS) this._traits.set(t.id, t)
  }

  start() {
    this._intervalId = setInterval(() => this._tick(), 1000 / HZ)
    console.log("[Personality] started at 1 Hz")
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId)
  }

  getTraitsSummary(): object[] {
    return Array.from(this._traits.values()).map(t => ({
      name: t.name,
      description: t.description,
      channel: t.channel,
      baseBias: t.baseBias,
      triggerKeywords: t.triggerKeywords,
    }))
  }

  private _tick() {
    const state = this._worldEngine.state
    const c = state.creature
    const entities = Array.from(state.entities.values()).filter(e => e.alive)

    for (const trait of this._traits.values()) {
      let bias = trait.baseBias

      // Check proximity to relevant entities
      for (const entity of entities) {
        const dist = c.position.distanceTo(entity.position)
        if (dist <= trait.proximityRadius) {
          const nameMatch = trait.triggerKeywords.some(kw =>
            entity.name.toLowerCase().includes(kw) ||
            entity.type.toLowerCase().includes(kw)
          )
          if (nameMatch) {
            const proximity = 1 - dist / trait.proximityRadius
            bias += trait.proximityBias * proximity
          }
        }
      }

      if (bias > 0.001) {
        const packet = { [trait.channel]: bias }
        this._stimulation.inject(packet as any)
      }
    }

    const ev = makeEvent("personality_engine", EventType.PERSONALITY_FIRED, {
      entityId: c.id,
      payload: { traits_active: this._traits.size },
    })
    bus.publish(ev)
  }

  private _initDb() {
    this._db.run(`
      CREATE TABLE IF NOT EXISTS personality_traits (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        channel TEXT NOT NULL,
        base_bias REAL NOT NULL,
        proximity_bias REAL NOT NULL,
        proximity_radius REAL NOT NULL,
        trigger_keywords TEXT NOT NULL,
        created_at REAL NOT NULL
      )
    `)
    // Upsert seed traits
    for (const t of SEED_TRAITS) {
      this._db.run(`
        INSERT OR IGNORE INTO personality_traits
        VALUES (?,?,?,?,?,?,?,?,?)
      `, [t.id, t.name, t.description, t.channel, t.baseBias,
          t.proximityBias, t.proximityRadius, JSON.stringify(t.triggerKeywords), t.createdAt])
    }
  }
}
