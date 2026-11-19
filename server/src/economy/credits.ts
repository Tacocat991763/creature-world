import { Database } from "bun:sqlite"

export class EconomySystem {
  private _balance = 0
  private _lifetimeEarned = 0
  private _db: Database

  constructor(db: Database) {
    this._db = db
    this._initDb()
    this._load()
    console.log(`[Economy] Balance: ${this._balance} credits (lifetime: ${this._lifetimeEarned})`)
  }

  get balance() { return this._balance }
  get lifetimeEarned() { return this._lifetimeEarned }

  earn(amount: number, reason: string): number {
    if (amount <= 0) return this._balance
    this._balance += amount
    this._lifetimeEarned += amount
    this._appendTx(amount, reason)
    this._save()
    return this._balance
  }

  spend(amount: number, reason: string): boolean {
    if (amount <= 0) return true
    if (this._balance < amount) return false
    this._balance -= amount
    this._appendTx(-amount, reason)
    this._save()
    return true
  }

  canAfford(amount: number) { return this._balance >= amount }

  status() { return { balance: this._balance, lifetime_earned: this._lifetimeEarned } }

  private _initDb() {
    this._db.run(`
      CREATE TABLE IF NOT EXISTS economy (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        credits INTEGER NOT NULL DEFAULT 0,
        lifetime_earned INTEGER NOT NULL DEFAULT 0,
        transactions TEXT NOT NULL DEFAULT '[]'
      )
    `)
    this._db.run(`INSERT OR IGNORE INTO economy (id, credits, lifetime_earned, transactions) VALUES (1, 0, 0, '[]')`)
  }

  private _load() {
    const row = this._db.query<{ credits: number; lifetime_earned: number }, []>(
      "SELECT credits, lifetime_earned FROM economy WHERE id=1"
    ).get()
    if (row) { this._balance = row.credits; this._lifetimeEarned = row.lifetime_earned }
  }

  private _save() {
    this._db.run("UPDATE economy SET credits=?, lifetime_earned=? WHERE id=1", [this._balance, this._lifetimeEarned])
  }

  private _appendTx(amount: number, reason: string) {
    const row = this._db.query<{ transactions: string }, []>("SELECT transactions FROM economy WHERE id=1").get()
    const txns: unknown[] = JSON.parse(row?.transactions ?? "[]")
    txns.push({ amount, reason, timestamp: Date.now() / 1000 })
    if (txns.length > 200) txns.splice(0, txns.length - 200)
    this._db.run("UPDATE economy SET transactions=? WHERE id=1", [JSON.stringify(txns)])
  }
}
