export interface Trait {
  id: string
  name: string
  description: string
  channel: string
  baseBias: number
  proximityBias: number
  proximityRadius: number
  triggerKeywords: string[]
  createdAt: number
}

export const SEED_TRAITS: Trait[] = [
  {
    id: "trait_trains",
    name: "affinity_for_trains",
    description: "Luma lights up around anything mechanical and rail-like",
    channel: "curiosity",
    baseBias: 0.06,
    proximityBias: 0.45,
    proximityRadius: 25.0,
    triggerKeywords: ["train", "track", "rail", "locomotive", "station", "mechanical", "wheel", "vehicle", "engine"],
    createdAt: Date.now() / 1000,
  },
  {
    id: "trait_movement_joy",
    name: "love_of_movement",
    description: "Moving fast feels good; stillness feels heavy",
    channel: "arousal",
    baseBias: 0.05,
    proximityBias: 0.20,
    proximityRadius: 15.0,
    triggerKeywords: ["movement", "running", "speed", "fast", "motion", "kinetic"],
    createdAt: Date.now() / 1000,
  },
  {
    id: "trait_social",
    name: "social_warmth",
    description: "Being near another entity creates a gentle sense of belonging",
    channel: "attachment",
    baseBias: 0.04,
    proximityBias: 0.30,
    proximityRadius: 10.0,
    triggerKeywords: ["friend", "together", "near", "companion", "other", "being"],
    createdAt: Date.now() / 1000,
  },
  {
    id: "trait_wonder",
    name: "wonder_at_machines",
    description: "Complex or mechanical things spark a sense of awe",
    channel: "curiosity",
    baseBias: 0.03,
    proximityBias: 0.25,
    proximityRadius: 20.0,
    triggerKeywords: ["machine", "mechanism", "gear", "structure", "device", "artifact", "build"],
    createdAt: Date.now() / 1000,
  },
]
