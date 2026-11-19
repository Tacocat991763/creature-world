"""Tests for memory persistence and retrieval."""
import pytest
from backend.memory.episodic import EpisodicMemory
from backend.memory.long_term import LongTermMemory
from backend.memory.retrieval import MemoryRetrieval
from backend.world.persistence import init_db


@pytest.fixture
async def db(tmp_path):
    path = str(tmp_path / "mem.db")
    await init_db(path)
    return path


@pytest.mark.asyncio
async def test_episodic_store_and_retrieve(db):
    mem = EpisodicMemory(db)
    mem_id = await mem.store(
        content="Found a beautiful flower",
        importance=0.7,
        sim_time=100.0,
        location={"x": 40, "y": 65},
        stimulation_snapshot={"reward": 0.5, "curiosity": 0.4},
    )
    results = await mem.retrieve_recent(n=5)
    contents = [r["content"] for r in results]
    assert "Found a beautiful flower" in contents


@pytest.mark.asyncio
async def test_long_term_store_and_retrieve(db):
    mem = LongTermMemory(db)
    await mem.store("Humans sometimes give gifts", importance=0.8)
    results = await mem.retrieve_all(min_importance=0.5)
    assert any("gifts" in r["content"] for r in results)


@pytest.mark.asyncio
async def test_memory_decay(db):
    mem = EpisodicMemory(db)
    await mem.store("Low importance thing", importance=0.06, sim_time=0.0)
    await mem.decay(factor=0.5)
    results = await mem.retrieve_recent(n=100)
    # Very low importance * 0.5 decay = 0.03 < 0.05 threshold → should be pruned
    contents = [r["content"] for r in results]
    assert "Low importance thing" not in contents


@pytest.mark.asyncio
async def test_retrieval_combines_sources(db):
    retrieval = MemoryRetrieval(db)
    await retrieval.store_episodic("Met a stranger", importance=0.6, sim_time=50.0)
    await retrieval.long_term.store("I like trees", importance=0.5)
    results = await retrieval.retrieve(limit=10)
    contents = [r["content"] for r in results]
    assert "Met a stranger" in contents
    assert "I like trees" in contents
