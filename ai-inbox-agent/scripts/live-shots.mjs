// Screenshots of the LIVE demo (real browser render, first screen only).
//   node scripts/live-shots.mjs https://<worker>.workers.dev <out-dir> [name]
// Needs Playwright (+ Chromium): PLAYWRIGHT_PATH=<path to a playwright or playwright-core package> if it is not installed here.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const base = (process.argv[2] || '').replace(/\/$/, '');
const dir = process.argv[3] || 'shots';
const name = process.argv[4] || 'ai-inbox';
if (!base) { console.error('usage: node scripts/live-shots.mjs https://<worker>.workers.dev <out-dir> [name]'); process.exit(1); }
mkdirSync(dir, { recursive: true });
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function shot(file, { width, height, scale = 1, path, mobile = false }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile, locale: path.includes('lang=ru') ? 'ru-RU' : 'en-US' });
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${dir}/${file}`, fullPage: false });
  await ctx.close();
  console.log('saved', `${dir}/${file}`);
}

await shot(`${name}-desk.png`, { width: 1440, height: 900, path: '/inbox?lang=en' });
await shot(`${name}-mobile.png`, { width: 390, height: 844, scale: 2, mobile: true, path: '/inbox?lang=en' });
await shot(`${name}-desk-ru.png`, { width: 1440, height: 900, path: '/inbox?lang=ru' });
const hot = process.env.DETAIL_ID || '34';
await shot(`${name}-detail-desk.png`, { width: 1440, height: 900, path: `/inbox/${hot}?lang=en` });
await browser.close();
