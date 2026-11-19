import { Database } from "bun:sqlite"

export interface EpisodicMemory {
  id: string
  content: string
  importance: number
  simTime: number
  location: { x: number; y: number }
  stimSnapshot: number[]
  createdAt: number
}

export class MemoryStore {
  private _db: Database

  constructor(db: Database) {
    this._db = db
    this._initDb()
  }

  storeEpisodic(
    content: string,
    importance: number,
    simTime: number,
    location: { x: number; y: number },
    stimSnapshot: number[]
  ): void {
    const id = `mem_${Math.random().toString(36).slice(2, 12)}`
    this._db.run(`
      INSERT INTO memories (id, category, created_at, importance, content, sim_time, location, stimulation_snapshot)
      VALUES (?,?,?,?,?,?,?,?)
    `, [id, "episodic", Date.now() / 1000, importance, content, simTime,
        JSON.stringify(location), JSON.stringify(stimSnapshot)])
  }

  /** Retrieve the most recent/important memories as strings for LLM context. */
  retrieve(limit = 5): string[] {
    const rows = this._db.query<{ content: string }, [number]>(
      "SELECT content FROM memories WHERE category='episodic' ORDER BY importance DESC, created_at DESC LIMIT ?"
    ).all(limit)
    return rows.map(r => r.content)
  }

  /** Soft-decay all memory importances (run periodically). */
  consolidate() {
    this._db.run("UPDATE memories SET importance = importance * 0.95 WHERE category='episodic'")
    this._db.run("DELETE FROM memories WHERE importance < 0.05")
  }

  private _initDb() {
    this._db.run(`
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
    `)
    this._db.run("CREATE INDEX IF NOT EXISTS idx_mem_imp ON memories(category, importance DESC)")
  }
}
