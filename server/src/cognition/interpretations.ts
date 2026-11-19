import type { ChannelName } from "../types"

export interface MemoryCandidate {
  content: string
  importance: number  // 0–1
}

export interface CreationRequest {
  intent: string
  description: string
  reason: string
}

export interface DesirePacket {
  channel: ChannelName
  delta: number       // clamped to [-0.5, 0.5]
  reason?: string
}

export interface NarrativeOutput {
  thought: string
  speech: string
  action_interpretation: string
  experience_interpretation: string
  memory_candidate: MemoryCandidate | null
  creation_request: CreationRequest | null
  desires: DesirePacket[]
  new_goal: string | null
  economy_earn: number
}

export const FALLBACK_OUTPUT: NarrativeOutput = {
  thought: "I observe my surroundings.",
  speech: "",
  action_interpretation: "I continue moving.",
  experience_interpretation: "Everything feels ordinary.",
  memory_candidate: null,
  creation_request: null,
  desires: [],
  new_goal: null,
  economy_earn: 0,
}

export function parseNarrativeOutput(raw: string): NarrativeOutput {
  try {
    const obj = JSON.parse(raw)
    return {
      thought: String(obj.thought ?? ""),
      speech: String(obj.speech ?? ""),
      action_interpretation: String(obj.action_interpretation ?? ""),
      experience_interpretation: String(obj.experience_interpretation ?? ""),
      memory_candidate: obj.memory_candidate
        ? { content: String(obj.memory_candidate.content ?? ""), importance: Number(obj.memory_candidate.importance ?? 0) }
        : null,
      creation_request: obj.creation_request
        ? { intent: String(obj.creation_request.intent ?? ""), description: String(obj.creation_request.description ?? ""), reason: String(obj.creation_request.reason ?? "") }
        : null,
      desires: Array.isArray(obj.desires)
        ? obj.desires.map((d: any) => ({
            channel: d.channel as ChannelName,
            delta: Math.max(-0.5, Math.min(0.5, Number(d.delta ?? 0))),
            reason: String(d.reason ?? ""),
          }))
        : [],
      new_goal: obj.new_goal ? String(obj.new_goal) : null,
      economy_earn: Math.max(0, Math.min(10, Math.floor(Number(obj.economy_earn ?? 0)))),
    }
  } catch {
    return FALLBACK_OUTPUT
  }
}
