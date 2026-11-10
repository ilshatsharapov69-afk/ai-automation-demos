import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, cleanCitations } from '../src/prompt.js';
import { REFUSAL } from '../src/decide.js';

const chunks = [
  { title: 'Доставка', heading: 'Город', text: 'Доставка по городу 1 500 ₽.' },
  { title: 'Returns', heading: 'Rules', text: 'Return within 30 days.' },
];

test('passages are numbered from 1 with their title and heading', () => {
  const [sys, user] = buildMessages('Сколько стоит доставка?', chunks, 'ru');
  assert.equal(sys.role, 'system');
  assert.match(sys.content, /\[1\] Доставка \/ Город\nДоставка по городу 1 500 ₽\./);
  assert.match(sys.content, /\[2\] Returns \/ Rules\nReturn within 30 days\./);
  assert.deepEqual(user, { role: 'user', content: 'Сколько стоит доставка?' });
});

test('the model is told to use only the passages, to cite, and which exact sentence to say when it cannot answer', () => {
  const ru = buildMessages('q', chunks, 'ru')[0].content;
  assert.match(ru, /ONLY the numbered passages/);
  assert.match(ru, /like \[1\] or \[2\]/);
  assert.ok(ru.includes(REFUSAL.ru));
  assert.match(ru, /Answer in Russian/);
  const en = buildMessages('q', chunks, 'en')[0].content;
  assert.ok(en.includes(REFUSAL.en));
  assert.match(en, /Answer in English/);
});

test('citations: valid ones stay, invented numbers are removed, lists are expanded', () => {
  const r = cleanCitations('Delivery is 1 500 RUB [1]. Free from 30 000 [1, 2]. Also this [7] and [0].', 2);
  assert.equal(r.text, 'Delivery is 1 500 RUB [1]. Free from 30 000 [1][2]. Also this and.');
  assert.deepEqual(r.cited, [1, 2]);
});

test('neighbouring citations are glued together', () => {
  assert.equal(cleanCitations('Free from 30 000 [1] [4]. Next [2]', 4).text, 'Free from 30 000 [1][4]. Next [2]');
});

test('no citations at all is reported as an empty list', () => {
  assert.deepEqual(cleanCitations('Plain answer.', 3), { text: 'Plain answer.', cited: [] });
});
