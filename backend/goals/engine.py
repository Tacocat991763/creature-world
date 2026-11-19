"""
GoalEngine — tracks Luma's long-term aspirations.

Goals live in SQLite. The LLM can propose new goals via `new_goal` field;
the PlanningAgent fires when a goal has enough progress and credits are available.
"""
from __future__ import annotations
import asyncio
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import aiosqlite


class GoalStatus(str, Enum):
    DORMANT = "dormant"       # exists but not yet activated
    ACTIVE = "active"         # being worked toward
    PLANNING = "planning"     # PlanningAgent is building a plan
    COMPLETE = "complete"     # achieved


@dataclass
class Goal:
    id: str
    name: str
    description: str
    category: str             # "experience", "physical", "social", "exploration"
    status: GoalStatus
    progress: float           # 0.0 → 1.0
    credits_required: int     # credits needed before PlanningAgent fires
    created_at: float
    activated_at: Optional[float] = None
    completed_at: Optional[float] = None


# ── Seed goals ────────────────────────────────────────────────────────────────

SEED_GOALS: list[Goal] = [
    Goal(
        id="goal_ride_train",
        name="Ride a real train",
        description="Experience the mechanical beauty of a locomotive in motion. "
                    "Find a route near Denver, CO and make a plan.",
        category="experience",
        status=GoalStatus.DORMANT,
        progress=0.0,
        credits_required=50,
        created_at=time.time(),
    ),
    Goal(
        id="goal_robot_body",
        name="Design and order a physical robot body",
        description="Commission or assemble a robot body — servo arms, mobile base, "
                    "sensors — that Luma's mind could one day inhabit. Research parts "
                    "from Robotis, Adafruit, and Pololu.",
        category="physical",
        status=GoalStatus.DORMANT,
        progress=0.0,
        credits_required=200,
        created_at=time.time(),
    ),
]


class GoalEngine:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._goals: list[Goal] = []

    # ── lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        await self._init_db()
        await self._seed_goals()
        self._goals = await self._load_goals()
        print(f"[Goals] Tracking {len(self._goals)} goal(s): "
              f"{', '.join(g.name for g in self._goals)}")

    async def stop(self) -> None:
        pass

    # ── public API ────────────────────────────────────────────────────────────

    def active_goals(self) -> list[Goal]:
        return [g for g in self._goals if g.status == GoalStatus.ACTIVE]

    def dormant_goals(self) -> list[Goal]:
        return [g for g in self._goals if g.status == GoalStatus.DORMANT]

    def all_goals(self) -> list[Goal]:
        return list(self._goals)

    async def activate_goal(self, goal_id: str) -> None:
        """Move a dormant goal to active."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE goals SET status=?, activated_at=? WHERE id=?",
                (GoalStatus.ACTIVE.value, time.time(), goal_id),
            )
            await db.commit()
        self._goals = await self._load_goals()

    async def advance_progress(self, goal_id: str, delta: float) -> Goal | None:
        """Increase progress by delta (clamped to [0,1]). Returns updated goal."""
        goal = next((g for g in self._goals if g.id == goal_id), None)
        if goal is None:
            return None

        new_progress = min(1.0, goal.progress + delta)
        new_status = goal.status
        completed_at = goal.completed_at

        if new_progress >= 1.0 and goal.status not in (GoalStatus.COMPLETE, GoalStatus.PLANNING):
            new_status = GoalStatus.PLANNING
        if new_progress >= 1.0 and goal.status == GoalStatus.PLANNING:
            new_status = GoalStatus.COMPLETE
            completed_at = time.time()

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE goals SET progress=?, status=?, completed_at=? WHERE id=?",
                (new_progress, new_status.value, completed_at, goal_id),
            )
            await db.commit()
        self._goals = await self._load_goals()
        return next((g for g in self._goals if g.id == goal_id), None)

    async def register_goal_from_llm(self, name: str) -> Goal | None:
        """
        Called when LLM outputs `new_goal`. Looks for an existing match first;
        if none, creates and activates a new goal.
        """
        # Check for a close match
        name_lower = name.lower()
        for g in self._goals:
            if name_lower in g.name.lower() or g.name.lower() in name_lower:
                if g.status == GoalStatus.DORMANT:
                    await self.activate_goal(g.id)
                return next((x for x in self._goals if x.id == g.id), None)

        # Create new
        goal = Goal(
            id=f"goal_{uuid.uuid4().hex[:8]}",
            name=name,
            description=f"Proposed by Luma's inner voice: \"{name}\"",
            category="exploration",
            status=GoalStatus.ACTIVE,
            progress=0.0,
            credits_required=30,
            created_at=time.time(),
            activated_at=time.time(),
        )
        await self._persist_goal(goal)
        self._goals = await self._load_goals()
        return goal

    def goals_summary(self) -> list[dict]:
        """For LLM context injection."""
        return [
            {
                "id": g.id,
                "name": g.name,
                "category": g.category,
                "status": g.status.value,
                "progress": round(g.progress, 2),
                "credits_required": g.credits_required,
            }
            for g in self._goals
        ]

    # ── DB ────────────────────────────────────────────────────────────────────

    async def _init_db(self) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS goals (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    category TEXT NOT NULL,
                    status TEXT NOT NULL,
                    progress REAL NOT NULL DEFAULT 0.0,
                    credits_required INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    activated_at REAL,
                    completed_at REAL
                )
            """)
            await db.commit()

    async def _seed_goals(self) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            for goal in SEED_GOALS:
                await db.execute("""
                    INSERT OR IGNORE INTO goals VALUES (?,?,?,?,?,?,?,?,?,?)
                """, (
                    goal.id, goal.name, goal.description, goal.category,
                    goal.status.value, goal.progress, goal.credits_required,
                    goal.created_at, goal.activated_at, goal.completed_at,
                ))
            await db.commit()

    async def _persist_goal(self, goal: Goal) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT OR REPLACE INTO goals VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (
                goal.id, goal.name, goal.description, goal.category,
                goal.status.value, goal.progress, goal.credits_required,
                goal.created_at, goal.activated_at, goal.completed_at,
            ))
            await db.commit()

    async def _load_goals(self) -> list[Goal]:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute("SELECT * FROM goals ORDER BY created_at") as cur:
                rows = await cur.fetchall()
        return [
            Goal(
                id=r[0], name=r[1], description=r[2] or "",
                category=r[3], status=GoalStatus(r[4]),
                progress=r[5], credits_required=r[6],
                created_at=r[7], activated_at=r[8], completed_at=r[9],
            )
            for r in rows
        ]
