// One-command deploy to Cloudflare (your wrangler login; free plan: Workers + D1 + Vectorize + Workers AI).
//
//   node scripts/deploy.mjs           create the Vectorize index and the D1 database (once), migrate, deploy, set ADMIN_KEY
//   node scripts/deploy.mjs --dry     print the steps, change nothing
//
// Then load the knowledge base and warm the example answers:
//   npm run ingest && npm run warm
// The generated ADMIN_KEY is saved to deploy-secrets.txt (git-ignored) and reused on the next run.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const DRY = process.argv.includes('--dry');
const root = new URL('..', import.meta.url);
const p = (f) => new URL(f, root);
const NAME = 'rag-knowledge-base-demo';
const ZERO = '00000000-0000-0000-0000-000000000000';

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}${opts.input ? '  (value from stdin)' : ''}`);
  if (DRY) return '';
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: [opts.input ? 'pipe' : 'inherit', opts.show ? 'inherit' : 'pipe', 'inherit'], input: opts.input });
}

const saved = existsSync(p('deploy-secrets.txt')) ? Object.fromEntries(readFileSync(p('deploy-secrets.txt'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => l.split('=').map((x) => x.trim()))) : {};
const ADMIN_KEY = saved.ADMIN_KEY || randomBytes(16).toString('hex');

// 1. Vectorize index (bge-m3 gives 1024 numbers per text; cosine similarity).
const indexes = DRY ? '' : sh('npx wrangler vectorize list');
if (!indexes.includes(NAME)) sh(`npx wrangler vectorize create ${NAME} --dimensions=1024 --metric=cosine`);

// 2. D1 database, created once; its id goes into wrangler.toml.
const toml = readFileSync(p('wrangler.toml'), 'utf8');
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
sh(`npx wrangler d1 migrations apply ${NAME} --remote`, { show: true });

// 3. Worker + secret.
const out = sh('npx wrangler deploy');
const url = DRY ? `https://${NAME}.<account>.workers.dev` : (out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/) || [])[0];
if (!url) { console.error('Could not find the workers.dev URL in the deploy output.'); process.exit(1); }
sh('npx wrangler secret put ADMIN_KEY', { input: ADMIN_KEY });
if (!DRY) writeFileSync(p('deploy-secrets.txt'), `ADMIN_KEY=${ADMIN_KEY}\nURL=${url}\n`);

console.log(`\nDone: ${url}\nNext: npm run ingest && npm run warm`);
