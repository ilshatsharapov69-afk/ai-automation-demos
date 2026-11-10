// One-command deploy to Cloudflare (your account, existing `npx wrangler login`):
//
//   npm run deploy                     deploy (creates the D1 database on the first run)
//   npm run deploy -- --dry            print what would run, change nothing
//   npm run deploy -- --chat <id>      Telegram chat id for the lead cards (default: read from the bot)
//   npm run deploy -- --test-lead      after deploying, send one test lead through the live endpoint
//
// Steps: build the pages -> D1 create (once, id written into wrangler.toml) -> remote migration -> wrangler deploy
// -> secrets ADMIN_PASSWORD (generated once into admin-password.txt), IP_SALT, TG_BOT_TOKEN and TG_CHAT_ID
// (from tg-token.txt, optional) -> health check.
// Telegram: create a bot in @BotFather, paste its token into tg-token.txt (one line, git-ignored), open the bot and
// press Start once. The script reads your chat id from getUpdates (works only for a bot without a webhook).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const DRY = process.argv.includes('--dry');
const argVal = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const root = new URL('..', import.meta.url);
const p = (f) => new URL(f, root);
const NAME = 'landing-quiz-demo';
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}${opts.input ? '  (value from stdin)' : ''}`);
  if (DRY) return '';
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: [opts.input ? 'pipe' : 'inherit', opts.show ? 'inherit' : 'pipe', 'inherit'], input: opts.input });
}
async function tg(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}

// 0. Pages are generated from src/site/content.mjs + public/js/quiz-model.js.
sh('node scripts/build.mjs', { show: true });
if (!DRY) {
  try { execSync('npx wrangler whoami', { cwd: root, stdio: 'pipe' }); } catch {
    console.error('Not logged in to Cloudflare. Run `npx wrangler login` once, then `npm run deploy` again.');
    process.exit(1);
  }
}

// 1. Telegram (optional): token from tg-token.txt, chat id from --chat or from the last person who pressed Start.
let token = null;
let chat = argVal('--chat');
if (existsSync(p('tg-token.txt'))) {
  token = readFileSync(p('tg-token.txt'), 'utf8').trim();
  if (!/^\d+:[\w-]{30,}$/.test(token)) { console.error('tg-token.txt does not look like a bot token (digits:letters).'); process.exit(1); }
  const me = await tg(token, 'getMe');
  if (!me.ok) { console.error('Telegram rejected the token:', me.description); process.exit(1); }
  console.log(`Telegram bot: @${me.result.username}`);
  if (!chat) {
    const up = await tg(token, 'getUpdates', { limit: 50 });
    if (!up.ok) {
      console.log(`getUpdates failed (${up.description}). If this bot already has a webhook, pass --chat <your chat id>.`);
    } else {
      const msgs = (up.result || []).map((u) => u.message).filter((m) => m && m.chat?.type === 'private');
      if (msgs.length) {
        const m = msgs[msgs.length - 1];
        chat = String(m.chat.id);
        console.log(`Lead cards go to chat ${chat} (${m.from.first_name || ''} @${m.from.username || '-'}), the last person who wrote to the bot.`);
      } else {
        console.log('No chat found: open the bot in Telegram, press Start, and run again (or pass --chat <id>).');
      }
    }
  }
} else {
  console.log('No tg-token.txt: leads are stored and shown in /admin, but not sent to Telegram (add the token and redeploy).');
}

// 2. D1 database, created once; its id goes into wrangler.toml.
let toml = readFileSync(p('wrangler.toml'), 'utf8');
if (toml.includes(PLACEHOLDER)) {
  // If wrangler offers to add the binding to the config itself, answer No: this script writes the id.
  sh(`npx wrangler d1 create ${NAME}`, { show: true });
  const list = DRY ? '[]' : sh('npx wrangler d1 list --json');
  const id = DRY ? 'dry-run' : (JSON.parse(list).find((d) => d.name === NAME) || {}).uuid;
  if (!DRY) {
    if (!id) { console.error('Could not find the new database in `wrangler d1 list --json`.'); process.exit(1); }
    toml = toml.replace(PLACEHOLDER, id);
    writeFileSync(p('wrangler.toml'), toml);
    console.log(`D1 database ${id} written to wrangler.toml`);
  }
}
sh(`npx wrangler d1 migrations apply ${NAME} --remote`, { show: true }); // may ask to confirm: answer yes

// 3. Worker + static pages.
const deployOut = sh('npx wrangler deploy');
if (deployOut) console.log(deployOut.trim().split('\n').slice(-6).join('\n'));
const url = DRY ? `https://${NAME}.<account>.workers.dev` : (deployOut.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/) || [])[0];
if (!url) { console.error('Could not find the workers.dev URL in the deploy output.'); process.exit(1); }

// 4. Secrets.
let password;
if (existsSync(p('admin-password.txt'))) password = readFileSync(p('admin-password.txt'), 'utf8').trim();
else {
  password = randomBytes(15).toString('base64url');
  if (!DRY) writeFileSync(p('admin-password.txt'), password + '\n');
  console.log(DRY ? 'Would generate a leads-table password into admin-password.txt.' : 'New leads-table password written to admin-password.txt (git-ignored).');
}
sh('npx wrangler secret put ADMIN_PASSWORD', { input: password });
sh('npx wrangler secret put IP_SALT', { input: randomBytes(16).toString('hex') });
if (token) sh('npx wrangler secret put TG_BOT_TOKEN', { input: token });
if (token && chat) sh('npx wrangler secret put TG_CHAT_ID', { input: chat });

// 5. Checks.
if (!DRY) {
  const h = await fetch(`${url}/api/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  console.log('health:', JSON.stringify(h));
  if (process.argv.includes('--test-lead')) {
    const r = await fetch(`${url}/api/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url },
      body: JSON.stringify({ lang: 'ru', answers: { property: 'resale', area: 54, scope: 'standard', extras: ['bathroom'], start: 'month' }, name: 'Тест', phone: '+7 900 000-00-00', contact: 'telegram', comment: 'Проверка после деплоя', consent: true, utm: { source: 'deploy-check' }, page: '/ru/' }),
    });
    console.log('test lead:', r.status, await r.text());
  }
}
console.log(`\nDone.\n  Landing (EN): ${url}/\n  Landing (RU): ${url}/ru/\n  Leads table:  ${url}/admin  (any user name, password in admin-password.txt)\n  Telegram:     ${token && chat ? `cards go to chat ${chat}` : 'not configured'}`);
