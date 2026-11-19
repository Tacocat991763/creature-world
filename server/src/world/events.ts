import { randomUUIDv7 } from "bun"

export interface GameEvent {
  id: string
  timestamp: number
  source: string
  type: string
  entityId: string
  targetId: string
  payload: Record<string, unknown>
  result: string
}

export function makeEvent(
  source: string,
  type: string,
  opts: Partial<Omit<GameEvent, "id" | "timestamp" | "source" | "type">> = {}
): GameEvent {
  return {
    id: randomUUIDv7().slice(0, 12),
    timestamp: Date.now() / 1000,
    source,
    type,
    entityId: opts.entityId ?? "",
    targetId: opts.targetId ?? "",
    payload: opts.payload ?? {},
    result: opts.result ?? "success",
  }
}

export const EventType = {
  MOVEMENT_STARTED:    "movement_started",
  MOVEMENT_COMPLETED:  "movement_completed",
  MOVEMENT_BLOCKED:    "movement_blocked",
  OBJECT_APPROACHED:   "object_approached",
  OBJECT_INTERACTED:   "object_interacted",
  OBJECT_ADDED:        "object_added",
  OBJECT_REMOVED:      "object_removed",
  CREATURE_RESTED:     "creature_rested",
  PERSON_INTERACTED:   "person_interacted",
  PERSON_GAVE_GIFT:    "person_gave_gift",
  OBSTACLE_ENCOUNTERED:"obstacle_encountered",
  DAY_STARTED:         "day_started",
  NIGHT_STARTED:       "night_started",
  TIME_ADVANCED:       "time_advanced",
  CREATION_REQUESTED:  "creation_requested",
  WORLD_EXTENDED:      "world_extended",
  MEMORY_FORMED:       "memory_formed",
  LLM_INTERPRETED:     "llm_interpreted",
  USER_INTERACTED:     "user_interacted",
  STIMULATION_SPIKE:   "stimulation_spike",
  PERSONALITY_FIRED:   "personality_fired",
  GOAL_REGISTERED:     "goal_registered",
  GOAL_PROGRESSED:     "goal_progressed",
  CREDITS_EARNED:      "credits_earned",
  PLAN_GENERATED:      "plan_generated",
  NARRATION_PRODUCED:  "narration_produced",
} as const

export type EventTypeName = typeof EventType[keyof typeof EventType]

type Handler = (event: GameEvent) => void | Promise<void>

export class EventBus {
  private _handlers = new Map<string, Handler[]>()
  private _wildcard: Handler[] = []
  private _history: GameEvent[] = []
  private _maxHistory = 500

  subscribe(type: string, handler: Handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, [])
    this._handlers.get(type)!.push(handler)
  }

  subscribeAll(handler: Handler) {
    this._wildcard.push(handler)
  }

  async publish(event: GameEvent) {
    if (this._history.length >= this._maxHistory) this._history.shift()
    this._history.push(event)
    const handlers = [...(this._handlers.get(event.type) ?? []), ...this._wildcard]
    for (const h of handlers) {
      try { await h(event) } catch (e) { console.error(`[EventBus] handler error for ${event.type}:`, e) }
    }
  }

  recent(n = 20): GameEvent[] {
    return this._history.slice(-n)
  }

  since(timestamp: number): GameEvent[] {
    return this._history.filter(e => e.timestamp > timestamp)
  }
}

export const bus = new EventBus()
