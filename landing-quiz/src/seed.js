// Fictional leads for the demo: the same rows feed the public owner view (/owner-demo) and scripts/seed.mjs (the demo D1).
// All names and numbers are made up (555-01xx / 900-000-00xx are reserved or unassigned example ranges).
import { estimate, CURRENCY } from '../public/js/quiz-model.js';

const H = 3600 * 1000;
// [hours ago, lang, name, phone, contact, comment, answers, status, note, utm]
const RAW = [
  [2, 'en', 'Mary Whitfield', '+15550100142', 'whatsapp', 'Kitchen and bathroom, keys in March.', { property: 'resale', area: 68, scope: 'standard', extras: ['bathroom', 'kitchen'], start: 'month' }, 'new', null, { source: 'google', medium: 'cpc', campaign: 'renovation-quote' }],
  [5, 'ru', 'Анна Соколова', '+79000000011', 'telegram', 'Хочу тёплый пол в ванной', { property: 'newbuild', area: 54, scope: 'standard', extras: ['bathroom', 'floorheat', 'cleanup'], start: 'asap' }, 'new', null, { source: 'yandex', medium: 'cpc', campaign: 'spring' }],
  [19, 'en', 'Daniel Okafor', '+15550100177', 'call', '', { property: 'house', area: 120, scope: 'premium', extras: ['design'], start: 'quarter' }, 'contacted', 'Called, wants a visit on Saturday.', {}],
  [30, 'ru', 'Игорь Левин', '+79000000024', 'call', 'Нужен ремонт офиса, 2 этаж', { property: 'office', area: 85, scope: 'cosmetic', extras: ['cleanup'], start: 'month' }, 'visit', 'Замер в четверг, 11:00.', { source: 'telegram', medium: 'post' }],
  [52, 'ru', 'Мария Орлова', '+79000000038', 'whatsapp', '', { property: 'resale', area: 45, scope: 'standard', extras: ['kitchen'], start: 'quarter' }, 'contacted', 'Просила скинуть примеры кухонь.', {}],
  [80, 'en', 'Priya Nair', '+15550100161', 'telegram', 'Just comparing prices for now.', { property: 'newbuild', area: 40, scope: 'cosmetic', extras: [], start: 'planning' }, 'lost', 'Chose another contractor.', { source: 'newsletter' }],
  [120, 'ru', 'Сергей Громов', '+79000000052', 'call', 'Дом 140 м², дизайн-проект нужен', { property: 'house', area: 140, scope: 'premium', extras: ['design', 'floorheat'], start: 'asap' }, 'won', 'Договор подписан, старт через 2 недели.', { source: 'yandex', medium: 'cpc', campaign: 'houses' }],
  [170, 'en', 'Tom Hendricks', '+15550100119', 'call', '', { property: 'resale', area: 62, scope: 'standard', extras: ['bathroom'], start: 'month' }, 'won', 'Contract signed.', { source: 'google', medium: 'organic' }],
];

/** Seed rows shaped like the `leads` table. `now` is a timestamp in ms; dates are relative to it. */
export function seedLeads(now = Date.now()) {
  return RAW.map(([ago, lang, name, phone, contact, comment, a, status, note, utm], i) => {
    const e = estimate(a, CURRENCY[lang]);
    return {
      id: RAW.length - i, created_at: new Date(now - ago * H).toISOString(), lang, name, phone, contact, comment: comment || null,
      property: a.property, area: a.area, scope: a.scope, extras: JSON.stringify(a.extras), start: a.start,
      est_min: e.min, est_max: e.max, currency: e.currency, weeks_min: e.weeksMin, weeks_max: e.weeksMax,
      utm: Object.keys(utm).length ? JSON.stringify(utm) : null, page: lang === 'ru' ? '/ru/' : '/', ip_hash: null, duplicate_of: null,
      status, note, tg_status: 'skipped', tg_error: null,
    };
  });
}
