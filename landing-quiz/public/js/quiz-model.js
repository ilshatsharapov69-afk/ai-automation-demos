// One source of truth for the quiz: steps, options, prices and the estimate formula.
// Imported by the browser (public/js/quiz.js), the Worker (src/lead.js re-checks every answer and
// recomputes the estimate, so a tampered request cannot store a fake price) and the page builder.
// To reuse for a client: change prices and labels here, run `npm run build`, deploy.

export const LANGS = ['en', 'ru'];
export const CURRENCY = { en: 'USD', ru: 'RUB' };
const ROUND = { USD: 100, RUB: 10000 };

export const STEPS = [
  {
    id: 'property', kind: 'single',
    title: { en: 'What are we renovating?', ru: 'Что ремонтируем?' },
    options: [
      { id: 'newbuild', icon: 'building', k: 1.0, label: { en: 'New-build apartment', ru: 'Квартира в новостройке' }, hint: { en: 'Bare walls or white box', ru: 'Без отделки или white box' } },
      { id: 'resale', icon: 'key', k: 1.12, label: { en: 'Older apartment', ru: 'Квартира во вторичке' }, hint: { en: 'We remove the old finish first', ru: 'С демонтажем старой отделки' } },
      { id: 'house', icon: 'house', k: 1.2, label: { en: 'House or townhouse', ru: 'Дом или таунхаус' }, hint: { en: 'Several floors, stairs, utilities', ru: 'Этажи, лестница, инженерия' } },
      { id: 'office', icon: 'briefcase', k: 0.95, label: { en: 'Office or studio', ru: 'Офис или студия' }, hint: { en: 'Open space, meeting rooms', ru: 'Open space, переговорные' } },
    ],
  },
  {
    id: 'area', kind: 'range', min: 15, max: 250, step: 1, default: 55, presets: [30, 45, 60, 80, 120],
    title: { en: 'What is the floor area?', ru: 'Какая площадь?' },
    hint: { en: 'Approximate is fine, we measure on site for free', ru: 'Можно примерно: точно замерим бесплатно' },
    unit: { en: 'm²', ru: 'м²' },
  },
  {
    id: 'scope', kind: 'single',
    title: { en: 'How deep is the renovation?', ru: 'Какой ремонт нужен?' },
    options: [
      { id: 'cosmetic', icon: 'roller', rate: { USD: 95, RUB: 7000 }, weeks: [2, 25], label: { en: 'Cosmetic refresh', ru: 'Косметический' }, hint: { en: 'Paint, flooring, doors. Walls stay put', ru: 'Покраска, полы, двери. Без переноса стен' } },
      { id: 'standard', icon: 'drill', rate: { USD: 190, RUB: 14500 }, weeks: [4, 12], label: { en: 'Full renovation', ru: 'Капитальный' }, hint: { en: 'New wiring and pipes, screed, plaster, tiles', ru: 'Новая электрика и трубы, стяжка, штукатурка, плитка' } },
      { id: 'premium', icon: 'gem', rate: { USD: 340, RUB: 26000 }, weeks: [6, 9], label: { en: 'Designer renovation', ru: 'Дизайнерский' }, hint: { en: 'Complex finishes, custom joinery, site supervision by a designer', ru: 'Сложная отделка, мебель на заказ, авторский надзор' } },
    ],
  },
  {
    id: 'extras', kind: 'multi',
    title: { en: 'Anything else to include?', ru: 'Что ещё включить?' },
    hint: { en: 'Pick any, or skip this step', ru: 'Выберите любые или пропустите шаг' },
    options: [
      { id: 'bathroom', icon: 'bath', price: { USD: 3800, RUB: 210000 }, addWeeks: 1, label: { en: 'Bathroom turnkey', ru: 'Санузел под ключ' } },
      { id: 'kitchen', icon: 'kitchen', price: { USD: 3200, RUB: 160000 }, addWeeks: 1, label: { en: 'Kitchen fitting', ru: 'Кухня с установкой' } },
      { id: 'floorheat', icon: 'heat', price: { USD: 900, RUB: 55000 }, addWeeks: 0, label: { en: 'Underfloor heating', ru: 'Тёплый пол' } },
      { id: 'design', icon: 'ruler', perM2: { USD: 30, RUB: 2500 }, addWeeks: 2, label: { en: 'Design project', ru: 'Дизайн-проект' } },
      { id: 'cleanup', icon: 'truck', price: { USD: 450, RUB: 30000 }, addWeeks: 0, label: { en: 'Debris removal and final cleaning', ru: 'Вывоз мусора и клининг' } },
    ],
  },
  {
    id: 'start', kind: 'single',
    title: { en: 'When would you like to start?', ru: 'Когда хотите начать?' },
    options: [
      { id: 'asap', icon: 'bolt', label: { en: 'As soon as possible', ru: 'Как можно скорее' } },
      { id: 'month', icon: 'calendar', label: { en: 'Within a month', ru: 'В течение месяца' } },
      { id: 'quarter', icon: 'clock', label: { en: 'In 2-3 months', ru: 'Через 2-3 месяца' } },
      { id: 'planning', icon: 'search', label: { en: 'Just comparing prices', ru: 'Пока сравниваю цены' } },
    ],
  },
];

export const STEP = Object.fromEntries(STEPS.map((s) => [s.id, s]));
const opt = (stepId, id) => (STEP[stepId].options || []).find((o) => o.id === id);

/** Label of an answer in a language, e.g. label('scope', 'standard', 'ru') -> 'Капитальный'. */
export function label(stepId, id, lang) {
  const o = opt(stepId, id);
  return o ? o.label[lang] || o.label.en : String(id);
}

/** Checks raw answers from the browser. Returns { ok, value, errors } with error codes per step. */
export function validateAnswers(raw) {
  const errors = {};
  const value = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: { answers: 'invalid' } };
  for (const s of STEPS) {
    const v = raw[s.id];
    if (s.kind === 'single') {
      if (typeof v !== 'string' || !opt(s.id, v)) errors[s.id] = 'invalid';
      else value[s.id] = v;
    } else if (s.kind === 'range') {
      const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
      if (!Number.isInteger(n) || n < s.min || n > s.max) errors[s.id] = 'out_of_range';
      else value[s.id] = n;
    } else if (s.kind === 'multi') {
      const list = v == null ? [] : v;
      if (!Array.isArray(list) || list.length > s.options.length || list.some((x) => typeof x !== 'string' || !opt(s.id, x)) || new Set(list).size !== list.length) errors[s.id] = 'invalid';
      else value[s.id] = s.options.map((o) => o.id).filter((id) => list.includes(id)); // canonical order
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

const roundTo = (n, step) => Math.round(n / step) * step;

/**
 * Price and duration range for valid answers. Range is -8 % .. +15 % around the formula,
 * rounded to 100 USD / 10,000 RUB. The breakdown lists the base works and each extra.
 */
export function estimate(a, currency) {
  const prop = opt('property', a.property);
  const scope = opt('scope', a.scope);
  const step = ROUND[currency];
  const base = a.area * scope.rate[currency] * prop.k;
  const breakdown = [{ id: 'base', amount: roundTo(base, step / 10) }];
  let weeks = scope.weeks[0] + a.area / scope.weeks[1];
  let total = base;
  for (const id of a.extras) {
    const x = opt('extras', id);
    const amount = x.price ? x.price[currency] : x.perM2[currency] * a.area;
    breakdown.push({ id, amount: roundTo(amount, step / 10) });
    total += amount;
    weeks += x.addWeeks;
  }
  if (prop.id === 'house') weeks *= 1.15;
  const weeksMin = Math.max(1, Math.round(weeks));
  return {
    currency,
    min: roundTo(total * 0.92, step),
    max: roundTo(total * 1.15, step),
    weeksMin,
    weeksMax: Math.max(weeksMin + 1, Math.round(weeks * 1.3)),
    breakdown,
  };
}

export function formatMoney(n, currency, lang) {
  return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

export function formatRange(e, lang) {
  return `${formatMoney(e.min, e.currency, lang)} – ${formatMoney(e.max, e.currency, lang)}`;
}

export function formatWeeks(e, lang) {
  return lang === 'ru' ? `${e.weeksMin}–${e.weeksMax} нед.` : `${e.weeksMin}–${e.weeksMax} weeks`;
}
