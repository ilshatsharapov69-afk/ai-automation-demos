import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rrfMerge } from '../src/rrf.js';

test('an id found by both searches beats ids found by one', () => {
  const out = rrfMerge({ vector: [{ id: 'a', score: 0.9 }, { id: 'b', score: 0.8 }], fts: [{ id: 'c', score: 7 }, { id: 'b', score: 5 }] });
  assert.equal(out[0].id, 'b');
  assert.deepEqual(out[0].foundBy, ['vector', 'fts']);
  assert.deepEqual(out[0].ranks, { vector: 2, fts: 2 });
  assert.equal(out[0].scores.vector, 0.8);
});

test('score is the sum of 1/(k+rank) over the lists', () => {
  const out = rrfMerge({ vector: [{ id: 'a' }], fts: [{ id: 'x' }, { id: 'a' }] }, 60);
  const a = out.find((o) => o.id === 'a');
  assert.ok(Math.abs(a.rrf - (1 / 61 + 1 / 62)) < 1e-12);
});

test('raw scores of the lists never matter, only the ranks', () => {
  const out = rrfMerge({ vector: [{ id: 'a', score: 0.01 }, { id: 'b', score: 0.0001 }], fts: [{ id: 'b', score: 999 }, { id: 'a', score: 1 }] });
  assert.equal(out[0].rrf, out[1].rrf, 'symmetric ranks give a tie');
});

test('ties are broken by id, so the order is deterministic', () => {
  const out = rrfMerge({ vector: [{ id: 'b' }], fts: [{ id: 'a' }] });
  assert.deepEqual(out.map((o) => o.id), ['a', 'b']);
});

test('one empty list still works', () => {
  const out = rrfMerge({ vector: [], fts: [{ id: 'a' }, { id: 'b' }] });
  assert.deepEqual(out.map((o) => [o.id, o.foundBy.join()]), [['a', 'fts'], ['b', 'fts']]);
});
