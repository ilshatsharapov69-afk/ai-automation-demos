import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, say, press, cron, ANNA, BORIS, VIKA, NOW, buttons, btn, last, sent, row } from './helpers.mjs';
import { DAY } from '../src/time.js';
import { fmtPrice } from '../src/paywall.js';

test('plans say clearly that the payment is a mock; checkout -> mock pay -> access + demo invite note', async () => {
  const env = makeEnv();
  let r = await say(env, ANNA, '💳 Paid access');
  const plans = last(r.out);
  assert.match(plans.text, /MOCK PAYMENT/);
  assert.match(plans.text, /no money is charged/);
  assert.deepEqual(buttons(plans).map((b) => b.text), ['1 month — $5', '3 months — $12', '1 year — $40']);
  r = await press(env, ANNA, 'buy:m1', plans);
  const co = r.out[0];
  assert.equal(co.method, 'editMessageText');
  assert.match(co.text, /Checkout \(MOCK\)\nPlan: 1 month\nTotal: \$5/);
  const pay = btn(co, 'Pay $5 (mock)');
  assert.ok(pay);
  const payId = pay.callback_data.split(':')[1];
  assert.equal((await row(env, 'SELECT status, provider FROM payments WHERE id = ?', payId)).provider, 'mock');

  r = await press(env, ANNA, pay.callback_data, co);
  const msgs = sent(r.out);
  assert.match(msgs[0].text, /Payment received \(mock\)\. Plan: 1 month\. Access until Sat 5 Dec, 10:20 UTC/);
  assert.match(msgs[1].text, /Demo: here a live bot sends a one-person invite link/);
  assert.equal(r.out.filter((c) => c.method === 'createChatInviteLink').length, 0);
  const sub = await row(env, "SELECT * FROM subscriptions WHERE ws = 'u501'");
  assert.equal(sub.status, 'active');
  assert.equal(sub.expires_at, NOW + 30 * DAY);

  r = await press(env, ANNA, pay.callback_data, co);
  assert.equal(last(r.out).text, 'This checkout is no longer valid. Open 💳 again.', 'double tap does not pay twice');
  assert.equal((await row(env, "SELECT COUNT(*) AS n FROM payments WHERE status = 'paid'")).n, 1);

  r = await say(env, ANNA, '/stats');
  assert.match(last(r.out).text, /Paid access: 1 active · \$5 \(mock payments\)/);
  r = await say(env, ANNA, '/status');
  assert.match(last(r.out).text, /Your access: 1 month, active until Sat 5 Dec, 10:20 UTC \(30 days left\)/);
  assert.ok(btn(last(r.out), 'Simulate the end of access'));
});

test('renewing extends from the current end date; cancel marks the checkout cancelled', async () => {
  const env = makeEnv({ CURRENCY: 'RUB' });
  let r = await say(env, BORIS, '/subscribe');
  assert.match(last(r.out).text, /ТЕСТОВАЯ ОПЛАТА/);
  assert.equal(buttons(last(r.out))[0].text, '1 месяц — 490 ₽');
  for (const plan of ['m1', 'm3']) {
    r = await press(env, BORIS, `buy:${plan}`);
    await press(env, BORIS, btn(r.out[0], 'Оплатить').callback_data, r.out[0]);
  }
  assert.equal((await row(env, "SELECT expires_at FROM subscriptions WHERE ws = 'u502'")).expires_at, NOW + 120 * DAY);
  r = await press(env, BORIS, 'buy:y1');
  assert.equal(btn(r.out[0], 'Оплатить').text, '💳 Оплатить 3 990 ₽ (тест)');
  const id = btn(r.out[0], 'Отмена').callback_data.split(':')[1];
  r = await press(env, BORIS, `paycancel:${id}`, r.out[0]);
  assert.equal(r.out[0].text, 'Оплата отменена. Ничего не списано.');
  assert.equal((await row(env, 'SELECT status FROM payments WHERE id = ?', id)).status, 'cancelled');
  r = await say(env, BORIS, '/stats');
  assert.match(last(r.out).text, /Платный доступ: активных 1 · 1 680 ₽ \(тестовые оплаты\)/);
  assert.equal(fmtPrice(12.5, 'EUR'), '€12.50');
});

test('live mode: one-person invite link from the paid channel, owner is told; expiry reminds, removes and offers renewal', async () => {
  const env = makeEnv({ DEMO_MODE: 'off', OWNER_IDS: '501', PAID_CHANNEL_ID: '-1009876543210', CHANNEL_TITLE: 'Pinecone Club' });
  await say(env, ANNA, '/start');
  let r = await say(env, VIKA, '/start subscribe');
  assert.match(last(r.out).text, /Access to the private channel «Pinecone Club»/, 'deep link t.me/<bot>?start=subscribe opens the plans');
  r = await say(env, VIKA, '💳 Subscribe');
  r = await press(env, VIKA, 'buy:m1', last(r.out));
  r = await press(env, VIKA, btn(r.out[0], 'Pay').callback_data, r.out[0]);
  const inv = r.out.find((c) => c.method === 'createChatInviteLink');
  assert.equal(inv.chat_id, '-1009876543210');
  assert.equal(inv.member_limit, 1);
  assert.equal(inv.expire_date, Math.floor(NOW / 1000) + 86400);
  const link = sent(r.out).find((c) => c.chat_id === 503 && /invite link/.test(c.text));
  assert.match(link.text, /https:\/\/t\.me\/\+test\d+/);
  assert.equal(btn(link, 'Join the channel').url, link.text.split('\n')[1]);
  const owner = sent(r.out).find((c) => c.chat_id === 501);
  assert.match(owner.text, /New subscriber \(mock payment\): Vika \(@vika_reader\), 1 month, until Sat 5 Dec/);

  // 3 days before the end: one reminder.
  let out = await cron(env, NOW + 27 * DAY + 60_000);
  assert.match(sent(out)[0].text, /Your access to the channel ends Sat 5 Dec/);
  assert.equal((await cron(env, NOW + 28 * DAY)).length, 0, 'reminded once');
  // The end: removed from the channel (ban + unban), told, offered to renew.
  out = await cron(env, NOW + 30 * DAY + 60_000);
  assert.deepEqual(out.map((c) => c.method), ['banChatMember', 'unbanChatMember', 'sendMessage']);
  assert.equal(out[0].user_id, 503);
  assert.equal(out[1].only_if_banned, true);
  assert.match(out[2].text, /Your access to «Pinecone Club» has ended\.$/);
  assert.equal(buttons(out[2])[0].callback_data, 'plans');
  assert.equal((await row(env, 'SELECT status FROM subscriptions WHERE user_id = 503')).status, 'expired');
  r = await say(env, VIKA, '🎫 My access');
  assert.match(last(r.out).text, /You have no active access/);
});

test('live mode without PAID_CHANNEL_ID: the payer is told the link could not be created', async () => {
  const env = makeEnv({ DEMO_MODE: 'off', OWNER_IDS: '501' });
  let r = await press(env, VIKA, 'buy:m1');
  r = await press(env, VIKA, btn(r.out[0], 'Pay').callback_data, r.out[0]);
  assert.match(sent(r.out).find((c) => c.chat_id === 503 && /Could not/.test(c.text)).text, /PAID_CHANNEL_ID is not set/);
});

test('demo: «Simulate the end of access» runs the real expiry path', async () => {
  const env = makeEnv();
  let r = await press(env, ANNA, 'buy:m1');
  await press(env, ANNA, btn(r.out[0], 'Pay').callback_data, r.out[0]);
  r = await say(env, ANNA, '/status');
  r = await press(env, ANNA, 'simexpire', last(r.out));
  const end = sent(r.out)[0];
  assert.match(end.text, /Your access to «Pinecone Coffee Notes» has ended\. Demo: a live bot also removes the member/);
  assert.equal(r.out.filter((c) => c.method === 'banChatMember').length, 0, 'no channel calls in demo');
  assert.equal((await row(env, "SELECT status FROM subscriptions WHERE ws = 'u501'")).status, 'expired');
});

test('demo: the cron lets sandbox subscriptions lapse quietly (no messages to visitors weeks later)', async () => {
  const env = makeEnv();
  let r = await press(env, ANNA, 'buy:m1');
  await press(env, ANNA, btn(r.out[0], 'Pay').callback_data, r.out[0]);
  assert.equal((await cron(env, NOW + 28 * DAY)).filter((c) => c.chat_id === 501 && /access/i.test(c.text || '')).length, 0);
  assert.equal((await cron(env, NOW + 31 * DAY)).filter((c) => /access/i.test(c.text || '')).length, 0);
  assert.equal((await row(env, "SELECT status FROM subscriptions WHERE ws = 'u501'")).status, 'expired');
});
