"""
PersonalityEngine — loads traits from SQLite, fires stimulus bias into the CTRNN.

Runs at 1 Hz (much slower than CTRNN). Each tick:
  1. Applies each trait's base_bias to its channel.
  2. Scans nearby entities; if any name/type matches a trait's keywords, fires proximity_bias.
"""
from __future__ import annotations
import asyncio
import json
import time
from typing import TYPE_CHECKING

import aiosqlite

from ..stimulation.stimuli import StimulusPacket
from .traits import SEED_TRAITS, Trait

if TYPE_CHECKING:
    from ..world.engine import WorldEngine
    from ..stimulation.network import StimulationNetwork


class PersonalityEngine:
    def __init__(
        self,
        engine: "WorldEngine",
        stimulation: "StimulationNetwork",
        db_path: str,
    ):
        self.engine = engine
        self.stimulation = stimulation
        self.db_path = db_path
        self._traits: list[Trait] = []
        self._running = False

    # ── lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        await self._init_db()
        await self._seed_traits()
        self._traits = await self._load_traits()
        self._running = True
        asyncio.create_task(self._loop())
        print(f"[Personality] Loaded {len(self._traits)} trait(s): "
              f"{', '.join(t.name for t in self._traits)}")

    async def stop(self) -> None:
        self._running = False

    # ── loop ──────────────────────────────────────────────────────────────────

    async def _loop(self) -> None:
        while self._running:
            t0 = time.monotonic()
            try:
                await self._tick()
            except Exception as exc:
                print(f"[Personality] tick error: {exc}")
            elapsed = time.monotonic() - t0
            await asyncio.sleep(max(0.0, 1.0 - elapsed))

    async def _tick(self) -> None:
        creature = self.engine.state.creature
        entities = self.engine.state.entities

        for trait in self._traits:
            bias = trait.base_bias

            # Proximity check
            if trait.proximity_radius > 0 and trait.trigger_keywords:
                for entity in entities.values():
                    if not entity.alive:
                        continue
                    combined = (entity.name + " " + entity.type).lower()
                    if any(kw in combined for kw in trait.trigger_keywords):
                        dist = creature.position.distance_to(entity.position)
                        if dist <= trait.proximity_radius:
                            # Scale by inverse distance
                            factor = max(0.0, 1.0 - dist / trait.proximity_radius)
                            bias += trait.proximity_bias * factor
                            break

            if abs(bias) < 1e-4:
                continue

            # Build a StimulusPacket with just the one channel set
            packet_kwargs = {ch: 0.0 for ch in [
                "reward", "distress", "curiosity", "attachment",
                "arousal", "fatigue", "threat", "familiarity"
            ]}
            if trait.channel in packet_kwargs:
                packet_kwargs[trait.channel] = float(bias)
                self.stimulation.inject(StimulusPacket(**packet_kwargs))

    # ── DB ────────────────────────────────────────────────────────────────────

    async def _init_db(self) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS personality_traits (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    channel TEXT NOT NULL,
                    base_bias REAL NOT NULL DEFAULT 0.0,
                    proximity_bias REAL NOT NULL DEFAULT 0.0,
                    proximity_radius REAL NOT NULL DEFAULT 0.0,
                    trigger_keywords TEXT NOT NULL DEFAULT '[]',
                    created_at REAL NOT NULL
                )
            """)
            await db.commit()

    async def _seed_traits(self) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            for trait in SEED_TRAITS:
                await db.execute("""
                    INSERT OR IGNORE INTO personality_traits
                    VALUES (?,?,?,?,?,?,?,?,?)
                """, (
                    trait.id, trait.name, trait.description,
                    trait.channel, trait.base_bias,
                    trait.proximity_bias, trait.proximity_radius,
                    json.dumps(trait.trigger_keywords), trait.created_at,
                ))
            await db.commit()

    async def _load_traits(self) -> list[Trait]:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute("SELECT * FROM personality_traits") as cur:
                rows = await cur.fetchall()
        return [
            Trait(
                id=r[0], name=r[1], description=r[2] or "",
                channel=r[3], base_bias=r[4], proximity_bias=r[5],
                proximity_radius=r[6],
                trigger_keywords=json.loads(r[7]),
                created_at=r[8],
            )
            for r in rows
        ]

    # ── public ────────────────────────────────────────────────────────────────

    def get_traits_summary(self) -> list[dict]:
        """For injecting into LLM observation context."""
        return [
            {"name": t.name, "description": t.description, "channel": t.channel}
            for t in self._traits
        ]

    async def add_trait(self, trait: Trait) -> None:
        """Add a new trait (called by world editor on LLM proposal)."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT OR REPLACE INTO personality_traits VALUES (?,?,?,?,?,?,?,?,?)
            """, (
                trait.id, trait.name, trait.description,
                trait.channel, trait.base_bias, trait.proximity_bias,
                trait.proximity_radius, json.dumps(trait.trigger_keywords),
                trait.created_at,
            ))
            await db.commit()
        self._traits = await self._load_traits()
