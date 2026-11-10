// Bot side: webhook secret, commands, reminder pings and the daily digest cron.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, api, say, ANNA, BORIS, ORIGIN } from './helpers.mjs';
import { runCron, makeTg } from '../src/bot.js';
import { SEED_COUNTS } from '../src/seed.js';
import worker from '../src/worker.js';

test('webhook rejects updates without the secret header', async () => {
  const env = makeEnv();
  assert.equal((await say(env, ANNA, '/start', { secret: null })).status, 403);
  assert.equal((await say(env, ANNA, '/start', { secret: 'wrong' })).status, 403);
  assert.equal(env.TG_OUTBOX.length, 0);
  // No bot wired to this deployment: the webhook does not exist (404, not a raw error).
  const noSecret = makeEnv({ WEBHOOK_SECRET: '' });
  assert.equal((await say(noSecret, ANNA, '/start')).status, 404);
});

test('/start greets in the user language with an "Open CRM" Mini App button', async () => {
  const env = makeEnv();
  const { status, out } = await say(env, ANNA, '/start');
  assert.equal(status, 200);
  assert.equal(out.length, 1);
  assert.match(out[0].text, /sales CRM of Brasswick Interiors \(a demo with fictional data\)/);
  assert.deepEqual(out[0].reply_markup.inline_keyboard[0][0], { text: 'Open CRM', web_app: { url: `${ORIGIN}/` } });
  const ru = (await say(env, BORIS, '/start')).out[0];
  assert.match(ru.text, /CRM отдела продаж/);
  assert.equal(ru.reply_markup.inline_keyboard[0][0].text, 'Открыть CRM');
});

test('/new adds a lead from the chat; /today lists reminders; /lang switches language', async () => {
  const env = makeEnv();
  const n = (await say(env, ANNA, '/new Kim Lee, Acme Dental, +1 555 0100')).out[0];
  assert.match(n.text, /Lead #\d+ "Kim Lee" added/);
  assert.match(n.reply_markup.inline_keyboard[0][0].web_app.url, /#\/lead\/\d+$/);
  const lead = (await api(env, 'GET', '/api/leads?q=acme')).data.leads[0];
  assert.equal(lead.company, 'Acme Dental');
  assert.equal(lead.source, 'telegram');
  assert.match((await say(env, ANNA, '/new')).out[0].text, /Send \/new and the lead name/);

  const today = (await say(env, ANNA, '/today')).out[0].text;
  assert.match(today, /Reminders for today:/);
  assert.match(today, /⚠️/); // seeded overdue reminder is flagged

  assert.equal((await say(env, ANNA, '/lang')).out[0].text, 'Язык: русский');
  assert.match((await say(env, ANNA, '/help')).out[0].text, /CRM отдела продаж/);
});

test('/reset puts the demo sandbox back to the seed data', async () => {
  const env = makeEnv();
  await api(env, 'POST', '/api/leads', { body: { name: 'Temp' } });
  assert.equal((await api(env, 'GET', '/api/leads')).data.counts.all, SEED_COUNTS.leads + 1);
  assert.match((await say(env, ANNA, '/reset')).out[0].text, /back to the starting data/);
  assert.equal((await api(env, 'GET', '/api/leads')).data.counts.all, SEED_COUNTS.leads);
  // Another visitor's sandbox is untouched.
  await api(env, 'POST', '/api/leads', { user: BORIS, body: { name: 'Mine' } });
  await say(env, ANNA, '/reset');
  assert.equal((await api(env, 'GET', '/api/leads', { user: BORIS })).data.counts.all, SEED_COUNTS.leads + 1);
});

test('team mode: strangers are turned away, /invite link lets a colleague join', async () => {
  const env = makeEnv({ DEMO_MODE: 'off', ADMIN_IDS: String(ANNA.id), BOT_USERNAME: 'brasswick_crm_bot' });
  assert.match((await say(env, BORIS, '/start')).out[0].text, /только для отдела продаж/);
  const inv = (await say(env, ANNA, '/invite')).out[0].text;
  const code = /start=join_([a-z0-9]+)/.exec(inv)[1];
  assert.match(inv, /https:\/\/t\.me\/brasswick_crm_bot\?start=join_/);
  assert.match((await say(env, BORIS, '/start join_badbadbad')).out[0].text, /больше не действует/);
  assert.match((await say(env, BORIS, `/start join_${code}`)).out[0].text, /Вы в команде/);
  assert.match((await say(env, BORIS, '/invite')).out[0].text, /только администратор/);
  assert.match((await say(env, BORIS, '/reset')).out[0].text, /только в демо/);
});

test('cron pings each due reminder once, with a button to the lead', async () => {
  const env = makeEnv();
  await api(env, 'GET', '/api/me'); // seed
  const lead = (await api(env, 'GET', '/api/leads?q=Orbita')).data.leads[0];
  const due = new Date(Date.now() + 60000).toISOString();
  await api(env, 'POST', `/api/leads/${lead.id}/reminders`, { body: { text: 'Call Daniel now', due_at: due } });
  const tg = makeTg(env);
  env.TG_OUTBOX.length = 0;

  const first = await runCron(env, { tg, appUrl: ORIGIN, now: Date.now() + 2 * 60000 });
  const pings = env.TG_OUTBOX.filter((m) => /Reminder/.test(m.text));
  assert.equal(first.reminders, pings.length);
  const ping = pings.find((m) => m.text.includes('Call Daniel now'));
  assert.ok(ping, 'our reminder was sent');
  assert.equal(ping.chat_id, ANNA.id);
  assert.equal(ping.reply_markup.inline_keyboard[0][0].web_app.url, `${ORIGIN}/#/lead/${lead.id}`);
  assert.ok(!pings.some((m) => m.text.includes('Send quick quote')), 'colleague reminders never go to Telegram');

  env.TG_OUTBOX.length = 0;
  const again = await runCron(env, { tg, appUrl: ORIGIN, now: Date.now() + 3 * 60000 });
  assert.equal(again.reminders, 0);
  assert.ok(!env.TG_OUTBOX.some((m) => /Reminder/.test(m.text)));
});

test('daily digest goes out at DIGEST_HOUR in the member local time, once per day', async () => {
  const env = makeEnv();
  await api(env, 'POST', '/api/me', { body: { tz_offset: 120 } }); // seeds + sets UTC+2
  const tg = makeTg(env);
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const at = (h, m = 5) => day.getTime() + h * 3600000 + m * 60000;

  env.TG_OUTBOX.length = 0;
  assert.equal((await runCron(env, { tg, appUrl: ORIGIN, now: at(6) })).digests, 0, '08:05 local: too early');
  const sent = await runCron(env, { tg, appUrl: ORIGIN, now: at(7) }); // 09:05 local
  assert.equal(sent.digests, 1);
  const digest = env.TG_OUTBOX.find((m) => /Good morning/.test(m.text));
  assert.equal(digest.chat_id, ANNA.id);
  assert.match(digest.text, /Team pipeline: \d+ open leads, \$[\d,]+/);
  assert.equal(digest.reply_markup.inline_keyboard[0][0].text, 'Open CRM');
  assert.equal((await runCron(env, { tg, appUrl: ORIGIN, now: at(7, 20) })).digests, 0, 'not twice the same day');

  await api(env, 'POST', '/api/me', { body: { digest_on: false } });
  assert.equal((await runCron(env, { tg, appUrl: ORIGIN, now: at(31) })).digests, 0, 'opted out');
});

test('scheduled() handler runs the cron through waitUntil', async () => {
  const env = makeEnv({ APP_URL: ORIGIN });
  await api(env, 'GET', '/api/me');
  const waits = [];
  await worker.scheduled({ cron: '*/15 * * * *' }, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal(waits.length, 1);
});

test('cron removes demo sandboxes idle for 30+ days, keeps active ones', async () => {
  const env = makeEnv();
  await api(env, 'GET', '/api/me');
  await api(env, 'GET', '/api/me', { user: BORIS });
  await env.DB.prepare('UPDATE members SET last_seen = ? WHERE tg_id = ?').bind(new Date(Date.now() - 31 * 86400000).toISOString(), BORIS.id).run();
  const r = await runCron(env, { tg: makeTg(env), appUrl: ORIGIN });
  assert.equal(r.dropped, 1);
  const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads').first('n');
  assert.equal(left, SEED_COUNTS.leads, 'only the active sandbox remains');
  // The idle visitor comes back and gets a fresh sandbox.
  assert.equal((await api(env, 'GET', '/api/leads', { user: BORIS })).data.counts.all, SEED_COUNTS.leads);
});
