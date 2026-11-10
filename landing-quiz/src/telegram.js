// The card the owner gets in Telegram for every lead, and the Bot API call that sends it.
import { label, formatRange, formatWeeks, STEP } from '../public/js/quiz-model.js';
import { T } from './i18n.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Telegram HTML text of the card. `lead` is the output of validateLead(); answers are labelled in the owner's language. */
export function formatCard(lead, id, { lang, origin, duplicateOf }) {
  const t = T[lang];
  const a = lead.answers;
  const extras = a.extras.length ? a.extras.map((x) => label('extras', x, lang)).join(', ') : t.noExtras;
  const utm = Object.entries(lead.utm || {}).map(([k, v]) => `${k}=${v}`).join(' · ');
  const lines = [
    `<b>${esc(t.cardTitle(id))}</b>`,
    '',
    `👤 ${esc(lead.name)}`,
    `📞 ${esc(lead.phone)} (${esc(t.contact[lead.contact])})${duplicateOf ? `\n⚠️ ${esc(t.duplicateNote)} #${duplicateOf}` : ''}`,
    `🏠 ${esc(label('property', a.property, lang))} · ${a.area} ${STEP.area.unit[lang]} · ${esc(label('scope', a.scope, lang))}`,
    `➕ ${esc(extras)}`,
    `🗓 ${esc(t.start)}: ${esc(label('start', a.start, lang))}`,
    `💰 ${esc(t.estimate)}: <b>${esc(formatRange(lead.estimate, lang))}</b> · ${esc(formatWeeks(lead.estimate, lang))}`,
  ];
  if (lead.comment) lines.push(`💬 ${esc(t.comment)}: ${esc(lead.comment)}`);
  lines.push('', `🌐 ${esc(t.siteLang)}: ${lead.lang.toUpperCase()}${utm ? ` · ${esc(t.source)}: ${esc(utm)}` : ''}`);
  const msg = { text: lines.join('\n'), parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
  // Telegram accepts URL buttons only for public https links (not localhost in local runs).
  if (origin && origin.startsWith('https://')) msg.reply_markup = { inline_keyboard: [[{ text: t.openTable, url: `${origin}/admin` }]] };
  return msg;
}

/** Sends one message. Returns { ok, error }. Retries once on 429 / 5xx / network errors. */
export async function sendTelegram(env, msg, { fetchImpl = fetch, retryDelayMs = 1000 } = {}) {
  const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TG_CHAT_ID, ...msg }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) return { ok: true };
      last = `${r.status} ${j.description || ''}`.trim();
      if (r.status !== 429 && r.status < 500) break; // wrong token / chat id: retrying will not help
      const wait = j.parameters?.retry_after ? Math.min(j.parameters.retry_after, 5) * 1000 : retryDelayMs;
      if (attempt === 0) await new Promise((res) => setTimeout(res, wait));
    } catch (e) {
      last = `network: ${e && e.message ? e.message : e}`;
      if (attempt === 0) await new Promise((res) => setTimeout(res, retryDelayMs));
    }
  }
  return { ok: false, error: last.slice(0, 300) };
}
