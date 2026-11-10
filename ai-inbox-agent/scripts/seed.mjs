// Fill a deployed inbox with the sample messages from test/samples.js (RU and EN, all categories).
// The Worker's AI really reads every one (category, details, score, drafted reply); nothing is hand-written.
//   node scripts/seed.mjs https://<worker>.workers.dev --secret <INBOX_SECRET> [--reset]
// --reset deletes the old sample rows first (needs the D1 database name from wrangler.toml and your wrangler login).
// The messages get timestamps spread over the last day.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { SAMPLES } from '../test/samples.js';

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) || '').replace(/\/$/, '');
const secret = args.includes('--secret') ? args[args.indexOf('--secret') + 1] : '';
if (!base || !secret) { console.error('usage: node scripts/seed.mjs https://<worker>.workers.dev --secret <INBOX_SECRET> [--reset]'); process.exit(1); }

if (args.includes('--reset')) {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const db = toml.match(/database_name\s*=\s*"([^"]+)"/)[1];
  execSync(`npx wrangler d1 execute ${db} --remote --command "DELETE FROM requests WHERE origin = 'seed'"`, { stdio: 'inherit' });
}

// Newest first, so the top of the inbox shows hot leads in both languages, a support case and the spam filter at work.
const NEWEST_FIRST = ['ru-form-kitchen', 'en-form-kitchen', 'ru-tg-hinge', 'en-tg-cafe', 'ru-email-spam', 'en-form-wardrobe-range', 'ru-tg-office', 'en-tg-wardrobe-defect',
  'ru-email-supplier', 'en-email-table', 'ru-form-showroom', 'en-email-designer', 'ru-email-wardrobe', 'en-form-delivery', 'en-email-seo-spam', 'en-email-coffee-table'];
const order = NEWEST_FIRST.map((id) => SAMPLES.find((x) => x.id === id)).filter(Boolean).reverse(); // oldest first
for (const x of SAMPLES) if (!order.includes(x)) order.unshift(x);

let n = 0;
for (const [i, s] of order.entries()) {
  const ago_min = (order.length - i) * 55 + 12;
  let body;
  if (s.channel === 'form') body = { channel: 'form', ...s.in, id: `seed-${s.id}` }; // an id makes a re-run skip it instead of duplicating
  else if (s.channel === 'email') body = { channel: 'email', ...s.in, message_id: `<seed-${s.id}@example.test>` };
  else body = { channel: 'telegram', message_id: 1000 + i, from: s.in.from, text: s.in.text };
  const r = await fetch(`${base}/api/seed`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Inbox-Secret': secret }, body: JSON.stringify({ ...body, ago_min }) });
  const j = await r.json().catch(() => ({}));
  const q = j.request;
  const info = q ? `${q.category.padEnd(11)} score ${String(q.score).padStart(3)}${q.hot ? ' HOT' : '    '} read:${q.classified_by}/${q.ai_note} reply:${q.draft_source}${j.duplicate ? ' (already there)' : ''}` : JSON.stringify(j).slice(0, 120);
  console.log(`${r.status} ${s.id.padEnd(24)} ${info}`);
  if (r.ok) n++;
}
console.log(`\n${n} of ${order.length} seeded. Inbox: ${base}/inbox`);
