// One-command deploy to Cloudflare (your account, wrangler OAuth login) + Telegram setup.
// Reads the bot token from bot-token.txt (never printed, never committed).
//
//   npm run deploy                 deploy (creates the D1 database on the first run)
//   npm run deploy -- --dry        print what would run, change nothing
//
// Steps: D1 create (once, id written to wrangler.toml) -> remote migrations -> wrangler deploy (Worker + Mini App +
// no cron) -> secrets (SESSION_SECRET, BOT_TOKEN, WEBHOOK_SECRET, APP_URL, BOT_USERNAME) -> Telegram: setWebhook with the secret,
// menu button that opens the Mini App, commands and descriptions in EN and RU.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const DRY = process.argv.includes('--dry');
const root = new URL('..', import.meta.url);
const p = (f) => new URL(f, root);
const NAME = 'tg-crm-miniapp-demo';
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}${opts.input ? '  (value from stdin)' : ''}`);
  if (DRY) return '';
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: [opts.input ? 'pipe' : 'inherit', 'pipe', 'inherit'], input: opts.input });
}
function shVisible(cmd) {
  console.log(`$ ${cmd}`);
  if (!DRY) execSync(cmd, { cwd: root, stdio: 'inherit' });
}
async function tg(token, method, body) {
  if (DRY) { console.log(`tg ${method} ${JSON.stringify({ ...body, ...(body?.secret_token ? { secret_token: '***' } : {}) }).slice(0, 120)}`); return { ok: true, result: {} }; }
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}

if (!existsSync(p('bot-token.txt'))) {
  console.error('bot-token.txt not found. Create a bot in @BotFather and paste its token into demos/tg-crm-miniapp/bot-token.txt (one line).');
  process.exit(1);
}
const token = readFileSync(p('bot-token.txt'), 'utf8').trim();
if (!/^\d+:[\w-]{30,}$/.test(token)) { console.error('bot-token.txt does not look like a bot token (digits:letters).'); process.exit(1); }
const me = await tg(token, 'getMe');
if (!me.ok) { console.error('Telegram rejected the token:', me.description); process.exit(1); }
const botUsername = me.result.username || 'your_bot';
console.log(`Bot: @${botUsername}`);

// 1. D1 database: created once, its id goes into wrangler.toml.
let toml = readFileSync(p('wrangler.toml'), 'utf8');
if (toml.includes(PLACEHOLDER)) {
  // If wrangler offers to edit the config itself, answer No: this script writes the id.
  shVisible(`npx wrangler d1 create ${NAME}`);
  const list = DRY ? '[]' : sh('npx wrangler d1 list --json');
  const id = (JSON.parse(list).find((d) => d.name === NAME) || {}).uuid;
  if (!DRY) {
    if (!id) { console.error('Could not find the new database in `wrangler d1 list --json`.'); process.exit(1); }
    toml = toml.replace(PLACEHOLDER, id);
    writeFileSync(p('wrangler.toml'), toml);
    console.log(`D1 database ${id} written to wrangler.toml`);
  }
}
shVisible(`npx wrangler d1 migrations apply ${NAME} --remote`); // may ask to confirm: answer yes

// 2. Worker (API + bot + Mini App static files).
const out = sh('npx wrangler deploy');
const url = DRY ? `https://${NAME}.<account>.workers.dev` : (out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/) || [])[0];
if (!url) { console.error('Could not find the workers.dev URL in the deploy output.'); process.exit(1); }
const secret = randomBytes(24).toString('hex');
sh('npx wrangler secret put SESSION_SECRET', { input: randomBytes(32).toString('hex') });
sh('npx wrangler secret put BOT_TOKEN', { input: token });
sh('npx wrangler secret put WEBHOOK_SECRET', { input: secret });
sh('npx wrangler secret put APP_URL', { input: url });
sh('npx wrangler secret put BOT_USERNAME', { input: botUsername });

// 3. Telegram side.
const wh = await tg(token, 'setWebhook', { url: `${url}/webhook`, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true });
console.log('setWebhook:', wh.ok ? 'ok' : wh.description);
const menu = await tg(token, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'CRM', web_app: { url: `${url}/` } } });
console.log('menu button:', menu.ok ? 'ok' : menu.description);
const cmds = {
  en: [['start', 'Open the CRM'], ['digest', 'Today\'s digest'], ['today', 'Reminders for today'], ['new', 'Add a lead: /new Name, Company, Phone'], ['lang', 'Русский / English'], ['reset', 'Start the demo over']],
  ru: [['start', 'Открыть CRM'], ['digest', 'Сводка за сегодня'], ['today', 'Напоминания на сегодня'], ['new', 'Новый лид: /new Имя, Компания, Телефон'], ['lang', 'Русский / English'], ['reset', 'Начать демо заново']],
};
for (const [lang, list] of Object.entries(cmds)) {
  await tg(token, 'setMyCommands', { commands: list.map(([command, description]) => ({ command, description })), ...(lang === 'ru' ? { language_code: 'ru' } : {}) });
}
await tg(token, 'setMyShortDescription', { short_description: 'Demo: a sales CRM inside Telegram. Leads, statuses, reminders, daily digest, stats.' });
await tg(token, 'setMyShortDescription', { short_description: 'Демо: CRM отдела продаж прямо в Telegram. Лиды, статусы, напоминания, утренняя сводка, статистика.', language_code: 'ru' });
await tg(token, 'setMyDescription', { description: 'A demo CRM Mini App for the sales team of a fictional company. Press Start, open the CRM, and play with your own sandbox of leads. Built on Cloudflare Workers + D1.' });
await tg(token, 'setMyDescription', { description: 'Демо CRM в виде Telegram Mini App для отдела продаж вымышленной компании. Нажмите Start, откройте CRM и попробуйте свою песочницу с лидами. Сделано на Cloudflare Workers + D1.', language_code: 'ru' });

console.log(`\nDone. Bot: https://t.me/${botUsername}   Mini App: ${url}/   (Telegram sign-in inside the bot; a plain browser gets the demo sandbox)`);
