"""Episodic memory: meaningful experiences stored to SQLite."""
from __future__ import annotations
import json
import time
import uuid
import aiosqlite


class EpisodicMemory:
    def __init__(self, db_path: str):
        self.db_path = db_path

    async def store(
        self,
        content: str,
        importance: float,
        sim_time: float,
        location: dict | None = None,
        stimulation_snapshot: dict | None = None,
        entity_refs: list[str] | None = None,
    ) -> str:
        mem_id = str(uuid.uuid4())[:12]
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO memories VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    mem_id, "episodic", time.time(), importance, content,
                    sim_time,
                    json.dumps(location or {}),
                    json.dumps(stimulation_snapshot or {}),
                    json.dumps(entity_refs or []),
                    1.0,
                ),
            )
            await db.commit()
        return mem_id

    async def retrieve_recent(self, n: int = 10) -> list[dict]:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT id,content,importance,created_at,sim_time,stimulation_snapshot "
                "FROM memories WHERE category='episodic' "
                "ORDER BY created_at DESC LIMIT ?",
                (n,),
            ) as cur:
                rows = await cur.fetchall()
        return [
            {
                "id": r[0], "content": r[1], "importance": r[2],
                "created_at": r[3], "sim_time": r[4],
                "stimulation": json.loads(r[5] or "{}"),
            }
            for r in rows
        ]

    async def decay(self, factor: float = 0.99) -> None:
        """Slightly reduce importance of old memories."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE memories SET decay = decay * ? WHERE category='episodic'",
                (factor,),
            )
            # Remove very decayed, low-importance memories
            await db.execute(
                "DELETE FROM memories WHERE category='episodic' AND decay * importance < 0.05"
            )
            await db.commit()
