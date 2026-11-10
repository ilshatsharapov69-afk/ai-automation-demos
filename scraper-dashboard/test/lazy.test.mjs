import { test } from 'node:test';
import assert from 'node:assert/strict';
import { D1Sqlite } from './d1-sqlite.mjs';
import { fixtureFetch } from './fixture-fetch.mjs';
import { maybeRun } from '../src/lazy.js';
import worker from '../src/worker.js';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const T0 = Date.UTC(2026, 9, 1, 0, 17);
const H = 3600000;
const freshEnv = (extra = {}) => ({ DB: new D1Sqlite().migrate(MIGRATIONS), DEMO_DRIFT: 'on', ...extra });
const count = (env) => env.DB.prepare('SELECT COUNT(*) AS n FROM runs').first('n');

test('lazy: first visit runs, a visit inside 6 h does not, a visit after 6 h does', async () => {
  const env = freshEnv();
  const f = fixtureFetch();
  const r1 = await maybeRun(env, { now: T0, fetchFn: f });
  assert.equal(r1.status, 'ok');
  assert.equal(await maybeRun(env, { now: T0 + 5 * H, fetchFn: f }), null);
  assert.equal(await count(env), 1);
  const r2 = await maybeRun(env, { now: T0 + 6 * H, fetchFn: f });
  assert.equal(r2.runId, 2);
  const trig = await env.DB.prepare('SELECT DISTINCT trigger FROM runs').all();
  assert.deepEqual(trig.results, [{ trigger: 'lazy' }]);
});

test('lazy: two visitors at once start one run', async () => {
  const env = freshEnv();
  const f = fixtureFetch();
  const out = await Promise.all([maybeRun(env, { now: T0, fetchFn: f }), maybeRun(env, { now: T0, fetchFn: f })]);
  assert.equal(out.filter(Boolean).length, 1);
  assert.equal(await count(env), 1);
});

test('lazy: a held lock blocks a run, an expired lock does not; the lock is released after a run', async () => {
  const env = freshEnv();
  const f = fixtureFetch();
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('lock', ?)").bind(T0 + 60000).run();
  assert.equal(await maybeRun(env, { now: T0, fetchFn: f }), null);
  assert.equal(await count(env), 0);
  const r = await maybeRun(env, { now: T0 + 6 * 60000, fetchFn: f }); // lock expired
  assert.equal(r.status, 'ok');
  assert.equal(await env.DB.prepare("SELECT value FROM meta WHERE key = 'lock'").first('value'), 0);
});

test('lazy: a failed scrape still waits for the next interval (no hammering the source)', async () => {
  const env = freshEnv();
  const bad = async () => new Response('down', { status: 503 });
  const r = await maybeRun(env, { now: T0, fetchFn: bad });
  assert.equal(r.status, 'error');
  assert.equal(await maybeRun(env, { now: T0 + H, fetchFn: bad }), null);
});

test('worker.fetch: dashboard and /api/summary start a lazy run through ctx.waitUntil, other routes do not', async () => {
  const env = freshEnv({ ASSETS: { fetch: async () => new Response('<html>') } });
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const realFetch = globalThis.fetch;
  globalThis.fetch = fixtureFetch();
  try {
    await worker.fetch(new Request('https://demo.test/api/items'), env, ctx);
    await worker.fetch(new Request('https://demo.test/style.css'), env, ctx);
    assert.equal(pending.length, 0);
    const res = await worker.fetch(new Request('https://demo.test/'), env, ctx);
    assert.equal(res.status, 200);
    assert.equal(pending.length, 1);
    await Promise.all(pending);
  } finally {
    globalThis.fetch = realFetch;
  }
  const run = await env.DB.prepare('SELECT trigger, status, items FROM runs').first();
  assert.deepEqual(run, { trigger: 'lazy', status: 'ok', items: 62 });
});
