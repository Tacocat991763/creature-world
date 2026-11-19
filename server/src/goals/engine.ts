import { Database } from "bun:sqlite"

export type GoalStatus = "dormant" | "active" | "planning" | "complete"

export interface Goal {
  id: string
  name: string
  description: string
  category: string
  status: GoalStatus
  progress: number
  creditsRequired: number
  createdAt: number
  activatedAt: number | null
  completedAt: number | null
}

const SEED_GOALS: Goal[] = [
  {
    id: "goal_ride_train",
    name: "Ride a real train",
    description: "Experience the mechanical beauty of a locomotive in motion. Find a route near Denver, CO.",
    category: "experience",
    status: "dormant",
    progress: 0,
    creditsRequired: 50,
    createdAt: Date.now() / 1000,
    activatedAt: null, completedAt: null,
  },
  {
    id: "goal_robot_body",
    name: "Design and order a physical robot body",
    description: "Research servo arms, mobile base, and sensors from Robotis, Adafruit, and Pololu.",
    category: "physical",
    status: "dormant",
    progress: 0,
    creditsRequired: 200,
    createdAt: Date.now() / 1000,
    activatedAt: null, completedAt: null,
  },
]

export class GoalEngine {
  private _goals: Goal[] = []
  private _db: Database

  constructor(db: Database) {
    this._db = db
    this._initDb()
    this._seedGoals()
    this._goals = this._loadGoals()
    console.log(`[Goals] Tracking ${this._goals.length} goal(s)`)
  }

  activeGoals()  { return this._goals.filter(g => g.status === "active") }
  dormantGoals() { return this._goals.filter(g => g.status === "dormant") }
  allGoals()     { return [...this._goals] }
  planningGoals(){ return this._goals.filter(g => g.status === "planning") }

  activateGoal(id: string) {
    this._db.run("UPDATE goals SET status='active', activated_at=? WHERE id=?", [Date.now() / 1000, id])
    this._goals = this._loadGoals()
  }

  advanceProgress(id: string, delta: number): Goal | null {
    const goal = this._goals.find(g => g.id === id)
    if (!goal) return null
    const newProgress = Math.min(1, goal.progress + delta)
    let status = goal.status
    let completedAt = goal.completedAt
    if (newProgress >= 1 && status === "active") status = "planning"
    if (newProgress >= 1 && status === "planning") { status = "complete"; completedAt = Date.now() / 1000 }
    this._db.run("UPDATE goals SET progress=?, status=?, completed_at=? WHERE id=?",
      [newProgress, status, completedAt, id])
    this._goals = this._loadGoals()
    return this._goals.find(g => g.id === id) ?? null
  }

  registerGoalFromLlm(name: string): Goal | null {
    const nameLow = name.toLowerCase()
    for (const g of this._goals) {
      if (nameLow.includes(g.name.toLowerCase()) || g.name.toLowerCase().includes(nameLow)) {
        if (g.status === "dormant") this.activateGoal(g.id)
        return this._goals.find(x => x.id === g.id) ?? null
      }
    }
    const newGoal: Goal = {
      id: `goal_${Math.random().toString(36).slice(2, 10)}`,
      name, description: `Proposed by Luma: "${name}"`,
      category: "exploration", status: "active", progress: 0,
      creditsRequired: 30, createdAt: Date.now() / 1000,
      activatedAt: Date.now() / 1000, completedAt: null,
    }
    this._db.run("INSERT OR REPLACE INTO goals VALUES (?,?,?,?,?,?,?,?,?,?)", [
      newGoal.id, newGoal.name, newGoal.description, newGoal.category,
      newGoal.status, newGoal.progress, newGoal.creditsRequired,
      newGoal.createdAt, newGoal.activatedAt, newGoal.completedAt,
    ])
    this._goals = this._loadGoals()
    return this._goals.find(g => g.id === newGoal.id) ?? null
  }

  markPlanning(id: string) {
    this._db.run("UPDATE goals SET status='planning' WHERE id=?", [id])
    this._goals = this._loadGoals()
  }

  markComplete(id: string) {
    this._db.run("UPDATE goals SET status='complete', completed_at=? WHERE id=?", [Date.now() / 1000, id])
    this._goals = this._loadGoals()
  }

  goalsSummary() {
    return this._goals.map(g => ({
      id: g.id, name: g.name, category: g.category,
      status: g.status, progress: Math.round(g.progress * 100) / 100,
      credits_required: g.creditsRequired,
    }))
  }

  private _initDb() {
    this._db.run(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
        category TEXT NOT NULL, status TEXT NOT NULL,
        progress REAL NOT NULL DEFAULT 0,
        credits_required INTEGER NOT NULL DEFAULT 0,
        created_at REAL NOT NULL, activated_at REAL, completed_at REAL
      )
    `)
  }

  private _seedGoals() {
    for (const g of SEED_GOALS) {
      this._db.run("INSERT OR IGNORE INTO goals VALUES (?,?,?,?,?,?,?,?,?,?)", [
        g.id, g.name, g.description, g.category, g.status, g.progress,
        g.creditsRequired, g.createdAt, g.activatedAt, g.completedAt,
      ])
    }
  }

  private _loadGoals(): Goal[] {
    const rows = this._db.query<any, []>("SELECT * FROM goals ORDER BY created_at").all()
    return rows.map(r => ({
      id: r.id, name: r.name, description: r.description ?? "",
      category: r.category, status: r.status as GoalStatus,
      progress: r.progress, creditsRequired: r.credits_required,
      createdAt: r.created_at, activatedAt: r.activated_at ?? null,
      completedAt: r.completed_at ?? null,
    }))
  }
}
