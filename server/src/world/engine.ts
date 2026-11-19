/**
 * WorldEngine — authoritative physics and game-time simulation.
 * Runs at 25 Hz. Integrates creature position from velocity.
 */
import { Vec2 } from "../types"
import { buildDefaultWorld, makeEntity, serializeWorld } from "./state"
import type { WorldState, Entity } from "./state"
import { bus, EventType, makeEvent } from "./events"
import { initDb, loadWorld, saveWorld, persistEvent } from "./persistence"
import type { Database } from "bun:sqlite"

const HZ = 25
const DT = 1 / HZ
const WORLD_W = 100
const WORLD_H = 100
const SAVE_INTERVAL_MS = 10_000
const GAME_HOURS_PER_REAL_SECOND = 1 / 60   // 1 real minute = 1 game hour

export class WorldEngine {
  state: WorldState
  private _db: Database
  private _intervalId: ReturnType<typeof setInterval> | null = null
  private _lastSaveMs = 0

  constructor(db: Database) {
    this._db = db
    initDb(db)
    this.state = loadWorld(db)
    console.log(`[Engine] World loaded. Creature: ${this.state.creature.name} at (${this.state.creature.position.x.toFixed(1)}, ${this.state.creature.position.y.toFixed(1)})`)
  }

  start() {
    this._intervalId = setInterval(() => this._tick(), 1000 / HZ)
    console.log("[Engine] started at 25 Hz")
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId)
    saveWorld(this._db, this.state)
  }

  private _tick() {
    this.state.simTime += DT
    this.state.version++
    this.state.wallTime = Date.now() / 1000
    this._advanceTime()
    this._integratePosition()
    if (Date.now() - this._lastSaveMs > SAVE_INTERVAL_MS) {
      saveWorld(this._db, this.state)
      this._lastSaveMs = Date.now()
    }
  }

  private _integratePosition() {
    const c = this.state.creature
    if (c.velocity.length() < 1e-6) return

    let nx = Math.max(c.radius, Math.min(WORLD_W - c.radius, c.position.x + c.velocity.x * DT))
    let ny = Math.max(c.radius, Math.min(WORLD_H - c.radius, c.position.y + c.velocity.y * DT))
    const newPos = new Vec2(nx, ny)

    let blocked = false
    let blockingId = ""
    for (const [eid, entity] of this.state.entities) {
      if (!entity.alive || !entity.components.collidable) continue
      const dist = newPos.distanceTo(entity.position)
      const minDist = c.radius + entity.radius
      if (dist < minDist) {
        blocked = true
        blockingId = eid
        if (dist > 1e-9) {
          const nx2 = entity.position.x + ((newPos.x - entity.position.x) / dist) * minDist
          const ny2 = entity.position.y + ((newPos.y - entity.position.y) / dist) * minDist
          nx = nx2; ny = ny2
        }
        break
      }
    }

    c.position = new Vec2(nx, ny)
    if (blocked) {
      c.velocity = new Vec2(0, 0)
      const ev = makeEvent("world_engine", EventType.OBSTACLE_ENCOUNTERED, {
        entityId: c.id, targetId: blockingId,
        payload: { position: c.position.toJSON() },
      })
      bus.publish(ev)
      persistEvent(this._db, ev)
    }
  }

  private _advanceTime() {
    const env = this.state.environment
    const prevHour = Math.floor(env.timeOfDay)
    env.timeOfDay += GAME_HOURS_PER_REAL_SECOND * DT
    if (env.timeOfDay >= 24) { env.timeOfDay -= 24; env.dayNumber++ }

    const h = env.timeOfDay
    if (h >= 6 && h <= 18) {
      env.ambientLight = h < 8 ? Math.min(1, (h - 5) / 3) : (h < 17 ? 1 : Math.max(0.1, (19 - h) / 2))
    } else {
      env.ambientLight = 0.1
    }
    env.periodName = h >= 6 && h < 9 ? "dawn" : h < 17 ? "day" : h < 20 ? "dusk" : "night"

    const newHour = Math.floor(env.timeOfDay)
    if (prevHour !== newHour) {
      if (newHour === 20) bus.publish(makeEvent("world_engine", EventType.NIGHT_STARTED, { payload: { hour: newHour } }))
      if (newHour === 6)  bus.publish(makeEvent("world_engine", EventType.DAY_STARTED,   { payload: { hour: newHour } }))
    }
  }

  addEntity(entity: Entity) {
    this.state.entities.set(entity.id, entity)
    const ev = makeEvent("world_editor", EventType.OBJECT_ADDED, {
      entityId: entity.id,
      payload: { type: entity.type, position: entity.position.toJSON() },
    })
    bus.publish(ev)
    persistEvent(this._db, ev)
  }

  applyUserInteraction(action: string, payload: Record<string, unknown>) {
    const ev = makeEvent("user", EventType.USER_INTERACTED, {
      payload: { action, ...payload },
    })
    bus.publish(ev)
    persistEvent(this._db, ev)
  }
}
