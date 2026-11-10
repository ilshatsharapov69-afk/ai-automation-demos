// Telegram update handler: FAQ answers, 4-step booking, request capture, owner cards, owner view.
import data from '../data/faq.json';
import { T, mainKeyboard, menuAction, detectLang } from './i18n.js';
import { answer, DEFAULT_MODEL } from './answer.js';

const AI_DAILY_CAP = 25; // AI answers per chat per day; past it the FAQ keyword match still answers

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const svcById = (id) => data.services.find((s) => s.id === id);

function dayLabel(iso, lang) {
  const d = new Date(iso + 'T12:00:00Z');
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}

function nextDays(now, n = 5) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(new Date(now.getTime() + i * 86400000).toISOString().slice(0, 10));
  return out;
}

function leadSummary(l, lang) {
  if (l.kind === 'booking') {
    const sv = svcById(l.service);
    return `${sv ? sv[lang] : l.service}, ${dayLabel(l.day, lang)} ${l.slot}\n${esc(l.name)} · ${esc(l.contact)}`;
  }
  return `${esc(l.name)} · ${esc(l.contact)}\n${esc(l.note)}`;
}

function shortLead(l, lang) {
  const t = T[lang];
  if (l.kind === 'booking') {
    const sv = svcById(l.service);
    return `#${l.id} ${sv ? sv[lang] : l.service} · ${dayLabel(l.day, lang)} ${l.slot} · ${esc(l.name)} · ${t.st[l.status] || l.status}`;
  }
  return `#${l.id} ${lang === 'ru' ? 'Заявка' : 'Request'} · ${esc(l.name)} · ${esc((l.note || '').slice(0, 40))} · ${t.st[l.status] || l.status}`;
}

function ownerCard(l, lang) {
  const t = T[lang];
  const title = l.kind === 'booking' ? t.ownerCardTitleBooking(l.id) : t.ownerCardTitleRequest(l.id);
  const who = l.username ? ` (@${esc(l.username)})` : '';
  return {
    text: `<b>${title}</b>\n${leadSummary(l, lang)}${who}\n${t.statusSet(t.st[l.status] || l.status)}`,
    markup:
      l.status === 'new'
        ? { inline_keyboard: [[{ text: t.ownerBtnOk, callback_data: `own:ok:${l.id}` }, { text: t.ownerBtnNo, callback_data: `own:no:${l.id}` }]] }
        : { inline_keyboard: [] },
  };
}

// ---------- storage (D1) ----------
async function loadChat(db, chatId) {
  return db.prepare('SELECT * FROM chats WHERE chat_id = ?').bind(chatId).first();
}
async function saveChat(db, chatId, lang, state, username, nowIso) {
  await db
    .prepare(
      `INSERT INTO chats (chat_id, lang, state, username, first_seen, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(chat_id) DO UPDATE SET lang = ?2, state = ?3, username = ?4, updated_at = ?5`,
    )
    .bind(chatId, lang, state ? JSON.stringify(state) : null, username || null, nowIso)
    .run();
}
async function insertLead(db, l) {
  const r = await db
    .prepare(
      `INSERT INTO leads (chat_id, username, kind, service, day, slot, name, contact, note, status, lang, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?) RETURNING id`,
    )
    .bind(l.chat_id, l.username || null, l.kind, l.service || null, l.day || null, l.slot || null, l.name, l.contact, l.note || null, l.lang, l.created_at)
    .first();
  return { ...l, id: r.id, status: 'new' };
}


// ---------- shared pieces ----------
function makeCtx(env, tg, now) {
  const ownerId = env.OWNER_CHAT_ID ? Number(env.OWNER_CHAT_ID) : null;
  const send = (chat_id, text, extra = {}) =>
    tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
  return { env, tg, db: env.DB, now, nowIso: now.toISOString(), ownerId, send, demo: env.DEMO_MODE !== 'off' };
}

function serviceKeyboard(lang) {
  return { inline_keyboard: data.services.map((s) => [{ text: `${s[lang]} · ${lang === 'ru' ? s.price_ru : s.price_en}`, callback_data: `svc:${s.id}` }]) };
}

const contactKeyboard = (lang) => ({
  keyboard: [[{ text: T[lang].shareContact, request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
});

/** The owner gets the card; in demo mode the visitor also gets a copy so they see both sides. */
async function deliverToOwner(c, lead, lang) {
  const ownerLang = c.env.OWNER_LANG === 'en' || c.env.OWNER_LANG === 'ru' ? c.env.OWNER_LANG : lang;
  if (c.ownerId !== null && c.ownerId !== lead.chat_id) {
    const card = ownerCard(lead, ownerLang);
    await c.send(c.ownerId, card.text, { reply_markup: card.markup });
  }
  if (c.demo || c.ownerId === lead.chat_id) {
    const card = ownerCard(lead, lang);
    if (c.ownerId !== lead.chat_id) await c.send(lead.chat_id, T[lang].demoCardIntro);
    await c.send(lead.chat_id, card.text, { reply_markup: card.markup });
  }
}

async function ownerView(c, chatId, lang) {
  const all = c.ownerId !== null && chatId === c.ownerId;
  const where = all ? '' : 'WHERE chat_id = ?';
  const bind = (s) => (all ? s : s.bind(chatId));
  const leads = (await bind(c.db.prepare(`SELECT * FROM leads ${where} ORDER BY id DESC`)).all()).results;
  const qs = (await bind(c.db.prepare(`SELECT * FROM questions ${where} ORDER BY id DESC LIMIT 200`)).all()).results;
  const today = c.nowIso.slice(0, 10);
  const b = leads.filter((l) => l.kind === 'booking');
  const o = {
    today: leads.filter((l) => l.created_at.startsWith(today)).length,
    total: leads.length,
    bookings: b.length,
    bNew: b.filter((l) => l.status === 'new').length,
    bOk: b.filter((l) => l.status === 'confirmed').length,
    bNo: b.filter((l) => l.status === 'declined').length,
    requests: leads.length - b.length,
    qAll: qs.length,
    qOk: qs.filter((q) => q.answered).length,
  };
  const tt = T[lang];
  let out = `<b>${all ? tt.ownerTitleAll : tt.ownerTitleDemo}</b>\n\n${tt.ownerStats(o)}\n\n`;
  out += leads.length ? `${tt.ownerLast}\n${leads.slice(0, 8).map((l) => shortLead(l, lang)).join('\n')}` : tt.ownerNone;
  const un = qs.filter((q) => !q.answered).slice(0, 5);
  if (un.length) out += `\n\n${tt.ownerUnanswered}\n${un.map((q) => `• ${esc(q.text.slice(0, 80))}`).join('\n')}`;
  return c.send(chatId, out);
}

// ---------- entry ----------
export async function handleUpdate(update, { env, tg, now = new Date() }) {
  const c = makeCtx(env, tg, now);
  if (update.callback_query) return onCallback(c, update.callback_query);
  if (update.message) return onMessage(c, update.message);
}

async function onMessage(c, msg) {
  if (!msg.chat || msg.chat.type !== 'private') return;
  const { db, send, nowIso } = c;
  const chatId = msg.chat.id;
  const username = msg.from?.username;
  const row = await loadChat(db, chatId);
  let lang = row?.lang || detectLang(msg.from?.language_code);
  let state = row?.state ? JSON.parse(row.state) : null;
  const t = () => T[lang];
  const save = () => saveChat(db, chatId, lang, state, username, nowIso);
  const text = (msg.text || '').trim();
  const cmd = text.startsWith('/') ? text.split(/[\s@]/)[0].toLowerCase() : null;
  const action = menuAction(text);

  const finishRequest = async () => {
    const lead = await insertLead(db, { chat_id: chatId, username, kind: 'request', name: state.name, contact: state.contact, note: state.note, lang, created_at: nowIso });
    state = null;
    await save();
    await send(chatId, t().reqSent(lead.id), { reply_markup: mainKeyboard(lang) });
    return deliverToOwner(c, lead, lang);
  };

  if (cmd === '/start') {
    state = null;
    await save();
    return send(chatId, t().welcome, { reply_markup: mainKeyboard(lang) });
  }
  if (cmd === '/lang' || action === 'lang') {
    lang = lang === 'ru' ? 'en' : 'ru';
    await save();
    return send(chatId, t().langSet, { reply_markup: mainKeyboard(lang) });
  }
  if (cmd === '/id') return send(chatId, t().yourId(chatId));
  if (cmd === '/cancel') {
    state = null;
    await save();
    return send(chatId, t().cancelled, { reply_markup: mainKeyboard(lang) });
  }
  if (cmd === '/admin' || action === 'owner') return ownerView(c, chatId, lang);
  if (cmd === '/about' || action === 'about') return send(chatId, esc(t().about(c.env.CONTACT || '', c.env.PORTFOLIO_URL || '')));
  if (cmd === '/book' || action === 'book') {
    state = { flow: 'book', step: 'service' };
    await save();
    return send(chatId, t().pickService, { reply_markup: serviceKeyboard(lang) });
  }
  if (cmd === '/request' || action === 'req') {
    state = { flow: 'req', step: 'name' };
    await save();
    return send(chatId, t().reqName);
  }
  if (action === 'ask') {
    state = null;
    await save();
    return send(chatId, t().askPrompt);
  }

  // ----- inside a flow -----
  if ((state?.flow === 'book' || state?.flow === 'req') && state.step === 'name') {
    if (!text || text.length > 60 || cmd) return send(chatId, t().badName);
    state = { ...state, step: 'contact', name: text };
    await save();
    return send(chatId, t().askContact, { reply_markup: contactKeyboard(lang) });
  }
  if ((state?.flow === 'book' || state?.flow === 'req') && state.step === 'contact') {
    const contact = msg.contact?.phone_number || text;
    const digits = contact.replace(/\D/g, '');
    const ok = digits.length >= 6 || /^@[a-z0-9_]{4,}$/i.test(contact) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    if (!ok || contact.length > 60) return send(chatId, t().badContact);
    if (state.flow === 'book') {
      state = { ...state, step: 'confirm', contact };
      await save();
      await send(chatId, t().gotIt, { reply_markup: mainKeyboard(lang) });
      return send(chatId, t().confirmBooking(leadSummary({ kind: 'booking', ...state }, lang)), {
        reply_markup: { inline_keyboard: [[{ text: t().btnConfirm, callback_data: 'bk:ok' }, { text: t().btnCancel, callback_data: 'bk:no' }]] },
      });
    }
    state = { ...state, contact };
    if (state.note) return finishRequest();
    state.step = 'note';
    await save();
    return send(chatId, t().reqNote, { reply_markup: mainKeyboard(lang) });
  }
  if (state?.flow === 'req' && state.step === 'note') {
    if (!text) return send(chatId, t().reqNote);
    state = { ...state, note: text.slice(0, 500) };
    return finishRequest();
  }

  // ----- free text = a question -----
  if (!text || cmd) return send(chatId, t().askPrompt, { reply_markup: mainKeyboard(lang) });
  const day = nowIso.slice(0, 10);
  const used = await db.prepare('SELECT n FROM ai_usage WHERE chat_id = ? AND day = ?').bind(chatId, day).first();
  const allowAi = !c.env.AI_OFF && (used?.n || 0) < AI_DAILY_CAP;
  const qLang = /[а-яё]/i.test(text) ? 'ru' : /[a-z]/i.test(text) ? 'en' : lang;
  if (c.env.BOT_TOKEN) await c.tg('sendChatAction', { chat_id: chatId, action: 'typing' });
  const res = await answer(text, qLang, { ai: c.env.AI, model: c.env.AI_MODEL || DEFAULT_MODEL, allowAi });
  if (res.error) console.error('ai error', res.error);
  if (allowAi && c.env.AI) {
    await db.prepare('INSERT INTO ai_usage (chat_id, day, n) VALUES (?, ?, 1) ON CONFLICT(chat_id, day) DO UPDATE SET n = n + 1').bind(chatId, day).run();
  }
  await db
    .prepare('INSERT INTO questions (chat_id, text, answered, source, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(chatId, text.slice(0, 500), res.text ? 1 : 0, res.source, nowIso)
    .run();
  const midBooking = state?.flow === 'book' && ['service', 'day', 'slot', 'confirm'].includes(state.step);
  if (!c.env.BOT_TOKEN) await c.tg('_debug', { answer_source: res.source }); // local test only: never reaches Telegram
  if (res.text) {
    return send(chatId, esc(res.text) + (midBooking ? `\n\n${t().remindButtons}` : ''), {
      reply_markup: midBooking ? undefined : { inline_keyboard: [[{ text: t().btnBook, callback_data: 'go:book' }]] },
    });
  }
  // No answer: offer to hand the question to the owner; the question becomes the request text.
  if (!midBooking) {
    state = { flow: 'req', step: 'offer', note: text.slice(0, 500) };
    await save();
  }
  if (midBooking) return send(chatId, `${t().noAnswerMid}

${t().remindButtons}`);
  return send(chatId, t().noAnswer, { reply_markup: { inline_keyboard: [[{ text: t().btnHandoff, callback_data: 'go:handoff' }]] } });
}

async function onCallback(c, cq) {
  const { db, tg, send, nowIso, ownerId } = c;
  const cid = cq.message?.chat?.id ?? cq.from.id;
  const mid = cq.message?.message_id;
  const user = cq.from.username;
  const r = await loadChat(db, cq.from.id);
  const lang = r?.lang || detectLang(cq.from.language_code);
  let state = r?.state ? JSON.parse(r.state) : null;
  const tt = T[lang];
  const save = () => saveChat(db, cq.from.id, lang, state, user, nowIso);
  const ack = (text) => tg('answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text } : {}) });
  const d = cq.data || '';

  if (d === 'go:book') {
    await ack();
    state = { flow: 'book', step: 'service' };
    await save();
    return send(cid, tt.pickService, { reply_markup: serviceKeyboard(lang) });
  }
  if (d === 'go:handoff') {
    await ack();
    state = { flow: 'req', step: 'name', note: state?.note };
    await save();
    return send(cid, tt.reqName);
  }
  if (d.startsWith('svc:') && state?.flow === 'book' && state.step === 'service') {
    const sv = svcById(d.slice(4));
    if (!sv) return ack();
    await ack();
    state = { flow: 'book', step: 'day', service: sv.id };
    await save();
    const days = nextDays(c.now);
    const kb = [days.slice(0, 3), days.slice(3)].map((row) => row.map((x) => ({ text: dayLabel(x, lang), callback_data: `day:${x}` })));
    return tg('editMessageText', { chat_id: cid, message_id: mid, text: tt.pickDay(sv[lang]), reply_markup: { inline_keyboard: kb } });
  }
  if (d.startsWith('day:') && state?.flow === 'book' && state.step === 'day') {
    const day = d.slice(4);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ack();
    await ack();
    state = { ...state, step: 'slot', day };
    await save();
    const sv = svcById(state.service);
    const kb = [data.slots.slice(0, 3), data.slots.slice(3)].map((row) => row.map((x) => ({ text: x, callback_data: `slot:${x}` })));
    return tg('editMessageText', { chat_id: cid, message_id: mid, text: tt.pickSlot(sv[lang], dayLabel(day, lang)), reply_markup: { inline_keyboard: kb } });
  }
  if (d.startsWith('slot:') && state?.flow === 'book' && state.step === 'slot') {
    const slot = d.slice(5);
    if (!data.slots.includes(slot)) return ack();
    await ack();
    state = { ...state, step: 'name', slot };
    await save();
    const sv = svcById(state.service);
    await tg('editMessageText', { chat_id: cid, message_id: mid, text: `${sv[lang]}, ${dayLabel(state.day, lang)} ${slot} ✓` });
    return send(cid, tt.askName);
  }
  if (d === 'bk:ok' && state?.flow === 'book' && state.step === 'confirm') {
    const claim = await db.prepare('UPDATE chats SET state = NULL, updated_at = ? WHERE chat_id = ? AND state = ?').bind(nowIso, cq.from.id, r.state).run();
    if (!claim.meta || claim.meta.changes !== 1) return ack(); // a second tap of the same button
    await ack(tt.leadSaved);
    const lead = await insertLead(db, {
      chat_id: cq.from.id, username: user, kind: 'booking', service: state.service, day: state.day, slot: state.slot,
      name: state.name, contact: state.contact, lang, created_at: nowIso,
    });
    state = null;
    await save();
    await tg('editMessageReplyMarkup', { chat_id: cid, message_id: mid, reply_markup: { inline_keyboard: [] } });
    await send(cid, tt.bookingSent(lead.id), { reply_markup: mainKeyboard(lang) });
    return deliverToOwner(c, lead, lang);
  }
  if (d === 'bk:no') {
    await ack();
    state = null;
    await save();
    await tg('editMessageReplyMarkup', { chat_id: cid, message_id: mid, reply_markup: { inline_keyboard: [] } });
    return send(cid, tt.cancelled, { reply_markup: mainKeyboard(lang) });
  }
  const m = d.match(/^own:(ok|no):(\d+)$/);
  if (m) {
    const lead = await db.prepare('SELECT * FROM leads WHERE id = ?').bind(Number(m[2])).first();
    if (!lead) return ack();
    const isOwner = ownerId !== null && cq.from.id === ownerId;
    const isDemoSelf = c.demo && cq.from.id === lead.chat_id;
    if (!isOwner && !isDemoSelf) return ack(tt.notYours);
    if (lead.status !== 'new') return ack(tt.statusSet(tt.st[lead.status]));
    const status = m[1] === 'ok' ? 'confirmed' : 'declined';
    await db.prepare('UPDATE leads SET status = ? WHERE id = ?').bind(status, lead.id).run();
    await ack(tt.statusSet(tt.st[status]));
    const card = ownerCard({ ...lead, status }, lang);
    await tg('editMessageText', { chat_id: cid, message_id: mid, text: card.text, parse_mode: 'HTML', reply_markup: card.markup });
    const ll = lead.lang === 'ru' ? 'ru' : 'en';
    const cl = T[ll];
    const sv = svcById(lead.service);
    const what = lead.kind === 'booking' ? `${sv ? sv[ll] : ''}, ${dayLabel(lead.day, ll)} ${lead.slot}` : '';
    const note =
      status === 'declined' ? cl.clientDeclined(lead.id) : lead.kind === 'booking' ? cl.clientConfirmed(lead.id, what) : cl.clientReqDone(lead.id);
    return send(lead.chat_id, note);
  }
  return ack();
}
