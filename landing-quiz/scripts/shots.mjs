// Screenshots from a real headless run: starts scripts/serve-local.mjs (real Worker code, node:sqlite as D1,
// Telegram faked), opens the pages in Chromium, walks the quiz, submits a lead and captures:
//   shots/desktop.png       EN landing, 1440 px, first screen
//   shots/mobile.png        RU landing, 375 px, first screen
//   shots/quiz-result.png   RU quiz: estimate + filled lead form, 1440 px
//   review/page-<lang>-<w>.png   full pages at 375 / 768 / 1440 (layout check, no horizontal scroll)
//   review/quiz-375.png, review/done-1440.png, review/admin-1440.png, review/admin-375.png
//   review/telegram-card.png     the card the Worker produced for the owner (text from the run, Telegram-like frame)
// Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium` on a new machine).
//   node scripts/shots.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { T } from '../src/i18n.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('..', import.meta.url);
const PORT = 8790;
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(new URL('shots/', root), { recursive: true });
mkdirSync(new URL('review/', root), { recursive: true });
const out = (f) => new URL(f, root).pathname;

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/serve-local.mjs', '--port', String(PORT)], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, OWNER_LANG: 'ru' } });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => { if (String(d).includes('Local demo')) res(); });
  server.on('exit', (c) => rej(new Error(`server exited ${c}`)));
});

const problems = [];
const browser = await chromium.launch();
try {
  // ---------- layout check at three widths, both languages ----------
  for (const lang of ['en', 'ru']) {
    for (const w of [375, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width: w, height: w === 375 ? 812 : w === 768 ? 1024 : 900 } });
      page.on('pageerror', (e) => problems.push(`${lang} ${w}: page error ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`${lang} ${w}: console ${m.text()}`); });
      await page.goto(`${BASE}/${lang === 'ru' ? 'ru/' : ''}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w) problems.push(`${lang} ${w}: horizontal scroll, scrollWidth ${sw}`);
      const wide = await page.evaluate((vw) => [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.right > vw + 1 || r.left < -1) && !el.closest('.hp, .skip'); }).slice(0, 5).map((el) => `${el.tagName}.${el.className}`), w);
      if (wide.length) problems.push(`${lang} ${w}: elements outside the viewport: ${wide.join(', ')}`);
      await page.screenshot({ path: out(`review/page-${lang}-${w}.png`), fullPage: true });
      await page.close();
    }
  }

  // ---------- buyer-facing shots at 2x ----------
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out('shots/desktop.png') });
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}/ru/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out('shots/mobile.png') });
    await page.close();
  }

  // ---------- quiz walkthrough on mobile (keyboard-free taps), RU ----------
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    page.on('pageerror', (e) => problems.push(`quiz 375: page error ${e.message}`));
    await page.goto(`${BASE}/ru/#calc`, { waitUntil: 'networkidle' });
    await page.tap('.opt:has(input[value=newbuild])');
    await page.waitForSelector('[data-step=area]:not([hidden])');
    await page.tap('[data-area="45"]');
    await page.waitForTimeout(300);
    await page.locator('#quiz').screenshot({ path: out('review/quiz-375.png') });
    await page.close();
  }

  // ---------- full quiz + lead, RU desktop ----------
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push(`quiz 1440: page error ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`quiz 1440: console ${m.text()}`); });
  await page.goto(`${BASE}/ru/?utm_source=yandex&utm_medium=cpc&utm_campaign=remont-spring`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const visibleStep = () => page.evaluate(() => document.querySelector('#quiz .step:not([hidden])').dataset.step);
  const expectStep = async (id) => {
    await page.waitForFunction((s) => document.querySelector('#quiz .step:not([hidden])')?.dataset.step === s, id, { timeout: 3000 }).catch(() => {});
    const got = await visibleStep();
    if (got !== id) problems.push(`quiz: expected step ${id}, got ${got}`);
  };
  await page.click('.hero-cta .btn-primary');
  await page.waitForTimeout(600);
  // Next without an answer shows a hint and stays
  await page.click('[data-act=next]');
  const hint = await page.textContent('.nav-hint');
  if (!hint) problems.push('quiz: no hint when Next is pressed without an answer');
  await expectStep('property');
  await page.click('.opt:has(input[value=resale])');
  await expectStep('area');
  await page.fill('.area-input', '54');
  await page.locator('.area-input').blur();
  await page.click('[data-act=next]');
  await expectStep('scope');
  await page.click('.opt:has(input[value=standard])');
  await expectStep('extras');
  await page.click('.opt:has(input[value=bathroom])');
  await page.click('.opt:has(input[value=cleanup])');
  await page.click('[data-act=next]');
  await expectStep('start');
  await page.click('.opt:has(input[value=month])');
  await expectStep('result');
  // the browser estimate must match the Worker's (same module)
  const range = await page.textContent('[data-out=range]');
  // validation: submit empty
  await page.click('#quiz [type=submit]');
  const nameErr = await page.textContent('#e-name');
  if (!nameErr) problems.push('lead form: no error for an empty name');
  await page.fill('#f-name', 'Анна');
  await page.fill('#f-phone', '8 (912) 345-67-89');
  await page.click('.chip:has(input[value=telegram])');
  await page.fill('#f-comment', 'Хочу тёплый пол в ванной');
  await page.check('[name=consent]');
  await page.click('#quiz'); // move focus off the inputs
  await page.addStyleTag({ content: '.site-head{position:static!important}' }); // the sticky header would cover the section in element shots
  await page.locator('.sec-quiz').screenshot({ path: out('shots/quiz-result.png') });
  await page.click('#quiz [type=submit]');
  await expectStep('done');
  await page.waitForTimeout(400);
  const doneText = await page.textContent('[data-out=doneText]');
  if (!/№1\b/.test(doneText)) problems.push(`done screen: unexpected text "${doneText}"`);
  await page.locator('.sec-quiz').screenshot({ path: out('review/done-1440.png'), scale: 'css' });

  // ---------- what the owner got ----------
  const outbox = await (await fetch(`${BASE}/__outbox`)).json();
  if (outbox.length !== 1) problems.push(`telegram: expected 1 card, got ${outbox.length}`);
  const card = outbox[0];
  if (!card.text.includes(range)) problems.push(`telegram: card estimate differs from the page (${range})`);
  writeFileSync(out('review/telegram-card.html'), telegramHtml(card.text));
  const tg = await browser.newPage({ viewport: { width: 520, height: 400 }, deviceScaleFactor: 2 });
  await tg.goto(`file://${out('review/telegram-card.html')}`);
  await tg.locator('.phone').screenshot({ path: out('review/telegram-card.png') });
  await tg.close();

  // ---------- leads table ----------
  for (const [w, h] of [[1440, 700], [375, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, httpCredentials: { username: 'owner', password: 'demo' } });
    const a = await ctx.newPage();
    // a second lead so the table has more than one row
    await a.request.post(`${BASE}/api/lead`, { headers: { 'Content-Type': 'application/json', Origin: BASE }, data: { lang: 'en', answers: { property: 'house', area: 120, scope: 'premium', extras: ['design'], start: 'asap' }, name: 'Mary Jones', phone: '+1 555 010 0199', contact: 'whatsapp', consent: true, page: '/' } }).catch(() => {});
    await a.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    const sw = await a.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) problems.push(`admin ${w}: horizontal scroll ${sw}`);
    await a.screenshot({ path: out(`review/admin-${w}.png`), fullPage: true });
    await ctx.close();
  }
  console.log('estimate on the page:', range);
  console.log('Telegram card:\n' + card.text);
} finally {
  await browser.close();
  server.kill();
}
if (problems.length) { console.error('\nPROBLEMS:\n' + problems.join('\n')); process.exit(1); }
console.log('\nOK: no horizontal scroll at 375/768/1440 (EN, RU), no console errors, quiz -> lead -> Telegram card -> leads table.');

function telegramHtml(text) {
  const btn = T.ru.openTable;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
body{margin:0;background:#dfe7ec;font:15px/1.42 -apple-system,"Segoe UI",Roboto,Inter,sans-serif}
.phone{width:440px;margin:0;background:#c9d8c2 linear-gradient(160deg,#d5e2cc,#b9cdb4);padding:0 0 14px}
.top{background:#fff;padding:10px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #d6dde2}
.av{width:38px;height:38px;border-radius:50%;background:#e2571f;color:#fff;display:grid;place-items:center;font-weight:700}
.top b{display:block;font-size:15px}.top span{font-size:13px;color:#6b7a86}
.msg{margin:14px 12px 0;background:#fff;border-radius:14px 14px 14px 4px;padding:9px 12px 7px;white-space:pre-wrap;box-shadow:0 1px 1px rgba(0,0,0,.1)}
.msg time{display:block;text-align:right;font-size:12px;color:#8a99a5;margin-top:2px}
.kb{margin:4px 12px 0;background:rgba(40,60,40,.28);color:#fff;text-align:center;border-radius:10px;padding:9px;font-weight:600;font-size:14px}
.note{font:12px/1.4 sans-serif;color:#4a5560;margin:8px 12px 0}
</style></head><body><div class="phone"><div class="top"><div class="av">П</div><div><b>Планка · заявки с сайта</b><span>бот</span></div></div>
<div class="msg">${text}<time>18:04</time></div><div class="kb">${btn}</div>
<p class="note">Текст карточки взят из локального прогона (scripts/shots.mjs). Кнопка добавляется на опубликованном https-сайте.</p></div></body></html>`;
}
