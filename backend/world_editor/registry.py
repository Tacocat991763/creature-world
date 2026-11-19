"""Registry of applied world extensions (in-memory + DB)."""
from __future__ import annotations
import json
import time
import uuid
import aiosqlite
from .extension_schema import WorldExtension


class ExtensionRegistry:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._applied: dict[str, WorldExtension] = {}

    async def save(self, ext: WorldExtension) -> str:
        ext_id = str(uuid.uuid4())[:12]
        ext.id = ext_id
        self._applied[ext_id] = ext
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO world_extensions VALUES (?,?,?,?,?,?,?)",
                (ext_id, time.time(), ext.object_def.name if ext.object_def else ext.mechanic_def.name,
                 ext.model_dump_json(), True, False, ext.version),
            )
            await db.commit()
        return ext_id

    async def rollback(self, ext_id: str) -> None:
        self._applied.pop(ext_id, None)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE world_extensions SET rolled_back=1 WHERE id=?", (ext_id,)
            )
            await db.commit()

    async def load_all(self) -> list[WorldExtension]:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT id, schema_json FROM world_extensions WHERE applied=1 AND rolled_back=0"
            ) as cur:
                rows = await cur.fetchall()
        exts = []
        for row in rows:
            try:
                ext = WorldExtension.model_validate_json(row[1])
                ext.id = row[0]
                exts.append(ext)
                self._applied[ext.id] = ext
            except Exception as e:
                print(f"[ExtensionRegistry] failed to load extension {row[0]}: {e}")
        return exts
