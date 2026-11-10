// Cloudflare Worker: the static landing page (public/, served by Workers Static Assets before this code runs),
// POST /api/lead (validate -> D1 -> Telegram), and the password-protected leads table at /admin.
import { validateLead } from './lead.js';
import { formatCard, sendTelegram } from './telegram.js';
import { handleAdmin } from './admin.js';
import { handleOwnerDemo } from './owner-demo.js';
import { ownerLang } from './i18n.js';
import { MIN, iso, ipHash } from './util.js';

const MAX_BODY = 8 * 1024;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

/** CORS headers for a cross-origin caller listed in ALLOWED_ORIGINS (to embed the quiz on another site), or null. */
function corsFor(origin, url, env) {
  if (!origin || origin === url.origin) return {};
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}

const sameAnswers = (row, a) => row.property === a.property && row.area === a.area && row.scope === a.scope && row.start === a.start && row.extras === JSON.stringify(a.extras);

async function handleLead(req, env, ctx, url) {
  const cors = corsFor(req.headers.get('Origin'), url, env);
  if (!cors) return json({ ok: false, error: 'origin' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405, { Allow: 'POST, OPTIONS', ...cors });
  if (!(req.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return json({ ok: false, error: 'content_type' }, 415, cors);
  if (Number(req.headers.get('Content-Length') || 0) > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413, cors);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413, cors);
  let body;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: 'bad_json' }, 400, cors); }

  const v = validateLead(body);
  if (v.spam) return json({ ok: true, id: null }, 200, cors); // look successful to the bot, store nothing
  if (!v.ok) return json({ ok: false, error: 'validation', errors: v.errors }, 422, cors);
  const { lead } = v;
  const a = lead.answers;
  const e = lead.estimate;

  const now = Date.now();
  const hash = await ipHash(env, req.headers.get('CF-Connecting-IP'));
  const limit = Number(env.RATE_LIMIT_PER_HOUR || 5);
  if (hash) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE ip_hash = ? AND created_at > ?').bind(hash, iso(now - 60 * MIN)).first();
    if (r.n >= limit) return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '3600', ...cors });
  }
  // Demo guard: a ceiling on stored leads per rolling 24 hours for the whole site, so the free D1 database cannot be flooded.
  const dailyCap = Number(env.DEMO_DAILY_CAP || 0);
  if (dailyCap > 0) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE created_at > ?').bind(iso(now - 24 * 60 * MIN)).first();
    if (r.n >= dailyCap) return json({ ok: false, error: 'demo_full' }, 429, { 'Retry-After': '3600', ...cors });
  }

  // Same phone: a double click within 10 minutes with the same answers returns the first lead;
  // otherwise the new lead is stored and marked as a repeat of the earlier one (last 30 days).
  const prev = await env.DB.prepare('SELECT id, created_at, property, area, scope, extras, start FROM leads WHERE phone = ? AND created_at > ? ORDER BY id DESC LIMIT 1')
    .bind(lead.phone, iso(now - 30 * 24 * 60 * MIN)).first();
  if (prev && prev.created_at > iso(now - 10 * MIN) && sameAnswers(prev, a)) return json({ ok: true, id: prev.id, duplicate: true, estimate: e, ...cardPreview(env, lead, prev.id, url, null) }, 200, cors);

  const row = await env.DB.prepare(`INSERT INTO leads (created_at, lang, name, phone, contact, comment, property, area, scope, extras, start,
      est_min, est_max, currency, weeks_min, weeks_max, utm, page, ip_hash, duplicate_of)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(iso(now), lead.lang, lead.name, lead.phone, lead.contact, lead.comment || null, a.property, a.area, a.scope, JSON.stringify(a.extras), a.start,
      e.min, e.max, e.currency, e.weeksMin, e.weeksMax, Object.keys(lead.utm).length ? JSON.stringify(lead.utm) : null, lead.page, hash, prev ? prev.id : null)
    .first();
  const id = row.id;

  // Telegram runs after the response is sent, so a slow or failing Bot API never loses or delays a lead.
  ctx.waitUntil(notifyOwner(env, lead, id, { origin: url.origin, duplicateOf: prev ? prev.id : null }));
  return json({ ok: true, id, estimate: e, ...cardPreview(env, lead, id, url, prev ? prev.id : null) }, 201, cors);
}

/** Demo mode (no Telegram bot connected): the response carries the card the owner would get, in the visitor's language. */
function cardPreview(env, lead, id, url, duplicateOf) {
  if (String(env.DEMO_MODE || '') !== '1') return {};
  const msg = formatCard(lead, id, { lang: lead.lang, origin: url.origin, duplicateOf });
  return { card: { html: msg.text, button: msg.reply_markup ? msg.reply_markup.inline_keyboard[0][0].text : '' } };
}

export async function notifyOwner(env, lead, id, { origin, duplicateOf }) {
  let status = 'skipped';
  let error = null;
  try {
    if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
      const msg = formatCard(lead, id, { lang: ownerLang(env), origin, duplicateOf });
      const r = await sendTelegram(env, msg);
      status = r.ok ? 'sent' : 'failed';
      error = r.error || null;
    }
  } catch (err) {
    status = 'failed';
    error = String(err && err.message ? err.message : err).slice(0, 300);
  }
  if (status === 'failed') console.error('telegram', id, error);
  await env.DB.prepare('UPDATE leads SET tg_status = ?, tg_error = ? WHERE id = ?').bind(status, error, id).run();
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/api/lead') return await handleLead(req, env, ctx, url);
      if (url.pathname === '/api/health') return json({ ok: true });
      if (url.pathname === '/owner-demo') return handleOwnerDemo(req, url);
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await handleAdmin(req, env, url);
    } catch (err) {
      console.error('request failed', url.pathname, err && err.stack ? err.stack : err);
      return json({ ok: false, error: 'server' }, 500);
    }
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
  },
};
