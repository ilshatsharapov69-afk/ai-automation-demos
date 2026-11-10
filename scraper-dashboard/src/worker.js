// Price monitor demo: Cloudflare Worker + D1, no cron trigger.
//   dashboard or /api/summary requested and the last run is old -> lazy run in ctx.waitUntil (src/lazy.js)
//   /api/*     -> JSON + CSV for the dashboard
//   everything else -> static dashboard from public/ (Workers static assets)
import { handleApi } from './api.js';
import { maybeRun } from './lazy.js';

const TRIGGER_PATHS = new Set(['/', '/index.html', '/api/summary']);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && TRIGGER_PATHS.has(url.pathname) && ctx?.waitUntil) {
      ctx.waitUntil(maybeRun(env).then((r) => {
        if (r) console.log(`lazy run #${r.runId}: ${r.status}, ${r.items} items, ${r.changes.length} changes`);
      }).catch((e) => console.log(`lazy run failed: ${e.message || e}`)));
    }
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
