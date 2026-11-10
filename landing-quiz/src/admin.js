// Password-protected leads table: GET /admin, GET /admin/leads.csv, POST /admin/leads/:id (status + note).
// HTTP Basic auth against the ADMIN_PASSWORD secret (any user name). No JavaScript on the page.
import { label, formatMoney, formatWeeks, STEP } from '../public/js/quiz-model.js';
import { STATUSES } from './lead.js';
import { T, ownerLang } from './i18n.js';
import { esc } from './telegram.js';
import { MIN, iso, ipHash } from './util.js';

const PAGE = 50;
const MAX_FAILS = 10; // wrong passwords per IP per 15 minutes
const enc = new TextEncoder();

async function digest(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

/** Constant-time password check (compares SHA-256 digests, so length does not leak either). */
export async function checkPassword(req, password) {
  const h = req.headers.get('Authorization') || '';
  if (!password || !h.startsWith('Basic ')) return false;
  let decoded;
  try { decoded = atob(h.slice(6).trim()); } catch { return false; }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const given = Uint8Array.from(decoded.slice(i + 1), (c) => c.charCodeAt(0)); // atob gives UTF-8 bytes as chars
  const [a, b] = await Promise.all([digest(given), digest(enc.encode(password))]);
  let diff = 0;
  for (let k = 0; k < a.length; k++) diff |= a[k] ^ b[k];
  return diff === 0;
}

const SEC_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...SEC_HEADERS, ...extra } });

export async function handleAdmin(req, env, url) {
  const lang = ownerLang(env, url.searchParams.get('lang'));
  const t = T[lang];
  if (!env.ADMIN_PASSWORD) return html(`<p>${esc(t.noPassword)}</p>`, 503);
  const now = Date.now();
  const hash = await ipHash(env, req.headers.get('CF-Connecting-IP'));
  if (hash) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_fails WHERE ip_hash = ? AND at > ?').bind(hash, iso(now - 15 * MIN)).first();
    if (r.n >= MAX_FAILS) return html(`<p>${esc(t.locked)}</p>`, 429, { 'Retry-After': '900' });
  }
  if (!(await checkPassword(req, env.ADMIN_PASSWORD))) {
    if (hash && req.headers.has('Authorization')) {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO auth_fails (ip_hash, at) VALUES (?, ?)').bind(hash, iso(now)),
        env.DB.prepare('DELETE FROM auth_fails WHERE at < ?').bind(iso(now - 24 * 60 * MIN)),
      ]);
    }
    return html(`<p>${esc(t.login)}</p>`, 401, { 'WWW-Authenticate': 'Basic realm="Leads", charset="UTF-8"' });
  }

  if (req.method === 'POST') {
    const m = url.pathname.match(/^\/admin\/leads\/(\d+)$/);
    if (!m) return html('not found', 404);
    // CSRF guard: Basic auth is sent automatically, so a POST must come from this page.
    const origin = req.headers.get('Origin');
    const site = req.headers.get('Sec-Fetch-Site');
    if (origin ? origin !== url.origin : site !== 'same-origin') return html('forbidden', 403);
    const form = await req.formData();
    const status = String(form.get('status') || '');
    const note = String(form.get('note') || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 500);
    if (!STATUSES.includes(status)) return html('bad status', 400);
    await env.DB.prepare('UPDATE leads SET status = ?, note = ? WHERE id = ?').bind(status, note || null, Number(m[1])).run();
    const back = String(form.get('back') || '/admin');
    return new Response(null, { status: 303, headers: { Location: back.startsWith('/admin') ? back : '/admin', ...SEC_HEADERS } });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return html('method not allowed', 405, { Allow: 'GET, POST' });

  const status = STATUSES.includes(url.searchParams.get('status')) ? url.searchParams.get('status') : '';
  const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
  const where = [];
  const args = [];
  if (status) { where.push('status = ?'); args.push(status); }
  if (q) {
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3) { where.push('(name LIKE ? OR phone LIKE ?)'); args.push(`%${q}%`, `%${digits}%`); }
    else { where.push('name LIKE ?'); args.push(`%${q}%`); }
  }
  const W = where.length ? `WHERE ${where.join(' AND ')}` : '';

  if (url.pathname === '/admin/leads.csv') {
    const { results } = await env.DB.prepare(`SELECT * FROM leads ${W} ORDER BY id DESC LIMIT 5000`).bind(...args).all();
    return new Response('﻿' + toCsv(results, lang), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`, ...SEC_HEADERS },
    });
  }
  if (url.pathname !== '/admin' && url.pathname !== '/admin/') return html('not found', 404);

  const page = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const [rows, count, stats, byStatus] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM leads ${W} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(...args, PAGE, (page - 1) * PAGE),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM leads ${W}`).bind(...args),
    env.DB.prepare('SELECT COUNT(*) AS total, SUM(created_at > ?) AS day, SUM(created_at > ?) AS week, SUM(status = \'won\') AS won FROM leads').bind(iso(now - 864e5), iso(now - 7 * 864e5)),
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status'),
  ]);
  return html(renderPage({
    t, lang, url, status, q, page, rows: rows.results, count: count.results[0].n, stats: stats.results[0],
    byStatus: Object.fromEntries(byStatus.results.map((r) => [r.status, r.n])), tz: env.TIME_ZONE || 'UTC',
  }));
}

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  // Spreadsheet formula injection: a cell starting with = + - @ (or tab/CR) is prefixed with ' unless it is a plain number or phone.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function toCsv(rows, lang) {
  const head = ['id', 'created_at', 'status', 'name', 'phone', 'contact', 'property', 'area_m2', 'scope', 'extras', 'start', 'estimate_min', 'estimate_max', 'currency', 'weeks_min', 'weeks_max', 'comment', 'note', 'utm_source', 'utm_medium', 'utm_campaign', 'site_lang', 'duplicate_of', 'telegram'];
  const out = [head.join(',')];
  for (const r of rows) {
    const utm = safeJson(r.utm, {});
    out.push([
      r.id, r.created_at, r.status, r.name, r.phone, r.contact, label('property', r.property, lang), r.area, label('scope', r.scope, lang),
      safeJson(r.extras, []).map((x) => label('extras', x, lang)).join('; '), label('start', r.start, lang), r.est_min, r.est_max, r.currency,
      r.weeks_min, r.weeks_max, r.comment, r.note, utm.source, utm.medium, utm.campaign, r.lang, r.duplicate_of, r.tg_status,
    ].map(csvCell).join(','));
  }
  return out.join('\r\n') + '\r\n';
}
function safeJson(s, dflt) { try { return s ? JSON.parse(s) : dflt; } catch { return dflt; } }

function link(url, params) {
  const u = new URL(url.pathname === '/admin/' ? '/admin' : url.pathname, url.origin);
  for (const [k, v] of Object.entries({ lang: url.searchParams.get('lang'), status: url.searchParams.get('status'), q: url.searchParams.get('q'), ...params })) if (v) u.searchParams.set(k, v);
  return u.pathname + u.search;
}

export function renderPage({ t, lang, url, status, q, page, rows, count, stats, byStatus, tz, readOnly = false }) {
  const fmtDate = new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const total = stats.total || 0;
  const tabs = [['', t.all, total], ...STATUSES.map((s) => [s, t.status[s], byStatus[s] || 0])]
    .map(([s, name, n]) => `<a class="tab${s === status ? ' on' : ''}" href="${esc(link(url, { status: s || null, page: null }))}">${esc(name)} <span>${n}</span></a>`).join('');
  const back = url.pathname + url.search;
  const body = rows.map((r) => {
    const est = { min: r.est_min, max: r.est_max, currency: r.currency, weeksMin: r.weeks_min, weeksMax: r.weeks_max };
    const extras = safeJson(r.extras, []).map((x) => label('extras', x, lang)).join(', ');
    const utm = Object.entries(safeJson(r.utm, {})).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>');
    const opts = STATUSES.map((s) => `<option value="${s}"${s === r.status ? ' selected' : ''}>${esc(t.status[s])}</option>`).join('');
    const td = (col, inner) => `<td data-l="${esc(t.cols[col])}"><div class="c">${inner}</div></td>`;
    const unit = `&nbsp;${STEP.area.unit[lang]}`;
    return `<tr class="st-${esc(r.status)}">
${td('id', `<b>${r.id}</b>`)}
${td('date', esc(fmtDate.format(new Date(r.created_at))))}
${td('client', `<b>${esc(r.name)}</b><br><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a> <span class="pill">${esc(t.contact[r.contact] || r.contact)}</span>${r.duplicate_of ? ` <span class="pill warn" title="${esc(t.duplicateNote)}">#${r.duplicate_of}</span>` : ''}${r.comment ? `<div class="cm">“${esc(r.comment)}”</div>` : ''}`)}
${td('project', `${esc(label('property', r.property, lang))}, ${r.area}${unit}<br>${esc(label('scope', r.scope, lang))}${extras ? `<div class="mut">+ ${esc(extras)}</div>` : ''}<div class="mut">${esc(t.start)}: ${esc(label('start', r.start, lang))}</div>`)}
${td('estimate', `<b class="nw">${esc(formatMoney(est.min, est.currency, lang))} –</b> <b class="nw">${esc(formatMoney(est.max, est.currency, lang))}</b><div class="mut">${esc(formatWeeks(est, lang))}</div>`)}
${td('source', `<span class="mut">${utm || esc(t.noUtm)}<br>${esc(r.lang.toUpperCase())} · ${esc(r.page || '/')}</span>`)}
${td('status', readOnly ? `<span class="pill">${esc(t.status[r.status])}</span>${r.note ? `<div class="mut">${esc(r.note)}</div>` : ''}` : `<form method="post" action="/admin/leads/${r.id}"><input type="hidden" name="back" value="${esc(back)}"><select name="status" aria-label="${esc(t.cols.status)}">${opts}</select><button>${esc(t.save)}</button><input name="note" maxlength="500" placeholder="${esc(t.note)}" aria-label="${esc(t.note)}" value="${esc(r.note || '')}"></form>`)}
${td('tg', `<span class="tg tg-${esc(r.tg_status)}" title="${esc(r.tg_error || '')}">${esc(t.tg[r.tg_status] || r.tg_status)}</span>`)}
</tr>`;
  }).join('\n');
  const from = count ? (page - 1) * PAGE + 1 : 0;
  const to = Math.min(count, page * PAGE);
  const pager = count > PAGE ? `<nav class="pager">${page > 1 ? `<a href="${esc(link(url, { page: page - 1 }))}">${esc(t.prev)}</a>` : ''}<span>${esc(t.shown(from, to, count))}</span>${to < count ? `<a href="${esc(link(url, { page: page + 1 }))}">${esc(t.next)}</a>` : ''}</nav>` : '';
  const other = lang === 'ru' ? 'en' : 'ru';

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(t.adminTitle)} · ${esc(t.company)}</title><style>
:root{--bg:#f6f3ee;--card:#fff;--ink:#1d2327;--mut:#68707a;--line:#e6e0d6;--acc:#d9531e;--ok:#1f7a55}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:16px 24px;background:#1d2327;color:#fff}
header h1{margin:0;font-size:18px}header small{display:block;opacity:.7;font-weight:400;font-size:12.5px}header nav{display:flex;gap:8px}
header a{color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:6px 12px}
main{padding:20px 24px;max-width:1400px;margin:0 auto}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px}.stat b{display:block;font-size:24px}.stat span{color:var(--mut);font-size:12.5px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px}
.tabs{display:flex;flex-wrap:wrap;gap:6px}.tab{padding:6px 12px;border-radius:999px;background:var(--card);border:1px solid var(--line);color:var(--ink);text-decoration:none}
.tab span{color:var(--mut)}.tab.on{background:var(--ink);color:#fff;border-color:var(--ink)}.tab.on span{color:#cfd3d6}
form.s{display:flex;gap:6px}input,select,button{font:inherit;border:1px solid var(--line);border-radius:8px;padding:6px 9px;background:#fff;color:var(--ink)}
button{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:600;cursor:pointer}
table{width:100%;border-collapse:separate;border-spacing:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);background:#fbfaf7}
tr:last-child td{border-bottom:0}tr.st-new td:first-child{box-shadow:inset 3px 0 var(--acc)}
td form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;min-width:220px}td form input[name=note]{grid-column:1/-1}
.mut{color:var(--mut);font-size:12.5px}.nw{white-space:nowrap}.cm{margin-top:4px;font-style:italic;color:#3d444b}
.pill{display:inline-block;font-size:11.5px;padding:1px 7px;border-radius:999px;background:#eef1f3;color:#3d444b}.pill.warn{background:#fdecc8;color:#7a4b00}
.tg{font-size:12px;padding:2px 8px;border-radius:999px;background:#eef1f3}.tg-sent{background:#dcf2e6;color:var(--ok)}.tg-failed{background:#fde0d9;color:#a8321a}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:12px;padding:40px;text-align:center;color:var(--mut)}
.pager{display:flex;gap:16px;justify-content:center;margin:16px 0}.pager a{color:var(--acc)}
a{color:inherit}
@media (max-width:860px){header,main{padding-left:16px;padding-right:16px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}
table,tbody,tr,td{display:block}thead{display:none}table{background:none;border:0}
tr{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:12px;padding:6px 0}
td{border:0;padding:6px 14px;display:grid;grid-template-columns:84px minmax(0,1fr);gap:10px}td::before{content:attr(data-l);color:var(--mut);font-size:12px;padding-top:2px}td form{min-width:0}
tr.st-new td:first-child{box-shadow:none}tr.st-new{box-shadow:inset 3px 0 var(--acc)}form.s{width:100%}form.s input{flex:1}}
</style></head><body>
<header><h1>${esc(t.adminTitle)}<small>${esc(t.company)}</small></h1><nav><a href="${esc(link(url, { lang: other, page: null }))}">${other.toUpperCase()}</a>${readOnly ? `<a href="${lang === 'ru' ? '/ru/' : '/'}">${esc(t.backToSite)}</a>` : `<a href="${esc(link(url, { page: null }).replace('/admin', '/admin/leads.csv'))}">${esc(t.csv)}</a>`}</nav></header>
<main>
${readOnly ? `<p class="mut" style="margin:0 0 14px">${esc(t.ownerDemoNote)}</p>` : ''}<section class="stats"><div class="stat"><b>${total}</b><span>${esc(t.total)}</span></div><div class="stat"><b>${stats.day || 0}</b><span>${esc(t.newToday)}</span></div><div class="stat"><b>${stats.week || 0}</b><span>${esc(t.last7)}</span></div><div class="stat"><b>${stats.won || 0}</b><span>${esc(t.won)}</span></div></section>
<div class="bar"><nav class="tabs">${tabs}</nav>${readOnly ? '' : `<form class="s" method="get" action="/admin">${url.searchParams.get('lang') ? `<input type="hidden" name="lang" value="${lang}">` : ''}${status ? `<input type="hidden" name="status" value="${status}">` : ''}<input name="q" value="${esc(q)}" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}"><button>${esc(t.find)}</button></form>`}</div>
${rows.length ? `<table><thead><tr>${Object.values(t.cols).map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>` : `<div class="empty">${esc(t.empty)}</div>`}
${pager}
</main></body></html>`;
}
