/**
 * NarratorAgent — fires GPT-4o every 8-12 seconds if LLM is enabled.
 * Subscribes to world events, injects desires into CTRNN,
 * registers goals, awards economy credits.
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
import type { Database } from "bun:sqlite"

const MIN_INTERVAL_MS = 8_000
const JITTER_MS       = 4_000

export class NarratorAgent {
  enabled: boolean
  private _client: OpenAI | null
  private _worldEngine: WorldEngine
  private _stimulation: StimulationNetwork
  private _memory: MemoryStore
  private _goals: GoalEngine
  private _economy: EconomySystem
  private _personality: PersonalityEngine
  private _db: Database
  private _timeoutId: ReturnType<typeof setTimeout> | null = null

  lastThought: string = ""
  lastSpeech: string = ""

  constructor(
    apiKey: string,
    worldEngine: WorldEngine,
    stimulation: StimulationNetwork,
    memory: MemoryStore,
    goals: GoalEngine,
    economy: EconomySystem,
    personality: PersonalityEngine,
    db: Database,
  ) {
    const baseURL = process.env.NARRATOR_BASE_URL
    const model   = process.env.NARRATOR_MODEL

    if (baseURL && model) {
      // Local model via Ollama or any OpenAI-compatible endpoint
      this.enabled = true
      this._client = new OpenAI({ baseURL, apiKey: apiKey || "ollama" })
    } else {
      this.enabled = Boolean(apiKey && !apiKey.includes("your-key") && !apiKey.includes("sk-your"))
      this._client = this.enabled ? new OpenAI({ apiKey }) : null
    }
    this._worldEngine = worldEngine
    this._stimulation = stimulation
    this._memory = memory
    this._goals = goals
    this._economy = economy
    this._personality = personality
    this._db = db
  }

  start() {
    this._schedule()
    console.log(`[Narrator] started (enabled=${this.enabled})`)
  }

  stop() {
    if (this._timeoutId) clearTimeout(this._timeoutId)
  }

  private _schedule() {
    const delay = MIN_INTERVAL_MS + Math.random() * JITTER_MS
    this._timeoutId = setTimeout(() => {
      this._tick().finally(() => this._schedule())
    }, delay)
  }

  private async _tick() {
    if (!this.enabled || !this._client) return

    const obs = buildObservation(this._worldEngine, this._stimulation, this._memory)
    const messages = buildMessages(
      obs,
      JSON.stringify(this._personality.getTraitsSummary()),
      JSON.stringify(this._goals.goalsSummary()),
      JSON.stringify(this._economy.status()),
    )

    let output: NarrativeOutput = FALLBACK_OUTPUT
    try {
      const model = process.env.NARRATOR_MODEL ?? "gpt-4o"
      const resp = await this._client.chat.completions.create({
        model,
        messages: messages as any,
        response_format: { type: "json_object" },
        max_tokens: 400,
        temperature: 0.9,
      })
      const text = resp.choices[0]?.message?.content ?? ""
      output = parseNarrativeOutput(text)
    } catch (err) {
      console.error("[Narrator] LLM error:", err)
      return
    }

    // Inject desires into CTRNN
    for (const d of output.desires) {
      this._stimulation.inject({ [d.channel]: d.delta } as any)
    }

    // Register new goal
    if (output.new_goal) {
      this._goals.registerGoalFromLlm(output.new_goal)
    }

    // Economy earn
    if (output.economy_earn > 0) {
      this._economy.earn(output.economy_earn, `llm tick: ${output.thought.slice(0, 60)}`)
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
        speech: output.speech,
        action: output.action_interpretation,
        experience: output.experience_interpretation,
        desires: output.desires,
        new_goal: output.new_goal,
        economy_earn: output.economy_earn,
      },
    })
    bus.publish(ev)
    persistEvent(this._db, ev)
  }
}
