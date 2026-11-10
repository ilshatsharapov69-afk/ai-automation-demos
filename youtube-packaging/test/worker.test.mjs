import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { handle, takeAiTicket } from '../src/worker.js';

const sample = readFileSync(new URL('../public/samples/cold-brew-en.txt', import.meta.url), 'utf8');
const post = (body, raw = false) => new Request('https://demo.example/api/package', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ? body : JSON.stringify(body),
});
const ASSETS = { calls: 0, async fetch() { this.calls++; return new Response('<html>page</html>', { headers: { 'Content-Type': 'text/html' } }); } };

/** In-memory stand-in for caches.default. */
function memCache() {
  const m = new Map();
  return { m, async match(req) { const v = m.get(req.url); return v ? new Response(v) : undefined; }, async put(req, res) { m.set(req.url, await res.text()); } };
}

test('POST /api/package without AI returns the offline packaging', async () => {
  const r = await worker.fetch(post({ text: sample, keyword: 'cold brew at home', lang: 'auto' }), { ASSETS });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type'), /application\/json/);
  const j = await r.json();
  assert.equal(j.source, 'stub');
  assert.equal(j.titles.length, 5);
  assert.equal(j.thumbs.length, 3);
  assert.ok(j.description.includes('0:42 Picking the beans'));
});

test('input errors: empty, bad JSON, too long, wrong method, unknown API route', async () => {
  let r = await worker.fetch(post({ text: '   ' }), {});
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'empty');
  r = await worker.fetch(post('{not json', true), {});
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'bad_json');
  r = await worker.fetch(post({ text: 'x'.repeat(60001) }), {});
  assert.equal(r.status, 413);
  r = await worker.fetch(new Request('https://demo.example/api/package'), {});
  assert.equal(r.status, 405);
  r = await worker.fetch(new Request('https://demo.example/api/nope'), {});
  assert.equal(r.status, 404);
});

test('health reports whether AI is on; AI_ENABLED="off" switches it off', async () => {
  const ai = { run: async () => ({ response: '{}' }) };
  assert.deepEqual(await (await worker.fetch(new Request('https://demo.example/api/health'), {})).json(), { ok: true, ai: false });
  assert.deepEqual(await (await worker.fetch(new Request('https://demo.example/api/health'), { AI: ai })).json(), { ok: true, ai: true });
  assert.deepEqual(await (await worker.fetch(new Request('https://demo.example/api/health'), { AI: ai, AI_ENABLED: 'off' })).json(), { ok: true, ai: false });
});

test('pages and files go to the static assets', async () => {
  const before = ASSETS.calls;
  const r = await worker.fetch(new Request('https://demo.example/'), { ASSETS });
  assert.equal(r.status, 200);
  assert.equal(ASSETS.calls, before + 1);
});

const REPLY = { titles: Array.from({ length: 5 }, (_, i) => ({ title: `Cold brew title number ${i + 1}`, reason: 'Because it works.' })), hook: 'A hook that is long enough to be used as is.', tags: ['a1', 'b2', 'c3', 'd4', 'e5'], pinned_comment: 'What is your ratio? Tell me below.', thumbnail_texts: [{ text: 'ONE' }, { text: 'TWO' }, { text: 'THREE' }] };
const countingAi = () => { const ai = { calls: 0, run: async () => { ai.calls++; return { response: REPLY }; } }; return ai; };
/** Tiny stand-in for the D1 ai_usage table (INSERT ... ON CONFLICT ... RETURNING n, and DELETE). */
function fakeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return { bind: (...a) => ({
        async first() { const n = (rows.get(a[0]) ?? 0) + 1; rows.set(a[0], n); return { n }; },
        async run() { return {}; },
      }) };
    },
  };
}
const ipReq = (ip, b = body) => new Request('https://demo.example/api/package', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(b) });
const body = { text: sample, keyword: 'cold brew at home' };

test('identical input is answered from instance memory: one AI call (works on workers.dev, no Cache API)', async () => {
  const ai = countingAi();
  const env = { AI: ai, AI_MODEL: '@cf/test/model', DB: fakeDb() };
  const deps = { cache: null, memory: new Map() };
  const first = await (await handle(post(body), env, deps)).json();
  assert.equal(first.source, 'ai');
  assert.equal(first.cached, undefined);
  const second = await (await handle(post(body), env, deps)).json();
  assert.equal(second.cached, true);
  assert.equal(ai.calls, 1);
  assert.deepEqual({ ...second, cached: undefined, quota: undefined }, { ...first, cached: undefined, quota: undefined });
  await handle(post({ ...body, keyword: 'other keyword' }), env, deps);
  assert.equal(ai.calls, 2, 'different input -> new AI call');
});

test('Cache API (custom domain) serves a fresh instance with empty memory', async () => {
  const ai = countingAi();
  const env = { AI: ai, AI_MODEL: '@cf/test/model', DB: fakeDb() };
  const cache = memCache();
  await handle(post(body), env, { cache, memory: new Map() });
  assert.equal(cache.m.size, 1);
  const again = await (await handle(post(body), env, { cache, memory: new Map() })).json();
  assert.equal(again.cached, true);
  assert.equal(ai.calls, 1);
});

test('failed AI (stub answer) is not cached anywhere, so the next request tries the AI again', async () => {
  const failing = { AI: { run: async () => { throw new Error('down'); } }, DB: fakeDb() };
  const cache = memCache();
  const memory = new Map();
  const r = await (await handle(post(body), failing, { cache, memory })).json();
  assert.equal(r.source, 'stub');
  assert.equal(r.note, 'ai_error');
  assert.equal(cache.m.size, 0);
  assert.equal(memory.size, 0);
});

test('per-IP cap: the 6th AI run in an hour from one address gets the offline generator and a limit note', async () => {
  const ai = countingAi();
  const env = { AI: ai, AI_MODEL: '@cf/test/model', DB: fakeDb(), AI_PER_IP_HOUR: '5', AI_GLOBAL_DAY: '60' };
  const deps = { cache: null, memory: new Map() };
  for (let i = 0; i < 5; i++) {
    const r = await (await handle(ipReq('1.2.3.4', { ...body, keyword: `k${i}` }), env, deps)).json();
    assert.equal(r.source, 'ai');
    assert.equal(r.quota.ipLeft, 4 - i);
  }
  const sixth = await (await handle(ipReq('1.2.3.4', { ...body, keyword: 'k6' }), env, deps)).json();
  assert.equal(sixth.source, 'stub');
  assert.equal(sixth.note, 'ai_ip_limit');
  assert.equal(sixth.titles.length, 5);
  assert.equal(ai.calls, 5);
  const other = await (await handle(ipReq('5.6.7.8', { ...body, keyword: 'k7' }), env, deps)).json();
  assert.equal(other.source, 'ai', 'another visitor is not affected');
});

test('global daily cap: after it, everybody gets the offline generator and a day-limit note', async () => {
  const ai = countingAi();
  const env = { AI: ai, AI_MODEL: '@cf/test/model', DB: fakeDb(), AI_PER_IP_HOUR: '50', AI_GLOBAL_DAY: '3' };
  const deps = { cache: null, memory: new Map() };
  const out = [];
  for (let i = 0; i < 5; i++) out.push(await (await handle(ipReq(`9.9.9.${i}`, { ...body, keyword: `g${i}` }), env, deps)).json());
  assert.deepEqual(out.map((r) => r.source), ['ai', 'ai', 'ai', 'stub', 'stub']);
  assert.equal(out[4].note, 'ai_day_limit');
  assert.equal(ai.calls, 3);
});

test('cached answers do not use the AI quota; a missing D1 binding means no AI (fail closed)', async () => {
  const ai = countingAi();
  const db = fakeDb();
  const env = { AI: ai, AI_MODEL: '@cf/test/model', DB: db };
  const deps = { cache: null, memory: new Map() };
  await handle(ipReq('1.1.1.1'), env, deps);
  const used = [...db.rows.values()].reduce((a, b) => a + b, 0);
  await handle(ipReq('1.1.1.1'), env, deps);
  assert.equal([...db.rows.values()].reduce((a, b) => a + b, 0), used);
  const noDb = await (await handle(ipReq('2.2.2.2', { ...body, keyword: 'nodb' }), { AI: ai }, deps)).json();
  assert.equal(noDb.source, 'stub');
  assert.equal(ai.calls, 1);
  assert.equal((await takeAiTicket(ipReq('3.3.3.3'), { DB: { prepare() { throw new Error('boom'); } } })).ok, false);
});
