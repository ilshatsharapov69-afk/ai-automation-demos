// Reply drafts from the business FAQ. The owner approves, edits or rejects every draft; nothing is sent on its own.
// 1) Workers AI writes the reply using ONLY the FAQ facts and the fields the classifier found.
// 2) Fallback: a template built from the same facts (keyword retrieval), so a draft exists even offline.
import biz from '../data/business.js';
import { norm, fmtMoney, daysUntil } from './extract.js';
// The reply is prose in RU or EN: the bigger model writes clearly better Russian than the small one (compared 2026-11-06).
export const DEFAULT_DRAFT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const faqById = (id) => biz.faq.find((f) => f.id === id);
const productById = (id) => biz.products.find((p) => p.id === id);

/** FAQ entries that match the text, best first. */
export function retrieve(text, limit = 2) {
  const n = ' ' + norm(text) + ' ';
  return biz.faq
    .map((e) => ({ e, s: e.kw.reduce((a, k) => a + (n.includes(k) ? (k.length >= 5 ? 2 : 1) : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.e);
}

function fmtDate(iso, lang) {
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
}

/** Facts the draft may use for this request (same list goes to the AI). */
export function factsFor(r, text) {
  const ids = new Set();
  if (r.category === 'lead') { ids.add('prices'); ids.add('measure'); if (r.deadline) ids.add('leadtime'); }
  if (r.category === 'support') {
    if (/(достав|не привез|когда привез|deliver|not arrived|still waiting|late|delay|задерж|опазд|статус|status|when will)/.test(norm(text))) ids.add('delivery');
    if (/(broke|scratch|crack|defect|hinge|door|close|warranty|гарант|сломал|царап|трещин|петл|дверц|закрыва|брак|скрип)/.test(norm(text))) ids.add('warranty');
  }
  if (r.category === 'partnership') ids.add('partners');
  if (r.category === 'lead') for (const e of retrieve(text, 2)) if (!['warranty', 'partners'].includes(e.id)) ids.add(e.id);
  if (r.category === 'support' && !ids.size) for (const e of retrieve(text, 1)) if (e.id !== 'partners') ids.add(e.id);
  if (r.category === 'support' && !ids.size) ids.add('hours');
  return [...ids].map(faqById).filter(Boolean);
}

const T = {
  en: {
    hi: (n) => (n ? `Hello ${n.split(/\s+/)[0]},` : 'Hello,'),
    thanksLead: (p) => `Thank you for your request${p ? ` about ${/^[aeiou]/.test(p.en) ? 'an' : 'a'} ${p.en}` : ''}.`,
    product: (p) => `Price: ${p.price_en}; usual lead time ${p.weeks[0]}-${p.weeks[1]} weeks.`,
    noted: (b, d) => `We have noted ${[b && `your budget of ${b}`, d && `the date ${d}`].filter(Boolean).join(' and ')}.`,
    tight: (p, d) => `${d} is tighter than our usual ${p.weeks[0]}-${p.weeks[1]} weeks, so the workshop will confirm whether a rush slot is free.`,
    askLead: 'Could you send the room size (or a photo or plan) and a convenient time for a free measurement?',
    sorry: (o) => `Sorry for the trouble${o ? ` with order ${o}` : ''}.`,
    askOrder: 'Please send your order number and a photo so we can arrange it quickly.',
    supportNext: 'We will come back to you within one working day.',
    thanksPartner: 'Thank you for the partnership proposal.',
    partnerNext: 'We have passed it to the owner and will reply after the weekly review.',
    bye: `Best regards,\n${biz.signature.en}`,
  },
  ru: {
    hi: (n) => (n ? `Здравствуйте, ${n.split(/\s+/)[0]}!` : 'Здравствуйте!'),
    thanksLead: () => 'Спасибо за заявку.',
    product: (p) => `${cap(p.ru)}: ${p.price_ru}, обычный срок ${p.weeks[0]}-${p.weeks[1]} ${weeksRu(p.weeks[1])}.`,
    noted: (b, d) => `Зафиксировали ${[b && `бюджет ${b}`, d && `срок ${d}`].filter(Boolean).join(' и ')}.`,
    tight: (p, d) => `${cap(d)}, это быстрее наших обычных ${p.weeks[0]}-${p.weeks[1]} ${weeksRu(p.weeks[1])}, поэтому мастерская отдельно подтвердит срочный слот.`,
    askLead: 'Пришлите, пожалуйста, размеры помещения (или фото, план) и удобное время для бесплатного замера.',
    sorry: (o) => `Извините за неудобства${o ? ` с заказом ${o}` : ''}.`,
    askOrder: 'Пришлите, пожалуйста, номер заказа и фото, чтобы мы быстро всё организовали.',
    supportNext: 'Вернёмся с ответом в течение рабочего дня.',
    thanksPartner: 'Спасибо за предложение о сотрудничестве.',
    partnerNext: 'Мы передали его владельцу и ответим после еженедельного рассмотрения.',
    bye: `С уважением,\n${biz.signature.ru}`,
  },
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function weeksRu(n) { const d = n % 10, h = n % 100; return d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'недели' : d === 1 && h !== 11 ? 'неделя' : 'недель'; }

/** Template draft (offline fallback). */
export function templateDraft(r, text, now = new Date()) {
  if (r.category === 'spam') return null;
  const L = r.lang === 'ru' ? 'ru' : 'en';
  const t = T[L];
  const facts = factsFor(r, text);
  const lines = [t.hi(r.name), ''];
  const body = [];
  if (r.category === 'lead') {
    const p = productById(r.product);
    body.push(t.thanksLead(p));
    if (p) body.push(t.product(p));
    else body.push(faqById('prices')[L]);
    const b = r.budget ? fmtMoney(r.budget.amount, r.budget.currency, L) : null;
    const d = r.deadline && !r.deadline.asap ? fmtDate(r.deadline.date, L) : null;
    if (b || d) body.push(t.noted(b, d));
    const days = r.deadline ? daysUntil(r.deadline.date, now) : null;
    if (p && days != null && days < p.weeks[0] * 7) body.push(t.tight(p, d || r.deadline.text));
    for (const f of facts) if (!['prices', 'leadtime'].includes(f.id)) body.push(f[L]);
    body.push(t.askLead);
  } else if (r.category === 'support') {
    body.push(t.sorry(r.order));
    for (const f of facts) body.push(f[L]);
    if (!r.order) body.push(t.askOrder);
    body.push(t.supportNext);
  } else {
    body.push(t.thanksPartner);
    for (const f of facts) body.push(f[L]);
    body.push(t.partnerNext);
  }
  lines.push(body.join(' '), '', t.bye);
  return lines.join('\n');
}

export function draftPrompt(r, facts, now = new Date()) {
  const L = r.lang === 'ru' ? 'ru' : 'en';
  const language = L === 'ru' ? 'Russian' : 'English';
  const p = productById(r.product);
  const known = [
    r.name && `name: ${r.name}`,
    p && `product: ${p[L]}`,
    r.budget && `budget: ${fmtMoney(r.budget.amount, r.budget.currency, L)}`,
    r.deadline && `deadline: ${r.deadline.text || r.deadline.date}`,
    r.order && `order number: ${r.order}`,
  ].filter(Boolean).join('; ');
  const days = r.deadline ? daysUntil(r.deadline.date, now) : null;
  const tight = p && days != null && days < p.weeks[0] * 7;
  return (
    `You draft email and chat replies for ${biz.name.en}, a custom-furniture workshop (a fictional business used as a demo). ` +
    `The message was classified as "${r.category}". Write the reply in ${language}, 60 to 110 words, polite and concrete, plain text, no markdown, no emojis. ` +
    `Start with exactly "${T[L].hi(r.name)}", then a blank line, then the reply as one or two short paragraphs, then a blank line and "${L === 'ru' ? biz.signature.ru : biz.signature.en}" on its own line. ` +
    'Use ONLY the facts below, with their currency; never invent prices, dates, discounts or promises that are not in the facts. ' +
    'Speak for the team ("we"). Do not mention products or services the sender did not mention. Do not repeat the sender\'s message back. ' +
    (r.category === 'lead' ? `Ask for the room size or a plan and a time for the free measurement. ${tight ? 'The date the sender wants is shorter than the usual lead time: say the workshop will confirm whether a rush slot is free. ' : 'Do not mention rush slots. '}` : '') +
    (r.category === 'support' ? 'Apologise briefly only if something went wrong, and give the next step from the facts. Ask for the order number and a photo only when the sender reports a defect and gave no order number. ' : '') +
    (r.category === 'partnership' ? 'Thank them and say the owner reviews partnership offers weekly; do not accept or refuse terms and do not promise a date. ' : '') +
    `\n\nKnown about the sender: ${known || 'nothing'}.\n\nFacts:\n` +
    facts.map((f) => `- ${f[L]}`).join('\n')
  );
}

/** Fix the small layout slips models make: greeting glued to the body, a lowercase start, no blank line before the signature. */
export function tidyDraft(text, lang) {
  let t = String(text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  t = t.replace(/^((?:hi|hello|dear|good (?:morning|afternoon|evening)|здравствуйте|добрый день|добрый вечер|доброе утро)[^\n]{0,60}[,!])\n(?!\n)(\S)/i, (_, g, c) => `${g}\n\n${c.toUpperCase()}`);
  const sig = lang === 'ru' ? biz.signature.ru : biz.signature.en;
  t = t.replace(new RegExp(`([^\\n])\\n${sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), `$1\n\n${sig}`);
  return t;
}

function cleanText(out) {
  let s = '';
  if (typeof out === 'string') s = out;
  else if (out && typeof out.response === 'string') s = out.response;
  else if (out && out.choices && out.choices[0]) s = out.choices[0].message?.content || out.choices[0].text || '';
  return s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\*\*/g, '').trim();
}

/** @returns {{text:string|null, source:'ai'|'template'|'none', error?:string}} */
export async function draftReply(r, text, { ai, model, allowAi, now = new Date() } = {}) {
  if (r.category === 'spam') return { text: null, source: 'none' };
  if (ai && allowAi) {
    try {
      const out = await ai.run(model || DEFAULT_DRAFT_MODEL, {
        messages: [
          { role: 'system', content: draftPrompt(r, factsFor(r, text), now) },
          { role: 'user', content: String(text).slice(0, 2500) },
        ],
        max_tokens: 350,
        temperature: 0.3,
      });
      const s = cleanText(out);
      if (s.length >= 30 && s.length <= 1500) return { text: tidyDraft(s, r.lang), source: 'ai' };
      return { text: templateDraft(r, text, now), source: 'template', error: 'model output too short or too long' };
    } catch (e) {
      return { text: templateDraft(r, text, now), source: 'template', error: String(e && e.message ? e.message : e).slice(0, 200) };
    }
  }
  return { text: templateDraft(r, text, now), source: 'template' };
}
