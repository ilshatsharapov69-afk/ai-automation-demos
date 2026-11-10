import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseListing, categoryUrl, decodeEntities, itemIdFromUrl } from '../src/parse.js';
import { FIXTURES } from './fixture-fetch.mjs';

const read = (f) => readFileSync(new URL(f, FIXTURES), 'utf8');

test('category page: all products, absolute links, decoded titles', () => {
  const url = categoryUrl('travel_2');
  assert.equal(url, 'https://books.toscrape.com/catalogue/category/books/travel_2/index.html');
  const page = parseListing(read('travel_2-index.html'), url);
  assert.equal(page.category, 'Travel');
  assert.equal(page.total, 11);
  assert.equal(page.items.length, 11);
  assert.equal(page.skipped, 0);
  assert.equal(page.next, null);
  assert.deepEqual(page.items[0], {
    id: 'its-only-the-himalayas_981',
    title: "It's Only the Himalayas",
    url: 'https://books.toscrape.com/catalogue/its-only-the-himalayas_981/index.html',
    image: page.items[0].image,
    price_cents: 4517,
    currency: 'GBP',
    in_stock: 1,
    rating: 2,
  });
  assert.match(page.items[0].image, /^https:\/\/books\.toscrape\.com\/media\/cache\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{32}\.jpg$/);
  // the full title comes from the title attribute, not the truncated link text
  assert.ok(page.items.some((i) => i.title === 'See America: A Celebration of Our National Parks & Treasured Sites'));
});

test('pagination: next link is resolved, page 2 parses', () => {
  const p1 = parseListing(read('mystery_3-index.html'), categoryUrl('mystery_3'));
  assert.equal(p1.items.length, 20);
  assert.equal(p1.total, 32);
  assert.equal(p1.next, 'https://books.toscrape.com/catalogue/category/books/mystery_3/page-2.html');
  const p2 = parseListing(read('mystery_3-page-2.html'), p1.next);
  assert.equal(p2.items.length, 12);
  assert.equal(p2.next, null);
  assert.equal(new Set([...p1.items, ...p2.items].map((i) => i.id)).size, 32);
});

test('every fixture product has a price, rating 1-5 and a stock flag', () => {
  for (const f of ['travel_2-index.html', 'mystery_3-index.html', 'mystery_3-page-2.html', 'classics_6-index.html']) {
    const { items } = parseListing(read(f), categoryUrl('x'));
    for (const it of items) {
      assert.ok(it.price_cents > 0, `${f} ${it.id} price`);
      assert.ok(it.rating >= 1 && it.rating <= 5, `${f} ${it.id} rating`);
      assert.ok(it.in_stock === 0 || it.in_stock === 1);
    }
  }
});

test('out of stock, mojibake pound sign, missing rating, broken product', () => {
  const html = `<div class="page-header action"><h1>Test</h1></div>
  <article class="product_pod"><p class="star-rating Five"></p>
    <h3><a href="../../../x_1/index.html" title="Gone &amp; Back">Gone</a></h3>
    <p class="price_color">Â£1,234.50</p><p class="outofstock availability"><i class="icon-remove"></i> Out of stock</p></article>
  <article class="product_pod"><h3><a href="../../../y_2/index.html" title="No rating">No</a></h3>
    <p class="price_color">£9.99</p></article>
  <article class="product_pod"><h3>no link here</h3><p class="price_color">£1.00</p></article>
  <ul class="pager"><li class="next"><a href="page-3.html">next</a></li></ul>`;
  const page = parseListing(html, 'https://books.toscrape.com/catalogue/category/books/test_9/page-2.html');
  assert.equal(page.items.length, 2);
  assert.equal(page.skipped, 1);
  assert.deepEqual([page.items[0].title, page.items[0].price_cents, page.items[0].in_stock, page.items[0].rating], ['Gone & Back', 123450, 0, 5]);
  assert.deepEqual([page.items[1].rating, page.items[1].in_stock], [null, 1]);
  assert.equal(page.next, 'https://books.toscrape.com/catalogue/category/books/test_9/page-3.html');
});

test('a page without products (layout change, error page) yields nothing', () => {
  const page = parseListing('<html><body><h1>503 Service Unavailable</h1></body></html>', categoryUrl('travel_2'));
  assert.deepEqual([page.items.length, page.next, page.category], [0, null, null]);
});

test('helpers', () => {
  assert.equal(decodeEntities('Tom &amp; Jerry&#39;s &quot;x&quot; &#x2014; &lt;b&gt;'), 'Tom & Jerry\'s "x" — <b>');
  assert.equal(itemIdFromUrl('https://books.toscrape.com/catalogue/sharp-objects_997/index.html'), 'sharp-objects_997');
});
