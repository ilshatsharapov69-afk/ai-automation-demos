// Test harness: the real Worker (src/worker.js) on an in-memory SQLite D1, Telegram calls captured in env.TG_OUTBOX.
import worker from '../src/worker.js';
import { signInitData } from '../src/auth.js';
import { D1Sqlite } from '../scripts/d1-sqlite.mjs';

export const BOT_TOKEN = '7000000001:AAFakeTokenForOfflineTests_0123456789';
export const SECRET = 'webhook-secret-for-tests';
export const ORIGIN = 'https://crm.example.workers.dev';

export const ANNA = { id: 501, first_name: 'Anna', last_name: 'Test', username: 'anna_test', language_code: 'en' };
export const BORIS = { id: 502, first_name: 'Борис', username: 'boris_test', language_code: 'ru' };

export function makeEnv(extra = {}) {
  const DB = new D1Sqlite().migrate(new URL('../migrations/', import.meta.url));
  const assets = [];
  return {
    DB,
    BOT_TOKEN,
    WEBHOOK_SECRET: SECRET,
    SESSION_SECRET: 'session-secret-for-tests',
    DEMO_MODE: 'on',
    CURRENCY: 'USD',
    DIGEST_HOUR: '9',
    TG_OUTBOX: [],
    ASSETS: { fetch: async (req) => { assets.push(new URL(req.url).pathname); return new Response('<!doctype html><title>CRM</title>', { headers: { 'Content-Type': 'text/html' } }); } },
    _assets: assets,
    ...extra,
  };
}

export async function initDataFor(user, { authDate = Math.floor(Date.now() / 1000), token = BOT_TOKEN, extra = {} } = {}) {
  return signInitData({ query_id: 'AAH-test', user, auth_date: authDate, ...extra }, token);
}

/** Call the API as a Telegram user (signed initData), or with a raw Authorization header. */
export async function api(env, method, path, { user = ANNA, body, auth, initExtra } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const a = auth !== undefined ? auth : `tma ${await initDataFor(user, { extra: initExtra })}`;
  if (a) headers.Authorization = a;
  const res = await worker.fetch(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

let updateId = 1;
/** Send a Telegram message update to the webhook; returns the bot calls it produced. */
export async function say(env, user, text, { secret = SECRET } = {}) {
  const before = env.TG_OUTBOX.length;
  const update = { update_id: updateId++, message: { message_id: updateId, date: Math.floor(Date.now() / 1000), chat: { id: user.id, type: 'private' }, from: user, text } };
  const res = await worker.fetch(new Request(`${ORIGIN}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) },
    body: JSON.stringify(update),
  }), env);
  return { status: res.status, out: env.TG_OUTBOX.slice(before) };
}

/** Call the API like a plain browser: no initData, an optional "sb" cookie. Returns the Set-Cookie value too. */
export async function browserApi(env, method, path, { cookie, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (cookie) h.Cookie = `sb=${cookie}`;
  const res = await worker.fetch(new Request(ORIGIN + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  const set = res.headers.get('Set-Cookie');
  return { status: res.status, data, setCookie: set, cookie: set ? /^sb=([^;]+)/.exec(set)[1] : null };
}
