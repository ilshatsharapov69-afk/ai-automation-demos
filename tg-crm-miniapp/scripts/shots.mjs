// Renders shots/*.png from a headless run of the real Mini App (Worker + SQLite preview, seeded demo data).
// telegram-web-app.js is replaced by a small stub that provides initData and Telegram theme colours, the way
// the Telegram client does inside the app. Needs Playwright with Chromium: `npx playwright install chromium` once.
//   npm run shots
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { startPreview, initDataFor } from './preview.mjs';

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

const THEMES = {
  light: { bg_color: '#ffffff', secondary_bg_color: '#efeff4', section_bg_color: '#ffffff', text_color: '#000000', hint_color: '#8e8e93', subtitle_text_color: '#8e8e93', link_color: '#007aff', button_color: '#007aff', button_text_color: '#ffffff', destructive_text_color: '#ff3b30' },
  dark: { bg_color: '#000000', secondary_bg_color: '#1c1c1d', section_bg_color: '#2c2c2e', text_color: '#ffffff', hint_color: '#98989e', subtitle_text_color: '#98989e', link_color: '#3e88f7', button_color: '#3e88f7', button_text_color: '#ffffff', destructive_text_color: '#eb5545' },
};

function stub(initData, scheme) {
  const theme = THEMES[scheme];
  return `(() => {
    const theme = ${JSON.stringify(theme)};
    for (const [k, v] of Object.entries(theme)) document.documentElement.style.setProperty('--tg-theme-' + k.replace(/_/g, '-'), v);
    const noop = () => {};
    window.Telegram = { WebApp: {
      initData: ${JSON.stringify(initData)}, colorScheme: ${JSON.stringify(scheme)}, themeParams: theme, platform: 'ios', version: '8.0',
      ready: noop, expand: noop, onEvent: noop, BackButton: { show: noop, hide: noop, onClick: noop },
      HapticFeedback: { impactOccurred: noop, notificationOccurred: noop },
    } };
  })();`;
}

const SHOTS = [
  { file: 'shots/1-leads.png', lang: 'en', scheme: 'light', hash: '#/leads' },
  { file: 'shots/2-lead-card-ru.png', lang: 'ru', scheme: 'light', lead: 'Kestrel Logistics' },
  { file: 'shots/3-stats-dark.png', lang: 'en', scheme: 'dark', hash: '#/stats' },
];

const root = new URL('..', import.meta.url);
process.chdir(new URL('.', root).pathname);
mkdirSync('shots', { recursive: true });
const { server, url } = await startPreview(0);
const browser = await chromium.launch();
try {
  for (const s of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: s.scheme, locale: s.lang === 'ru' ? 'ru-RU' : 'en-US', timezoneId: 'UTC' });
    const initData = await initDataFor(s.lang);
    await ctx.route('https://telegram.org/**', (route) => route.fulfill({ contentType: 'text/javascript', body: stub(initData, s.scheme) }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { throw e; });
    await page.goto(`${url}/${s.hash || ''}`);
    await page.waitForSelector('.tabs:not([hidden])');
    if (s.lead) {
      await page.waitForSelector('.lead');
      await page.locator('.lead', { hasText: s.lead }).click();
      await page.waitForSelector('.hero');
    } else {
      await page.waitForSelector(s.hash === '#/stats' ? '.kpis' : '.lead');
    }
    await page.waitForTimeout(150);
    await page.screenshot({ path: s.file });
    console.log('wrote', s.file);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
