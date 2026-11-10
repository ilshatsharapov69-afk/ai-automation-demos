// D1 access. Rows come back with parsed JSON fields and booleans.

export function rowOut(r) {
  if (!r) return null;
  return { ...r, hot: Boolean(r.hot), score_reasons: r.score_reasons ? JSON.parse(r.score_reasons) : [] };
}

export async function insertRequest(db, q) {
  if (q.external_id) {
    const dup = await db.prepare('SELECT * FROM requests WHERE channel = ? AND external_id = ?').bind(q.channel, q.external_id).first();
    if (dup) return { row: rowOut(dup), duplicate: true };
  }
  const cols = Object.keys(q);
  const r = await db
    .prepare(`INSERT INTO requests (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING *`)
    .bind(...cols.map((c) => (q[c] === undefined ? null : q[c])))
    .first();
  return { row: rowOut(r), duplicate: false };
}

export async function getRequest(db, id) {
  return rowOut(await db.prepare('SELECT * FROM requests WHERE id = ?').bind(Number(id)).first());
}

export async function updateRequest(db, id, fields) {
  const cols = Object.keys(fields);
  if (!cols.length) return getRequest(db, id);
  const r = await db
    .prepare(`UPDATE requests SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? RETURNING *`)
    .bind(...cols.map((c) => (fields[c] === undefined ? null : fields[c])), Number(id))
    .first();
  return rowOut(r);
}

/**
 * Who sees what. scope = null: everything (the owner). Otherwise the public demo: sample data plus the visitor's own messages.
 * @returns {{sql: string, args: any[]}} a condition to AND into WHERE
 */
export function scopeCond(scope) {
  if (!scope) return { sql: '1 = 1', args: [] };
  return { sql: "(origin = 'seed' OR (origin = 'visitor' AND visitor = ?))", args: [scope.visitor || ''] };
}

export const canSee = (row, scope) => !scope || row.origin === 'seed' || (row.origin === 'visitor' && Boolean(scope.visitor) && row.visitor === scope.visitor);

export async function listRequests(db, { category, limit = 100, scope = null } = {}) {
  const sc = scopeCond(scope);
  const conds = [sc.sql];
  const args = [...sc.args];
  if (category === 'hot') conds.push('hot = 1');
  else if (category && category !== 'all') { conds.push('category = ?'); args.push(category); }
  const { results } = await db.prepare(`SELECT * FROM requests WHERE ${conds.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...args, limit).all();
  return results.map(rowOut);
}

export async function stats(db, scope = null) {
  const sc = scopeCond(scope);
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN hot = 1 THEN 1 ELSE 0 END) AS hot,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS waiting,
        SUM(CASE WHEN category = 'lead' THEN 1 ELSE 0 END) AS lead,
        SUM(CASE WHEN category = 'support' THEN 1 ELSE 0 END) AS support,
        SUM(CASE WHEN category = 'partnership' THEN 1 ELSE 0 END) AS partnership,
        SUM(CASE WHEN category = 'spam' THEN 1 ELSE 0 END) AS spam,
        SUM(CASE WHEN classified_by = 'ai' THEN 1 ELSE 0 END) AS by_ai
       FROM requests WHERE ${sc.sql}`,
    )
    .bind(...sc.args)
    .first();
  const out = {};
  for (const [k, v] of Object.entries(r || {})) out[k] = Number(v || 0);
  return out;
}

export async function getOwnerState(db, chatId) {
  return db.prepare('SELECT * FROM owner_state WHERE chat_id = ?').bind(chatId).first();
}
export async function setOwnerState(db, chatId, editingId, nowIso) {
  await db
    .prepare('INSERT INTO owner_state (chat_id, editing_id, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(chat_id) DO UPDATE SET editing_id = ?2, updated_at = ?3')
    .bind(chatId, editingId ?? null, nowIso)
    .run();
}

/**
 * Takes one unit from a counter (key k, time bucket b) unless it already reached `cap`. Atomic in D1/SQLite.
 * @returns {Promise<boolean>} false when the cap is reached.
 */
export async function takeRate(db, k, b, cap) {
  if (!(cap > 0)) return false;
  const r = await db
    .prepare('INSERT INTO demo_rate (k, b, n) VALUES (?1, ?2, 1) ON CONFLICT(k, b) DO UPDATE SET n = n + 1 WHERE n < ?3 RETURNING n')
    .bind(k, b, cap)
    .first();
  return Boolean(r);
}

export async function rateUsed(db, k, b) {
  const r = await db.prepare('SELECT n FROM demo_rate WHERE k = ? AND b = ?').bind(k, b).first();
  return r ? r.n : 0;
}

/** Public-demo cleanup: visitors' own messages live one day, counters two days. */
export async function sweep(db, nowIso) {
  const cut = new Date(new Date(nowIso).getTime() - 24 * 3600 * 1000).toISOString();
  await db.prepare("DELETE FROM requests WHERE origin = 'visitor' AND created_at < ?").bind(cut).run();
  await db.prepare('DELETE FROM demo_rate WHERE b < ?').bind(new Date(new Date(nowIso).getTime() - 48 * 3600 * 1000).toISOString().slice(0, 10)).run();
}
