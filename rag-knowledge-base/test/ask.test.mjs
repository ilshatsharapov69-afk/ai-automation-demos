// The whole question path through the Worker with a fake AI and a fake vector index: cache, budget, refusal, citations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../data/docs.js';
import { makeEnv, call, ask, fakeAi, fakeVectorize, ADMIN } from './helpers.mjs';

const answering = (text) => fakeAi(() => ({ response: text }));

test('answerable question: hybrid sources, numbered for the prompt, citations cleaned', async () => {
  const env = makeEnv({ AI: answering('Доставка по городу стоит 1 500 ₽ [1]. Бесплатно от 30 000 ₽ [1, 2]. Что-то лишнее [9].') });
  const r = await ask(env, 'Сколько стоит доставка по городу?');
  assert.equal(r.status, 200);
  const b = r.body;
  assert.equal(b.mode, 'ai');
  assert.equal(b.refused, false);
  assert.equal(b.answer, 'Доставка по городу стоит 1 500 ₽ [1]. Бесплатно от 30 000 ₽ [1][2]. Что-то лишнее.');
  assert.deepEqual(b.cited, [1, 2]);
  assert.equal(b.sources[0].doc_id, 'd01');
  assert.ok(b.sources.some((s) => s.found_by === 'both'), 'a chunk found by vector and full-text search');
  assert.ok(b.sources.every((s) => ['vector', 'fts', 'both'].includes(s.found_by)));
  assert.deepEqual(b.sources.slice(0, 4).map((s) => s.n), [1, 2, 3, 4]);
  assert.ok(b.sources.slice(4).every((s) => s.n === null), 'only the first four passages go to the model');
  const chat = env.AI.chatCalls();
  assert.equal(chat.length, 1);
  assert.equal(chat[0].model, 'test-chat-model');
  assert.match(chat[0].input.messages[0].content, /\[1\] .*\n/);
});

test('weak retrieval: the base says it has no answer and the language model is never called', async () => {
  const env = makeEnv({ VECTORIZE: fakeVectorize([{ id: 'd16#1', score: 0.46 }]), AI: answering('invented answer [1]') });
  const r = await ask(env, 'Как зовут директора компании?');
  assert.equal(r.body.refused, true);
  assert.equal(r.body.reason, 'weak_retrieval');
  assert.equal(r.body.answer, 'В базе нет ответа на этот вопрос.');
  assert.equal(env.AI.chatCalls().length, 0);
  assert.ok(r.body.sources.length > 0, 'the panel still shows what was closest');
});

test('English question, weak retrieval: refusal in English', async () => {
  const env = makeEnv({ VECTORIZE: fakeVectorize([{ id: 'd24#0', score: 0.3 }]) });
  const r = await ask(env, 'Do you sell electric scooters?');
  assert.equal(r.body.answer, 'The knowledge base has no answer to this question.');
});

test('the model itself can say there is no answer', async () => {
  const env = makeEnv({ AI: answering('В базе нет ответа на этот вопрос.') });
  const r = await ask(env, 'Сколько стоит сборка шкафа-купе?');
  assert.deepEqual([r.body.refused, r.body.reason, r.body.cited], [true, 'model', []]);
});

test('an answer without any citation is flagged', async () => {
  const env = makeEnv({ AI: answering('Доставка стоит 1 500 рублей.') });
  const r = await ask(env, 'Сколько стоит доставка по городу?');
  assert.equal(r.body.uncited, true);
});

test('example questions: the first run is generated and cached, the second is free', async () => {
  const env = makeEnv({ AI: answering('Ответ [1].') });
  const q = EXAMPLES[0].ru;
  const first = await ask(env, q);
  assert.equal(first.body.cached, undefined);
  const aiCalls = env.AI.calls.length;
  const daily = (await call(env, 'GET', '/api/status')).body.dayLeft;
  const second = await ask(env, q);
  assert.equal(second.body.cached, true);
  assert.equal(second.body.answer, first.body.answer);
  assert.equal(env.AI.calls.length, aiCalls, 'no embedding and no chat call for a cached answer');
  assert.equal((await call(env, 'GET', '/api/status')).body.dayLeft, daily, 'the budget is untouched');
});

test('cached examples are served even when the visitor and the day are out of budget', async () => {
  const env = makeEnv({ AI: answering('Ответ [1].'), DAILY_CAP: '1' });
  await ask(env, EXAMPLES[1].en);
  const other = await ask(env, 'Совсем другой вопрос про доставку?');
  assert.equal(other.body.mode, 'search_only');
  const again = await ask(env, EXAMPLES[1].en);
  assert.equal(again.body.cached, true);
  assert.equal(again.body.mode, 'ai');
});

test('per-IP cap: the seventh question in an hour gets search results only, with no AI call', async () => {
  const env = makeEnv({ AI: answering('Ответ [1].') });
  for (let i = 0; i < 6; i++) assert.equal((await ask(env, `Вопрос номер ${i} про доставку`)).body.mode, 'ai');
  const before = env.AI.calls.length;
  const r = await ask(env, 'Ещё один вопрос про доставку');
  assert.deepEqual([r.body.mode, r.body.reason, r.body.answer], ['search_only', 'ip', null]);
  assert.ok(r.body.sources.length > 0, 'full-text results are still shown');
  assert.equal(env.AI.calls.length, before, 'not even an embedding call');
  const other = await ask(env, 'Вопрос про доставку', { headers: { 'CF-Connecting-IP': '198.51.100.9' } });
  assert.equal(other.body.mode, 'ai', 'another visitor is not affected');
});

test('global daily cap (env) stops generation for everybody', async () => {
  const env = makeEnv({ AI: answering('Ответ [1].'), DAILY_CAP: '2' });
  await ask(env, 'Первый вопрос про доставку', { headers: { 'CF-Connecting-IP': '198.51.100.1' } });
  await ask(env, 'Второй вопрос про доставку', { headers: { 'CF-Connecting-IP': '198.51.100.2' } });
  const r = await ask(env, 'Третий вопрос про доставку', { headers: { 'CF-Connecting-IP': '198.51.100.3' } });
  assert.deepEqual([r.body.mode, r.body.reason], ['search_only', 'global']);
  assert.equal(env.AI.chatCalls().length, 2);
});

test('the admin key lifts the limits and refreshes the cache', async () => {
  const env = makeEnv({ AI: answering('Ответ [1].'), PER_IP_HOURLY: '1' });
  const h = { 'X-Admin-Key': ADMIN };
  for (let i = 0; i < 3; i++) assert.equal((await ask(env, `Вопрос ${i} про доставку`, { headers: h })).body.mode, 'ai');
  await ask(env, EXAMPLES[2].ru, { headers: h });
  await ask(env, EXAMPLES[2].ru, { headers: h });
  assert.equal(env.AI.chatCalls().length, 5, 'admin never reads the cache, so warm-up always regenerates');
});

test('AI failure: the visitor still gets search results, not an error page', async () => {
  const env = makeEnv({ AI: fakeAi(() => { throw new Error('boom'); }) });
  const r = await ask(env, 'Сколько стоит доставка по городу?');
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.mode, r.body.reason], ['search_only', 'error']);
});

test('embedding failure falls back to full-text results', async () => {
  const env = makeEnv({ VECTORIZE: { async query() { throw new Error('index down'); } } });
  const r = await ask(env, 'Сколько стоит доставка по городу?');
  assert.deepEqual([r.status, r.body.mode, r.body.reason], [200, 'search_only', 'error']);
  assert.ok(r.body.sources.length > 0);
});

test('bad input is a 400, not a crash', async () => {
  const env = makeEnv();
  assert.equal((await ask(env, 'a')).status, 400);
  assert.equal((await ask(env, 'x'.repeat(301))).status, 400);
  assert.equal((await call(env, 'POST', '/api/ask', { json: {} })).status, 400);
});

test('the status route, the documents API and the page', async () => {
  const env = makeEnv();
  const s = await call(env, 'GET', '/api/status');
  assert.deepEqual([s.body.docs, s.body.per_ip_hourly, s.body.daily_cap], [25, 6, 80]);
  assert.ok(s.body.chunks > 25);
  const list = await call(env, 'GET', '/api/docs');
  assert.equal(list.body.docs.length, 25);
  const one = await call(env, 'GET', '/api/docs/d05');
  assert.equal(one.status, 200);
  assert.ok(one.body.chunks.length >= 2 && one.body.body.includes('14 дней'));
  assert.equal((await call(env, 'GET', '/api/docs/nope')).status, 404);
  const page = await call(env, 'GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.body, /Harborline/);
  assert.match(page.body, /Fictional company/);
  assert.ok(!/\u2014/.test(page.body), 'no em dash on the page');
});

test('retrieval route is admin only', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'GET', '/api/search?q=доставка')).status, 403);
  const ok = await call(env, 'GET', '/api/search?q=доставка', { headers: { 'X-Admin-Key': ADMIN } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.hits.length > 0 && ok.body.lists.vector.length > 0);
});

test('there is no ingestion route', async () => {
  const env = makeEnv();
  for (const p of ['/api/ingest', '/ingest', '/api/admin/ingest']) {
    assert.equal((await call(env, 'POST', p, { json: {}, headers: { 'X-Admin-Key': ADMIN } })).status, 404);
  }
});
