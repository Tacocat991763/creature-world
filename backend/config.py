from __future__ import annotations
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env", override=False)


class Config:
    # OpenAI
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_world_editor_model: str = os.getenv("OPENAI_WORLD_EDITOR_MODEL", "gpt-4o")

    # Local LLM
    local_llm_base_url: str = os.getenv("LOCAL_LLM_BASE_URL", "http://localhost:11434/v1")
    local_llm_model: str = os.getenv("LOCAL_LLM_MODEL", "llama3.3:70b")
    local_llm_api_key: str = os.getenv("LOCAL_LLM_API_KEY", "ollama")

    # World dimensions
    world_width: float = float(os.getenv("WORLD_WIDTH", "100.0"))
    world_height: float = float(os.getenv("WORLD_HEIGHT", "100.0"))

    # Simulation frequencies
    sim_hz: float = float(os.getenv("SIM_HZ", "25"))
    movement_hz: float = float(os.getenv("MOVEMENT_HZ", "8"))
    stimulation_hz: float = float(os.getenv("STIMULATION_HZ", "15"))
    llm_interval_seconds: float = float(os.getenv("LLM_INTERVAL_SECONDS", "6.0"))
    memory_consolidation_minutes: float = float(os.getenv("MEMORY_CONSOLIDATION_MINUTES", "5.0"))

    # Database
    db_path: str = os.getenv("DB_PATH", "creature_world.db")

    # Server
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))

    # Day/night: 1 real minute = 1 game hour (24 min = 1 full day)
    game_hours_per_real_second: float = 1.0 / 60.0


cfg = Config()
