// AI drafts: Workers AI (free daily allowance on the owner's Cloudflare account, no paid key) with a rule-based
// offline template as fallback. The fallback is used when there is no AI binding (tests, local runs), AI_MODE="off",
// the daily limit is reached, or the model call fails, so "✨ AI draft" never leaves the owner without a draft.

export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const MAX_LEN = 900; // fits a photo caption (1024) with room for the preview footer

function systemPrompt(lang, title) {
  return lang === 'ru'
    ? `Ты пишешь посты для Telegram-канала «${title}». Пиши по-русски, живо и по делу, на «вы». ` +
      'Структура: цепляющая первая строка с одним эмодзи, 2–4 коротких абзаца или список из 3–4 пунктов, в конце вопрос к читателям или призыв, 2–3 хэштега. ' +
      'До 700 символов. Без Markdown-разметки (никаких ** и #заголовков), без выдуманных цифр, цен, адресов и ссылок. Верни только текст поста.'
    : `You write posts for the Telegram channel "${title}". Write in English, lively and to the point. ` +
      'Structure: a hook first line with one emoji, 2-4 short paragraphs or a list of 3-4 points, end with a question to readers or a call to action, 2-3 hashtags. ' +
      'Up to 700 characters. No Markdown (no ** or # headings), no invented numbers, prices, addresses or links. Return only the post text.';
}

/** Model output -> plain text post: strip Markdown, wrapping quotes, preambles; cap the length at a sentence end. */
export function cleanDraft(raw) {
  let s = String(raw || '').replace(/\r/g, '').trim();
  s = s.replace(/^(here(?:'s| is) (?:a|the|your) (?:draft|post)[^\n]*:|вот (?:черновик|пост)[^\n]*:)\s*/i, '');
  s = s.replace(/^["«“](.*)["»”]$/s, '$1');
  s = s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/^[ \t]*[*-][ \t]+/gm, '• ').replace(/[ \t]+$/gm, '');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > MAX_LEN) {
    const cut = s.slice(0, MAX_LEN);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
    s = (end > MAX_LEN * 0.5 ? cut.slice(0, end + 1) : cut.slice(0, MAX_LEN - 1) + '…').trim();
  }
  return s;
}

// ---------- offline template ----------

const STOP = new Set(('the a an and or of to for in on at by with how why what when your you my our is are be can do does about from into ' +
  'this that these those great good best better perfect simple easy quick really very more most some every ' +
  'этот эта это эти лучший лучшие хороший простой простые быстрый самый самые очень ' +
  'как что почему зачем для это или и в во на по с со к ко о об от до из у за про при без над под мой ваш наш свой какой какие чем где когда ли же бы не').split(' '));

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function hashtags(topic, n = 3) {
  const words = String(topic).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const out = [];
  for (const w of words) if (w.length >= 4 && !STOP.has(w) && !out.includes(w)) out.push(w);
  return out.slice(0, n).map((w) => '#' + w);
}

function kindOf(topic) {
  const s = String(topic).toLowerCase();
  if (/(скидк|акци|распродаж|запуск|анонс|новинк|открыт|sale|discount|launch|announce|new |opening|promo)/.test(s)) return 'news';
  if (/(ошибк|мифы|миф |mistake|myth|wrong|avoid)/.test(s)) return 'mistakes';
  if (/\?|^(как|почему|зачем|что|how|why|what)\b/.test(s)) return 'explain';
  return 'tips';
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const TPL = {
  en: {
    tips: [
      (T) => `💡 ${T}: three things that actually help`,
      (T) => `☝️ Short guide: ${T.toLowerCase()}`,
      (T) => `📌 Save this: ${T.toLowerCase()}`,
    ],
    explain: [(T) => `🤔 ${T}`, (T) => `🧐 Let's sort it out: ${T.toLowerCase()}`, (T) => `💬 You asked: ${T.toLowerCase()}`],
    mistakes: [(T) => `🚫 ${T}`, (T) => `⚠️ ${T}: where most people slip`, (T) => `🙅 ${T}: let's clear it up`],
    news: [(T) => `🔥 ${T}`, (T) => `📣 News: ${T.toLowerCase()}`, (T) => `✨ ${T}: here is what changes`],
    body: {
      tips: ['1. Start with the basics: one simple step done every time beats ten tricks done once.', '2. Change one thing at a time, so you can see what made the difference.', '3. Write down what worked: next time it takes half the effort.'],
      explain: ['Short answer: it depends on a few simple things, and most of them you already control.', 'Start from what you want to get, then check the one detail that changes the result the most.', 'If you are not sure, try it two ways side by side: the difference shows at once.'],
      mistakes: ['• Rushing the first step: it sets up everything that follows.', '• Changing everything at once: then nothing is clear.', '• Following advice blindly: check what works for you.'],
      news: ['We have prepared something new, and we want you to hear it first.', 'All the details are in the next posts: turn on notifications so you do not miss them.'],
    },
    cta: ['What would you add? Tell us in the comments 👇', 'Which point was new for you? 👇', 'Send this to a friend who needs it 🙌'],
  },
  ru: {
    tips: [(T) => `💡 ${T}: три вещи, которые реально помогают`, (T) => `☝️ Коротко: ${T.toLowerCase()}`, (T) => `📌 Сохраните: ${T.toLowerCase()}`],
    explain: [(T) => `🤔 ${T}`, (T) => `🧐 Разбираемся: ${T.toLowerCase()}`, (T) => `💬 Вы спрашивали: ${T.toLowerCase()}`],
    mistakes: [(T) => `🚫 ${T}`, (T) => `⚠️ ${T}: где чаще всего ошибаются`, (T) => `🙅 ${T}: разложим по полочкам`],
    news: [(T) => `🔥 ${T}`, (T) => `📣 Новость: ${T.toLowerCase()}`, (T) => `✨ ${T}: что меняется`],
    body: {
      tips: ['1. Начните с основы: один простой шаг каждый раз лучше десяти приёмов один раз.', '2. Меняйте что-то одно — так видно, что сработало.', '3. Записывайте удачные варианты: в следующий раз уйдёт вдвое меньше сил.'],
      explain: ['Короткий ответ: всё зависит от нескольких простых вещей, и большинство из них уже в ваших руках.', 'Начните с того, какой результат нужен, и проверьте одну деталь, которая влияет сильнее всего.', 'Сомневаетесь — попробуйте два варианта рядом: разница видна сразу.'],
      mistakes: ['• Спешить на первом шаге: от него зависит всё остальное.', '• Менять всё сразу: потом непонятно, что помогло.', '• Слепо следовать советам: проверяйте, что работает у вас.'],
      news: ['Мы подготовили кое-что новое и хотим, чтобы вы узнали первыми.', 'Подробности — в следующих постах, включите уведомления, чтобы не пропустить.'],
    },
    cta: ['А что бы вы добавили? Пишите в комментариях 👇', 'Какой пункт оказался новым для вас? 👇', 'Перешлите тому, кому это пригодится 🙌'],
  },
};

/** Deterministic rule-based draft; `variant` rotates the hook and the closing line. */
export function templateDraft(topic, lang = 'en', variant = 0) {
  const L = TPL[lang === 'ru' ? 'ru' : 'en'];
  const T = cap(String(topic).trim().replace(/[.!?]+$/, ''));
  const kind = kindOf(topic);
  const h = hash(topic) + variant;
  const hook = L[kind][h % L[kind].length](T);
  const body = L.body[kind].join('\n');
  const cta = L.cta[(h >> 3) % L.cta.length];
  const tags = hashtags(topic).join(' ');
  return [hook, body, cta, tags].filter(Boolean).join('\n\n');
}

// ---------- entry ----------

/**
 * @returns {Promise<{text: string, engine: 'ai'|'stub', reason?: string}>}
 * `budget` = { ok: boolean } from the caller's daily counter (the caller counts only engine === 'ai').
 */
export async function generateDraft(env, { topic, lang = 'en', title = '', variant = 0, budgetOk = true }) {
  const stub = (reason) => ({ text: cleanDraft(templateDraft(topic, lang, variant)), engine: 'stub', reason });
  if (!env.AI || String(env.AI_MODE || 'on').toLowerCase() === 'off') return stub('no-ai');
  if (!budgetOk) return stub('limit');
  try {
    const user = (lang === 'ru' ? 'Тема поста: ' : 'Post topic: ') + topic + (variant ? (lang === 'ru' ? `\nВариант №${variant + 1}: начни иначе, чем обычно.` : `\nVersion ${variant + 1}: open differently than usual.`) : '');
    const r = await env.AI.run(MODEL, {
      messages: [{ role: 'system', content: systemPrompt(lang, title) }, { role: 'user', content: user }],
      max_tokens: 450,
      temperature: variant ? 0.9 : 0.7,
    });
    const text = cleanDraft(typeof r === 'string' ? r : r?.response);
    if (text.length < 40) return stub('empty');
    return { text, engine: 'ai' };
  } catch (e) {
    console.error('workers ai failed', e && e.message);
    return stub('error');
  }
}
