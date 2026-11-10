// Minimal Cloudflare D1 binding on top of Node's built-in SQLite (node:sqlite, Node >= 22.13), so the Worker
// code runs offline in tests and in scripts/local.mjs with the same SQL it runs on D1.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const clean = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

class Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.db, this.sql, params.map(clean)); }
  _stmt() { return this.db.prepare(this.sql); }
  async all() { return { results: this._stmt().all(...this.params).map((r) => ({ ...r })), success: true }; }
  async first(col) {
    const r = this._stmt().get(...this.params);
    if (!r) return null;
    return col ? r[col] : { ...r };
  }
  async run() {
    const s = this._stmt();
    if (/\breturning\b/i.test(this.sql)) return { results: s.all(...this.params), success: true, meta: {} };
    const info = s.run(...this.params);
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
}

export class D1Sqlite {
  constructor(file = ':memory:') { this.db = new DatabaseSync(file); }
  prepare(sql) { return new Statement(this.db, sql); }
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql) { this.db.exec(sql); return { count: 1 }; }
  migrate(dir) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) this.db.exec(readFileSync(new URL(f, dir), 'utf8'));
    return this;
  }
}
