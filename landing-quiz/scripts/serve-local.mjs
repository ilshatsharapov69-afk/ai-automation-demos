// Local run without wrangler or a Cloudflare account: serves public/ and sends /api/* and /admin* to the real
// Worker code, with node:sqlite standing in for D1. Telegram is faked: the cards the owner would get are printed
// and kept at GET /__outbox. Used for the screenshots; also handy for a quick look.
//
//   node scripts/serve-local.mjs [--port 8788] [--db .local-leads.sqlite]
//   open http://127.0.0.1:8788/   leads table: http://127.0.0.1:8788/admin  (password: demo)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { createD1 } from '../test/helpers/d1.mjs';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const PORT = Number(arg('--port', 8788));
const root = fileURLToPath(new URL('../public/', import.meta.url));
const env = {
  DB: createD1(arg('--db', ':memory:')),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'demo',
  TG_BOT_TOKEN: 'local-fake-token',
  TG_CHAT_ID: '1',
  OWNER_LANG: process.env.OWNER_LANG || 'ru',
  TIME_ZONE: process.env.TIME_ZONE || 'UTC',
  RATE_LIMIT_PER_HOUR: '50',
  DEMO_MODE: process.env.DEMO_MODE ?? '0',
};

const outbox = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.telegram.org/')) {
    const body = JSON.parse(init.body);
    outbox.push(body);
    console.log(`\n--- Telegram card to chat ${body.chat_id} ---\n${body.text}\n`);
    return Response.json({ ok: true, result: { message_id: outbox.length } });
  }
  return realFetch(url, init);
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
async function staticFile(pathname) {
  // Normalise the URL path in posix style first: on Windows path.normalize turns "/" into a backslash, which hid the home page (404).
  let p = posix.normalize(decodeURIComponent(pathname));
  if (p.endsWith('/')) p += 'index.html';
  const file = resolve(root, `.${p}`);
  if (!file.startsWith(resolve(root)) || p.includes('_headers')) return null;
  try {
    if ((await stat(file)).isDirectory()) return null;
    return { body: await readFile(file), type: TYPES[extname(file)] || 'application/octet-stream' };
  } catch { return null; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/__outbox') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(outbox)); return; }
  if (req.method === 'GET' && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/admin')) {
    const f = await staticFile(url.pathname);
    if (f) { res.writeHead(200, { 'Content-Type': f.type }); res.end(f.body); return; }
    const html = !extname(url.pathname) && !url.pathname.endsWith('/') && (await staticFile(`${url.pathname}.html`)); // /privacy -> privacy.html, as on Workers
    if (html) { res.writeHead(200, { 'Content-Type': html.type }); res.end(html.body); return; }
    if (!extname(url.pathname) && !url.pathname.endsWith('/')) { res.writeHead(307, { Location: url.pathname + '/' }); res.end(); return; }
    const nf = await staticFile('/404.html');
    res.writeHead(404, { 'Content-Type': nf.type }); res.end(nf.body); return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  headers.set('CF-Connecting-IP', req.socket.remoteAddress || '127.0.0.1');
  const waits = [];
  const r = await worker.fetch(new Request(url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), env, { waitUntil: (p) => waits.push(p), passThroughOnException() {} });
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
  await Promise.all(waits);
}).listen(PORT, '127.0.0.1', () => console.log(`Local demo: http://127.0.0.1:${PORT}/  (RU: /ru/, leads: /admin, password "${env.ADMIN_PASSWORD}")`));
