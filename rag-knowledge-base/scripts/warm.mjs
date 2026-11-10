// Fills the answer cache for the example questions, in both languages (12 generated answers, once).
// The admin key skips the visitor limits and refreshes the cache. Run it after `npm run ingest`.
//   node scripts/warm.mjs [url]
import { readFileSync, existsSync } from 'node:fs';
import { EXAMPLES } from '../data/docs.js';

const secretsFile = new URL('../deploy-secrets.txt', import.meta.url);
const saved = existsSync(secretsFile) ? Object.fromEntries(readFileSync(secretsFile, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])) : {};
const base = (process.argv[2] || process.env.RAG_URL || saved.URL || '').replace(/\/$/, '');
const key = process.env.RAG_ADMIN_KEY || saved.ADMIN_KEY;
if (!base || !key) { console.error('Need the Worker URL and ADMIN_KEY (deploy-secrets.txt).'); process.exit(1); }

let bad = 0;
for (const ex of EXAMPLES) {
  const negative = ex.id === EXAMPLES[EXAMPLES.length - 1].id; // the last example is the one that must be refused
  for (const lang of ['ru', 'en']) {
    const r = await fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key }, body: JSON.stringify({ question: ex[lang] }) });
    const j = await r.json();
    const ok = r.ok && j.mode === 'ai' && (negative ? j.refused : !j.refused && j.cited.length > 0);
    if (!ok) bad++;
    console.log(`${ok ? 'ok ' : 'BAD'} ${ex.id} ${lang} refused=${j.refused} cited=${JSON.stringify(j.cited)} best=${j.best_vector?.toFixed(3)} | ${String(j.answer).slice(0, 110).replace(/\n/g, ' ')}`);
  }
}
console.log(bad ? `${bad} example(s) did not behave as expected` : 'All examples cached and behave as expected.');
process.exit(bad ? 1 : 0);
