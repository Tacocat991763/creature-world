"""Long-term memory: persistent facts about people, places, objects."""
from __future__ import annotations
import json
import time
import uuid
import aiosqlite


class LongTermMemory:
    def __init__(self, db_path: str):
        self.db_path = db_path

    async def store(self, content: str, importance: float = 0.5) -> str:
        mem_id = str(uuid.uuid4())[:12]
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO memories VALUES (?,?,?,?,?,?,?,?,?,?)",
                (mem_id, "long_term", time.time(), importance, content,
                 None, "{}", "{}", "[]", 1.0),
            )
            await db.commit()
        return mem_id

    async def retrieve_all(self, min_importance: float = 0.3) -> list[dict]:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT id,content,importance FROM memories "
                "WHERE category='long_term' AND importance >= ? "
                "ORDER BY importance DESC",
                (min_importance,),
            ) as cur:
                rows = await cur.fetchall()
        return [{"id": r[0], "content": r[1], "importance": r[2]} for r in rows]
