// Renders shots/*.png: the scripted conversations (scripts/scenarios.mjs, real bot output from the real Worker code)
// drawn as a Telegram-like chat (scripts/render-chat.mjs) and captured with headless Chromium.
// Needs Playwright with Chromium: `npm i -D playwright && npx playwright install chromium` once.
//   npm run shots            (also writes the HTML next to each PNG with --html)
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runScenarios } from './scenarios.mjs';
import { chatHtml } from './render-chat.mjs';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* not installed */ }
}
if (!chromium) {
  console.error('Playwright is not installed: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

process.chdir(new URL('..', import.meta.url).pathname);
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch();
try {
  for (const s of await runScenarios()) {
    const html = chatHtml(s);
    if (process.argv.includes('--html')) writeFileSync(s.file.replace(/\.png$/, '.html'), html);
    const page = await browser.newPage({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2, colorScheme: s.theme });
    page.on('pageerror', (e) => { throw e; });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: s.file, fullPage: true });
    console.log('wrote', s.file);
    await page.close();
  }
} finally {
  await browser.close();
}
