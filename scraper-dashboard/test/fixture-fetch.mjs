// Offline stand-in for fetch(): serves saved listing pages from test/fixtures and records Telegram calls.
import { readFileSync, existsSync } from 'node:fs';

export const FIXTURES = new URL('./fixtures/', import.meta.url);

// https://books.toscrape.com/catalogue/category/books/mystery_3/page-2.html -> fixtures/mystery_3-page-2.html
export function fixtureFile(url) {
  const m = new URL(url).pathname.match(/\/catalogue\/category\/books\/([^/]+)\/([^/]+)\.html$/);
  return m ? new URL(`${m[1]}-${m[2]}.html`, FIXTURES) : null;
}

export function fixtureFetch({ transform, fail = [], telegram = [] } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    url = String(url);
    calls.push(url);
    if (url.startsWith('https://api.telegram.org/')) {
      telegram.push({ method: url.split('/').pop(), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, result: { message_id: telegram.length } }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (fail.some((f) => url.includes(f))) return new Response('upstream error', { status: 503 });
    const file = fixtureFile(url);
    if (!file || !existsSync(file)) return new Response('not found', { status: 404 });
    let html = readFileSync(file, 'utf8');
    if (transform) html = transform(html, url);
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  };
  fn.calls = calls;
  fn.telegram = telegram;
  return fn;
}
