// Ingestion, run by the owner at deploy time (`npm run ingest`). It is not a public route.
//   1. chunk every document            (src/chunker.js)
//   2. embed every chunk               (Workers AI @cf/baai/bge-m3 through the Cloudflare REST API, 1024 dimensions)
//   3. load documents, chunks and the full-text index into D1   (wrangler d1 execute --remote)
//   4. upsert the vectors into Vectorize                        (wrangler vectorize upsert)
// Credentials: your wrangler login (OAuth token from its config file), or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID.
//
//   node scripts/ingest.mjs            full run
//   node scripts/ingest.mjs --dry      chunk only, print the numbers, change nothing
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { DOCS } from '../data/docs.js';
import { chunkCorpus } from '../src/chunker.js';

const DRY = process.argv.includes('--dry');
const root = new URL('..', import.meta.url);
const NAME = 'rag-knowledge-base-demo';
const MODEL = '@cf/baai/bge-m3';

const chunks = chunkCorpus(DOCS);
console.log(`${DOCS.length} documents -> ${chunks.length} chunks (longest ${Math.max(...chunks.map((c) => c.text.length))} chars)`);
if (DRY) process.exit(0);

function credentials() {
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    return { token: process.env.CLOUDFLARE_API_TOKEN, account: process.env.CLOUDFLARE_ACCOUNT_ID };
  }
  const candidates = [
    path.join(process.env.APPDATA || '', 'xdg.config', '.wrangler', 'config', 'default.toml'),
    path.join(os.homedir(), '.wrangler', 'config', 'default.toml'),
    path.join(os.homedir(), '.config', '.wrangler', 'config', 'default.toml'),
  ];
  const file = candidates.find((f) => existsSync(f));
  if (!file) throw new Error('No wrangler login found. Run `npx wrangler login` or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.');
  const token = readFileSync(file, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
  const who = execSync('npx wrangler whoami', { cwd: root, encoding: 'utf8' });
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || who.match(/\b[0-9a-f]{32}\b/)?.[0];
  if (!token || !account) throw new Error('Could not read the wrangler token or the account id.');
  return { token, account };
}

const { token, account } = credentials();

async function embedBatch(texts) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`embedding failed: ${JSON.stringify(j.errors)}`);
  return j.result.data;
}

const vectors = [];
for (let i = 0; i < chunks.length; i += 16) {
  const batch = chunks.slice(i, i + 16);
  const data = await embedBatch(batch.map((c) => c.embedText));
  data.forEach((v, k) => vectors.push({ id: batch[k].id, values: v, metadata: { doc: batch[k].doc_id } }));
  console.log(`embedded ${Math.min(i + 16, chunks.length)}/${chunks.length}`);
}
if (vectors.some((v) => v.values.length !== 1024)) throw new Error('unexpected embedding size');

const out = new URL('.ingest/', root);
mkdirSync(out, { recursive: true });

// D1: wipe and reload, so a re-run after editing the corpus is clean.
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const titleOf = new Map(DOCS.map((d) => [d.id, d.title]));
const sql = [
  'DELETE FROM chunks_fts;', 'DELETE FROM chunks;', 'DELETE FROM docs;', 'DELETE FROM answer_cache;',
  ...DOCS.map((d) => `INSERT INTO docs (id, lang, category, title, body) VALUES (${q(d.id)}, ${q(d.lang)}, ${q(d.category)}, ${q(d.title)}, ${q(d.body)});`),
  ...chunks.map((c) => `INSERT INTO chunks (id, doc_id, idx, heading, start, "end", text) VALUES (${q(c.id)}, ${q(c.doc_id)}, ${c.idx}, ${q(c.heading)}, ${c.start}, ${c.end}, ${q(c.text)});`),
  ...chunks.map((c) => `INSERT INTO chunks_fts (chunk_id, title, heading, text) VALUES (${q(c.id)}, ${q(titleOf.get(c.doc_id))}, ${q(c.heading)}, ${q(c.text)});`),
].join('\n');
writeFileSync(new URL('ingest.sql', out), sql);
writeFileSync(new URL('vectors.ndjson', out), vectors.map((v) => JSON.stringify(v)).join('\n') + '\n');

const run = (cmd) => { console.log(`$ ${cmd}`); execSync(cmd, { cwd: root, stdio: 'inherit' }); };
run(`npx wrangler d1 execute ${NAME} --remote --yes --file=.ingest/ingest.sql`);
run(`npx wrangler vectorize upsert ${NAME} --file=.ingest/vectors.ndjson`);
console.log(`\nDone: ${DOCS.length} documents, ${chunks.length} chunks, ${vectors.length} vectors. Vectorize needs a few seconds to index them.`);
