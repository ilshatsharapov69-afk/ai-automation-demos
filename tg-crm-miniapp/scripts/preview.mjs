// Local preview with no Cloudflare account and no Telegram: the real Worker on Node + SQLite (in memory).
//   npm run preview          -> http://127.0.0.1:8788   (?lang=ru for a Russian-speaking test user)
// Opened in a plain browser the page runs in browser demo mode (sandbox cookie). /dev/initdata (preview only) serves a signed test initData for the screenshot script.
// Bot messages the Worker would send (digest, reminders) are printed to the console instead.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { signInitData } from '../src/auth.js';
import { D1Sqlite } from './d1-sqlite.mjs';

export const PREVIEW_TOKEN = '7000000009:AAPreviewTokenNotARealBotToken_0000';
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
export const USERS = {
  en: { id: 1001, first_name: 'Alex', last_name: 'Morgan', username: 'alex_demo', language_code: 'en' },
  ru: { id: 1002, first_name: 'Ирина', last_name: 'Ковалёва', username: 'irina_demo', language_code: 'ru' },
};

export function initDataFor(lang = 'en') {
  return signInitData({ query_id: 'AAPreview', user: USERS[lang] || USERS.en, auth_date: Math.floor(Date.now() / 1000) }, PREVIEW_TOKEN);
}

export function startPreview(port = 8788) {
  const outbox = [];
  const env = {
    DB: new D1Sqlite().migrate(new URL('../migrations/', import.meta.url)),
    BOT_TOKEN: PREVIEW_TOKEN,
    WEBHOOK_SECRET: 'preview',
    SESSION_SECRET: 'preview-session-secret',
    DEMO_MODE: 'on',
    CURRENCY: process.env.CURRENCY || 'USD',
    DIGEST_HOUR: '9',
    TG_OUTBOX: outbox,
    ASSETS: {
      async fetch(req) {
        let p = decodeURIComponent(new URL(req.url).pathname);
        if (p.endsWith('/')) p += 'index.html';
        const file = normalize(join(PUBLIC, p));
        if (!file.startsWith(PUBLIC)) return new Response('forbidden', { status: 403 });
        try {
          return new Response(await readFile(file), { headers: { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' } });
        } catch {
          return new Response('not found', { status: 404 });
        }
      },
    },
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/dev/initdata') {
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end(await initDataFor(url.searchParams.get('lang') || 'en'));
        return;
      }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const before = outbox.length;
      const response = await worker.fetch(request, env);
      for (const m of outbox.slice(before)) console.log(`[bot -> ${m.chat_id}] ${m.method}\n${m.text || ''}\n`);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error(e);
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, env, url: `http://127.0.0.1:${server.address().port}` })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { url } = await startPreview(Number(process.env.PORT || 8788));
  console.log(`Mini App preview: ${url}/   (Russian test user: ${url}/?lang=ru)`);
}
