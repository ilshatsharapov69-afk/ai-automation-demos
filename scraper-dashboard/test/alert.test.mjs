import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAlert, formatBaseline, plural, money, sendTelegram } from '../src/alert.js';

const items = new Map([
  ['a_1', { title: 'Tom & Jerry <Deluxe>', currency: 'GBP' }],
  ['b_2', { title: 'Sharp Objects', currency: 'GBP' }],
  ['c_3', { title: 'Emma', currency: 'GBP' }],
]);
const changes = [
  { item_id: 'b_2', kind: 'gone', old_value: 4782, new_value: null },
  { item_id: 'a_1', kind: 'price', old_value: 1000, new_value: 1010 },
  { item_id: 'c_3', kind: 'price', old_value: 3293, new_value: 2799 },
  { item_id: 'b_2', kind: 'stock', old_value: 1, new_value: 0 },
];

test('EN alert: biggest price move first, HTML escaped, link and demo note', () => {
  const text = formatAlert({ changes, items, runId: 7, lang: 'en', simulated: true, publicUrl: 'https://x.workers.dev' });
  const lines = text.split('\n');
  assert.equal(lines[0], '📊 <b>Price monitor</b>: 4 changes (run #7)');
  assert.equal(lines[2], '🔻 Emma: £32.93 → <b>£27.99</b> (−15.0%)');
  assert.equal(lines[3], '🔺 Tom &amp; Jerry &lt;Deluxe&gt;: £10.00 → <b>£10.10</b> (+1.0%)');
  assert.equal(lines[4], '⛔ Sharp Objects: out of stock');
  assert.equal(lines[5], '🗑 Sharp Objects: removed from the site');
  assert.ok(text.includes('🧪 Demo mode'));
  assert.ok(text.endsWith('<a href="https://x.workers.dev">Open the dashboard</a>'));
});

test('RU alert, MIN_CHANGE_PCT threshold, truncation', () => {
  const text = formatAlert({ changes, items, runId: 12, lang: 'ru', minPct: 5, maxLines: 2 });
  const lines = text.split('\n');
  assert.equal(lines[0], '📊 <b>Монитор цен</b>: 3 изменения (запуск №12)');
  assert.equal(lines[2], '🔻 Emma: £32.93 → <b>£27.99</b> (−15,0%)');
  assert.equal(lines[4], '…и ещё 1 на дашборде');
  assert.ok(!text.includes('Tom'), 'the 1 % move is below the 5 % threshold');
  assert.equal(formatAlert({ changes: [changes[1]], items, runId: 1, minPct: 5 }), null);
});

test('russian plurals and money', () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25, 111].map((n) => plural(n, 'a', 'b', 'c')), ['a', 'b', 'c', 'c', 'a', 'b', 'c', 'c']);
  assert.equal(money(123450, 'GBP'), '£1234.50');
  assert.equal(money(99900, 'RUB'), '999.00 ₽');
  assert.match(formatBaseline({ count: 62, runId: 1, lang: 'ru' }), /отслеживаю 62 товара/);
});

test('sendTelegram is a no-op without secrets and posts HTML when set', async () => {
  const calls = [];
  const fake = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return Response.json({ ok: true }); };
  assert.deepEqual(await sendTelegram({}, 'hi', fake), { sent: false, reason: 'BOT_TOKEN / TG_CHAT_ID not set' });
  assert.equal(calls.length, 0);
  assert.deepEqual(await sendTelegram({ BOT_TOKEN: '1:abc', TG_CHAT_ID: '42' }, 'hi', fake), { sent: true });
  assert.equal(calls[0].url, 'https://api.telegram.org/bot1:abc/sendMessage');
  assert.deepEqual(calls[0].body, { chat_id: '42', text: 'hi', parse_mode: 'HTML', disable_web_page_preview: true });
  const bad = async () => Response.json({ ok: false, description: 'Bad Request: chat not found' }, { status: 400 });
  assert.deepEqual(await sendTelegram({ BOT_TOKEN: '1:abc', TG_CHAT_ID: '42' }, 'hi', bad), { sent: false, reason: 'Bad Request: chat not found' });
});
