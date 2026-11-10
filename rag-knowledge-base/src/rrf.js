// Reciprocal rank fusion: each ranked list gives 1 / (k + rank) to every id in it, the sums decide the order.
// It needs no score calibration between the lists (cosine similarity and BM25 are not comparable).

export const RRF_K = 60;

/**
 * @param {Record<string, Array<{id: string, score?: number}>>} lists named ranked lists, best first
 * @returns {Array<{id: string, rrf: number, ranks: Record<string, number>, scores: Record<string, number|undefined>, foundBy: string[]}>}
 */
export function rrfMerge(lists, k = RRF_K) {
  const acc = new Map();
  for (const [name, list] of Object.entries(lists)) {
    list.forEach((item, i) => {
      const rank = i + 1;
      const e = acc.get(item.id) || { id: item.id, rrf: 0, ranks: {}, scores: {}, foundBy: [] };
      e.rrf += 1 / (k + rank);
      e.ranks[name] = rank;
      e.scores[name] = item.score;
      e.foundBy.push(name);
      acc.set(item.id, e);
    });
  }
  return [...acc.values()].sort((a, b) => b.rrf - a.rrf || a.id.localeCompare(b.id));
}
