// Hybrid retrieval: vector search (Workers AI bge-m3 embeddings in Cloudflare Vectorize) + full-text search (D1 FTS5),
// merged with reciprocal rank fusion. Returns the chunks with the evidence of how each one was found.
import { rrfMerge } from './rrf.js';
import { searchFts } from './fts.js';

export const LIST_SIZE = 8;     // candidates taken from each search
export const PANEL_SIZE = 6;    // chunks shown in the "retrieved" panel
export const CONTEXT_SIZE = 4;  // chunks given to the language model

export async function embed(env, text) {
  const out = await env.AI.run(env.EMBED_MODEL || '@cf/baai/bge-m3', { text: [text] });
  const v = out?.data?.[0];
  if (!Array.isArray(v) || !v.length) throw new Error('embedding failed');
  return v;
}

export async function vectorSearch(env, question, topK = LIST_SIZE) {
  const vec = await embed(env, question);
  const res = await env.VECTORIZE.query(vec, { topK, returnMetadata: 'none', returnValues: false });
  return (res.matches || []).map((m) => ({ id: m.id, score: m.score }));
}

async function loadChunks(db, ids) {
  if (!ids.length) return new Map();
  const marks = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(`SELECT c.id, c.doc_id, c.idx, c.heading, c.start, c."end" AS end, c.text, d.title, d.lang FROM chunks c JOIN docs d ON d.id = c.doc_id WHERE c.id IN (${marks})`)
    .bind(...ids)
    .all();
  return new Map(results.map((r) => [r.id, r]));
}

/** @param {{vector?: boolean}} opts vector:false skips the embedding call (text search only). */
export async function retrieve(env, question, { vector = true } = {}) {
  const [vec, fts] = await Promise.all([
    vector ? vectorSearch(env, question) : Promise.resolve([]),
    searchFts(env.DB, question, LIST_SIZE),
  ]);
  const merged = rrfMerge({ vector: vec, fts }).slice(0, PANEL_SIZE);
  const rows = await loadChunks(env.DB, merged.map((m) => m.id));
  const hits = merged
    .map((m) => {
      const r = rows.get(m.id);
      if (!r) return null;
      return {
        id: m.id, doc_id: r.doc_id, title: r.title, lang: r.lang, heading: r.heading, text: r.text, start: r.start, end: r.end,
        rrf: Number(m.rrf.toFixed(5)),
        vector_score: m.scores.vector ?? null, vector_rank: m.ranks.vector ?? null,
        fts_rank: m.ranks.fts ?? null,
        found_by: m.foundBy.length === 2 ? 'both' : m.foundBy[0] === 'vector' ? 'vector' : 'fts',
      };
    })
    .filter(Boolean);
  // Cosine similarity of the closest chunk, whatever its final position after fusion.
  const bestVector = vec.length ? Math.max(...vec.map((v) => v.score)) : null;
  return { hits, bestVector, lists: { vector: vec, fts } };
}
