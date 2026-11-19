"""Working memory: short sliding window of observations and thoughts."""
from __future__ import annotations
from collections import deque
from typing import Any


class WorkingMemory:
    def __init__(self, maxlen: int = 50):
        self._items: deque[dict[str, Any]] = deque(maxlen=maxlen)

    def add(self, item: dict[str, Any]) -> None:
        self._items.append(item)

    def recent(self, n: int = 10) -> list[dict]:
        return list(self._items)[-n:]

    def clear(self) -> None:
        self._items.clear()
