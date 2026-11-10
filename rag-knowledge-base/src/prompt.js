// The prompt: the retrieved passages are numbered and the model may use nothing else.
import { REFUSAL } from './decide.js';

export function buildMessages(question, chunks, lang) {
  const refusal = REFUSAL[lang];
  const context = chunks.map((c, i) => `[${i + 1}] ${c.title} / ${c.heading}\n${c.text}`).join('\n\n');
  const system = [
    'You answer questions about the company "Harborline" (a fictional furniture store) using ONLY the numbered passages below.',
    'Rules:',
    '1. Use only facts that are written in the passages. Never add facts from your own knowledge. Never guess numbers.',
    '2. After every sentence that states a fact, put the number of the passage it came from, like [1] or [2]. Use only the numbers shown below.',
    `3. If the passages do not contain the answer, reply with exactly this sentence and nothing else: ${refusal}`,
    `4. Answer in ${lang === 'ru' ? 'Russian' : 'English'}, briefly (at most 4 sentences).`,
    '5. State the answer directly. Do not describe or comment on the passages themselves, and do not repeat yourself.',
    '',
    'Passages:',
    context,
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: question },
  ];
}

/** Keep only citations that point at a real passage; turn "[1, 2]" into "[1][2]". Returns the cleaned text and the cited numbers. */
export function cleanCitations(text, count) {
  const cited = new Set();
  const out = String(text || '')
    .replace(/\[(\d+(?:\s*[,;]\s*\d+)+)\]/g, (_, list) => list.split(/[,;]/).map((n) => `[${n.trim()}]`).join(''))
    .replace(/\[(\d+)\]/g, (m, n) => {
      const k = Number(n);
      if (k >= 1 && k <= count) { cited.add(k); return m; }
      return '';
    })
    .replace(/\]\s+\[/g, '][')
    .replace(/[ \t]+([.,;])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return { text: out, cited: [...cited].sort((a, b) => a - b) };
}
