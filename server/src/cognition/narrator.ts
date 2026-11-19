/**
 * NarratorAgent — fires the local language model every 8-12 seconds.
 *
 * Uses ONLY the local LLM (LOCAL_LLM_BASE_URL + LOCAL_LLM_MODEL).
 * If the local endpoint is unavailable, narration pauses and retries with
 * exponential back-off — it does NOT fall back to OpenAI.
 *
 * LLM-generated desires are stored as Concerns (not injected into CTRNN).
 * The ConcernMediator applies bounded influence separately.
 */
import OpenAI from "openai"
import { buildObservation } from "./observations"
import { buildMessages } from "./prompts"
import { parseNarrativeOutput, FALLBACK_OUTPUT } from "./interpretations"
import type { NarrativeOutput } from "./interpretations"
import { bus, EventType, makeEvent } from "../world/events"
import { persistEvent } from "../world/persistence"
import type { WorldEngine } from "../world/engine"
import type { StimulationNetwork } from "../simulation/network"
import type { MemoryStore } from "../memory/store"
import type { GoalEngine } from "../goals/engine"
import type { EconomySystem } from "../economy/credits"
import type { PersonalityEngine } from "../personality/engine"
import type { ConcernsStore } from "./concerns"
import type { Database } from "bun:sqlite"

const MIN_INTERVAL_MS = 8_000
const JITTER_MS       = 4_000
const MAX_BACKOFF_MS  = 5 * 60_000  // 5 minutes
const BACKOFF_FACTOR  = 2

export class NarratorAgent {
  enabled: boolean
  localAvailable: boolean  // tracks whether local LLM is reachable
  private _client: OpenAI | null
  private _model: string
  private _worldEngine: WorldEngine
  private _stimulation: StimulationNetwork
  private _memory: MemoryStore
  private _goals: GoalEngine
  private _economy: EconomySystem
  private _personality: PersonalityEngine
  private _concerns: ConcernsStore
  private _db: Database
  private _timeoutId: ReturnType<typeof setTimeout> | null = null
  private _backoffMs = MIN_INTERVAL_MS

  lastThought: string = ""
  lastSpeech: string = ""

  constructor(
    worldEngine: WorldEngine,
    stimulation: StimulationNetwork,
    memory: MemoryStore,
    goals: GoalEngine,
    economy: EconomySystem,
    personality: PersonalityEngine,
    concerns: ConcernsStore,
    db: Database,
  ) {
    const baseURL = process.env.LOCAL_LLM_BASE_URL
    const model   = process.env.LOCAL_LLM_MODEL
    const apiKey  = process.env.LOCAL_LLM_API_KEY ?? "ollama"

    if (baseURL && model) {
      this._client = new OpenAI({ baseURL, apiKey })
      this._model  = model
      this.enabled = true
      this.localAvailable = true
      console.log(`[Narrator] Local LLM configured: ${baseURL} (${model})`)
    } else {
      this._client = null
      this._model  = ""
      this.enabled = false
      this.localAvailable = false
      console.warn("[Narrator] No LOCAL_LLM_BASE_URL/LOCAL_LLM_MODEL set — narration disabled.")
      console.warn("[Narrator] Set these env vars to enable Luma's inner voice.")
    }

    this._worldEngine = worldEngine
    this._stimulation = stimulation
    this._memory      = memory
    this._goals       = goals
    this._economy     = economy
    this._personality = personality
    this._concerns    = concerns
    this._db          = db
  }

  start() {
    this._schedule()
    console.log(`[Narrator] started (enabled=${this.enabled})`)
  }

  stop() {
    if (this._timeoutId) clearTimeout(this._timeoutId)
  }

  private _schedule() {
    const jitter = Math.random() * JITTER_MS
    const delay  = this.localAvailable ? MIN_INTERVAL_MS + jitter : this._backoffMs
    this._timeoutId = setTimeout(() => {
      this._tick().finally(() => this._schedule())
    }, delay)
  }

  private async _tick() {
    if (!this.enabled || !this._client) return

    const obs = buildObservation(
      this._worldEngine,
      this._stimulation,
      this._memory,
      this._concerns,
    )
    const messages = buildMessages(
      obs,
      JSON.stringify(this._personality.getTraitsSummary()),
      JSON.stringify(this._goals.goalsSummary()),
      JSON.stringify(this._economy.status()),
    )

    let output: NarrativeOutput = FALLBACK_OUTPUT
    try {
      const resp = await this._client.chat.completions.create({
        model: this._model,
        messages: messages as any,
        response_format: { type: "json_object" },
        max_tokens: 400,
        temperature: 0.9,
      })
      const text = resp.choices[0]?.message?.content ?? ""
      output = parseNarrativeOutput(text)

      // Recovered from error — reset back-off
      if (!this.localAvailable) {
        this.localAvailable = true
        this._backoffMs = MIN_INTERVAL_MS
        console.log("[Narrator] Local LLM reconnected.")
      }
    } catch (err) {
      console.error("[Narrator] Local LLM error:", err)
      this.localAvailable = false
      this._backoffMs = Math.min(MAX_BACKOFF_MS, this._backoffMs * BACKOFF_FACTOR)
      console.warn(`[Narrator] Retrying in ${(this._backoffMs / 1000).toFixed(0)}s`)
      return
    }

    // Store LLM-generated desires as Concerns — do NOT inject into CTRNN directly
    for (const d of output.desires) {
      this._concerns.add({
        content: d.reason ?? `desire: ${d.channel} ${d.delta > 0 ? "up" : "down"}`,
        type: "desire",
        priority: Math.abs(d.delta),
        channel_hint: d.channel,
        delta_hint: d.delta,
        origin: "narrator",
      })
    }

    // Register new goal (LLM-proposed, stored in DB — no world change)
    if (output.new_goal) {
      this._goals.registerGoalFromLlm(output.new_goal)
    }

    // Store memory candidate
    if (output.memory_candidate) {
      const { content, importance } = output.memory_candidate
      this._memory.storeEpisodic(
        content,
        importance,
        this._worldEngine.state.simTime,
        this._worldEngine.state.creature.position.toJSON(),
        Object.values(this._stimulation.getOutputs()),
      )
    }

    // Cache for WS frame
    this.lastThought = output.thought
    this.lastSpeech  = output.speech

    // Publish narration event
    const ev = makeEvent("narrator", EventType.NARRATION_PRODUCED, {
      entityId: this._worldEngine.state.creature.id,
      payload: {
        thought: output.thought,
        speech:  output.speech,
        action:  output.action_interpretation,
        experience: output.experience_interpretation,
        concerns_added: output.desires.length,
        new_goal: output.new_goal,
      },
    })
    bus.publish(ev)
    persistEvent(this._db, ev)
  }
}
