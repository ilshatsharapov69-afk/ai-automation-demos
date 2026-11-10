// Cloudflare Worker: the page, the JSON API (ask, documents, status) and nothing else.
// Ingestion is a local script (scripts/ingest.mjs), not a route.
import { DOCS, EXAMPLES } from '../data/docs.js';
import { handleAsk, cfg, nowOf } from './answer.js';
import { retrieve } from './retrieve.js';
import { peek, sha256Hex } from './limits.js';
import { page } from './web.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const isAdmin = (request, env) => !!env.ADMIN_KEY && request.headers.get('X-Admin-Key') === env.ADMIN_KEY;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      if (request.method === 'GET' && pathname === '/') {
        return new Response(page({ examples: EXAMPLES }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
      }

      if (request.method === 'POST' && pathname === '/api/ask') {
        let data;
        try { data = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const ip = request.headers.get('CF-Connecting-IP') || 'local';
        const r = await handleAsk(env, { question: data?.question, ip, admin: isAdmin(request, env) });
        return json(r.body, r.status);
      }

      if (request.method === 'GET' && pathname === '/api/docs') {
        const { results } = await env.DB.prepare('SELECT d.id, d.lang, d.category, d.title, length(d.body) AS chars, (SELECT COUNT(*) FROM chunks c WHERE c.doc_id = d.id) AS chunks FROM docs d ORDER BY d.id').all();
        return json({ docs: results });
      }

      const m = /^\/api\/docs\/([a-z0-9]+)$/.exec(pathname);
      if (request.method === 'GET' && m) {
        const doc = await env.DB.prepare('SELECT id, lang, category, title, body FROM docs WHERE id = ?').bind(m[1]).first();
        if (!doc) return json({ error: 'not_found' }, 404);
        const { results } = await env.DB.prepare('SELECT id, idx, heading, start, "end" AS end FROM chunks WHERE doc_id = ? ORDER BY idx').bind(doc.id).all();
        return json({ ...doc, chunks: results });
      }

      if (request.method === 'GET' && pathname === '/api/status') {
        const c = cfg(env);
        const ipHash = await sha256Hex(`${env.ADMIN_KEY || 'demo'}|${request.headers.get('CF-Connecting-IP') || 'local'}`);
        const left = await peek(env.DB, { ipHash, now: nowOf(env), perIp: c.perIp, daily: c.daily });
        const counts = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM docs) AS docs, (SELECT COUNT(*) FROM chunks) AS chunks').first();
        return json({ ...counts, per_ip_hourly: c.perIp, daily_cap: c.daily, ...left, embed_model: env.EMBED_MODEL, chat_model: c.chatModel, min_vector: c.minVector });
      }

      // Retrieval without generation, for the eval script. Admin only, so it cannot be used as a free embedding API.
      if (request.method === 'GET' && pathname === '/api/search') {
        if (!isAdmin(request, env)) return json({ error: 'forbidden' }, 403);
        const r = await retrieve(env, url.searchParams.get('q') || '');
        return json(r);
      }

      if (pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return json({ error: 'server_error' }, 500);
    }
  },
};
