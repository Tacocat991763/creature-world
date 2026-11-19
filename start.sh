#!/bin/bash
# Start creature-world in the background on the Nest server.
# Usage: bash ~/creature-world/start.sh

cd ~/creature-world
export PATH="$HOME/.bun/bin:$PATH"
export PORT="${PORT:-80}"

# Load .env if present (put OPENAI_API_KEY here)
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

LOG="$HOME/creature-world/server.log"

# Kill old instance if running
OLD_PID=$(cat ~/creature-world/server.pid 2>/dev/null)
if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
  echo "==> Stopping old server (pid $OLD_PID)..."
  kill "$OLD_PID"
  sleep 1
fi

echo "==> Starting creature-world on port $PORT..."
nohup bun run server/src/main.ts > "$LOG" 2>&1 &
echo $! > ~/creature-world/server.pid
sleep 2

NEW_PID=$(cat ~/creature-world/server.pid)
if kill -0 "$NEW_PID" 2>/dev/null; then
  echo "==> Running (pid $NEW_PID)"
  echo "    Logs:   tail -f $LOG"
  echo "    Visit:  https://tacocat.hackclub.app"
else
  echo "ERROR: server failed to start. Check logs: cat $LOG"
  exit 1
fi
