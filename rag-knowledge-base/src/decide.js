// When the base does not know. Retrieval always returns *something*, so "no answer" has to be decided from the
// evidence: the cosine score of the closest chunk. Below the threshold the model is never called.
export function hasAnswer(bestVector, min) {
  return typeof bestVector === 'number' && bestVector >= Number(min);
}

export const REFUSAL = {
  ru: 'В базе нет ответа на этот вопрос.',
  en: 'The knowledge base has no answer to this question.',
};

export function langOf(text) {
  return /[А-Яа-яЁё]/.test(text) ? 'ru' : 'en';
}

/** True when the model itself said "no answer" (it was told to use these exact phrases). */
export function isRefusalText(text) {
  const t = String(text || '').toLowerCase();
  return t.includes('в базе нет ответа') || t.includes('knowledge base has no answer');
}
