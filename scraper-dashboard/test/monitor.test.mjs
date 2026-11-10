import { test } from 'node:test';
import assert from 'node:assert/strict';
import { D1Sqlite } from './d1-sqlite.mjs';
import { fixtureFetch } from './fixture-fetch.mjs';
import { runMonitor, diffItems } from '../src/monitor.js';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const T0 = Date.UTC(2026, 9, 1, 0, 17);
const H6 = 6 * 3600000;
const freshEnv = (extra = {}) => ({ DB: new D1Sqlite().migrate(MIGRATIONS), DEMO_DRIFT: 'off', ALERT_LANG: 'en', ...extra });

// Edits to the saved pages, as if the shop changed between two runs.
const article = (id) => new RegExp(`<li class="col-xs-6[^"]*">\\s*<article class="product_pod">(?:(?!</article>)[\\s\\S])*?${id}/index\\.html[\\s\\S]*?</article>\\s*</li>`);
const edits = {
  price: (html, id, price) => html.replace(article(id), (b) => b.replace(/£[\d.]+/, `£${price}`)),
  remove: (html, id) => html.replace(article(id), ''),
  outOfStock: (html, id) => html.replace(article(id), (b) => b.replace('class="instock availability"', 'class="outofstock availability"').replace('In stock', 'Out of stock')),
  add: (html, fromId, newId, title) => html.replace(article(fromId), (b) => b + b.replaceAll(`${fromId}/`, `${newId}/`).replace(/title="[^"]*"/, `title="${title}"`)),
};

test('first run is a baseline: 62 items, 4 pages, no changes, one "monitoring started" message', async () => {
  const env = freshEnv({ BOT_TOKEN: '1:test', TG_CHAT_ID: '42' });
  const f = fixtureFetch();
  const r = await runMonitor(env, { fetchFn: f, now: T0 });
  assert.deepEqual([r.runId, r.status, r.pages, r.items, r.baseline, r.changes.length], [1, 'ok', 4, 62, true, 0]);
  assert.equal(f.calls.filter((u) => u.includes('toscrape')).length, 4);
  assert.equal(f.telegram.length, 1);
  assert.match(f.telegram[0].body.text, /tracking 62 items \(run #1\)/);
  const run = await env.DB.prepare('SELECT * FROM runs WHERE id = 1').first();
  assert.deepEqual([run.status, run.items, run.changes, run.trigger], ['ok', 62, 0, 'lazy']);
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM snapshots').first('n');
  assert.equal(n, 62);
  const cats = await env.DB.prepare('SELECT category, COUNT(*) AS n FROM items GROUP BY category ORDER BY category').all();
  assert.deepEqual(cats.results, [{ category: 'Classics', n: 19 }, { category: 'Mystery', n: 32 }, { category: 'Travel', n: 11 }]);
});

test('second run detects price drop, price rise, out of stock, new and removed listings and alerts once', async () => {
  const env = freshEnv({ BOT_TOKEN: '1:test', TG_CHAT_ID: '42', PUBLIC_URL: 'https://price-monitor.example.workers.dev' });
  await runMonitor(env, { fetchFn: fixtureFetch(), now: T0 });
  const f = fixtureFetch({
    transform: (html, url) => {
      if (url.includes('travel_2')) {
        html = edits.price(html, 'its-only-the-himalayas_981', '39.99');
        html = edits.remove(html, 'the-great-railway-bazaar_446');
      }
      if (url.includes('mystery_3/page-2')) html = edits.outOfStock(html, 'gone-girl_312');
      if (url.includes('mystery_3/index')) html = edits.add(html, 'sharp-objects_997', 'the-new-mystery_1001', 'The New Mystery');
      if (url.includes('classics_6')) html = edits.price(html, 'emma_39', '35.00');
      return html;
    },
  });
  const r = await runMonitor(env, { fetchFn: f, now: T0 + H6 });
  assert.equal(r.status, 'ok');
  assert.equal(r.items, 62);
  const byKind = Object.fromEntries(r.changes.map((c) => [`${c.kind}:${c.item_id}`, [c.old_value, c.new_value]]));
  assert.deepEqual(byKind, {
    'price:its-only-the-himalayas_981': [4517, 3999],
    'gone:the-great-railway-bazaar_446': [3054, null],
    'stock:gone-girl_312': [1, 0],
    'new:the-new-mystery_1001': [null, 4782],
    'price:emma_39': [3293, 3500],
  });
  const h = await env.DB.prepare('SELECT price_cents, prev_price_cents, last_change FROM items WHERE id = ?').bind('its-only-the-himalayas_981').first();
  assert.deepEqual(h, { price_cents: 3999, prev_price_cents: 4517, last_change: T0 + H6 });
  const gone = await env.DB.prepare('SELECT active FROM items WHERE id = ?').bind('the-great-railway-bazaar_446').first('active');
  assert.equal(gone, 0);
  assert.equal(f.telegram.length, 1);
  const text = f.telegram[0].body.text;
  console.log('\n--- Telegram alert (run #2, EN) ---\n' + text + '\n---');
  assert.match(text, /^📊 <b>Price monitor<\/b>: 5 changes \(run #2\)/);
  assert.match(text, /🔻 It's Only the Himalayas: £45\.17 → <b>£39\.99<\/b> \(−11\.5%\)/);
  assert.match(text, /🔺 Emma: £32\.93 → <b>£35\.00<\/b> \(\+6\.3%\)/);
  assert.match(text, /⛔ Gone Girl: out of stock/);
  assert.match(text, /🆕 The New Mystery — £47\.82 \(new\)/);
  assert.match(text, /🗑 The Great Railway Bazaar: removed from the site/);
  assert.ok(!text.includes('Demo mode'), 'real mode has no demo note');

  // third run with the original pages: the removed book comes back, prices go back
  const r3 = await runMonitor(env, { fetchFn: fixtureFetch(), now: T0 + 2 * H6 });
  const kinds = r3.changes.map((c) => `${c.kind}:${c.item_id}`).sort();
  assert.ok(kinds.includes('back:the-great-railway-bazaar_446'));
  assert.ok(kinds.includes('price:its-only-the-himalayas_981'));
  assert.ok(kinds.includes('gone:the-new-mystery_1001'));
});

test('a failing category is reported, and its items are not marked removed', async () => {
  const env = freshEnv({ BOT_TOKEN: '1:test', TG_CHAT_ID: '42' });
  await runMonitor(env, { fetchFn: fixtureFetch(), now: T0 });
  const f = fixtureFetch({ fail: ['mystery_3/page-2'] });
  const r = await runMonitor(env, { fetchFn: f, now: T0 + H6 });
  assert.equal(r.status, 'partial');
  assert.match(r.error, /mystery_3: HTTP 503/);
  assert.equal(r.changes.length, 0, 'page 1 of Mystery loaded, page 2 failed: nothing is "gone"');
  const active = await env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE active = 1').first('n');
  assert.equal(active, 62);
  assert.match(f.telegram[0].body.text, /Not checked this time: mystery_3: HTTP 503/);
});

test('a broken layout fails the run loudly and changes nothing', async () => {
  const env = freshEnv({ BOT_TOKEN: '1:test', TG_CHAT_ID: '42', ALERT_LANG: 'ru' });
  await runMonitor(env, { fetchFn: fixtureFetch(), now: T0 });
  const f = fixtureFetch({ transform: (html) => html.replaceAll('product_pod', 'product-card') });
  const r = await runMonitor(env, { fetchFn: f, now: T0 + H6 });
  assert.equal(r.status, 'error');
  assert.match(r.error, /no products found .* \(layout changed\?\)/);
  const active = await env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE active = 1').first('n');
  assert.equal(active, 62);
  const run = await env.DB.prepare('SELECT status FROM runs WHERE id = 2').first('status');
  assert.equal(run, 'error');
  assert.match(f.telegram[0].body.text, /запуск №2 не удался/);
});

test('MAX_PAGES caps the crawl; the unfinished category is not used for "removed"', async () => {
  const env = freshEnv({ MAX_PAGES: '2' });
  const r = await runMonitor(env, { fetchFn: fixtureFetch(), now: T0 });
  assert.equal(r.pages, 2);
  assert.equal(r.items, 31); // Travel 11 + Mystery page 1 (20)
  assert.equal(r.status, 'partial');
  assert.match(r.error, /mystery_3 \(MAX_PAGES\)/);
  assert.equal(r.alert.sent, false);
});

test('demo drift: deterministic simulated changes, flagged in runs and alerts, prices stay in bounds', async () => {
  const runAll = async () => {
    const env = freshEnv({ DEMO_DRIFT: 'on', BOT_TOKEN: '1:test', TG_CHAT_ID: '42' });
    const f = fixtureFetch();
    const counts = [];
    for (let i = 0; i < 12; i++) counts.push((await runMonitor(env, { fetchFn: f, now: T0 + i * H6 })).changes.length);
    return { env, f, counts };
  };
  const a = await runAll();
  const b = await runAll();
  assert.deepEqual(a.counts, b.counts, 'same seed, same changes');
  assert.equal(a.counts[0], 0);
  const total = a.counts.reduce((x, y) => x + y, 0);
  assert.ok(total >= 20 && total <= 120, `about 5-10 % of 62 items per run, got ${total} over 11 runs`);
  const sim = await a.env.DB.prepare('SELECT MIN(simulated) AS s FROM runs').first('s');
  assert.equal(sim, 1);
  const lastAlert = a.f.telegram.at(-1).body.text;
  assert.match(lastAlert, /🧪 Demo mode: changes are simulated/);
  const kinds = await a.env.DB.prepare('SELECT kind, COUNT(*) AS n FROM changes GROUP BY kind').all();
  assert.deepEqual(kinds.results.map((k) => k.kind).sort(), ['price', 'stock']);
  const { results } = await a.env.DB.prepare('SELECT s.price_cents AS p, f.price_cents AS base FROM snapshots s JOIN snapshots f ON f.item_id = s.item_id AND f.run_id = 1').all();
  for (const { p, base } of results) assert.ok(p >= base * 0.6 - 1 && p <= base * 1.4 + 1);
  console.log(`drift: changes per run ${a.counts.join(', ')}`);
});

test('retention deletes snapshots, changes and runs older than RETAIN_DAYS', async () => {
  const env = freshEnv({ DEMO_DRIFT: 'on', RETAIN_DAYS: '1' });
  const f = fixtureFetch();
  for (let i = 0; i < 8; i++) await runMonitor(env, { fetchFn: f, now: T0 + i * H6 });
  const runs = await env.DB.prepare('SELECT MIN(id) AS lo, COUNT(*) AS n FROM runs').first();
  assert.deepEqual(runs, { lo: 4, n: 5 }); // runs older than 24 h before run #8 are gone
  const oldSnaps = await env.DB.prepare('SELECT COUNT(*) AS n FROM snapshots WHERE run_id < 4').first('n');
  assert.equal(oldSnaps, 0);
});

test('diffItems ignores inactive items for stock and only removes from checked categories', () => {
  const prev = new Map([
    ['a', { price_cents: 100, in_stock: 1, active: 1, category: 'X' }],
    ['b', { price_cents: 100, in_stock: 1, active: 1, category: 'Y' }],
    ['c', { price_cents: 100, in_stock: 1, active: 0, category: 'X' }],
  ]);
  const out = diffItems(prev, [{ id: 'c', price_cents: 100, in_stock: 0 }], new Set(['X']));
  assert.deepEqual(out.map((c) => `${c.kind}:${c.item_id}`), ['back:c', 'gone:a']);
});
