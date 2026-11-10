// Answers a free-text question from the business FAQ.
// 1) Workers AI (free tier on the owner's Cloudflare account) phrases an answer using ONLY the FAQ facts.
// 2) If the AI is missing, fails, or the chat hit its daily AI cap, a keyword match over the FAQ answers.
// 3) If neither finds an answer, the caller offers to hand the question to the owner.
import data from '../data/faq.json';

const NO = 'NO_ANSWER';
export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** Keyword retrieval: best FAQ entry for the text, or null. */
export function retrieve(text) {
  const t = ' ' + text.toLowerCase().replace(/ё/g, 'е') + ' ';
  let best = null;
  let bestScore = 0;
  for (const e of data.faq) {
    let s = 0;
    for (const k of e.kw) if (t.includes(k)) s += k.length >= 5 ? 2 : 1;
    if (s > bestScore) { best = e; bestScore = s; }
  }
  // Service names alone ("manicure?") count as a price question.
  if (!best) {
    for (const sv of data.services) {
      if (t.includes(sv.en.toLowerCase().slice(0, 5)) || t.includes(sv.ru.toLowerCase().slice(0, 5))) {
        return data.faq.find((e) => e.id === 'prices');
      }
    }
  }
  return best;
}

function factsBlock(lang) {
  const svc = data.services.map((s) => `- ${s[lang]}: ${lang === 'ru' ? s.price_ru : s.price_en}, ${s.min} min`).join('\n');
  const faq = data.faq.map((e) => `- ${e[lang]}`).join('\n');
  return `Services and prices:\n${svc}\n\nFacts:\n${faq}`;
}

export function systemPrompt(lang) {
  const language = lang === 'ru' ? 'Russian' : 'English';
  return (
    `You are the chat assistant of ${data.business.name}, a beauty studio (a fictional business used as a demo). ` +
    `Answer the client's message using ONLY the facts below. Reply in ${language}, in 1 to 3 short sentences, friendly and plain: ` +
    'no markdown, no lists, no emojis. Never invent prices, times, addresses, names, discounts or promises that are not in the facts. ' +
    'If the client wants to book, answer briefly and tell them to tap the "Book a visit" button. ' +
    'If the message is a greeting or thanks, reply briefly and offer help. ' +
    `If the facts do not contain the answer, reply with exactly ${NO} and nothing else.\n\n` +
    factsBlock(lang)
  );
}

function cleanModelText(out) {
  let s = '';
  if (typeof out === 'string') s = out;
  else if (out && typeof out.response === 'string') s = out.response;
  else if (out && out.choices && out.choices[0]) s = out.choices[0].message?.content || out.choices[0].text || '';
  return s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\*\*/g, '').trim();
}

/**
 * @returns {{text: string|null, source: 'ai'|'faq'|'none', error?: string}}
 *   text null = no answer, hand to the owner.
 */
export async function answer(question, lang, { ai, model, allowAi }) {
  if (ai && allowAi) {
    try {
      const out = await ai.run(model || DEFAULT_MODEL, {
        messages: [
          { role: 'system', content: systemPrompt(lang) },
          { role: 'user', content: question.slice(0, 600) },
        ],
        max_tokens: 220,
        temperature: 0.2,
      });
      const text = cleanModelText(out);
      if (text && !text.includes(NO)) return { text: text.slice(0, 900), source: 'ai' };
      if (text.includes(NO)) return { text: null, source: 'none' };
      console.error('ai empty output', JSON.stringify(out).slice(0, 300));
    } catch (e) {
      // fall through to keyword retrieval
      const hit = retrieve(question);
      return hit ? { text: hit[lang], source: 'faq', error: String(e) } : { text: null, source: 'none', error: String(e) };
    }
  }
  const hit = retrieve(question);
  return hit ? { text: hit[lang], source: 'faq' } : { text: null, source: 'none' };
}
