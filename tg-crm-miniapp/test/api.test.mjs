// Mini App API: auth, sandbox seeding, filters, lead card, notes, reminders, stats, workspace isolation, team mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, api, ANNA, BORIS, ORIGIN, BOT_TOKEN } from './helpers.mjs';
import { SEED_COUNTS } from '../src/seed.js';
import worker from '../src/worker.js';

test('API refuses invalid initData when a bot token is set (no initData = browser sandbox, see browser.test.mjs)', async () => {
  const env = makeEnv();
  assert.equal((await api(env, 'GET', '/api/me', { auth: 'tma user=%7B%22id%22%3A1%7D&auth_date=1&hash=' + 'a'.repeat(64) })).status, 401);
  const r = await api(env, 'GET', '/api/leads', { auth: 'tma ' + 'x'.repeat(40) });
  assert.equal(r.status, 401);
  assert.match(r.data.error, /initData/);
  // Team mode has no browser sandbox: no initData is a plain 401.
  const team = makeEnv({ DEMO_MODE: 'off' });
  assert.equal((await api(team, 'GET', '/api/me', { auth: '' })).status, 401);
});

test('first open seeds a private sandbox with fictional data, in the user language', async () => {
  const env = makeEnv();
  const en = await api(env, 'GET', '/api/me');
  assert.equal(en.status, 200);
  assert.equal(en.data.me.name, 'Anna Test');
  assert.equal(en.data.me.role, 'admin');
  assert.equal(en.data.team.length, SEED_COUNTS.members);
  assert.equal(en.data.demo, true);
  assert.deepEqual(en.data.statuses, ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']);

  const ru = await api(env, 'GET', '/api/me', { user: BORIS });
  assert.equal(ru.data.me.lang, 'ru');
  assert.ok(ru.data.team.some((m) => m.name === 'Мила Орлова'));

  const leads = await api(env, 'GET', '/api/leads');
  assert.equal(leads.data.counts.all, SEED_COUNTS.leads);
  // A second open does not seed again.
  await api(env, 'GET', '/api/me');
  assert.equal((await api(env, 'GET', '/api/leads')).data.counts.all, SEED_COUNTS.leads);
});

test('leads list: status, owner, source, overdue filters and search (Cyrillic too)', async () => {
  const env = makeEnv();
  const all = (await api(env, 'GET', '/api/leads')).data;
  const { counts } = all;
  const sum = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'].reduce((n, s) => n + counts[s], 0);
  assert.equal(sum, counts.all);
  assert.equal(counts.open, counts.new + counts.contacted + counts.qualified + counts.proposal);
  // Sorted by last activity, newest first.
  const upd = all.leads.map((l) => l.updated_at);
  assert.deepEqual(upd, [...upd].sort().reverse());

  const news = (await api(env, 'GET', '/api/leads?status=new')).data.leads;
  assert.equal(news.length, counts.new);
  assert.ok(news.every((l) => l.status === 'new'));

  const me = (await api(env, 'GET', '/api/me')).data.me;
  const mine = (await api(env, 'GET', '/api/leads?owner=me')).data.leads;
  assert.ok(mine.length > 0 && mine.every((l) => l.owner_id === me.id));
  const none = (await api(env, 'GET', '/api/leads?owner=none')).data.leads;
  assert.ok(none.length > 0 && none.every((l) => l.owner_id === null));

  const overdue = (await api(env, 'GET', '/api/leads?status=overdue')).data.leads;
  assert.ok(overdue.length >= 1 && overdue.every((l) => l.next_due < new Date().toISOString()));

  const ref = (await api(env, 'GET', '/api/leads?source=referral')).data.leads;
  assert.ok(ref.length > 0 && ref.every((l) => l.source === 'referral'));

  const q = (await api(env, 'GET', '/api/leads?q=KESTREL')).data.leads;
  assert.deepEqual(q.map((l) => l.company), ['Kestrel Logistics']);
  const qru = (await api(env, 'GET', '/api/leads?q=морозова', { user: BORIS })).data.leads;
  assert.deepEqual(qru.map((l) => l.name), ['Анна Морозова']);
});

test('lead card: create, validate, change status and owner, notes and timeline', async () => {
  const env = makeEnv();
  const { team, me } = (await api(env, 'GET', '/api/me')).data;
  assert.equal((await api(env, 'POST', '/api/leads', { body: { company: 'No name' } })).status, 400);
  assert.equal((await api(env, 'POST', '/api/leads', { body: { name: 'X', email: 'nope' } })).status, 400);
  assert.equal((await api(env, 'POST', '/api/leads', { body: { name: 'X', source: 'carrier pigeon' } })).status, 400);
  assert.equal((await api(env, 'POST', '/api/leads', { body: { name: 'X', value: -5 } })).status, 400);

  const c = await api(env, 'POST', '/api/leads', { body: { name: 'Kim Lee', company: 'Acme Dental', phone: '+1 555 0100', source: 'call', value: '5400', note: 'Wants a quote by Friday' } });
  assert.equal(c.status, 201);
  const id = c.data.lead.id;
  assert.equal(c.data.lead.owner_id, me.id);
  assert.equal(c.data.lead.value, 5400);
  assert.deepEqual(c.data.notes.map((n) => n.kind).sort(), ['created', 'note']);

  const colleague = team.find((m) => m.id !== me.id);
  const u = await api(env, 'PATCH', `/api/leads/${id}`, { body: { status: 'won', owner_id: colleague.id } });
  assert.equal(u.status, 200);
  assert.equal(u.data.lead.status, 'won');
  assert.ok(u.data.lead.closed_at);
  assert.equal(u.data.lead.owner_name, colleague.name);
  const kinds = u.data.notes.map((n) => `${n.kind}:${n.text}`);
  assert.ok(kinds.includes('status:new>won'));
  assert.ok(kinds.includes(`owner:${colleague.name}`));

  const back = await api(env, 'PATCH', `/api/leads/${id}`, { body: { status: 'proposal', owner_id: null } });
  assert.equal(back.data.lead.closed_at, null);
  assert.equal(back.data.lead.owner_id, null);
  assert.equal((await api(env, 'PATCH', `/api/leads/${id}`, { body: { status: 'maybe' } })).status, 400);

  const n = await api(env, 'POST', `/api/leads/${id}/notes`, { body: { text: 'Called, sending samples' } });
  assert.equal(n.status, 201);
  assert.equal(n.data.notes[0].text, 'Called, sending samples');
  assert.equal(n.data.notes[0].author_name, me.name);
  assert.equal((await api(env, 'POST', `/api/leads/${id}/notes`, { body: { text: '   ' } })).status, 400);
  assert.equal((await api(env, 'GET', '/api/leads/999999')).status, 404);
});

test('workspaces are isolated: another user cannot read or change your leads', async () => {
  const env = makeEnv();
  const annaLead = (await api(env, 'GET', '/api/leads')).data.leads[0];
  const borisTeam = (await api(env, 'GET', '/api/me', { user: BORIS })).data.team;
  assert.equal((await api(env, 'GET', `/api/leads/${annaLead.id}`, { user: BORIS })).status, 404);
  assert.equal((await api(env, 'PATCH', `/api/leads/${annaLead.id}`, { user: BORIS, body: { status: 'lost' } })).status, 404);
  assert.equal((await api(env, 'POST', `/api/leads/${annaLead.id}/notes`, { user: BORIS, body: { text: 'hi' } })).status, 404);
  // Assigning your lead to a member of someone else's team is refused.
  assert.equal((await api(env, 'PATCH', `/api/leads/${annaLead.id}`, { body: { owner_id: borisTeam[1].id } })).status, 400);
  assert.equal((await api(env, 'GET', `/api/leads/${annaLead.id}`)).data.lead.status, annaLead.status);
});

test('reminders: add, group into overdue / today / upcoming, mark done', async () => {
  const env = makeEnv();
  const lead = (await api(env, 'GET', '/api/leads?q=Pixel')).data.leads[0];
  const soon = new Date(Date.now() + 10 * 60000).toISOString();
  const r = await api(env, 'POST', `/api/leads/${lead.id}/reminders`, { body: { text: 'Send the proposal', due_at: soon } });
  assert.equal(r.status, 201);
  assert.ok(r.data.reminders.some((x) => x.text === 'Send the proposal'));
  assert.equal((await api(env, 'POST', `/api/leads/${lead.id}/reminders`, { body: { text: 'x', due_at: 'tomorrow-ish' } })).status, 400);
  assert.equal((await api(env, 'POST', `/api/leads/${lead.id}/reminders`, { body: { text: '', due_at: soon } })).status, 400);

  const g = (await api(env, 'GET', '/api/reminders')).data;
  assert.ok(g.overdue.length >= 1, 'seed has overdue reminders');
  assert.ok(g.upcoming.length >= 1);
  const all = [...g.overdue, ...g.today, ...g.upcoming];
  const mine = all.find((x) => x.text === 'Send the proposal');
  assert.ok(mine);
  assert.ok(g.overdue.every((x) => x.due_at < new Date().toISOString()));

  const team = (await api(env, 'GET', '/api/reminders?scope=all')).data;
  assert.ok([...team.overdue, ...team.today, ...team.upcoming].length > all.length, 'team view includes colleagues');

  assert.equal((await api(env, 'PATCH', `/api/reminders/${mine.id}`, { body: { done: true } })).status, 200);
  const after = (await api(env, 'GET', '/api/reminders')).data;
  assert.ok(![...after.overdue, ...after.today, ...after.upcoming].some((x) => x.id === mine.id));
  assert.equal((await api(env, 'PATCH', `/api/reminders/${mine.id}`, { user: BORIS, body: { done: false } })).status, 404);
});

test('stats add up', async () => {
  const env = makeEnv();
  const s = (await api(env, 'GET', '/api/stats')).data;
  assert.equal(s.funnel.reduce((n, f) => n + f.count, 0), SEED_COUNTS.leads);
  assert.equal(s.by_source.reduce((n, f) => n + f.count, 0), SEED_COUNTS.leads);
  assert.equal(s.open_count, s.funnel.filter((f) => !['won', 'lost'].includes(f.status)).reduce((n, f) => n + f.count, 0));
  assert.ok(s.won_30d.count >= 3 && s.won_30d.value > 0);
  assert.ok(s.win_rate_90d > 0 && s.win_rate_90d < 100);
  assert.equal(s.weekly_new.length, 8);
  assert.equal(s.by_owner.length, SEED_COUNTS.members);
  const unassignedOpen = (await api(env, 'GET', '/api/leads?owner=none&status=open')).data.leads.length;
  assert.equal(s.by_owner.reduce((n, o) => n + o.open, 0) + unassignedOpen, s.open_count);
  assert.equal(s.currency, 'USD');
});

test('"send me the digest" posts the bot message to the user chat', async () => {
  const env = makeEnv();
  await api(env, 'POST', '/api/me', { body: { tz_offset: 180, lang: 'ru' } });
  const r = await api(env, 'POST', '/api/digest');
  assert.equal(r.status, 200);
  assert.equal(r.data.sent, true);
  const msg = env.TG_OUTBOX.at(-1);
  assert.equal(msg.method, 'sendMessage');
  assert.equal(msg.chat_id, ANNA.id);
  assert.match(msg.text, /Доброе утро, Anna!/);
  assert.match(msg.text, /Воронка команды: \d+ открытых лидов/);
  assert.equal(msg.reply_markup.inline_keyboard[0][0].web_app.url, `${ORIGIN}/`);
  assert.ok(r.data.counts.overdue >= 1);
});

test('POST /api/me validates settings', async () => {
  const env = makeEnv();
  const r = await api(env, 'POST', '/api/me', { body: { lang: 'de', tz_offset: 99999, digest_on: false } });
  assert.equal(r.data.me.lang, 'en');
  assert.equal(r.data.me.tz_offset, 0);
  assert.equal(r.data.me.digest_on, false);
  assert.equal((await api(env, 'POST', '/api/me', { body: undefined })).status, 400);
});

test('team mode: only admins and invited people get in', async () => {
  const env = makeEnv({ DEMO_MODE: 'off', ADMIN_IDS: String(ANNA.id) });
  assert.equal((await api(env, 'GET', '/api/me', { user: BORIS })).status, 403);
  const admin = await api(env, 'GET', '/api/me');
  assert.equal(admin.status, 200);
  assert.equal(admin.data.me.role, 'admin');
  assert.equal(admin.data.team.length, 1);
  assert.equal((await api(env, 'GET', '/api/leads')).data.counts.all, 0, 'team mode starts empty, no demo data');

  await env.DB.prepare("UPDATE workspaces SET invite_code = 'abc123xyz' WHERE id = 'team'").run();
  assert.equal((await api(env, 'GET', '/api/me', { user: BORIS, initExtra: { start_param: 'join_wrongcode' } })).status, 403);
  const joined = await api(env, 'GET', '/api/me', { user: BORIS, initExtra: { start_param: 'join_abc123xyz' } });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.me.role, 'sales');
  assert.equal(joined.data.team.length, 2);
  // Both see the same leads now.
  await api(env, 'POST', '/api/leads', { body: { name: 'Shared lead' } });
  assert.equal((await api(env, 'GET', '/api/leads', { user: BORIS })).data.leads[0].name, 'Shared lead');
});

test('static Mini App is served for non-API paths; unknown API path is 404', async () => {
  const env = makeEnv();
  const res = await worker.fetch(new Request(`${ORIGIN}/`), env);
  assert.equal(res.status, 200);
  assert.deepEqual(env._assets, ['/']);
  assert.equal((await api(env, 'GET', '/api/nope')).status, 404);
  assert.equal(BOT_TOKEN.includes(':'), true);
});
