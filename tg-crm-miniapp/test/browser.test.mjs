// Browser demo mode: no initData -> a signed sandbox cookie; tampered cookies are rejected; limits and cleanup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, api, browserApi, ANNA } from './helpers.mjs';
import { SEED_COUNTS } from '../src/seed.js';
import { issueSession, verifySession, browserUser } from '../src/session.js';
import { CAPS, NEW_SANDBOX_LIMITS } from '../src/crm.js';

const count = (env, table) => env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first('n');

test('no initData: the visitor gets a sandbox and an HttpOnly signed cookie', async () => {
  const env = makeEnv();
  const r = await browserApi(env, 'GET', '/api/me', { headers: { 'Accept-Language': 'en-US,en;q=0.9' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.browser, true);
  assert.equal(r.data.demo, true);
  assert.equal(r.data.me.name, 'Alex Morgan');
  assert.equal(r.data.team.length, SEED_COUNTS.members);
  assert.match(r.setCookie, /^sb=[0-9a-f]{12}\.[0-9a-f]{64};/);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /SameSite=Lax/);
  assert.match(r.setCookie, /Max-Age=604800/);
  assert.equal((await browserApi(env, 'GET', '/api/leads', { cookie: r.cookie })).data.counts.all, SEED_COUNTS.leads);
});

test('a valid cookie returns to the same sandbox and does not re-seed or re-issue', async () => {
  const env = makeEnv();
  const first = await browserApi(env, 'GET', '/api/me');
  const lead = (await browserApi(env, 'POST', '/api/leads', { cookie: first.cookie, body: { name: 'Zed Test' } })).data.lead;
  const again = await browserApi(env, 'GET', '/api/me', { cookie: first.cookie });
  assert.equal(again.setCookie, null);
  assert.equal(again.data.me.id, first.data.me.id);
  const leads = await browserApi(env, 'GET', '/api/leads', { cookie: first.cookie });
  assert.equal(leads.data.counts.all, SEED_COUNTS.leads + 1);
  assert.ok(leads.data.leads.some((l) => l.id === lead.id));
  assert.equal(await count(env, 'workspaces'), 1);
});

test('tampered or foreign cookies are rejected: the visitor gets a NEW sandbox, never the target', async () => {
  const env = makeEnv();
  const victim = await browserApi(env, 'GET', '/api/me');
  await browserApi(env, 'POST', '/api/leads', { cookie: victim.cookie, body: { name: 'Private Victim Lead' } });
  const [id, sig] = victim.cookie.split('.');
  const forged = [
    `${id}.${'0'.repeat(64)}`,
    `${id}.${sig.slice(0, -1)}${sig.endsWith('0') ? '1' : '0'}`,
    `${'a'.repeat(12)}.${sig}`, // another id, the victim's signature
    id,
    `${id}.${sig}.x`,
    'garbage',
  ];
  for (const cookie of forged) {
    const r = await browserApi(env, 'GET', '/api/leads?q=Private', { cookie });
    assert.equal(r.status, 200);
    assert.ok(r.setCookie, `a fresh session is issued for: ${cookie.slice(0, 24)}`);
    assert.notEqual(r.cookie.split('.')[0], id);
    assert.equal(r.data.leads.length, 0, 'the victim lead is not visible');
  }
});

test('a cookie signed with another secret is rejected', async () => {
  const other = await issueSession('some-other-secret');
  assert.equal(await verifySession(other.cookie, 'some-other-secret'), other.id);
  assert.equal(await verifySession(other.cookie, 'session-secret-for-tests'), null);
  assert.equal(await verifySession(other.cookie, ''), null);
  const env = makeEnv();
  const r = await browserApi(env, 'GET', '/api/me', { cookie: other.cookie });
  assert.notEqual(r.cookie.split('.')[0], other.id);
});

test('browser users get negative ids (never collide with Telegram) and the language of Accept-Language', async () => {
  assert.ok(browserUser('ffffffffffff').id < 0);
  assert.ok(browserUser('000000000000').id < 0);
  assert.equal(browserUser('abc', 'ru-RU,ru;q=0.9').language_code, 'ru');
  const env = makeEnv();
  const ru = await browserApi(env, 'GET', '/api/me', { headers: { 'Accept-Language': 'ru-RU,ru;q=0.9' } });
  assert.equal(ru.data.me.lang, 'ru');
  assert.equal(ru.data.me.name, 'Ирина Ковалёва');
});

test('Telegram initData still works next to browser mode', async () => {
  const env = makeEnv();
  const b = await browserApi(env, 'GET', '/api/me');
  const t = await api(env, 'GET', '/api/me', { user: ANNA });
  assert.equal(t.status, 200);
  assert.equal(t.data.browser, false);
  assert.equal(t.data.me.name, 'Anna Test');
  assert.equal(t.data.team.length, SEED_COUNTS.members);
  assert.equal(await count(env, 'workspaces'), 2);
  assert.notEqual(t.data.me.id, b.data.me.id);
});

test('no BOT_TOKEN: no crash and no logged errors; initData falls back to a sandbox; nothing is sent', async () => {
  const env = makeEnv({ BOT_TOKEN: undefined });
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a);
  try {
    const r = await browserApi(env, 'GET', '/api/me');
    assert.equal(r.status, 200);
    const viaTg = await api(env, 'GET', '/api/me', { auth: 'tma query_id=x&user=%7B%7D&hash=' + 'a'.repeat(64) });
    assert.equal(viaTg.status, 200);
    assert.equal(viaTg.data.browser, true);
    const digest = await browserApi(env, 'POST', '/api/digest', { cookie: r.cookie });
    assert.equal(digest.status, 200);
    assert.equal(digest.data.sent, false);
    assert.equal(digest.data.preview, true);
    assert.match(digest.data.text, /Good morning/);
  } finally {
    console.error = orig;
  }
  assert.deepEqual(errors, []);
  assert.equal(env.TG_OUTBOX.length, 0);
});

test('missing SESSION_SECRET: a clear 503, not a crash', async () => {
  const env = makeEnv({ SESSION_SECRET: undefined });
  const r = await browserApi(env, 'GET', '/api/me');
  assert.equal(r.status, 503);
  assert.match(r.data.error, /SESSION_SECRET/);
});

test('digest in a browser session is a preview and sends nothing even with a bot token', async () => {
  const env = makeEnv();
  const b = await browserApi(env, 'GET', '/api/me');
  const d = await browserApi(env, 'POST', '/api/digest', { cookie: b.cookie });
  assert.equal(d.data.sent, false);
  assert.equal(d.data.preview, true);
  assert.equal(env.TG_OUTBOX.length, 0);
});

test('reset restores the seed in a browser sandbox, same session', async () => {
  const env = makeEnv();
  const b = await browserApi(env, 'GET', '/api/me');
  await browserApi(env, 'POST', '/api/leads', { cookie: b.cookie, body: { name: 'Extra' } });
  assert.equal((await browserApi(env, 'POST', '/api/reset', { cookie: b.cookie })).status, 200);
  const r = await browserApi(env, 'GET', '/api/leads', { cookie: b.cookie });
  assert.equal(r.data.counts.all, SEED_COUNTS.leads);
  assert.equal(r.setCookie, null);
});

test('row caps per sandbox: leads, notes per lead, reminders', async () => {
  const env = makeEnv();
  const c = (await browserApi(env, 'GET', '/api/me')).cookie;
  const ws = await env.DB.prepare('SELECT workspace_id FROM members WHERE tg_id < 0').first('workspace_id');
  const n = (sql, ...a) => env.DB.prepare(sql).bind(...a).first('n');

  const leads = await n('SELECT COUNT(*) AS n FROM leads WHERE workspace_id = ?', ws);
  const fill = [];
  for (let i = leads; i < CAPS.leads; i++) fill.push(env.DB.prepare("INSERT INTO leads (workspace_id, name, created_at, updated_at) VALUES (?, 'x', 'a', 'a')").bind(ws));
  await env.DB.batch(fill);
  const over = await browserApi(env, 'POST', '/api/leads', { cookie: c, body: { name: 'One too many' } });
  assert.equal(over.status, 429);
  assert.match(over.data.error, /up to 80 leads/);

  const lead = (await browserApi(env, 'GET', '/api/leads?q=Orbita', { cookie: c })).data.leads[0];
  const notes = await n('SELECT COUNT(*) AS n FROM notes WHERE lead_id = ?', lead.id);
  for (let i = notes; i < CAPS.notesPerLead; i++) await env.DB.prepare("INSERT INTO notes (lead_id, kind, text, created_at) VALUES (?, 'note', 'x', 'a')").bind(lead.id).run();
  assert.equal((await browserApi(env, 'POST', `/api/leads/${lead.id}/notes`, { cookie: c, body: { text: 'more' } })).status, 429);

  const rem = await n('SELECT COUNT(*) AS n FROM reminders WHERE workspace_id = ?', ws);
  for (let i = rem; i < CAPS.reminders; i++) await env.DB.prepare("INSERT INTO reminders (workspace_id, lead_id, member_id, due_at, text, created_at) VALUES (?, ?, 1, 'a', 'x', 'a')").bind(ws, lead.id).run();
  const r = await browserApi(env, 'POST', `/api/leads/${lead.id}/reminders`, { cookie: c, body: { text: 'again', due_at: new Date(Date.now() + 3600000).toISOString() } });
  assert.equal(r.status, 429);
});

test('sandboxes older than 7 days are deleted lazily when a new sandbox is created', async () => {
  const env = makeEnv();
  const old = await browserApi(env, 'GET', '/api/me');
  const fresh = await browserApi(env, 'GET', '/api/me');
  await env.DB.prepare('UPDATE workspaces SET created_at = ? WHERE id = (SELECT workspace_id FROM members WHERE id = ?)')
    .bind(new Date(Date.now() - 8 * 86400000).toISOString(), old.data.me.id).run();
  assert.equal(await count(env, 'workspaces'), 2);
  const before = await count(env, 'leads');

  await browserApi(env, 'GET', '/api/leads', { cookie: fresh.cookie }); // a normal request sweeps nothing
  assert.equal(await count(env, 'workspaces'), 2);

  await browserApi(env, 'GET', '/api/me'); // a NEW sandbox sweeps the old one and creates itself
  assert.equal(await count(env, 'workspaces'), 2, 'old removed, new added');
  assert.equal(await count(env, 'leads'), before, 'the old leads went with it');
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM notes WHERE lead_id NOT IN (SELECT id FROM leads)').first('n'), 0);
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM reminders WHERE lead_id NOT IN (SELECT id FROM leads)').first('n'), 0);

  // The old cookie still verifies, so its owner gets a fresh sandbox under the same id.
  const back = await browserApi(env, 'GET', '/api/leads', { cookie: old.cookie });
  assert.equal(back.data.counts.all, SEED_COUNTS.leads);
  assert.equal(back.setCookie, null);
});

test('new sandboxes are limited per IP per hour; existing visitors are never blocked', async () => {
  const env = makeEnv();
  const hdr = { 'CF-Connecting-IP': '203.0.113.7' };
  let last;
  for (let i = 0; i < NEW_SANDBOX_LIMITS.perIpPerHour; i++) {
    last = await browserApi(env, 'GET', '/api/me', { headers: hdr });
    assert.equal(last.status, 200);
  }
  const blocked = await browserApi(env, 'GET', '/api/me', { headers: hdr });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.setCookie, null);
  assert.equal((await browserApi(env, 'GET', '/api/me', { cookie: last.cookie, headers: hdr })).status, 200);
  assert.equal((await browserApi(env, 'GET', '/api/me', { headers: { 'CF-Connecting-IP': '203.0.113.8' } })).status, 200, 'another IP is fine');
});
