// One-command deploy of the demo bot to Cloudflare Workers (his account, wrangler OAuth login).
// Reads the bot token from bot-token.txt (never printed, never committed).
//
//   node scripts/deploy.mjs           deploy (creates the D1 database on the first run)
//   node scripts/deploy.mjs --dry     print what would run, change nothing
//
// Steps: D1 create (once) -> remote migrations -> wrangler deploy -> secrets (BOT_TOKEN, WEBHOOK_SECRET,
// OWNER_CHAT_ID) -> Telegram setWebhook with the secret -> bot commands and description.
// OWNER_CHAT_ID: before the first deploy, open the new bot in Telegram and press Start; the script reads
// that chat from getUpdates (works only while no webhook is set). Or pass --owner <chat id>.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const DRY = process.argv.includes('--dry');
const ownerArg = process.argv.includes('--owner') ? process.argv[process.argv.indexOf('--owner') + 1] : null;
const root = new URL('..', import.meta.url);
const p = (f) => new URL(f, root);
const NAME = 'faq-booking-demo-bot';

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}${opts.input ? '  (value from stdin)' : ''}`);
  if (DRY) return '';
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: [opts.input ? 'pipe' : 'inherit', 'pipe', 'inherit'], input: opts.input });
}
async function tg(token, method, body) {
  if (DRY) { console.log(`tg ${method} ${JSON.stringify(body || {}).slice(0, 120)}`); return { ok: true, result: [] }; }
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  return r.json();
}

if (!existsSync(p('bot-token.txt'))) {
  console.error('bot-token.txt not found. Create the bot in @BotFather and paste the token into demo-bot/bot-token.txt (one line).');
  process.exit(1);
}
const token = readFileSync(p('bot-token.txt'), 'utf8').trim();
if (!/^\d+:[\w-]{30,}$/.test(token)) { console.error('bot-token.txt does not look like a bot token (digits:letters).'); process.exit(1); }

const me = await tg(token, 'getMe');
if (!me.ok && !DRY) { console.error('Telegram rejected the token:', me.description); process.exit(1); }
console.log(`Bot: @${me.result?.username || '(dry run)'}`);

// 1. Owner chat id, read before the webhook exists.
let owner = ownerArg;
if (!owner) {
  const up = await tg(token, 'getUpdates', { limit: 50 });
  const starts = (up.result || []).map((u) => u.message).filter((m) => m && m.chat?.type === 'private');
  if (starts.length) {
    const m = starts[starts.length - 1];
    owner = String(m.chat.id);
    console.log(`Owner chat: ${owner} (${m.from.first_name || ''} @${m.from.username || '-'}) - the last person who wrote to the bot.`);
  } else {
    console.log('No owner chat found: open the bot, press Start, and run again (or pass --owner <id>). Continuing without owner cards.');
  }
}

// 2. D1 database (created once; its id is written into wrangler.toml).
let toml = readFileSync(p('wrangler.toml'), 'utf8');
if (toml.includes('00000000-0000-0000-0000-000000000000')) {
  // Visible output (stdio inherited): if wrangler asks to edit the config itself, answer No; this script writes the id.
  console.log(`$ npx wrangler d1 create ${NAME} --binding DB`);
  if (!DRY) execSync(`npx wrangler d1 create ${NAME} --binding DB`, { cwd: root, stdio: 'inherit' });
  const list = DRY ? '[]' : sh('npx wrangler d1 list --json');
  const id = (JSON.parse(list).find((d) => d.name === NAME) || {}).uuid;
  if (!DRY) {
    if (!id) { console.error('Could not find the new database in wrangler d1 list --json.'); process.exit(1); }
    toml = toml.replace('00000000-0000-0000-0000-000000000000', id);
    writeFileSync(p('wrangler.toml'), toml);
    console.log(`D1 database ${id} written to wrangler.toml`);
  }
}
console.log(`$ npx wrangler d1 migrations apply ${NAME} --remote`);
if (!DRY) execSync(`npx wrangler d1 migrations apply ${NAME} --remote`, { cwd: root, stdio: 'inherit' }); // may ask to confirm: answer yes

// 3. Worker + secrets.
const deployOut = sh('npx wrangler deploy');
const url = DRY ? `https://${NAME}.<account>.workers.dev` : (deployOut.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/) || [])[0];
if (!url) { console.error('Could not find the workers.dev URL in the deploy output.'); process.exit(1); }
const secret = randomBytes(24).toString('hex');
sh('npx wrangler secret put BOT_TOKEN', { input: token });
sh('npx wrangler secret put WEBHOOK_SECRET', { input: secret });
if (owner) sh('npx wrangler secret put OWNER_CHAT_ID', { input: owner });

// 4. Telegram side.
const wh = await tg(token, 'setWebhook', { url: `${url}/webhook`, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
console.log('setWebhook:', wh.ok ? 'ok' : wh.description);
const cmds = {
  en: [['start', 'Start'], ['book', 'Book a visit'], ['request', 'Leave a request'], ['admin', 'Owner view'], ['about', 'About this demo'], ['lang', 'Русский / English']],
  ru: [['start', 'Начать'], ['book', 'Записаться'], ['request', 'Оставить заявку'], ['admin', 'Кабинет владельца'], ['about', 'О демо'], ['lang', 'Русский / English']],
};
for (const [lang, list] of Object.entries(cmds)) {
  await tg(token, 'setMyCommands', { commands: list.map(([command, description]) => ({ command, description })), ...(lang === 'ru' ? { language_code: 'ru' } : {}) });
}
await tg(token, 'setMyShortDescription', { short_description: 'Demo: AI assistant for a small business. Answers from the FAQ, takes bookings, sends leads to the owner.' });
await tg(token, 'setMyShortDescription', { short_description: 'Демо: ИИ-ассистент для малого бизнеса. Отвечает по FAQ, записывает клиентов, передаёт заявки владельцу.', language_code: 'ru' });
await tg(token, 'setMyDescription', { description: 'A demo bot for a fictional beauty studio. Ask a question in your own words, book a visit in a few taps, and see the card the owner receives. Built with Claude Code on Cloudflare Workers.' });
await tg(token, 'setMyDescription', { description: 'Демо-бот вымышленной студии красоты. Задайте вопрос своими словами, запишитесь в несколько нажатий и посмотрите карточку, которая приходит владельцу. Сделано на Claude Code и Cloudflare Workers.', language_code: 'ru' });

const info = await tg(token, 'getWebhookInfo');
console.log(`\nDone. Bot link: https://t.me/${me.result?.username || '<bot>'}  Webhook: ${info.result?.url || '(dry run)'}`);
