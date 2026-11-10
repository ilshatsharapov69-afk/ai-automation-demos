// Refreshes test/fixtures from the live practice site (needs internet). Run it once on a machine that can reach
// books.toscrape.com, then `npm test` again: the parser tests then run against the site's current HTML.
//   npm run fixtures
import { writeFileSync } from 'node:fs';
import { categoryUrl, parseListing } from '../src/parse.js';
import { DEFAULT_CATEGORIES } from '../src/monitor.js';

const out = new URL('../test/fixtures/', import.meta.url);
for (const slug of DEFAULT_CATEGORIES.split(',')) {
  let url = categoryUrl(slug);
  while (url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'scraper-dashboard-demo/1.0 (fixtures)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    const html = await res.text();
    const name = `${slug}-${url.split('/').pop().replace('.html', '')}.html`;
    writeFileSync(new URL(name, out), html);
    const page = parseListing(html, url);
    console.log(`${name}: ${page.items.length} products (${page.category}, ${page.total} total)`);
    url = page.next;
    await new Promise((r) => setTimeout(r, 500)); // be polite
  }
}
console.log('Done. Item counts in test/*.test.mjs assume 11 / 32 / 19 books; adjust them if the site changed.');
