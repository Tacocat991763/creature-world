import type { WorldEngine } from "../world/engine"
import type { StimulationNetwork } from "../simulation/network"
import type { MemoryStore } from "../memory/store"

export interface ObservationContext {
  timeOfDay: number
  periodName: string
  dayNumber: number
  ambientLight: number
  creaturePosition: { x: number; y: number }
  creatureOrientation: number
  nearbyEntities: Array<{
    id: string; name: string; type: string
    distance: number; position: { x: number; y: number }
  }>
  stimulation: {
    reward: number; distress: number; curiosity: number; attachment: number
    arousal: number; fatigue: number; threat: number; familiarity: number
  }
  recentMemories: string[]
}

const OBSERVATION_RADIUS = 20

export function buildObservation(
  worldEngine: WorldEngine,
  stimulation: StimulationNetwork,
  memory: MemoryStore,
): ObservationContext {
  const state = worldEngine.state
  const c = state.creature
  const env = state.environment
  const outputs = stimulation.getOutputs()

  const nearby = Array.from(state.entities.values())
    .filter(e => e.alive)
    .map(e => ({ ...e, dist: c.position.distanceTo(e.position) }))
    .filter(e => e.dist <= OBSERVATION_RADIUS)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 8)
    .map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      distance: parseFloat(e.dist.toFixed(2)),
      position: e.position.toJSON(),
    }))

  return {
    timeOfDay: parseFloat(env.timeOfDay.toFixed(2)),
    periodName: env.periodName,
    dayNumber: env.dayNumber,
    ambientLight: parseFloat(env.ambientLight.toFixed(2)),
    creaturePosition: c.position.toJSON(),
    creatureOrientation: parseFloat(c.orientation.toFixed(3)),
    nearbyEntities: nearby,
    stimulation: {
      reward:      parseFloat(outputs.reward.toFixed(3)),
      distress:    parseFloat(outputs.distress.toFixed(3)),
      curiosity:   parseFloat(outputs.curiosity.toFixed(3)),
      attachment:  parseFloat(outputs.attachment.toFixed(3)),
      arousal:     parseFloat(outputs.arousal.toFixed(3)),
      fatigue:     parseFloat(outputs.fatigue.toFixed(3)),
      threat:      parseFloat(outputs.threat.toFixed(3)),
      familiarity: parseFloat(outputs.familiarity.toFixed(3)),
    },
    recentMemories: memory.retrieve(5),
  }
}
