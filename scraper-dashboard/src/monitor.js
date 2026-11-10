// One monitor run: crawl the watched categories, compare with the last stored state, write a snapshot and the
// changes to D1, send the Telegram alert. Called by the lazy refresh (lazy.js) and by POST /api/run.
//
// D1 free plan allows 50 queries per invocation, so all writes go in one batch of ~8 statements that take the
// whole run as a JSON parameter (json_each), however many items are tracked.

import { DEFAULT_BASE, categoryUrl, parseListing } from './parse.js';
import { applyDrift } from './drift.js';
import { formatAlert, formatBaseline, formatFailure, formatPartial, sendTelegram } from './alert.js';

export const DEFAULT_CATEGORIES = 'travel_2,mystery_3,classics_6';
const UA = 'scraper-dashboard-demo/1.0 (price monitor demo; practice site)';

export function config(env) {
  return {
    base: env.SOURCE_URL || DEFAULT_BASE,
    categories: String(env.CATEGORIES || DEFAULT_CATEGORIES).split(',').map((s) => s.trim()).filter(Boolean),
    maxPages: Math.max(1, Number(env.MAX_PAGES) || 20),
    drift: env.DEMO_DRIFT === 'on',
    lang: env.ALERT_LANG === 'en' ? 'en' : 'ru',
    minPct: Number(env.MIN_CHANGE_PCT) || 0,
    retainDays: Number(env.RETAIN_DAYS) || 90,
    publicUrl: env.PUBLIC_URL || '',
  };
}

// Crawl each category, following "next" links. A category counts as checked only if every page loaded,
// so a timeout never makes its items look removed.
export async function crawl(cfg, fetchFn) {
  const items = new Map();
  const checked = new Set();
  const failed = [];
  let pages = 0;
  for (const slug of cfg.categories) {
    let url = categoryUrl(slug, cfg.base);
    let name = null;
    let ok = true;
    const found = [];
    try {
      while (url) {
        if (pages >= cfg.maxPages) { ok = false; failed.push(`${slug} (MAX_PAGES)`); break; }
        const res = await fetchFn(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
        pages++;
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        const page = parseListing(await res.text(), url);
        if (!page.items.length) throw new Error(`no products found on ${url} (layout changed?)`);
        name = name || page.category || slug;
        for (const it of page.items) found.push({ ...it, category: name });
        url = page.next;
      }
    } catch (e) {
      ok = false;
      failed.push(`${slug}: ${e.message}`);
    }
    for (const it of found) if (!items.has(it.id)) items.set(it.id, it);
    if (ok && name) checked.add(name);
  }
  return { items: [...items.values()], checked, failed, pages };
}

// prev: Map id -> stored row; current: scraped items; checked: category names crawled completely.
export function diffItems(prev, current, checked) {
  const changes = [];
  const seen = new Set();
  for (const it of current) {
    seen.add(it.id);
    const p = prev.get(it.id);
    if (!p) { changes.push({ item_id: it.id, kind: 'new', old_value: null, new_value: it.price_cents }); continue; }
    if (!p.active) changes.push({ item_id: it.id, kind: 'back', old_value: null, new_value: it.price_cents });
    if (p.price_cents !== it.price_cents) changes.push({ item_id: it.id, kind: 'price', old_value: p.price_cents, new_value: it.price_cents });
    if (p.active && p.in_stock !== it.in_stock) changes.push({ item_id: it.id, kind: 'stock', old_value: p.in_stock, new_value: it.in_stock });
  }
  for (const [id, p] of prev) {
    if (p.active && !seen.has(id) && checked.has(p.category)) changes.push({ item_id: id, kind: 'gone', old_value: p.price_cents, new_value: null });
  }
  return changes;
}

const SQL = {
  upsert: `INSERT INTO items (id, title, url, image, category, currency, price_cents, prev_price_cents, in_stock, rating, active, first_seen, last_seen, last_change)
    SELECT json_extract(value, '$.id'), json_extract(value, '$.title'), json_extract(value, '$.url'), json_extract(value, '$.image'),
           json_extract(value, '$.category'), json_extract(value, '$.currency'), json_extract(value, '$.price_cents'), NULL,
           json_extract(value, '$.in_stock'), json_extract(value, '$.rating'), 1, ?2, ?2, ?3
    FROM json_each(?1) WHERE true
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, url = excluded.url, image = excluded.image, category = excluded.category, currency = excluded.currency,
      prev_price_cents = CASE WHEN excluded.price_cents <> items.price_cents THEN items.price_cents ELSE items.prev_price_cents END,
      last_change = CASE WHEN excluded.price_cents <> items.price_cents OR excluded.in_stock <> items.in_stock OR items.active = 0
                         THEN excluded.last_seen ELSE items.last_change END,
      price_cents = excluded.price_cents, in_stock = excluded.in_stock, rating = excluded.rating, active = 1, last_seen = excluded.last_seen`,
  snapshots: `INSERT INTO snapshots (run_id, item_id, price_cents, in_stock, rating)
    SELECT ?1, json_extract(value, '$.id'), json_extract(value, '$.price_cents'), json_extract(value, '$.in_stock'), json_extract(value, '$.rating')
    FROM json_each(?2)`,
  changes: `INSERT INTO changes (run_id, at, item_id, kind, old_value, new_value)
    SELECT ?1, ?2, json_extract(value, '$.item_id'), json_extract(value, '$.kind'), json_extract(value, '$.old_value'), json_extract(value, '$.new_value')
    FROM json_each(?3)`,
  gone: `UPDATE items SET active = 0, last_change = ?2 WHERE id IN (SELECT value FROM json_each(?1))`,
  pruneSnapshots: `DELETE FROM snapshots WHERE run_id IN (SELECT id FROM runs WHERE started_at < ?1)`,
  pruneChanges: `DELETE FROM changes WHERE at < ?1`,
  pruneRuns: `DELETE FROM runs WHERE started_at < ?1`,
  finish: `UPDATE runs SET finished_at = ?2, status = ?3, pages = ?4, items = ?5, changes = ?6, error = ?7 WHERE id = ?1`,
};

export async function runMonitor(env, { fetchFn = fetch, now = Date.now(), trigger = 'lazy', telegramFetch } = {}) {
  const cfg = config(env);
  const db = env.DB;
  const run = await db.prepare('INSERT INTO runs (started_at, trigger, status, simulated) VALUES (?1, ?2, ?3, ?4) RETURNING id')
    .bind(now, trigger, 'running', cfg.drift ? 1 : 0).first();
  const runId = run.id;
  const tgFetch = telegramFetch || fetchFn;
  const t0 = Date.now();
  const finishedAt = () => now + (Date.now() - t0);
  try {
    const { items: scraped, checked, failed, pages } = await crawl(cfg, fetchFn);
    if (!scraped.length) {
      const error = failed.join('; ') || 'no items';
      await db.prepare(SQL.finish).bind(runId, finishedAt(), 'error', pages, 0, 0, error).run();
      const alert = await sendTelegram(env, formatFailure({ runId, error, lang: cfg.lang }), tgFetch);
      return { runId, status: 'error', error, pages, items: 0, changes: [], alert };
    }

    const { results: rows } = await db.prepare('SELECT id, title, category, currency, price_cents, in_stock, rating, active FROM items').all();
    const prev = new Map(rows.map((r) => [r.id, r]));
    const baseline = prev.size === 0;
    const current = cfg.drift ? scraped.map((it) => applyDrift(it, prev.get(it.id), runId)) : scraped;
    const changes = baseline ? [] : diffItems(prev, current, checked);
    const gone = changes.filter((c) => c.kind === 'gone').map((c) => c.item_id);
    const status = failed.length ? 'partial' : 'ok';
    const error = failed.length ? failed.join('; ') : null;
    const cutoff = now - cfg.retainDays * 86400000;

    await db.batch([
      db.prepare(SQL.upsert).bind(JSON.stringify(current), now, baseline ? null : now),
      db.prepare(SQL.snapshots).bind(runId, JSON.stringify(current)),
      db.prepare(SQL.changes).bind(runId, now, JSON.stringify(changes)),
      db.prepare(SQL.gone).bind(JSON.stringify(gone), now),
      db.prepare(SQL.pruneSnapshots).bind(cutoff),
      db.prepare(SQL.pruneChanges).bind(cutoff),
      db.prepare(SQL.pruneRuns).bind(cutoff),
      db.prepare(SQL.finish).bind(runId, finishedAt(), status, pages, current.length, changes.length, error),
    ]);

    const names = new Map(current.map((it) => [it.id, it]));
    for (const [id, p] of prev) if (!names.has(id)) names.set(id, p);
    let text = baseline
      ? formatBaseline({ count: current.length, runId, lang: cfg.lang, publicUrl: cfg.publicUrl })
      : formatAlert({ changes, items: names, runId, lang: cfg.lang, simulated: cfg.drift, publicUrl: cfg.publicUrl, minPct: cfg.minPct });
    if (failed.length) text = [text, formatPartial({ categories: failed, lang: cfg.lang })].filter(Boolean).join('\n\n');
    const alert = await sendTelegram(env, text, tgFetch);
    return { runId, status, error, pages, items: current.length, baseline, changes, alert: { ...alert, text } };
  } catch (e) {
    await db.prepare(SQL.finish).bind(runId, finishedAt(), 'error', 0, 0, 0, String(e.message || e)).run();
    throw e;
  }
}
