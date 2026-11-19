/**
 * StimulationNetwork — wraps the CTRNN and processes incoming stimulus packets.
 *
 * Runs at STIMULATION_HZ (15 Hz). Accumulates packets in a queue between ticks,
 * sums them on each tick, then runs a CTRNN Euler step.
 *
 * inject(packet)   — called by personality engine, movement model, event handlers
 * getOutputs()     — returns current sigmoid outputs (0–1 mapped from [-1,1] range)
 * getSnapshot()    — returns raw activations for memory/LLM context
 */

import { ctrnnStep, ambientStimulus } from "./ctrnn"
import { packetToArray } from "./stimuli"
import type { StimulusPacket } from "./stimuli"
import type { StimSnapshot } from "../types"
import { CHANNEL_NAMES } from "../types"
import type { WorldState } from "../world/state"

const N = 8
const HZ = 15
const DT = 1 / HZ

export class StimulationNetwork {
  private _x: number[] = Array(N).fill(0)       // CTRNN activations [-1, 1]
  private _pending: number[] = Array(N).fill(0)
  private _outputs: StimSnapshot = {
    reward: 0.1, distress: 0, curiosity: 0.3, attachment: 0.1,
    arousal: 0.3, fatigue: 0.1, threat: 0, familiarity: 0.2,
  }
  private _intervalId: ReturnType<typeof setInterval> | null = null
  private _getTimeOfDay: () => number

  constructor(getTimeOfDay: () => number) {
    this._getTimeOfDay = getTimeOfDay
  }

  start() {
    this._intervalId = setInterval(() => this._tick(), 1000 / HZ)
    console.log("[Stimulation] started at 15 Hz")
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId)
  }

  inject(packet: StimulusPacket) {
    const arr = Array.from(packetToArray(packet))
    for (let i = 0; i < N; i++) this._pending[i] += arr[i]
  }

  getOutputs(): StimSnapshot {
    return { ...this._outputs }
  }

  getSnapshot(): number[] {
    return [...this._x]
  }

  private _tick() {
    // Add ambient stimulus
    const ambient = ambientStimulus(this._getTimeOfDay())

    // Build total stimulus = pending + ambient
    const stimuli = Array.from({ length: N }, (_, i) => this._pending[i] + ambient[i])
    const nextX = ctrnnStep(
      new Float64Array(this._x),
      new Float64Array(stimuli),
      DT
    )
    this._x = Array.from(nextX)

    // Reset pending
    this._pending = Array(N).fill(0)

    // Map [-1,1] → sigmoid-like [0,1] outputs for easy reading
    const snap: Partial<StimSnapshot> = {}
    for (let i = 0; i < N; i++) {
      snap[CHANNEL_NAMES[i] as keyof StimSnapshot] = (this._x[i] + 1) / 2
    }
    this._outputs = snap as StimSnapshot
  }
}
