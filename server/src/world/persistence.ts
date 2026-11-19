import { Database } from "bun:sqlite"
import { buildDefaultWorld, serializeWorld, deserializeWorld } from "./state"
import type { WorldState } from "./state"
import type { GameEvent } from "./events"

export function initDb(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS world_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      saved_at REAL NOT NULL,
      data TEXT NOT NULL
    )
  `)
  db.run(`
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
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      plan_text TEXT NOT NULL,
      created_at REAL NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.run("CREATE INDEX IF NOT EXISTS idx_events_time ON events(timestamp DESC)")
}

export function saveWorld(db: Database, state: WorldState) {
  const data = JSON.stringify(serializeWorld(state))
  db.run("INSERT INTO world_snapshots (saved_at, data) VALUES (?, ?)", [Date.now() / 1000, data])
  // Keep only 10 most recent snapshots
  db.run(`
    DELETE FROM world_snapshots
    WHERE id NOT IN (SELECT id FROM world_snapshots ORDER BY saved_at DESC LIMIT 10)
  `)
}

export function loadWorld(db: Database): WorldState {
  const row = db.query<{ data: string }, []>(
    "SELECT data FROM world_snapshots ORDER BY saved_at DESC LIMIT 1"
  ).get()
  if (row) {
    try { return deserializeWorld(JSON.parse(row.data)) } catch {}
  }
  return buildDefaultWorld()
}

export function persistEvent(db: Database, event: GameEvent) {
  try {
    db.run(
      "INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?)",
      [event.id, event.timestamp, event.source, event.type,
       event.entityId, event.targetId, JSON.stringify(event.payload), event.result]
    )
  } catch {}
}

export function loadRecentEvents(db: Database, n = 100): object[] {
  return db.query<any, [number]>(
    "SELECT * FROM events ORDER BY timestamp DESC LIMIT ?"
  ).all(n)
}
