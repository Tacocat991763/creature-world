/** Shared types used across the server. */

export class Vec2 {
  constructor(public x = 0, public y = 0) {}

  length() { return Math.sqrt(this.x * this.x + this.y * this.y) }

  distanceTo(other: Vec2) {
    return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2)
  }

  normalize(): Vec2 {
    const l = this.length()
    return l < 1e-9 ? new Vec2() : new Vec2(this.x / l, this.y / l)
  }

  add(other: Vec2) { return new Vec2(this.x + other.x, this.y + other.y) }
  sub(other: Vec2) { return new Vec2(this.x - other.x, this.y - other.y) }
  scale(s: number)  { return new Vec2(this.x * s, this.y * s) }
  negate()          { return new Vec2(-this.x, -this.y) }

  toJSON() { return { x: this.x, y: this.y } }
  static fromJSON(o: { x: number; y: number }) { return new Vec2(o.x, o.y) }
}

export const CHANNEL_NAMES = [
  "reward", "distress", "curiosity", "attachment",
  "arousal", "fatigue", "threat", "familiarity",
] as const

export type ChannelName = typeof CHANNEL_NAMES[number]

export interface StimSnapshot {
  reward: number; distress: number; curiosity: number; attachment: number
  arousal: number; fatigue: number; threat: number; familiarity: number
}

export const ZERO_STIM: StimSnapshot = {
  reward: 0, distress: 0, curiosity: 0, attachment: 0,
  arousal: 0, fatigue: 0, threat: 0, familiarity: 0,
}
