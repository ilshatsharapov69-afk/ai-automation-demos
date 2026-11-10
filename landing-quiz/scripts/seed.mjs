// Writes the SQL that fills the demo database with the made-up leads from src/seed.js (so the owner's table is not empty).
//   node scripts/seed.mjs seed.sql
//   npx wrangler d1 execute landing-quiz-demo --remote --file seed.sql
import { writeFileSync } from 'node:fs';
import { seedLeads } from '../src/seed.js';

const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const cols = ['created_at', 'lang', 'name', 'phone', 'contact', 'comment', 'property', 'area', 'scope', 'extras', 'start', 'est_min', 'est_max', 'currency', 'weeks_min', 'weeks_max', 'utm', 'page', 'status', 'note', 'tg_status'];
const sql = seedLeads().reverse().map((r) => `INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map((c) => q(r[c])).join(', ')});`).join('\n') + '\n';
writeFileSync(process.argv[2] || 'seed.sql', sql);
console.log(`${sql.split('\n').filter(Boolean).length} seed rows written`);
