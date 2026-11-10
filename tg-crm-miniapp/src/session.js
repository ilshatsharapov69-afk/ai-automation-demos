// Browser demo mode: a visitor who opens the app in a normal browser (no Telegram initData) gets a private sandbox.
// The session is an HttpOnly cookie "sb" = "<12 hex random id>.<hex HMAC-SHA256(SESSION_SECRET, 'sb1.' + id)>".
// The id maps to a NEGATIVE tg_id, so it can never collide with a real Telegram user (their ids are positive).
import { hmac, toHex, safeEqual } from './auth.js';

const enc = new TextEncoder();
export const COOKIE = 'sb';
export const SESSION_MAX_AGE = 7 * 86400; // seconds; the same 7 days after which a sandbox is deleted

const sign = async (id, secret) => toHex(await hmac(enc.encode(secret), `sb1.${id}`));

export async function issueSession(secret) {
  const id = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { id, cookie: `${id}.${await sign(id, secret)}` };
}

/** Returns the session id for a valid cookie value, or null (missing, malformed or tampered). */
export async function verifySession(value, secret) {
  if (!secret || typeof value !== 'string') return null;
  const m = /^([0-9a-f]{12})\.([0-9a-f]{64})$/.exec(value);
  if (!m) return null;
  return safeEqual(await sign(m[1], secret), m[2]) ? m[1] : null;
}

export function readCookie(req, name = COOKIE) {
  for (const part of (req.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export const setCookieHeader = (value, secure) =>
  `${COOKIE}=${value}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

/** The pseudo Telegram user of a browser visitor. */
export function browserUser(id, acceptLanguage = '') {
  const ru = /^\s*ru/i.test(acceptLanguage);
  return { id: -(parseInt(id, 16) + 1), first_name: ru ? 'Ирина' : 'Alex', last_name: ru ? 'Ковалёва' : 'Morgan', username: null, language_code: ru ? 'ru' : 'en' };
}
