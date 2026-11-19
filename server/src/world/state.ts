import { Vec2 } from "../types"
import { randomUUIDv7 } from "bun"

export interface ComponentSet {
  collidable: boolean
  interactable: boolean
  emitsLight: boolean
  consumable: boolean
}

export function defaultComponents(): ComponentSet {
  return { collidable: false, interactable: false, emitsLight: false, consumable: false }
}

export interface Entity {
  id: string
  type: string
  name: string
  position: Vec2
  radius: number
  alive: boolean
  components: ComponentSet
  properties: Record<string, unknown>
}

export function makeEntity(
  type: string,
  name: string,
  x: number,
  y: number,
  opts: Partial<Omit<Entity, "id" | "type" | "name" | "position">> = {}
): Entity {
  return {
    id: randomUUIDv7().slice(0, 12),
    type,
    name,
    position: new Vec2(x, y),
    radius: opts.radius ?? 1.5,
    alive: opts.alive ?? true,
    components: opts.components ?? defaultComponents(),
    properties: opts.properties ?? {},
  }
}

export interface Creature {
  id: string
  name: string
  position: Vec2
  velocity: Vec2
  orientation: number   // radians, 0=+x
  speed: number         // base speed units/sec
  energy: number        // 0–1
  radius: number
}

export interface EnvironmentState {
  timeOfDay: number      // 0–24 (game hours)
  dayNumber: number
  ambientLight: number   // 0–1
  weather: string
  periodName: string     // "dawn", "day", "dusk", "night"
}

function periodName(h: number): string {
  if (h >= 6 && h < 9)   return "dawn"
  if (h >= 9 && h < 17)  return "day"
  if (h >= 17 && h < 20) return "dusk"
  return "night"
}

export interface WorldState {
  creature: Creature
  entities: Map<string, Entity>
  environment: EnvironmentState
  simTime: number
  version: number
  wallTime: number
}

export function buildDefaultWorld(): WorldState {
  const env: EnvironmentState = {
    timeOfDay: 9.0,
    dayNumber: 1,
    ambientLight: 1.0,
    weather: "clear",
    periodName: "day",
  }

  const creature: Creature = {
    id: "luma",
    name: "Luma",
    position: new Vec2(50, 50),
    velocity: new Vec2(0, 0),
    orientation: 0,
    speed: 6.0,
    energy: 1.0,
    radius: 0.8,
  }

  const entities = new Map<string, Entity>()

  // Seed world objects
  const seeds: Array<[string, string, number, number, Partial<Entity>]> = [
    ["flower", "Red Flower",   30, 35, { radius: 0.8, components: { collidable: false, interactable: true, emitsLight: false, consumable: true }, properties: { visual_color: "#f472b6", visual_shape: "circle" } }],
    ["flower", "Blue Flower",  60, 25, { radius: 0.8, components: { collidable: false, interactable: true, emitsLight: false, consumable: true }, properties: { visual_color: "#818cf8", visual_shape: "circle" } }],
    ["rock",   "Big Rock",     45, 65, { radius: 2.5, components: { collidable: true,  interactable: false, emitsLight: false, consumable: false }, properties: { visual_color: "#6b7280", visual_shape: "circle" } }],
    ["food",   "Berry Bush",   75, 45, { radius: 1.5, components: { collidable: false, interactable: true, emitsLight: false, consumable: true }, properties: { visual_color: "#4ade80", visual_shape: "circle" } }],
    ["food",   "Mushroom Patch",20, 70, { radius: 1.0, components: { collidable: false, interactable: true, emitsLight: false, consumable: true }, properties: { visual_color: "#fb923c", visual_shape: "circle" } }],
    ["train",  "Old Train Car", 80, 20, { radius: 3.0, components: { collidable: true, interactable: true,  emitsLight: false, consumable: false }, properties: { visual_color: "#b45309", visual_shape: "circle" } }],
    ["lamp",   "Street Lamp",   55, 30, { radius: 0.6, components: { collidable: false, interactable: false, emitsLight: true, consumable: false }, properties: { visual_color: "#fde68a", visual_shape: "circle" } }],
  ]

  for (const [type, name, x, y, opts] of seeds) {
    const e = makeEntity(type, name, x, y, opts)
    entities.set(e.id, e)
  }

  return { creature, entities, environment: env, simTime: 0, version: 0, wallTime: Date.now() / 1000 }
}

/** Serialise WorldState to a plain JSON-safe object for SQLite storage. */
export function serializeWorld(w: WorldState): object {
  return {
    creature: { ...w.creature, position: w.creature.position.toJSON(), velocity: w.creature.velocity.toJSON() },
    entities: Array.from(w.entities.entries()).map(([id, e]) => ({
      id, type: e.type, name: e.name,
      position: e.position.toJSON(),
      radius: e.radius, alive: e.alive,
      components: e.components, properties: e.properties,
    })),
    environment: w.environment,
    simTime: w.simTime, version: w.version, wallTime: w.wallTime,
  }
}

/** Reconstruct WorldState from stored JSON. */
export function deserializeWorld(raw: object): WorldState {
  const r = raw as any
  const entities = new Map<string, Entity>()
  for (const e of (r.entities ?? [])) {
    entities.set(e.id, { ...e, position: Vec2.fromJSON(e.position) })
  }
  return {
    creature: {
      ...r.creature,
      position: Vec2.fromJSON(r.creature.position),
      velocity: Vec2.fromJSON(r.creature.velocity),
    },
    entities,
    environment: r.environment,
    simTime: r.simTime ?? 0,
    version: r.version ?? 0,
    wallTime: r.wallTime ?? Date.now() / 1000,
  }
}
