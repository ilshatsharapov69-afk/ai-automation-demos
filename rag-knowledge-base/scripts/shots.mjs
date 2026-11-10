// Screenshots of the deployed demo in a real headless Chromium (example questions only: cached, no AI budget used).
//   node scripts/shots.mjs [url] [outDir]
// Writes rag-desk.png (1440x900, EN), rag-desk-ru.png (1440x900, RU), rag-mobile.png (390x844 at 2x), rag-docs.png.
// Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`), or a global install.
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
for (const id of ['playwright', path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@playwright', 'mcp', 'node_modules', 'playwright')]) {
  try { ({ chromium } = require(id)); break; } catch { /* try the next one */ }
}
if (!chromium) { console.error('Playwright is not installed.'); process.exit(1); }

const secretsFile = new URL('../deploy-secrets.txt', import.meta.url);
const saved = existsSync(secretsFile) ? Object.fromEntries(readFileSync(secretsFile, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])) : {};
const base = (process.argv[2] || process.env.RAG_URL || saved.URL || '').replace(/\/$/, '');
const outDir = process.argv[3] || new URL('../shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(outDir, { recursive: true });

// If this Playwright wants a newer browser than the one installed, fall back to any installed headless shell.
async function launch() {
  try { return await chromium.launch({ args: ['--mute-audio'] }); } catch (e) {
    const root = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
    const dir = existsSync(root) ? readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell')).sort().pop() : null;
    const exe = dir && readdirSync(path.join(root, dir)).map((d) => path.join(root, dir, d, 'chrome-headless-shell.exe')).find(existsSync);
    if (!exe) throw e;
    return chromium.launch({ executablePath: exe, args: ['--mute-audio'] });
  }
}
const browser = await launch();

async function answered(page, lang, example) {
  await page.goto(`${base}/?lang=${lang}`, { waitUntil: 'networkidle' });
  await page.locator('.ex').nth(example).click();
  await page.waitForSelector('.chunk', { timeout: 30000 });
  await page.waitForSelector('.answer .cite', { timeout: 30000 });
}

async function shot(name, { lang, width, height, scale = 1, example = 0, scrollTo = '#form' }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await answered(page, lang, example);
  await page.evaluate((sel) => { window.scrollTo(0, document.querySelector(sel).getBoundingClientRect().top + window.scrollY - 12); }, scrollTo);
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`${name}: ok (horizontal overflow ${overflow}px)`);
  await ctx.close();
}

await shot('rag-desk', { lang: 'en', width: 1440, height: 900, example: 0 });
await shot('rag-desk-ru', { lang: 'ru', width: 1440, height: 900, example: 2 });
await shot('rag-mobile', { lang: 'en', width: 390, height: 844, scale: 2, example: 0, scrollTo: '#result' });

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/?lang=en`, { waitUntil: 'networkidle' });
  await page.locator('#tabDocs').click();
  await page.locator('.doc').first().waitFor();
  await page.locator('.doc').nth(4).click();
  await page.locator('.docview').waitFor();
  await page.screenshot({ path: path.join(outDir, 'rag-docs.png') });
  console.log('rag-docs: ok');
  await ctx.close();
}
await browser.close();
