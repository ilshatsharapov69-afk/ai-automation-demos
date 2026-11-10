// Classification: lead / support / spam / partnership.
// 1) Workers AI reads the message and returns JSON (category + fields + one-line summary).
// 2) The rules below always run too: they are the offline fallback and they check the model
//    (a contact or name the model "found" must really be in the message; budget and deadline are re-parsed).
import { norm, extractAll, extractBudget, extractDeadline, extractContacts, detectLang } from './extract.js';

export const CATEGORIES = ['lead', 'support', 'spam', 'partnership'];
// Small and fast model for the JSON step (measured 2026-11-06: valid JSON on 16/16 samples); the reply draft uses a bigger one.
export const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

// [stem, weight]. Stems are matched on lowercased text with ё -> е.
const SIGNALS = {
  spam: [
    ['seo', 3], ['backlink', 3], ['page 1 of google', 4], ['first page of google', 4], ['top of google', 3], ['crypto', 3], ['bitcoin', 3], ['casino', 4], ['betting', 3],
    ['lottery', 3], ['winner', 3], ['prize', 2], ['click here', 3], ['unsubscribe', 2], ['guaranteed', 2], ['dear business owner', 3], ['dear sir/madam', 2],
    ['more leads', 2], ['loan', 2], ['investment opportunity', 3], ['work from home', 3], ['viagra', 5], ['100% free', 3],
    ['продвижение сайт', 4], ['раскрутк', 3], ['в топ', 3], ['топ яндекс', 4], ['топ google', 4], ['база клиентов', 3], ['базы клиентов', 3], ['рассылк', 2],
    ['заработок', 3], ['заработ', 2], ['без вложений', 4], ['пассивн', 3], ['казино', 4], ['ставки', 2], ['криптовалют', 3], ['выигра', 3],
    ['кредит', 2], ['отписаться', 2], ['клиенты для вашего бизнеса', 4], ['лиды для', 3],
  ],
  partnership: [
    ['partnership', 4], ['partner', 3], ['collaborat', 3], ['cooperat', 3], ['referral', 3], ['commission', 2], ['affiliate', 3], ['supplier', 3], ['we supply', 3],
    ['dealer', 3], ['wholesale', 3], ['distribut', 2], ['interior design studio', 3], ['architect', 2], ['blogger', 2], ['sponsor', 2],
    ['сотруднич', 4], ['партнер', 4], ['партнерск', 3], ['коллаб', 3], ['поставщик', 3], ['поставля', 2], ['дилер', 3], ['оптом', 2], ['оптов', 2], ['комисси', 2],
    ['реферал', 3], ['агентск', 2], ['дизайн-студи', 3], ['дизайнер интерьер', 2], ['блогер', 2], ['совместн', 2], ['предлагаем', 1],
  ],
  support: [
    ['my order', 4], ['our order', 4], ['order #', 3], ['order no', 3], ['ordered', 2], ['purchased', 2], ['bought', 2], ['arrived', 2], ['not arrived', 3], ['delivered', 2],
    ['when will', 2], ['still waiting', 3], ['late', 1], ['delay', 2], ['broken', 3], ['broke', 3], ['scratch', 3], ['crack', 3], ['defect', 3], ['doesn\'t close', 3],
    ['does not close', 3], ['warranty', 3], ['refund', 3], ['return', 1], ['complain', 3], ['installer', 2], ['hinge', 2], ['squeak', 2], ['what should i do', 2], ['invoice', 1],
    ['мой заказ', 4], ['наш заказ', 4], ['заказ №', 4], ['заказ #', 4], ['заказывали', 3], ['заказали', 3], ['купили', 2], ['привезли', 2], ['не привез', 3],
    ['когда привез', 3], ['задерж', 2], ['опазд', 2], ['сломал', 3], ['царап', 3], ['трещин', 3], ['дефект', 3], ['брак', 3], ['не закрыва', 3], ['перестал', 2],
    ['разболтал', 3], ['гарант', 3], ['возврат', 3], ['жалоб', 3], ['сборщик', 2], ['петл', 2], ['скрип', 2], ['что делать', 2],
  ],
  lead: [
    ['price', 2], ['cost', 2], ['quote', 3], ['estimate', 2], ['how much', 3], ['budget', 2], ['we need', 2], ['i need', 2], ['need a', 2], ['looking for', 2], ['want', 1],
    ['would like', 2], ['interested in', 2], ['measure', 2], ['renovat', 2], ['opening', 1], ['install', 1], ['design', 1], ['kitchen', 1], ['wardrobe', 1], ['table', 1], ['shelv', 1], ['counter', 1],
    ['цен', 2], ['стоим', 2], ['сколько', 3], ['смет', 2], ['рассчит', 2], ['посчит', 2], ['бюджет', 2], ['хотим', 2], ['хочу', 2], ['нужен', 2], ['нужна', 2], ['нужно', 1],
    ['ищу', 2], ['ищем', 2], ['замер', 2], ['ремонт', 1], ['кухн', 1], ['шкаф', 1], ['стол', 1], ['стеллаж', 1], ['заказать', 2], ['интересует', 2], ['образц', 1], ['шоурум', 1],
  ],
};

/** Rule-based category with a crude confidence and the signals that fired. */
export function ruleCategory(text) {
  const n = ' ' + norm(text) + ' ';
  const scores = { lead: 0, support: 0, spam: 0, partnership: 0 };
  const hits = { lead: [], support: [], spam: [], partnership: [] };
  for (const [cat, list] of Object.entries(SIGNALS)) {
    for (const [stem, w] of list) if (n.includes(stem)) { scores[cat] += w; hits[cat].push(stem); }
  }
  const urls = (n.match(/https?:\/\/|www\.|t\.me\//g) || []).length;
  if (urls >= 2) { scores.spam += 2 * urls; hits.spam.push(`${urls} links`); }
  if ((text.match(/!{2,}/g) || []).length) { scores.spam += 1; hits.spam.push('!!!'); }
  if (/[A-Z]{6,}/.test(text) && (text.match(/[A-Z]/g) || []).length > text.length * 0.3) { scores.spam += 2; hits.spam.push('caps'); }

  // A concrete order number means an existing customer unless it is clearly a pitch.
  if (/(#|№)\s?\d{3,}/.test(text) && scores.spam < 4) { scores.support += 2; }

  let cat = 'lead';
  let top = -1;
  for (const c of ['spam', 'partnership', 'support', 'lead']) {
    // ties: spam needs a clear lead; otherwise the business-favouring order lead > support > partnership
    const s = scores[c];
    if (s > top || (s === top && c === 'lead')) { cat = c; top = s; }
  }
  if (cat === 'spam' && scores.spam < 4) {
    cat = ['lead', 'support', 'partnership'].reduce((a, b) => (scores[b] > scores[a] ? b : a), 'lead');
  }
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total === 0) return { category: 'support', confidence: 0.3, signals: [] }; // a bare question with no signal goes to support
  return { category: cat, confidence: Math.round((scores[cat] / total) * 100) / 100, signals: hits[cat].slice(0, 6) };
}

/** Rules only: category + fields. */
export function classifyRules(msg, now) {
  const fields = extractAll(msg, now);
  const text = [msg.subject, msg.body].filter(Boolean).join('\n');
  const c = ruleCategory(text);
  return { ...fields, category: c.category, confidence: c.confidence, signals: c.signals, by: 'rules' };
}

// ---------- AI ----------
export function classifyPrompt() {
  return (
    'You triage the inbox of a small custom-furniture workshop (a fictional demo business). ' +
    'Read one incoming message and reply with ONE JSON object and nothing else, with these keys: ' +
    '"category": one of "lead" (a possible new customer asking about a product, price or order), "support" (an existing customer: order status, delivery, defect, warranty, or a general question), ' +
    '"spam" (unsolicited promotion, SEO, crypto, scams, mass mailing), "partnership" (designers, suppliers, dealers, bloggers or companies proposing to work together); ' +
    '"name": the sender\'s name if written in the message, else null; "contact": a phone, email or @username written in the message, else null; ' +
    '"budget": the budget as written (keep the number and currency), else null; "deadline": the deadline as written, else null; ' +
    '"summary": one short sentence in the language of the message saying what the sender wants. ' +
    'Never invent values that are not in the message.'
  );
}

/** Pull one JSON object out of whatever the model returned: fences, prose around it, trailing commas, a cut-off tail. */
export function parseJsonLoose(out) {
  let s = '';
  if (typeof out === 'string') s = out;
  else if (out && typeof out.response === 'string') s = out.response;
  else if (out && out.response && typeof out.response === 'object') return out.response;
  else if (out && out.choices && out.choices[0]) s = out.choices[0].message?.content || out.choices[0].text || '';
  s = s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  if (a < 0) return null;
  const b = s.lastIndexOf('}');
  const tries = [];
  if (b > a) tries.push(s.slice(a, b + 1));
  tries.push(s.slice(a).replace(/,\s*$/, '') + (s.slice(a).split('"').length % 2 === 0 ? '"' : '') + '}'); // cut off before the closing brace
  for (const t of tries) {
    for (const f of [(x) => x, (x) => x.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')]) {
      try {
        const j = JSON.parse(f(t));
        if (j && typeof j === 'object' && !Array.isArray(j)) return j;
      } catch { /* try the next repair */ }
    }
  }
  return null;
}

const present = (needle, hay) => needle && norm(hay).includes(norm(needle).trim());

/** Merge what the model said with the rules: the model picks category and summary, the rules verify fields. */
export function mergeAi(rules, ai, msg, now) {
  const text = [msg.subject, msg.body, msg.name, msg.email, msg.telegram].filter(Boolean).join('\n');
  const cat = CATEGORIES.includes(String(ai.category || '').toLowerCase()) ? String(ai.category).toLowerCase() : rules.category;
  const out = { ...rules, category: cat, confidence: cat === rules.category ? Math.max(0.8, rules.confidence) : 0.7, by: 'ai' };
  if (!rules.name && typeof ai.name === 'string' && present(ai.name, text) && ai.name.length < 60) out.name = ai.name.trim();
  if (typeof ai.contact === 'string' && present(ai.contact, text)) {
    const c = extractContacts(ai.contact);
    out.email = out.email || c.email; out.phone = out.phone || c.phone; out.telegram = out.telegram || c.telegram;
  }
  if (!rules.budget && typeof ai.budget === 'string' && ai.budget.trim()) out.budget = extractBudget(ai.budget, rules.lang) || null;
  if (!rules.deadline && typeof ai.deadline === 'string' && ai.deadline.trim()) {
    out.deadline = /^\d{4}-\d{2}-\d{2}$/.test(ai.deadline.trim()) ? { date: ai.deadline.trim(), text: ai.deadline.trim() } : extractDeadline(ai.deadline, now);
  }
  if (typeof ai.summary === 'string' && ai.summary.trim().length > 5) out.summary = ai.summary.trim().slice(0, 160);
  if (detectLang(ai.summary || '') !== rules.lang) out.summary = rules.summary; // keep the summary in the sender's language
  return out;
}

/**
 * @param msg {subject, body, name?, email?, phone?, telegram?, langHint?}
 * @param opts {ai, model, allowAi, now}
 */
export async function classify(msg, { ai, model, allowAi, now = new Date() } = {}) {
  const rules = classifyRules(msg, now);
  if (!ai || !allowAi) return rules;
  try {
    const out = await ai.run(model || DEFAULT_MODEL, {
      messages: [
        { role: 'system', content: classifyPrompt() },
        { role: 'user', content: [msg.subject ? `Subject: ${msg.subject}` : '', String(msg.body || '').slice(0, 2500)].filter(Boolean).join('\n') },
      ],
      max_tokens: 300,
      temperature: 0,
    });
    const j = parseJsonLoose(out);
    if (!j || !j.category) return { ...rules, aiError: 'unparsable model output' };
    return mergeAi(rules, j, msg, now);
  } catch (e) {
    return { ...rules, aiError: String(e && e.message ? e.message : e).slice(0, 200) };
  }
}
