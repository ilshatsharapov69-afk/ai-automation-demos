// Offline preview of the dashboard: no Cloudflare account, no internet.
// Seeds an in-memory D1 stand-in (node:sqlite) with a week of 6-hourly runs over the saved pages in
// test/fixtures (demo drift on), then serves public/ + the real Worker API on http://127.0.0.1:8787.
//
//   npm run demo                 -> http://127.0.0.1:8787  (RU: /?lang=ru)
//   node scripts/local.mjs --port 9000 --runs 40
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { D1Sqlite } from '../test/d1-sqlite.mjs';
import { fixtureFetch } from '../test/fixture-fetch.mjs';
import { runMonitor } from '../src/monitor.js';
import { handleApi } from '../src/api.js';

const ROOT = new URL('../', import.meta.url);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const H6 = 6 * 3600000;

export async function startLocal({ port = 8787, runs = 28, now = Date.now(), quiet = false } = {}) {
  const env = {
    DB: new D1Sqlite().migrate(new URL('migrations/', ROOT)),
    DEMO_DRIFT: 'on',
    ADMIN_KEY: 'local',
    ALERT_LANG: 'en',
  };
  const fetchFn = fixtureFetch();
  const first = Math.floor((now - (runs - 1) * H6 - 3600000) / H6) * H6 + 17 * 60000; // runs every 6 hours
  let last;
  for (let i = 0; i < runs; i++) last = await runMonitor(env, { fetchFn, now: first + i * H6 });
  const clock = { now };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        const r = await handleApi(new Request(url, { method: req.method, headers: req.headers }), env, { now: clock.now, fetchFn });
        res.writeHead(r.status, Object.fromEntries(r.headers));
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (path.includes('..')) throw Object.assign(new Error('bad path'), { code: 'ENOENT' });
      const body = await readFile(new URL(`public/${path}`, ROOT));
      res.writeHead(200, { 'Content-Type': TYPES[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
      res.end(e.code === 'ENOENT' ? 'Not found' : String(e.stack || e));
    }
  });
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  if (!quiet) {
    console.log(`Seeded ${runs} runs (last: #${last.runId}, ${last.items} items). Dashboard: ${base}  (RU: ${base}/?lang=ru)`);
    console.log(`Manual run: curl -X POST "${base}/api/run?key=local"`);
  }
  return { server, base, env, close: () => new Promise((ok) => server.close(ok)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, d) => (process.argv.includes(name) ? Number(process.argv[process.argv.indexOf(name) + 1]) : d);
  await startLocal({ port: arg('--port', 8787), runs: arg('--runs', 28) });
}
