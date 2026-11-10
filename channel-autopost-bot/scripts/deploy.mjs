// One-command deploy to Cloudflare (your account, wrangler OAuth login) + Telegram setup.
// Reads the bot token from bot-token.txt (never printed, never committed).
//
//   npm run deploy                 deploy (creates the D1 database on the first run)
//   npm run deploy -- --dry        print what would run, change nothing
//
// Steps: D1 create (once, id written to wrangler.toml) -> remote migrations -> wrangler deploy (Worker + cron +
// Workers AI binding) -> secrets (BOT_TOKEN, WEBHOOK_SECRET) -> Telegram: setWebhook with the secret, commands and
// descriptions in EN and RU.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const DRY = process.argv.includes('--dry');
const root = new URL('..', import.meta.url);
const p = (f) => new URL(f, root);
const NAME = 'channel-autopost-bot';
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

let token = '';
if (existsSync(p('bot-token.txt'))) token = readFileSync(p('bot-token.txt'), 'utf8').trim();
else if (!DRY) {
  console.error('bot-token.txt not found. Create a bot in @BotFather and paste its token into demos/channel-autopost-bot/bot-token.txt (one line).');
  process.exit(1);
}
if (!DRY && !/^\d+:[\w-]{30,}$/.test(token)) { console.error('bot-token.txt does not look like a bot token (digits:letters).'); process.exit(1); }
const me = DRY ? { ok: true, result: { username: 'your_bot' } } : await tg(token, 'getMe');
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

// 2. Worker (webhook + cron + Workers AI).
const out = sh('npx wrangler deploy');
const url = DRY ? `https://${NAME}.<account>.workers.dev` : (out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/) || [])[0];
if (!url) { console.error('Could not find the workers.dev URL in the deploy output.'); process.exit(1); }
const secret = randomBytes(24).toString('hex');
sh('npx wrangler secret put BOT_TOKEN', { input: token });
sh('npx wrangler secret put WEBHOOK_SECRET', { input: secret });

// 3. Telegram side.
const wh = await tg(token, 'setWebhook', { url: `${url}/webhook`, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
console.log('setWebhook:', wh.ok ? 'ok' : wh.description);
const cmds = {
  en: [['start', 'Menu'], ['new', 'Add a post (text or photo)'], ['draft', 'AI draft: /draft <topic>'], ['queue', 'Queue: scheduled posts and drafts'], ['schedule', 'Publishing time slots'], ['stats', 'Stats of published posts'], ['subscribe', 'Paid access to the private channel'], ['status', 'My access'], ['lang', 'Русский / English'], ['cancel', 'Cancel the current step'], ['reset', 'Start the demo over']],
  ru: [['start', 'Меню'], ['new', 'Новый пост (текст или фото)'], ['draft', 'Черновик с ИИ: /draft <тема>'], ['queue', 'Очередь: запланированные и черновики'], ['schedule', 'Слоты публикации'], ['stats', 'Статистика опубликованного'], ['subscribe', 'Платный доступ в закрытый канал'], ['status', 'Мой доступ'], ['lang', 'Русский / English'], ['cancel', 'Отменить текущий шаг'], ['reset', 'Начать демо заново']],
};
for (const [lang, list] of Object.entries(cmds)) {
  await tg(token, 'setMyCommands', { commands: list.map(([command, description]) => ({ command, description })), ...(lang === 'ru' ? { language_code: 'ru' } : {}) });
}
await tg(token, 'setMyShortDescription', { short_description: 'Demo: a bot that runs a Telegram channel. Content queue, AI drafts, schedule, approve buttons, stats, paid access.' });
await tg(token, 'setMyShortDescription', { short_description: 'Демо: бот ведёт Telegram-канал. Очередь постов, черновики с ИИ, расписание, одобрение, статистика, платный доступ.', language_code: 'ru' });
await tg(token, 'setMyDescription', { description: 'A demo autoposting bot for the owner of a fictional coffee channel. Press Start: you get your own sandbox. Send a post or ask for an AI draft, approve it, and it goes out on schedule. Built on Cloudflare Workers + D1 + Workers AI. Payments in this demo are a mock.' });
await tg(token, 'setMyDescription', { description: 'Демо бота-автопостера для владельца вымышленного кофейного канала. Нажмите Start — у вас будет своя песочница. Пришлите пост или попросите черновик у ИИ, одобрите — и он выйдет по расписанию. Сделано на Cloudflare Workers + D1 + Workers AI. Оплата в демо — заглушка.', language_code: 'ru' });

console.log(`\nDone. Bot: https://t.me/${botUsername}   Worker: ${url}/health`);
