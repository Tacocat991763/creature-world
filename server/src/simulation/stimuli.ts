import type { ChannelName } from "../types"

export interface StimulusPacket {
  reward?: number
  distress?: number
  curiosity?: number
  attachment?: number
  arousal?: number
  fatigue?: number
  threat?: number
  familiarity?: number
}

export function packetToArray(p: StimulusPacket): number[] {
  return [
    p.reward     ?? 0,
    p.distress   ?? 0,
    p.curiosity  ?? 0,
    p.attachment ?? 0,
    p.arousal    ?? 0,
    p.fatigue    ?? 0,
    p.threat     ?? 0,
    p.familiarity ?? 0,
  ]
}

/** Build a StimulusPacket from an event type name. */
export function packetFromEventType(type: string): StimulusPacket {
  const map: Record<string, StimulusPacket> = {
    object_approached:    { curiosity: 0.4, arousal: 0.2 },
    object_interacted:    { reward: 0.3, curiosity: 0.2, familiarity: 0.3 },
    obstacle_encountered: { distress: 0.3, arousal: 0.4, threat: 0.2 },
    person_interacted:    { attachment: 0.5, reward: 0.3, arousal: 0.2 },
    person_gave_gift:     { reward: 0.6, attachment: 0.4 },
    creature_rested:      { fatigue: -0.3, reward: 0.1 },
    world_extended:       { curiosity: 0.5, arousal: 0.3 },
    user_interacted:      { attachment: 0.4, reward: 0.2 },
  }
  return map[type] ?? {}
}
