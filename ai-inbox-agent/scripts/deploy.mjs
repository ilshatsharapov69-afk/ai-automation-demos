// One-command deploy to Cloudflare (your wrangler login; free plan: Workers + D1 + Workers AI).
//
//   node scripts/deploy.mjs                 deploy (creates the D1 database on the first run)
//   node scripts/deploy.mjs --seed          ...and fill the inbox with the RU/EN sample messages
//   node scripts/deploy.mjs --owner <id>    owner's Telegram chat id, if it cannot be read automatically
//   node scripts/deploy.mjs --dry           print the steps, change nothing
//
// Telegram is optional: put a BotFather token into bot-token.txt (one line, git-ignored) to get owner cards and the bot.
// Steps: D1 create (once) -> remote migrations -> wrangler deploy -> secrets -> Telegram setWebhook -> optional seed.
// Generated ADMIN_KEY and INBOX_SECRET are saved to deploy-secrets.txt (git-ignored) and reused on the next run.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const SEED = argv.includes('--seed');
const ownerArg = argv.includes('--owner') ? argv[argv.indexOf('--owner') + 1] : null;
const root = new URL('..', import.meta.url);
const p = (f) => new URL(f, root);
const NAME = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8').match(/^name\s*=\s*"([^"]+)"/m)[1];
const ZERO = '00000000-0000-0000-0000-000000000000';

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}${opts.input ? '  (value from stdin)' : ''}`);
  if (DRY) return '';
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: [opts.input ? 'pipe' : 'inherit', opts.show ? 'inherit' : 'pipe', 'inherit'], input: opts.input });
}
async function tg(token, method, body) {
  if (DRY) { console.log(`tg ${method}`); return { ok: true, result: [] }; }
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}

// 0. Saved secrets (stable across redeploys).
const saved = existsSync(p('deploy-secrets.txt')) ? Object.fromEntries(readFileSync(p('deploy-secrets.txt'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => l.split('=').map((x) => x.trim()))) : {};
const secrets = {
  ADMIN_KEY: saved.ADMIN_KEY || randomBytes(12).toString('hex'),
  INBOX_SECRET: saved.INBOX_SECRET || randomBytes(16).toString('hex'),
  WEBHOOK_SECRET: saved.WEBHOOK_SECRET || randomBytes(24).toString('hex'),
};

// 1. Telegram (optional).
const token = existsSync(p('bot-token.txt')) ? readFileSync(p('bot-token.txt'), 'utf8').trim() : '';
let owner = ownerArg;
if (token) {
  if (!/^\d+:[\w-]{30,}$/.test(token)) { console.error('bot-token.txt does not look like a bot token (digits:letters).'); process.exit(1); }
  const me = await tg(token, 'getMe');
  if (!me.ok && !DRY) { console.error('Telegram rejected the token:', me.description); process.exit(1); }
  console.log(`Bot: @${me.result?.username || '(dry run)'}`);
  if (!owner) {
    await tg(token, 'deleteWebhook', {}); // getUpdates works only without a webhook
    const up = await tg(token, 'getUpdates', { limit: 50 });
    const msgs = (up.result || []).map((u) => u.message).filter((m) => m && m.chat?.type === 'private');
    if (msgs.length) { owner = String(msgs[msgs.length - 1].chat.id); console.log(`Owner chat: ${owner} (the last person who wrote to the bot).`); }
    else console.log('No owner chat found: press Start in the bot and run again, or pass --owner <id>. Continuing without owner cards.');
  }
} else console.log('No bot-token.txt: deploying without Telegram (web form, email webhook and inbox still work).');

// 2. D1 database, created once; its id goes into wrangler.toml.
let toml = readFileSync(p('wrangler.toml'), 'utf8');
if (toml.includes(ZERO)) {
  console.log(`$ npx wrangler d1 create ${NAME}   (if wrangler offers to edit the config, answer No: this script writes the id)`);
  if (!DRY) execSync(`npx wrangler d1 create ${NAME}`, { cwd: root, stdio: 'inherit' });
  const list = DRY ? '[]' : sh('npx wrangler d1 list --json');
  const id = (JSON.parse(list).find((d) => d.name === NAME) || {}).uuid;
  if (!DRY) {
    if (!id) { console.error('Could not find the new database in `wrangler d1 list --json`.'); process.exit(1); }
    writeFileSync(p('wrangler.toml'), toml.replace(ZERO, id));
    console.log(`D1 database ${id} written to wrangler.toml`);
  }
}
sh(`npx wrangler d1 migrations apply ${NAME} --remote`, { show: true }); // may ask to confirm: answer yes

// 3. Worker + secrets.
const out = sh('npx wrangler deploy');
if (out) console.log(out.split('\n').filter((l) => /workers\.dev|Uploaded|Deployed/.test(l)).join('\n'));
const url = DRY ? `https://${NAME}.<account>.workers.dev` : (out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/) || [])[0];
if (!url) { console.error('Could not find the workers.dev URL in the deploy output.'); process.exit(1); }
for (const [k, v] of Object.entries(secrets)) sh(`npx wrangler secret put ${k}`, { input: v });
if (token) sh('npx wrangler secret put BOT_TOKEN', { input: token });
if (owner) sh('npx wrangler secret put OWNER_CHAT_ID', { input: owner });
if (!DRY) writeFileSync(p('deploy-secrets.txt'), Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');

// 4. Telegram webhook and bot texts.
if (token) {
  const wh = await tg(token, 'setWebhook', { url: `${url}/telegram`, secret_token: secrets.WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
  console.log('setWebhook:', wh.ok ? 'ok' : wh.description);
  await tg(token, 'setMyCommands', { commands: [{ command: 'start', description: 'Start' }, { command: 'inbox', description: 'Owner: inbox summary' }] });
  await tg(token, 'setMyCommands', { commands: [{ command: 'start', description: 'Начать' }, { command: 'inbox', description: 'Владелец: сводка входящих' }], language_code: 'ru' });
  await tg(token, 'setMyShortDescription', { short_description: 'Demo: an AI agent that sorts incoming requests, drafts replies and sends hot leads to the owner.' });
  await tg(token, 'setMyShortDescription', { short_description: 'Демо: ИИ-агент разбирает заявки, готовит ответы и передаёт горячие лиды владельцу.', language_code: 'ru' });
}

// 5. Optional sample data.
if (SEED) sh(`node scripts/seed.mjs ${url} --secret ${secrets.INBOX_SECRET}`, { show: true });

console.log(`\nDone.
  Inbox:          ${url}/inbox        (public while DEMO_MODE = "on"; owner link: ${url}/inbox?key=${DRY ? '<ADMIN_KEY>' : secrets.ADMIN_KEY})
  Web form:       ${url}/form
  Email webhook:  POST ${url}/api/email  with header X-Inbox-Secret: (INBOX_SECRET in deploy-secrets.txt)
  Telegram:       ${token ? 'webhook set' : 'not configured'}`);
