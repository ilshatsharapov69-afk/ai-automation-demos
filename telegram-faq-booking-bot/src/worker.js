// Cloudflare Worker entry: Telegram webhook at POST /webhook.
// Without BOT_TOKEN (local test) nothing goes to Telegram: every outgoing Bot API call is returned
// in the HTTP response as {outbox: [...]}, so a fake update produces a readable transcript.
import { handleUpdate } from './bot.js';

function makeTg(env, outbox) {
  return async function tg(method, payload) {
    if (!env.BOT_TOKEN) {
      outbox.push({ method, ...payload });
      return { ok: true, result: { message_id: 1000 + outbox.length } };
    }
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({ ok: false }));
    if (!j.ok) console.error('tg', method, r.status, JSON.stringify(j).slice(0, 300));
    return j;
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/') return new Response('demo bot: ok');
    if (req.method !== 'POST' || url.pathname !== '/webhook') return new Response('not found', { status: 404 });

    // In production the webhook must carry the secret set with setWebhook(secret_token=...).
    if (env.BOT_TOKEN) {
      if (!env.WEBHOOK_SECRET) return new Response('WEBHOOK_SECRET is not set', { status: 500 });
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
    }

    let update;
    try {
      update = await req.json();
    } catch {
      return new Response('bad json', { status: 400 });
    }
    const outbox = [];
    try {
      await handleUpdate(update, { env, tg: makeTg(env, outbox) });
    } catch (e) {
      console.error('update failed', e && e.stack ? e.stack : e);
      if (!env.BOT_TOKEN) return Response.json({ error: String(e && e.stack ? e.stack : e), outbox }, { status: 500 });
      // Answer 200 anyway so Telegram does not retry the same update in a loop.
    }
    return env.BOT_TOKEN ? new Response('ok') : Response.json({ outbox });
  },
};
