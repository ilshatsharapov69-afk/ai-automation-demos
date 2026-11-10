// End-to-end test with fake Telegram updates against `wrangler dev` (no bot token needed).
// Usage: node test/e2e.mjs [baseUrl]   (default http://127.0.0.1:18797)
// Writes test/transcript.md and exits 1 if any check fails.
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:18797';
const OWNER = 999; // must match OWNER_CHAT_ID in .dev.vars
const EN = { id: 222, first_name: 'Test', username: 'test_en', language_code: 'en' };
const RU = { id: 111, first_name: 'Тест', username: 'test_ru', language_code: 'ru' };
const OW = { id: OWNER, first_name: 'Owner', username: 'owner', language_code: 'en' };

let updateId = 1;
const lines = [];
const fails = [];
const sources = [];
const steps = []; // machine-readable transcript for the screenshot page
const log = (s) => { lines.push(s); console.log(s); };

function tomorrow() { return new Date(Date.now() + 86400000).toISOString().slice(0, 10); }

async function post(update) {
  const r = await fetch(`${BASE}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
  const j = await r.json();
  if (r.status !== 200) fails.push(`HTTP ${r.status}: ${j.error || ''}`);
  return j.outbox || [];
}

function show(user, label, outbox) {
  steps.push({ user: user.username, uid: user.id, label, out: outbox });
  log(`\n**${user.username} →** ${label}`);
  for (const o of outbox) {
    const to = o.chat_id === OWNER ? 'bot → OWNER' : o.chat_id ? `bot → ${o.chat_id === EN.id ? EN.username : o.chat_id === RU.id ? RU.username : o.chat_id}` : 'bot';
    if (o.method === '_debug') { sources.push(o.answer_source); log(`> _(answer source: ${o.answer_source})_`); continue; }
    if (o.method === 'answerCallbackQuery') { if (o.text) log(`> _(${to}: popup)_ ${o.text}`); continue; }
    const kb = o.reply_markup?.inline_keyboard?.flat().map((b) => `[${b.text}]`).join(' ');
    const rk = o.reply_markup?.keyboard ? ' _(+ reply keyboard)_' : '';
    const body = (o.text || '').replace(/\n/g, '\n> ');
    const verb = o.method === 'sendMessage' ? '' : ` _(${o.method})_`;
    if (o.method === 'editMessageReplyMarkup') { log(`> _(${to}: buttons removed)_`); continue; }
    log(`> **${to}**${verb}: ${body}${kb ? `\n> ${kb}` : ''}${rk}`);
  }
  return outbox;
}

const msg = (user, text, extra = {}) => post({ update_id: updateId++, message: { message_id: updateId, date: 0, chat: { id: user.id, type: 'private' }, from: user, text, ...extra } });
const cb = (user, data) => post({ update_id: updateId++, callback_query: { id: String(updateId), from: user, data, message: { message_id: 5000 + updateId, chat: { id: user.id, type: 'private' } } } });
const say = async (user, text) => show(user, `"${text}"`, await msg(user, text));
const tap = async (user, data) => show(user, `taps \`${data}\``, await cb(user, data));
const all = (o) => o.map((x) => x.text || '').join('\n');
function check(name, cond) { if (!cond) fails.push(name); log(`- check: ${name}: ${cond ? 'PASS' : 'FAIL'}`); }

log(`# Demo bot: local end-to-end transcript\n\nRun ${new Date().toISOString()} against \`wrangler dev\` (${BASE}), fake Telegram updates, no bot token: every Bot API call the bot would make is captured. Answers marked by source in the checks. Owner chat id = ${OWNER}.`);

log('\n## 1. English visitor: questions');
let o = await say(EN, '/start');
check('welcome in English with menu', /fictional beauty studio/.test(all(o)) && o[0].reply_markup?.keyboard);
o = await say(EN, 'how much is a manicure?');
check('manicure price answered ($35)', /\$35|35/.test(all(o)));
o = await say(EN, 'do you work on sundays?');
check('Sunday hours answered (10:00)', /10/.test(all(o)));
o = await say(EN, 'can I pay with bitcoin?');
const btcHandoff = /pass your question/.test(all(o));
check('unknown question handled (handoff offered or no invented answer)', btcHandoff || !/yes/i.test(all(o)));

log('\n## 2. English visitor: hand a question to the owner');
o = await say(EN, 'do you do wedding makeup at home?');
const handoff = /pass your question/.test(all(o));
check('out-of-FAQ question gets the handoff button', handoff);
if (handoff) {
  await tap(EN, 'go:handoff');
  await say(EN, 'Anna');
  o = await say(EN, '+1 555 0100');
  check('request saved and owner notified', o.some((x) => x.chat_id === OWNER && /New request/.test(x.text || '')));
}

log('\n## 3. English visitor: booking in 4 steps');
await say(EN, '📅 Book a visit');
await tap(EN, 'svc:mani');
await tap(EN, `day:${tomorrow()}`);
await tap(EN, 'slot:14:00');
await say(EN, 'Anna');
o = await say(EN, 'not a phone');
check('bad contact rejected', /does not look like/.test(all(o)));
o = await say(EN, '+1 555 0100');
check('booking summary shown with Confirm', /check your booking/.test(all(o)));
o = await tap(EN, 'bk:ok');
const bookingMsg = o.find((x) => /New booking #(\d+)/.test(x.text || '') && x.chat_id === OWNER);
check('owner got the booking card with buttons', !!bookingMsg && bookingMsg.reply_markup.inline_keyboard[0].length === 2);
check('visitor got the demo copy of the owner card', o.some((x) => x.chat_id === EN.id && /New booking/.test(x.text || '')));
const bookingId = bookingMsg ? bookingMsg.text.match(/#(\d+)/)[1] : '0';
o = await tap(EN, 'bk:ok');
check('second tap on Confirm creates no second booking', !o.some((x) => /New booking/.test(x.text || '')));
o = await tap(EN, 'slot:16:00');
check('a stale time button does not restart the booking', !/Your name/.test(all(o)));
o = await say(EN, 'сколько стоит педикюр?');
check('a Russian question in an English chat gets a Russian answer', /[а-яё]/i.test(all(o)) && /2\s?500/.test(all(o)));

log('\n## 4. Someone else cannot touch that booking; the owner confirms it');
o = await tap(RU, `own:ok:${bookingId}`);
check('stranger cannot confirm a lead that is not theirs', /не ваша/.test(all(o)));
o = await tap(OW, `own:ok:${bookingId}`);
check('owner confirms, client is told', o.some((x) => x.chat_id === EN.id && /confirmed booking/.test(x.text || '')));
o = await tap(EN, `own:no:${bookingId}`);
check('second tap does not change a decided lead', /confirmed/.test(all(o)));

log('\n## 5. Russian visitor');
o = await say(RU, '/start');
check('welcome in Russian', /вымышленной студии/.test(all(o)));
o = await say(RU, 'сколько стоит окрашивание?');
check('colouring price answered in Russian (5 000)', /5\s?000/.test(all(o)));
o = await say(RU, 'Можно оплатить картой?');
check('card payment answered in Russian', /карт/i.test(all(o)));
await say(RU, '✍️ Оставить заявку');
await say(RU, 'Мария');
await say(RU, '@maria_test');
o = await say(RU, 'Хочу подарочный сертификат на 3000 рублей');
check('Russian request saved and sent to owner', o.some((x) => x.chat_id === OWNER && /New request|Новая заявка/.test(x.text || '')));
o = await say(RU, '📊 Кабинет владельца');
check('demo owner view shows only own leads', /только свои/.test(all(o)) && !/Anna/.test(all(o)));

log('\n## 6. Owner view (real owner sees everything)');
o = await say(OW, '/admin');
check('owner view lists both visitors', /Anna/.test(all(o)) && /Мария/.test(all(o)));
await say(EN, '🌐 Русский');
o = await say(EN, '/id');
check('/id works', /222/.test(all(o)));

check(`answers came from the AI, not only the keyword fallback (${sources.filter((s) => s === 'ai').length} of ${sources.length})`, sources.filter((s) => s === 'ai').length >= 3);

log(`\n## Result\n\n${fails.length ? `FAILED: ${fails.length}\n- ${fails.join('\n- ')}` : 'All checks passed.'}`);
writeFileSync(new URL('./transcript.md', import.meta.url), lines.join('\n') + '\n');
writeFileSync(new URL('./transcript.json', import.meta.url), JSON.stringify({ run: new Date().toISOString(), owner: OWNER, steps }, null, 1));
process.exit(fails.length ? 1 : 0);
