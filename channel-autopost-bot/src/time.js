// Time helpers. Everything is stored in UTC milliseconds; a workspace has a fixed UTC offset in minutes (`tz`).
// No Intl/ICU dependency, so output is identical in workerd, Node and tests.

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

const DOW = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], ru: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] };
const MON = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
};
const pad = (n) => String(n).padStart(2, '0');

/** Wall-clock parts of `ms` at UTC offset `tz` (minutes). */
export function local(ms, tz = 0) {
  const d = new Date(ms + tz * MIN);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), dow: d.getUTCDay() };
}

/** UTC ms of a local wall-clock time. */
export function fromLocal(y, m, d, hh, mm, tz = 0) {
  return Date.UTC(y, m, d, hh, mm) - tz * MIN;
}

/** Start of the local day containing `ms`, as UTC ms. */
export function dayStart(ms, tz = 0) {
  const p = local(ms, tz);
  return fromLocal(p.y, p.m, p.d, 0, 0, tz);
}

export const hhmm = (ms, tz = 0) => { const p = local(ms, tz); return `${pad(p.hh)}:${pad(p.mm)}`; };

/** "Thu 7 Nov, 09:00" / "чт, 7 ноя, 09:00" */
export function fmtWhen(ms, tz = 0, lang = 'en') {
  const p = local(ms, tz);
  const L = lang === 'ru' ? 'ru' : 'en';
  return L === 'ru' ? `${DOW.ru[p.dow]}, ${p.d} ${MON.ru[p.m]}, ${pad(p.hh)}:${pad(p.mm)}` : `${DOW.en[p.dow]} ${p.d} ${MON.en[p.m]}, ${pad(p.hh)}:${pad(p.mm)}`;
}

/** "Thu 7" / "чт 7" (short day label for stats rows) */
export function fmtDay(ms, tz = 0, lang = 'en') {
  const p = local(ms, tz);
  return `${DOW[lang === 'ru' ? 'ru' : 'en'][p.dow]} ${String(p.d).padStart(2, ' ')}`;
}

export const ymd = (ms, tz = 0) => { const p = local(ms, tz); return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`; };

/** "UTC", "UTC+2", "UTC-3:30" */
export function fmtTz(tz) {
  if (!tz) return 'UTC';
  const s = tz > 0 ? '+' : '-';
  const a = Math.abs(tz);
  return `UTC${s}${Math.floor(a / 60)}${a % 60 ? ':' + pad(a % 60) : ''}`;
}

/** "+2", "-3:30", "UTC+05:30", "0" -> minutes; null if invalid. Range UTC-12..UTC+14. */
export function parseTz(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (/^(utc|gmt)?\s*[+-]?0?$/i.test(raw)) return 0;
  const s = raw.replace(/^(utc|gmt)\s*/i, '');
  const m = s.match(/^([+-]?)(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;
  const mins = Number(m[2]) * 60 + Number(m[3] || 0);
  if (m[3] && ![0, 30, 45].includes(Number(m[3]))) return null;
  const v = m[1] === '-' ? -mins : mins;
  return v < -12 * 60 || v > 14 * 60 ? null : v;
}

/** "9:00 18:30", "09:00, 13:00" -> ['09:00','18:30'] sorted, unique; null if any part is invalid or empty. Max 12. */
export function parseSlots(input) {
  const parts = String(input ?? '').split(/[\s,;]+/).filter(Boolean);
  if (!parts.length || parts.length > 12) return null;
  const out = new Set();
  for (const p of parts) {
    const m = p.match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    out.add(`${pad(Number(m[1]))}:${m[2]}`);
  }
  return [...out].sort();
}

export const slotsOf = (str) => parseSlots(str) || ['09:00'];

/**
 * Next publishing slot after `now` that no other scheduled post holds.
 * `taken` is a Set of UTC ms already used. Looks up to 90 days ahead.
 */
export function nextSlot(now, slots, tz = 0, taken = new Set()) {
  const today = dayStart(now, tz);
  for (let i = 0; i < 90; i++) {
    const p = local(today + i * DAY + 12 * HOUR, tz); // midday, safe from DST-like edge cases
    for (const s of slots) {
      const [hh, mm] = s.split(':').map(Number);
      const at = fromLocal(p.y, p.m, p.d, hh, mm, tz);
      if (at > now + MIN && !taken.has(at)) return at;
    }
  }
  return null;
}

/**
 * Owner-typed time -> UTC ms (in the future) or null.
 * Accepts: "18:30" (today, or tomorrow if passed), "tomorrow 9:00" / "завтра 9:00",
 * "07.11 18:30", "7.11.2026 18:30", "2026-11-07 18:30".
 */
export function parseWhen(input, now, tz = 0) {
  const s = String(input ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const t = (str) => { const m = str.match(/^(\d{1,2})[:.](\d{2})$/); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? [Number(m[1]), Number(m[2])] : null; };
  const n = local(now, tz);
  let y = n.y, mo = n.m, d = n.d, time, explicitDate = false;
  let m;
  if ((time = t(s))) {
    // today
  } else if ((m = s.match(/^(tomorrow|завтра) (.+)$/)) && (time = t(m[2]))) {
    const p = local(dayStart(now, tz) + DAY + 12 * HOUR, tz);
    y = p.y; mo = p.m; d = p.d; explicitDate = true;
  } else if ((m = s.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))? (.+)$/)) && (time = t(m[4]))) {
    d = Number(m[1]); mo = Number(m[2]) - 1; y = m[3] ? Number(m[3]) : n.y; explicitDate = true;
  } else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ t](.+)$/)) && (time = t(m[4]))) {
    y = Number(m[1]); mo = Number(m[2]) - 1; d = Number(m[3]); explicitDate = true;
  } else return null;
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  let at = fromLocal(y, mo, d, time[0], time[1], tz);
  const back = local(at, tz);
  if (back.d !== d || back.m !== mo) return null; // 31.02 and similar
  if (at <= now) {
    if (!explicitDate) at += DAY;
    else if (!/\d{4}/.test(s) && /^\d{1,2}\.\d{1,2} /.test(s)) at = fromLocal(y + 1, mo, d, time[0], time[1], tz);
    else return null;
  }
  return at > now + 365 * DAY ? null : at;
}
