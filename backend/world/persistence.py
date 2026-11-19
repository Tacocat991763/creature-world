from __future__ import annotations
import json
import time
import aiosqlite
from pathlib import Path
from .state import WorldState, build_default_world
from .entities import Entity
from ..world.events import GameEvent


DB_PATH: str = "creature_world.db"


async def init_db(db_path: str = DB_PATH) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS world_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                saved_at REAL NOT NULL,
                data TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                timestamp REAL NOT NULL,
                source TEXT NOT NULL,
                type TEXT NOT NULL,
                entity_id TEXT,
                target_id TEXT,
                payload TEXT,
                result TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                created_at REAL NOT NULL,
                importance REAL NOT NULL,
                content TEXT NOT NULL,
                sim_time REAL,
                location TEXT,
                stimulation_snapshot TEXT,
                entity_refs TEXT,
                decay REAL DEFAULT 1.0
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS world_extensions (
                id TEXT PRIMARY KEY,
                created_at REAL NOT NULL,
                name TEXT NOT NULL,
                schema_json TEXT NOT NULL,
                applied BOOLEAN NOT NULL DEFAULT 0,
                rolled_back BOOLEAN NOT NULL DEFAULT 0,
                version INTEGER NOT NULL DEFAULT 1
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS creation_requests (
                id TEXT PRIMARY KEY,
                created_at REAL NOT NULL,
                intent TEXT NOT NULL,
                description TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                result_extension_id TEXT
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_events_time ON events(timestamp DESC)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_memories_cat ON memories(category, importance DESC)
        """)
        await db.commit()


async def save_world(state: WorldState, db_path: str = DB_PATH) -> None:
    data = state.model_dump_json()
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO world_snapshots (saved_at, data) VALUES (?, ?)",
            (time.time(), data),
        )
        # Keep only the latest 10 snapshots
        await db.execute("""
            DELETE FROM world_snapshots
            WHERE id NOT IN (
                SELECT id FROM world_snapshots ORDER BY saved_at DESC LIMIT 10
            )
        """)
        await db.commit()


async def load_world(db_path: str = DB_PATH) -> WorldState:
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            "SELECT data FROM world_snapshots ORDER BY saved_at DESC LIMIT 1"
        ) as cur:
            row = await cur.fetchone()
    if row:
        return WorldState.model_validate_json(row[0])
    return build_default_world()


async def persist_event(event: GameEvent, db_path: str = DB_PATH) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?)",
            (
                event.id, event.timestamp, event.source, event.type,
                event.entity_id, event.target_id,
                json.dumps(event.payload), event.result,
            ),
        )
        await db.commit()


async def load_recent_events(n: int = 100, db_path: str = DB_PATH) -> list[GameEvent]:
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            "SELECT id,timestamp,source,type,entity_id,target_id,payload,result "
            "FROM events ORDER BY timestamp DESC LIMIT ?",
            (n,),
        ) as cur:
            rows = await cur.fetchall()
    return [
        GameEvent(
            id=r[0], timestamp=r[1], source=r[2], type=r[3],
            entity_id=r[4] or "", target_id=r[5] or "",
            payload=json.loads(r[6] or "{}"), result=r[7] or "success",
        )
        for r in rows
    ]
