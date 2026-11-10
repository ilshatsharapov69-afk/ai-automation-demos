// Cloudflare Worker entry.
//   GET  /inbox, /inbox/:id    web inbox (public in DEMO_MODE, otherwise needs ADMIN_KEY: /inbox?key=...)
//   POST /inbox/:id            approve / save / reject from the web
//   GET  /form, POST /form     public request form (HTML)
//   POST /api/form             same, JSON
//   POST /api/seed             sample data for the public demo: {channel, ...message, ago_min}; needs INBOX_SECRET; the AI really reads it
//   POST /api/email            email-style JSON webhook {from, subject, text}; header X-Inbox-Secret = INBOX_SECRET
//   GET  /api/requests         JSON list (admin)
//   POST /telegram             Telegram webhook (customers + owner buttons); header from setWebhook(secret_token)
//   email()                    Cloudflare Email Routing -> this Worker (raw MIME)
// Without BOT_TOKEN nothing goes to Telegram: the JSON answers include `outbox` with every Bot API call (tests, local dev).
import { makeCtx, ingest, decide, aiLeft, hashIp } from './pipeline.js';
import { handleUpdate } from './telegram.js';
import { fromForm, fromEmail, fromTelegram, parseRawEmail } from './channels.js';
import { listRequests, getRequest, stats, canSee, takeRate, sweep } from './store.js';
import { inboxPage, detailPage, formPage, langFrom } from './web.js';

const html = (s, status = 200, headers = {}) => new Response(s, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });
const json = (o, status = 200) => Response.json(o, { status });

function cookie(req, name) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

const clientIp = (req) => req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || 'unknown';

/** The public demo recognises a visitor by a random cookie: their own form messages show up in their inbox. */
function visitorOf(req) {
  const have = cookie(req, 'vid');
  if (have && /^[a-f0-9]{16}$/.test(have)) return { id: have, set: null };
  const id = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join('');
  return { id, set: `vid=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400` };
}

/** owner = has the admin key; view = may see the inbox (owner, or anyone in demo mode). */
function access(req, url, env) {
  const key = env.ADMIN_KEY;
  const given = url.searchParams.get('key') || cookie(req, 'inbox_key') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const owner = Boolean(key) && safeEq(given, key);
  return { owner, view: owner || env.DEMO_MODE !== 'off', setCookie: owner && url.searchParams.get('key') };
}

async function readBody(req) {
  const ct = req.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) return req.json();
  const f = await req.formData();
  return Object.fromEntries([...f.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
}

const publicRow = (r) => r && {
  id: r.id, channel: r.channel, origin: r.origin, ai_note: r.ai_note, ai_model: r.ai_model, ai_draft_model: r.ai_draft_model, category: r.category, classified_by: r.classified_by, lang: r.lang, name: r.name, email: r.email, phone: r.phone, telegram: r.telegram,
  product: r.product, order: r.order_no, budget: r.budget_amount != null ? { amount: r.budget_amount, currency: r.budget_currency, text: r.budget_text } : null,
  deadline: r.deadline_date ? { date: r.deadline_date, text: r.deadline_text } : null, summary: r.summary, score: r.score, hot: r.hot, reasons: r.score_reasons,
  draft: r.draft, draft_source: r.draft_source, status: r.status, created_at: r.created_at,
};

async function route(req, env) {
  const url = new URL(req.url);
  const p = url.pathname;
  const c = makeCtx(env, { origin: url.origin });
  const testOut = (o) => (env.BOT_TOKEN ? o : { ...o, outbox: c.outbox });

  if (req.method === 'GET' && p === '/') return Response.redirect(`${url.origin}/inbox${url.search}`, 302);
  if (req.method === 'GET' && p === '/health') return new Response('ok');

  // ----- intake -----
  if (p === '/form' && req.method === 'GET') return html(formPage({ lang: langFrom(url, req), demo: c.demo }));
  if ((p === '/form' || p === '/api/form') && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch { return json({ error: 'bad body' }, 400); }
    const lang = body.lang === 'ru' || body.lang === 'en' ? body.lang : langFrom(url, req);
    const v = visitorOf(req);
    const hdr = v.set ? { 'Set-Cookie': v.set } : {};
    const ip = clientIp(req);
    // One visitor cannot flood the demo database: a submission cap per IP per hour (AI has its own, smaller cap).
    if (!(await takeRate(c.db, `sub:${await hashIp(ip)}`, c.nowIso.slice(0, 13), Number(env.SUBMIT_HOURLY ?? 20)))) {
      if (p === '/api/form') return Response.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: hdr });
      return html(formPage({ lang, demo: c.demo, left: await aiLeft(c, ip), limited: true }), 429, hdr);
    }
    await sweep(c.db, c.nowIso);
    const res = await ingest({ ...fromForm({ ...body, lang }), origin: 'visitor', visitor: v.id, ip }, c);
    if (p === '/api/form') {
      const o = res.ignored ? { ok: false, ignored: res.ignored } : testOut({ ok: true, request: publicRow(res.row), duplicate: res.duplicate });
      return Response.json(o, { status: res.ignored === 'empty' ? 400 : 200, headers: hdr });
    }
    const left = await aiLeft(c, ip);
    if (res.ignored === 'empty') return html(formPage({ lang, demo: c.demo, left }), 400, hdr);
    return html(formPage({ lang, demo: c.demo, left, done: res.row || { category: 'spam', summary: '', score: 0, classified_by: 'rules', draft_source: 'none', ai_note: 'ok' } }), 200, hdr);
  }
  if (p === '/api/seed' && req.method === 'POST') {
    if (!env.INBOX_SECRET || !safeEq(req.headers.get('X-Inbox-Secret') || '', env.INBOX_SECRET)) return json({ error: 'forbidden' }, 403);
    let b;
    try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
    const msg = b.channel === 'telegram' ? fromTelegram({ message_id: b.message_id, from: b.from, chat: { id: b.from?.id }, text: b.text }) : b.channel === 'email' ? fromEmail(b) : fromForm(b);
    const ago = Math.max(0, Number(b.ago_min) || 0);
    const res = await ingest({ ...msg, origin: 'seed', createdAt: new Date(c.now.getTime() - ago * 60000).toISOString() }, c);
    if (res.ignored) return json({ ok: false, ignored: res.ignored }, 400);
    return json({ ok: true, request: publicRow(res.row), duplicate: res.duplicate });
  }
  if (p === '/api/email' && req.method === 'POST') {
    if (env.INBOX_SECRET && !safeEq(req.headers.get('X-Inbox-Secret') || '', env.INBOX_SECRET)) return json({ error: 'forbidden' }, 403);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
    const res = await ingest(fromEmail(body), c);
    if (res.ignored) return json({ ok: false, ignored: res.ignored }, 400);
    return json(testOut({ ok: true, request: publicRow(res.row), duplicate: res.duplicate }));
  }
  if (p === '/telegram' && req.method === 'POST') {
    // The public demo has no bot: the webhook stays closed (Telegram cards are shown as previews in the inbox).
    if (!env.BOT_TOKEN && env.TG_WEBHOOK === 'closed') return json({ error: 'telegram_preview_only' }, 403);
    if (env.BOT_TOKEN) {
      if (!env.WEBHOOK_SECRET) return new Response('WEBHOOK_SECRET is not set', { status: 500 });
      if (!safeEq(req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '', env.WEBHOOK_SECRET)) return new Response('forbidden', { status: 403 });
    }
    let update;
    try { update = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
    try {
      await handleUpdate(update, c, { ingest, decide });
    } catch (e) {
      console.error('update failed', e && e.stack ? e.stack : e);
      if (!env.BOT_TOKEN) return json({ error: String(e && e.stack ? e.stack : e), outbox: c.outbox }, 500);
    }
    return env.BOT_TOKEN ? new Response('ok') : json({ outbox: c.outbox });
  }

  // ----- inbox -----
  const a = access(req, url, env);
  const lang = langFrom(url, req);
  const keyCookie = a.setCookie ? { 'Set-Cookie': `inbox_key=${encodeURIComponent(env.ADMIN_KEY)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000` } : {};
  if (p.startsWith('/inbox') || p.startsWith('/api/requests')) {
    if (!a.view) return new Response('Open /inbox?key=<ADMIN_KEY> once; the browser keeps the key in a cookie.', { status: 401 });
  }
  const v = visitorOf(req);
  const scope = a.owner ? null : { visitor: v.id };
  const setCookies = [keyCookie['Set-Cookie'], v.set].filter(Boolean);
  const hdrs = () => { const h = new Headers(); for (const x of setCookies) h.append('Set-Cookie', x); return h; };
  const htmlC = (s2, status = 200) => { const h = hdrs(); h.set('Content-Type', 'text/html; charset=utf-8'); return new Response(s2, { status, headers: h }); };
  if (p === '/api/requests' && req.method === 'GET') {
    const rows = await listRequests(c.db, { category: url.searchParams.get('cat') || 'all', limit: 200, scope });
    return json({ stats: await stats(c.db, scope), requests: rows.map(publicRow) });
  }
  if (p === '/inbox' && req.method === 'GET') {
    const cat = ['all', 'hot', 'lead', 'support', 'partnership', 'spam'].includes(url.searchParams.get('cat')) ? url.searchParams.get('cat') : 'all';
    const rows = await listRequests(c.db, { category: cat, limit: 200, scope });
    return htmlC(inboxPage({ rows, stats: await stats(c.db, scope), lang, filter: cat, demo: c.demo, now: c.now, flash: url.searchParams.get('done'), left: await aiLeft(c, clientIp(req)) }));
  }
  const m = p.match(/^\/inbox\/(\d+)$/);
  if (m && req.method === 'GET') {
    const row = await getRequest(c.db, m[1]);
    if (!row || !canSee(row, scope)) return htmlC('not found', 404);
    return htmlC(detailPage({ row, lang, demo: c.demo, owner: a.owner, now: c.now, flash: url.searchParams.get('done'), origin: c.origin }));
  }
  if (m && req.method === 'POST') {
    const row = await getRequest(c.db, m[1]);
    if (!row || !canSee(row, scope)) return htmlC('not found', 404);
    // Sample data is read-only for the public; a visitor may act on their own message only.
    if (!a.owner && row.origin !== 'visitor') return htmlC('read-only sample', 403);
    const body = await readBody(req).catch(() => ({}));
    const action = ['approve', 'reject', 'save'].includes(body.action) ? body.action : null;
    if (!action) return htmlC('bad action', 400);
    // In the public demo a visitor may press the buttons on their own message, but only the owner's key actually sends a reply.
    const res = await decide(c, m[1], action, { draft: body.draft, by: 'web', canDeliver: a.owner });
    if (res.error === 'not_found') return htmlC('not found', 404);
    const done = res.already ? 'already' : action === 'save' ? 'saved' : res.row.status;
    if ((req.headers.get('Accept') || '').includes('application/json')) return json(testOut({ ok: !res.error, done, request: publicRow(res.row) }));
    const h = hdrs();
    h.set('Location', `${url.origin}/inbox/${m[1]}?lang=${lang}&done=${done}`);
    return new Response(null, { status: 303, headers: h });
  }
  return new Response('not found', { status: 404 });
}

export default {
  async fetch(req, env) {
    try {
      return await route(req, env);
    } catch (e) {
      console.error('request failed', e && e.stack ? e.stack : e);
      return new Response('internal error', { status: 500 });
    }
  },

  // Cloudflare Email Routing: send info@<your domain> to this Worker and every email becomes a request.
  async email(message, env) {
    const raw = await new Response(message.raw).text();
    const e = parseRawEmail(raw);
    if (!e.from) e.from = message.from;
    const c = makeCtx(env, {});
    await ingest(fromEmail(e), c);
  },
};
