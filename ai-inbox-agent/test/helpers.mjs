// Offline test harness: a D1-compatible shim over Node's built-in SQLite (node:sqlite, Node 22.5+),
// the real migrations, and helpers that call the Worker's fetch() in-process. No network, no wrangler, no AI.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../src/worker.js';
import { NOW } from './samples.js';

const clean = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a.map(clean)),
    async first(col) {
      const r = db.prepare(sql).get(...args);
      const o = r ? { ...r } : null;
      return col && o ? o[col] : o;
    },
    async all() { return { results: db.prepare(sql).all(...args).map((r) => ({ ...r })), success: true }; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}

export const OWNER = 900001;
export const ADMIN = 'test-admin-key';

export function makeEnv(over = {}) {
  return { DB: makeD1(), OWNER_CHAT_ID: String(OWNER), OWNER_LANG: 'en', ADMIN_KEY: ADMIN, DEMO_MODE: 'on', NOW_OVERRIDE: NOW, ...over };
}

export async function call(env, method, path, { json, form, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (json !== undefined) { init.body = JSON.stringify(json); init.headers['Content-Type'] = 'application/json'; }
  if (form !== undefined) { init.body = new URLSearchParams(form).toString(); init.headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
  const res = await worker.fetch(new Request('https://inbox.example.test' + path, init), env);
  const ct = res.headers.get('Content-Type') || '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, body, headers: res.headers };
}

/** GET as the owner (admin key): sees every row, not just the public demo's. */
export const asOwner = (env, path = '/api/requests') => call(env, 'GET', path, { headers: { Authorization: `Bearer ${ADMIN}` } });

let upd = 1;
let msgId = 1;
export function tgMessage(from, text) {
  return { update_id: upd++, message: { message_id: msgId++, from, chat: { id: from.id, type: 'private' }, date: 0, text } };
}
export function tgTap(from, data, message) {
  return { update_id: upd++, callback_query: { id: String(upd), from, data, message: { message_id: message?.message_id ?? 1, chat: { id: message?.chat_id ?? from.id } } } };
}

/** Post one sample through its own channel. */
export async function postSample(env, s) {
  if (s.channel === 'form') return call(env, 'POST', '/api/form', { json: s.in });
  if (s.channel === 'email') return call(env, 'POST', '/api/email', { json: s.in });
  return call(env, 'POST', '/telegram', { json: tgMessage(s.in.from, s.in.text) });
}

/** A fake Workers AI binding: returns canned outputs or throws. */
export function fakeAi(handler) {
  const calls = [];
  return { calls, async run(model, input) { calls.push({ model, input }); return handler(input, calls.length); } };
}
