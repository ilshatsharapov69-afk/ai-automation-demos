// One question, start to finish: cache -> budget -> hybrid retrieval -> "does the base know?" -> prompt -> cited answer.
import { EXAMPLES } from '../data/docs.js';
import { retrieve, CONTEXT_SIZE } from './retrieve.js';
import { hasAnswer, isRefusalText, langOf, REFUSAL } from './decide.js';
import { buildMessages, cleanCitations } from './prompt.js';
import { spend, peek, sha256Hex } from './limits.js';

export const cfg = (env) => ({
  perIp: Number(env.PER_IP_HOURLY) || 6,
  daily: Number(env.DAILY_CAP) || 80,
  minVector: Number(env.MIN_VECTOR_SCORE) || 0.5,
  chatModel: env.CHAT_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast',
});

export const nowOf = (env) => Number(env.NOW_OVERRIDE) || Date.now();

const normalize = (q) => String(q || '').trim().replace(/\s+/g, ' ');
const exampleOf = (q) => EXAMPLES.find((e) => e.ru === q || e.en === q) || null;

function replyText(out) {
  if (typeof out === 'string') return out;
  if (typeof out?.response === 'string') return out.response;
  return out?.choices?.[0]?.message?.content || '';
}

/** Chunks as the page needs them: n = the number the model could cite (only the first CONTEXT_SIZE are in the prompt). */
const withNumbers = (hits) => hits.map((h, i) => ({ ...h, n: i < CONTEXT_SIZE ? i + 1 : null }));

export async function handleAsk(env, { question, ip, admin = false }) {
  const q = normalize(question);
  if (q.length < 3 || q.length > 300) return { status: 400, body: { error: 'bad_question' } };
  const lang = langOf(q);
  const c = cfg(env);
  const now = nowOf(env);
  const ipHash = await sha256Hex(`${env.ADMIN_KEY || 'demo'}|${ip}`);
  const example = exampleOf(q);
  const cacheKey = example ? `${example.id}:${lang}` : null;

  // 1. Example questions are answered from the cache: free for visitors, never spend the budget.
  //    (An admin request skips the cache read and refreshes it: that is what `npm run warm` does.)
  if (cacheKey && !admin) {
    const row = await env.DB.prepare('SELECT payload FROM answer_cache WHERE key = ?').bind(cacheKey).first();
    if (row) return { status: 200, body: { ...JSON.parse(row.payload), cached: true, limits: await peek(env.DB, { ipHash, now, perIp: c.perIp, daily: c.daily }) } };
  }

  // 2. Budget. Out of budget = search results only, no generated answer.
  const t0 = Date.now();
  let limits = { ok: true, ...(await peek(env.DB, { ipHash, now, perIp: c.perIp, daily: c.daily })) };
  if (!admin) {
    limits = await spend(env.DB, { ipHash, now, perIp: c.perIp, daily: c.daily });
    if (!limits.ok) {
      const r = await retrieve(env, q, { vector: false });
      return {
        status: 200,
        body: { question: q, lang, mode: 'search_only', reason: limits.reason, answer: null, refused: false, sources: withNumbers(r.hits).map((h) => ({ ...h, n: null })), cited: [], limits: { ipLeft: limits.ipLeft, dayLeft: limits.dayLeft }, ms: Date.now() - t0 },
      };
    }
  }

  // 3. Retrieval.
  let r;
  try {
    r = await retrieve(env, q);
  } catch {
    const t = await retrieve(env, q, { vector: false });
    return { status: 200, body: { question: q, lang, mode: 'search_only', reason: 'error', answer: null, refused: false, sources: t.hits.map((h) => ({ ...h, n: null })), cited: [], limits: { ipLeft: limits.ipLeft, dayLeft: limits.dayLeft }, ms: Date.now() - t0 } };
  }
  const sources = withNumbers(r.hits);
  const base = { question: q, lang, mode: 'ai', model: c.chatModel, best_vector: r.bestVector, min_vector: c.minVector, sources, limits: { ipLeft: limits.ipLeft, dayLeft: limits.dayLeft } };

  // 4. Does the base know? Weak evidence = refuse without calling the model.
  let body;
  if (!hasAnswer(r.bestVector, c.minVector)) {
    body = { ...base, answer: REFUSAL[lang], refused: true, reason: 'weak_retrieval', cited: [], ms: Date.now() - t0 };
  } else {
    // 5. Generate from the top passages only.
    const ctx = r.hits.slice(0, CONTEXT_SIZE);
    let text;
    try {
      text = replyText(await env.AI.run(c.chatModel, { messages: buildMessages(q, ctx, lang), max_tokens: 400, temperature: 0.1 }));
    } catch {
      return { status: 200, body: { ...base, mode: 'search_only', reason: 'error', answer: null, refused: false, sources: sources.map((s) => ({ ...s, n: null })), cited: [], ms: Date.now() - t0 } };
    }
    if (isRefusalText(text)) {
      body = { ...base, answer: REFUSAL[lang], refused: true, reason: 'model', cited: [], ms: Date.now() - t0 };
    } else {
      const { text: clean, cited } = cleanCitations(text, ctx.length);
      body = { ...base, answer: clean, refused: false, reason: null, cited, uncited: cited.length === 0, ms: Date.now() - t0 };
    }
  }

  if (cacheKey) {
    await env.DB.prepare('INSERT OR REPLACE INTO answer_cache (key, payload, created_at) VALUES (?, ?, ?)').bind(cacheKey, JSON.stringify(body), new Date(now).toISOString()).run();
  }
  return { status: 200, body };
}
