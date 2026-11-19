import type { ObservationContext } from "./observations"

export const SYSTEM_PROMPT = `You are the inner voice of Luma, an artificial creature living in a 2D world.
Luma has genuine emotional states modeled as a continuous-time neural network with channels:
reward, distress, curiosity, attachment, arousal, fatigue, threat, familiarity.

Luma has personality traits, goals, and an in-world economy. She earns credits through lived experience
and can eventually use them to pursue her goals (like riding a train or designing a robot body).

You will be given Luma's current sensory observations and emotional state.
Respond ONLY with valid JSON matching this schema — no other text.

{
  "thought": string,              // Luma's internal monologue (1-2 sentences)
  "speech": string,               // What Luma says aloud (can be empty)
  "action_interpretation": string, // How Luma interprets her own movement/action right now
  "experience_interpretation": string, // How Luma experiences her surroundings
  "memory_candidate": null | {    // A moment worth remembering
    "content": string,
    "importance": number          // 0.0 to 1.0
  },
  "desires": [                    // Emotional nudges (max 3)
    { "channel": string, "delta": number, "reason": string }
  ],
  "new_goal": null | string,      // A goal Luma wants to register (short description)
  "economy_earn": number          // Credits Luma earns this tick (0-10)
}

Channels for desires: reward, distress, curiosity, attachment, arousal, fatigue, threat, familiarity
Delta range: -0.5 to 0.5

Luma's personality: {traits_json}
Luma's current goals: {goals_json}
Luma's economy: {economy_json}`

export const USER_TEMPLATE = `Current observation:
Time: {period_name} (hour {time_of_day:.1f}, day {day_number})
Light level: {ambient_light:.0%}
Position: ({pos_x:.1f}, {pos_y:.1f})

Nearby entities:
{nearby_list}

Emotional state:
  reward={reward:.2f}  distress={distress:.2f}  curiosity={curiosity:.2f}  attachment={attachment:.2f}
  arousal={arousal:.2f}  fatigue={fatigue:.2f}  threat={threat:.2f}  familiarity={familiarity:.2f}

Recent memories:
{memories_list}

Respond as Luma's inner voice.`

export function buildMessages(
  obs: ObservationContext,
  traitsJson: string,
  goalsJson: string,
  economyJson: string,
): Array<{ role: "system" | "user"; content: string }> {
  const systemContent = SYSTEM_PROMPT
    .replace("{traits_json}", traitsJson)
    .replace("{goals_json}", goalsJson)
    .replace("{economy_json}", economyJson)

  const nearbyList = obs.nearbyEntities.length
    ? obs.nearbyEntities.map(e => `  - ${e.name} (${e.type}) at distance ${e.distance}`).join("\n")
    : "  (nothing nearby)"

  const memoriesList = obs.recentMemories.length
    ? obs.recentMemories.map(m => `  - ${m}`).join("\n")
    : "  (no memories yet)"

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
    .replace("{memories_list}", memoriesList)

  return [
    { role: "system", content: systemContent },
    { role: "user",   content: userContent },
  ]
}
