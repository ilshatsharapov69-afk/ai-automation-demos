// Cloudflare Worker entry.
//   /api/*        JSON API for the Mini App (initData-authenticated)
//   POST /webhook Telegram bot updates (checked against WEBHOOK_SECRET)
//   everything else: the Mini App itself, static files from ./public (Workers static assets)
//   no cron: free-plan Workers have a handful of cron slots, and the browser demo has nobody to message.
//   scheduled()   kept for a later bot deployment: add `[triggers] crons = ["*/15 * * * *"]` to wrangler.toml
import { handleApi } from './api.js';
import { handleUpdate, runCron, makeTg } from './bot.js';

const appUrlOf = (env, url) => (env.APP_URL || (url ? url.origin : '')).replace(/\/+$/, '');

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return handleApi(req, env, { appUrl: appUrlOf(env, url) });

    if (url.pathname === '/webhook') {
      if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
      if (!env.WEBHOOK_SECRET) return new Response('not found', { status: 404 }); // no bot wired to this deployment
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      let update;
      try {
        update = await req.json();
      } catch {
        return new Response('bad json', { status: 400 });
      }
      try {
        await handleUpdate(update, { env, tg: makeTg(env), appUrl: appUrlOf(env, url) });
      } catch (e) {
        console.error('update failed', e && e.stack ? e.stack : e);
        // Still 200, so Telegram does not redeliver the same update in a loop.
      }
      return new Response('ok');
    }

    if (url.pathname === '/health') return new Response('ok');
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('not found', { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runCron(env, { tg: makeTg(env), appUrl: appUrlOf(env) }).then((s) => console.log('cron', JSON.stringify(s))));
  },
};
