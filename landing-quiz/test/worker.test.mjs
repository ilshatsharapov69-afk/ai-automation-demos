// Offline tests of the Worker: real migration + real SQL on node:sqlite (stand-in for D1), Telegram faked
// by replacing globalThis.fetch. Run: npm test
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createD1 } from './helpers/d1.mjs';
import { estimate, validateAnswers, formatRange } from '../public/js/quiz-model.js';
import { normalizePhone, validateLead } from '../src/lead.js';

const ORIGIN = 'https://planka-demo.example.workers.dev';
const realFetch = globalThis.fetch;
const realError = console.error;
let tgCalls;
let tgReply; // (call) => Response
let logged; // console.error lines from the Worker (kept out of the test output)

beforeEach(() => {
  tgCalls = [];
  logged = [];
  console.error = (...a) => logged.push(a.join(' '));
  tgReply = () => Response.json({ ok: true, result: { message_id: 1 } });
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://api.telegram.org/')) throw new Error(`unexpected network call: ${url}`);
    const call = { url: String(url), body: JSON.parse(init.body) };
    tgCalls.push(call);
    return tgReply(call);
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realError; });

const env = (over = {}) => ({
  DB: createD1(), ADMIN_PASSWORD: 'correct horse battery', TG_BOT_TOKEN: '123456:TEST', TG_CHAT_ID: '42',
  OWNER_LANG: 'ru', IP_SALT: 'test-salt', TIME_ZONE: 'UTC', ...over,
});

async function call(e, path, init = {}) {
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p), passThroughOnException() {} };
  const res = await worker.fetch(new Request(ORIGIN + path, init), e, ctx);
  await Promise.all(waits);
  return res;
}
const post = (e, body, headers = {}) => call(e, '/api/lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', Origin: ORIGIN, ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const auth = (pass = 'correct horse battery') => ({ Authorization: 'Basic ' + Buffer.from(`owner:${pass}`, 'utf8').toString('base64') });
const rows = (e) => e.DB.raw.prepare('SELECT * FROM leads ORDER BY id').all().map((r) => ({ ...r }));

const ANSWERS = { property: 'resale', area: 54, scope: 'standard', extras: ['bathroom', 'cleanup'], start: 'month' };
const RU = { lang: 'ru', answers: ANSWERS, name: 'Анна', phone: '8 (912) 345-67-89', contact: 'telegram', comment: 'Хочу тёплый пол в ванной', consent: true, utm: { source: 'yandex', medium: 'cpc', campaign: 'spring' }, page: '/ru/' };
const EN = { lang: 'en', answers: { property: 'house', area: 120, scope: 'premium', extras: ['design'], start: 'asap' }, name: "Mary-Jane O'Neil", phone: '+1 (555) 010-0199', contact: 'whatsapp', consent: true, page: '/' };

// ---------- quiz model and validation (pure) ----------

test('estimate: formula, rounding and range for a known answer set', () => {
  const e = estimate(ANSWERS, 'RUB');
  // 54 m2 * 14,500 * 1.12 (older apartment) = 876,960; + bathroom 210,000 + cleanup 30,000 = 1,116,960
  assert.equal(e.min, 1030000); // 1,116,960 * 0.92 rounded to 10,000
  assert.equal(e.max, 1280000); // * 1.15
  assert.deepEqual([e.weeksMin, e.weeksMax], [10, 12]); // 4 + 54/12 + 1 (bathroom) = 9.5
  assert.deepEqual(e.breakdown.map((b) => b.id), ['base', 'bathroom', 'cleanup']);
  const usd = estimate(EN.answers, 'USD');
  assert.equal(usd.currency, 'USD');
  assert.ok(usd.min > 40000 && usd.max < 70000, `${usd.min}-${usd.max}`);
  assert.equal(usd.min % 100, 0);
});

test('validateAnswers: rejects unknown options, out-of-range area, duplicates; normalises extras order', () => {
  assert.equal(validateAnswers({ ...ANSWERS, area: 14 }).errors.area, 'out_of_range');
  assert.equal(validateAnswers({ ...ANSWERS, area: 54.5 }).errors.area, 'out_of_range');
  assert.equal(validateAnswers({ ...ANSWERS, scope: 'gold' }).errors.scope, 'invalid');
  assert.equal(validateAnswers({ ...ANSWERS, extras: ['bathroom', 'bathroom'] }).errors.extras, 'invalid');
  assert.equal(validateAnswers({ ...ANSWERS, extras: ['pool'] }).errors.extras, 'invalid');
  assert.equal(validateAnswers({ ...ANSWERS, property: { $ne: 1 } }).errors.property, 'invalid');
  assert.equal(validateAnswers([]).ok, false);
  assert.deepEqual(validateAnswers({ ...ANSWERS, extras: ['cleanup', 'bathroom'], area: '54' }).value, ANSWERS);
  assert.deepEqual(validateAnswers({ ...ANSWERS, extras: undefined }).value.extras, []);
});

test('normalizePhone: RU 8-prefix, 10-digit mobile, international, garbage', () => {
  assert.equal(normalizePhone('8 (912) 345-67-89', 'ru'), '+79123456789');
  assert.equal(normalizePhone('912 345 67 89', 'ru'), '+79123456789');
  assert.equal(normalizePhone('+1 555.010.0123', 'en'), '+15550100123');
  assert.equal(normalizePhone('+1 (555) 010-0199', 'en'), '+15550100199');
  assert.equal(normalizePhone('12345', 'en'), null);
  assert.equal(normalizePhone('call me', 'en'), null);
  assert.equal(normalizePhone('+7 912 345 67 89 0000000', 'ru'), null);
});

test('validateLead: field error codes', () => {
  const r = validateLead({ lang: 'de', answers: { ...ANSWERS, area: 9999 }, name: 'A', phone: 'x', contact: 'pigeon', comment: 'x'.repeat(501), consent: false });
  assert.deepEqual(r.errors, { lang: 'invalid', area: 'out_of_range', name: 'name_invalid', phone: 'phone_invalid', contact: 'invalid', comment: 'too_long', consent: 'consent_required' });
  assert.equal(validateLead({ ...RU, name: '<b>Bob</b>' }).errors.name, 'name_invalid');
  assert.equal(validateLead({ ...RU, name: 'http://spam.example' }).errors.name, 'name_invalid');
  assert.equal(validateLead({ ...RU, name: '' }).errors.name, 'required');
  assert.equal(validateLead({ ...RU, phone: '' }).errors.phone, 'required');
  assert.equal(validateLead({ ...RU, utm: { source: 'x'.repeat(101), medium: 'cpc' } }).lead.utm.source, undefined);
  assert.equal(validateLead({ ...RU, page: 'https://evil.example/' }).lead.page, '/');
  assert.equal(validateLead({ ...RU, contact: undefined }).lead.contact, 'call');
});

// ---------- POST /api/lead ----------

test('RU lead: 201, stored in D1 with server-side estimate, Telegram card sent to the owner chat', async () => {
  const e = env();
  const res = await post(e, { ...RU, estimate: { min: 1, max: 2 } }); // a tampered price is ignored
  assert.equal(res.status, 201);
  const out = await res.json();
  const expected = estimate(ANSWERS, 'RUB');
  assert.deepEqual(out, { ok: true, id: 1, estimate: expected });

  const [row] = rows(e);
  assert.equal(row.phone, '+79123456789');
  assert.equal(row.name, 'Анна');
  assert.equal(row.contact, 'telegram');
  assert.equal(row.extras, '["bathroom","cleanup"]');
  assert.equal(row.est_min, expected.min);
  assert.equal(row.est_max, expected.max);
  assert.equal(row.currency, 'RUB');
  assert.equal(row.status, 'new');
  assert.equal(row.tg_status, 'sent');
  assert.equal(row.utm, '{"source":"yandex","medium":"cpc","campaign":"spring"}');
  assert.match(row.ip_hash, /^[0-9a-f]{32}$/);
  assert.ok(!JSON.stringify(row).includes('203.0.113.7'), 'raw IP is never stored');

  assert.equal(tgCalls.length, 1);
  const { url, body } = tgCalls[0];
  assert.equal(url, 'https://api.telegram.org/bot123456:TEST/sendMessage');
  assert.equal(body.chat_id, '42');
  assert.equal(body.parse_mode, 'HTML');
  for (const s of ['Заявка #1', 'Анна', '+79123456789', 'Telegram', 'Квартира во вторичке', '54 м²', 'Капитальный', 'Санузел под ключ, Вывоз мусора и клининг', 'В течение месяца', formatRange(expected, 'ru'), '10–12 нед.', 'Хочу тёплый пол', 'source=yandex']) {
    assert.ok(body.text.includes(s), `card should contain "${s}":\n${body.text}`);
  }
  assert.deepEqual(body.reply_markup.inline_keyboard[0][0], { text: '📋 Открыть таблицу заявок', url: `${ORIGIN}/admin` });
});

test('EN lead with English owner: USD estimate, English card', async () => {
  const e = env({ OWNER_LANG: 'en' });
  const res = await post(e, EN);
  assert.equal(res.status, 201);
  const { estimate: est } = await res.json();
  assert.equal(est.currency, 'USD');
  const text = tgCalls[0].body.text;
  for (const s of ['Lead #1', "Mary-Jane O'Neil", '+15550100199', 'WhatsApp', 'House or townhouse', '120 m²', 'Designer renovation', 'Design project', 'As soon as possible', formatRange(est, 'en'), 'Site language: EN']) {
    assert.ok(text.includes(s), `card should contain "${s}":\n${text}`);
  }
});

test('HTML in the comment is escaped in the Telegram card', async () => {
  const e = env();
  await post(e, { ...RU, comment: '<script>alert(1)</script> & <b>' });
  const text = tgCalls[0].body.text;
  assert.ok(text.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;'));
  assert.ok(!text.includes('<script>'));
});

test('validation failure: 422 with field codes, nothing stored, nothing sent', async () => {
  const e = env();
  const res = await post(e, { ...RU, phone: '123', consent: false, answers: { ...ANSWERS, scope: 'gold' } });
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { ok: false, error: 'validation', errors: { scope: 'invalid', phone: 'phone_invalid', consent: 'consent_required' } });
  assert.equal(rows(e).length, 0);
  assert.equal(tgCalls.length, 0);
});

test('honeypot filled: looks successful, stores nothing, sends nothing', async () => {
  const e = env();
  const res = await post(e, { ...RU, website: 'http://spam.example' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, id: null });
  assert.equal(rows(e).length, 0);
  assert.equal(tgCalls.length, 0);
});

test('bad requests: method, content type, JSON, size', async () => {
  const e = env();
  assert.equal((await call(e, '/api/lead')).status, 405);
  assert.equal((await post(e, 'not json')).status, 400);
  assert.equal((await post(e, '{"a":', {})).status, 400);
  assert.equal((await post(e, RU, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post(e, { ...RU, comment: 'x'.repeat(9000) })).status, 413);
  assert.equal((await post(e, '[]')).status, 422);
  assert.equal(rows(e).length, 0);
});

test('origin check: other sites are refused unless listed in ALLOWED_ORIGINS (CORS for embedding)', async () => {
  const e = env();
  assert.equal((await post(e, RU, { Origin: 'https://evil.example' })).status, 403);
  const e2 = env({ ALLOWED_ORIGINS: 'https://client-site.example, https://www.client-site.example' });
  const pre = await call(e2, '/api/lead', { method: 'OPTIONS', headers: { Origin: 'https://client-site.example' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'https://client-site.example');
  const res = await post(e2, RU, { Origin: 'https://www.client-site.example' });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://www.client-site.example');
  // no Origin header at all (curl, server-to-server) is allowed: validation and rate limit still apply
  assert.equal((await post(env(), RU, { Origin: '' })).status, 201);
});

test('rate limit: 5 leads per IP per hour, then 429; another IP is not affected', async () => {
  const e = env();
  for (let i = 0; i < 5; i++) assert.equal((await post(e, { ...RU, phone: `+7912000000${i}` })).status, 201);
  const res = await post(e, { ...RU, phone: '+79120000009' });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Retry-After'), '3600');
  assert.equal((await post(e, { ...RU, phone: '+79120000009' }, { 'CF-Connecting-IP': '198.51.100.1' })).status, 201);
  assert.equal(rows(e).length, 6);
});

test('double click returns the first lead; a later different request is stored and flagged as a repeat', async () => {
  const e = env();
  const a = await (await post(e, RU)).json();
  const b = await post(e, RU);
  assert.equal(b.status, 200);
  assert.deepEqual(await b.json(), { ok: true, id: a.id, duplicate: true, estimate: a.estimate });
  assert.equal(tgCalls.length, 1);

  const c = await (await post(e, { ...RU, answers: { ...ANSWERS, scope: 'premium' } })).json();
  assert.equal(c.id, 2);
  assert.equal(rows(e)[1].duplicate_of, 1);
  assert.ok(tgCalls[1].body.text.includes('⚠️ этот телефон уже оставлял заявку #1'));
});

test('Telegram down or misconfigured: the lead is still stored and marked failed', async () => {
  const e = env();
  tgReply = () => Response.json({ ok: false, description: 'Unauthorized' }, { status: 401 });
  const res = await post(e, RU);
  assert.equal(res.status, 201);
  assert.equal(tgCalls.length, 1, 'a 401 is not retried');
  assert.equal(rows(e)[0].tg_status, 'failed');
  assert.equal(rows(e)[0].tg_error, '401 Unauthorized');
  assert.deepEqual(logged, ['telegram 1 401 Unauthorized'], 'the failure is logged for `wrangler tail`');

  const e2 = env();
  tgReply = () => { throw new TypeError('fetch failed'); };
  await post(e2, RU);
  assert.equal(rows(e2)[0].tg_status, 'failed');
  assert.match(rows(e2)[0].tg_error, /network: fetch failed/);
});

test('Telegram 5xx is retried once', async () => {
  const e = env();
  let n = 0;
  tgReply = () => (++n === 1 ? Response.json({ ok: false, description: 'Bad Gateway' }, { status: 502 }) : Response.json({ ok: true }));
  await post(e, RU);
  assert.equal(tgCalls.length, 2);
  assert.equal(rows(e)[0].tg_status, 'sent');
});

test('no bot token configured: lead stored, Telegram skipped, no network call', async () => {
  const e = env({ TG_BOT_TOKEN: undefined });
  assert.equal((await post(e, RU)).status, 201);
  assert.equal(rows(e)[0].tg_status, 'skipped');
  assert.equal(tgCalls.length, 0);
});

test('database error: 500 with a generic message, no stack trace leaked', async () => {
  const e = env();
  e.DB.raw.exec('DROP TABLE leads');
  const res = await post(e, RU);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { ok: false, error: 'server' });
  assert.match(logged[0], /request failed \/api\/lead .*no such table: leads/);
});

// ---------- /admin ----------

test('admin: 401 without or with a wrong password, 503 when no password is configured', async () => {
  const r1 = await call(env(), '/admin');
  assert.equal(r1.status, 401);
  assert.match(r1.headers.get('WWW-Authenticate'), /^Basic realm="Leads"/);
  assert.equal((await call(env(), '/admin', { headers: auth('wrong') })).status, 401);
  assert.equal((await call(env(), '/admin', { headers: { Authorization: 'Basic !!!' } })).status, 401);
  assert.equal((await call(env(), '/admin', { headers: { Authorization: 'Bearer x' } })).status, 401);
  assert.equal((await call(env({ ADMIN_PASSWORD: '' }), '/admin', { headers: auth('') })).status, 503);
  assert.equal((await call(env({ ADMIN_PASSWORD: 'пароль-ёж' }), '/admin', { headers: auth('пароль-ёж') })).status, 200, 'non-ASCII password');
});

test('admin: 10 wrong passwords from one IP lock it out for 15 minutes; other IPs are not affected', async () => {
  const e = env();
  const ip = (n) => ({ 'CF-Connecting-IP': `198.51.100.${n}` });
  assert.equal((await call(e, '/admin', { headers: ip(1) })).status, 401, 'no credentials yet: not counted');
  for (let i = 0; i < 10; i++) assert.equal((await call(e, '/admin', { headers: { ...auth(`guess${i}`), ...ip(1) } })).status, 401);
  const locked = await call(e, '/admin', { headers: { ...auth(), ...ip(1) } });
  assert.equal(locked.status, 429, 'even the right password waits');
  assert.equal(locked.headers.get('Retry-After'), '900');
  assert.equal((await call(e, '/admin', { headers: { ...auth(), ...ip(2) } })).status, 200);
  e.DB.raw.exec("UPDATE auth_fails SET at = '2000-01-01T00:00:00.000Z'");
  assert.equal((await call(e, '/admin', { headers: { ...auth(), ...ip(1) } })).status, 200, 'old failures expire');
  assert.ok(!JSON.stringify(e.DB.raw.prepare('SELECT * FROM auth_fails').all()).includes('198.51.100'), 'raw IP is never stored');
});

test('admin: table lists leads with escaped user text, stats and security headers', async () => {
  const e = env();
  await post(e, { ...RU, comment: '<img src=x onerror=alert(1)>' });
  await post(e, EN, { 'CF-Connecting-IP': '198.51.100.2' });
  const res = await call(e, '/admin', { headers: auth() });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.match(res.headers.get('Content-Security-Policy'), /default-src 'none'/);
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const page = await res.text();
  for (const s of ['Заявки', 'Анна', 'tel:+79123456789', "Mary-Jane O'Neil", 'Капитальный', 'Дизайнерский', 'source: yandex', '<b>2</b><span>Всего</span>']) {
    assert.ok(page.includes(s), `admin page should contain ${s}`);
  }
  assert.ok(page.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!page.includes('<img src=x'));
  const en = await (await call(e, '/admin?lang=en', { headers: auth() })).text();
  assert.ok(en.includes('Designer renovation') && en.includes('Download CSV'));
});

test('admin: filter by status and search by phone digits or name', async () => {
  const e = env();
  await post(e, RU);
  await post(e, EN, { 'CF-Connecting-IP': '198.51.100.2' });
  e.DB.raw.exec("UPDATE leads SET status = 'won' WHERE id = 2");
  const won = await (await call(e, '/admin?status=won', { headers: auth() })).text();
  assert.ok(won.includes('Mary-Jane') && !won.includes('Анна'));
  const byPhone = await (await call(e, '/admin?q=912%20345', { headers: auth() })).text();
  assert.ok(byPhone.includes('Анна') && !byPhone.includes('Mary-Jane'));
  const byName = await (await call(e, "/admin?q=O'Neil", { headers: auth() })).text();
  assert.ok(byName.includes('Mary-Jane') && !byName.includes('+79123456789'));
  const inj = await call(e, "/admin?q=' OR 1=1 --", { headers: auth() });
  assert.equal(inj.status, 200);
  assert.ok((await inj.text()).includes('Заявок пока нет'));
});

test('admin: status and note update from the page; CSRF and bad values refused', async () => {
  const e = env();
  await post(e, RU);
  const form = (fields) => new URLSearchParams(fields).toString();
  const h = { ...auth(), 'Content-Type': 'application/x-www-form-urlencoded' };
  const ok = await call(e, '/admin/leads/1', { method: 'POST', headers: { ...h, Origin: ORIGIN }, body: form({ status: 'visit', note: 'Замер в субботу 11:00', back: '/admin?status=new' }) });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('Location'), '/admin?status=new');
  assert.equal(rows(e)[0].status, 'visit');
  assert.equal(rows(e)[0].note, 'Замер в субботу 11:00');

  assert.equal((await call(e, '/admin/leads/1', { method: 'POST', headers: { ...h, Origin: 'https://evil.example' }, body: form({ status: 'lost' }) })).status, 403);
  assert.equal((await call(e, '/admin/leads/1', { method: 'POST', headers: h, body: form({ status: 'lost' }) })).status, 403, 'no Origin and no Sec-Fetch-Site');
  assert.equal((await call(e, '/admin/leads/1', { method: 'POST', headers: { ...h, Origin: ORIGIN }, body: form({ status: 'deleted' }) })).status, 400);
  assert.equal((await call(e, '/admin/leads/1', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN }, body: form({ status: 'lost' }) })).status, 401);
  const evilBack = await call(e, '/admin/leads/1', { method: 'POST', headers: { ...h, 'Sec-Fetch-Site': 'same-origin' }, body: form({ status: 'won', back: 'https://evil.example/' }) });
  assert.equal(evilBack.headers.get('Location'), '/admin', 'no open redirect');
  assert.equal(rows(e)[0].status, 'won');
});

test('admin: CSV export with BOM, labels and spreadsheet-formula protection', async () => {
  const e = env();
  await post(e, { ...RU, comment: '=HYPERLINK("http://evil.example","click")' });
  await post(e, { ...EN, comment: "-2+3+cmd|' /C calc'!A0" }, { 'CF-Connecting-IP': '198.51.100.2' });
  const res = await call(e, '/admin/leads.csv', { headers: auth() });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /^text\/csv/);
  assert.match(res.headers.get('Content-Disposition'), /attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"/);
  const buf = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...buf.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM so Excel opens Cyrillic correctly');
  const lines = new TextDecoder().decode(buf).split('\r\n');
  assert.ok(lines[0].startsWith('id,created_at,status,name,phone'));
  assert.ok(lines[2].includes('Анна,+79123456789,telegram,Квартира во вторичке,54,Капитальный,Санузел под ключ; Вывоз мусора и клининг'));
  assert.ok(lines[2].includes(`"'=HYPERLINK(""http://evil.example"",""click"")"`), lines[2]);
  assert.ok(lines[1].includes(`'-2+3+cmd|' /C calc'!A0`), lines[1]);
  assert.ok(lines[1].includes(',+15550100199,'), 'phones stay as they are');
  assert.equal((await call(e, '/admin/leads.csv', {})).status, 401);
});

test('other paths go to static assets; 404 without them', async () => {
  assert.equal((await call(env(), '/nope')).status, 404);
  const e = env({ ASSETS: { fetch: async (req) => new Response(`asset ${new URL(req.url).pathname}`) } });
  assert.equal(await (await call(e, '/ru/')).text(), 'asset /ru/');
  assert.deepEqual(await (await call(e, '/api/health')).json(), { ok: true });
});

// ---------- demo mode ----------

test('demo mode: the response carries the Telegram card the owner would get, in the visitor language, nothing is sent', async () => {
  const e = env({ DEMO_MODE: '1', TG_BOT_TOKEN: undefined, TG_CHAT_ID: undefined, OWNER_LANG: 'en' });
  const out = await (await post(e, { ...RU, comment: '<b>hi</b> & co' })).json();
  assert.equal(out.ok, true);
  assert.ok(out.card.html.includes('Заявка #1') && out.card.html.includes('Анна') && out.card.html.includes('+79123456789'), out.card.html);
  assert.ok(out.card.html.includes('&lt;b&gt;hi&lt;/b&gt; &amp; co'), 'user text is HTML-escaped');
  assert.equal(out.card.button, '📋 Открыть таблицу заявок');
  const en = await (await post(e, EN, { 'CF-Connecting-IP': '198.51.100.9' })).json();
  assert.ok(en.card.html.includes('Lead #2'), en.card.html);
  assert.equal(tgCalls.length, 0);
  assert.equal(rows(e)[0].tg_status, 'skipped');
  // a double click returns the card again
  assert.ok((await (await post(e, RU)).json()).card.html.includes('Заявка #1'));
  // outside demo mode there is no card in the response
  assert.equal('card' in (await (await post(env(), EN, { 'CF-Connecting-IP': '198.51.100.20' })).json()), false);
});

test('demo daily cap: the whole site stops accepting leads after DEMO_DAILY_CAP in 24 hours', async () => {
  const e = env({ DEMO_DAILY_CAP: '3' });
  for (let i = 0; i < 3; i++) assert.equal((await post(e, { ...RU, phone: `+7912000000${i}` }, { 'CF-Connecting-IP': `198.51.100.${i}` })).status, 201);
  const res = await post(e, { ...RU, phone: '+79120000009' }, { 'CF-Connecting-IP': '198.51.100.99' });
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { ok: false, error: 'demo_full' });
  assert.equal(rows(e).length, 3);
});

test('owner view: public, read-only, shows only the made-up seed rows and never touches the database', async () => {
  const e = env();
  e.DB.prepare = () => { throw new Error('the owner view must not read D1'); };
  await call(env(), '/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', Origin: ORIGIN }, body: JSON.stringify({ ...RU, name: 'Реальный Клиент', phone: '+79998887766' }) });
  const res = await call(e, '/owner-demo');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /text\/html/);
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const html = await res.text();
  assert.ok(html.includes('Анна Соколова') && html.includes('Mary Whitfield'));
  assert.ok(!html.includes('<form') && !html.includes('csv') && !html.includes('type="hidden"'), 'no forms, no export');
  assert.ok(!html.includes('Реальный') && !html.includes('998887766'));
  const en = await (await call(e, '/owner-demo?lang=en&status=won')).text();
  assert.ok(en.includes('Tom Hendricks') && en.includes('Contract signed.') && !en.includes('Priya Nair'));
  assert.equal((await call(e, '/owner-demo', { method: 'POST' })).status, 405);
  assert.equal((await call(e, '/admin')).status, 401, 'the real table stays behind the password');
});
