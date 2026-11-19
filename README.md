# Creature World

An autonomous simulated organism whose movement, emotions, and inner narrative emerge from independent subsystems — not an LLM choosing actions.

## Quick start

### 1. Install Python dependencies

```bash
cd Projects/creature-world
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env:
# - Set LOCAL_LLM_BASE_URL to your Ollama/llama.cpp/vLLM endpoint
# - Set LOCAL_LLM_MODEL to your preferred ~20B model
# - Set OPENAI_API_KEY if you want world-creation features
```

### 3. Start the backend

```bash
python -m backend.main
# or:
uvicorn backend.main:app --reload --port 8000
```

The simulation starts immediately. The creature moves without any LLM.

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

### 5. Run tests

```bash
pytest backend/tests/ -v
```

Tests require no paid API calls and no local model download.

---

## Local LLM setup (Ollama)

```bash
ollama pull llama3.3:70b
# or any OpenAI-compatible model; set LOCAL_LLM_MODEL in .env
```

The backend gracefully falls back when the LLM is unavailable — the creature keeps moving.

---

## What you'll see

- **World canvas**: The creature (purple dot) wandering, approaching objects, being blocked by collidables. Click to place objects.
- **Neural Stimulation panel**: 8 real-time activation bars from the CTRNN.
- **Creature Thoughts**: Narrations from the local LLM as it interprets completed events.
- **Debug panel**: Raw simulation values, velocity, orientation, entity count.

---

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data-flow diagram, stimulation network connection table, and scheduling overview.

**Central invariant:** The LLM receives observations of events that have already occurred. Its explanations of why the creature moved are retrospective interpretations — they may not match the movement model's actual causal mechanism. This distinction is preserved by design.
