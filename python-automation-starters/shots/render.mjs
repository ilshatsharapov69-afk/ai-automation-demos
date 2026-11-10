// Screenshots shots/src/*.html -> shots/*.png (Playwright, 2x for crisp text).
// Usage (from python-automation-starters): python shots/build_shots.py && node shots/render.mjs
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = path.dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
for (const file of readdirSync(path.join(dir, 'src')).filter((f) => f.endsWith('.html'))) {
  await page.goto('file://' + path.join(dir, 'src', file));
  const out = path.join(dir, file.replace('.html', '.png'));
  await page.locator('body').screenshot({ path: out });
  console.log('wrote', out);
}
await browser.close();
