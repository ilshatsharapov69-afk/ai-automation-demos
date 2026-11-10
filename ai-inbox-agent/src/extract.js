// Rule-based field extraction: language, name, contacts, budget, deadline, product.
// Runs offline with no AI; the AI path (classify.js) reuses these parsers to check and normalise what the model says.
import biz from '../data/business.js';

export const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е');

export function detectLang(text, hint) {
  const s = String(text || '');
  const cyr = (s.match(/[а-яё]/gi) || []).length;
  const lat = (s.match(/[a-z]/gi) || []).length;
  if (cyr + lat < 3 && hint) return String(hint).startsWith('ru') ? 'ru' : 'en';
  return cyr > lat * 0.5 ? 'ru' : 'en';
}

// ---------- contacts ----------
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:(?:\+\d{1,3}|(?<!\d)8)[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{2,4}(?:[\s-]?\d{2,4}){2,4}/g;
const TG_RE = /(?:^|[\s(,:])@([a-z][a-z0-9_]{4,31})\b/gi;

function phoneSpans(text) {
  const out = [];
  for (const m of text.matchAll(PHONE_RE)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    // A date (2026-12-15), a year range or an order number is not a phone.
    if (/^\d{4}-\d{2}-\d{2}$/.test(m[0].trim())) continue;
    const before = text.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    if (/(#|№|order|заказ|invoice|счет|счёт)\s*$/.test(before)) continue;
    out.push({ value: m[0].trim(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function extractContacts(text) {
  const t = String(text || '');
  const emails = [...new Set((t.match(EMAIL_RE) || []).map((e) => e.toLowerCase()))];
  const phones = phoneSpans(t).map((p) => p.value);
  const telegram = [];
  for (const m of t.matchAll(TG_RE)) {
    const at = m.index + m[0].indexOf('@');
    if (emails.some((e) => t.toLowerCase().indexOf(e) <= at && at < t.toLowerCase().indexOf(e) + e.length)) continue;
    telegram.push('@' + m[1]);
  }
  return { email: emails[0] || null, phone: phones[0] || null, telegram: telegram[0] || null };
}

// ---------- name ----------
const NAME_WORD = "[A-ZА-ЯЁ][a-zа-яё'-]+";
const NAME_RES = [
  new RegExp(`(?:[Mm]y name is|[Tt]his is|I am|I'm|[Мм]еня зовут|[Нн]а связи|[Ээ]то|[Сс] вами|[Mm]anager|[Мм]енеджер|[Сс]пециалист)\\s+(${NAME_WORD}(?:\\s${NAME_WORD})?)`),
  new RegExp(`(?:^|[,.!]\\s*)[Яя]\\s*[-—,]?\\s+(${NAME_WORD}(?:\\s${NAME_WORD})?)(?=[,.!\\s]|$)`, 'm'),
  new RegExp(`(?:[Rr]egards|[Tt]hanks|[Tt]hank you|[Bb]est|[Cc]heers|[Сс] уважением|[Сс]пасибо|[Вв]сего доброго)[,!.]?\\s*\\n+\\s*(${NAME_WORD}(?:\\s${NAME_WORD})?)\\s*(?:\\n|$)`),
];
const NOT_NAMES = new Set(['interested', 'looking', 'writing', 'hoping', 'planning', 'from', 'here', 'just', 'срочно', 'вопрос', 'заказ', 'интересно', 'хочу', 'хотим', 'пишу', 'нужна', 'нужен', 'нужно', 'оставляю', 'interior', 'designer', 'дизайнер']);

export function extractName(text) {
  const t = String(text || '');
  for (const re of NAME_RES) {
    const m = t.match(re);
    if (!m) continue;
    const name = m[1].trim();
    if (NOT_NAMES.has(norm(name.split(/\s/)[0]))) continue;
    return name;
  }
  return null;
}

// ---------- money ----------
const CUR = [
  [/^(\$|usd|dollars?|долл[a-zа-яё]*|бакс[a-zа-яё]*)$/i, 'USD'],
  [/^(€|eur|euros?|евро)$/i, 'EUR'],
  [/^(₽|руб[a-zа-яё]*|р\.?|rub|rubles?|roubles?)$/i, 'RUB'],
];
const curOf = (s) => { if (!s) return null; for (const [re, c] of CUR) if (re.test(s.trim())) return c; return null; };
const MULT = (s) => {
  if (!s) return 1;
  const x = norm(s).replace(/\.$/, '');
  if (/^(k|к|тыс|тысяч[a-zа-яё]*|тыщ[a-zа-яё]*|thousand)$/.test(x)) return 1e3;
  if (/^(m|mln|млн|миллион[a-zа-яё]*|million)$/.test(x)) return 1e6;
  return 1;
};
const MONEY_RE = /(\$|€|₽)?\s?(\d{1,3}(?:[   ,.]\d{3})+|\d+(?:[.,]\d+)?)\s?(k|к|тыс\.?|тысяч[a-zа-яё]*|тыщ[a-zа-яё]*|thousand|млн|миллион[a-zа-яё]*|million|mln|m)?(?![a-zа-я])\s?(\$|€|₽|usd|eur|euros?|евро|dollars?|долл[a-zа-яё]*|руб[a-zа-яё]*|р\.|rub|rubles?|roubles?)?(?![a-zа-я0-9])/gi;
const BUDGET_KW = /((budget|бюджет)[^.!?\n]{0,25}|(up to|max|maximum|не более|максимум|готовы потратить|рассчитываем на)\s*)$/i;

function toNumber(s) {
  if (/^\d{1,3}(?:[   ,.]\d{3})+$/.test(s)) return Number(s.replace(/[^\d]/g, ''));
  return Number(s.replace(',', '.'));
}

export function fmtMoney(amount, currency, lang) {
  if (amount == null) return null;
  const n = new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 0 }).format(amount).replace(/ | /g, ' ');
  if (currency === 'USD') return `$${n}`;
  if (currency === 'EUR') return `€${n}`;
  if (currency === 'RUB') return `${n} ₽`;
  return n;
}

/** @returns {{amount:number, currency:string, text:string}|null} */
export function extractBudget(text, lang = 'en') {
  const t = String(text || '');
  const skip = phoneSpans(t);
  const cands = [];
  for (const m of t.matchAll(MONEY_RE)) {
    const start = m.index + (m[0].length - m[0].trimStart().length);
    if (skip.some((s) => start >= s.start && start < s.end)) continue;
    const before = t.slice(Math.max(0, m.index - 30), m.index);
    if (/(#|№|order|заказ|invoice|счет|счёт)\s*$/i.test(before)) continue;
    const raw = m[2];
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 12);
    // dates, times and sizes are not money
    if (/^\s*(-|–|\/|\.)?\s*(\d{1,2}\b|января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(after) && !m[3] && !m[4] && !m[1]) continue;
    if (/^\s*(m2|м2|кв|sq|cm|см|mm|мм|м|m|метр|meter|metre|weeks?|недел|days?|дн|дней|months?|месяц|years?|лет|год|people|person|человек|персон|шт|pcs|x|х|%|:)(?![a-zа-яё])/i.test(after) && !m[1] && !m[4]) continue;
    if (/^\s*(метр|meter|metre|недел|месяц|человек)/i.test(after) && !m[1] && !m[4]) continue;
    const cur = curOf(m[1]) || curOf(m[4]);
    const mult = MULT(m[3]);
    const kw = BUDGET_KW.test(before);
    if (!cur && mult === 1 && !kw) continue;
    if (!cur && !kw && /^m$/i.test(m[3] || '')) continue; // "4 m" is metres, not millions
    let amount = toNumber(raw) * mult;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    cands.push({ amount, cur, mult, kw, start: m.index, end: m.index + m[0].length, text: m[0].trim() });
  }
  if (!cands.length) return null;
  // "200-300k" / "от 200 до 300 тыс": a bare number right before a number with a unit takes the unit.
  for (let i = 0; i < cands.length - 1; i++) {
    const a = cands[i], b = cands[i + 1];
    const gap = t.slice(a.end, b.start);
    if (/^\s*(-|–|—|to|до)\s*$/i.test(gap)) {
      if (a.mult === 1 && b.mult > 1) a.amount *= b.mult;
      a.cur = a.cur || b.cur;
      b.rangeFrom = a;
      a.inRange = true;
    }
  }
  const pool = cands.filter((c) => !c.inRange);
  const best = pool.find((c) => c.kw || c.rangeFrom?.kw) || pool.filter((c) => c.cur).sort((x, y) => y.amount - x.amount)[0] || pool.find((c) => c.mult > 1) || pool[0];
  const currency = best.cur || (lang === 'ru' ? 'RUB' : 'USD');
  const text0 = best.rangeFrom ? t.slice(best.rangeFrom.start, best.end).trim() : best.text;
  return { amount: best.amount, currency, text: text0, ...(best.rangeFrom ? { from: best.rangeFrom.amount } : {}) };
}

// ---------- deadline ----------
const MONTHS = [
  ['jan', /^(january|jan\.?|январ[ьяюе]|янв\.?)$/],
  ['feb', /^(february|feb\.?|феврал[ьяюе]|фев\.?)$/],
  ['mar', /^(march|mar\.?|март[ае]?|марту|мар\.?)$/],
  ['apr', /^(april|apr\.?|апрел[ьяюе]|апр\.?)$/],
  ['may', /^(may|ма[йяюе])$/],
  ['jun', /^(june|jun\.?|июн[ьяюе])$/],
  ['jul', /^(july|jul\.?|июл[ьяюе])$/],
  ['aug', /^(august|aug\.?|август[ае]?|августу|авг\.?)$/],
  ['sep', /^(september|sept?\.?|сентябр[ьяюе]|сен\.?)$/],
  ['oct', /^(october|oct\.?|октябр[ьяюе]|окт\.?)$/],
  ['nov', /^(november|nov\.?|ноябр[ьяюе]|ноя\.?)$/],
  ['dec', /^(december|dec\.?|декабр[ьяюе]|дек\.?)$/],
];
const MONTH_WORD = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec|январ[ьяюе]|феврал[ьяюе]|март[ае]?|марту|апрел[ьяюе]|ма[йяюе]|июн[ьяюе]|июл[ьяюе]|август[ае]?|августу|сентябр[ьяюе]|октябр[ьяюе]|ноябр[ьяюе]|декабр[ьяюе])';
const monthIdx = (w) => { const x = norm(w); for (let i = 0; i < 12; i++) if (MONTHS[i][1].test(x)) return i; return -1; };
const iso = (d) => d.toISOString().slice(0, 10);
const utc = (y, m, d) => new Date(Date.UTC(y, m, d, 12));
const addDays = (now, n) => utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n);
const endOfMonth = (y, m) => utc(y, m + 1, 0);
const numWord = (s) => {
  const x = norm(s);
  const map = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2, 'a couple of': 2, одну: 1, один: 1, одна: 1, две: 2, два: 2, три: 3, четыре: 4, пять: 5, шесть: 6, пару: 2, полтора: 1.5 };
  return /^\d+$/.test(x) ? Number(x) : map[x] ?? null;
};

/** @returns {{date:string, text:string, asap?:boolean}|null} date = YYYY-MM-DD */
export function extractDeadline(text, now = new Date()) {
  const t = String(text || '');
  const n = norm(t);
  const y0 = now.getUTCFullYear();
  const future = (m, d) => { let dt = utc(y0, m, d); if (dt < addDays(now, -1)) dt = utc(y0 + 1, m, d); return dt; };
  const hit = (dt, m) => ({ date: iso(dt), text: m.trim() });
  let m;

  if ((m = t.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/))) return hit(utc(+m[1], +m[2] - 1, +m[3]), m[0]);
  if ((m = t.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(20\d\d|\d\d))?\b/)) && +m[2] >= 1 && +m[2] <= 12 && +m[1] <= 31) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
    return hit(y ? utc(y, +m[2] - 1, +m[1]) : future(+m[2] - 1, +m[1]), m[0]);
  }
  // end of <month> / до конца <месяца>
  if ((m = n.match(new RegExp(`(?:end of|до конца|к концу|в конце)\\s+${MONTH_WORD}`)))) {
    const mi = monthIdx(m[1]);
    let dt = endOfMonth(y0, mi); if (dt < now) dt = endOfMonth(y0 + 1, mi);
    return hit(dt, t.slice(m.index, m.index + m[0].length));
  }
  // 15 December / 15-го декабря / December 15th
  if ((m = n.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th|-?го|-?му|-?е)?\\s+(?:of\\s+)?${MONTH_WORD}(?![a-zа-яё])`))) && monthIdx(m[2]) >= 0) {
    const s = n.lastIndexOf(' ', Math.max(0, m.index - 2));
    const pre = n.slice(Math.max(0, m.index - 8), m.index).match(/(by|до|к|before|until)\s*$/);
    return hit(future(monthIdx(m[2]), +m[1]), t.slice(pre ? m.index - pre[0].length : m.index, m.index + m[0].length) || t.slice(s + 1));
  }
  if ((m = n.match(new RegExp(`(?<![a-zа-яё])${MONTH_WORD}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`))) && monthIdx(m[1]) >= 0) {
    const pre = n.slice(Math.max(0, m.index - 8), m.index).match(/(by|before|until)\s*$/);
    return hit(future(monthIdx(m[1]), +m[2]), t.slice(pre ? m.index - pre[0].length : m.index, m.index + m[0].length));
  }
  if ((m = n.match(/(?<![a-zа-яё])(к|до|by|before)\s+(нового года|new year'?s?(?: eve)?|новому году|the new year|christmas|рождества|рождеству)/))) {
    const xmas = /christ|рожд/.test(m[2]);
    return hit(xmas ? future(11, 24) : future(11, 31), t.slice(m.index, m.index + m[0].length));
  }
  if ((m = n.match(/(end of (?:the |this )?month|до конца месяца|к концу месяца|в конце месяца)/))) {
    return hit(endOfMonth(y0, now.getUTCMonth()), t.slice(m.index, m.index + m[0].length));
  }
  if ((m = n.match(/(end of (?:the |this )?year|до конца года|к концу года)/))) return hit(utc(y0, 11, 31), t.slice(m.index, m.index + m[0].length));
  // by/in <month>: by December = start of it, in December / в декабре = end of it
  if ((m = n.match(new RegExp(`(?<![a-zа-яё])(by|before|к|до|in|в|during)\\s+${MONTH_WORD}(?![a-zа-яё])`))) && monthIdx(m[2]) >= 0) {
    const mi = monthIdx(m[2]);
    const start = /^(by|before|к|до)$/.test(m[1]);
    let dt = start ? utc(y0, mi, 1) : endOfMonth(y0, mi);
    if (dt < now) dt = start ? utc(y0 + 1, mi, 1) : endOfMonth(y0 + 1, mi);
    return hit(dt, t.slice(m.index, m.index + m[0].length));
  }
  // in 3 weeks / через 2 недели / within a month / за месяц
  if ((m = n.match(/(?<![a-zа-яё])(in|within|через|за|в течение)\s+(\d+|a couple of|a|an|one|two|three|four|five|six|couple|одну|один|одна|две|два|три|четыре|пять|шесть|пару|полтора)?\s*(days?|weeks?|months?|дн[a-zа-яё]*|день|недел[a-zа-яё]*|месяц[a-zа-яё]*)/))) {
    const k = m[2] ? numWord(m[2]) : 1;
    if (k) {
      const unit = m[3];
      const days = /^(day|дн|день)/.test(unit) ? k : /^(week|недел)/.test(unit) ? 7 * k : 30 * k;
      return hit(addDays(now, Math.round(days)), t.slice(m.index, m.index + m[0].length));
    }
  }
  if ((m = n.match(/(next week|на следующей неделе|следующей неделе)/))) return hit(addDays(now, 7), t.slice(m.index, m.index + m[0].length));
  if ((m = n.match(/(this week|на этой неделе)/))) return hit(addDays(now, 5), t.slice(m.index, m.index + m[0].length));
  if ((m = n.match(/(?<![a-zа-яё])(tomorrow|завтра)/))) return hit(addDays(now, 1), t.slice(m.index, m.index + m[0].length));
  if ((m = n.match(/(?<![a-zа-яё])(asap|as soon as possible|urgent(?:ly)?|срочно|как можно скорее|побыстрее)/))) return { ...hit(addDays(now, 7), t.slice(m.index, m.index + m[0].length)), asap: true };
  return null;
}

export function daysUntil(dateIso, now) {
  if (!dateIso) return null;
  return Math.round((Date.parse(dateIso + 'T12:00:00Z') - now.getTime()) / 86400000);
}

// ---------- product ----------
export function extractProduct(text) {
  const n = norm(text);
  let best = null, bestPos = Infinity;
  for (const p of biz.products) {
    for (const k of p.kw) {
      const i = n.indexOf(k);
      if (i >= 0 && i < bestPos) { best = p; bestPos = i; }
    }
  }
  return best ? best.id : null;
}

export function orderNumber(text) {
  const m = String(text || '').match(/(?:#|№|order\s*(?:no\.?|number|#)?|заказ[a-zа-яё]*\s*(?:№|#|номер)?)\s*([A-Z]{0,3}-?\d{3,8})/i);
  return m ? m[1] : null;
}

export function summarize(subject, body) {
  const b = String(body || '').replace(/\s+/g, ' ').trim();
  // Strip greetings and skip short self-introductions ("Здравствуйте!", "Меня зовут Олег.") to reach what the sender wants.
  const GREET = /^((hi|hello|hey|dear)\b[^,!.]{0,25}[,!.]|good (morning|afternoon|evening)[,!.]?|здравствуйте|добрый (день|вечер)|доброе утро|привет)[\s,!.:—-]*/i;
  const INTRO = /^(меня зовут|my name is|this is|i am|i'm|это)\s/i;
  const parts = b.split(/(?<=[.!?])\s+/);
  let first = b;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].replace(GREET, '').trim();
    const last = i === parts.length - 1;
    if (!last && (p.length < 12 || (INTRO.test(p) && p.length < 45))) continue;
    first = p ? p.charAt(0).toUpperCase() + p.slice(1) : parts[i];
    break;
  }
  const s = subject && !/^(re:|fwd?:)?\s*(hi|hello|привет|здравствуйте|вопрос|question)?\s*$/i.test(subject) ? `${subject.trim()}: ${first}` : first;
  return s.length > 140 ? s.slice(0, 137).trimEnd() + '…' : s;
}

// An explicit name (form field, email From) wins, unless the text gives a fuller form of it
// ("Павел" in From, "Павел Орлов" in the signature). Telegram display names are only a last resort.
function pickName(msg, fromText) {
  if (msg.name) {
    const first = norm(msg.name.split(/\s+/)[0]);
    if (fromText && norm(fromText).startsWith(first) && fromText.length > msg.name.length) return fromText;
    return msg.name;
  }
  return fromText || msg.nameHint || null;
}

/** Everything the rules can read from one message. */
export function extractAll(msg, now = new Date()) {
  const text = [msg.subject, msg.body].filter(Boolean).join('\n');
  const lang = detectLang(text, msg.langHint);
  const c = extractContacts(text);
  return {
    lang,
    name: pickName(msg, extractName(msg.body)),
    email: c.email || msg.email || null,
    phone: c.phone || msg.phone || null,
    telegram: c.telegram || msg.telegram || null,
    budget: extractBudget(text, lang),
    deadline: extractDeadline(text, now),
    product: extractProduct(text),
    order: orderNumber(text),
    summary: summarize(msg.subject, msg.body),
  };
}
