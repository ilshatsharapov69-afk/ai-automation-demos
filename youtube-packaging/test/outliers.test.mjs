import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCount, splitLine, analyzeOutliers, short } from '../public/lib/outliers.js';

const sample = (f) => readFileSync(new URL(`../public/samples/${f}`, import.meta.url), 'utf8');

test('parseCount reads the formats people paste', () => {
  const cases = {
    '1234567': 1234567, '1 234 567': 1234567, '1,234,567': 1234567, '1.234.567': 1234567, '2,350,000': 2350000,
    '1.2M': 1200000, '1.2m': 1200000, '350K': 350000, '4,5k': 4500, '9.4K': 9400, '2B': 2000000000,
    '1,2 млн': 1200000, '350 тыс': 350000, '350 тыс.': 350000, '2 млрд': 2000000000, '12К': 12000,
    '1.2M views': 1200000, '85K subscribers': 85000, '640 тыс. просмотров': 640000, '1 200': 1200,
  };
  for (const [s, v] of Object.entries(cases)) assert.equal(parseCount(s), v, s);
  for (const bad of ['', 'abc', 'Views', '1.2.3M', '-5', 'M']) assert.equal(parseCount(bad), null, bad);
});

test('splitLine: tab, pipe, semicolon and quoted CSV; the title may contain separators', () => {
  assert.deepEqual(splitLine('My video\t1200\t300'), ['My video', '1200', '300']);
  assert.deepEqual(splitLine('A | B title | 1.2M | 85K'), ['A B title', '1.2M', '85K']);
  assert.deepEqual(splitLine('Title; 10K; 2K'), ['Title', '10K', '2K']);
  assert.deepEqual(splitLine('"Cold brew, fast",1200000,85000'), ['Cold brew, fast', '1200000', '85000']);
  assert.equal(splitLine('only two | columns'), null);
});

test('analyzeOutliers on the EN sample: ratio, median, flags and order', () => {
  const r = analyzeOutliers(sample('competitors.txt'), { threshold: 3 });
  assert.equal(r.errors.length, 0, 'header line is skipped silently');
  assert.equal(r.rows.length, 8);
  assert.equal(r.outliers, 4);
  assert.equal(r.rows[0].title, 'Cold brew in 5 minutes? I tried the fast method');
  assert.ok(Math.abs(r.rows[0].ratio - 1200000 / 85000) < 1e-9);
  for (let i = 1; i < r.rows.length; i++) assert.ok(r.rows[i - 1].ratio >= r.rows[i].ratio, 'sorted by ratio');
  // median of 8 ratios = mean of the 4th and 5th
  const ratios = r.rows.map((x) => x.ratio).sort((a, b) => a - b);
  assert.ok(Math.abs(r.median - (ratios[3] + ratios[4]) / 2) < 1e-9);
  assert.ok(Math.abs(r.rows[0].vsMedian - r.rows[0].ratio / r.median) < 1e-9);
  const bands = Object.fromEntries(r.rows.map((x) => [x.title, x.band]));
  assert.equal(bands['Cold brew concentrate ratio explained'], 'above');
  assert.equal(bands['The coffee grinder mistake everyone makes'], 'normal');
});

test('analyzeOutliers on the RU sample (млн / тыс / spaces)', () => {
  const r = analyzeOutliers(sample('competitors-ru.txt'));
  assert.equal(r.errors.length, 0);
  assert.equal(r.rows.length, 8);
  assert.equal(r.rows[0].title, 'Базилик из супермаркета: вторая жизнь за 2 недели');
  assert.equal(r.rows.find((x) => x.title === 'Огород на балконе зимой').views, 2300000);
});

test('bad lines are reported with a reason; the threshold is respected', () => {
  const r = analyzeOutliers('Good one | 900 | 100\nNo numbers | lots | many\nZero | 10 | 0\njust text\nOther | 150 | 100', { threshold: 5 });
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.errors.map((e) => [e.line, e.reason]), [[2, 'number'], [3, 'zero_subs'], [4, 'columns']]);
  assert.equal(r.outliers, 1, '9× is an outlier at 5×, 1.5× is not');
  assert.equal(analyzeOutliers('Good one | 900 | 100', { threshold: 10 }).outliers, 0);
});

test('short number labels', () => {
  assert.equal(short(1234), '1.2K');
  assert.equal(short(2500000), '2.5M');
  assert.equal(short(999), '999');
  assert.equal(short(2500000, 'ru'), '2,5 млн');
  assert.equal(short(310000, 'ru'), '310 тыс.');
});
