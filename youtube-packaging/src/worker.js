// Cloudflare Worker: serves the static tool (public/, via the ASSETS binding) and one API route.
//   POST /api/package  {text, keyword?, lang?: 'auto'|'en'|'ru'}  -> packaging JSON (see src/package.js)
//   GET  /api/health                                               -> {ok, ai}
// The outlier calculator runs fully in the browser (public/lib/outliers.js), so it needs no API.
//
// AI answers are reused for identical input (the built-in samples, double clicks), so they do not spend the
// free Workers AI allowance twice:
//  1) in the memory of the running Worker instance (works everywhere, including *.workers.dev);
//  2) in the Cache API for a day (only effective on a custom domain; on *.workers.dev it does nothing).
import { buildPackage, MAX_INPUT } from './package.js';

const CACHE_TTL = 86400;
const DEFAULT_IP_HOUR = 5;
const DEFAULT_GLOBAL_DAY = 60;
const MEMORY_MAX = 50;
const MEMORY = new Map(); // key -> {at, body}; per Worker instance, oldest dropped first

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
});

async function hashKey(input, model) {
  const bytes = new TextEncoder().encode(JSON.stringify([input.text, input.keyword, input.lang, model]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * AI spend guard (D1 table ai_usage). Counts one AI call for this visitor (per hour) and for everybody (per day).
 * Returns {ok:true, ipLeft, dayLeft} or {ok:false, reason:'ai_ip_limit'|'ai_day_limit'}.
 * No D1 binding or a D1 error means "no AI" (fail closed): the offline generator answers instead.
 */
export async function takeAiTicket(request, env, now = Date.now()) {
  if (!env.DB) return { ok: false, reason: 'ai_day_limit' };
  const ipMax = Number(env.AI_PER_IP_HOUR) || DEFAULT_IP_HOUR;
  const dayMax = Number(env.AI_GLOBAL_DAY) || DEFAULT_GLOBAL_DAY;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const hour = Math.floor(now / 3600000);
  const day = new Date(now).toISOString().slice(0, 10);
  const ipHash = (await sha256(`vp-demo|${ip}`)).slice(0, 16);
  const bump = async (k) => (await env.DB.prepare(
    'INSERT INTO ai_usage (k, n, at) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n',
  ).bind(k, now).first())?.n ?? 0;
  try {
    const mine = await bump(`ip:${ipHash}:${hour}`);
    if (mine > ipMax) return { ok: false, reason: 'ai_ip_limit' };
    const all = await bump(`day:${day}`);
    if (all > dayMax) return { ok: false, reason: 'ai_day_limit' };
    if (all % 10 === 1) await env.DB.prepare('DELETE FROM ai_usage WHERE at < ?1').bind(now - 2 * 86400000).run();
    return { ok: true, ipLeft: ipMax - mine, ipMax, dayLeft: dayMax - all };
  } catch (e) {
    console.error('ai ticket failed', String(e));
    return { ok: false, reason: 'ai_day_limit' };
  }
}

async function sha256(str) {
  const bytes = new TextEncoder().encode(str);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function memGet(memory, key) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL * 1000) { memory.delete(key); return null; }
  return hit.body;
}

function memPut(memory, key, body) {
  memory.delete(key);
  memory.set(key, { at: Date.now(), body });
  while (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value);
}

/**
 * @param {Request} request
 * @param {{AI?: any, AI_MODEL?: string, AI_ENABLED?: string, ASSETS?: {fetch: Function}}} env
 * @param {{cache?: object|null, memory?: Map}} [deps] overrides for tests (default: caches.default, module memory)
 */
export async function handle(request, env, deps = {}) {
  const url = new URL(request.url);
  const aiOn = !!env.AI && env.AI_ENABLED !== 'off';

  if (url.pathname === '/api/health') return json({ ok: true, ai: aiOn });

  if (url.pathname === '/api/package') {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
    const text = String(body?.text ?? '').trim();
    if (!text) return json({ error: 'empty' }, 400);
    if (text.length > MAX_INPUT) return json({ error: 'too_long', max: MAX_INPUT }, 413);
    const input = { text, keyword: String(body.keyword ?? '').slice(0, 80), lang: ['en', 'ru'].includes(body.lang) ? body.lang : 'auto' };

    // Without AI the answer is computed locally in milliseconds: nothing worth caching.
    if (!aiOn) return json(await buildPackage(input, { aiEnabled: false }));

    const memory = deps.memory ?? MEMORY;
    const cache = 'cache' in deps ? deps.cache : globalThis.caches?.default;
    const key = await hashKey(input, env.AI_MODEL);
    const cacheReq = new Request(`https://video-packager.cache/v1/${key}`);

    let saved = memGet(memory, key);
    if (!saved && cache) {
      const hit = await cache.match(cacheReq);
      if (hit) { saved = await hit.text(); memPut(memory, key, saved); }
    }
    if (saved) return json({ ...JSON.parse(saved), cached: true });

    const ticket = await takeAiTicket(request, env);
    if (!ticket.ok) {
      const offline = await buildPackage(input, { aiEnabled: false });
      return json({ ...offline, note: ticket.reason });
    }
    const result = await buildPackage(input, { ai: env.AI, model: env.AI_MODEL, aiEnabled: true });
    result.quota = { ipLeft: ticket.ipLeft, ipMax: ticket.ipMax };
    if (result.source === 'ai') { // a stub answer means the AI failed: try the AI again next time
      const { quota, ...plain } = result;
      const str = JSON.stringify(plain);
      memPut(memory, key, str);
      if (cache) await cache.put(cacheReq, new Response(str, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_TTL}` } }));
    }
    return json(result);
  }

  if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
  if (env.ASSETS) return env.ASSETS.fetch(request);
  return new Response('Not found', { status: 404 });
}

export default {
  fetch: (request, env) => handle(request, env),
};
