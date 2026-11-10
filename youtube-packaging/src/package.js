// Builds the "packaging" for one video: 5 titles (with a reason each), a description with computed chapters,
// tags, a pinned-comment draft and 3 thumbnail texts.
// 1) Workers AI writes the words (free allowance on the owner's Cloudflare account, no paid key).
// 2) A deterministic offline stub writes them when the AI is off, fails, or returns something unusable
//    (per field: a bad AI field is replaced by the stub field, the rest of the AI answer is kept).
// Chapter times are ALWAYS computed from the timestamps in the text (lib/chapters.js); the AI only names them.

import { parseSegments, buildChapters, chaptersBlock } from '../public/lib/chapters.js';
import { detectLang, keywords, sentences, plural, cap, clip, stopwords, words } from '../public/lib/text.js';

export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const MAX_INPUT = 60000; // characters accepted from the browser
export const LIMITS = { title: 100, titleSoft: 70, description: 5000, tagsTotal: 500, thumbWords: 4, pinned: 600 };

/** Everything that does not need words from a model: language, keyword, chapters, duration. */
export function analyze({ text, keyword, lang }) {
  const parsed = parseSegments(text);
  const outLang = lang === 'ru' || lang === 'en' ? lang : detectLang(parsed.body || text);
  const ch = buildChapters(parsed, outLang);
  const kw = keywords(parsed.body, outLang);
  const main = String(keyword || '').trim().replace(/\s+/g, ' ').slice(0, 60) || kw.pairs[0] || kw.single[0] || (outLang === 'ru' ? 'это видео' : 'this video');
  return { lang: outLang, keyword: main.toLowerCase(), keywordGiven: !!String(keyword || '').trim(), parsed, ...ch, kw };
}

const GREETING = /^(hi|hello|hey|welcome|what'?s up|subscribe|привет|всем привет|здравствуйте|добро пожаловать|с вами на канале|подпиш)/i;

/** Key term of the keyword: words up to the first stopword, max 2: "cold brew at home" -> "cold brew". */
export function headTerm(keyword, lang) {
  const stop = stopwords(lang);
  const ws = keyword.split(' ');
  const out = [];
  for (const w of ws) { if (stop.has(words(w)[0] || w)) { if (out.length) break; continue; } out.push(w); }
  return (out.length ? out : ws).slice(0, 2).join(' ');
}

/** Number of real content parts (chapters minus intro/outro), at least 3. */
function partsCount(a) {
  if (!a.valid) return 5;
  const skip = /^(intro|outro|вступление|итоги?|заключение|финал|conclusion|wrap[- ]?up|summary)$/i;
  return Math.max(3, a.chapters.filter((c) => !skip.test(c.title.trim())).length);
}

export function stubWords(a) {
  const { lang, keyword } = a;
  const K = keyword;
  const Kc = cap(K);
  const n = partsCount(a);
  const mins = Math.max(1, Math.round((a.duration || 600) / 60));
  const head = headTerm(K, lang).toUpperCase();
  const inner = a.valid ? a.chapters.slice(1).map((c) => c.title).filter((t) => !/^(outro|итоги?|заключение)$/i.test(t)) : [];

  let titles;
  let thumbs;
  if (lang === 'ru') {
    titles = [
      { title: `${Kc}: ${n} ${plural(n, 'вещь', 'вещи', 'вещей')}, о которых молчат`, reason: `Число задаёт понятное обещание и совпадает с ${n} частями видео, зритель получит то, что обещано.` },
      { title: `${Kc}: главная ошибка новичков`, reason: 'Разрыв любопытства: называет проблему, но не раскрывает ответ в заголовке.' },
      { title: `${Kc} для новичков: с чего начать`, reason: 'Под поиск: ключевая фраза стоит первой, аудитория названа прямо.' },
      { title: `${Kc}: честный тест и выводы`, reason: 'Формат личной проверки вызывает доверие и подходит даже для канала без лица.' },
      { title: `${Kc} за ${mins} ${plural(mins, 'минуту', 'минуты', 'минут')}: всё по шагам`, reason: 'Сразу показывает, сколько времени займёт просмотр, легче решиться на клик.' },
    ];
    thumbs = [
      { text: 'НЕ ДЕЛАЙТЕ ТАК!', reason: 'Предупреждение — сильный триггер внимания.' },
      { text: `${head} БЕЗ ОШИБОК`, reason: 'Обещание результата в 2–3 словах.' },
      { text: `${n} ${plural(n, 'ШАГ', 'ШАГА', 'ШАГОВ')} К РЕЗУЛЬТАТУ`, reason: 'Число читается за долю секунды и дополняет заголовок.' },
    ];
  } else {
    titles = [
      { title: `${Kc}: ${n} things nobody tells you`, reason: `A number sets a clear promise and matches the ${n} parts of the video, so the video pays it off.` },
      { title: `Most people get ${K} wrong`, reason: 'Curiosity gap: names a problem the viewer may have without giving the answer away.' },
      { title: `${Kc} for beginners: start here`, reason: 'Search-friendly: the main keyword comes first and the audience is named.' },
      { title: `I tested ${K} so you don't have to`, reason: 'A personal test builds trust and works for a faceless voice-over channel too.' },
      { title: `${Kc}, explained in ${mins} minutes`, reason: 'States the time cost up front, which makes the click an easy decision.' },
    ];
    thumbs = [
      { text: 'STOP DOING THIS', reason: 'A warning is one of the strongest attention triggers.' },
      { text: `${head} DONE RIGHT`, reason: 'Promises the outcome in two or three words.' },
      { text: `${n} STEPS THAT WORK`, reason: 'A number reads in a split second and adds to the title instead of repeating it.' },
    ];
  }
  titles = titles.map((x) => ({ ...x, title: clip(x.title, LIMITS.title) }));

  // Hook: the first two real sentences (greetings and "subscribe" lines skipped).
  const real = sentences(a.parsed.body).filter((s) => !GREETING.test(s) && s.split(' ').length >= 6);
  let hook = clip(real.slice(0, 2).join(' '), 260);
  if (!hook) hook = lang === 'ru' ? `Всё про ${K}: коротко и по делу.` : `Everything about ${K}, short and to the point.`;
  if (inner.length >= 2) {
    const list = inner.slice(0, 4).map((t) => t.charAt(0).toLowerCase() + t.slice(1)).join(', ');
    hook += lang === 'ru' ? `\n\nВ видео: ${list}.` : `\n\nIn this video: ${list}.`;
  }

  // Tags: keyword, keyword variants, then the most repeated phrases and words of the transcript.
  const variants = lang === 'ru' ? [`${K} для начинающих`, `${K} советы`, `${K} пошагово`] : [`${K} for beginners`, `${K} tips`, `how to ${K}`];
  // Single words only when no phrase already contains them (a "cold" tag next to "cold brew" adds nothing).
  // Transcript phrases that are just a piece of the keyword ("brew at home") are skipped; single words only
  // when repeated 3+ times and not already inside a phrase (a "cold" tag next to "cold brew" adds nothing).
  const pairs = a.kw.pairs.filter((p) => !K.includes(p)).slice(0, 6);
  const phrases = [K, headTerm(K, lang), ...variants, ...pairs];
  // One form per word stem ("листья" / "листьями", "mistake" / "mistakes"): the shortest form wins.
  const stem = (w) => (w.length >= 6 ? w.slice(0, 5) : w);
  const taken = new Set(phrases.flatMap((p) => p.split(' ').map(stem)));
  const byStem = new Map(); // stem -> {w, n}: shortest form, uses of all forms together
  for (const w of a.kw.single) {
    const s = stem(w);
    if (taken.has(s)) continue;
    const prev = byStem.get(s);
    const n = (prev?.n || 0) + a.kw.count[w];
    byStem.set(s, { w: !prev || w.length < prev.w.length ? w : prev.w, n });
  }
  const uses = Object.fromEntries([...byStem.values()].map((x) => [x.w, x.n]));
  const free = [...byStem.values()].map((x) => x.w);
  let singles = free.filter((w) => uses[w] >= 3).slice(0, 4);
  // Short texts repeat little: top up with the next most used words so there are always enough tags.
  if (phrases.length + singles.length < 8) singles = [...singles, ...free.filter((w) => !singles.includes(w))].slice(0, 8 - phrases.length);
  const tags = fitTags([...phrases, ...singles]);

  let pinned;
  if (inner.length >= 2) {
    pinned = lang === 'ru'
      ? `Вопрос к вам: что было полезнее: «${inner[0]}» или «${inner[1]}»? Напишите в комментариях, я читаю каждый. Таймкоды — в описании, если захотите вернуться к нужной части.`
      : `Quick question: which part was more useful, "${inner[0]}" or "${inner[1]}"? Tell me in the comments, I read every one. Chapters are in the description if you want to jump back.`;
  } else {
    pinned = lang === 'ru'
      ? `О чём снять следующее видео про ${K}? Напишите в комментариях, самый частый вопрос разберу отдельно.`
      : `What should the next video about ${K} cover? Leave it in the comments and I'll answer the most asked question in a separate video.`;
  }

  return { titles, hook, tags, pinned, thumbs, chapterTitles: a.chapters.map((c) => c.title) };
}

/** YouTube counts the tag box roughly as: characters + 2 quotes for tags with spaces + commas. Max 500. */
export function tagsLength(tags) {
  return tags.reduce((n, t) => n + t.length + (t.includes(' ') ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

export function fitTags(list, max = 15) {
  const out = [];
  for (const raw of list) {
    const t = String(raw || '').toLowerCase().replace(/[#,<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (t.length < 2 || out.includes(t)) continue;
    if (tagsLength([...out, t]) > LIMITS.tagsTotal) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

const hashtag = (t) => '#' + t.split(/[\s-]+/).map((w, i) => (i ? cap(w) : w)).join('').replace(/[^\p{L}\p{N}_]/gu, '');

export function composeDescription({ hook, chapters, valid, tags, lang }) {
  const parts = [hook.trim()];
  if (valid) parts.push((lang === 'ru' ? 'Таймкоды:\n' : 'Chapters:\n') + chaptersBlock(chapters));
  parts.push(lang === 'ru' ? 'Если было полезно, подпишитесь, чтобы не пропустить следующее видео.' : 'If this helped, subscribe so you don\'t miss the next one.');
  // YouTube shows the first 3 hashtags above the title: the keyword and its head term go first, then a
  // multi-word phrase (single generic words like #taste make weak hashtags).
  const wc = (t) => t.split(' ').length;
  const tagsForHash = tags.filter((t, i) => wc(t) <= 4 && !(i > 0 && t.startsWith(tags[0] + ' ')) && (i <= 1 || wc(t) >= 2)).slice(0, 3);
  if (tagsForHash.length) parts.push(tagsForHash.map(hashtag).join(' '));
  return parts.join('\n\n').slice(0, LIMITS.description);
}

// ---------- AI ----------

export function systemPrompt(lang) {
  const language = lang === 'ru' ? 'Russian' : 'English';
  return [
    'You are a YouTube packaging strategist. From a video transcript you write the title options, description hook,',
    'chapter names, tags, pinned comment and thumbnail text that make the right viewer click and stay.',
    `Write everything in ${language}. Be specific to THIS video: use its real topic, numbers and promises, never generic filler.`,
    'Never invent facts, results, prices or claims that are not in the transcript. No clickbait the video does not pay off.',
    'Reply with ONE JSON object and nothing else, exactly this shape:',
    '{"titles":[{"title":"...","reason":"..."}],"hook":"...","chapter_titles":["..."],"tags":["..."],"pinned_comment":"...","thumbnail_texts":[{"text":"...","reason":"..."}]}',
    'Rules: titles = exactly 5, each under 70 characters, each a different angle (number, curiosity, search keyword first, story/test, outcome);',
    'reason = one short sentence on why that title works. hook = the first 2 sentences of the description, under 250 characters, no hashtags.',
    'chapter_titles = exactly the number of chapters given, in order, each 2-5 words, no timestamps.',
    'tags = 10 to 15 search phrases a viewer would type, lowercase. pinned_comment = 1-3 sentences that start a discussion, ends with a question or a call to reply.',
    'thumbnail_texts = exactly 3, each 1-4 words, a short emotional trigger that ADDS to the title instead of repeating it; reason = one short sentence.',
  ].join(' ');
}

export function userPrompt(a) {
  const chapters = a.valid
    ? a.chapters.map((c, i) => `${i + 1}. [${c.label}] ${clip(c.text || c.title, 280)}`).join('\n')
    : '(no chapters: return "chapter_titles": [])';
  return [
    `Main keyword: ${a.keyword}`,
    `Video length: about ${Math.max(1, Math.round((a.duration || 0) / 60)) || '?'} minutes`,
    `Chapters (${a.valid ? a.chapters.length : 0}), with the start of what is said in each:`,
    chapters,
    '',
    'Transcript (may be cut):',
    clip(a.parsed.body, 6000),
  ].join('\n');
}

const CLEAN = (s) => String(s ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\*\*|__|`/g, '').replace(/^["'«\s]+|["'»\s]+$/g, '').replace(/\s+/g, ' ').trim();

/** Pulls the first JSON object out of a model reply (plain text, fenced, or already parsed). */
export function extractJson(out) {
  if (!out) return null;
  let r = out;
  if (typeof r === 'object' && 'response' in r) r = r.response;
  else if (typeof r === 'object' && r.choices?.[0]) r = r.choices[0].message?.content ?? r.choices[0].text;
  if (r && typeof r === 'object') return r;
  const s = String(r || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

/** Validates each AI field; returns the merged words and which fields came from the stub. */
export function mergeWords(ai, stub, a) {
  const fromStub = [];
  const pick = (name, value) => { if (value === null) { fromStub.push(name); return stub[name]; } return value; };
  const j = ai && typeof ai === 'object' ? ai : {};

  let titles = Array.isArray(j.titles) ? j.titles.map((x) => ({ title: clip(CLEAN(x?.title ?? x), LIMITS.title), reason: CLEAN(x?.reason) }))
    .filter((x) => x.title.length >= 8 && x.reason.length >= 5) : [];
  titles = titles.filter((x, i) => titles.findIndex((y) => y.title.toLowerCase() === x.title.toLowerCase()) === i);
  if (titles.length >= 3 && titles.length < 5) { titles = [...titles, ...stub.titles].slice(0, 5); fromStub.push('titles (partly)'); }
  titles = pick('titles', titles.length >= 5 ? titles.slice(0, 5) : null);

  const hookRaw = CLEAN(j.hook);
  const hook = pick('hook', hookRaw.length >= 20 ? clip(hookRaw, 300) : null);

  const n = a.valid ? a.chapters.length : 0;
  const ct = Array.isArray(j.chapter_titles) ? j.chapter_titles.map((t) => clip(CLEAN(t).replace(/^\(?\d{1,2}:\d{2}(:\d{2})?\)?\s*[-–—:]?\s*/, ''), 60)) : [];
  const chapterTitles = pick('chapterTitles', n === 0 ? [] : ct.length === n && ct.every((t) => t.length >= 2) ? ct : null);

  const rawTags = Array.isArray(j.tags) ? j.tags : typeof j.tags === 'string' ? j.tags.split(',') : [];
  const tg = fitTags(rawTags.map(CLEAN));
  const tags = pick('tags', tg.length >= 5 ? tg : null);

  const pc = CLEAN(j.pinned_comment);
  const pinned = pick('pinned', pc.length >= 15 ? clip(pc, LIMITS.pinned) : null);

  let th = Array.isArray(j.thumbnail_texts) ? j.thumbnail_texts.map((x) => ({ text: CLEAN(x?.text ?? x).replace(/[.]+$/, ''), reason: CLEAN(x?.reason) })) : [];
  th = th.filter((x) => x.text && x.text.split(' ').length <= LIMITS.thumbWords && x.text.length <= 32)
    .map((x) => ({ text: x.text.toUpperCase(), reason: x.reason || '' }));
  const thumbs = pick('thumbs', th.length >= 3 ? th.slice(0, 3) : null);

  return { titles, hook, chapterTitles, tags, pinned, thumbs, fromStub };
}

/** One model call in JSON mode; if JSON mode itself is refused, one plain retry (the prompt also asks for JSON). */
async function runModel(ai, model, a) {
  const req = {
    messages: [
      { role: 'system', content: systemPrompt(a.lang) },
      { role: 'user', content: userPrompt(a) },
    ],
    max_tokens: 1200,
    temperature: 0.5,
  };
  try {
    return await ai.run(model, { ...req, response_format: { type: 'json_object' } });
  } catch (e) {
    console.error('ai json mode failed, plain retry', String(e));
    return await ai.run(model, req);
  }
}

/**
 * @param {{text: string, keyword?: string, lang?: 'auto'|'en'|'ru'}} input
 * @param {{ai?: {run: Function}, model?: string, aiEnabled?: boolean}} opts
 */
export async function buildPackage(input, { ai, model, aiEnabled = true } = {}) {
  const a = analyze(input);
  const stub = stubWords(a);
  let w = { ...stub, fromStub: [] };
  let source = 'stub';
  let note = ai && aiEnabled ? null : 'ai_off';

  if (ai && aiEnabled) {
    try {
      const out = await runModel(ai, model || DEFAULT_MODEL, a);
      const j = extractJson(out);
      if (!j) { note = 'ai_unreadable'; console.error('ai unreadable', JSON.stringify(out).slice(0, 300)); }
      else {
        w = mergeWords(j, stub, a);
        const fields = ['titles', 'hook', 'tags', 'pinned', 'thumbs', ...(a.valid ? ['chapterTitles'] : [])];
        const all = fields.every((f) => w.fromStub.includes(f));
        source = all ? 'stub' : 'ai';
        if (all) note = 'ai_unreadable';
      }
    } catch (e) {
      note = 'ai_error';
      console.error('ai error', String(e));
    }
  }

  const chapters = a.chapters.map((c, i) => ({ t: c.t, label: c.label, title: (a.valid && w.chapterTitles[i]) || c.title }));
  const description = composeDescription({ hook: w.hook, chapters, valid: a.valid, tags: w.tags, lang: a.lang });

  return {
    lang: a.lang,
    keyword: a.keyword,
    source,
    note,
    fromStub: source === 'ai' ? w.fromStub : [],
    duration: a.duration,
    chapters,
    chaptersValid: a.valid,
    chapterChecks: a.checks,
    chapterIssue: a.issue,
    titles: w.titles,
    description,
    tags: w.tags,
    tagsLength: tagsLength(w.tags),
    pinned: w.pinned,
    thumbs: w.thumbs,
  };
}
