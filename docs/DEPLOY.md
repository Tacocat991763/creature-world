# Deploying to Hack Club Nest

## Update the running server

```bash
ssh tacocat@hackclub.app
cd ~/creature-world
git pull origin master
bash start.sh
```

## First-time setup of local LLM (optional but recommended)

Luma's conversation and narration use a local LLM. Without it, the simulation
runs but Luma can't speak. The LLM can run on any machine you control — it
doesn't have to be on Nest.

**On the machine running Ollama:**
```bash
ollama pull llama3.1:8b   # or any OpenAI-compatible model you have
ollama serve              # listens on :11434 by default
```

Then in `~/creature-world/.env` on Nest:
```
LOCAL_LLM_BASE_URL=http://<your-machine-ip>:11434/v1
LOCAL_LLM_MODEL=llama3.1:8b
LOCAL_LLM_API_KEY=ollama
```

Do NOT expose the Ollama endpoint publicly without a firewall rule or auth proxy.

## OpenAI API (world editor only)

The OpenAI API is used exclusively for world-editing (PlanningAgent).
It does NOT receive conversation or narration content.

```
OPENAI_API_KEY=sk-...
```

## Environment variables summary

| Variable | Purpose | Required |
|---|---|---|
| `LOCAL_LLM_BASE_URL` | Local LLM endpoint (OpenAI-compatible) | For conversation/narration |
| `LOCAL_LLM_MODEL` | Model name (e.g. `llama3.1:8b`) | For conversation/narration |
| `LOCAL_LLM_API_KEY` | API key for local LLM (default: `ollama`) | No |
| `OPENAI_API_KEY` | OpenAI key for world editing only | For world editing |
| `PORT` | HTTP port (default: 8000) | No |

## Database

SQLite at `~/creature-world/creature.db`. Backed up automatically via iCloud
if the folder is synced. Never delete it — it contains Luma's memories,
personality, conversation history, and world state.

Before schema changes: `cp ~/creature-world/creature.db ~/creature-world/creature.db.bak`
