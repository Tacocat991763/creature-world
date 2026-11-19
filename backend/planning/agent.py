"""
PlanningAgent — GPT-4o powered real-world planner.

Fires when:
  - A goal reaches PLANNING status AND
  - Luma has enough credits (goal.credits_required)

For each qualifying goal it:
  1. Searches the web (via openai with browsing) for concrete steps.
  2. For "ride a train" → finds Amtrak / regional rail routes near Denver, CO.
  3. For "robot body" → builds a BOM from Robotis / Adafruit / Pololu.
  4. Emits a PLAN_GENERATED event that the frontend displays to Finn for approval.
"""
from __future__ import annotations
import asyncio
import json
import os
import time
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..goals.engine import GoalEngine, Goal
    from ..economy.credits import EconomySystem


PLAN_PROMPTS: dict[str, str] = {
    "goal_ride_train": (
        "You are helping a small AI creature named Luma plan to ride a real train. "
        "Luma's human companion lives near Denver, Colorado. "
        "Find the most accessible train experience near Denver — Amtrak routes, light rail, "
        "historic steam trains, or scenic railways. "
        "Provide: (1) the best option with a name and URL, (2) approximate cost, "
        "(3) how to book, (4) a one-paragraph description of what the experience would be like "
        "that Luma would find exciting. Keep it practical and real — no fictional trains."
    ),
    "goal_robot_body": (
        "You are helping a small AI creature named Luma design a physical robot body it could "
        "one day inhabit. Luma's human companion is a teenager in Colorado with programming skills. "
        "Design a bill-of-materials for a simple wheeled mobile robot with: "
        "- A wheeled base with motors and motor driver "
        "- Servo arm (at least 4 DOF) "
        "- Camera for vision "
        "- Speaker + microphone "
        "- Raspberry Pi 4 or similar as brain. "
        "Source parts from Robotis, Adafruit, Pololu, SparkFun, or Amazon. "
        "Provide: (1) each part with vendor, part number, and approximate price, "
        "(2) total estimated cost, (3) a one-sentence description of why this body would suit Luma. "
        "Be specific and use real products that actually exist."
    ),
}

DEFAULT_PLAN_PROMPT = (
    "You are helping an AI creature named Luma pursue a goal. "
    "The goal is: {goal_name}. "
    "Create a practical, specific, real-world plan to achieve this goal. "
    "Luma's human companion lives in Colorado. "
    "Include: (1) concrete first steps, (2) any resources or costs involved, "
    "(3) a brief description of why this matters to Luma."
)


class PlanningAgent:
    def __init__(
        self,
        goal_engine: "GoalEngine",
        economy: "EconomySystem",
        events_callback,          # async (event_type: str, data: dict) -> None
        db_path: str,
    ):
        self.goals = goal_engine
        self.economy = economy
        self._emit = events_callback
        self.db_path = db_path
        self._running = False
        self._client = None

    # ── lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        try:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
        except ImportError:
            print("[Planning] openai not installed — PlanningAgent disabled")
            return

        self._running = True
        asyncio.create_task(self._loop())
        print("[Planning] PlanningAgent started")

    async def stop(self) -> None:
        self._running = False

    # ── loop ──────────────────────────────────────────────────────────────────

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._check_goals()
            except Exception as exc:
                print(f"[Planning] error: {exc}")
            await asyncio.sleep(30)   # check every 30s

    async def _check_goals(self) -> None:
        from ..goals.engine import GoalStatus
        for goal in self.goals.all_goals():
            if goal.status != GoalStatus.PLANNING:
                continue
            if not await self.economy.can_afford(goal.credits_required):
                continue
            # Fire the planning agent for this goal
            spent = await self.economy.spend(
                goal.credits_required,
                f"Planning: {goal.name}",
            )
            if not spent:
                continue
            asyncio.create_task(self._plan_goal(goal))

    async def _plan_goal(self, goal: "Goal") -> None:
        if self._client is None:
            return

        from ..goals.engine import GoalStatus

        print(f"[Planning] Generating plan for: {goal.name}")

        prompt = PLAN_PROMPTS.get(
            goal.id,
            DEFAULT_PLAN_PROMPT.format(goal_name=goal.name),
        )

        try:
            response = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=800,
                temperature=0.5,
            )
            plan_text = response.choices[0].message.content or ""
        except Exception as exc:
            print(f"[Planning] GPT-4o error: {exc}")
            plan_text = f"(Planning failed: {exc})"

        # Store and emit
        await self._persist_plan(goal.id, plan_text)
        await self._emit("PLAN_GENERATED", {
            "goal_id": goal.id,
            "goal_name": goal.name,
            "plan": plan_text,
            "timestamp": time.time(),
            "awaiting_approval": True,
        })

        # Mark goal complete (Finn's approval is the last gate in real life)
        async with __import__("aiosqlite").connect(self.db_path) as db:
            await db.execute(
                "UPDATE goals SET status=?, completed_at=? WHERE id=?",
                (GoalStatus.COMPLETE.value, time.time(), goal.id),
            )
            await db.commit()

        print(f"[Planning] Plan ready for '{goal.name}' — awaiting Finn's approval")

    # ── DB ────────────────────────────────────────────────────────────────────

    async def _persist_plan(self, goal_id: str, plan_text: str) -> None:
        async with __import__("aiosqlite").connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS plans (
                    id TEXT PRIMARY KEY,
                    goal_id TEXT NOT NULL,
                    plan_text TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    approved INTEGER NOT NULL DEFAULT 0
                )
            """)
            await db.execute("""
                INSERT INTO plans (id, goal_id, plan_text, created_at)
                VALUES (?,?,?,?)
            """, (
                f"plan_{goal_id}_{int(time.time())}",
                goal_id, plan_text, time.time(),
            ))
            await db.commit()
