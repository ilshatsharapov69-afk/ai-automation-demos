// A small Cloudflare D1 stand-in on Node's built-in SQLite (node:sqlite), so tests and the local preview run
// offline with no wrangler and no native modules. Covers the D1 surface this project uses:
// prepare().bind().first()/all()/run(), db.batch() (atomic) and db.exec().
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const READ = /^\s*(SELECT|WITH|PRAGMA)\b/i;
const norm = (args) => args.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
const plain = (row) => (row ? { ...row } : null);

class Statement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Statement(this.db, this.sql, norm(args));
  }
  _exec() {
    const st = this.db.prepare(this.sql);
    if (READ.test(this.sql)) return { success: true, results: st.all(...this.args).map(plain), meta: { changes: 0 } };
    const r = st.run(...this.args);
    return { success: true, results: [], meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
  }
  async first(col) {
    const row = plain(this.db.prepare(this.sql).get(...this.args));
    if (!row) return null;
    return col ? row[col] : row;
  }
  async all() {
    return this._exec();
  }
  async run() {
    return this._exec();
  }
}

export class D1Sqlite {
  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file);
  }
  prepare(sql) {
    return new Statement(this.db, sql);
  }
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const out = statements.map((s) => s._exec());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql) {
    this.db.exec(sql);
    return { count: 1 };
  }
  /** Apply every migrations/*.sql in name order. */
  migrate(dir) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) this.db.exec(readFileSync(new URL(f, dir), 'utf8'));
    return this;
  }
}
