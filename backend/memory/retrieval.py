"""Unified memory retrieval interface."""
from __future__ import annotations
import aiosqlite
from .episodic import EpisodicMemory
from .long_term import LongTermMemory
from .working import WorkingMemory


class MemoryRetrieval:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.episodic = EpisodicMemory(db_path)
        self.long_term = LongTermMemory(db_path)
        self.working = WorkingMemory()

    async def store_episodic(
        self,
        content: str,
        importance: float,
        sim_time: float,
        location: dict | None = None,
        stimulation_snapshot: dict | None = None,
    ) -> None:
        await self.episodic.store(
            content=content, importance=importance, sim_time=sim_time,
            location=location, stimulation_snapshot=stimulation_snapshot,
        )

    async def retrieve(self, query: str = "", limit: int = 5) -> list[dict]:
        """Return most relevant memories. Simple recency + importance ranking for now."""
        episodic = await self.episodic.retrieve_recent(n=limit)
        lt = await self.long_term.retrieve_all(min_importance=0.4)
        combined = episodic + lt
        # Sort by importance * decay (decay defaults to 1.0)
        combined.sort(key=lambda m: m.get("importance", 0.5), reverse=True)
        return combined[:limit]

    async def consolidate(self) -> None:
        """Periodic consolidation: decay old episodic memories."""
        await self.episodic.decay(factor=0.98)
