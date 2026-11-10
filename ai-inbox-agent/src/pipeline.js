// The agent: intake -> classify -> extract -> score -> draft -> store -> notify; and the owner's decisions.
import { classify, DEFAULT_MODEL } from './classify.js';
import { scoreLead } from './score.js';
import { draftReply, DEFAULT_DRAFT_MODEL } from './draft.js';
import { insertRequest, updateRequest, getRequest, takeRate, rateUsed } from './store.js';
import { sendOwnerCard, refreshCards } from './telegram.js';
import { T, L } from './i18n.js';

/** Shared per-request context. tg() records calls in `outbox` when BOT_TOKEN is not set (tests, local dev). */
export function makeCtx(env, { origin } = {}) {
  const outbox = [];
  const now = env.NOW_OVERRIDE ? new Date(env.NOW_OVERRIDE) : new Date();
  async function tg(method, payload) {
    if (!env.BOT_TOKEN) {
      outbox.push({ method, ...payload });
      return { ok: true, result: { message_id: 1000 + outbox.length } };
    }
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({ ok: false }));
    if (!j.ok) console.error('tg', method, r.status, JSON.stringify(j).slice(0, 300));
    return j;
  }
  return {
    env,
    db: env.DB,
    tg,
    outbox,
    now,
    nowIso: now.toISOString(),
    origin: env.PUBLIC_URL || origin || '',
    ownerId: env.OWNER_CHAT_ID ? Number(env.OWNER_CHAT_ID) : null,
    ownerLang: L(env.OWNER_LANG || 'en'),
    demo: env.DEMO_MODE !== 'off',
    notify: env.NOTIFY || 'hot', // 'hot' | 'all' (every non-spam request)
  };
}

export const AI_IP_HOURLY = (env) => Number(env.AI_IP_HOURLY ?? 5);
export const AI_DAILY = (env) => Number(env.AI_DAILY_CAP ?? 80);

/** A short stable hash of the visitor's IP (the raw address is never stored). */
export async function hashIp(ip) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`inbox-demo:${ip || 'unknown'}`));
  return [...new Uint8Array(d)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** How many AI-read messages this visitor still has this hour, and whether the daily demo budget is gone. */
export async function aiLeft(c, ip) {
  const hour = c.nowIso.slice(0, 13);
  const day = c.nowIso.slice(0, 10);
  const usedIp = await rateUsed(c.db, `ai:ip:${await hashIp(ip)}`, hour);
  const usedDay = await rateUsed(c.db, 'ai:day', day);
  return { ip: Math.max(0, AI_IP_HOURLY(c.env) - usedIp), ipCap: AI_IP_HOURLY(c.env), dayLeft: Math.max(0, AI_DAILY(c.env) - usedDay), on: Boolean(c.env.AI) && c.env.AI_MODE !== 'off' };
}

/**
 * One AI unit is one message (the classify call and the draft call together).
 * Caps: per visitor IP per hour (public form only), and a global per-day cap for everything except the seed.
 * @returns {{allow: boolean, note: string}} note: 'ok' | 'ip_cap' | 'day_cap' | 'off' | 'no_ai'
 */
async function aiGate(c, msg) {
  if (!c.env.AI) return { allow: false, note: 'no_ai' };
  if (c.env.AI_MODE === 'off') return { allow: false, note: 'off' };
  if (msg.origin === 'seed') return { allow: true, note: 'ok' };
  if (msg.origin === 'visitor' && !(await takeRate(c.db, `ai:ip:${await hashIp(msg.ip)}`, c.nowIso.slice(0, 13), AI_IP_HOURLY(c.env)))) return { allow: false, note: 'ip_cap' };
  if (!(await takeRate(c.db, 'ai:day', c.nowIso.slice(0, 10), AI_DAILY(c.env)))) return { allow: false, note: 'day_cap' };
  return { allow: true, note: 'ok' };
}

/**
 * Process one incoming message (any channel).
 * @returns {{row, duplicate:boolean, ignored?:string}}
 */
export async function ingest(msg, c) {
  if (msg.honeypot) return { ignored: 'honeypot' };
  if (!msg.body || msg.body.trim().length < 2) return { ignored: 'empty' };
  const text = [msg.subject, msg.body].filter(Boolean).join('\n');
  const gate = await aiGate(c, msg);
  const model = c.env.AI_MODEL || DEFAULT_MODEL;
  const draftModel = c.env.AI_DRAFT_MODEL || c.env.AI_MODEL || DEFAULT_DRAFT_MODEL;

  const r = await classify(msg, { ai: c.env.AI, model, allowAi: gate.allow, now: c.now });
  if (r.aiError) console.error('ai classify fallback:', r.aiError);
  const s = scoreLead(r, text, c.now);
  const d = r.category === 'spam' ? { text: null, source: 'none' } : await draftReply(r, text, { ai: c.env.AI, model: draftModel, allowAi: gate.allow && !r.aiError, now: c.now });
  if (d.error) console.error('ai draft fallback:', d.error);
  const aiNote = gate.allow ? (r.by === 'ai' ? 'ok' : 'error') : gate.note;

  const { row, duplicate } = await insertRequest(c.db, {
    channel: msg.channel,
    external_id: msg.externalId || null,
    sender: msg.sender || null,
    tg_chat_id: msg.tgChatId ?? null,
    subject: msg.subject || null,
    body: msg.body,
    lang: r.lang,
    category: r.category,
    confidence: r.confidence,
    classified_by: r.by,
    name: r.name,
    email: r.email,
    phone: r.phone,
    telegram: r.telegram,
    product: r.product,
    order_no: r.order,
    budget_amount: r.budget?.amount ?? null,
    budget_currency: r.budget?.currency ?? null,
    budget_text: r.budget?.text ?? null,
    deadline_date: r.deadline?.date ?? null,
    deadline_text: r.deadline?.text ?? null,
    summary: r.summary,
    score: s.score,
    hot: s.hot ? 1 : 0,
    score_reasons: JSON.stringify(s.reasons),
    draft: d.text,
    draft_source: d.source,
    status: r.category === 'spam' ? 'spam' : 'new',
    origin: msg.origin || 'live',
    visitor: msg.origin === 'visitor' ? msg.visitor || null : null,
    ai_note: aiNote,
    ai_model: r.by === 'ai' ? model : null,
    ai_draft_model: d.source === 'ai' ? draftModel : null,
    created_at: msg.createdAt || c.nowIso,
    updated_at: msg.createdAt || c.nowIso,
  });
  if (duplicate) return { row, duplicate: true };

  let out = row;
  const push = row.category !== 'spam' && (row.hot || c.notify === 'all');
  if (push && c.ownerId) {
    const msgId = await sendOwnerCard(c, row, c.ownerId);
    if (msgId) out = await updateRequest(c.db, row.id, { owner_chat_id: c.ownerId, owner_msg_id: msgId });
  }
  return { row: out, duplicate: false, pushed: push && Boolean(c.ownerId) };
}

/** Deliver an approved reply over the request's own channel. */
async function deliver(c, row) {
  if (row.channel === 'telegram' && row.tg_chat_id) {
    const r = await c.tg('sendMessage', { chat_id: row.tg_chat_id, text: row.draft });
    return r && r.ok ? 'telegram' : null;
  }
  const to = row.email;
  if (c.env.REPLY_WEBHOOK_URL && to) {
    try {
      const res = await fetch(c.env.REPLY_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(c.env.REPLY_WEBHOOK_SECRET ? { 'X-Inbox-Secret': c.env.REPLY_WEBHOOK_SECRET } : {}) },
        body: JSON.stringify({ request_id: row.id, to, name: row.name, subject: replySubject(row), text: row.draft }),
      });
      return res.ok ? 'email' : null;
    } catch (e) {
      console.error('reply webhook failed', String(e));
      return null;
    }
  }
  return null;
}

export const replySubject = (row) => (row.subject ? (/^re:/i.test(row.subject) ? row.subject : `Re: ${row.subject}`) : row.lang === 'ru' ? 'Ответ Oakbloom' : 'Reply from Oakbloom');

/**
 * Owner decision from Telegram or the web inbox.
 * action: 'approve' | 'reject' | 'save' (draft text only). canDeliver=false marks approved without sending (public demo inbox).
 */
export async function decide(c, id, action, { draft, by = 'web', canDeliver = true, cards = [] } = {}) {
  const row = await getRequest(c.db, id);
  if (!row) return { error: 'not_found' };
  const fields = { updated_at: c.nowIso };
  if (typeof draft === 'string' && draft.trim() && draft.trim() !== row.draft) {
    fields.draft = draft.trim().slice(0, 3000);
    fields.draft_source = 'owner';
  }
  if (action === 'save') return { row: await updateRequest(c.db, id, fields), changed: true };
  if (row.status !== 'new' && row.status !== 'spam') return { row, already: true };
  let deliveredVia = null;
  if (action === 'approve') {
    const next = { ...row, ...fields };
    if (!next.draft) return { error: 'no_draft', row };
    deliveredVia = canDeliver ? await deliver(c, next) : null;
    fields.status = deliveredVia ? 'sent' : 'approved';
  } else if (action === 'reject') {
    fields.status = 'rejected';
  } else return { error: 'bad_action' };
  fields.decided_at = c.nowIso;
  fields.decided_by = by;
  const out = await updateRequest(c.db, id, fields);
  await refreshCards(c, out, cards);
  return { row: out, deliveredVia };
}

export function statusText(row, lang) {
  return T[L(lang)].st[row.status] || row.status;
}
