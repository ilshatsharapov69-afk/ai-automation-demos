// The Workers AI path with a fake AI binding: the model's answer is used, checked against the message,
// and every failure (error, garbage, daily cap, AI_MODE=off) falls back to the rules without losing the request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from './samples.js';
import { makeEnv, call, fakeAi, asOwner } from './helpers.mjs';
import { parseJsonLoose } from '../src/classify.js';
import { summarize } from '../src/extract.js';

const kitchen = SAMPLES.find((s) => s.id === 'en-form-kitchen');
const supplier = SAMPLES.find((s) => s.id === 'ru-email-supplier');
const isClassify = (input) => input.messages[0].content.startsWith('You triage');

test('AI classifies and drafts; invented contacts are dropped, fields stay rule-checked', async () => {
  const ai = fakeAi((input) => isClassify(input)
    ? { response: 'Sure! {"category":"lead","name":"Emily Carter","contact":"+1 999 000 0000","budget":"$9,000","deadline":"December 15","summary":"Wants an oak kitchen with an island by mid-December."}' }
    : { response: 'Hello Emily,\n\nThank you for your request. Custom kitchens start from $4,500; the measurement and first 3D design are free. Could you send the room size and a good time for the visit?\n\nOakbloom team' });
  const env = makeEnv({ AI: ai });
  const r = await call(env, 'POST', '/api/form', { json: kitchen.in });
  const q = r.body.request;
  assert.equal(q.classified_by, 'ai');
  assert.equal(q.draft_source, 'ai');
  assert.equal(q.summary, 'Wants an oak kitchen with an island by mid-December.');
  assert.equal(q.phone, '+1 202 555 0142', 'the invented phone is not in the message, the real one stays');
  assert.deepEqual([q.budget.amount, q.budget.currency], [9000, 'USD']);
  assert.equal(q.deadline.date, '2026-12-15');
  assert.equal(q.hot, true, 'score is still computed by the rules');
  assert.match(q.draft, /^Hello Emily,/);
  assert.equal(ai.calls.length, 2);
  assert.equal(ai.calls[0].model, '@cf/meta/llama-3.1-8b-instruct-fast', 'small model for the JSON step');
  assert.equal(ai.calls[1].model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'bigger model for the reply');
  assert.equal(q.ai_note, 'ok');
  assert.equal(q.ai_model, '@cf/meta/llama-3.1-8b-instruct-fast');
  assert.match(ai.calls[1].input.messages[0].content, /Use ONLY the facts below/);
  assert.match(ai.calls[1].input.messages[0].content, /Custom kitchens start from \$4,500/);
});

test('AI category wins over the rules when they disagree', async () => {
  const ai = fakeAi((input) => isClassify(input) ? { response: '{"category":"support","summary":"Asks about an existing order."}' } : { response: 'Здравствуйте! Спасибо за письмо, ответим в течение рабочего дня.\nКоманда Oakbloom' });
  const env = makeEnv({ AI: ai });
  const r = await call(env, 'POST', '/api/email', { json: supplier.in });
  assert.equal(r.body.request.category, 'support');
  assert.equal(r.body.request.summary, summarize(supplier.in.subject, supplier.in.text), 'an English summary of a Russian email is replaced by the rules summary');
});

test('AI errors, garbage and too-short drafts fall back to rules and templates', async () => {
  for (const [label, handler] of [
    ['throws', () => { throw new Error('AI binding: 3040 capacity exceeded'); }],
    ['garbage', () => ({ response: 'I cannot help with that.' })],
    ['short', (input) => (isClassify(input) ? { response: '{"category":"lead"}' } : { response: 'Ok.' })],
  ]) {
    const env = makeEnv({ AI: fakeAi(handler) });
    const r = await call(env, 'POST', '/api/form', { json: kitchen.in });
    assert.equal(r.status, 200, label);
    const q = r.body.request;
    assert.equal(q.category, 'lead', label);
    assert.equal(q.draft_source, 'template', label);
    assert.match(q.draft, /Thank you for your request about a custom kitchen/, label);
    assert.equal(q.hot, true, label);
  }
});

test('daily AI cap and AI_MODE=off', async () => {
  const ai = fakeAi((input) => (isClassify(input) ? { response: '{"category":"lead","summary":"A kitchen request."}' } : { response: 'Hello,\n\nThank you, we will send the details shortly after the measurement.\n\nOakbloom team' }));
  const env = makeEnv({ AI: ai, AI_DAILY_CAP: '1' }); // the cap counts messages, one AI read = classify + draft
  const a = await call(env, 'POST', '/api/form', { json: kitchen.in });
  const b = await call(env, 'POST', '/api/form', { json: { ...kitchen.in, message: kitchen.in.message + ' Thanks!' } });
  assert.equal(a.body.request.classified_by, 'ai');
  assert.equal(b.body.request.classified_by, 'rules', 'cap reached: rules');
  assert.equal(b.body.request.draft_source, 'template');
  assert.equal(b.body.request.ai_note, 'day_cap');
  assert.equal(ai.calls.length, 2);
  const page = await call(env, 'POST', '/form', { form: { ...kitchen.in, lang: 'en' } });
  assert.match(page.body, /AI daily demo limit reached, showing the rule-based result\./);

  const ai2 = fakeAi(() => ({ response: '{}' }));
  const off = makeEnv({ AI: ai2, AI_MODE: 'off' });
  await call(off, 'POST', '/api/form', { json: kitchen.in });
  assert.equal(ai2.calls.length, 0);
});

test('per-visitor hourly AI cap: the next message of the same IP is read by rules, another IP still gets AI', async () => {
  const ai = fakeAi((input) => (isClassify(input) ? { response: '{"category":"lead","summary":"A kitchen request."}' } : { response: 'Hello,\n\nThank you, we will send the details shortly after the measurement.\n\nOakbloom team' }));
  const env = makeEnv({ AI: ai, AI_IP_HOURLY: '2', AI_DAILY_CAP: '50' });
  const send = (ip, extra = '') => call(env, 'POST', '/api/form', { json: { ...kitchen.in, message: kitchen.in.message + extra }, headers: { 'CF-Connecting-IP': ip } });
  assert.equal((await send('203.0.113.7', ' a')).body.request.classified_by, 'ai');
  assert.equal((await send('203.0.113.7', ' b')).body.request.classified_by, 'ai');
  const third = (await send('203.0.113.7', ' c')).body.request;
  assert.equal(third.classified_by, 'rules');
  assert.equal(third.ai_note, 'ip_cap');
  assert.equal((await send('203.0.113.8', ' d')).body.request.classified_by, 'ai', 'a different IP has its own allowance');
  const page = await call(env, 'GET', '/inbox?lang=en', { headers: { 'CF-Connecting-IP': '203.0.113.7' } });
  assert.match(page.body, /AI reads left for you this hour: 0 of 2/);
  assert.equal(ai.calls.length, 6);
  const raw = JSON.stringify((await call(env, 'GET', '/api/requests', { headers: { Authorization: 'Bearer test-admin-key' } })).body);
  assert.ok(!raw.includes('203.0.113'), 'raw IP addresses are never stored or returned');
});

test('seed messages are read by the AI without using the visitors\' caps, and are marked as samples', async () => {
  const ai = fakeAi((input) => (isClassify(input) ? { response: '{"category":"lead","summary":"A kitchen request."}' } : { response: 'Hello,\n\nThank you, we will send the details shortly after the measurement.\n\nOakbloom team' }));
  const env = makeEnv({ AI: ai, AI_DAILY_CAP: '0', INBOX_SECRET: 'seed-secret' });
  assert.equal((await call(env, 'POST', '/api/seed', { json: { channel: 'form', ...kitchen.in } })).status, 403, 'needs the secret');
  const r = await call(env, 'POST', '/api/seed', { json: { channel: 'form', ...kitchen.in, ago_min: 90 }, headers: { 'X-Inbox-Secret': 'seed-secret' } });
  assert.equal(r.body.request.origin, 'seed');
  assert.equal(r.body.request.classified_by, 'ai');
  assert.equal(r.body.request.draft_source, 'ai');
  const page = await call(env, 'GET', '/inbox?lang=en');
  assert.match(page.body, /read by AI/);
  assert.match(page.body, /reply by AI/);
  assert.match(page.body, /sample/);
  assert.equal((await asOwner(env)).body.requests.length, 1);
});

test('JSON repair: fences, prose, trailing commas, a cut-off tail, and nonsense', () => {
  assert.deepEqual(parseJsonLoose({ response: '```json\n{"category":"lead","name":null,}\n```' }), { category: 'lead', name: null });
  assert.deepEqual(parseJsonLoose('Here you go: {"category":"spam"} hope it helps'), { category: 'spam' });
  assert.equal(parseJsonLoose({ response: '{"category":"support","summary":"Asks about an order' }).category, 'support');
  assert.deepEqual(parseJsonLoose({ response: { category: 'lead' } }), { category: 'lead' });
  assert.equal(parseJsonLoose({ response: 'I cannot help with that.' }), null);
  assert.equal(parseJsonLoose({ response: '[1,2]' }), null);
});

test('draft prompt: facts in the reply language, rush slot only when the date is really tight; layout slips are tidied', async () => {
  const { draftPrompt, tidyDraft } = await import('../src/draft.js');
  const ru = { lang: 'ru', category: 'lead', product: 'wardrobe', name: 'Павел', budget: null, deadline: null, order: null };
  const pr = draftPrompt(ru, [{ ru: 'Шкафы от 90 000 ₽.', en: 'Wardrobes from $1,200.' }], new Date('2026-11-05T09:00:00Z'));
  assert.match(pr, /Шкафы от 90 000 ₽/);
  assert.ok(!pr.includes('$1,200'));
  assert.match(pr, /Do not mention rush slots/);
  const tight = draftPrompt({ ...ru, deadline: { date: '2026-11-20', text: 'до 20 ноября' } }, [], new Date('2026-11-05T09:00:00Z'));
  assert.match(tight, /confirm whether a rush slot is free/);
  assert.equal(tidyDraft('Hi Sarah, \nwe would be happy to help.\nOakbloom team', 'en'), 'Hi Sarah,\n\nWe would be happy to help.\n\nOakbloom team');
  assert.equal(tidyDraft('Здравствуйте, Олег.\nСпасибо.\n\nКоманда Oakbloom', 'ru'), 'Здравствуйте, Олег.\nСпасибо.\n\nКоманда Oakbloom');
});
