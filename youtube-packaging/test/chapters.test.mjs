import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSegments, buildChapters, toSec, fmt, chaptersBlock } from '../public/lib/chapters.js';

const sample = (f) => readFileSync(new URL(`../public/samples/${f}`, import.meta.url), 'utf8');
const chaptersOf = (text, lang = 'en') => buildChapters(parseSegments(text), lang);
const labels = (r) => r.chapters.map((c) => c.label);
const allRulesPass = (r) => Object.values(r.checks).every(Boolean);

test('clock parsing and formatting', () => {
  assert.equal(toSec('0:00'), 0);
  assert.equal(toSec('12:30'), 750);
  assert.equal(toSec('1:02:03'), 3723);
  assert.equal(toSec('1:75'), null, 'seconds over 59 are not a time');
  assert.equal(fmt(75), '1:15');
  assert.equal(fmt(3723), '62:03');
  assert.equal(fmt(3723, true), '1:02:03');
  assert.equal(fmt(75, true), '0:01:15');
});

test('script with "0:42 Heading" lines: one chapter per line, headings kept as titles', () => {
  const r = chaptersOf(sample('cold-brew-en.txt'));
  assert.deepEqual(labels(r), ['0:00', '0:42', '2:05', '3:40', '5:15', '7:02', '8:30', '9:45']);
  assert.deepEqual(r.chapters.map((c) => c.title), ['Intro', 'Picking the beans', 'Grind size', 'The ratio', 'Steeping time', 'Filtering', 'Storing and serving', 'Wrap-up']);
  assert.ok(r.valid && allRulesPass(r));
  assert.equal(r.dense, false);
});

test('SRT subtitles: dense cues are grouped into ~2-minute chapters that follow every rule', () => {
  const r = chaptersOf(sample('basil-ru.srt'), 'ru');
  assert.ok(r.dense);
  assert.ok(r.valid && allRulesPass(r), JSON.stringify(r.checks));
  assert.equal(r.chapters[0].label, '0:00');
  assert.equal(r.chapters[0].title, 'Вступление');
  assert.ok(r.chapters.length >= 3 && r.chapters.length <= 10);
  // Every chapter starts exactly at a cue start from the file (no invented times).
  const cueStarts = new Set(parseSegments(sample('basil-ru.srt')).segments.map((s) => s.t));
  for (const c of r.chapters) assert.ok(cueStarts.has(c.t), `${c.label} is a cue start`);
  // A cut prefers the cue that opens a new topic ("Теперь свет.", "Дальше полив.").
  assert.ok(r.chapters.some((c) => c.title === 'Свет'));
  assert.ok(r.chapters.some((c) => c.title === 'Полив'));
});

test('WebVTT with header, cue ids and inline tags; rolling duplicate lines removed', () => {
  const vtt = 'WEBVTT\n\nintro\n00:00:00.000 --> 00:00:03.000\n<c>Hello and welcome.</c>\n\n2\n00:00:03.000 --> 00:00:05.000\nHello and welcome.\n\n3\n00:01:00.000 --> 00:01:05.000\nNow the tools.\n';
  const p = parseSegments(vtt);
  assert.equal(p.format, 'cues');
  assert.deepEqual(p.segments.map((s) => [s.t, s.text]), [[0, 'Hello and welcome.'], [60, 'Now the tools.']]);
});

test('YouTube "Show transcript" copy: timestamp on its own line, words on the next', () => {
  const lines = [];
  for (let s = 0; s < 600; s += 6) lines.push(`${fmt(s)}`, `sentence number ${s / 6} about sourdough starters.`);
  const r = chaptersOf(lines.join('\n'));
  assert.ok(r.dense);
  assert.ok(r.valid && allRulesPass(r));
  assert.equal(r.chapters.length, 5, '10 minutes -> 5 chapters of about 2 minutes');
});

test('first chapter is moved to 0:00, or an Intro is added when the first mark is late', () => {
  const early = chaptersOf('0:04 Hello\n1:00 Tools\n2:00 Steps\n3:00 Result');
  assert.deepEqual(labels(early), ['0:00', '1:00', '2:00', '3:00']);
  assert.equal(early.chapters[0].title, 'Hello');

  const late = chaptersOf('Some words before the first mark.\n0:30 Tools\n2:00 Steps\n3:00 Result');
  assert.deepEqual(labels(late), ['0:00', '0:30', '2:00', '3:00']);
  assert.equal(late.chapters[0].title, 'Intro');
});

test('chapters shorter than 10 seconds are merged; times that go backwards are ignored', () => {
  const text = '0:00 Intro\n1:00 Tools\n1:05 Oops\n2:00 Steps\n1:30 see the tools part\n3:00 Result';
  const r = chaptersOf(text);
  assert.deepEqual(labels(r), ['0:00', '1:00', '2:00', '3:00']);
  assert.deepEqual(r.chapters.map((c) => c.title), ['Intro', 'Tools', 'Steps', 'Result'], 'the earlier of two close marks keeps its name');
  assert.ok(allRulesPass(r));
  assert.ok(parseSegments(text).body.includes('see the tools part'), 'words of a backwards line stay in the transcript');
});

test('trailing timestamps ("Results — 12:30") and bracketed ones ("[01:15]") are read', () => {
  const r = chaptersOf('Intro - 0:00\n[01:15] Setup\n(3:40) Results\nOutro — 5:00');
  assert.deepEqual(labels(r), ['0:00', '1:15', '3:40', '5:00']);
  assert.deepEqual(r.chapters.map((c) => c.title), ['Intro', 'Setup', 'Results', 'Outro']);
});

test('videos over an hour use h:mm:ss for every chapter', () => {
  const r = chaptersOf('0:00 Start\n25:00 Middle\n1:10:00 End part');
  assert.deepEqual(labels(r), ['0:00:00', '0:25:00', '1:10:00']);
  assert.equal(chaptersBlock(r.chapters), '0:00:00 Start\n0:25:00 Middle\n1:10:00 End part');
});

test('no timestamps / too few chapters are reported, not invented', () => {
  const none = chaptersOf('Just a script without any times. Second sentence here.');
  assert.equal(none.issue, 'no_timestamps');
  assert.deepEqual(none.chapters, []);
  assert.equal(none.valid, false);

  const few = chaptersOf('0:00 Intro\n2:00 Main part');
  assert.equal(few.issue, 'too_few');
  assert.equal(few.valid, false);
});
