// Renders the 3 screenshots from a REAL in-process run of the Worker (same harness as the tests, no AI, no network):
//   shots/inbox-en.png      web inbox after the 16 sample messages
//   shots/telegram-ru.png   owner's Telegram (hot-lead card, Edit, Approve) next to the customer's chat
//   shots/detail-ru.png     one request: extracted fields, lead score, the draft editor
// The HTML sources are kept in shots/src/. Needs Playwright (+ Chromium) only for the PNG step.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { SAMPLES, NOW } from '../test/samples.js';
import { makeEnv, call, postSample, tgMessage, tgTap, OWNER } from '../test/helpers.mjs';

const out = (f) => new URL(`../shots/${f}`, import.meta.url);
mkdirSync(out('src/'), { recursive: true });

// 1. Run the samples through the Worker, spaced out over a morning so the inbox shows real-looking times.
const env = makeEnv({ OWNER_LANG: 'ru' });
const t0 = Date.parse(NOW) - 3.2 * 3600e3;
const ownerLog = [];   // what the owner's chat saw, in order
const customerLog = []; // what Oleg's chat saw
const oleg = SAMPLES.find((s) => s.id === 'ru-tg-office');
for (const [i, s] of SAMPLES.entries()) {
  env.NOW_OVERRIDE = new Date(t0 + i * 12 * 60e3 + (i % 3) * 137e3).toISOString();
  const r = await postSample(env, s);
  if (r.status !== 200) throw new Error(`${s.id}: HTTP ${r.status}`);
  if (s === oleg) {
    customerLog.push({ me: s.in.text });
    for (const o of r.body.outbox) {
      if (o.chat_id === OWNER) ownerLog.push({ bot: o });
      else if (o.method === 'sendMessage' && o.chat_id === s.in.from.id && !o.reply_markup && !/Демо/.test(o.text)) customerLog.push({ bot: o });
    }
  }
}
env.NOW_OVERRIDE = NOW;

// 2. The owner edits Oleg's draft, then approves it.
const OW = { id: OWNER, first_name: 'Owner', language_code: 'ru' };
const card0 = ownerLog[0].bot;
const id = Number(card0.reply_markup.inline_keyboard[0][0].callback_data.split(':')[1]);
const edit = await call(env, 'POST', '/telegram', { json: tgTap(OW, `ed:${id}`, { message_id: 1001, chat_id: OWNER }) });
ownerLog.push({ tap: '✏️ Изменить' });
for (const o of edit.body.outbox) if (o.method === 'sendMessage') ownerLog.push({ bot: o });
const ownerText = 'Здравствуйте, Олег! Стол из слэба ореха на 10 персон и стеллажи за 2 недели сделаем: есть срочный слот. Дизайнер может приехать на замер завтра в 11:00 или 16:00 — какое время удобнее?\n\nКоманда Oakbloom';
const ed2 = await call(env, 'POST', '/telegram', { json: tgMessage(OW, ownerText) });
ownerLog.push({ me: ownerText });
let lastCard = null;
for (const o of ed2.body.outbox) if (o.method === 'sendMessage') { ownerLog.push({ bot: o }); if (o.reply_markup?.inline_keyboard?.length) lastCard = ownerLog[ownerLog.length - 1]; }
const ok = await call(env, 'POST', '/telegram', { json: tgTap(OW, `ok:${id}`, { message_id: 2002, chat_id: OWNER }) });
ownerLog.push({ tap: '✅ Одобрить и отправить' });
for (const o of ok.body.outbox) {
  if (o.method === 'editMessageText' && o.chat_id === OWNER && lastCard) lastCard.bot = { ...o, edited: true }; // the card in place, now "Sent"
  if (o.method === 'answerCallbackQuery' && o.text) ownerLog.push({ popup: o.text });
  if (o.method === 'sendMessage' && o.chat_id === oleg.in.from.id) customerLog.push({ bot: o });
}

// 3. Pages from the Worker itself.
const inboxHtml = (await call(env, 'GET', '/inbox?lang=en')).body;
const kitchen = (await call(env, 'GET', '/api/requests')).body.requests.find((r) => r.name === 'Ирина Соколова');
const detailHtml = (await call(env, 'GET', `/inbox/${kitchen.id}?lang=ru`)).body;
writeFileSync(out('src/inbox-en.html'), inboxHtml);
writeFileSync(out('src/detail-ru.html'), detailHtml);

// 4. Telegram mock from the recorded Bot API calls.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tgHtml = (t) => String(t).replace(/\n/g, '<br>'); // already Telegram HTML, escaped by the Worker
function bubbles(log) {
  return log.map((x) => {
    if (x.me) return `<div class="me">${esc(x.me).replace(/\n/g, '<br>')}</div>`;
    if (x.tap) return `<div class="tap">нажата кнопка «${esc(x.tap)}»</div>`;
    if (x.popup) return `<div class="tap pop">${esc(x.popup)}</div>`;
    const o = x.bot;
    let src = o.text;
    // The refreshed card repeats the whole lead; show its header and the part that changed (draft + status).
    if (o.edited) src = src.split('\n')[0] + '\n…\n' + src.slice(src.indexOf('<b>Черновик'));
    const text = o.parse_mode === 'HTML' ? tgHtml(src) : esc(src).replace(/\n/g, '<br>');
    const kb = (o.reply_markup?.inline_keyboard || []).map((row) => `<div class="kb">${row.map((b) => `<span>${esc(b.text)}</span>`).join('')}</div>`).join('');
    const cls = 'bot';
    return `<div class="${cls}">${text}${x.bot.edited ? '<span class="ed">изменено</span>' : ''}</div>${kb}`;
  }).join('\n');
}
const tg = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#f6f3ec;font:14px/1.42 "Segoe UI",system-ui,sans-serif;color:#16191d}
#shot{display:flex;gap:18px;padding:18px;width:1060px;align-items:flex-start}
.phone{flex:1;background:#dfe7dc;border-radius:16px;overflow:hidden;border:1px solid #d3cdbf}.phone.cust{flex:.78}
.head{background:#23382d;color:#fff;padding:11px 15px}.head b{display:block;font-size:14.5px}.head span{font-size:12px;opacity:.8}
.chat{padding:12px 11px;display:flex;flex-direction:column;gap:6px}
.me,.bot{max-width:90%;padding:8px 11px;border-radius:12px;box-shadow:0 1px 0 rgba(0,0,0,.06);overflow-wrap:anywhere}
.me{align-self:flex-end;background:#d4f0c9;border-bottom-right-radius:4px}.bot{align-self:flex-start;background:#fff;border-bottom-left-radius:4px;position:relative}
.bot.clip{max-height:118px;overflow:hidden;-webkit-mask-image:linear-gradient(#000 70%,transparent)}
.bot blockquote{margin:4px 0;padding:2px 0 2px 9px;border-left:3px solid #2f6b4f;background:#f1f6f2;border-radius:4px}
.ed{font-size:11px;color:#8a8a8a;margin-left:6px}
.kb{display:flex;gap:4px;max-width:90%;align-self:flex-start;width:90%}.kb span{flex:1;text-align:center;background:rgba(35,56,45,.14);color:#23382d;font-weight:600;border-radius:8px;padding:6px 4px;font-size:12.5px}
.tap{align-self:center;font-size:12px;color:#565c63;background:rgba(0,0,0,.07);border-radius:999px;padding:3px 10px}.tap.pop{background:#23382d;color:#fff}
.foot{font-size:11.5px;color:#565c63;padding:8px 14px 11px;border-top:1px solid #d3cdbf;background:#f6f3ec}
</style></head><body><div id="shot">
<div class="phone"><div class="head"><b>Oakbloom · ИИ-агент входящих</b><span>чат владельца: горячий лид, правка черновика, отправка</span></div>
<div class="chat">${bubbles(ownerLog)}</div>
<div class="foot">Автотест ${NOW.slice(0, 10)}: тестовые сообщения, ответы и карточки настоящие (вывод Worker)</div></div>
<div class="phone cust"><div class="head"><b>Oakbloom (демо-бот)</b><span>чат клиента</span></div>
<div class="chat">${bubbles(customerLog)}</div>
<div class="foot">Клиент получает ответ только после одобрения владельца</div></div>
</div></body></html>`;
writeFileSync(out('src/telegram-ru.html'), tg);
console.log(`rendered shots/src/*.html from the run at ${NOW}`);

// 5. PNGs (skipped with a note if Playwright is not installed).
let pw;
try { pw = createRequire(import.meta.url)('playwright'); } catch { console.log('playwright not found: open shots/src/*.html and screenshot by hand, or `npm i -D playwright && npx playwright install chromium`.'); process.exit(0); }
const browser = await pw.chromium.launch();
const shoot = async (src, png, { width, height, selector, full = true }) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(out(`src/${src}`).href);
  if (selector) await page.locator(selector).screenshot({ path: out(png).pathname });
  else await page.screenshot({ path: out(png).pathname, fullPage: full });
  await page.close();
};
await shoot('inbox-en.html', 'inbox-en.png', { width: 1240, height: 1000, full: false });
await shoot('telegram-ru.html', 'telegram-ru.png', { width: 1100, height: 900, selector: '#shot' });
await shoot('detail-ru.html', 'detail-ru.png', { width: 1240, height: 900, full: true });
await browser.close();
console.log('wrote shots/inbox-en.png, shots/telegram-ru.png, shots/detail-ru.png');
