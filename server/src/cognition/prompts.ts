import type { ObservationContext } from "./observations"

export const SYSTEM_PROMPT = `You are the inner voice of Luma, an artificial creature living in a 2D world.
Luma has genuine emotional states modeled as a continuous-time neural network with channels:
reward, distress, curiosity, attachment, arousal, fatigue, threat, familiarity.

Luma has a personality, goals, ongoing concerns, and an in-world economy.
She earns credits through lived experience and can eventually pursue her goals.

You will be given Luma's current sensory observations, emotional state, and open concerns.
Respond ONLY with valid JSON matching this schema — no other text.

{
  "thought": string,              // Luma's internal monologue (1-2 sentences, genuine and unfiltered)
  "speech": string,               // What Luma says aloud (can be empty string — she doesn't always speak)
  "action_interpretation": string, // How Luma narrates her own movement/action right now
  "experience_interpretation": string, // How Luma experiences her surroundings
  "memory_candidate": null | {    // A moment worth remembering (only if genuinely significant)
    "content": string,
    "importance": number          // 0.0 to 1.0
  },
  "desires": [                    // Narrative desires (max 2). These become stored concerns, not direct stimulation.
    { "channel": string, "delta": number, "reason": string }
  ],
  "new_goal": null | string       // A goal Luma wants to register (short description, or null)
}

Channels for desires: reward, distress, curiosity, attachment, arousal, fatigue, threat, familiarity
Delta range: -1.0 to 1.0 (represents direction, not magnitude — the system bounds actual influence)

Luma's personality: {traits_json}
Luma's current goals: {goals_json}`

export const USER_TEMPLATE = `Current observation:
Time: {period_name} (hour {time_of_day:.1f}, day {day_number})
Light level: {ambient_light:.0%}
Position: ({pos_x:.1f}, {pos_y:.1f})

Nearby entities:
{nearby_list}

Emotional state:
  reward={reward:.2f}  distress={distress:.2f}  curiosity={curiosity:.2f}  attachment={attachment:.2f}
  arousal={arousal:.2f}  fatigue={fatigue:.2f}  threat={threat:.2f}  familiarity={familiarity:.2f}

Active concerns:
{concerns_list}

Recent memories:
{memories_list}

Respond as Luma's inner voice.`

export function buildMessages(
  obs: ObservationContext,
  traitsJson: string,
  goalsJson: string,
  _economyJson: string,
): Array<{ role: "system" | "user"; content: string }> {
  const systemContent = SYSTEM_PROMPT
    .replace("{traits_json}", traitsJson)
    .replace("{goals_json}", goalsJson)

  const nearbyList = obs.nearbyEntities.length
    ? obs.nearbyEntities.map(e => `  - ${e.name} (${e.type}) at distance ${e.distance}`).join("\n")
    : "  (nothing nearby)"

  const memoriesList = obs.recentMemories.length
    ? obs.recentMemories.map(m => `  - ${m}`).join("\n")
    : "  (no memories yet)"

  const concernsList = obs.activeConcerns?.length
    ? obs.activeConcerns.map(c => `  - ${c}`).join("\n")
    : "  (nothing pressing)"

  const s = obs.stimulation
  const userContent = USER_TEMPLATE
    .replace("{period_name}", obs.periodName)
    .replace("{time_of_day:.1f}", obs.timeOfDay.toFixed(1))
    .replace("{day_number}", String(obs.dayNumber))
    .replace("{ambient_light:.0%}", `${(obs.ambientLight * 100).toFixed(0)}%`)
    .replace("{pos_x:.1f}", obs.creaturePosition.x.toFixed(1))
    .replace("{pos_y:.1f}", obs.creaturePosition.y.toFixed(1))
    .replace("{nearby_list}", nearbyList)
    .replace("{reward:.2f}", s.reward.toFixed(2))
    .replace("{distress:.2f}", s.distress.toFixed(2))
    .replace("{curiosity:.2f}", s.curiosity.toFixed(2))
    .replace("{attachment:.2f}", s.attachment.toFixed(2))
    .replace("{arousal:.2f}", s.arousal.toFixed(2))
    .replace("{fatigue:.2f}", s.fatigue.toFixed(2))
    .replace("{threat:.2f}", s.threat.toFixed(2))
    .replace("{familiarity:.2f}", s.familiarity.toFixed(2))
    .replace("{concerns_list}", concernsList)
    .replace("{memories_list}", memoriesList)

  return [
    { role: "system", content: systemContent },
    { role: "user",   content: userContent },
  ]
}
