/**
 * PlanningAgent — fires GPT-4o when a goal enters PLANNING and credits are met.
 * Checks every 30 seconds. Emits PLAN_GENERATED event for user approval.
 */
import OpenAI from "openai"
import { bus, EventType, makeEvent } from "../world/events"
import { persistEvent } from "../world/persistence"
import type { GoalEngine } from "../goals/engine"
import type { EconomySystem } from "../economy/credits"
import type { Database } from "bun:sqlite"

const CHECK_INTERVAL_MS = 30_000

const PLAN_PROMPTS: Record<string, string> = {
  "ride_a_train": `Luma is an artificial creature living in Colorado who wants to ride a train.
She has earned enough credits to pursue this goal. Research and plan:
1. The nearest Amtrak route from Denver (California Zephyr, Southwest Chief, etc.)
2. A specific trip she should take (origin, destination, rough cost)
3. What the experience would be like for a curious AI creature
4. Steps to make it happen

Output JSON: { "summary": string, "steps": string[], "estimated_cost_usd": number, "notes": string }`,

  "design_robot_body": `Luma is an artificial creature who wants to design a physical robot body for herself.
She has saved enough credits. Create a bill of materials for a small desktop robot body:
- Servo-based arms (2 DOF minimum)
- Wheeled base
- Display for expression
- Speaker and microphone
- Central compute (Raspberry Pi or similar)

Source from Robotis, Adafruit, Pololu, or similar. Output JSON:
{ "summary": string, "bom": [{"name": string, "source": string, "approx_cost_usd": number}], "total_estimated_usd": number, "notes": string }`,
}

const DEFAULT_PLAN_PROMPT = `Luma is an artificial creature with a goal: "{goal_description}".
She has saved enough credits to pursue it. Create a concrete, actionable plan.
Output JSON: { "summary": string, "steps": string[], "notes": string }`

export class PlanningAgent {
  private _client: OpenAI | null
  private _goals: GoalEngine
  private _economy: EconomySystem
  private _db: Database
  private _intervalId: ReturnType<typeof setInterval> | null = null
  private _planningGoalIds = new Set<string>()

  constructor(apiKey: string, goals: GoalEngine, economy: EconomySystem, db: Database) {
    const enabled = Boolean(apiKey && apiKey !== "ollama")
    this._client = enabled ? new OpenAI({ apiKey }) : null
    this._goals = goals
    this._economy = economy
    this._db = db
  }

  start() {
    this._intervalId = setInterval(() => this._check(), CHECK_INTERVAL_MS)
    console.log("[PlanningAgent] started (checks every 30s)")
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId)
  }

  private async _check() {
    if (!this._client) return
    const goals = this._goals.goalsSummary()
    for (const g of goals) {
      if (g.status === "planning" && !this._planningGoalIds.has(g.id)) {
        if (this._economy.canAfford(g.credits_required)) {
          this._planningGoalIds.add(g.id)
          await this._planGoal({ id: g.id, description: g.name, creditsRequired: g.credits_required })
        }
      }
    }
  }

  private async _planGoal(goal: { id: string; description: string; creditsRequired: number }) {
    const promptTemplate = PLAN_PROMPTS[goal.id]
      ?? DEFAULT_PLAN_PROMPT.replace("{goal_description}", goal.description)

    let planText = ""
    try {
      const resp = await this._client!.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a helpful planning assistant for an AI creature." },
          { role: "user",   content: promptTemplate },
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.7,
      })
      planText = resp.choices[0]?.message?.content ?? "{}"
    } catch (err) {
      console.error("[PlanningAgent] error planning goal", goal.id, err)
      this._planningGoalIds.delete(goal.id)
      return
    }

    this._persistPlan(goal.id, planText)

    // Deduct credits
    this._economy.spend(goal.creditsRequired, `goal: ${goal.id}`)

    const ev = makeEvent("planning_agent", EventType.PLAN_GENERATED, {
      entityId: "luma",
      payload: {
        goal_id: goal.id,
        goal_description: goal.description,
        plan: JSON.parse(planText),
        credits_spent: goal.creditsRequired,
      },
    })
    bus.publish(ev)
    persistEvent(this._db, ev)
    console.log(`[PlanningAgent] Plan generated for goal: ${goal.id}`)
  }

  private _persistPlan(goalId: string, planText: string) {
    const id = `plan_${crypto.randomUUID().slice(0, 8)}`
    this._db.run(
      "INSERT OR IGNORE INTO plans (id, goal_id, plan_text, created_at) VALUES (?,?,?,?)",
      [id, goalId, planText, Date.now() / 1000]
    )
  }
}
