// GET /owner-demo: a public, read-only copy of the leads table that shows only the made-up rows from seed.js.
// It never reads the database, so real visitors' requests can not appear here.
import { STATUSES } from './lead.js';
import { T } from './i18n.js';
import { renderPage } from './admin.js';
import { seedLeads } from './seed.js';

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};

export function handleOwnerDemo(req, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'ru';
  const now = Date.now();
  const all = seedLeads(now);
  const status = STATUSES.includes(url.searchParams.get('status')) ? url.searchParams.get('status') : '';
  const rows = status ? all.filter((r) => r.status === status) : all;
  const byStatus = {};
  for (const r of all) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  const stats = {
    total: all.length,
    day: all.filter((r) => r.created_at > new Date(now - 864e5).toISOString()).length,
    week: all.filter((r) => r.created_at > new Date(now - 7 * 864e5).toISOString()).length,
    won: byStatus.won || 0,
  };
  return new Response(renderPage({ t: T[lang], lang, url, status, q: '', page: 1, rows, count: rows.length, stats, byStatus, tz: 'UTC', readOnly: true }), { headers: HEADERS });
}
