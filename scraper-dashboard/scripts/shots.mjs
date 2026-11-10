// Renders shots/1-overview-en.png, shots/2-filters-ru.png, shots/3-changes-en.png from the offline preview
// (scripts/local.mjs: real Worker API + fixtures + demo drift). Needs Playwright with Chromium:
//   npm i -D playwright && npx playwright install chromium && npm run shots
import { createRequire } from 'node:module';
import { startLocal } from './local.mjs';

const { chromium } = createRequire(import.meta.url)('playwright'); // local or global install
const NOW = Date.UTC(2026, 10, 5, 9, 40);
const app = await startLocal({ port: 0, runs: 28, now: NOW, quiet: true });
const browser = await chromium.launch();
const shoot = async (file, path, { width = 1440, height = 1100, scheme = 'light', before } = {}) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: scheme, timezoneId: 'UTC', locale: 'en-GB' });
  await page.goto(app.base + path);
  await page.waitForSelector('body[data-ready="1"]');
  await page.waitForSelector('#historyChart svg');
  if (before) await before(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: new URL(`../shots/${file}`, import.meta.url).pathname });
  await page.close();
  console.log('shots/' + file);
};

try {
  // 1. Overview, EN: tiles, the table sorted by last change, history of the selected item, changes per run.
  await shoot('1-overview-en.png', '/?lang=en', {
    height: 1060,
    before: async (p) => {
      const box = await p.locator('#historyChart svg').boundingBox();
      await p.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2);
    },
  });
  // 2. RU, filtered: Mystery, changed in the last 7 days, sorted by biggest drop; chart of the top row.
  await shoot('2-filters-ru.png', '/?lang=ru&category=Mystery&changed=7&sort=change&dir=asc', {
    height: 1060,
    before: async (p) => {
      await p.locator('#items tbody tr').first().click();
      await p.waitForTimeout(200);
    },
  });
  // 3. Change feed + run log, dark theme (follows the OS setting).
  await shoot('3-changes-en.png', '/?lang=en', {
    scheme: 'dark',
    height: 760,
    before: async (p) => {
      await p.evaluate(() => window.scrollTo(0, document.querySelector('#feed').closest('.grid2').getBoundingClientRect().top + window.scrollY - 24));
      await p.locator('#feed tbody tr').nth(1).hover();
    },
  });
} finally {
  await browser.close();
  await app.close();
}
