import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, say, press, ANNA, BORIS, VIKA, NOW, textOf, btn, buttons, last, sent, row, SECRET } from './helpers.mjs';
import worker from '../src/worker.js';

test('webhook: rejects a missing or wrong secret, bad JSON, GET; health is ok', async () => {
  const env = makeEnv();
  assert.equal((await say(env, ANNA, 'hi', { secret: null })).status, 403);
  assert.equal((await say(env, ANNA, 'hi', { secret: 'nope' })).status, 403);
  assert.equal(env.TG_OUTBOX.length, 0);
  const bad = await worker.fetch(new Request('https://x/webhook', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET }, body: '{' }), env);
  assert.equal(bad.status, 400);
  assert.equal((await worker.fetch(new Request('https://x/webhook'), env)).status, 405);
  assert.equal(await (await worker.fetch(new Request('https://x/health'), env)).text(), 'ok');
});

test('/start greets in the user language with the owner menu and seeds a demo sandbox', async () => {
  const env = makeEnv();
  let r = await say(env, ANNA, '/start');
  const m = last(r.out);
  assert.match(m.text, /Hi, Anna! I run the channel «Pinecone Coffee Notes»/);
  assert.match(m.text, /Demo mode/);
  assert.deepEqual(m.reply_markup.keyboard.flat().map((b) => b.text), ['➕ New post', '✨ AI draft', '🗓 Queue', '📊 Stats', '⚙️ Schedule', '💳 Paid access']);
  const c = await row(env, "SELECT SUM(status='published') AS pub, SUM(status='approved') AS ap, SUM(status='draft') AS dr FROM posts WHERE ws = 'u501'");
  assert.deepEqual({ ...c }, { pub: 11, ap: 2, dr: 1 });

  r = await say(env, BORIS, '/start');
  assert.match(last(r.out).text, /Привет, Борис! Я веду для вас канал «Кофейные заметки Pinecone»/);
  assert.equal(last(r.out).reply_markup.keyboard[0][0].text, '➕ Новый пост');
  r = await say(env, BORIS, '/lang');
  assert.equal(last(r.out).text, 'Language: English.');
  assert.equal(last(r.out).reply_markup.keyboard[0][0].text, '➕ New post');
});

test('a text post becomes a draft with a preview that keeps formatting, plus Approve / Edit / Time / Delete', async () => {
  const env = makeEnv();
  const entities = [{ type: 'bold', offset: 0, length: 5 }, { type: 'text_link', offset: 6, length: 4, url: 'https://example.com' }];
  const r = await say(env, ANNA, { text: 'Hello beans and brew', entities });
  const p = last(r.out);
  assert.equal(p.method, 'sendMessage');
  assert.match(p.text, /^Hello beans and brew\n\n— — —\n📝 Draft #15 · ✍️ by you$/);
  assert.deepEqual(p.entities, entities);
  assert.deepEqual(buttons(p).map((b) => b.callback_data), ['p:ok:15', 'p:ed:15', 'p:tm:15', 'p:del:15']);
  const db = await row(env, 'SELECT * FROM posts WHERE id = 15');
  assert.equal(db.status, 'draft');
  assert.deepEqual(JSON.parse(db.entities), entities);
});

test('a photo with a caption becomes a photo draft (largest size); too long or unsupported content is refused', async () => {
  const env = makeEnv();
  let r = await say(env, ANNA, { photo: 'PHOTO_BIG', caption: 'Latte art 101' });
  const p = last(r.out);
  assert.equal(p.method, 'sendPhoto');
  assert.equal(p.photo, 'PHOTO_BIG');
  assert.match(p.caption, /^Latte art 101\n\n— — —\n📝 Draft #15/);
  r = await say(env, ANNA, { photo: 'P2', caption: 'x'.repeat(1100) });
  assert.match(last(r.out).text, /up to 1024 characters; this one has 1100/);
  r = await say(env, ANNA, { sticker: { file_id: 'S' } });
  assert.match(last(r.out).text, /I can queue text and photos/);
  // A caption near the limit still fits in the preview: trimmed there, stored in full.
  r = await say(env, ANNA, { photo: 'P3', caption: 'y'.repeat(1020) });
  assert.ok(last(r.out).caption.length <= 1024);
  assert.equal((await row(env, "SELECT LENGTH(text) AS n FROM posts WHERE photo = 'P3'")).n, 1020);
});

test('Approve puts the draft into the next free slot; Back to drafts frees it; Delete removes it', async () => {
  const env = makeEnv();
  let r = await say(env, ANNA, 'Approve me');
  const prev = last(r.out);
  // Seed holds 13:00 and 19:00 today, so the next free slot is tomorrow 09:00.
  r = await press(env, ANNA, 'p:ok:15', prev);
  const edit = r.out.find((c) => c.method === 'editMessageText');
  assert.match(edit.text, /✅ Approved #15 · goes out Fri 6 Nov, 09:00 \(UTC\)/);
  assert.deepEqual(buttons(edit).map((b) => b.callback_data), ['p:now:15', 'p:tm:15', 'p:back:15']);
  assert.deepEqual(edit.reply_markup.inline_keyboard.map((r) => r.length), [1, 2], '«Publish now» gets its own row');
  assert.equal(last(r.out).method, 'answerCallbackQuery');
  assert.equal(last(r.out).text, 'Approved: Fri 6 Nov, 09:00');
  assert.equal((await row(env, 'SELECT scheduled_at FROM posts WHERE id = 15')).scheduled_at, Date.UTC(2026, 10, 6, 9));

  r = await say(env, ANNA, 'Second');
  await press(env, ANNA, 'p:ok:16', last(r.out));
  assert.equal((await row(env, 'SELECT scheduled_at FROM posts WHERE id = 16')).scheduled_at, Date.UTC(2026, 10, 6, 13), 'one post per slot');

  r = await press(env, ANNA, 'p:back:15', edit);
  assert.match(r.out[0].text, /📝 Draft #15/);
  assert.equal((await row(env, 'SELECT status, scheduled_at FROM posts WHERE id = 15')).scheduled_at, null);

  r = await press(env, ANNA, 'p:del:15', r.out[0]);
  assert.equal(r.out[0].text, '🗑 Draft #15 deleted.');
  assert.equal(await row(env, 'SELECT * FROM posts WHERE id = 15'), null);
  r = await press(env, ANNA, 'p:ok:15', prev);
  assert.equal(last(r.out).text, 'This post is gone (deleted or reset).');
});

test('Edit replaces the text (or the photo) of a draft; the old preview is marked replaced, a fresh one is sent', async () => {
  const env = makeEnv();
  let r = await say(env, ANNA, { photo: 'OLD', caption: 'Old caption' });
  r = await press(env, ANNA, 'p:ed:15', { ...last(r.out), message_id: 777 });
  assert.match(sent(r.out)[0].text, /Send the new version of #15/);
  r = await say(env, ANNA, 'New caption');
  assert.deepEqual(r.out[0], { method: 'editMessageCaption', chat_id: 501, message_id: 777, reply_markup: { inline_keyboard: [] }, caption: '✏️ #15 was changed: the new version is below.' });
  assert.equal(last(r.out).method, 'sendPhoto');
  assert.equal(last(r.out).photo, 'OLD');
  assert.match(last(r.out).caption, /^New caption\n/);
  await press(env, ANNA, 'p:ed:15', last(r.out));
  r = await say(env, ANNA, { photo: 'NEW' });
  assert.equal(last(r.out).photo, 'NEW');
  assert.match(last(r.out).caption, /^New caption\n/, 'a photo without caption keeps the text');
  await press(env, ANNA, 'p:ed:15', last(r.out));
  r = await say(env, ANNA, '/cancel');
  assert.equal(last(r.out).text, 'OK, cancelled.');
  r = await say(env, ANNA, 'this is a new post now');
  assert.match(last(r.out).text, /Draft #16/);
});

test('Set time: owner types a time; the preview updates in place and a short card with buttons answers', async () => {
  const env = makeEnv();
  let r = await say(env, BORIS, 'Пост ко времени');
  r = await press(env, BORIS, 'p:tm:15', { ...last(r.out), message_id: 555 });
  assert.match(sent(r.out)[0].text, /Когда выпустить #15\? Время UTC/);
  r = await say(env, BORIS, 'когда-нибудь');
  assert.match(last(r.out).text, /Не понял время/);
  r = await say(env, BORIS, 'завтра 7:45');
  const inPlace = r.out.find((c) => c.method === 'editMessageText');
  assert.equal(inPlace.message_id, 555);
  assert.match(inPlace.text, /^Пост ко времени\n\n— — —\n✅ Одобрен #15 · выйдет пт, 6 ноя, 07:45 \(UTC\)$/);
  const card = last(r.out);
  assert.equal(card.text, '✅ Одобрен #15 · выйдет пт, 6 ноя, 07:45 (UTC)');
  assert.deepEqual(buttons(card).map((b) => b.callback_data), ['c:now:15', 'c:tm:15', 'c:back:15']);
  assert.equal((await row(env, 'SELECT scheduled_at FROM posts WHERE id = 15')).scheduled_at, Date.UTC(2026, 10, 6, 7, 45));
  // A photo instead of a typed time: the question is dropped and the photo becomes a new draft.
  await press(env, BORIS, 'p:tm:15', last(r.out));
  r = await say(env, BORIS, { photo: 'X', caption: 'не время' });
  assert.match(last(r.out).caption, /Черновик #16/);
  r = await say(env, BORIS, '12:00');
  assert.match(last(r.out).text, /^12:00\n\n— — —\n📝 Черновик #17/, 'the next text is a post, not a time');
  // Card buttons re-draw the card, not a full preview.
  r = await press(env, BORIS, 'c:back:15', { ...card, message_id: 556 });
  assert.equal(r.out[0].method, 'editMessageText');
  assert.equal(r.out[0].text, '📝 Черновик #15 · ✍️ ваш текст');
  assert.equal(buttons(r.out[0])[0].callback_data, 'c:ok:15');
});

test('Queue lists scheduled posts by time and the drafts, with buttons that open previews', async () => {
  const env = makeEnv();
  await say(env, ANNA, { photo: 'Q', caption: 'Photo draft' });
  const r = await say(env, ANNA, '🗓 Queue');
  const q = last(r.out);
  assert.match(q.text, /Slots: 09:00 · 13:00 · 19:00 \(UTC\)/);
  assert.match(q.text, /Scheduled \(2\):\n• Thu 5 Nov, 13:00 — #12 🚫 Common mistakes with a French press\n• Thu 5 Nov, 19:00 — #13 ☀️ Weekend idea/);
  assert.match(q.text, /Drafts waiting for you \(2\):\n• #15 🖼 Photo draft\n• #14 📣 Next week/);
  assert.deepEqual(buttons(q).map((b) => b.callback_data), ['p:open:12', 'p:open:13', 'p:open:15', 'p:open:14', 'sched']);
  const o = await press(env, ANNA, 'p:open:12', q);
  assert.match(o.out[0].text, /✅ Approved #12 · goes out Thu 5 Nov, 13:00/);
});

test('Schedule: presets, custom slots, time zone; validation', async () => {
  const env = makeEnv();
  let r = await say(env, ANNA, '⚙️ Schedule');
  assert.deepEqual(buttons(last(r.out)).map((b) => b.text), ['1×/day: 10:00', '2×/day: 09:00 · 19:00', '3×/day: 09:00 · 13:00 · 19:00', '✍️ My own times']);
  r = await press(env, ANNA, 'slots:1', last(r.out));
  assert.equal(r.out[0].text, 'Saved. Slots: 09:00 · 19:00 (UTC).');
  r = await say(env, ANNA, '/slots 25:00');
  assert.match(last(r.out).text, /Times look like/);
  r = await say(env, ANNA, '/slots 20:00 08:30');
  assert.equal(last(r.out).text, 'Saved. Slots: 08:30 · 20:00 (UTC).');
  r = await say(env, ANNA, '/tz +5:30');
  assert.equal(last(r.out).text, 'Time zone saved: UTC+5:30.');
  r = await say(env, ANNA, '/tz moon');
  assert.match(last(r.out).text, /Time zone looks like/);
  r = await say(env, ANNA, '/title Bean There');
  assert.equal(last(r.out).text, 'Channel name saved: «Bean There».');
  // Next free slot now: local (UTC+5:30) is 15:50 -> 20:00 local = 14:30 UTC.
  r = await say(env, ANNA, 'slot test');
  r = await press(env, ANNA, 'p:ok:15', last(r.out));
  assert.match(r.out[0].text, /goes out Thu 5 Nov, 20:00 \(UTC\+5:30\)/);
  assert.equal((await row(env, 'SELECT scheduled_at FROM posts WHERE id = 15')).scheduled_at, Date.UTC(2026, 10, 5, 14, 30));
});

test('Stats count what was published, the queue and the paid access', async () => {
  const env = makeEnv();
  const r = await say(env, ANNA, '📊 Stats');
  const s = last(r.out);
  assert.match(s.text, /Published: 11 in total, 11 in the last 7 days/);
  assert.match(s.text, /Fri 30 {2}▇▇ 2\nSat 31 {2}▇ 1\nSun {2}1 {2}▇▇▇ 3/);
  assert.match(s.text, /Thu {2}5 {2}· 0/);
  assert.match(s.text, /With photo: 5 · text only: 6/);
  assert.match(s.text, /AI drafts: 4 · written by you: 7/);
  assert.match(s.text, /Queue: 2 scheduled, next Thu 5 Nov, 13:00; content until Thu 5 Nov, 19:00/);
  assert.match(s.text, /Drafts waiting: 1/);
  assert.match(s.text, /Paid access: 0 active · \$0 \(mock payments\)/);
  const pre = s.entities[0];
  assert.equal(pre.type, 'pre');
  assert.ok(s.text.slice(pre.offset, pre.offset + pre.length).split('\n').length === 7);
});

test('/reset restores the sandbox; /reset is refused in live mode', async () => {
  const env = makeEnv();
  await say(env, ANNA, 'extra post');
  let r = await say(env, ANNA, '/reset');
  assert.match(last(r.out).text, /Sandbox reset/);
  assert.equal((await row(env, "SELECT COUNT(*) AS n FROM posts WHERE ws = 'u501'")).n, 14);
  const live = makeEnv({ DEMO_MODE: 'off', OWNER_IDS: '501' });
  r = await say(live, ANNA, '/reset');
  assert.equal(last(r.out).text, '/reset only works in demo mode.');
});

test('live mode: only OWNER_IDS manage the channel, others get the subscriber menu and cannot press post buttons', async () => {
  const env = makeEnv({ DEMO_MODE: 'off', OWNER_IDS: '501', CHANNEL_ID: '@pinecone_demo', CHANNEL_TITLE: 'Pinecone' });
  let r = await say(env, ANNA, '/start');
  assert.match(last(r.out).text, /I run the channel «Pinecone»/);
  assert.doesNotMatch(last(r.out).text, /Demo mode/);
  assert.equal((await row(env, 'SELECT COUNT(*) AS n FROM posts')).n, 0, 'no demo seed in live mode');
  r = await say(env, ANNA, 'Owner post');
  assert.match(last(r.out).text, /Draft #1/);

  r = await say(env, VIKA, '/start');
  assert.match(last(r.out).text, /sells access to the private channel «Pinecone»/);
  assert.deepEqual(last(r.out).reply_markup.keyboard.flat().map((b) => b.text), ['💳 Subscribe', '🎫 My access']);
  r = await say(env, VIKA, 'please post this');
  assert.match(last(r.out).text, /This bot sells access/);
  assert.equal((await row(env, 'SELECT COUNT(*) AS n FROM posts')).n, 1);
  r = await press(env, VIKA, 'p:ok:1');
  assert.equal(r.out.length, 1);
  assert.equal(r.out[0].method, 'answerCallbackQuery');
  assert.equal((await row(env, 'SELECT status FROM posts WHERE id = 1')).status, 'draft');
});

test('demo sandboxes are isolated: one visitor cannot touch another visitor post', async () => {
  const env = makeEnv();
  await say(env, ANNA, 'Anna only');
  const anna = await row(env, "SELECT id FROM posts WHERE ws = 'u501' AND text = 'Anna only'");
  const r = await press(env, BORIS, `p:del:${anna.id}`);
  assert.equal(last(r.out).text, 'Этого поста уже нет (удалён или сброшен).');
  assert.ok(await row(env, 'SELECT id FROM posts WHERE id = ?', anna.id));
});
