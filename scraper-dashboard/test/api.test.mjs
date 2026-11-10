import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { D1Sqlite } from './d1-sqlite.mjs';
import { fixtureFetch } from './fixture-fetch.mjs';
import { runMonitor } from '../src/monitor.js';
import { handleApi, csvCell } from '../src/api.js';
import worker from '../src/worker.js';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const T0 = Date.UTC(2026, 9, 1, 0, 17);
const H6 = 6 * 3600000;
const RUNS = 16;
const NOW = T0 + (RUNS - 1) * H6 + 3600000;
let env;

before(async () => {
  env = { DB: new D1Sqlite().migrate(MIGRATIONS), DEMO_DRIFT: 'on', ADMIN_KEY: 'k3y' };
  const f = fixtureFetch();
  for (let i = 0; i < RUNS; i++) await runMonitor(env, { fetchFn: f, now: T0 + i * H6 });
});

const get = async (path) => {
  const res = await handleApi(new Request(`https://demo.test${path}`), env, { now: NOW });
  if (res.headers.get('Content-Type').startsWith('application/json')) return { res, body: await res.json() };
  return { res, body: new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer()) }; // keep the BOM visible
};

test('summary: totals, last run, categories, demo flag', async () => {
  const { body } = await get('/api/summary');
  assert.equal(body.totals.items, 62);
  assert.equal(body.lastRun.id, RUNS);
  assert.equal(body.simulated, true);
  assert.equal(body.alerts, false);
  assert.deepEqual(body.categories.map((c) => c.category), ['Classics', 'Mystery', 'Travel']);
  assert.ok(body.totals.changes_7d >= body.totals.changes_24h);
  assert.equal(body.source, 'https://books.toscrape.com/');
});

test('items: pagination, search, category, price range, stock, rating, sort', async () => {
  const all = (await get('/api/items?limit=200')).body;
  assert.equal(all.total, 62);
  const page = (await get('/api/items?limit=10&offset=10')).body;
  assert.deepEqual([page.items.length, page.offset, page.total], [10, 10, 62]);

  const q = (await get('/api/items?q=sherlock')).body;
  assert.deepEqual(q.items.map((i) => i.id).sort(), ['a-study-in-scarlet-sherlock-holmes-1_656', 'the-hound-of-the-baskervilles-sherlock-holmes-5_348']);
  assert.equal((await get('/api/items?q=100%25')).body.total, 0, 'LIKE wildcards are escaped');

  const travel = (await get('/api/items?category=Travel&limit=200')).body;
  assert.equal(travel.total, 11);
  assert.ok(travel.items.every((i) => i.category === 'Travel'));

  const range = (await get('/api/items?min=20&max=30&limit=200')).body;
  assert.ok(range.total > 0 && range.items.every((i) => i.price_cents >= 2000 && i.price_cents <= 3000));

  const out = (await get('/api/items?stock=out&limit=200')).body;
  const inn = (await get('/api/items?stock=in&limit=200')).body;
  assert.equal(out.total + inn.total, 62);
  assert.ok(out.items.every((i) => i.in_stock === 0));

  const r4 = (await get('/api/items?rating=4&limit=200')).body;
  assert.ok(r4.items.every((i) => i.rating >= 4));

  const cheap = (await get('/api/items?sort=price&dir=asc&limit=5')).body.items.map((i) => i.price_cents);
  assert.deepEqual(cheap, [...cheap].sort((a, b) => a - b));
  const moved = (await get('/api/items?sort=change&dir=asc&limit=3')).body.items;
  assert.ok(moved[0].change_pct < 0, 'biggest drop first');

  const changed = (await get('/api/items?changed=1&limit=200')).body;
  assert.ok(changed.total > 0 && changed.total < 62);
  assert.ok(changed.items.every((i) => i.last_change >= NOW - 86400000));
});

test('history: one point per run, with run times', async () => {
  const { body: list } = await get('/api/items?sort=change&dir=asc&limit=1');
  const id = list.items[0].id;
  const { body } = await get(`/api/history?id=${encodeURIComponent(id)}`);
  assert.equal(body.item.id, id);
  assert.equal(body.points.length, RUNS);
  assert.equal(body.points[0].at, T0);
  assert.equal(body.points.at(-1).price_cents, body.item.price_cents);
  assert.equal((await get('/api/history?id=nope')).res.status, 404);
});

test('changes and runs feeds', async () => {
  const { body } = await get('/api/changes?limit=500');
  assert.ok(body.changes.length > 10);
  assert.ok(body.changes[0].at >= body.changes.at(-1).at, 'newest first');
  assert.ok(body.changes.every((c) => c.title));
  const prices = (await get('/api/changes?kind=price&limit=500')).body.changes;
  assert.ok(prices.length && prices.every((c) => c.kind === 'price'));
  const runs = (await get('/api/runs?limit=5')).body.runs;
  assert.deepEqual(runs.map((r) => r.id), [16, 15, 14, 13, 12]);
  assert.ok(runs.every((r) => r.status === 'ok' && r.items === 62 && r.simulated === 1));
});

test('CSV export: BOM, header, filters applied, quoting, formula guard', async () => {
  const { res, body } = await get('/api/export.csv?category=Mystery');
  assert.equal(res.headers.get('Content-Type'), 'text/csv; charset=utf-8');
  assert.match(res.headers.get('Content-Disposition'), /attachment; filename="price-monitor-items-2026-10-0\d\.csv"/);
  assert.ok(body.startsWith('﻿id,title,category,price,previous_price,change_pct,currency,in_stock,rating,listed,first_seen,last_seen,last_change,url\r\n'));
  const rows = body.trim().split('\r\n');
  assert.equal(rows.length, 33);
  assert.ok(rows.some((r) => r.includes('"In a Dark, Dark Wood"')), 'comma in a title is quoted');
  assert.ok(rows.slice(1).every((r) => r.includes(',Mystery,')));
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell(-3.5), '-3.5', 'numbers are not touched by the guard');

  const ch = await get('/api/export.csv?type=changes&kind=price');
  assert.match(ch.res.headers.get('Content-Disposition'), /price-monitor-changes-/);
  assert.ok(ch.body.startsWith('﻿time,run,item_id,title,category,kind,old,new,currency,url\r\n'));
  assert.match(ch.body.split('\r\n')[1], /^2026-10-0\dT\d\d:17:00\.000Z,\d+,[^,]+,.*,price,\d+\.\d\d,\d+\.\d\d,GBP,https:/);
});

test('POST /api/run needs ADMIN_KEY', async () => {
  const post = (path, headers = {}) => handleApi(new Request(`https://demo.test${path}`, { method: 'POST', headers }), env, { now: NOW, fetchFn: fixtureFetch() });
  assert.equal((await post('/api/run')).status, 401);
  assert.equal((await post('/api/run?key=wrong')).status, 401);
  assert.equal((await handleApi(new Request('https://demo.test/api/run'), env)).status, 405);
  const ok = await post('/api/run', { Authorization: 'Bearer k3y' });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.deepEqual([body.runId, body.status, body.items], [RUNS + 1, 'ok', 62]);
  const run = await env.DB.prepare('SELECT trigger FROM runs WHERE id = ?').bind(RUNS + 1).first('trigger');
  assert.equal(run, 'manual');
  const off = await handleApi(new Request('https://demo.test/api/run?key=k3y', { method: 'POST' }), { ...env, ADMIN_KEY: '' });
  assert.equal(off.status, 403);
});

test('worker routes /api/* to the API and the rest to static assets', async () => {
  const assets = { fetch: async (req) => new Response(`asset ${new URL(req.url).pathname}`) };
  const a = await worker.fetch(new Request('https://demo.test/'), { ...env, ASSETS: assets });
  assert.equal(await a.text(), 'asset /');
  const b = await worker.fetch(new Request('https://demo.test/api/summary'), { ...env, ASSETS: assets });
  assert.equal((await b.json()).totals.items, 62);
  const c = await worker.fetch(new Request('https://demo.test/api/nope'), env);
  assert.equal(c.status, 404);
});
