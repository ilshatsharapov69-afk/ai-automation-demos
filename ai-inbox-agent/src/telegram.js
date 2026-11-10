// Telegram side: owner cards with Approve / Edit / Reject, the owner's edit flow, and customers writing to the bot.
import { T, L } from './i18n.js';
import { fmtMoney, daysUntil } from './extract.js';
import { fromTelegram } from './channels.js';
import { getRequest, getOwnerState, setOwnerState, updateRequest, stats } from './store.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s, n) => { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

function fmtDay(iso, lang) {
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
}

export function reasonsText(row, lang) {
  const t = T[L(lang)];
  return row.score_reasons.filter((r) => r.k !== 'base').map((r) => `${t.reason[r.k] ? t.reason[r.k](r.v) : r.k} +${r.pts}`).join(', ');
}

/** Owner card: text (Telegram HTML) + inline keyboard. */
export function ownerCard(row, lang, { origin, now } = {}) {
  const t = T[L(lang)];
  const cat = t.cat[row.category] || row.category;
  const head = row.hot ? `<b>${t.cardHot(row.id)}</b> · ${row.score}/100` : `<b>${esc(t.cardNew(row.id, cat))}</b>${row.category === 'lead' ? ` · ${row.score}/100` : ''}`;
  const lines = [head];
  lines.push(`${t.chanIcon[row.channel]} ${t.chan[row.channel]} · ${row.lang.toUpperCase()} · ${cat} (${t.by[row.classified_by]})`);
  const who = [row.name, row.email, row.phone, row.telegram].filter(Boolean).map(esc).join(' · ');
  if (who) lines.push(`👤 ${who}`);
  if (row.product) lines.push(`🪵 ${esc(t.product[row.product])}`);
  const money = row.budget_amount != null && row.category !== 'spam' ? `💰 ${fmtMoney(row.budget_amount, row.budget_currency, lang)}` : null;
  const d = row.deadline_date ? daysUntil(row.deadline_date, now || new Date()) : null;
  const when = row.deadline_date && row.category !== 'spam' ? `📅 ${fmtDay(row.deadline_date, lang)} (${t.inDays(d)})` : null;
  if (money || when) lines.push([money, when].filter(Boolean).join(' · '));
  if (row.order_no) lines.push(`🧾 #${esc(row.order_no)}`);
  if (row.category === 'lead' && row.score_reasons.length > 1) lines.push(`<i>${t.why}: ${esc(reasonsText(row, lang))}</i>`);
  lines.push('', `<b>${t.message}</b>`);
  lines.push(`<blockquote>${esc(clip([row.subject, row.body].filter(Boolean).join(' | '), 700))}</blockquote>`);
  if (row.draft) {
    lines.push(`<b>${t.draft}</b> (${t.by[row.draft_source] || row.draft_source})`);
    lines.push(`<blockquote>${esc(clip(row.draft, 1400))}</blockquote>`);
  } else lines.push(`<i>${t.noDraft}</i>`);
  if (row.status !== 'new') lines.push(`<b>${t.decided(t.st[row.status] || row.status)}</b>`);
  if (row.status === 'approved' && row.channel !== 'telegram') lines.push(`<i>${t.readyEmail}</i>`);

  const kb = [];
  if (row.status === 'new' && row.draft) {
    kb.push([
      { text: t.btnOk, callback_data: `ok:${row.id}` },
      { text: t.btnEdit, callback_data: `ed:${row.id}` },
      { text: t.btnNo, callback_data: `no:${row.id}` },
    ]);
  }
  if (origin && origin.startsWith('https://')) kb.push([{ text: t.btnOpen, url: `${origin}/inbox/${row.id}?lang=${L(lang)}` }]);
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: kb } };
}

export async function sendOwnerCard(c, row, chatId, lang = c.ownerLang) {
  const card = ownerCard(row, lang, c);
  const r = await c.tg('sendMessage', { chat_id: chatId, text: card.text, parse_mode: 'HTML', reply_markup: card.reply_markup, link_preview_options: { is_disabled: true } });
  return r && r.ok ? r.result.message_id : null;
}

/** After a decision: rewrite the owner's card (status line, buttons gone). */
export async function refreshCards(c, row, extra = []) {
  const targets = [];
  if (row.owner_chat_id && row.owner_msg_id) targets.push({ chat_id: row.owner_chat_id, message_id: row.owner_msg_id, lang: c.ownerLang });
  for (const x of extra) if (!targets.some((y) => y.chat_id === x.chat_id && y.message_id === x.message_id)) targets.push(x);
  for (const x of targets) {
    const card = ownerCard(row, x.lang, c);
    await c.tg('editMessageText', { chat_id: x.chat_id, message_id: x.message_id, text: card.text, parse_mode: 'HTML', reply_markup: card.reply_markup, link_preview_options: { is_disabled: true } });
  }
}

// ---------- updates ----------
export async function handleUpdate(update, c, { ingest, decide }) {
  if (update.callback_query) return onCallback(update.callback_query, c, decide);
  const m = update.message;
  if (!m || !m.chat || m.chat.type !== 'private') return;
  const from = m.from || {};
  const isOwner = c.ownerId && from.id === c.ownerId;
  const lang = isOwner ? c.ownerLang : L((from.language_code || '').startsWith('ru') ? 'ru' : 'en');
  const t = T[lang];
  const text = (m.text || m.caption || '').trim();
  const send = (chat_id, s, extra = {}) => c.tg('sendMessage', { chat_id, text: s, ...extra });

  // Owner (or a demo visitor) answering an "Edit" prompt.
  const st = await getOwnerState(c.db, m.chat.id);
  if (st && st.editing_id) {
    if (text === '/cancel') { await setOwnerState(c.db, m.chat.id, null, c.nowIso); return send(m.chat.id, t.editCancelled); }
    if (text && !text.startsWith('/')) {
      const row = await getRequest(c.db, st.editing_id);
      await setOwnerState(c.db, m.chat.id, null, c.nowIso);
      if (!row || row.status !== 'new') return send(m.chat.id, row ? t.already(t.st[row.status]) : t.gone);
      const old = { chat_id: m.chat.id, message_id: row.owner_chat_id === m.chat.id ? row.owner_msg_id : null };
      const upd = await updateRequest(c.db, row.id, { draft: text.slice(0, 3000), draft_source: 'owner', updated_at: c.nowIso });
      if (old.message_id) await c.tg('editMessageReplyMarkup', { ...old, reply_markup: { inline_keyboard: [] } });
      await send(m.chat.id, t.edited(row.id));
      const msgId = await sendOwnerCard(c, upd, m.chat.id, lang);
      if (msgId && row.owner_chat_id === m.chat.id) await updateRequest(c.db, row.id, { owner_msg_id: msgId });
      return;
    }
  }

  if (text === '/start' || text === '/help') return send(m.chat.id, isOwner ? t.ownerHelp : t.welcome);
  if (text === '/inbox' && isOwner) {
    const s = await stats(c.db);
    const base = c.origin && c.origin.startsWith('https://') ? `\n${c.origin}/inbox?lang=${lang}` : '';
    return send(m.chat.id, t.inboxSummary(s) + base);
  }
  if (text.startsWith('/')) return send(m.chat.id, isOwner ? t.ownerHelp : t.welcome);
  if (!text) return send(m.chat.id, t.textOnly);

  // A customer message: run the agent.
  const res = await ingest(fromTelegram(m), c);
  if (res.ignored || res.duplicate) return;
  const row = res.row;
  if (row.category === 'spam') {
    if (c.demo) await send(m.chat.id, t.demoSpam);
    return;
  }
  await send(m.chat.id, t.ack(row.name));
  // Demo: the visitor also sees the owner's card for their own request (unless they are the owner and already got it).
  if (c.demo && !(isOwner && res.pushed)) {
    await send(m.chat.id, t.demoCopy);
    await sendOwnerCard(c, row, m.chat.id, lang);
  }
}

async function onCallback(cb, c, decide) {
  const from = cb.from || {};
  const isOwner = c.ownerId && from.id === c.ownerId;
  const lang = isOwner ? c.ownerLang : L((from.language_code || '').startsWith('ru') ? 'ru' : 'en');
  const t = T[lang];
  const answer = (text) => c.tg('answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text } : {}) });
  const mm = String(cb.data || '').match(/^(ok|ed|no):(\d+)$/);
  if (!mm) return answer();
  const row = await getRequest(c.db, mm[2]);
  if (!row) return answer(t.gone);
  const mayAct = isOwner || (c.demo && row.tg_chat_id && row.tg_chat_id === from.id);
  if (!mayAct) return answer(t.notYours);
  if (row.status !== 'new') return answer(t.already(t.st[row.status]));
  const here = cb.message ? [{ chat_id: cb.message.chat.id, message_id: cb.message.message_id, lang }] : [];

  if (mm[1] === 'ed') {
    await setOwnerState(c.db, cb.message?.chat.id ?? from.id, row.id, c.nowIso);
    await answer();
    return c.tg('sendMessage', { chat_id: cb.message?.chat.id ?? from.id, text: t.askEdit(row.id), reply_markup: { force_reply: true, input_field_placeholder: row.draft.slice(0, 60) } });
  }
  const res = await decide(c, row.id, mm[1] === 'ok' ? 'approve' : 'reject', { by: 'telegram', cards: here });
  if (res.error) return answer(t.gone);
  return answer(res.deliveredVia ? t.sentTo(t.chan[res.deliveredVia] || res.deliveredVia) : t.st[res.row.status]);
}
