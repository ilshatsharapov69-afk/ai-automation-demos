// CRM data layer on D1: membership, leads, timeline, reminders, stats and the daily digest.
// Every query is scoped by the caller's workspace_id; ids from the client are never trusted on their own.
import { seedWorkspace, dropWorkspaces } from './seed.js';
import { STATUSES, OPEN_STATUSES, SOURCES, COMPANY, STATUS_LABEL, pickLang, t, money } from './i18n.js';

const DAY = 86400000;
export const iso = (ms) => new Date(ms).toISOString();
export const isDemo = (env) => String(env.DEMO_MODE || 'on') !== 'off';
export const wsFor = (env, tgId) => (isDemo(env) ? `demo-${tgId}` : 'team');
const adminIds = (env) => String(env.ADMIN_IDS || '').split(/[\s,]+/).filter(Boolean).map(Number);
export const currency = (env) => env.CURRENCY || 'USD';

// Free-D1 guard rails for the public demo (applied in demo mode only).
export const SANDBOX_TTL_DAYS = 7;
export const CAPS = { leads: 80, notesPerLead: 40, reminders: 80 };
export const NEW_SANDBOX_LIMITS = { perIpPerHour: 8, perDay: 300 };

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function str(v, max, field) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, `${field}: must be text`);
  const s = String(v).trim();
  if (s.length > max) throw new HttpError(400, `${field}: too long (max ${max})`);
  return s || null;
}
function money0(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new HttpError(400, 'value: must be a positive number');
  return n;
}

// ---------- membership ----------

export function findMember(env, tgId) {
  return env.DB.prepare('SELECT * FROM members WHERE workspace_id = ? AND tg_id = ?').bind(wsFor(env, tgId), tgId).first();
}

/**
 * Find or create the member for a Telegram user. In demo mode the first visit seeds a private sandbox.
 * In team mode only ADMIN_IDS or holders of the current invite code get in. Returns the member row or null.
 */
export async function ensureMember(env, user, { joinCode = null, now = Date.now() } = {}) {
  const ws = wsFor(env, user.id);
  const m = await findMember(env, user.id);
  if (m) {
    await env.DB.prepare('UPDATE members SET last_seen = ?, username = ? WHERE id = ?').bind(iso(now), user.username || null, m.id).run();
    return { ...m, last_seen: iso(now) };
  }
  const lang = pickLang(user.language_code);
  if (isDemo(env)) {
    await seedWorkspace(env.DB, ws, user, lang, now);
    return findMember(env, user.id);
  }
  const wsRow = await env.DB.prepare('SELECT * FROM workspaces WHERE id = ?').bind(ws).first();
  const admin = adminIds(env).includes(user.id);
  const invited = !!(wsRow && wsRow.invite_code && joinCode && joinCode === wsRow.invite_code);
  if (!admin && !invited) return null;
  if (!wsRow) await env.DB.prepare('INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)').bind(ws, COMPANY.en, iso(now)).run();
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 60) || `user ${user.id}`;
  await env.DB.prepare('INSERT INTO members (workspace_id, tg_id, name, username, role, lang, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(ws, user.id, name, user.username || null, admin ? 'admin' : 'sales', lang, iso(now), iso(now)).run();
  return findMember(env, user.id);
}

export async function newInviteCode(env, me) {
  if (me.role !== 'admin') throw new HttpError(403, 'admin only');
  const code = [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
  await env.DB.prepare('UPDATE workspaces SET invite_code = ? WHERE id = ?').bind(code, me.workspace_id).run();
  return code;
}

export async function updateMe(env, me, body) {
  const lang = body.lang === 'ru' || body.lang === 'en' ? body.lang : me.lang;
  const tz = Number.isInteger(body.tz_offset) && Math.abs(body.tz_offset) <= 14 * 60 ? body.tz_offset : me.tz_offset;
  const digest = body.digest_on === undefined ? me.digest_on : body.digest_on ? 1 : 0;
  await env.DB.prepare('UPDATE members SET lang = ?, tz_offset = ?, digest_on = ? WHERE id = ?').bind(lang, tz, digest, me.id).run();
  return { ...me, lang, tz_offset: tz, digest_on: digest };
}

export async function teamOf(env, wsId) {
  const { results } = await env.DB.prepare('SELECT id, name, username, role, tg_id IS NOT NULL AS on_telegram FROM members WHERE workspace_id = ? ORDER BY id').bind(wsId).all();
  return results;
}

async function assertMember(env, wsId, memberId) {
  if (memberId === null) return null;
  const id = Number(memberId);
  const row = Number.isInteger(id) && (await env.DB.prepare('SELECT id, name FROM members WHERE id = ? AND workspace_id = ?').bind(id, wsId).first());
  if (!row) throw new HttpError(400, 'owner_id: not a member of this team');
  return row;
}

// ---------- demo hygiene ----------

/** Delete sandboxes created more than SANDBOX_TTL_DAYS ago (a few per call; runs only when a new sandbox is made). */
export async function pruneSandboxes(env, now = Date.now()) {
  const { results } = await env.DB.prepare("SELECT id FROM workspaces WHERE id LIKE 'demo-%' AND created_at < ? ORDER BY created_at LIMIT 10")
    .bind(iso(now - SANDBOX_TTL_DAYS * DAY)).all();
  if (results.length) await dropWorkspaces(env.DB, results.map((r) => r.id));
  await env.DB.prepare('DELETE FROM demo_limits WHERE expires_at < ?').bind(iso(now)).run();
  return results.length;
}

async function bump(env, key, limit, ttlMs, now) {
  await env.DB.prepare('INSERT INTO demo_limits (key, n, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = n + 1')
    .bind(key, iso(now + ttlMs)).run();
  return (await env.DB.prepare('SELECT n FROM demo_limits WHERE key = ?').bind(key).first('n')) <= limit;
}

/** Count one new sandbox against the per-IP and daily caps; throws 429 when over. */
export async function takeSandboxSlot(env, ip, now = Date.now()) {
  const d = iso(now);
  const okIp = await bump(env, `ip:${ip}:${d.slice(0, 13)}`, NEW_SANDBOX_LIMITS.perIpPerHour, 2 * 3600000, now);
  const okDay = await bump(env, `day:${d.slice(0, 10)}`, NEW_SANDBOX_LIMITS.perDay, 2 * DAY, now);
  if (!okIp) throw new HttpError(429, 'Too many new demo sandboxes from your network this hour. Try again later.');
  if (!okDay) throw new HttpError(429, 'The demo is busy today (daily sandbox limit reached). Try again tomorrow.');
}

async function capCheck(env, sql, arg, limit, what) {
  if (!isDemo(env)) return;
  const n = await env.DB.prepare(sql).bind(arg).first('n');
  if (n >= limit) throw new HttpError(429, `Demo limit: up to ${limit} ${what} per sandbox. Reset the demo data to start over.`);
}

// ---------- leads ----------

export async function listLeads(env, me, f = {}, now = Date.now()) {
  const where = ['l.workspace_id = ?'];
  const args = [me.workspace_id];
  if (f.owner === 'me') { where.push('l.owner_id = ?'); args.push(me.id); }
  else if (f.owner === 'none') where.push('l.owner_id IS NULL');
  else if (f.owner && /^\d+$/.test(f.owner)) { where.push('l.owner_id = ?'); args.push(Number(f.owner)); }
  if (f.source && SOURCES.includes(f.source)) { where.push('l.source = ?'); args.push(f.source); }

  const { results } = await env.DB.prepare(
    `SELECT l.*, m.name AS owner_name,
       (SELECT MIN(r.due_at) FROM reminders r WHERE r.lead_id = l.id AND r.done = 0) AS next_due,
       (SELECT COUNT(*) FROM notes n WHERE n.lead_id = l.id AND n.kind = 'note') AS notes_count
     FROM leads l LEFT JOIN members m ON m.id = l.owner_id
     WHERE ${where.join(' AND ')}
     ORDER BY l.updated_at DESC LIMIT 1000`,
  ).bind(...args).all();

  // Text search in JS: SQLite LIKE is case-insensitive for ASCII only, and the team writes in Cyrillic too.
  const q = String(f.q || '').trim().toLowerCase();
  let rows = q ? results.filter((l) => [l.name, l.company, l.phone, l.email].some((v) => v && v.toLowerCase().includes(q))) : results;

  const counts = { all: rows.length, open: 0, overdue: 0 };
  for (const s of STATUSES) counts[s] = 0;
  const nowIso = iso(now);
  for (const l of rows) {
    counts[l.status] = (counts[l.status] || 0) + 1;
    if (OPEN_STATUSES.includes(l.status)) counts.open++;
    if (l.next_due && l.next_due < nowIso) counts.overdue++;
  }
  if (f.status === 'open') rows = rows.filter((l) => OPEN_STATUSES.includes(l.status));
  else if (f.status === 'overdue') rows = rows.filter((l) => l.next_due && l.next_due < nowIso);
  else if (STATUSES.includes(f.status)) rows = rows.filter((l) => l.status === f.status);
  return { leads: rows, counts };
}

async function leadRow(env, me, id) {
  const lead = /^\d+$/.test(String(id))
    && (await env.DB.prepare('SELECT l.*, m.name AS owner_name FROM leads l LEFT JOIN members m ON m.id = l.owner_id WHERE l.id = ? AND l.workspace_id = ?')
      .bind(Number(id), me.workspace_id).first());
  if (!lead) throw new HttpError(404, 'lead not found');
  return lead;
}

export async function getLead(env, me, id) {
  const lead = await leadRow(env, me, id);
  const [notes, reminders] = await env.DB.batch([
    env.DB.prepare('SELECT n.*, m.name AS author_name FROM notes n LEFT JOIN members m ON m.id = n.author_id WHERE n.lead_id = ? ORDER BY n.created_at DESC, n.id DESC').bind(lead.id),
    env.DB.prepare('SELECT r.*, m.name AS member_name FROM reminders r LEFT JOIN members m ON m.id = r.member_id WHERE r.lead_id = ? ORDER BY r.done, r.due_at').bind(lead.id),
  ]);
  return { lead, notes: notes.results, reminders: reminders.results };
}

function leadFields(body, partial) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (!partial || has('name')) {
    out.name = str(body.name, 120, 'name');
    if (!out.name) throw new HttpError(400, 'name: required');
  }
  for (const [k, max] of [['company', 120], ['phone', 40], ['email', 120]]) if (!partial || has(k)) out[k] = str(body[k], max, k);
  if (out.email && !/^[^\s@]+@[^\s@]+$/.test(out.email)) throw new HttpError(400, 'email: looks wrong');
  if (!partial || has('source')) {
    out.source = body.source || 'website';
    if (!SOURCES.includes(out.source)) throw new HttpError(400, 'source: unknown');
  }
  if (!partial || has('value')) out.value = money0(body.value);
  return out;
}

export async function createLead(env, me, body, now = Date.now()) {
  await capCheck(env, 'SELECT COUNT(*) AS n FROM leads WHERE workspace_id = ?', me.workspace_id, CAPS.leads, 'leads');
  const f = leadFields(body || {}, false);
  const status = body.status || 'new';
  if (!STATUSES.includes(status)) throw new HttpError(400, 'status: unknown');
  const owner = body.owner_id === undefined ? me.id : (await assertMember(env, me.workspace_id, body.owner_id))?.id ?? null;
  const at = iso(now);
  const r = await env.DB.prepare('INSERT INTO leads (workspace_id, name, company, phone, email, source, status, value, owner_id, created_at, updated_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(me.workspace_id, f.name, f.company, f.phone, f.email, f.source, status, f.value, owner, at, at, status === 'won' || status === 'lost' ? at : null).run();
  const id = r.meta.last_row_id;
  const stmts = [env.DB.prepare("INSERT INTO notes (lead_id, author_id, kind, text, created_at) VALUES (?, ?, 'created', '', ?)").bind(id, me.id, at)];
  const note = str(body.note, 2000, 'note');
  if (note) stmts.push(env.DB.prepare("INSERT INTO notes (lead_id, author_id, kind, text, created_at) VALUES (?, ?, 'note', ?, ?)").bind(id, me.id, note, at));
  await env.DB.batch(stmts);
  return getLead(env, me, id);
}

export async function updateLead(env, me, id, body, now = Date.now()) {
  const lead = await leadRow(env, me, id);
  body = body || {};
  const f = leadFields(body, true);
  const at = iso(now);
  const events = [];
  if (body.status !== undefined && body.status !== lead.status) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'status: unknown');
    f.status = body.status;
    f.closed_at = body.status === 'won' || body.status === 'lost' ? at : null;
    events.push(['status', `${lead.status}>${body.status}`]);
  }
  if (body.owner_id !== undefined && body.owner_id !== lead.owner_id) {
    const owner = await assertMember(env, me.workspace_id, body.owner_id);
    f.owner_id = owner ? owner.id : null;
    events.push(['owner', owner ? owner.name : '']);
  }
  const keys = Object.keys(f);
  if (!keys.length) return getLead(env, me, lead.id);
  const stmts = [
    env.DB.prepare(`UPDATE leads SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND workspace_id = ?`)
      .bind(...keys.map((k) => f[k]), at, lead.id, me.workspace_id),
    ...events.map(([kind, text]) => env.DB.prepare('INSERT INTO notes (lead_id, author_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)').bind(lead.id, me.id, kind, text, at)),
  ];
  await env.DB.batch(stmts);
  return getLead(env, me, lead.id);
}

export async function addNote(env, me, id, body, now = Date.now()) {
  const lead = await leadRow(env, me, id);
  const text = str(body?.text, 2000, 'text');
  if (!text) throw new HttpError(400, 'text: required');
  await capCheck(env, 'SELECT COUNT(*) AS n FROM notes WHERE lead_id = ?', lead.id, CAPS.notesPerLead, 'notes per lead');
  await env.DB.batch([
    env.DB.prepare("INSERT INTO notes (lead_id, author_id, kind, text, created_at) VALUES (?, ?, 'note', ?, ?)").bind(lead.id, me.id, text, iso(now)),
    env.DB.prepare('UPDATE leads SET updated_at = ? WHERE id = ?').bind(iso(now), lead.id),
  ]);
  return getLead(env, me, lead.id);
}

// ---------- reminders ----------

export async function addReminder(env, me, id, body, now = Date.now()) {
  const lead = await leadRow(env, me, id);
  await capCheck(env, 'SELECT COUNT(*) AS n FROM reminders WHERE workspace_id = ?', me.workspace_id, CAPS.reminders, 'reminders');
  const text = str(body?.text, 300, 'text');
  if (!text) throw new HttpError(400, 'text: required');
  const due = Date.parse(body?.due_at);
  if (!Number.isFinite(due)) throw new HttpError(400, 'due_at: must be an ISO date-time');
  if (due < now - DAY) throw new HttpError(400, 'due_at: is in the past');
  const who = body.member_id === undefined ? me.id : (await assertMember(env, me.workspace_id, body.member_id))?.id;
  if (!who) throw new HttpError(400, 'member_id: required');
  await env.DB.prepare('INSERT INTO reminders (workspace_id, lead_id, member_id, due_at, text, done, sent_at, created_at) VALUES (?, ?, ?, ?, ?, 0, NULL, ?)')
    .bind(me.workspace_id, lead.id, who, iso(due), text, iso(now)).run();
  return getLead(env, me, lead.id);
}

export async function updateReminder(env, me, id, body) {
  const r = /^\d+$/.test(String(id)) && (await env.DB.prepare('SELECT * FROM reminders WHERE id = ? AND workspace_id = ?').bind(Number(id), me.workspace_id).first());
  if (!r) throw new HttpError(404, 'reminder not found');
  const done = body?.done ? 1 : 0;
  await env.DB.prepare('UPDATE reminders SET done = ? WHERE id = ?').bind(done, r.id).run();
  return { reminder: { ...r, done } };
}

export async function listReminders(env, me, scope = 'mine', now = Date.now()) {
  const args = [me.workspace_id];
  let who = '';
  if (scope !== 'all') { who = 'AND r.member_id = ?'; args.push(me.id); }
  const { results } = await env.DB.prepare(
    `SELECT r.*, l.name AS lead_name, l.company AS lead_company, l.status AS lead_status, m.name AS member_name
     FROM reminders r JOIN leads l ON l.id = r.lead_id LEFT JOIN members m ON m.id = r.member_id
     WHERE r.workspace_id = ? AND r.done = 0 ${who} ORDER BY r.due_at LIMIT 300`,
  ).bind(...args).all();
  const { end } = localDay(now, me.tz_offset);
  const groups = { overdue: [], today: [], upcoming: [] };
  const nowIso = iso(now);
  for (const r of results) {
    if (r.due_at < nowIso) groups.overdue.push(r);
    else if (r.due_at < end) groups.today.push(r);
    else groups.upcoming.push(r);
  }
  return groups;
}

/** UTC ISO bounds of the member's local calendar day, plus the local date string. */
export function localDay(now, tzOffset = 0) {
  const local = new Date(now + tzOffset * 60000);
  const day = local.toISOString().slice(0, 10);
  const start = Date.parse(`${day}T00:00:00Z`) - tzOffset * 60000;
  return { day, start: iso(start), end: iso(start + DAY), localHour: local.getUTCHours() };
}

// ---------- stats ----------

export async function stats(env, me, now = Date.now()) {
  const { results: leads } = await env.DB.prepare('SELECT id, status, value, source, owner_id, created_at, closed_at FROM leads WHERE workspace_id = ?').bind(me.workspace_id).all();
  const team = await teamOf(env, me.workspace_id);
  const monthAgo = iso(now - 30 * DAY);
  const funnel = STATUSES.map((s) => ({ status: s, count: 0, value: 0 }));
  const bySource = Object.fromEntries(SOURCES.map((s) => [s, { source: s, count: 0, won: 0 }]));
  const byOwner = new Map(team.map((m) => [m.id, { id: m.id, name: m.name, open: 0, open_value: 0, won30: 0, won30_value: 0 }]));
  const weeks = Array.from({ length: 8 }, (_, i) => ({ start: iso(now - (8 - i) * 7 * DAY), count: 0 }));
  let won30 = 0, won30Value = 0, wonAll = 0, wonAllValue = 0, lost90 = 0, won90 = 0;
  const q90 = iso(now - 90 * DAY);

  for (const l of leads) {
    const f = funnel[STATUSES.indexOf(l.status)];
    f.count++; f.value += l.value;
    if (bySource[l.source]) { bySource[l.source].count++; if (l.status === 'won') bySource[l.source].won++; }
    const o = byOwner.get(l.owner_id);
    if (OPEN_STATUSES.includes(l.status) && o) { o.open++; o.open_value += l.value; }
    if (l.status === 'won') {
      wonAll++; wonAllValue += l.value;
      if (l.closed_at >= monthAgo) { won30++; won30Value += l.value; if (o) { o.won30++; o.won30_value += l.value; } }
      if (l.closed_at >= q90) won90++;
    }
    if (l.status === 'lost' && l.closed_at >= q90) lost90++;
    const ageWeeks = Math.floor((now - Date.parse(l.created_at)) / (7 * DAY));
    if (ageWeeks >= 0 && ageWeeks < 8) weeks[7 - ageWeeks].count++;
  }
  const open = funnel.filter((f) => OPEN_STATUSES.includes(f.status));
  return {
    open_count: open.reduce((n, f) => n + f.count, 0),
    open_value: open.reduce((n, f) => n + f.value, 0),
    won_30d: { count: won30, value: won30Value },
    win_rate_90d: won90 + lost90 ? Math.round((won90 / (won90 + lost90)) * 100) : null,
    avg_deal: wonAll ? Math.round(wonAllValue / wonAll) : 0,
    funnel,
    by_source: Object.values(bySource),
    by_owner: [...byOwner.values()],
    weekly_new: weeks,
    currency: currency(env),
  };
}

// ---------- digest ----------

export async function buildDigest(env, member, now = Date.now()) {
  const lang = member.lang;
  const T = t(lang);
  const ws = member.workspace_id;
  const { day, end } = localDay(now, member.tz_offset);
  const one = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const [dueToday, overdue, newMine, unassigned, pipeline, wonWeek, stale] = await env.DB.batch([
    one('SELECT r.text, l.name, l.company, r.due_at FROM reminders r JOIN leads l ON l.id = r.lead_id WHERE r.member_id = ? AND r.done = 0 AND r.due_at >= ? AND r.due_at < ? ORDER BY r.due_at', member.id, iso(now), end),
    one('SELECT COUNT(*) AS n FROM reminders WHERE member_id = ? AND done = 0 AND due_at < ?', member.id, iso(now)),
    one("SELECT COUNT(*) AS n FROM leads WHERE owner_id = ? AND status = 'new' AND created_at >= ?", member.id, iso(now - DAY)),
    one(`SELECT COUNT(*) AS n FROM leads WHERE workspace_id = ? AND owner_id IS NULL AND status IN (${OPEN_STATUSES.map(() => '?').join(',')})`, ws, ...OPEN_STATUSES),
    one(`SELECT COUNT(*) AS n, COALESCE(SUM(value), 0) AS v FROM leads WHERE workspace_id = ? AND status IN (${OPEN_STATUSES.map(() => '?').join(',')})`, ws, ...OPEN_STATUSES),
    one("SELECT COUNT(*) AS n, COALESCE(SUM(value), 0) AS v FROM leads WHERE workspace_id = ? AND status = 'won' AND closed_at >= ?", ws, iso(now - 7 * DAY)),
    one(`SELECT COUNT(*) AS n FROM leads WHERE owner_id = ? AND updated_at < ? AND status IN (${OPEN_STATUSES.map(() => '?').join(',')})`, member.id, iso(now - 7 * DAY), ...OPEN_STATUSES),
  ]);
  const n = (r) => r.results[0]?.n || 0;
  const cur = currency(env);
  const dateLabel = new Date(Date.parse(`${day}T12:00:00Z`)).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const lines = [T.digestHead(member.name.split(' ')[0], dateLabel), ''];
  const today = dueToday.results;
  if (today.length) {
    lines.push(T.dRemToday(today.length));
    for (const r of today.slice(0, 6)) {
      const hhmm = new Date(Date.parse(r.due_at) + member.tz_offset * 60000).toISOString().slice(11, 16);
      lines.push(`   • ${hhmm} ${r.text} (${r.company || r.name})`);
    }
  }
  if (n(overdue)) lines.push(T.dOverdue(n(overdue)));
  if (n(newMine)) lines.push(T.dNewMine(n(newMine)));
  if (n(unassigned)) lines.push(T.dUnassigned(n(unassigned)));
  if (n(stale)) lines.push(T.dStale(n(stale)));
  if (!today.length && !n(overdue) && !n(newMine)) lines.push(T.dNothing);
  lines.push('');
  lines.push(T.dPipeline(n(pipeline), money(pipeline.results[0]?.v, lang, cur)));
  lines.push(T.dWon(n(wonWeek), money(wonWeek.results[0]?.v, lang, cur)));
  return {
    text: lines.join('\n'),
    day,
    counts: { due_today: today.length, overdue: n(overdue), new_mine: n(newMine), unassigned: n(unassigned), open: n(pipeline), won_week: n(wonWeek), stale: n(stale) },
  };
}

export const statusLabel = (s, lang) => STATUS_LABEL[lang === 'ru' ? 'ru' : 'en'][s] || s;
