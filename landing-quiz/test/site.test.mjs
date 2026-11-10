// Offline checks of the static site: committed pages match the builder, both languages are complete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSite } from '../scripts/build.mjs';
import { STEPS, STEP, estimate, formatRange } from '../public/js/quiz-model.js';
import { UI } from '../src/site/content.mjs';

const pub = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const site = buildSite();

test('public/ is up to date with scripts/build.mjs (run `npm run build` after editing the copy)', () => {
  for (const [f, html] of Object.entries(site)) assert.equal(pub(f), html, `public/${f} is stale`);
});

for (const [file, lang] of [['index.html', 'en'], ['ru/index.html', 'ru']]) {
  test(`${lang} page: every quiz step and option, result, lead form, links`, () => {
    const html = site[file];
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    assert.match(html, /<title>[^<]{20,}<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{50,}">/);
    for (const s of STEPS) {
      assert.ok(html.includes(`data-step="${s.id}"`), `step ${s.id}`);
      assert.ok(html.includes(s.title[lang]), `title of ${s.id}`);
      for (const o of s.options || []) assert.ok(html.includes(`name="${s.id}" value="${o.id}"`) && html.includes(o.label[lang]), `${s.id}/${o.id}`);
    }
    for (const id of ['result', 'done']) assert.ok(html.includes(`data-step="${id}"`));
    for (const f of ['name="name"', 'name="phone"', 'name="contact"', 'name="comment"', 'name="consent"', 'name="website"']) assert.ok(html.includes(f), f);
    assert.ok(html.includes('href="/privacy"'));
    assert.ok(html.includes(`hreflang="${lang === 'en' ? 'ru' : 'en'}"`));
    // the hero example uses the real formula
    const e = estimate({ property: 'resale', area: 54, scope: 'standard', extras: ['bathroom'], start: 'month' }, lang === 'ru' ? 'RUB' : 'USD');
    assert.ok(html.includes(formatRange(e, lang)), 'hero estimate');
    for (const bad of ['undefined', 'NaN', '[object', '{n}', '${']) assert.ok(!html.replace(/<script type="application\/json"[\s\S]*?<\/script>/, '').includes(bad), `"${bad}" in ${file}`);
    // UI strings for the browser are embedded and parse back
    const ui = JSON.parse(html.match(/<script type="application\/json" id="quiz-ui">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(ui, UI[lang]);
    // prices on the page come from the same rates as the calculator
    for (const o of STEP.scope.options) assert.ok(html.includes(new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency: lang === 'ru' ? 'RUB' : 'USD', maximumFractionDigits: 0 }).format(o.rate[lang === 'ru' ? 'RUB' : 'USD'])));
  });
}

test('both languages have the same UI keys', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
  assert.deepEqual(keys(UI.ru), keys(UI.en));
});

test('page weight stays small (HTML + CSS + JS, before gzip)', () => {
  const css = pub('css/style.css');
  const js = pub('js/quiz.js') + pub('js/quiz-model.js');
  for (const f of ['index.html', 'ru/index.html']) {
    const total = Buffer.byteLength(site[f]) + Buffer.byteLength(css) + Buffer.byteLength(js);
    assert.ok(total < 120 * 1024, `${f}: ${total} bytes`);
  }
});
