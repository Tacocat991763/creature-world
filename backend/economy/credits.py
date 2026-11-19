"""
EconomySystem — in-world credits.

Luma earns credits by "working" (interacting with job objects in the world,
or when the LLM awards economy_earn in a narrative output).
Credits are spent to unlock goal planning.

The ledger is a single-row SQLite record with a JSON transaction log.
"""
from __future__ import annotations
import asyncio
import json
import time
from dataclasses import dataclass
from typing import Optional

import aiosqlite


@dataclass
class Transaction:
    amount: int           # positive = earn, negative = spend
    reason: str
    timestamp: float


class EconomySystem:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._balance: int = 0
        self._lifetime_earned: int = 0

    # ── lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        await self._init_db()
        await self._load()
        print(f"[Economy] Balance: {self._balance} credits "
              f"(lifetime earned: {self._lifetime_earned})")

    async def stop(self) -> None:
        pass

    # ── public API ────────────────────────────────────────────────────────────

    @property
    def balance(self) -> int:
        return self._balance

    @property
    def lifetime_earned(self) -> int:
        return self._lifetime_earned

    async def earn(self, amount: int, reason: str) -> int:
        """Add credits. Returns new balance."""
        if amount <= 0:
            return self._balance
        self._balance += amount
        self._lifetime_earned += amount
        await self._append_transaction(Transaction(amount, reason, time.time()))
        await self._save()
        return self._balance

    async def spend(self, amount: int, reason: str) -> bool:
        """Deduct credits. Returns True if successful, False if insufficient."""
        if amount <= 0:
            return True
        if self._balance < amount:
            return False
        self._balance -= amount
        await self._append_transaction(Transaction(-amount, reason, time.time()))
        await self._save()
        return True

    async def can_afford(self, amount: int) -> bool:
        return self._balance >= amount

    def status(self) -> dict:
        return {
            "balance": self._balance,
            "lifetime_earned": self._lifetime_earned,
        }

    # ── DB ────────────────────────────────────────────────────────────────────

    async def _init_db(self) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS economy (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    credits INTEGER NOT NULL DEFAULT 0,
                    lifetime_earned INTEGER NOT NULL DEFAULT 0,
                    transactions TEXT NOT NULL DEFAULT '[]'
                )
            """)
            # Ensure the single row exists
            await db.execute("""
                INSERT OR IGNORE INTO economy (id, credits, lifetime_earned, transactions)
                VALUES (1, 0, 0, '[]')
            """)
            await db.commit()

    async def _load(self) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT credits, lifetime_earned FROM economy WHERE id=1"
            ) as cur:
                row = await cur.fetchone()
        if row:
            self._balance = row[0]
            self._lifetime_earned = row[1]

    async def _save(self) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE economy SET credits=?, lifetime_earned=? WHERE id=1",
                (self._balance, self._lifetime_earned),
            )
            await db.commit()

    async def _append_transaction(self, tx: Transaction) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT transactions FROM economy WHERE id=1"
            ) as cur:
                row = await cur.fetchone()
            txns: list = json.loads(row[0]) if row else []
            txns.append({
                "amount": tx.amount,
                "reason": tx.reason,
                "timestamp": tx.timestamp,
            })
            # Keep last 200 transactions
            txns = txns[-200:]
            await db.execute(
                "UPDATE economy SET transactions=? WHERE id=1",
                (json.dumps(txns),),
            )
            await db.commit()
