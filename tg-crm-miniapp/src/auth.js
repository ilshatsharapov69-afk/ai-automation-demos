// Telegram Mini App initData validation (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
// secret_key = HMAC_SHA256(key = "WebAppData", data = bot_token)
// hash       = hex(HMAC_SHA256(key = secret_key, data = data_check_string))
// data_check_string = every received field except `hash`, as "key=value", sorted by key, joined by "\n".
// Uses only WebCrypto, so it runs the same in the Worker and in Node (tests).

const enc = new TextEncoder();

export async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function dataCheckString(params) {
  return [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

async function signature(params, botToken) {
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  return toHex(await hmac(secret, dataCheckString(params)));
}

/**
 * Validate the raw initData string (window.Telegram.WebApp.initData).
 * Returns { ok: true, user, authDate, startParam } or { ok: false, error }.
 */
export async function validateInitData(initData, botToken, { maxAgeSec = 86400, now = Date.now() } = {}) {
  if (!botToken) return { ok: false, error: 'no_bot_token' };
  if (!initData || typeof initData !== 'string' || initData.length > 4096) return { ok: false, error: 'missing' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash') || '';
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, error: 'no_hash' };
  if (!safeEqual(await signature(params, botToken), hash)) return { ok: false, error: 'bad_hash' };

  const authDate = Number(params.get('auth_date'));
  const nowSec = Math.floor(now / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, error: 'no_auth_date' };
  if (nowSec - authDate > maxAgeSec) return { ok: false, error: 'expired' };
  if (authDate - nowSec > 300) return { ok: false, error: 'future_auth_date' };

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return { ok: false, error: 'bad_user' };
  }
  if (!user || !Number.isSafeInteger(user.id)) return { ok: false, error: 'no_user' };
  return { ok: true, user, authDate, startParam: params.get('start_param') || null };
}

/** Build a signed initData string the way Telegram does. Used by tests and the local preview server. */
export async function signInitData(fields, botToken) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  params.set('hash', await signature(params, botToken));
  return params.toString();
}
