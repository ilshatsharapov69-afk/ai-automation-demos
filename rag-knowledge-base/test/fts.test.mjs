import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFtsQuery, searchFts, stem } from '../src/fts.js';
import { makeD1, loadCorpus } from './helpers.mjs';

test('stop words are dropped and words become prefix stems', () => {
  assert.equal(buildFtsQuery('Сколько стоит доставка по городу?'), 'стои* OR достав* OR город*');
  assert.equal(stem('доставки'), 'достав');
  assert.equal(stem('30'), '30');
});

test('a question made of stop words only gives an empty query', () => {
  assert.equal(buildFtsQuery('как это что'), '');
});

test('FTS5 finds the right document for Russian word forms the question did not use', async () => {
  const db = makeD1();
  loadCorpus(db);
  const hits = await searchFts(db, 'Какая гарантия на каркас?', 5);
  assert.ok(hits.length > 0);
  assert.ok(hits.slice(0, 3).some((h) => h.id.startsWith('d07#')), JSON.stringify(hits));
  assert.ok(hits[0].score >= hits[hits.length - 1].score, 'best first');
});

test('empty query returns nothing and does not throw', async () => {
  const db = makeD1();
  loadCorpus(db);
  assert.deepEqual(await searchFts(db, '???', 5), []);
});
