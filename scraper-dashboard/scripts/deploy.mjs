// One-command deploy to Cloudflare (free plan): `npm run deploy`
//
//   1. D1 database: created on the first run, its id written into wrangler.toml
//   2. remote migrations
//   3. wrangler deploy (Worker + static dashboard); the workers.dev URL goes into PUBLIC_URL
//   4. secrets: ADMIN_KEY (random, saved to admin-key.txt, git-ignored); optional Telegram: BOT_TOKEN from
//      bot-token.txt + TG_CHAT_ID (from --chat <id>, or read from the bot's last private message)
//   5. first scrape right away (POST /api/run), so the dashboard is not empty until the first lazy refresh
//
//   node scripts/deploy.mjs --dry        print the steps, change nothing
//   node scripts/deploy.mjs --chat 123   Telegram chat id for alerts (otherwise: write /start to the bot first)
//   node scripts/deploy.mjs --no-run     skip the first scrape
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const chatArg = argv.includes('--chat') ? argv[argv.indexOf('--chat') + 1] : null;
const root = new URL('..', import.meta.url);
const p = (f) => new URL(f, root);
const NAME = 'price-monitor-demo';
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

function sh(cmd, { input, show = true } = {}) {
  console.log(`$ ${cmd}${input ? '  (value from stdin)' : ''}`);
  if (DRY) return '';
  const out = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: [input ? 'pipe' : 'inherit', 'pipe', 'inherit'], input });
  if (show) process.stdout.write(out);
  return out;
}
const npx = (args, opts) => sh(`npx wrangler ${args}`, opts);
const readToml = () => readFileSync(p('wrangler.toml'), 'utf8');

// 1. D1
let toml = readToml();
if (toml.includes(PLACEHOLDER)) {
  const out = npx(`d1 create ${NAME}`);
  const id = (out.match(/database_id"?\s*[=:]\s*"([0-9a-f-]{36})"/) || out.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/) || [])[1];
  if (!id && !DRY) {
    console.error('Could not read the database id from the output above. Paste it into wrangler.toml (database_id) and run again.');
    process.exit(1);
  }
  if (!DRY) writeFileSync(p('wrangler.toml'), toml.replace(PLACEHOLDER, id));
  console.log(`D1 database id ${id || '(dry run)'} written to wrangler.toml`);
} else {
  console.log('D1 database already set in wrangler.toml');
}

// 2. migrations
npx(`d1 migrations apply ${NAME} --remote`, { input: 'y\n' });

// 3. deploy, then remember the public URL for alert links
const out = npx('deploy');
const url = (out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/) || [])[0];
toml = readToml();
if (url && !toml.includes(`PUBLIC_URL = "${url}"`)) {
  writeFileSync(p('wrangler.toml'), toml.replace(/PUBLIC_URL = "[^"]*"/, `PUBLIC_URL = "${url}"`));
  npx('deploy', { show: false });
  console.log(`PUBLIC_URL = ${url}`);
}

// 4. secrets
let adminKey = existsSync(p('admin-key.txt')) ? readFileSync(p('admin-key.txt'), 'utf8').trim() : '';
if (!adminKey) {
  adminKey = randomBytes(18).toString('base64url');
  if (!DRY) writeFileSync(p('admin-key.txt'), adminKey + '\n');
  console.log('New ADMIN_KEY saved to admin-key.txt (git-ignored)');
}
npx('secret put ADMIN_KEY', { input: adminKey });

if (existsSync(p('bot-token.txt'))) {
  const token = readFileSync(p('bot-token.txt'), 'utf8').trim();
  let chat = chatArg;
  if (!chat && !DRY) {
    const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`).then((x) => x.json()).catch(() => ({}));
    const msgs = (r.result || []).map((u) => u.message).filter((m) => m && m.chat?.type === 'private');
    if (msgs.length) chat = String(msgs.at(-1).chat.id);
  }
  if (chat) {
    npx('secret put BOT_TOKEN', { input: token });
    npx('secret put TG_CHAT_ID', { input: chat });
    console.log(`Telegram alerts go to chat ${chat}`);
  } else {
    console.log('bot-token.txt found, but no chat id: write /start to the bot and run again, or pass --chat <id>. Alerts stay off.');
  }
} else {
  console.log('No bot-token.txt: Telegram alerts stay off (optional, see README).');
}

// 5. first run
if (url && !argv.includes('--no-run')) {
  console.log(`$ POST ${url}/api/run`);
  if (!DRY) {
    await new Promise((r) => setTimeout(r, 3000)); // let the new secret propagate
    const r = await fetch(`${url}/api/run`, { method: 'POST', headers: { Authorization: `Bearer ${adminKey}` } });
    console.log(`first run: HTTP ${r.status} ${await r.text()}`);
  }
}
console.log(`\nDashboard: ${url || '(see the wrangler output above)'}`);
