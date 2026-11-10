// A small stand-in for the Cloudflare D1 binding on top of Node's built-in SQLite (node:sqlite, Node 22.13+).
// D1 is SQLite, so the real migration file and the Worker's real SQL run unchanged. Offline, no wrangler.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) {
    for (const a of args) if (a === undefined || typeof a === 'boolean' || (typeof a === 'object' && a !== null)) throw new TypeError(`D1_TYPE_ERROR: type '${typeof a}' not supported for value '${a}'`);
    return new Stmt(this.db, this.sql, args);
  }
  #s() { return this.db.prepare(this.sql); }
  async first(col) {
    const row = this.#s().get(...this.args);
    if (!row) return null;
    const plain = { ...row };
    return col ? plain[col] : plain;
  }
  async all() { return { success: true, results: this.#s().all(...this.args).map((r) => ({ ...r })), meta: {} }; }
  async run() {
    const r = this.#s().run(...this.args);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function createD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  const dir = new URL('../../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.all());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql) { db.exec(sql); return { count: 1 }; },
  };
}
