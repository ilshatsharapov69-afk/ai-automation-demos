// Offline harness: a D1-compatible shim over Node's built-in SQLite (node:sqlite, with FTS5), the real migrations,
// the real corpus loaded through the real chunker, and fakes for Workers AI and Vectorize. No network, no wrangler.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../src/worker.js';
import { DOCS } from '../data/docs.js';
import { chunkCorpus } from '../src/chunker.js';

const clean = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a.map(clean)),
    async first(col) { const r = db.prepare(sql).get(...args); const o = r ? { ...r } : null; return col && o ? o[col] : o; },
    async all() { return { results: db.prepare(sql).all(...args).map((r) => ({ ...r })), success: true }; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}

/** The same rows `npm run ingest` writes, without the vectors. */
export function loadCorpus(d1) {
  const titleOf = new Map(DOCS.map((d) => [d.id, d.title]));
  for (const d of DOCS) d1.raw.prepare('INSERT INTO docs (id, lang, category, title, body) VALUES (?,?,?,?,?)').run(d.id, d.lang, d.category, d.title, d.body);
  for (const c of chunkCorpus(DOCS)) {
    d1.raw.prepare('INSERT INTO chunks (id, doc_id, idx, heading, start, "end", text) VALUES (?,?,?,?,?,?,?)').run(c.id, c.doc_id, c.idx, c.heading, c.start, c.end, c.text);
    d1.raw.prepare('INSERT INTO chunks_fts (chunk_id, title, heading, text) VALUES (?,?,?,?)').run(c.id, titleOf.get(c.doc_id), c.heading, c.text);
  }
}

/** Fake Workers AI: embeddings are a constant vector, chat answers come from `chat(input, callNo)`. */
export function fakeAi(chat = () => ({ response: 'ok [1]' })) {
  const calls = [];
  return {
    calls,
    chatCalls: () => calls.filter((c) => !/bge/.test(c.model)),
    async run(model, input) {
      calls.push({ model, input });
      if (/bge/.test(model)) return { data: [[0.1, 0.2, 0.3]] };
      return chat(input, calls.filter((c) => !/bge/.test(c.model)).length);
    },
  };
}

/** Fake Vectorize returning scripted matches [{id, score}]. */
export function fakeVectorize(matches) {
  return { async query() { return { matches }; } };
}

export const ADMIN = 'test-admin-key';

export function makeEnv(over = {}) {
  const DB = makeD1();
  loadCorpus(DB);
  return {
    DB, ADMIN_KEY: ADMIN, EMBED_MODEL: '@cf/baai/bge-m3', CHAT_MODEL: 'test-chat-model',
    PER_IP_HOURLY: '6', DAILY_CAP: '80', MIN_VECTOR_SCORE: '0.5',
    NOW_OVERRIDE: String(Date.UTC(2026, 10, 6, 10, 0, 0)),
    AI: fakeAi(), VECTORIZE: fakeVectorize([{ id: 'd01#0', score: 0.74 }, { id: 'd01#1', score: 0.6 }]),
    ...over,
  };
}

export async function call(env, method, path, { json, headers = {} } = {}) {
  const init = { method, headers: { 'CF-Connecting-IP': '203.0.113.7', ...headers } };
  if (json !== undefined) { init.body = JSON.stringify(json); init.headers['Content-Type'] = 'application/json'; }
  const res = await worker.fetch(new Request('https://rag.example.test' + path, init), env);
  const ct = res.headers.get('Content-Type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text() };
}

export const ask = (env, question, opts = {}) => call(env, 'POST', '/api/ask', { json: { question }, ...opts });
