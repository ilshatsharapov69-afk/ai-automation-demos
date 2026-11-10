// Full-text side of the hybrid search: SQLite FTS5 (D1) with BM25 ranking.
// FTS5 has no Russian stemmer, so the query is built by hand: stop words dropped, every word cut to a stem
// and matched as a prefix ("доставки" -> достав*), terms joined with OR so one matching word is enough to be a candidate.

const STOP = new Set((
  'и в во не что это он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему ' +
  'теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут ' +
  'где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой ' +
  'совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после ' +
  'над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя ' +
  'такой им более всегда конечно всю между какие каким какое сколько можно ли ' +
  'the a an and or of to in on for is are was were be been do does did can could i you we it my our your their this that these those ' +
  'with from at by as if how what when where who which why about much many any there have has had'
).split(/\s+/));

export function tokens(text) {
  return (String(text).toLowerCase().replace(/ё/g, 'е').match(/[\p{L}\p{N}]+/gu) || []);
}

export function stem(word) {
  if (/^\d+$/.test(word)) return word;
  if (word.length <= 4) return word;
  return word.slice(0, Math.min(6, word.length - 1));
}

/** FTS5 MATCH expression for a question, or '' when nothing useful is left. */
export function buildFtsQuery(question) {
  const seen = new Set();
  const terms = [];
  for (const w of tokens(question)) {
    if (STOP.has(w) || (w.length < 3 && !/^\d+$/.test(w))) continue;
    const s = stem(w);
    if (seen.has(s)) continue;
    seen.add(s);
    terms.push(s.length < w.length || w.length > 4 ? `${s}*` : `"${s}"`);
  }
  return terms.join(' OR ');
}

/** BM25-ranked chunk ids. Title and heading matches weigh more than body matches. */
export async function searchFts(db, question, limit = 8) {
  const q = buildFtsQuery(question);
  if (!q) return [];
  const { results } = await db
    .prepare('SELECT chunk_id AS id, bm25(chunks_fts, 0, 3.0, 2.0, 1.0) AS bm FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY bm LIMIT ?')
    .bind(q, limit)
    .all();
  // bm25() is negative in SQLite, smaller = better; expose a positive score.
  return results.map((r) => ({ id: r.id, score: -r.bm }));
}
