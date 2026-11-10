// Validation of the lead form + quiz answers. Pure functions, no I/O (tested directly).
import { LANGS, CURRENCY, validateAnswers, estimate } from '../public/js/quiz-model.js';

export const CONTACT_METHODS = ['call', 'telegram', 'whatsapp'];
export const STATUSES = ['new', 'contacted', 'visit', 'won', 'lost'];
const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term'];

// Control characters and invisible format characters are stripped from free text.
const clean = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim();
const oneLine = (s) => clean(s).replace(/\s+/g, ' ');

/** Phone: digits with optional +, spaces, dashes, dots, brackets. RU numbers 8XXXXXXXXXX become +7XXXXXXXXXX. */
export function normalizePhone(raw, lang) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length > 32 || !/^\+?[\d\s().-]+$/.test(s)) return null;
  let digits = s.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (lang === 'ru' && !s.startsWith('+') && digits.length === 11 && digits[0] === '8') digits = '7' + digits.slice(1);
  if (lang === 'ru' && !s.startsWith('+') && digits.length === 10 && digits[0] === '9') digits = '7' + digits;
  return '+' + digits;
}

/**
 * Validates a parsed JSON body. Returns
 *   { ok: true, lead }                       a clean lead ready for D1
 *   { ok: false, errors: { field: code } }   codes: required, invalid, name_invalid, phone_invalid, too_long, consent_required
 *   { ok: false, spam: true }                honeypot filled (caller answers 200 and stores nothing)
 */
export function validateLead(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: { body: 'invalid' } };
  if (body.website) return { ok: false, spam: true }; // hidden field humans never see

  const errors = {};
  const lang = LANGS.includes(body.lang) ? body.lang : null;
  if (!lang) errors.lang = 'invalid';

  const qa = validateAnswers(body.answers);
  if (!qa.ok) Object.assign(errors, qa.errors);

  const name = typeof body.name === 'string' ? oneLine(body.name) : '';
  if (!name) errors.name = 'required';
  else if (name.length > 60) errors.name = 'too_long';
  else if (name.length < 2 || !/^[\p{L}][\p{L}\p{M} .'’-]*$/u.test(name)) errors.name = 'name_invalid';

  let phone = null;
  if (typeof body.phone !== 'string' || !body.phone.trim()) errors.phone = 'required';
  else if (!(phone = normalizePhone(body.phone, lang))) errors.phone = 'phone_invalid';

  const contact = body.contact == null || body.contact === '' ? 'call' : body.contact;
  if (!CONTACT_METHODS.includes(contact)) errors.contact = 'invalid';

  let comment = '';
  if (body.comment != null) {
    if (typeof body.comment !== 'string') errors.comment = 'invalid';
    else if ((comment = clean(body.comment)).length > 500) errors.comment = 'too_long';
  }

  if (body.consent !== true) errors.consent = 'consent_required';

  // Ad attribution: utm_* from the landing URL, kept short and printable. Bad values are dropped, not rejected.
  const utm = {};
  if (body.utm && typeof body.utm === 'object') {
    for (const k of UTM_KEYS) {
      const v = body.utm[k];
      if (typeof v === 'string' && v && v.length <= 100) utm[k] = oneLine(v);
    }
  }
  const page = typeof body.page === 'string' && body.page.length <= 200 && body.page.startsWith('/') ? oneLine(body.page) : '/';

  if (Object.keys(errors).length) return { ok: false, errors };
  const currency = CURRENCY[lang];
  return {
    ok: true,
    lead: { lang, name, phone, contact, comment, answers: qa.value, estimate: estimate(qa.value, currency), utm, page },
  };
}
