"""
Creation request queue.

The local LLM puts requests here.
The OpenAI world editor consumes them.
The local LLM cannot directly apply changes.
"""
from __future__ import annotations
import asyncio
import json
import time
import uuid
import aiosqlite
from ..cognition.interpretations import CreationRequest


class CreationQueue:
    _instance: "CreationQueue | None" = None

    def __init__(self, db_path: str = "creature_world.db"):
        self.db_path = db_path
        self._queue: asyncio.Queue[CreationRequest] = asyncio.Queue()
        self._seen_hashes: set[str] = set()

    @classmethod
    def instance(cls) -> "CreationQueue":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def set_instance(cls, inst: "CreationQueue") -> None:
        cls._instance = inst

    def _hash(self, req: CreationRequest) -> str:
        return f"{req.intent}:{req.description[:60]}"

    async def enqueue(self, req: CreationRequest) -> None:
        h = self._hash(req)
        if h in self._seen_hashes:
            return   # deduplicate
        self._seen_hashes.add(h)
        req_id = str(uuid.uuid4())[:12]
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO creation_requests VALUES (?,?,?,?,?,?,?)",
                (req_id, time.time(), req.intent, req.description, req.reason, "pending", None),
            )
            await db.commit()
        await self._queue.put(req)

    async def get(self) -> CreationRequest:
        return await self._queue.get()

    async def pending(self) -> list[dict]:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT id,intent,description,reason,created_at FROM creation_requests "
                "WHERE status='pending' ORDER BY created_at ASC"
            ) as cur:
                rows = await cur.fetchall()
        return [{"id": r[0], "intent": r[1], "description": r[2], "reason": r[3], "created_at": r[4]} for r in rows]

    async def mark_done(self, description: str, extension_id: str) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE creation_requests SET status='done', result_extension_id=? "
                "WHERE description=? AND status='pending'",
                (extension_id, description),
            )
            await db.commit()
