// Renders the 3 screenshots in shots/ from a real headless run of the tool (offline mode: scripts/serve.mjs,
// the Worker code with the deterministic generator, so the shots match what `npm test` checks).
// Needs Playwright with Chromium (not a project dependency):
//   npm i --no-save playwright && npx playwright install chromium && node scripts/shots.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const OUT = fileURLToPath(new URL('../shots/', import.meta.url));
const server = await start(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });

async function packageRun(lang, sample) {
  await page.goto(`${base}/?lang=${lang}`);
  await page.click(`[data-sample="${sample}"]`);
  await page.waitForFunction(() => document.querySelector('#text').value.length > 100);
  await page.click('#go');
  await page.waitForSelector('#result:not([hidden])');
  await page.evaluate(() => window.scrollTo(0, 0));
}

// 1. EN: thumbnail text on the mock layout, title options with reasons, description with chapters
await packageRun('en', 'en');
await page.addStyleTag({ content: '#pkg-form{display:none} #card-tags,#card-pinned{display:none}' });
await page.screenshot({ path: OUT + '1-titles-thumbnails-en.png', fullPage: true });

// 2. RU: description with computed chapters, tags, pinned comment (from .srt subtitles)
await packageRun('ru', 'ru');
await page.addStyleTag({ content: '#pkg-form{display:none} #card-titles,#card-thumbs{display:none} .grid{grid-template-columns:1.25fr 1fr} #card-desc{grid-row:span 2}' });
await page.screenshot({ path: OUT + '2-description-chapters-ru.png', fullPage: true });

// 3. EN: views ÷ subscribers outlier finder
await page.goto(`${base}/?lang=en&tab=outliers`);
await page.click('#sample-out');
await page.waitForFunction(() => document.querySelector('#out-text').value.length > 50);
await page.click('#out-form [type=submit]');
await page.waitForSelector('#out-result:not([hidden])');
await page.screenshot({ path: OUT + '3-outliers-en.png', fullPage: true });

await browser.close();
server.close();
console.log('shots written to', OUT);
