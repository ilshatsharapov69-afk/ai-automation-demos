import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPackage, analyze, extractJson, tagsLength, LIMITS, DEFAULT_MODEL } from '../src/package.js';

const sample = (f) => readFileSync(new URL(`../public/samples/${f}`, import.meta.url), 'utf8');
const EN = { text: sample('cold-brew-en.txt'), keyword: 'cold brew at home' };
const RU = { text: sample('basil-ru.srt'), keyword: 'базилик на подоконнике' };

/** Fake Workers AI binding: records calls, answers with `reply` (a value, or a function of the call number). */
function fakeAi(reply) {
  const calls = [];
  return {
    calls,
    async run(model, input) {
      calls.push({ model, input });
      const r = typeof reply === 'function' ? reply(calls.length, input) : reply;
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

function checkShape(p) {
  assert.equal(p.titles.length, 5);
  for (const t of p.titles) {
    assert.ok(t.title.length >= 8 && t.title.length <= LIMITS.title, t.title);
    assert.ok(t.reason.length >= 5, 'every title has a reason');
  }
  assert.equal(p.thumbs.length, 3);
  for (const th of p.thumbs) assert.ok(th.text.split(' ').length <= LIMITS.thumbWords, th.text);
  assert.ok(p.tags.length >= 5 && p.tagsLength <= LIMITS.tagsTotal);
  assert.equal(p.tagsLength, tagsLength(p.tags));
  assert.ok(p.description.length <= LIMITS.description);
  assert.ok(p.pinned.length >= 15);
}

test('offline stub (no AI binding): complete, deterministic EN packaging', async () => {
  const a = await buildPackage(EN);
  const b = await buildPackage(EN);
  assert.deepEqual(a, b, 'same input, same output');
  checkShape(a);
  assert.equal(a.source, 'stub');
  assert.equal(a.note, 'ai_off');
  assert.equal(a.lang, 'en');
  assert.match(a.titles[0].title, /^Cold brew at home: 6 things nobody tells you$/);
  assert.ok(a.description.includes('Chapters:\n0:00 Intro\n0:42 Picking the beans\n2:05 Grind size'));
  assert.ok(a.description.startsWith("Today we're making cold brew at home"), 'greeting sentence skipped in the hook');
  assert.ok(a.tags.includes('cold brew at home') && a.tags.includes('cold brew'));
  assert.ok(/#coldBrewAtHome #coldBrew/.test(a.description));
  assert.deepEqual(a.thumbs.map((t) => t.text), ['STOP DOING THIS', 'COLD BREW DONE RIGHT', '6 STEPS THAT WORK']);
  assert.match(a.pinned, /"Picking the beans" or "Grind size"/);
});

test('offline stub: Russian from .srt, language auto-detected, Russian plurals', async () => {
  const p = await buildPackage(RU);
  checkShape(p);
  assert.equal(p.lang, 'ru');
  assert.ok(p.description.includes('Таймкоды:\n0:00 Вступление'));
  assert.ok(/вещи|вещей|вещь/.test(p.titles[0].title));
  assert.match(p.titles[4].title, /за 11 минут/);
  assert.ok(p.thumbs.every((t) => t.text === t.text.toUpperCase()));
  assert.ok(p.chaptersValid && Object.values(p.chapterChecks).every(Boolean));
});

test('keyword is optional: picked from the most repeated phrase', async () => {
  const p = await buildPackage({ text: RU.text });
  assert.equal(p.keyword, 'базилик на подоконнике');
  const e = analyze({ text: EN.text });
  assert.equal(e.keyword, 'cold brew');
});

test('forced output language overrides detection', async () => {
  const p = await buildPackage({ ...RU, lang: 'en' });
  assert.equal(p.lang, 'en');
  assert.match(p.description, /Chapters:\n0:00 Intro/);
});

test('no timestamps: no chapters in the description, and the reason is returned', async () => {
  const p = await buildPackage({ text: 'Cold brew is easy. You need coarse coffee and cold water. Steep it overnight in the fridge and filter it in the morning.' });
  checkShape(p);
  assert.equal(p.chaptersValid, false);
  assert.equal(p.chapterIssue, 'no_timestamps');
  assert.ok(!/Chapters:/.test(p.description));
});

const GOOD = {
  titles: [
    { title: 'The cold brew mistake that ruins every batch', reason: 'Names a pain point.' },
    { title: 'Cold brew at home: 3 fixes for bitter coffee', reason: 'Number plus outcome.' },
    { title: 'I made cold brew wrong for years', reason: 'Personal story.' },
    { title: 'Coarse grind, 1:8 ratio, 12 hours: cold brew', reason: 'Specific recipe in the title.' },
    { title: 'Stop making bitter cold brew', reason: 'Direct warning.' },
  ],
  hook: 'Bitter, flat cold brew usually comes from three small mistakes. Here is how to fix each one.',
  chapter_titles: ['Intro', '0:42 Choosing beans', 'Coarse grind', '1:8 ratio', '12-18 hour steep', 'Filtering', 'Storing', 'Wrap-up'],
  tags: ['cold brew', 'cold brew at home', 'cold brew ratio', 'how to make cold brew', 'bitter cold brew', 'cold brew recipe'],
  pinned_comment: 'What ratio do you use? Mine is 1:8 for drinking straight.',
  thumbnail_texts: [{ text: 'not bitter', reason: 'Outcome.' }, { text: '3 MISTAKES', reason: 'Number.' }, { text: '12 HOURS?', reason: 'Curiosity.' }],
};

test('Workers AI path: AI words are used, chapter TIMES still come from the transcript', async () => {
  const ai = fakeAi({ response: JSON.stringify(GOOD) });
  const p = await buildPackage(EN, { ai, model: '@cf/test/model' });
  checkShape(p);
  assert.equal(p.source, 'ai');
  assert.equal(p.note, null);
  assert.deepEqual(p.fromStub, []);
  assert.equal(p.titles[0].title, GOOD.titles[0].title);
  assert.equal(p.thumbs[0].text, 'NOT BITTER', 'thumbnail text upper-cased');
  // The AI tried to sneak a time into a chapter name: stripped, and the computed time is kept.
  assert.ok(p.description.includes('0:00 Intro\n0:42 Choosing beans\n2:05 Coarse grind\n3:40 1:8 ratio'));
  assert.ok(p.description.startsWith(GOOD.hook));
  // One call, JSON mode, model from config, chapters and keyword in the prompt.
  assert.equal(ai.calls.length, 1);
  assert.equal(ai.calls[0].model, '@cf/test/model');
  assert.deepEqual(ai.calls[0].input.response_format, { type: 'json_object' });
  const user = ai.calls[0].input.messages[1].content;
  assert.ok(user.includes('Main keyword: cold brew at home') && user.includes('[2:05]'));
  assert.ok(ai.calls[0].input.messages[0].content.includes('English'));
});

test('AI answer as fenced text with a <think> block, or as an already-parsed object, is read', async () => {
  const fenced = '<think>plan</think>\nSure! ```json\n' + JSON.stringify(GOOD) + '\n```';
  assert.deepEqual(extractJson({ response: fenced }), GOOD);
  assert.deepEqual(extractJson({ response: GOOD }), GOOD);
  assert.deepEqual(extractJson(JSON.stringify(GOOD)), GOOD);
  assert.deepEqual(extractJson({ choices: [{ message: { content: JSON.stringify(GOOD) } }] }), GOOD);
  assert.equal(extractJson({ response: 'no json here' }), null);
  const p = await buildPackage(EN, { ai: fakeAi({ response: fenced }) });
  assert.equal(p.source, 'ai');
});

test('partly bad AI answer: bad fields fall back to the stub, good ones are kept', async () => {
  const bad = { ...GOOD, chapter_titles: ['Only', 'three', 'names'], thumbnail_texts: [{ text: 'this is far too many words for a thumbnail' }], tags: 'cold brew, cold brew ratio' };
  const p = await buildPackage(EN, { ai: fakeAi({ response: JSON.stringify(bad) }) });
  checkShape(p);
  assert.equal(p.source, 'ai');
  assert.deepEqual(p.fromStub.sort(), ['chapterTitles', 'tags', 'thumbs']);
  assert.equal(p.titles[0].title, GOOD.titles[0].title);
  assert.ok(p.description.includes('0:42 Picking the beans'), 'stub chapter names used when the count is wrong');
  assert.equal(p.thumbs[0].text, 'STOP DOING THIS');
});

test('three good AI titles are topped up to five from the stub', async () => {
  const p = await buildPackage(EN, { ai: fakeAi({ response: JSON.stringify({ ...GOOD, titles: GOOD.titles.slice(0, 3) }) }) });
  assert.equal(p.titles.length, 5);
  assert.equal(p.titles[3].title, 'Cold brew at home: 6 things nobody tells you');
  assert.ok(p.fromStub.includes('titles (partly)'));
});

test('unreadable AI answer -> full offline stub, flagged', async () => {
  const p = await buildPackage(EN, { ai: fakeAi({ response: 'I cannot help with that.' }) });
  assert.equal(p.source, 'stub');
  assert.equal(p.note, 'ai_unreadable');
  assert.deepEqual(p, { ...(await buildPackage(EN)), note: 'ai_unreadable' });
});

test('AI error: JSON mode refused -> one plain retry; both fail -> stub', async () => {
  const retry = fakeAi((n) => (n === 1 ? new Error('JSON Mode couldn\'t be met') : { response: JSON.stringify(GOOD) }));
  const p = await buildPackage(EN, { ai: retry });
  assert.equal(p.source, 'ai');
  assert.equal(retry.calls.length, 2);
  assert.equal(retry.calls[1].input.response_format, undefined);

  const down = fakeAi(() => new Error('daily allowance used up'));
  const q = await buildPackage(EN, { ai: down });
  assert.equal(q.source, 'stub');
  assert.equal(q.note, 'ai_error');
  checkShape(q);
});

test('AI switched off -> the model is never called', async () => {
  const ai = fakeAi({ response: JSON.stringify(GOOD) });
  const p = await buildPackage(EN, { ai, aiEnabled: false });
  assert.equal(ai.calls.length, 0);
  assert.equal(p.source, 'stub');
});

test('Russian AI prompt asks for Russian; default model is the free-tier Llama', async () => {
  const ai = fakeAi({ response: '{}' });
  const p = await buildPackage(RU, { ai });
  assert.equal(ai.calls[0].model, DEFAULT_MODEL);
  assert.ok(ai.calls[0].input.messages[0].content.includes('Russian'));
  assert.equal(p.note, 'ai_unreadable');
});
