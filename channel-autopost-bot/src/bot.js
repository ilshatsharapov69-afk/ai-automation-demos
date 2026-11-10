// Bot flows: content queue, AI drafts, previews with Approve/Edit buttons, schedule, publishing, stats, paid access.
import {
  isDemo, isManager, wsOf, aiLimit, getUser, getState, setState, setLang, getSettings, updateSettings, takeAiBudget,
  getPost, createPost, updatePost, deletePost, approveToNextSlot, queueOf, claimForPublish, duePosts, releaseStuck,
  statsOf, resetSandbox,
} from './store.js';
import { generateDraft } from './ai.js';
import { plansMessage, startCheckout, cancelCheckout, mockPay, statusMessage, simulateExpiry, expireDue, revenueText } from './paywall.js';
import { t, MENU_COMMANDS, short } from './i18n.js';
import { fmtWhen, fmtTz, fmtDay, parseSlots, parseTz, parseWhen, ymd } from './time.js';

/** Telegram Bot API caller. With env.TG_OUTBOX (an array, tests/preview) calls are recorded and nothing leaves the process. */
export function makeTg(env) {
  return async function tg(method, payload) {
    if (Array.isArray(env.TG_OUTBOX)) {
      env.TG_OUTBOX.push({ method, ...payload });
      const fake = typeof env.TG_FAKE === 'function' ? env.TG_FAKE(method, payload) : null;
      if (fake) return fake;
      const result = method === 'createChatInviteLink' ? { invite_link: `https://t.me/+test${env.TG_OUTBOX.length}` } : method.startsWith('send') ? { message_id: 1000 + env.TG_OUTBOX.length } : true;
      return { ok: true, result };
    }
    if (!env.BOT_TOKEN) return { ok: false, description: 'BOT_TOKEN is not set' };
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }));
      if (!j.ok) console.error('tg', method, r.status, JSON.stringify(j).slice(0, 300));
      return j;
    } catch (e) {
      return { ok: false, description: String(e && e.message ? e.message : e) };
    }
  };
}

const kb = (rows) => ({ inline_keyboard: rows });
const parseEntities = (s) => { try { return s ? JSON.parse(s) : undefined; } catch { return undefined; } };

function menu(T, manager) {
  const m = T.menu;
  const keyboard = manager ? [[m.new, m.ai], [m.queue, m.stats], [m.schedule, m.paid]] : [[m.subscribe, m.access]];
  return { keyboard: keyboard.map((r) => r.map((text) => ({ text }))), resize_keyboard: true, is_persistent: true };
}

// ---------- preview ----------

const SEP = '\n\n— — —\n';

export function statusLine(post, T, s, lang) {
  const src = post.source === 'ai' ? T.srcAi : post.source === 'stub' ? T.srcStub : T.srcManual;
  const when = (ms) => `${fmtWhen(ms, s.tz, lang)} (${fmtTz(s.tz)})`;
  switch (post.status) {
    case 'approved':
    case 'publishing': return T.stApproved(post.id, when(post.scheduled_at));
    case 'published': return T.stPublished(post.id, when(post.published_at));
    case 'failed': return T.stFailed(post.id, post.error || '?');
    default: return T.stDraft(post.id, src);
  }
}

/** Buttons under a preview (prefix 'p') or under a short status card (prefix 'c'; refreshed as a card). */
function previewButtons(post, T, prefix = 'p') {
  const b = T.btn;
  const cb = (act) => `${prefix}:${act}:${post.id}`;
  switch (post.status) {
    case 'draft': {
      const rows = [[{ text: b.approve, callback_data: cb('ok') }, { text: b.edit, callback_data: cb('ed') }], [{ text: b.time, callback_data: cb('tm') }, { text: b.del, callback_data: cb('del') }]];
      if (post.source !== 'manual' && post.topic) rows.push([{ text: b.regen, callback_data: cb('rg') }]);
      return kb(rows);
    }
    case 'approved': return kb([[{ text: b.now, callback_data: cb('now') }], [{ text: b.time, callback_data: cb('tm') }, { text: b.back, callback_data: cb('back') }]]);
    case 'failed': return kb([[{ text: b.retry, callback_data: cb('now') }, { text: b.back, callback_data: cb('back') }]]);
    default: return kb([]);
  }
}

/** The post exactly as it will look in the channel, plus a status line and the buttons. */
export function previewPayload(post, T, s, lang) {
  const line = statusLine(post, T, s, lang);
  const photo = post.photo && post.photo !== 'seed' ? post.photo : null;
  const limit = photo ? 1024 : 4096;
  let body = post.text || '';
  let entities = parseEntities(post.entities);
  const tail = body ? SEP + line : line;
  if (body.length + tail.length > limit) {
    body = body.slice(0, limit - tail.length - 1) + '…';
    entities = entities && entities.filter((e) => e.offset + e.length <= body.length - 1);
  }
  const content = body + tail;
  const reply_markup = previewButtons(post, T);
  return photo
    ? { method: 'sendPhoto', photo, caption: content, ...(entities?.length ? { caption_entities: entities } : {}), reply_markup }
    : { method: 'sendMessage', text: content, ...(entities?.length ? { entities } : {}), reply_markup };
}

async function sendPreview(tg, chatId, post, T, s, lang) {
  const { method, ...p } = previewPayload(post, T, s, lang);
  return tg(method, { chat_id: chatId, ...p });
}

/** Re-draws a preview in place. A caption can only be edited on a photo message, text only on a text message. */
async function editPreview(tg, message, post, T, s, lang) {
  const { method, ...p } = previewPayload(post, T, s, lang);
  const at = { chat_id: message.chat.id, message_id: message.message_id };
  const content = p.caption ?? p.text;
  const entities = p.caption_entities ?? p.entities;
  if (message.photo) return tg('editMessageCaption', { ...at, caption: content, caption_entities: entities, reply_markup: p.reply_markup });
  return tg('editMessageText', { ...at, text: content, entities, reply_markup: p.reply_markup });
}

/** A short status card (status line + buttons) sent at the bottom of the chat, e.g. after the owner typed a time. */
const cardPayload = (post, T, s, lang) => ({ text: statusLine(post, T, s, lang), reply_markup: previewButtons(post, T, 'c') });

/** Marks an old preview as replaced after an edit, so its buttons cannot act on content it no longer shows. */
async function markReplaced(tg, chatId, ref, T, id) {
  if (!ref?.msg) return;
  const at = { chat_id: chatId, message_id: ref.msg, reply_markup: kb([]) };
  return ref.photo ? tg('editMessageCaption', { ...at, caption: T.replaced(id) }) : tg('editMessageText', { ...at, text: T.replaced(id) });
}

// ---------- publishing ----------

export function targetOf(env, post, s) {
  if (isDemo(env)) return Number(post.ws.slice(1));
  return s.channel_id || String(env.CHANNEL_ID || '').trim() || null;
}

/** Sends one post to the channel (demo: to the owner's chat). Safe to call twice: only one call wins the claim. */
export async function publishPost(env, tg, post, s, now) {
  if (!(await claimForPublish(env, post.id, now))) return { ok: false, skipped: true };
  const target = targetOf(env, post, s);
  let res;
  if (!target) res = { ok: false, description: 'CHANNEL_ID is not set' };
  else {
    const entities = parseEntities(post.entities);
    res = post.photo
      ? await tg('sendPhoto', { chat_id: target, photo: post.photo, ...(post.text ? { caption: post.text } : {}), ...(entities ? { caption_entities: entities } : {}) })
      : await tg('sendMessage', { chat_id: target, text: post.text, ...(entities ? { entities } : {}) });
  }
  const author = await env.DB.prepare('SELECT lang FROM users WHERE id = ?').bind(post.author_id).first();
  const lang = author?.lang || 'en';
  const T = t(lang);
  if (res && res.ok) {
    await updatePost(env, post.id, { status: 'published', published_at: now, channel_msg_id: res.result?.message_id ?? null, error: null }, now);
    if (isDemo(env)) await tg('sendMessage', { chat_id: target, text: T.publishedNotice(s.title), reply_parameters: { message_id: res.result?.message_id, allow_sending_without_reply: true } });
    return { ok: true };
  }
  const error = String(res?.description || 'Telegram error').slice(0, 200);
  await updatePost(env, post.id, { status: 'failed', error }, now);
  await tg('sendMessage', { chat_id: post.author_id, text: T.failNotice(post.id, error) });
  return { ok: false, error };
}

/** Cron Trigger: publish what is due, release stuck posts, run paid-access reminders and expiry. */
export async function runCron(env, { tg, now = Date.now() }) {
  const released = await releaseStuck(env, now);
  const due = await duePosts(env, now);
  const cache = new Map();
  let published = 0, failed = 0;
  for (const p of due) {
    if (!cache.has(p.ws)) cache.set(p.ws, await getSettings(env, p.ws, { now }));
    const r = await publishPost(env, tg, p, cache.get(p.ws), now);
    if (r.ok) published++;
    else if (!r.skipped) failed++;
  }
  // Demo sandboxes lapse quietly (no reminder a month after a visit); the demo shows expiry via its own button.
  const subs = await expireDue(env, tg, now, { quiet: isDemo(env) });
  return { published, failed, released, ...subs };
}

// ---------- views ----------

function queueView(T, lang, s, { scheduled, drafts }) {
  const label = (p) => (p.photo ? '🖼 ' : '') + short((p.text || '').split('\n').find((l) => l.trim()) || T.photoOnly, 40);
  const items = scheduled.map((p) => T.queueItem(fmtWhen(p.scheduled_at, s.tz, lang) + (p.status === 'failed' ? ' ⚠️' : ''), p.id, label(p)));
  const dr = drafts.map((p) => T.draftItem(p.id, label(p)));
  const ids = [...scheduled, ...drafts].map((p) => ({ text: T.btn.open(p.id), callback_data: `p:open:${p.id}` }));
  const rows = [];
  for (let i = 0; i < ids.length; i += 5) rows.push(ids.slice(i, i + 5));
  rows.push([{ text: T.btn.slots, callback_data: 'sched' }]);
  return { text: T.queue(s.title, s.slotList, fmtTz(s.tz), items, dr), reply_markup: kb(rows) };
}

function scheduleView(T, s) {
  const rows = T.presets.map((p, i) => [{ text: T.presetLabel(p), callback_data: `slots:${i}` }]);
  rows.push([{ text: T.btn.custom, callback_data: 'slots:custom' }]);
  return { text: T.schedule(s.slotList, fmtTz(s.tz)), reply_markup: kb(rows) };
}

async function statsView(env, T, lang, s, now) {
  const st = await statsOf(env, s.ws, s, now);
  const bars = st.perDay.map((d) => `${fmtDay(d.at, s.tz, lang)}  ${d.n ? '▇'.repeat(Math.min(d.n, 12)) : '·'} ${d.n}`).join('\n');
  const w = (ms) => (ms ? fmtWhen(ms, s.tz, lang) : null);
  const text = T.stats({
    ...st, title: s.title, bars, lastAt: w(st.lastAt), nextAt: w(st.nextAt), coverUntil: st.queued > 1 ? w(st.coverUntil) : null,
    revenue: revenueText(st.revenue, env), aiUsed: s.ai_day === ymd(now, s.tz) ? s.ai_used : 0, aiLimit: aiLimit(env),
  });
  return { text, entities: [{ type: 'pre', offset: text.indexOf(bars), length: bars.length }] };
}

// ---------- drafts ----------

async function makeDraft(env, { topic, lang, s, variant, now }) {
  const aiOn = env.AI && String(env.AI_MODE || 'on').toLowerCase() !== 'off';
  const budgetOk = aiOn ? await takeAiBudget(env, s, ymd(now, s.tz)) : true;
  return generateDraft(env, { topic, lang, title: s.title, variant, budgetOk });
}

/** Text or photo from an owner message -> { text, entities, photo } or { error }. */
function contentOf(msg, T) {
  if (Array.isArray(msg.photo) && msg.photo.length) {
    const text = msg.caption || '';
    if (text.length > 1024) return { error: T.tooLongCaption(text.length) };
    return { text, entities: msg.caption_entities, photo: msg.photo[msg.photo.length - 1].file_id };
  }
  if (typeof msg.text === 'string') {
    if (!msg.text.trim()) return { error: T.emptyPost };
    if (msg.text.length > 4096) return { error: T.tooLongText(msg.text.length) };
    return { text: msg.text, entities: msg.entities, photo: null };
  }
  return { error: T.unsupported };
}

// ---------- updates ----------

export async function handleUpdate(update, ctx) {
  const c = { ...ctx, now: ctx.now ?? Date.now() };
  if (update.callback_query) return onCallback(update.callback_query, c);
  if (update.message) return onMessage(update.message, c);
}

async function onMessage(msg, { env, tg, now }) {
  if (!msg.from || msg.from.is_bot || msg.chat?.type !== 'private') return;
  const user = await getUser(env, msg.from, now);
  let lang = user.lang;
  let T = t(lang);
  const demo = isDemo(env);
  const manager = isManager(env, user.id);
  const ws = wsOf(env, user.id);
  const chat = msg.chat.id;
  const send = (text, extra = {}) => tg('sendMessage', { chat_id: chat, text, ...extra });
  const s = await getSettings(env, ws, { lang, now });

  const raw = typeof msg.text === 'string' ? msg.text.trim() : '';
  let cmd = null, arg = '';
  if (raw.startsWith('/')) {
    const first = raw.split(/\s+/)[0];
    cmd = first.toLowerCase().replace(/@.*$/, '');
    arg = raw.slice(first.length).trim();
  } else if (MENU_COMMANDS[raw]) cmd = MENU_COMMANDS[raw];
  const state = getState(user);
  if (cmd && state) await setState(env, user.id, null);

  // Commands for everyone.
  switch (cmd) {
    case '/start':
      if (arg === 'subscribe') { const m = plansMessage(env, T, s.title); return send(m.text, { reply_markup: m.reply_markup }); }
      await send(manager ? T.start(user.name, s.title, demo) : T.subscriberStart(user.name, s.title), { reply_markup: menu(T, manager) });
      return;
    case '/lang': {
      lang = lang === 'ru' ? 'en' : 'ru';
      T = t(lang);
      await setLang(env, user.id, lang);
      return send(T.langSet, { reply_markup: menu(T, manager) });
    }
    case '/id': return send(T.id(user.id));
    case '/cancel': return send(state ? T.cancelled : T.nothingToCancel);
    case '/subscribe': { const m = plansMessage(env, T, s.title); return send(m.text, { reply_markup: m.reply_markup }); }
    case '/status': { const m = await statusMessage(env, { ws, user, now }); return send(m.text, { reply_markup: m.reply_markup }); }
    case '/help': return send(T.help);
  }
  if (!manager) return send(T.subscriberOnly, { reply_markup: menu(T, false) });

  // Owner commands.
  switch (cmd) {
    case null: break;
    case '/new': return send(T.newPost);
    case '/draft':
      if (arg) return draftFlow(arg);
      await setState(env, user.id, { await: 'topic' });
      return send(T.askTopic);
    case '/queue': { const v = queueView(T, lang, s, await queueOf(env, ws)); return send(v.text, { reply_markup: v.reply_markup }); }
    case '/schedule': { const v = scheduleView(T, s); return send(v.text, { reply_markup: v.reply_markup }); }
    case '/slots':
      if (!arg) { await setState(env, user.id, { await: 'slots' }); return send(T.askSlots); }
      return saveSlots(arg);
    case '/tz': {
      const tz = parseTz(arg);
      if (tz === null) return send(T.badTz);
      await updateSettings(env, ws, { tz });
      return send(T.tzSet(fmtTz(tz)));
    }
    case '/title': {
      const title = arg.replace(/\s+/g, ' ').slice(0, 80);
      if (!title) return send(T.help);
      await updateSettings(env, ws, { title });
      return send(T.titleSet(title));
    }
    case '/channel': {
      if (!/^(@[A-Za-z][A-Za-z0-9_]{4,31}|-100\d{5,15})$/.test(arg)) return send(T.badChannel);
      await updateSettings(env, ws, { channel_id: arg });
      return send(T.channelSet(arg));
    }
    case '/stats': { const v = await statsView(env, T, lang, s, now); return send(v.text, { entities: v.entities }); }
    case '/reset':
      if (!demo) return send(T.resetLive);
      await resetSandbox(env, ws);
      await getSettings(env, ws, { lang, now });
      return send(T.reset, { reply_markup: menu(T, true) });
    default:
      return send(T.help);
  }

  // Answers to a question the bot asked. A photo while the bot waits for a typed answer starts a new post instead.
  if (state && state.await !== 'edit' && !raw) await setState(env, user.id, null);
  if (state?.await === 'topic' && raw) { await setState(env, user.id, null); return draftFlow(raw); }
  if (state?.await === 'slots' && raw) { await setState(env, user.id, null); return saveSlots(raw); }
  if (state?.await === 'time' && raw) {
    const post = await getPost(env, state.post);
    if (!post || post.ws !== ws || post.status === 'published') { await setState(env, user.id, null); return send(T.notFound); }
    const at = parseWhen(raw, now, s.tz);
    if (!at) return send(T.badTime);
    await setState(env, user.id, null);
    const p = await updatePost(env, post.id, { status: 'approved', scheduled_at: at, error: null }, now);
    // The preview the owner pressed «Set time» on is updated in place; a short card answers at the bottom.
    if (state.msg) {
      const ref = { chat: { id: chat }, message_id: state.msg, ...(state.photo ? { photo: [{}] } : {}) };
      if (state.card) await tg('editMessageText', { chat_id: chat, message_id: state.msg, ...cardPayload(p, T, s, lang) });
      else await editPreview(tg, ref, p, T, s, lang);
    }
    return send(cardPayload(p, T, s, lang).text, { reply_markup: cardPayload(p, T, s, lang).reply_markup });
  }
  if (state?.await === 'edit') {
    const post = await getPost(env, state.post);
    await setState(env, user.id, null);
    if (!post || post.ws !== ws || post.status !== 'draft') return send(T.notFound);
    const c = contentOf(msg, T);
    if (c.error) return send(c.error);
    const patch = {};
    if (c.photo) { patch.photo = c.photo; if (c.text) { patch.text = c.text; patch.entities = c.entities || null; } }
    else { patch.text = c.text; patch.entities = c.entities || null; }
    if ((patch.photo || post.photo) && (patch.text ?? post.text).length > 1024) return send(T.tooLongCaption((patch.text ?? post.text).length));
    const p = await updatePost(env, post.id, patch, now);
    await markReplaced(tg, chat, state, T, p.id);
    return sendPreview(tg, chat, p, T, s, lang);
  }

  // Anything else is a new post for the queue.
  const c = contentOf(msg, T);
  if (c.error) return send(c.error);
  const post = await createPost(env, { ws, author_id: user.id, text: c.text, entities: c.entities, photo: c.photo, source: 'manual' }, now);
  return sendPreview(tg, chat, post, T, s, lang);

  async function draftFlow(topic) {
    topic = topic.replace(/\s+/g, ' ').trim().slice(0, 200);
    await tg('sendChatAction', { chat_id: chat, action: 'typing' });
    const r = await makeDraft(env, { topic, lang, s, variant: 0, now });
    if (r.reason === 'limit') await send(T.aiLimit(aiLimit(env)));
    const post = await createPost(env, { ws, author_id: user.id, text: r.text, source: r.engine === 'ai' ? 'ai' : 'stub', topic }, now);
    return sendPreview(tg, chat, post, T, s, lang);
  }
  async function saveSlots(input) {
    const slots = parseSlots(input);
    if (!slots) return send(T.badSlots);
    await updateSettings(env, ws, { slots: slots.join(',') });
    return send(T.slotsSet(slots, fmtTz(s.tz)));
  }
}

async function onCallback(cq, { env, tg, now }) {
  const answer = (text) => tg('answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text } : {}) });
  if (!cq.from || !cq.message) return answer();
  const user = await getUser(env, cq.from, now);
  const lang = user.lang;
  const T = t(lang);
  const ws = wsOf(env, user.id);
  const chat = cq.message.chat.id;
  const msg = cq.message;
  const data = String(cq.data || '');
  const [kind, a, b] = data.split(':');
  const s = await getSettings(env, ws, { lang, now });

  // Paid access: open to everyone.
  if (kind === 'plans') {
    const m = plansMessage(env, T, s.title);
    await tg('sendMessage', { chat_id: chat, text: m.text, reply_markup: m.reply_markup });
    return answer();
  }
  if (kind === 'buy') {
    const c = await startCheckout(env, { ws, userId: user.id, planId: a, T, now });
    if (c) await tg('editMessageText', { chat_id: chat, message_id: msg.message_id, text: c.text, reply_markup: c.reply_markup });
    return answer();
  }
  if (kind === 'mockpay') {
    const r = await mockPay(env, tg, { id: a, user, now });
    if (!r) return answer(T.payStale);
    await tg('editMessageReplyMarkup', { chat_id: chat, message_id: msg.message_id, reply_markup: kb([]) });
    return answer();
  }
  if (kind === 'paycancel') {
    await cancelCheckout(env, a, user.id);
    await tg('editMessageText', { chat_id: chat, message_id: msg.message_id, text: T.payCancelled });
    return answer();
  }
  if (kind === 'simexpire') {
    if (!isDemo(env)) return answer();
    await tg('editMessageReplyMarkup', { chat_id: chat, message_id: msg.message_id, reply_markup: kb([]) });
    await simulateExpiry(env, tg, { ws, user, now });
    return answer();
  }

  if (!isManager(env, user.id)) return answer(T.subscriberOnly);

  if (kind === 'sched') {
    const v = scheduleView(T, s);
    await tg('sendMessage', { chat_id: chat, text: v.text, reply_markup: v.reply_markup });
    return answer();
  }
  if (kind === 'slots') {
    if (a === 'custom') { await setState(env, user.id, { await: 'slots' }); await tg('sendMessage', { chat_id: chat, text: T.askSlots }); return answer(); }
    const preset = T.presets[Number(a)];
    if (!preset) return answer();
    await updateSettings(env, ws, { slots: preset.join(',') });
    await tg('editMessageText', { chat_id: chat, message_id: msg.message_id, text: T.slotsSet(preset, fmtTz(s.tz)) });
    return answer();
  }
  if (kind !== 'p' && kind !== 'c') return answer();

  const post = await getPost(env, b);
  if (!post || post.ws !== ws) return answer(T.notFound);
  // 'p' buttons sit under a full preview, 'c' buttons under a short status card: each is re-drawn in its own form.
  const refresh = (p) => (kind === 'c'
    ? tg('editMessageText', { chat_id: chat, message_id: msg.message_id, ...cardPayload(p, T, s, lang) })
    : editPreview(tg, msg, p, T, s, lang));
  const ref = { msg: msg.message_id, photo: Boolean(msg.photo), card: kind === 'c' };
  // A preview whose post went out meanwhile (cron, another device) is re-drawn as published, buttons gone.
  if (post.status === 'published' && a !== 'open') { await refresh(post); return answer(T.alreadyPublished); }

  switch (a) {
    case 'open':
      await sendPreview(tg, chat, post, T, s, lang);
      return answer();
    case 'ok': {
      if (post.status !== 'draft') { await refresh(post); return answer(); }
      const p = await approveToNextSlot(env, post, s, now);
      if (!p) return answer(T.noSlot);
      await refresh(p);
      return answer(T.toast.approved(fmtWhen(p.scheduled_at, s.tz, lang)));
    }
    case 'ed':
      if (post.status !== 'draft') { await refresh(post); return answer(); }
      await setState(env, user.id, { await: 'edit', post: post.id, ...ref });
      await tg('sendMessage', { chat_id: chat, text: T.askEdit(post.id) });
      return answer();
    case 'tm':
      await setState(env, user.id, { await: 'time', post: post.id, ...ref });
      await tg('sendMessage', { chat_id: chat, text: T.askTime(post.id, fmtTz(s.tz)) });
      return answer();
    case 'del': {
      await deletePost(env, post.id);
      const at = { chat_id: chat, message_id: msg.message_id, reply_markup: kb([]) };
      if (msg.photo) await tg('editMessageCaption', { ...at, caption: T.stDeleted(post.id) });
      else await tg('editMessageText', { ...at, text: T.stDeleted(post.id) });
      return answer(T.toast.deleted);
    }
    case 'rg': {
      if (post.status !== 'draft' || !post.topic) return answer();
      const variant = (post.variant || 0) + 1;
      const r = await makeDraft(env, { topic: post.topic, lang, s, variant, now });
      const p = await updatePost(env, post.id, { text: r.text, entities: null, source: r.engine === 'ai' ? 'ai' : 'stub', variant }, now);
      await refresh(p);
      return answer(r.reason === 'limit' ? T.aiLimit(aiLimit(env)) : T.toast.regen);
    }
    case 'now': {
      if (post.status === 'draft') await updatePost(env, post.id, { status: 'approved', scheduled_at: now }, now);
      const fresh = await getPost(env, post.id);
      const r = await publishPost(env, tg, fresh, s, now);
      await refresh(await getPost(env, post.id));
      return answer(r.ok ? T.toast.published : T.toast.failed);
    }
    case 'back': {
      if (!['approved', 'failed'].includes(post.status)) return answer();
      const p = await updatePost(env, post.id, { status: 'draft', scheduled_at: null, error: null }, now);
      await refresh(p);
      return answer(T.toast.back);
    }
    default:
      return answer();
  }
}
