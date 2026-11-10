// Rule-based fallback on the RU/EN samples: category, fields, score, draft. No Worker, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES, NOW } from './samples.js';
import { fromForm, fromEmail, fromTelegram, parseRawEmail, personName } from '../src/channels.js';
import { classifyRules } from '../src/classify.js';
import { scoreLead } from '../src/score.js';
import { templateDraft } from '../src/draft.js';
import { extractBudget, extractDeadline, extractContacts } from '../src/extract.js';

const now = new Date(NOW);
const toMsg = (s) => (s.channel === 'form' ? fromForm(s.in) : s.channel === 'email' ? fromEmail(s.in) : fromTelegram({ ...s.in, chat: { id: s.in.from.id }, message_id: 1 }));

for (const s of SAMPLES) {
  test(`rules: ${s.id}`, () => {
    const msg = toMsg(s);
    const r = classifyRules(msg, now);
    const sc = scoreLead(r, msg.body, now);
    const e = s.expect;
    assert.equal(r.category, e.category, 'category');
    assert.equal(r.lang, e.lang, 'lang');
    for (const k of ['name', 'email', 'phone', 'telegram', 'product']) if (k in e) assert.equal(r[k], e[k], k);
    if ('order' in e) assert.equal(r.order, e.order, 'order');
    if ('budget' in e) assert.deepEqual(r.budget ? [r.budget.amount, r.budget.currency] : null, e.budget, 'budget');
    if ('deadline' in e) assert.equal(r.deadline?.date ?? null, e.deadline, 'deadline');
    assert.equal(sc.hot, e.hot, `hot (score ${sc.score})`);
    const d = templateDraft(r, [msg.subject, msg.body].filter(Boolean).join('\n'), now);
    if (e.category === 'spam') assert.equal(d, null, 'no draft for spam');
    else {
      assert.ok(d && d.length > 80, 'draft exists');
      assert.match(d, e.lang === 'ru' ? /Команда Oakbloom$/ : /Oakbloom team$/, 'signed in the sender language');
      if (r.name) assert.ok(d.includes(r.name.split(' ')[0]), 'greets by first name');
    }
  });
}

test('rules: every category is covered in both languages', () => {
  for (const lang of ['ru', 'en']) for (const cat of ['lead', 'support', 'spam', 'partnership']) {
    assert.ok(SAMPLES.some((s) => s.expect.lang === lang && s.expect.category === cat), `${lang}/${cat}`);
  }
});

test('budget parser: units, ranges, phones and sizes', () => {
  const b = (t, l = 'ru') => { const x = extractBudget(t, l); return x && [x.amount, x.currency]; };
  assert.deepEqual(b('бюджет 150к'), [150000, 'RUB']);
  assert.deepEqual(b('готовы потратить 1,2 млн рублей'), [1200000, 'RUB']);
  assert.deepEqual(b('от 200 до 300 тыс'), [300000, 'RUB']);
  assert.deepEqual(b('€3,200 max', 'en'), [3200, 'EUR']);
  assert.deepEqual(b('we have $1.5m for the whole fit-out', 'en'), [1500000, 'USD']);
  assert.equal(b('call me 8 900 555 01 23 tomorrow'), null, 'a phone is not a budget');
  assert.equal(b('the wall is 4 m long, 2.5 m high', 'en'), null, 'metres are not millions');
  assert.deepEqual(b('кухня 3 метра за 400 000 ₽'), [400000, 'RUB']);
});

test('deadline parser: dates, months, relative, holidays', () => {
  const d = (t) => extractDeadline(t, now)?.date ?? null;
  assert.equal(d('к Новому году'), '2026-12-31');
  assert.equal(d('до конца месяца'), '2026-11-30');
  assert.equal(d('через пару недель'), '2026-11-19');
  assert.equal(d('in two weeks'), '2026-11-19');
  assert.equal(d('к 25-му декабря'), '2026-12-25');
  assert.equal(d('by Jan 10th'), '2027-01-10');
  assert.equal(d('15.01.2027'), '2027-01-15');
  assert.equal(d('no rush at all'), null);
});

test('contacts: email, phone and @username together', () => {
  assert.deepEqual(extractContacts('пишите на test.user@example.com или @user_demo, тел 8 (900) 555-01-23'), {
    email: 'test.user@example.com', phone: '8 (900) 555-01-23', telegram: '@user_demo',
  });
});

test('email From: people vs companies', () => {
  assert.equal(personName('Laura Kim'), 'Laura Kim');
  assert.equal(personName('ЛесПром Снаб'), null);
  assert.equal(personName('Growth Team'), null);
  assert.equal(personName('ООО Ромашка'), null);
});

test('raw MIME email (Email Routing) -> text, subject and sender', () => {
  const b64 = Buffer.from('Здравствуйте! Нужен шкаф-купе, бюджет 120 тыс. руб.\nАнна', 'utf8').toString('base64');
  const raw = [
    'From: =?utf-8?B?' + Buffer.from('Анна Смирнова', 'utf8').toString('base64') + '?= <anna@example.ru>',
    'Subject: =?utf-8?Q?=D0=A8=D0=BA=D0=B0=D1=84?=',
    'Message-ID: <abc@example.ru>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="b1"',
    '',
    '--b1',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64,
    '--b1',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>html part</p>',
    '--b1--',
  ].join('\r\n');
  const e = parseRawEmail(raw);
  assert.equal(e.subject, 'Шкаф');
  assert.equal(e.message_id, '<abc@example.ru>');
  assert.match(e.from, /Анна Смирнова <anna@example.ru>/);
  const r = classifyRules(fromEmail(e), now);
  assert.equal(r.category, 'lead');
  assert.equal(r.name, 'Анна Смирнова');
  assert.deepEqual([r.budget.amount, r.budget.currency], [120000, 'RUB']);
});
