// Retrieval eval against the deployed Worker (admin key lifts the visitor limits; no answers are generated).
//   node scripts/eval.mjs [url]      URL and key come from deploy-secrets.txt, or RAG_URL / RAG_ADMIN_KEY
// Reports hit@3 for the hybrid search and, for comparison, for each search on its own, and checks the refusal threshold.
import { readFileSync, existsSync } from 'node:fs';
import { EVAL, UNANSWERABLE } from '../data/eval.js';

const secretsFile = new URL('../deploy-secrets.txt', import.meta.url);
const saved = existsSync(secretsFile) ? Object.fromEntries(readFileSync(secretsFile, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])) : {};
const base = (process.argv[2] || process.env.RAG_URL || saved.URL || '').replace(/\/$/, '');
const key = process.env.RAG_ADMIN_KEY || saved.ADMIN_KEY;
if (!base || !key) { console.error('Need the Worker URL and ADMIN_KEY (deploy-secrets.txt).'); process.exit(1); }

const docOf = (id) => id.split('#')[0];
const first3 = (list) => [...new Set(list.map((x) => docOf(x.id)))].slice(0, 3);
async function search(q) {
  const r = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}`, { headers: { 'X-Admin-Key': key } });
  if (!r.ok) throw new Error(`${r.status} for "${q}"`);
  return r.json();
}
const min = (await (await fetch(`${base}/api/status`)).json()).min_vector;

const tot = { hybrid: 0, vector: 0, fts: 0 };
const rows = [];
for (const e of EVAL) {
  const r = await search(e.q);
  const got = { hybrid: first3(r.hits), vector: first3(r.lists.vector), fts: first3(r.lists.fts) };
  const hit = Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.some((d) => e.docs.includes(d))]));
  for (const k of Object.keys(tot)) tot[k] += hit[k] ? 1 : 0;
  rows.push({ q: e.q, expected: e.docs.join('/'), top3: got.hybrid.join(','), hybrid: hit.hybrid, vector: hit.vector, fts: hit.fts, best: r.bestVector?.toFixed(3) });
}
console.table(rows);
const n = EVAL.length;
console.log(`hit@3 over ${n} questions: hybrid ${tot.hybrid}/${n}, vector only ${tot.vector}/${n}, full-text only ${tot.fts}/${n}`);

console.log(`\nRefusal threshold (best cosine score < ${min} means "not in the base"):`);
let refused = 0;
for (const q of UNANSWERABLE) {
  const r = await search(q);
  const ok = r.bestVector < min;
  refused += ok ? 1 : 0;
  console.log(`  ${ok ? 'refused ' : 'ANSWERS '} ${r.bestVector.toFixed(3)}  ${q}`);
}
const answerableMin = Math.min(...(await Promise.all(EVAL.map(async (e) => (await search(e.q)).bestVector))));
console.log(`  lowest best-score among the answerable questions: ${answerableMin.toFixed(3)}`);
console.log(`unanswerable questions refused by the threshold: ${refused}/${UNANSWERABLE.length}`);
