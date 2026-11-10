// End-to-end through the Worker's fetch(): all three channels, owner cards, Approve / Edit / Reject in Telegram,
// the web inbox and its access rules. In-process with a SQLite-backed D1 shim; Telegram calls land in `outbox`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from './samples.js';
import { makeEnv, call, postSample, tgMessage, tgTap, asOwner, OWNER, ADMIN } from './helpers.mjs';

const OWNER_USER = { id: OWNER, first_name: 'Owner', language_code: 'en' };
const bySample = (id) => SAMPLES.find((s) => s.id === id);
const cards = (outbox, chat = OWNER) => outbox.filter((o) => o.method === 'sendMessage' && o.chat_id === chat && o.reply_markup?.inline_keyboard?.[0]?.length === 3);

async function loadAll(env) {
  const res = {};
  for (const s of SAMPLES) {
    const r = await postSample(env, s);
    assert.equal(r.status, 200, `${s.id}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    res[s.id] = r.body;
  }
  return res;
}
const rows = async (env) => (await asOwner(env)).body.requests;

test('all samples flow through form, email webhook and Telegram; only hot leads reach the owner', async () => {
  const env = makeEnv();
  const out = await loadAll(env);
  const list = await rows(env);
  assert.equal(list.length, SAMPLES.length);
  for (const s of SAMPLES) {
    const body = out[s.id];
    const outbox = body.outbox;
    const ownerCards = cards(outbox);
    if (s.channel !== 'telegram') {
      assert.equal(body.request.category, s.expect.category, `${s.id} category`);
      assert.equal(body.request.hot, s.expect.hot, `${s.id} hot`);
      assert.equal(body.request.classified_by, 'rules', 'no AI binding -> rules');
      assert.equal(body.request.status, s.expect.category === 'spam' ? 'spam' : 'new');
    }
    assert.equal(ownerCards.length, s.expect.hot ? 1 : 0, `${s.id}: owner card only for hot leads`);
    if (s.expect.hot) {
      const card = ownerCards[0];
      assert.match(card.text, /🔥 Hot lead #\d+/);
      assert.match(card.text, /Why: /);
      assert.deepEqual(card.reply_markup.inline_keyboard[0].map((b) => b.callback_data.split(':')[0]), ['ok', 'ed', 'no']);
      assert.equal(card.reply_markup.inline_keyboard[1][0].url.startsWith('https://inbox.example.test/inbox/'), true, 'link to the web inbox');
    }
  }
  const s = (await asOwner(env)).body.stats;
  assert.deepEqual(
    { total: s.total, hot: s.hot, spam: s.spam },
    { total: SAMPLES.length, hot: SAMPLES.filter((x) => x.expect.hot).length, spam: SAMPLES.filter((x) => x.expect.category === 'spam').length },
  );
});

test('Telegram customer gets an ack, and in demo mode a copy of the owner card', async () => {
  const env = makeEnv();
  const s = bySample('en-tg-cafe');
  const r = await postSample(env, s);
  const ob = r.body.outbox;
  const toCustomer = ob.filter((o) => o.chat_id === s.in.from.id && o.method === 'sendMessage');
  assert.match(toCustomer[0].text, /Thank you, Daniel!/);
  assert.match(toCustomer[1].text, /Demo: this is the card the owner gets/);
  assert.equal(cards(ob, s.in.from.id).length, 1);
  assert.equal(cards(ob).length, 1, 'and the real owner card');

  // the same Telegram message again (Telegram retries) is not a second request
  const off = makeEnv({ DEMO_MODE: 'off' });
  const u = tgMessage(s.in.from, s.in.text);
  await call(off, 'POST', '/telegram', { json: u });
  const again = await call(off, 'POST', '/telegram', { json: u });
  assert.equal(again.body.outbox.length, 0, 'duplicate update ignored');
  assert.equal((await call(off, 'GET', '/api/requests', { headers: {} })).status, 401, 'demo off: inbox closed without key');
});

test('owner approves a hot Telegram lead: the draft goes to the customer, the card is updated', async () => {
  const env = makeEnv();
  const s = bySample('en-tg-cafe');
  const first = await postSample(env, s);
  const card = cards(first.body.outbox)[0];
  const id = Number(card.reply_markup.inline_keyboard[0][0].callback_data.split(':')[1]);
  const tap = await call(env, 'POST', '/telegram', { json: tgTap(OWNER_USER, `ok:${id}`, { message_id: 1001, chat_id: OWNER }) });
  const ob = tap.body.outbox;
  const sent = ob.find((o) => o.method === 'sendMessage' && o.chat_id === s.in.from.id);
  assert.ok(sent, 'reply delivered to the customer chat');
  assert.match(sent.text, /^Hello Daniel,/);
  assert.match(sent.text, /Oakbloom team$/);
  const edit = ob.find((o) => o.method === 'editMessageText' && o.chat_id === OWNER);
  assert.match(edit.text, /Status: Sent/);
  assert.equal(edit.reply_markup.inline_keyboard.filter((r) => r.length === 3).length, 0, 'buttons removed');
  assert.match(ob.find((o) => o.method === 'answerCallbackQuery').text, /Reply sent via Telegram/);
  const again = await call(env, 'POST', '/telegram', { json: tgTap(OWNER_USER, `ok:${id}`) });
  assert.match(again.body.outbox[0].text, /Already decided: Sent/);
});

test('owner edits a draft in Telegram, then approves; a stranger cannot touch it', async () => {
  const env = makeEnv();
  const s = bySample('ru-form-kitchen');
  const first = await postSample(env, s);
  const id = first.body.request.id;
  assert.equal(first.body.request.hot, true);

  const stranger = { id: 777, first_name: 'X', language_code: 'en' };
  const deny = await call(env, 'POST', '/telegram', { json: tgTap(stranger, `ok:${id}`) });
  assert.match(deny.body.outbox[0].text, /Only the owner/);

  const ed = await call(env, 'POST', '/telegram', { json: tgTap(OWNER_USER, `ed:${id}`, { message_id: 1001, chat_id: OWNER }) });
  const prompt = ed.body.outbox.find((o) => o.method === 'sendMessage');
  assert.match(prompt.text, new RegExp(`new reply text for #${id}`));
  assert.equal(prompt.reply_markup.force_reply, true);

  const newText = 'Ирина, здравствуйте! Замер можем сделать в четверг или пятницу. Команда Oakbloom';
  const msg = await call(env, 'POST', '/telegram', { json: tgMessage(OWNER_USER, newText) });
  const newCard = cards(msg.body.outbox)[0];
  assert.ok(newCard, 'fresh card with buttons');
  assert.ok(newCard.text.includes('Замер можем сделать в четверг'), 'card shows the edited draft');
  assert.match(newCard.text, /edited by owner/);
  assert.ok(msg.body.outbox.some((o) => o.method === 'editMessageReplyMarkup'), 'old card buttons removed');

  const ok = await call(env, 'POST', '/telegram', { json: tgTap(OWNER_USER, `ok:${id}`) });
  const edit = ok.body.outbox.find((o) => o.method === 'editMessageText');
  assert.match(edit.text, /Status: Approved, ready to send/);
  assert.match(edit.text, /REPLY_WEBHOOK_URL/);
  const row = (await rows(env)).find((r) => r.id === id);
  assert.equal(row.status, 'approved');
  assert.equal(row.draft, newText);
  assert.equal(row.draft_source, 'owner');
});

test('owner rejects; /cancel keeps the draft; /inbox gives a summary', async () => {
  const env = makeEnv();
  await loadAll(env);
  const hot = (await rows(env)).filter((r) => r.hot);
  const [a, b] = hot;
  await call(env, 'POST', '/telegram', { json: tgTap(OWNER_USER, `ed:${a.id}`) });
  const cancel = await call(env, 'POST', '/telegram', { json: tgMessage(OWNER_USER, '/cancel') });
  assert.match(cancel.body.outbox[0].text, /Edit cancelled/);
  const no = await call(env, 'POST', '/telegram', { json: tgTap(OWNER_USER, `no:${b.id}`) });
  assert.match(no.body.outbox.find((o) => o.method === 'answerCallbackQuery').text, /Rejected/);
  const sum = await call(env, 'POST', '/telegram', { json: tgMessage(OWNER_USER, '/inbox') });
  assert.match(sum.body.outbox[0].text, new RegExp(`Inbox: ${SAMPLES.length} requests, ${hot.length} hot`));
  const after = await rows(env);
  assert.equal(after.find((r) => r.id === a.id).status, 'new');
  assert.equal(after.find((r) => r.id === b.id).status, 'rejected');
});

test('web inbox: list, filters, detail, approve; demo mode never sends from the web', async () => {
  const env = makeEnv();
  await loadAll(env);
  const page = await call(env, 'GET', `/inbox?lang=en&key=${ADMIN}`);
  assert.equal(page.status, 200);
  for (const name of ['Emily Carter', 'Ирина Соколова', 'Laura Kim', 'Daniel Brooks']) assert.ok(page.body.includes(name), name);
  assert.match(page.body, /Hot leads/);
  assert.match(page.body, /Public demo of a fictional business/);
  const spam = await call(env, 'GET', `/inbox?cat=spam&lang=ru&key=${ADMIN}`);
  assert.ok(spam.body.includes('Спам, в архиве'));
  assert.ok(!spam.body.includes('Emily Carter'), 'filter works');

  // A public visitor works on their own message: edit and approve mark it, nothing is sent.
  const vid = 'a1b2c3d4e5f60718';
  const mine = await call(env, 'POST', '/api/form', { json: bySample('en-form-kitchen').in, headers: { Cookie: `vid=${vid}` } });
  const id = mine.body.request.id;
  const det = await call(env, 'GET', `/inbox/${id}?lang=en`, { headers: { Cookie: `vid=${vid}` } });
  assert.match(det.body, /<textarea name="draft"/);
  assert.match(det.body, /\$9,000/);
  assert.match(det.body, /Demo inbox: approving here/);
  assert.match(det.body, /Preview only/, 'hot lead: the owner card is shown as a preview');
  const ap = await call(env, 'POST', `/inbox/${id}`, { form: { action: 'approve', draft: mine.body.request.draft + '\nP.S. edited on the web' }, headers: { Accept: 'application/json', Cookie: `vid=${vid}` } });
  assert.equal(ap.body.request.status, 'approved', 'approved, not sent');
  assert.equal(ap.body.request.draft_source, 'owner');
  const redirect = await call(env, 'POST', `/inbox/${id}`, { form: { action: 'reject' }, headers: { Cookie: `vid=${vid}` } });
  assert.equal(redirect.status, 303);
  assert.match(redirect.headers.get('Location'), /done=already/);
});

test('admin key: inbox closed without it, cookie set with it, web approve then really sends', async () => {
  const env = makeEnv({ DEMO_MODE: 'off', ADMIN_KEY: 'k-123456' });
  const s = bySample('ru-tg-office');
  const r = await postSample(env, s);
  assert.equal(r.status, 200);
  assert.equal(cards(r.body.outbox, s.in.from.id).length, 0, 'demo off: no card copy to the customer');
  assert.equal((await call(env, 'GET', '/inbox')).status, 401);
  assert.equal((await call(env, 'GET', '/inbox?key=wrong')).status, 401);
  const ok = await call(env, 'GET', '/inbox?key=k-123456');
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('Set-Cookie'), /inbox_key=k-123456; Path=\/; HttpOnly; Secure/);
  const list = (await call(env, 'GET', '/api/requests', { headers: { Cookie: 'inbox_key=k-123456' } })).body.requests;
  const ap = await call(env, 'POST', `/inbox/${list[0].id}`, { form: { action: 'approve' }, headers: { Cookie: 'inbox_key=k-123456', Accept: 'application/json' } });
  assert.equal(ap.body.request.status, 'sent');
  assert.ok(ap.body.outbox.some((o) => o.method === 'sendMessage' && o.chat_id === 5104), 'sent to the Telegram customer');
});

test('email webhook: secret, duplicates by Message-ID, reply webhook on approve', async () => {
  const env = makeEnv({ INBOX_SECRET: 's3cret', ADMIN_KEY: 'k-1', REPLY_WEBHOOK_URL: 'https://hooks.example.test/reply' });
  const s = bySample('en-email-table');
  const payload = { ...s.in, message_id: '<m1@example.net>' };
  assert.equal((await call(env, 'POST', '/api/email', { json: payload })).status, 403);
  const h = { 'X-Inbox-Secret': 's3cret' };
  const a = await call(env, 'POST', '/api/email', { json: payload, headers: h });
  const b = await call(env, 'POST', '/api/email', { json: payload, headers: h });
  assert.equal(b.body.duplicate, true);
  assert.equal(b.body.request.id, a.body.request.id);

  const realFetch = globalThis.fetch;
  const posted = [];
  globalThis.fetch = async (url, init) => { posted.push({ url: String(url), body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); };
  try {
    const ap = await call(env, 'POST', `/inbox/${a.body.request.id}?key=k-1`, { form: { action: 'approve' }, headers: { Accept: 'application/json' } });
    assert.equal(ap.body.request.status, 'sent');
  } finally { globalThis.fetch = realFetch; }
  assert.equal(posted.length, 1);
  assert.equal(posted[0].url, 'https://hooks.example.test/reply');
  assert.equal(posted[0].body.to, 'mark.ellis@example.net');
  assert.equal(posted[0].body.subject, 'Re: Table quote');
  assert.match(posted[0].body.text, /^Hello Mark,/);
});

test('web form: HTML post shows the result; honeypot and empty messages are dropped', async () => {
  const env = makeEnv();
  const page = await call(env, 'GET', '/form?lang=ru');
  assert.match(page.body, /Оставить заявку/);
  const s = bySample('ru-form-kitchen');
  const done = await call(env, 'POST', '/form', { form: { ...s.in, lang: 'ru' } });
  assert.equal(done.status, 200);
  assert.match(done.body, /Спасибо! Заявка получена/);
  assert.match(done.body, /Вот что агент сделал с заявкой/);
  assert.match(done.body, /Черновик ответа/);
  assert.match(done.body, /600 000 ₽/);
  const bot = await call(env, 'POST', '/api/form', { json: { ...s.in, website: 'http://spam.example' } });
  assert.equal(bot.body.ignored, 'honeypot');
  const empty = await call(env, 'POST', '/api/form', { json: { name: 'A', contact: 'a@example.com', message: ' ' } });
  assert.equal(empty.status, 400);
  assert.equal((await rows(env)).length, 1);
  assert.match(done.headers.get('Set-Cookie'), /^vid=[a-f0-9]{16};/, 'the visitor gets a cookie');
});

test('production Telegram webhook requires the secret header', async () => {
  const env = makeEnv({ BOT_TOKEN: '1:fake', WEBHOOK_SECRET: 'wh' });
  const r = await call(env, 'POST', '/telegram', { json: tgMessage({ id: 1, first_name: 'A' }, 'hi') });
  assert.equal(r.status, 403);
});

test('public demo: samples are visible to everyone, a visitor sees only their own messages, sample data is read-only', async () => {
  const env = makeEnv({ INBOX_SECRET: 'seed-secret', TG_WEBHOOK: 'closed' });
  const seedH = { 'X-Inbox-Secret': 'seed-secret' };
  const tg = bySample('ru-tg-office');
  const seeded = await call(env, 'POST', '/api/seed', { json: { channel: 'telegram', message_id: 7, from: tg.in.from, text: tg.in.text, ago_min: 30 }, headers: seedH });
  assert.equal(seeded.body.request.channel, 'telegram');
  assert.equal(seeded.body.request.origin, 'seed');
  const sid = seeded.body.request.id;
  // a live email (webhook) is not part of the public demo data
  const live = await call(env, 'POST', '/api/email', { json: { ...bySample('en-email-table').in, message_id: '<l1@example.net>' }, headers: seedH });
  const liveId = live.body.request.id;
  assert.equal(live.body.request.origin, 'live');

  const anon = await call(env, 'GET', '/inbox?lang=en');
  assert.equal(anon.status, 200, 'the public inbox opens without a key');
  assert.ok(anon.body.includes('Олег Белов'));
  assert.ok(!anon.body.includes('Mark Ellis'), 'live mail is hidden from the public');
  assert.equal((await call(env, 'GET', `/inbox/${liveId}`)).status, 404);

  // sample data cannot be changed by a visitor
  const ap = await call(env, 'POST', `/inbox/${sid}`, { form: { action: 'approve' } });
  assert.equal(ap.status, 403);
  const sdet = await call(env, 'GET', `/inbox/${sid}?lang=en`);
  assert.match(sdet.body, /sample data and read-only/);
  assert.ok(!sdet.body.includes('name="action"'), 'no buttons on sample data');

  // two visitors: each sees only their own message
  const A = { Cookie: 'vid=aaaaaaaaaaaaaaaa' };
  const B = { Cookie: 'vid=bbbbbbbbbbbbbbbb' };
  const mine = await call(env, 'POST', '/api/form', { json: bySample('en-form-delivery').in, headers: A });
  const idA = mine.body.request.id;
  assert.equal((await call(env, 'GET', `/inbox/${idA}`, { headers: A })).status, 200);
  assert.equal((await call(env, 'GET', `/inbox/${idA}`, { headers: B })).status, 404);
  assert.equal((await call(env, 'POST', `/inbox/${idA}`, { form: { action: 'reject' }, headers: B })).status, 404);
  const listB = (await call(env, 'GET', '/api/requests', { headers: B })).body;
  assert.equal(listB.requests.length, 1, 'only the sample');
  assert.equal(listB.stats.total, 1);
  const listA = (await call(env, 'GET', '/api/requests', { headers: A })).body;
  assert.equal(listA.requests.length, 2);
  // the owner sees everything
  assert.equal((await asOwner(env)).body.requests.length, 3);

  // the Telegram webhook stays closed in the public demo
  assert.equal((await call(env, 'POST', '/telegram', { json: tgMessage(OWNER_USER, 'hi') })).status, 403);
});

test('public form: submission cap per IP per hour, friendly 429 page', async () => {
  const env = makeEnv({ SUBMIT_HOURLY: '2' });
  const s = bySample('en-form-kitchen');
  const h = { 'CF-Connecting-IP': '198.51.100.9' };
  assert.equal((await call(env, 'POST', '/api/form', { json: s.in, headers: h })).status, 200);
  assert.equal((await call(env, 'POST', '/api/form', { json: s.in, headers: h })).status, 200);
  assert.equal((await call(env, 'POST', '/api/form', { json: s.in, headers: h })).status, 429);
  const page = await call(env, 'POST', '/form', { form: { ...s.in, lang: 'en' }, headers: h });
  assert.equal(page.status, 429);
  assert.match(page.body, /Too many messages from your connection/);
});
