/**
 * MovementModel — 8 Hz priority-chain drive selection.
 *
 * Priority: rest (fatigue>0.75) > flee (threat>0.5) > seek_novel (curiosity>0.4)
 *           > seek_familiar (attachment>0.5) > wander
 */
import { Vec2 } from "../types"
import { wander, seek, flee, restInPlace, findNovelTarget, findFamiliarTarget, steerToward } from "./behaviors"
import type { StimulationNetwork } from "./network"
import type { WorldEngine } from "../world/engine"
import { bus, EventType, makeEvent } from "../world/events"
import { persistEvent } from "../world/persistence"
import type { Database } from "bun:sqlite"

const HZ = 8
const DT = 1 / HZ
const CURIOSITY_THRESHOLD = 0.4
const THREAT_THRESHOLD    = 0.5
const FATIGUE_THRESHOLD   = 0.75
const ATTACHMENT_THRESHOLD = 0.5
const APPROACH_DISTANCE   = 3.5
const DECISION_INTERVAL   = 1.5   // seconds

export class MovementModel {
  private _engine: WorldEngine
  private _stimulation: StimulationNetwork
  private _db: Database
  private _intervalId: ReturnType<typeof setInterval> | null = null

  private _visitedIds = new Set<string>()
  private _currentTargetId: string | null = null
  private _currentTargetPos: Vec2 | null = null
  private _drive = "wander"
  private _lastDecisionSimTime = 0
  private _restingUntil = 0

  constructor(engine: WorldEngine, stimulation: StimulationNetwork, db: Database) {
    this._engine = engine
    this._stimulation = stimulation
    this._db = db
  }

  start() {
    this._intervalId = setInterval(() => this._tick(), 1000 / HZ)
    console.log("[Movement] started at 8 Hz")
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId)
  }

  getDrive(): string { return this._drive }

  private _tick() {
    const state = this._engine.state
    const creature = state.creature
    const stim = this._stimulation.getOutputs()
    const now = state.simTime

    if (now - this._lastDecisionSimTime >= DECISION_INTERVAL) {
      this._lastDecisionSimTime = now
      this._decideDrive(stim, state)
    }

    const result = this._executeDrive(stim, creature.orientation)
    const baseSpeed = creature.speed * creature.energy

    creature.velocity = result.dir.scale(baseSpeed * result.speed)

    if (result.dir.length() > 0.01) {
      const target = creature.position.add(result.dir)
      creature.orientation = steerToward(creature.orientation, target, creature.position, 5.0, DT)
    }

    // Check if reached target
    if (this._currentTargetPos && this._currentTargetId) {
      const dist = creature.position.distanceTo(this._currentTargetPos)
      if (dist < APPROACH_DISTANCE) {
        this._onReachedTarget(this._currentTargetId)
      }
    }
  }

  private _decideDrive(stim: ReturnType<StimulationNetwork["getOutputs"]>, state: WorldEngine["state"]) {
    const creature = state.creature
    const entities = Array.from(state.entities.values())

    if (stim.fatigue > FATIGUE_THRESHOLD) {
      this._drive = "rest"
      this._restingUntil = Date.now() + 2000 + Math.random() * 3000
      this._currentTargetPos = null
      this._currentTargetId = null
      return
    }

    if (stim.threat > THREAT_THRESHOLD) {
      this._drive = "flee"
      const threats = entities.filter(e => e.alive && e.components.collidable)
      if (threats.length) {
        const nearest = threats.reduce((b, e) =>
          creature.position.distanceTo(e.position) < creature.position.distanceTo(b.position) ? e : b
        )
        this._currentTargetPos = nearest.position
        this._currentTargetId = nearest.id
      }
      return
    }

    if (stim.curiosity > CURIOSITY_THRESHOLD) {
      const target = findNovelTarget(creature.position, entities, this._visitedIds)
      if (target) {
        this._drive = "seek_novel"
        this._currentTargetPos = target.position
        this._currentTargetId = target.id
        return
      }
    }

    if (stim.attachment > ATTACHMENT_THRESHOLD) {
      const target = findFamiliarTarget(creature.position, entities, this._visitedIds)
      if (target) {
        this._drive = "seek_familiar"
        this._currentTargetPos = target.position
        this._currentTargetId = target.id
        return
      }
    }

    this._drive = "wander"
    this._currentTargetPos = null
    this._currentTargetId = null
  }

  private _executeDrive(stim: any, orientation: number) {
    const creature = this._engine.state.creature

    if (this._drive === "rest" && Date.now() < this._restingUntil)
      return restInPlace()

    if (this._drive === "flee" && this._currentTargetPos)
      return flee(creature.position, this._currentTargetPos)

    if ((this._drive === "seek_novel" || this._drive === "seek_familiar") && this._currentTargetPos) {
      const result = seek(creature.position, this._currentTargetPos)
      if (result) return result
    }

    return wander(orientation)
  }

  private _onReachedTarget(targetId: string) {
    if (this._visitedIds.has(targetId)) return
    this._visitedIds.add(targetId)
    this._currentTargetId = null
    this._currentTargetPos = null
    this._drive = "wander"
    this._lastDecisionSimTime = 0

    const entity = this._engine.state.entities.get(targetId)
    const ev = makeEvent("movement_model", EventType.OBJECT_APPROACHED, {
      entityId: this._engine.state.creature.id,
      targetId,
      payload: {
        object_type: entity?.type ?? "unknown",
        position: this._engine.state.creature.position.toJSON(),
      },
    })
    bus.publish(ev)
    persistEvent(this._db, ev)
  }
}
