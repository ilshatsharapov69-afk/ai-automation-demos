import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './helpers.mjs';
import { spend, peek, sha256Hex } from '../src/limits.js';

const NOW = Date.UTC(2026, 10, 6, 10, 15);
const cfg = (over = {}) => ({ ipHash: 'ip-a', now: NOW, perIp: 6, daily: 80, ...over });

test('six questions per hour per visitor, the seventh is refused', async () => {
  const db = makeD1();
  for (let i = 1; i <= 6; i++) {
    const r = await spend(db, cfg());
    assert.equal(r.ok, true, `question ${i}`);
    assert.equal(r.ipLeft, 6 - i);
  }
  const r7 = await spend(db, cfg());
  assert.equal(r7.ok, false);
  assert.equal(r7.reason, 'ip');
  assert.equal(r7.ipLeft, 0);
});

test('visitors do not share the per-IP budget; the next hour starts fresh', async () => {
  const db = makeD1();
  for (let i = 0; i < 6; i++) await spend(db, cfg());
  assert.equal((await spend(db, cfg({ ipHash: 'ip-b' }))).ok, true);
  assert.equal((await spend(db, cfg({ now: NOW + 3_600_000 }))).ok, true);
});

test('global daily cap: refused for everybody, and the visitor slot is given back', async () => {
  const db = makeD1();
  assert.equal((await spend(db, cfg({ daily: 2 }))).ok, true);
  assert.equal((await spend(db, cfg({ daily: 2, ipHash: 'ip-b' }))).ok, true);
  const r = await spend(db, cfg({ daily: 2, ipHash: 'ip-c' }));
  assert.deepEqual([r.ok, r.reason, r.dayLeft], [false, 'global', 0]);
  const left = await peek(db, cfg({ daily: 2, ipHash: 'ip-c' }));
  assert.equal(left.ipLeft, 6, 'the refused visitor lost nothing');
  assert.equal((await spend(db, cfg({ daily: 2, now: NOW + 86_400_000 }))).ok, true, 'a new day resets the cap');
});

test('peek does not spend', async () => {
  const db = makeD1();
  await spend(db, cfg());
  assert.deepEqual(await peek(db, cfg()), { ipLeft: 5, dayLeft: 79 });
  assert.deepEqual(await peek(db, cfg()), { ipLeft: 5, dayLeft: 79 });
});

test('IPs are stored hashed', async () => {
  const h = await sha256Hex('salt|203.0.113.7');
  assert.match(h, /^[0-9a-f]{24}$/);
  assert.ok(!h.includes('203'));
});
