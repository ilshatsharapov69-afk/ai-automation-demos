import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDraft, templateDraft, cleanDraft, hashtags, MODEL, MAX_LEN } from '../src/ai.js';
import { makeEnv, say, press, ANNA, BORIS, textOf, btn, last, row } from './helpers.mjs';

const fakeAI = (response, calls = []) => ({ run: async (model, input) => { calls.push({ model, input }); if (response instanceof Error) throw response; return { response }; } });

test('Workers AI is called with the channel name, language and topic; output is cleaned to plain text', async () => {
  const calls = [];
  const env = { AI: fakeAI('Here is a draft:\n**☕ Store beans right** \n\n- in a sealed jar\n- away from light\n\nHow do you keep yours?', calls) };
  const r = await generateDraft(env, { topic: 'how to store coffee beans', lang: 'en', title: 'Pinecone Coffee Notes' });
  assert.equal(r.engine, 'ai');
  assert.equal(calls[0].model, MODEL);
  assert.match(calls[0].input.messages[0].content, /Pinecone Coffee Notes/);
  assert.match(calls[0].input.messages[1].content, /how to store coffee beans/);
  assert.equal(r.text, '☕ Store beans right\n\n• in a sealed jar\n• away from light\n\nHow do you keep yours?');
  const ru = [];
  await generateDraft({ AI: fakeAI('x'.repeat(50), ru) }, { topic: 'тема', lang: 'ru', title: 'Канал' });
  assert.match(ru[0].input.messages[0].content, /по-русски/);
});

test('offline template when there is no AI, AI is off, the call fails or returns nothing', async () => {
  for (const [env, reason] of [[{}, 'no-ai'], [{ AI: fakeAI('ok'.repeat(40)), AI_MODE: 'off' }, 'no-ai'], [{ AI: fakeAI(new Error('boom')) }, 'error'], [{ AI: fakeAI('') }, 'empty']]) {
    const r = await generateDraft(env, { topic: 'pour-over at home', lang: 'en', title: 'X' });
    assert.equal(r.engine, 'stub');
    assert.equal(r.reason, reason);
    assert.match(r.text, /Pour-over at home/i);
    assert.match(r.text, /#pour #over|#home/);
  }
  const limited = await generateDraft({ AI: fakeAI('never') }, { topic: 't', lang: 'en', budgetOk: false });
  assert.equal(limited.reason, 'limit');
});

test('template: deterministic, follows the topic kind and language, variants differ, length capped', () => {
  assert.equal(templateDraft('coffee grinder tips', 'en'), templateDraft('coffee grinder tips', 'en'));
  assert.notEqual(templateDraft('coffee grinder tips', 'en', 0), templateDraft('coffee grinder tips', 'en', 1));
  assert.match(templateDraft('ошибки при заваривании пуровера', 'ru'), /Спешить на первом шаге/);
  assert.match(templateDraft('скидка 20% на зёрна', 'ru'), /Мы подготовили кое-что новое/);
  assert.match(templateDraft('why is my espresso sour?', 'en'), /Short answer/);
  assert.deepEqual(hashtags('How to brew the perfect cold brew at home'), ['#brew', '#cold', '#home']);
  assert.deepEqual(hashtags('Лучший способ хранить зёрна'), ['#способ', '#хранить', '#зёрна']);
  assert.ok(cleanDraft('a. '.repeat(600)).length <= MAX_LEN);
});

test('bot: «AI draft» asks for a topic, sends a preview marked as AI with Regenerate; daily limit falls back to the template', async () => {
  const env = makeEnv({ AI: fakeAI('☕ A fine post about grinders.\n\nWhat grinder do you use? 👇 #coffee'), AI_DAILY_LIMIT: '2' });
  let r = await say(env, ANNA, '✨ AI draft');
  assert.match(textOf(last(r.out)), /What should the post be about/);
  r = await say(env, ANNA, 'choosing a coffee grinder');
  assert.equal(r.out[0].method, 'sendChatAction');
  const prev = last(r.out);
  assert.match(textOf(prev), /A fine post about grinders/);
  assert.match(textOf(prev), /Draft #\d+ · ✨ AI draft \(Workers AI\)/);
  assert.ok(btn(prev, 'Approve') && btn(prev, 'Edit') && btn(prev, 'Another version'));
  const id = Number(btn(prev, 'Approve').callback_data.split(':')[2]);
  assert.equal((await row(env, 'SELECT source, topic FROM posts WHERE id = ?', id)).topic, 'choosing a coffee grinder');

  r = await press(env, ANNA, `p:rg:${id}`, prev); // 2nd AI call of the day
  assert.equal(r.out[0].method, 'editMessageText');
  assert.equal((await row(env, 'SELECT variant FROM posts WHERE id = ?', id)).variant, 1);

  r = await say(env, ANNA, '/draft cold brew'); // 3rd: over the limit of 2
  assert.match(textOf(r.out.find((c) => c.method === 'sendMessage')), /AI limit for today \(2 drafts\)/);
  assert.match(textOf(last(r.out)), /offline template/);

  const b = makeEnv();
  r = await say(b, BORIS, '/draft как хранить кофейные зёрна дома');
  assert.match(textOf(last(r.out)), /черновик ИИ \(офлайн-шаблон\)/);
  assert.match(textOf(last(r.out)), /как хранить кофейные зёрна дома/i);
});
