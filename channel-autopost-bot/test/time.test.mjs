import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSlots, parseTz, fmtTz, nextSlot, parseWhen, fmtWhen, HOUR, MIN } from '../src/time.js';
import { NOW } from './helpers.mjs';

test('time slots and time zones parse strictly', () => {
  assert.deepEqual(parseSlots('19:00 9:00, 13:30 9:00'), ['09:00', '13:30', '19:00']);
  assert.deepEqual(parseSlots('8.30'), ['08:30']);
  for (const bad of ['', '25:00', '9', '12:60', 'noon']) assert.equal(parseSlots(bad), null, bad);
  assert.equal(parseTz('+2'), 120);
  assert.equal(parseTz('UTC-3:30'), -210);
  assert.equal(parseTz('+05:45'), 345);
  assert.equal(parseTz('0'), 0);
  assert.equal(parseTz('utc'), 0);
  for (const bad of ['', '+15', '-13', '+2:10', 'abc']) assert.equal(parseTz(bad), null, bad);
  assert.equal(fmtTz(0), 'UTC');
  assert.equal(fmtTz(-210), 'UTC-3:30');
});

test('next slot skips the past and the taken times, honours the UTC offset', () => {
  const slots = ['09:00', '13:00', '19:00'];
  const a = nextSlot(NOW, slots, 0); // 10:20 UTC -> 13:00 today
  assert.equal(new Date(a).toISOString(), '2026-11-05T13:00:00.000Z');
  const b = nextSlot(NOW, slots, 0, new Set([a]));
  assert.equal(new Date(b).toISOString(), '2026-11-05T19:00:00.000Z');
  const c = nextSlot(NOW, slots, 0, new Set([a, b]));
  assert.equal(new Date(c).toISOString(), '2026-11-06T09:00:00.000Z');
  // UTC+2: local now is 12:20, so local 13:00 = 11:00 UTC.
  assert.equal(new Date(nextSlot(NOW, slots, 120)).toISOString(), '2026-11-05T11:00:00.000Z');
  assert.equal(nextSlot(NOW + 12 * HOUR + 40 * MIN - 30_000, ['23:00'], 0) > NOW + 13 * HOUR, true, 'a slot less than a minute away is skipped');
});

test('owner-typed times', () => {
  const iso = (s, tz = 0) => { const v = parseWhen(s, NOW, tz); return v && new Date(v).toISOString(); };
  assert.equal(iso('18:30'), '2026-11-05T18:30:00.000Z');
  assert.equal(iso('08:00'), '2026-11-06T08:00:00.000Z', 'passed time today means tomorrow');
  assert.equal(iso('tomorrow 9:00'), '2026-11-06T09:00:00.000Z');
  assert.equal(iso('завтра 9:00'), '2026-11-06T09:00:00.000Z');
  assert.equal(iso('07.11 18:30'), '2026-11-07T18:30:00.000Z');
  assert.equal(iso('2026-11-07 18:30', 120), '2026-11-07T16:30:00.000Z');
  assert.equal(iso('01.11 10:00'), '2027-11-01T10:00:00.000Z', 'a passed day without a year means next year');
  for (const bad of ['2026-11-01 10:00', '31.02 10:00', '25:00', 'soon', '2030-01-01 10:00']) assert.equal(parseWhen(bad, NOW, 0), null, bad);
  assert.equal(fmtWhen(Date.UTC(2026, 10, 7, 9, 0), 0, 'en'), 'Sat 7 Nov, 09:00');
  assert.equal(fmtWhen(Date.UTC(2026, 10, 7, 9, 0), 0, 'ru'), 'сб, 7 ноя, 09:00');
});
