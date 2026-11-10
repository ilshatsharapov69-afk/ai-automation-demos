// initData validation. The reference signer below is written independently with node:crypto, straight from
// Telegram's docs, so a mistake in src/auth.js cannot hide behind the same mistake in the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { validateInitData, signInitData } from '../src/auth.js';

const TOKEN = '7000000001:AAFakeTokenForOfflineTests_0123456789';
const USER = { id: 42, first_name: 'Kim', last_name: 'Lee', username: 'kim_lee', language_code: 'en', allows_write_to_pm: true };
const now = Date.now();
const authDate = Math.floor(now / 1000) - 60;

function referenceSign(fields, token) {
  const pairs = Object.entries(fields).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
  const dcs = pairs.slice().sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  // Telegram sends the fields URL-encoded in arbitrary order; shuffle to make sure order does not matter.
  const qs = new URLSearchParams([...pairs.reverse(), ['hash', hash]]);
  return qs.toString();
}

test('accepts initData signed per Telegram docs (independent node:crypto signer)', async () => {
  const init = referenceSign({ query_id: 'AAHdF6IQAAAAAN0XohDhrOrc', user: USER, auth_date: authDate, signature: 'ed25519sigpart' }, TOKEN);
  const v = await validateInitData(init, TOKEN, { now });
  assert.equal(v.ok, true, v.error);
  assert.deepEqual(v.user, USER);
  assert.equal(v.authDate, authDate);
});

test('our signer and the reference signer agree', async () => {
  const fields = { auth_date: authDate, query_id: 'Q1', user: USER, start_param: 'join_abc123' };
  const a = new URLSearchParams(await signInitData(fields, TOKEN)).get('hash');
  const b = new URLSearchParams(referenceSign(fields, TOKEN)).get('hash');
  assert.equal(a, b);
  const v = await validateInitData(await signInitData(fields, TOKEN), TOKEN, { now });
  assert.equal(v.startParam, 'join_abc123');
});

test('rejects a tampered user (someone swaps in another id)', async () => {
  const init = new URLSearchParams(referenceSign({ user: USER, auth_date: authDate }, TOKEN));
  init.set('user', JSON.stringify({ ...USER, id: 1 }));
  assert.deepEqual(await validateInitData(init.toString(), TOKEN, { now }), { ok: false, error: 'bad_hash' });
});

test('rejects data signed with another bot token', async () => {
  const init = referenceSign({ user: USER, auth_date: authDate }, '7000000002:AAOtherBotTokenOtherBotToken_99999');
  assert.equal((await validateInitData(init, TOKEN, { now })).error, 'bad_hash');
});

test('rejects stale initData (replay after max age) and dates from the future', async () => {
  const old = referenceSign({ user: USER, auth_date: authDate - 2 * 86400 }, TOKEN);
  assert.equal((await validateInitData(old, TOKEN, { now })).error, 'expired');
  assert.equal((await validateInitData(old, TOKEN, { now, maxAgeSec: 7 * 86400 })).ok, true);
  const future = referenceSign({ user: USER, auth_date: authDate + 3600 }, TOKEN);
  assert.equal((await validateInitData(future, TOKEN, { now })).error, 'future_auth_date');
});

test('rejects missing or malformed input', async () => {
  assert.equal((await validateInitData('', TOKEN)).error, 'missing');
  assert.equal((await validateInitData(undefined, TOKEN)).error, 'missing');
  assert.equal((await validateInitData('user=%7B%7D&auth_date=1', TOKEN)).error, 'no_hash');
  assert.equal((await validateInitData('hash=zz&auth_date=1', TOKEN)).error, 'no_hash');
  assert.equal((await validateInitData(referenceSign({ user: USER, auth_date: authDate }, TOKEN), '')).error, 'no_bot_token');
  const noUser = referenceSign({ auth_date: authDate, query_id: 'x' }, TOKEN);
  assert.equal((await validateInitData(noUser, TOKEN, { now })).error, 'no_user');
  const badUser = referenceSign({ auth_date: authDate, user: 'not json' }, TOKEN);
  assert.equal((await validateInitData(badUser, TOKEN, { now })).error, 'bad_user');
  const noDate = referenceSign({ user: USER }, TOKEN);
  assert.equal((await validateInitData(noDate, TOKEN, { now })).error, 'no_auth_date');
});
