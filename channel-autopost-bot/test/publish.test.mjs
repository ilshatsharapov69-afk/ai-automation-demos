import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, say, press, cron, ANNA, BORIS, NOW, textOf, buttons, last, sent, row } from './helpers.mjs';
import { HOUR, MIN } from '../src/time.js';

test('cron publishes due posts exactly once, in time order; demo posts come back to the owner chat with a notice', async () => {
  const env = makeEnv();
  await say(env, ANNA, '/start');
  assert.equal((await cron(env, NOW)).length, 0, 'nothing due at 10:20');
  let out = await cron(env, Date.UTC(2026, 10, 5, 13, 0));
  const msgs = sent(out);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].chat_id, 501);
  assert.match(msgs[0].text, /^🚫 Common mistakes with a French press/);
  assert.equal(msgs[0].entities, undefined);
  assert.match(msgs[1].text, /↑ Published to «Pinecone Coffee Notes»/);
  assert.equal(msgs[1].reply_parameters.message_id, 1000 + env.TG_OUTBOX.indexOf(env.TG_OUTBOX.find((c) => c === msgs[0])) + 1);
  const p = await row(env, 'SELECT * FROM posts WHERE id = 12');
  assert.equal(p.status, 'published');
  assert.equal(p.published_at, Date.UTC(2026, 10, 5, 13, 0));
  assert.ok(p.channel_msg_id > 1000);
  assert.equal((await cron(env, Date.UTC(2026, 10, 5, 13, 5))).length, 0, 'not sent twice');
  out = await cron(env, Date.UTC(2026, 10, 6, 0, 0));
  assert.match(sent(out)[0].text, /^☀️ Weekend idea/);
});

test('live mode: posts go to CHANNEL_ID with their photo and formatting; no demo notice', async () => {
  const env = makeEnv({ DEMO_MODE: 'off', OWNER_IDS: '501', CHANNEL_ID: '@pinecone_demo' });
  const caption_entities = [{ type: 'bold', offset: 0, length: 5 }];
  let r = await say(env, ANNA, { photo: 'PIC', caption: 'Latte art at home', caption_entities });
  await press(env, ANNA, 'p:ok:1', last(r.out)); // next slot: 13:00 today
  const out = await cron(env, Date.UTC(2026, 10, 5, 13, 2));
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { method: 'sendPhoto', chat_id: '@pinecone_demo', photo: 'PIC', caption: 'Latte art at home', caption_entities });
  // /channel overrides the configured channel.
  r = await say(env, ANNA, '/channel -1001234567890');
  assert.match(last(r.out).text, /Posts will go to -1001234567890/);
  r = await say(env, ANNA, 'second');
  await press(env, ANNA, 'p:ok:2', last(r.out));
  assert.equal(sent(await cron(env, Date.UTC(2026, 10, 5, 19, 0)))[0].chat_id, '-1001234567890');
  r = await say(env, ANNA, '/channel my channel');
  assert.match(last(r.out).text, /@username or its numeric id/);
});

test('a failed publish is marked, the owner is told why, and «Try again» re-sends it', async () => {
  let fail = true;
  const env = makeEnv({ DEMO_MODE: 'off', OWNER_IDS: '501', CHANNEL_ID: '@pinecone_demo', TG_FAKE: (m, p) => (fail && p.chat_id === '@pinecone_demo' ? { ok: false, description: 'Bad Request: chat not found' } : null) });
  let r = await say(env, ANNA, 'Will fail');
  await press(env, ANNA, 'p:ok:1', last(r.out));
  let out = await cron(env, Date.UTC(2026, 10, 5, 13, 0));
  const note = sent(out).find((c) => c.chat_id === 501);
  assert.match(note.text, /Post #1 was not published: Bad Request: chat not found/);
  assert.match(note.text, /admin of the channel/);
  assert.equal((await row(env, 'SELECT status, error FROM posts WHERE id = 1')).status, 'failed');
  assert.equal((await cron(env, Date.UTC(2026, 10, 5, 13, 5))).length, 0, 'failed posts are not retried blindly');
  r = await press(env, ANNA, 'p:open:1');
  assert.match(r.out[0].text, /⚠️ #1 was not published: Bad Request: chat not found/);
  assert.deepEqual(buttons(r.out[0]).map((b) => b.callback_data), ['p:now:1', 'p:back:1']);
  fail = false;
  r = await press(env, ANNA, 'p:now:1', r.out[0]);
  assert.equal(r.out[0].chat_id, '@pinecone_demo');
  assert.match(r.out.find((c) => c.method === 'editMessageText').text, /📣 Published #1/);
  assert.equal(last(r.out).text, 'Published');
});

test('Publish now sends a draft at once; a second press does not send it again', async () => {
  const env = makeEnv();
  let r = await say(env, BORIS, 'Срочная новость');
  const prev = last(r.out);
  r = await press(env, BORIS, 'p:now:15', prev);
  assert.equal(sent(r.out)[0].text, 'Срочная новость');
  assert.match(sent(r.out)[1].text, /Опубликовано в «Кофейные заметки Pinecone»/);
  assert.match(r.out.find((c) => c.method === 'editMessageText').text, /📣 Опубликован #15/);
  assert.deepEqual(buttons(r.out.find((c) => c.method === 'editMessageText')), []);
  r = await press(env, BORIS, 'p:now:15', prev);
  assert.equal(sent(r.out).length, 0);
  assert.equal(last(r.out).text, 'Уже опубликован.');
  assert.match(r.out[0].text, /📣 Опубликован #15/, 'the stale preview is re-drawn as published');
  r = await press(env, BORIS, 'p:del:15', prev);
  assert.ok(await row(env, 'SELECT id FROM posts WHERE id = 15'), 'a published post cannot be deleted from the bot');
});

test('a post stuck in «publishing» (Worker died mid-send) is released as failed, not re-sent', async () => {
  const env = makeEnv({ DEMO_MODE: 'off', OWNER_IDS: '501', CHANNEL_ID: '@c' });
  await say(env, ANNA, 'stuck');
  await env.DB.prepare("UPDATE posts SET status = 'publishing', scheduled_at = ?, updated_at = ? WHERE id = 1").bind(NOW - HOUR, NOW - HOUR).run();
  const out = await cron(env, NOW);
  assert.equal(out.length, 0);
  assert.deepEqual({ ...(await row(env, 'SELECT status, error FROM posts WHERE id = 1')) }, { status: 'failed', error: 'interrupted' });
});
