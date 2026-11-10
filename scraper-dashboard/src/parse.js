// HTML parser for listing pages of books.toscrape.com (a public sandbox built for scraping practice).
// No DOM in Workers, so it uses small, anchored regexes over each <article class="product_pod"> block.
// To point the monitor at another site, write a parser with the same output shape
// ({ category, total, items: [{ id, title, url, image, price_cents, currency, in_stock, rating }], next }).

export const DEFAULT_BASE = 'https://books.toscrape.com/';

const RATING = { One: 1, Two: 2, Three: 3, Four: 4, Five: 5 };

export function categoryUrl(slug, base = DEFAULT_BASE) {
  return new URL(`catalogue/category/books/${slug}/index.html`, base).href;
}

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html" -> "a-light-in-the-attic_1000"
export function itemIdFromUrl(url) {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  if (parts[parts.length - 1] === 'index.html') parts.pop();
  return parts[parts.length - 1] || url;
}

function parsePrice(text) {
  const m = String(text).match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!m) return null;
  return Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
}

function parseCurrency(text) {
  const t = String(text).replace(/Â/g, ''); // "Â£" when a UTF-8 page is read as Latin-1
  if (t.includes('£')) return 'GBP';
  if (t.includes('€')) return 'EUR';
  if (t.includes('$')) return 'USD';
  if (t.includes('₽')) return 'RUB';
  return 'GBP';
}

export function parseProduct(block, pageUrl) {
  const link = block.match(/<h3>\s*<a\s+href="([^"]+)"[^>]*?title="([^"]*)"/i);
  const priceTag = block.match(/<p class="price_color">([^<]*)<\/p>/i);
  if (!link || !priceTag) return null;
  const url = new URL(link[1], pageUrl).href;
  const price_cents = parsePrice(priceTag[1]);
  if (price_cents == null) return null;
  const rating = block.match(/class="star-rating\s+(\w+)"/i);
  const avail = block.match(/<p class="([^"]*availability[^"]*)">([\s\S]*?)<\/p>/i);
  const availText = avail ? avail[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase() : '';
  const in_stock = avail
    ? (/\binstock\b/.test(avail[1]) || availText.startsWith('in stock')) && !/out of stock|outofstock/.test(avail[1] + ' ' + availText)
    : true;
  const img = block.match(/<img\s+src="([^"]+)"/i);
  return {
    id: itemIdFromUrl(url),
    title: decodeEntities(link[2]).trim(),
    url,
    image: img ? new URL(img[1], pageUrl).href : null,
    price_cents,
    currency: parseCurrency(priceTag[1]),
    in_stock: in_stock ? 1 : 0,
    rating: rating ? RATING[rating[1]] || null : null,
  };
}

export function parseListing(html, pageUrl) {
  const header = html.match(/<div class="page-header action">\s*<h1>([^<]*)<\/h1>/i);
  const total = html.match(/<strong>(\d+)<\/strong>\s*results?/i);
  const blocks = html.split(/<article class="product_pod">/i).slice(1).map((b) => b.split(/<\/article>/i)[0]);
  const items = [];
  let skipped = 0;
  for (const b of blocks) {
    const it = parseProduct(b, pageUrl);
    if (it) items.push(it);
    else skipped++;
  }
  const next = html.match(/<li class="next">\s*<a href="([^"]+)"/i);
  return {
    category: header ? decodeEntities(header[1]).trim() : null,
    total: total ? Number(total[1]) : null,
    items,
    skipped,
    next: next ? new URL(next[1], pageUrl).href : null,
  };
}
