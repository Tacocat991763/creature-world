import { Vec2 } from "../types"
import type { Entity } from "../world/state"

export interface DriveResult { dir: Vec2; speed: number }

/** Pure wander: perturb current heading with noise. */
export function wander(orientation: number): DriveResult {
  const noise = (Math.random() - 0.5) * 0.8
  const angle = orientation + noise
  return { dir: new Vec2(Math.cos(angle), Math.sin(angle)), speed: 0.65 + Math.random() * 0.2 }
}

/** Move toward target. Returns null when already at target. */
export function seek(position: Vec2, target: Vec2): DriveResult | null {
  const diff = target.sub(position)
  const dist = diff.length()
  if (dist < 0.5) return null
  return { dir: diff.normalize(), speed: 0.85 }
}

/** Flee away from threat. */
export function flee(position: Vec2, threat: Vec2): DriveResult {
  const away = position.sub(threat)
  const dist = away.length()
  if (dist < 0.5) {
    const angle = Math.random() * Math.PI * 2
    return { dir: new Vec2(Math.cos(angle), Math.sin(angle)), speed: 1.0 }
  }
  return { dir: away.normalize(), speed: 1.0 }
}

/** No movement. */
export function restInPlace(): DriveResult {
  return { dir: new Vec2(0, 0), speed: 0 }
}

/** Pick the nearest entity NOT in visitedIds (novel curiosity target). */
export function findNovelTarget(
  position: Vec2,
  entities: Entity[],
  visitedIds: Set<string>,
): Entity | null {
  const candidates = entities.filter(e => e.alive && !visitedIds.has(e.id) && e.components.interactable)
  if (!candidates.length) return null
  return candidates.reduce((best, e) =>
    position.distanceTo(e.position) < position.distanceTo(best.position) ? e : best
  )
}

/** Pick the nearest entity already visited (familiar attachment target). */
export function findFamiliarTarget(
  position: Vec2,
  entities: Entity[],
  visitedIds: Set<string>,
): Entity | null {
  const candidates = entities.filter(e => e.alive && visitedIds.has(e.id))
  if (!candidates.length) return null
  return candidates.reduce((best, e) =>
    position.distanceTo(e.position) < position.distanceTo(best.position) ? e : best
  )
}

/** Smooth steering: interpolate current orientation toward target direction. */
export function steerToward(
  orientation: number,
  target: Vec2,
  position: Vec2,
  turnRate: number,
  dt: number
): number {
  const diff = target.sub(position)
  if (diff.length() < 0.01) return orientation
  const targetAngle = Math.atan2(diff.y, diff.x)
  let delta = targetAngle - orientation
  // Wrap to [-π, π]
  while (delta >  Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  return orientation + Math.sign(delta) * Math.min(Math.abs(delta), turnRate * dt)
}
