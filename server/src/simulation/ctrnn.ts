/**
 * Continuous-Time Recurrent Network dynamics.
 *
 * Update rule (Euler):
 *   τ_i * dx_i/dt = -x_i + tanh(Σ_j W_ij*tanh(x_j) + I_i + bias_i)
 *
 * Channels (index):
 *   0=reward  1=distress  2=curiosity  3=attachment
 *   4=arousal 5=fatigue   6=threat     7=familiarity
 */

const N = 8

// Time constants (seconds). Smaller = faster decay.
export const TAU = [2.0, 3.0, 1.5, 5.0, 1.0, 6.0, 1.5, 8.0]

// Baseline biases
export const BIAS = [-0.2, -0.5, 0.1, -0.3, -0.1, -0.3, -0.6, -0.2]

// W[i][j] = weight from channel j to channel i
export const W: number[][] = Array.from({ length: N }, () => Array(N).fill(0))

function setW(src: number, dst: number, weight: number) {
  W[dst][src] = weight
}

// channel indices
const [R, Di, Cu, At, Ar, Fa, Th, Fr] = [0, 1, 2, 3, 4, 5, 6, 7]

setW(Fr, R,  0.3)   // familiarity → reward
setW(At, R,  0.4)   // attachment  → reward
setW(R,  Cu, -0.15) // reward      → curiosity (satiation)
setW(Fa, Cu, -0.4)  // fatigue     → curiosity
setW(Th, Di, 0.6)   // threat      → distress
setW(Fa, Di, 0.2)   // fatigue     → distress
setW(Di, Ar, 0.3)   // distress    → arousal
setW(Ar, Cu, 0.2)   // arousal     → curiosity
setW(Fr, Cu, -0.2)  // familiarity → curiosity
setW(Cu, Fr, -0.3)  // curiosity   → familiarity
setW(Ar, Th, 0.5)   // arousal     → threat
setW(Di, Th, 0.4)   // distress    → threat
setW(Th, Fr, -0.3)  // threat      → familiarity
setW(R,  At, 0.3)   // reward      → attachment
setW(Fr, At, 0.2)   // familiarity → attachment
setW(Ar, Fa, -0.4)  // arousal     → fatigue
setW(Cu, Fa, -0.3)  // curiosity   → fatigue

function tanh(x: number) {
  if (x > 20) return 1
  if (x < -20) return -1
  const e2x = Math.exp(2 * x)
  return (e2x - 1) / (e2x + 1)
}

/** Euler step of the CTRNN. x and stimuli are length-8 arrays. */
export function ctrnnStep(x: Float64Array, stimuli: Float64Array, dt: number): Float64Array {
  const tanhX = x.map(tanh)
  const out = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    let net = BIAS[i] + stimuli[i]
    for (let j = 0; j < N; j++) net += W[i][j] * tanhX[j]
    const dx = (-x[i] + tanh(net)) / TAU[i]
    out[i] = Math.max(-1, Math.min(1, x[i] + dx * dt))
  }
  return out
}

/** Background ambient stimulus from time of day. */
export function ambientStimulus(timeOfDay: number): Float64Array {
  const s = new Float64Array(N)
  if (timeOfDay >= 20 || timeOfDay < 6) {
    s[Fa] += 0.05; s[Cu] -= 0.03; s[Fr] += 0.02
  } else if ((timeOfDay >= 5 && timeOfDay < 8) || (timeOfDay >= 17 && timeOfDay < 20)) {
    s[Ar] += 0.04; s[Cu] += 0.02
  }
  return s
}
