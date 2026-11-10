// Cloudflare Worker entry.
//   POST /webhook  Telegram updates (checked against WEBHOOK_SECRET)
//   GET  /health   liveness
//   cron           publishes due posts, paid-access reminders and expiry (every 5 minutes)
import { handleUpdate, runCron, makeTg } from './bot.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/webhook') {
      if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
      if (!env.WEBHOOK_SECRET) return new Response('WEBHOOK_SECRET is not set', { status: 500 });
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      let update;
      try {
        update = await req.json();
      } catch {
        return new Response('bad json', { status: 400 });
      }
      try {
        await handleUpdate(update, { env, tg: makeTg(env) });
      } catch (e) {
        console.error('update failed', e && e.stack ? e.stack : e);
        // Still 200, so Telegram does not redeliver the same update in a loop.
      }
      return new Response('ok');
    }
    if (url.pathname === '/health') return new Response('ok');
    return new Response('Channel autopost bot. Talk to it in Telegram.', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runCron(env, { tg: makeTg(env), now: controller?.scheduledTime || Date.now() }).then((s) => console.log('cron', JSON.stringify(s))));
  },
};
