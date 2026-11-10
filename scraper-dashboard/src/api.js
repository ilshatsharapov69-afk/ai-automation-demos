// JSON + CSV API behind the dashboard (public/). Everything is read-only except POST /api/run (needs ADMIN_KEY).
import { runMonitor, config } from './monitor.js';
import { refreshMs } from './lazy.js';

const DAY = 86400000;
const SORTS = {
  title: 'title COLLATE NOCASE',
  price: 'price_cents',
  change: 'change_pct',
  rating: 'rating',
  category: 'category COLLATE NOCASE',
  last_change: 'last_change',
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export function itemFilter(params, now) {
  const where = [];
  const binds = [];
  const add = (sql, ...v) => { where.push(sql); binds.push(...v); }; // anonymous "?" placeholders, bound in order
  if (params.get('active') !== 'all') add('active = ?', 1);
  const q = (params.get('q') || '').trim();
  if (q) add("(title LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')", ...Array(2).fill(`%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`));
  if (params.get('category')) add('category = ?', params.get('category'));
  const min = parseFloat(params.get('min'));
  if (Number.isFinite(min)) add('price_cents >= ?', Math.round(min * 100));
  const max = parseFloat(params.get('max'));
  if (Number.isFinite(max)) add('price_cents <= ?', Math.round(max * 100));
  if (params.get('stock') === 'in') add('in_stock = ?', 1);
  if (params.get('stock') === 'out') add('in_stock = ?', 0);
  const rating = Number(params.get('rating'));
  if (rating >= 1 && rating <= 5) add('rating >= ?', rating);
  const days = Number(params.get('changed'));
  if (days > 0) add('last_change >= ?', now - days * DAY);
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', binds };
}

const ITEM_COLS = `id, title, url, image, category, currency, price_cents, prev_price_cents, in_stock, rating, active,
  first_seen, last_seen, last_change,
  CASE WHEN prev_price_cents > 0 THEN ROUND((price_cents - prev_price_cents) * 100.0 / prev_price_cents, 1) END AS change_pct`;

export async function listItems(db, params, now, { all = false } = {}) {
  const { where, binds } = itemFilter(params, now);
  const sort = SORTS[params.get('sort')] || SORTS.last_change;
  const dir = params.get('dir') === 'asc' ? 'ASC' : 'DESC';
  const limit = all ? 5000 : Math.min(200, Math.max(1, Number(params.get('limit')) || 25));
  const offset = all ? 0 : Math.max(0, Number(params.get('offset')) || 0);
  const nulls = `CASE WHEN ${sort.split(' ')[0]} IS NULL THEN 1 ELSE 0 END`;
  const sql = `SELECT ${ITEM_COLS} FROM items ${where} ORDER BY ${nulls}, ${sort} ${dir}, title COLLATE NOCASE ASC LIMIT ${limit} OFFSET ${offset}`;
  const [{ results }, count] = await Promise.all([
    db.prepare(sql).bind(...binds).all(),
    db.prepare(`SELECT COUNT(*) AS n FROM items ${where}`).bind(...binds).first(),
  ]);
  return { items: results, total: count.n, limit, offset };
}

export async function summary(db, env, now) {
  const cfg = config(env);
  const [totals, lastRun, ch24, ch7, cats] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS items, SUM(CASE WHEN in_stock = 0 THEN 1 ELSE 0 END) AS out_of_stock,
      ROUND(AVG(price_cents)) AS avg_price_cents, MIN(currency) AS currency FROM items WHERE active = 1`).first(),
    db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').first(),
    db.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN kind = 'price' AND new_value < old_value THEN 1 ELSE 0 END) AS down, SUM(CASE WHEN kind = 'price' AND new_value > old_value THEN 1 ELSE 0 END) AS up FROM changes WHERE at >= ?1").bind(now - DAY).first(),
    db.prepare('SELECT COUNT(*) AS n FROM changes WHERE at >= ?1').bind(now - 7 * DAY).first(),
    db.prepare('SELECT category, COUNT(*) AS n FROM items WHERE active = 1 GROUP BY category ORDER BY category').all(),
  ]);
  return {
    source: cfg.base,
    watched: cfg.categories,
    simulated: cfg.drift,
    refreshHours: Math.round(refreshMs(env) / 3600000),
    alerts: Boolean(env.BOT_TOKEN && env.TG_CHAT_ID),
    totals: { ...totals, changes_24h: ch24.n, down_24h: ch24.down || 0, up_24h: ch24.up || 0, changes_7d: ch7.n },
    lastRun,
    categories: cats.results,
    now,
  };
}

async function history(db, id) {
  const item = await db.prepare(`SELECT ${ITEM_COLS} FROM items WHERE id = ?1`).bind(id).first();
  if (!item) return null;
  const { results } = await db.prepare(`SELECT s.run_id, r.started_at AS at, s.price_cents, s.in_stock
    FROM snapshots s JOIN runs r ON r.id = s.run_id WHERE s.item_id = ?1 ORDER BY s.run_id`).bind(id).all();
  return { item, points: results };
}

async function listChanges(db, params, now) {
  const where = [];
  const binds = [];
  const kind = params.get('kind');
  if (kind && ['price', 'stock', 'new', 'gone', 'back'].includes(kind)) { binds.push(kind); where.push(`c.kind = ?${binds.length}`); }
  if (params.get('category')) { binds.push(params.get('category')); where.push(`i.category = ?${binds.length}`); }
  const days = Number(params.get('days'));
  if (days > 0) { binds.push(now - days * DAY); where.push(`c.at >= ?${binds.length}`); }
  const limit = Math.min(1000, Math.max(1, Number(params.get('limit')) || 50));
  const { results } = await db.prepare(`SELECT c.id, c.run_id, c.at, c.item_id, c.kind, c.old_value, c.new_value, i.title, i.category, i.currency, i.url
    FROM changes c LEFT JOIN items i ON i.id = c.item_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY c.at DESC, c.id DESC LIMIT ${limit}`).bind(...binds).all();
  return { changes: results };
}

async function listRuns(db, params) {
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 30));
  const { results } = await db.prepare(`SELECT * FROM runs ORDER BY id DESC LIMIT ${limit}`).all();
  return { runs: results };
}

// ---- CSV ----
export function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(header, rows) {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
const iso = (t) => (t ? new Date(t).toISOString() : '');
const money = (c) => (c == null ? '' : (c / 100).toFixed(2));

async function exportCsv(db, params, now) {
  const type = params.get('type') || 'items';
  const stamp = new Date(now).toISOString().slice(0, 10);
  let csv;
  if (type === 'changes') {
    params.set('limit', params.get('limit') || '1000');
    const { changes } = await listChanges(db, params, now);
    csv = toCsv(['time', 'run', 'item_id', 'title', 'category', 'kind', 'old', 'new', 'currency', 'url'],
      changes.map((c) => [iso(c.at), c.run_id, c.item_id, c.title, c.category, c.kind,
        c.kind === 'stock' ? c.old_value : money(c.old_value), c.kind === 'stock' ? c.new_value : money(c.new_value), c.currency, c.url]));
  } else {
    const { items } = await listItems(db, params, now, { all: true });
    csv = toCsv(['id', 'title', 'category', 'price', 'previous_price', 'change_pct', 'currency', 'in_stock', 'rating', 'listed', 'first_seen', 'last_seen', 'last_change', 'url'],
      items.map((i) => [i.id, i.title, i.category, money(i.price_cents), money(i.prev_price_cents), i.change_pct, i.currency,
        i.in_stock, i.rating, i.active, iso(i.first_seen), iso(i.last_seen), iso(i.last_change), i.url]));
  }
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="price-monitor-${type}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

function authorized(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const key = auth.startsWith('Bearer ') ? auth.slice(7) : new URL(request.url).searchParams.get('key');
  return Boolean(env.ADMIN_KEY) && key === env.ADMIN_KEY;
}

export async function handleApi(request, env, { now = Date.now(), fetchFn } = {}) {
  const url = new URL(request.url);
  const p = url.searchParams;
  const db = env.DB;
  try {
    if (url.pathname === '/api/run') {
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
      if (!env.ADMIN_KEY) return json({ error: 'manual runs are off: set the ADMIN_KEY secret' }, 403);
      if (!authorized(request, env)) return json({ error: 'wrong key' }, 401);
      const r = await runMonitor(env, { now, trigger: 'manual', ...(fetchFn ? { fetchFn } : {}) });
      return json({ runId: r.runId, status: r.status, error: r.error, pages: r.pages, items: r.items, changes: r.changes.length, alert: r.alert });
    }
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    switch (url.pathname) {
      case '/api/summary': return json(await summary(db, env, now));
      case '/api/items': return json(await listItems(db, p, now));
      case '/api/history': {
        const h = await history(db, p.get('id') || '');
        return h ? json(h) : json({ error: 'not found' }, 404);
      }
      case '/api/changes': return json(await listChanges(db, p, now));
      case '/api/runs': return json(await listRuns(db, p));
      case '/api/export.csv': return exportCsv(db, p, now);
      default: return json({ error: 'not found' }, 404);
    }
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
