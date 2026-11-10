// Test harness: the real Worker (src/worker.js) on an in-memory SQLite D1; Telegram calls are captured in env.TG_OUTBOX.
import worker from '../src/worker.js';
import { D1Sqlite } from '../scripts/d1-sqlite.mjs';

export const SECRET = 'webhook-secret-for-tests';
export const ORIGIN = 'https://autopost.example.workers.dev';
// A fixed "now": Thu 2026-11-05 10:20 UTC.
export const NOW = Date.UTC(2026, 10, 5, 10, 20);

export const ANNA = { id: 501, first_name: 'Anna', username: 'anna_test', language_code: 'en' };
export const BORIS = { id: 502, first_name: 'Борис', username: 'boris_test', language_code: 'ru' };
export const VIKA = { id: 503, first_name: 'Vika', username: 'vika_reader', language_code: 'en' };

export function makeEnv(extra = {}) {
  return {
    DB: new D1Sqlite().migrate(new URL('../migrations/', import.meta.url)),
    WEBHOOK_SECRET: SECRET,
    DEMO_MODE: 'on',
    CURRENCY: 'USD',
    DEFAULT_SLOTS: '09:00,13:00,19:00',
    TZ_OFFSET: '0',
    AI_DAILY_LIMIT: '20',
    TG_OUTBOX: [],
    ...extra,
  };
}

let updateId = 1;
let messageId = 100;

async function post(env, update, { secret = SECRET, now } = {}) {
  const before = env.TG_OUTBOX.length;
  const prev = Date.now;
  if (now) Date.now = () => now;
  try {
    const res = await worker.fetch(new Request(`${ORIGIN}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) },
      body: JSON.stringify(update),
    }), env);
    return { status: res.status, out: env.TG_OUTBOX.slice(before) };
  } finally {
    Date.now = prev;
  }
}

/** A private message from `user`: text, or { photo, caption, caption_entities, entities, text }. */
export function say(env, user, content, opts = {}) {
  const m = typeof content === 'string' ? { text: content } : { ...content };
  if (m.photo && typeof m.photo === 'string') m.photo = [{ file_id: m.photo + '_small', width: 90, height: 90 }, { file_id: m.photo, width: 1280, height: 960 }];
  const message = { message_id: messageId++, date: Math.floor((opts.now || NOW) / 1000), chat: { id: user.id, type: 'private' }, from: user, ...m };
  return post(env, { update_id: updateId++, message }, { now: NOW, ...opts });
}

/** A button press on a bot message. `message` is the bot call that produced the button (from the outbox). */
export function press(env, user, data, message = {}, opts = {}) {
  const msg = { message_id: message.message_id || messageId++, chat: { id: user.id, type: 'private' }, date: Math.floor(NOW / 1000), ...(message.photo ? { photo: [{ file_id: message.photo }] } : { text: message.text || message.caption || '' }) };
  return post(env, { update_id: updateId++, callback_query: { id: `cq${updateId}`, from: user, chat_instance: 'x', message: msg, data } }, { now: NOW, ...opts });
}

export async function cron(env, now) {
  const before = env.TG_OUTBOX.length;
  let job;
  await worker.scheduled({ scheduledTime: now, cron: '*/5 * * * *' }, env, { waitUntil: (p) => { job = p; } });
  await job;
  return env.TG_OUTBOX.slice(before);
}

/** Buttons of a bot call as a flat list of { text, callback_data, url }. */
export const buttons = (call) => (call?.reply_markup?.inline_keyboard || []).flat();
export const btn = (call, label) => buttons(call).find((b) => b.text.includes(label));
export const textOf = (call) => call?.text ?? call?.caption ?? '';
export const sent = (out, method = 'sendMessage') => out.filter((c) => c.method === method);
export const last = (out, pred = () => true) => [...out].reverse().find(pred);
export const postIdOf = (call) => Number((textOf(call).match(/#(\d+)/) || [])[1]);

export const row = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
