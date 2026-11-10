// Timestamps -> YouTube chapters. Pure functions, shared by the Worker and the browser.
// The AI never decides a time: every chapter start comes from a timestamp found in the pasted text.
//
// Accepted input:
//  - script/notes lines:   "0:00 Intro", "[01:15] Grind size", "(12:30) - Results", "Results — 12:30"
//  - YouTube "Show transcript" copy: a timestamp on its own line, the words on the next line(s)
//  - SRT / WebVTT cues:    "00:00:04,000 --> 00:00:07,500" followed by the caption text
// YouTube's chapter rules (checked in `checks`): first chapter at 0:00, at least 3 chapters,
// each at least 10 seconds, in ascending order.

import { words, stopwords, cap } from './text.js';

const T = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}`;
const LEAD = new RegExp(String.raw`^\s*[\[(]?(${T})(?:[.,]\d{1,3})?[\])]?(?:\s*[-–—:|.]\s*|\s+|$)(.*)$`);
const TRAIL = new RegExp(String.raw`^(.*?\S)\s*[-–—:|]?\s*[\[(]?(${T})[\])]?\s*$`);
const CUE = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[.,]\d{1,3})?\s*-->/;

export const MIN_CHAPTER_SEC = 10;
export const MIN_CHAPTERS = 3;

/** "1:02:03" -> 3723, "12:30" -> 750; null if not a valid clock time. */
export function toSec(ts) {
  const p = ts.split(':').map(Number);
  if (p.some((n) => !Number.isFinite(n))) return null;
  if (p.length === 2) return p[1] < 60 ? p[0] * 60 + p[1] : null;
  if (p.length === 3) return p[1] < 60 && p[2] < 60 ? p[0] * 3600 + p[1] * 60 + p[2] : null;
  return null;
}

/** 75 -> "1:15"; with hours=true 75 -> "0:01:15" (YouTube wants one format for the whole list). */
export function fmt(sec, hours = false) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ss = String(s).padStart(2, '0');
  return hours ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${h * 60 + m}:${ss}`;
}

const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();

/**
 * Finds timestamped segments in pasted text.
 * @returns {{segments: {t:number, text:string}[], preamble: string, body: string, format: 'cues'|'lines'|'none'}}
 */
export function parseSegments(raw) {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
  const segs = [];
  const pre = [];
  let format = 'none';

  if (lines.some((l) => CUE.test(l))) {
    format = 'cues';
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(CUE);
      if (!m) continue;
      const t = toSec(m[1]);
      const txt = [];
      for (let j = i + 1; j < lines.length && lines[j].trim() !== '' && !CUE.test(lines[j]); j++) txt.push(stripTags(lines[j]));
      if (t !== null) segs.push({ t, head: '', text: txt.join(' ').trim() });
    }
    // Rolling auto-captions repeat the previous line; drop exact repeats.
    for (let i = segs.length - 1; i > 0; i--) if (segs[i].text === segs[i - 1].text) segs.splice(i, 1);
  } else {
    let cur = null;
    for (const line of lines) {
      const l = line.trim();
      if (!l) continue;
      let m = l.match(LEAD);
      let t = m ? toSec(m[1]) : null;
      let text = m ? m[2].trim() : '';
      if (t === null) {
        const tm = l.length <= 80 ? l.match(TRAIL) : null; // "Results — 12:30" (short heading lines only)
        if (tm) { t = toSec(tm[2]); text = tm[1].replace(/[\s\-–—:|]+$/, ''); }
      }
      if (t !== null) {
        cur = { t, head: text, text };
        segs.push(cur);
        format = 'lines';
      } else if (cur) {
        cur.text = (cur.text ? cur.text + ' ' : '') + l;
      } else {
        pre.push(l);
      }
    }
  }

  // Keep only times that move forward (a "see 5:00" style reference that jumps back is not a section start);
  // the words of such a line stay in the transcript, attached to the section before it.
  const segments = [];
  for (const s of segs) {
    const prev = segments[segments.length - 1];
    if (!prev || s.t > prev.t) segments.push(s);
    else prev.text = [prev.text, s.text].filter(Boolean).join(' ');
  }

  // Spoken text without the heading words ("0:42 Picking the beans" + its paragraph -> the paragraph only).
  const spoken = (s) => (isHeading(s.head) && s.text !== s.head ? s.text.slice(s.head.length) : s.text).trim();
  const preamble = pre.join(' ');
  const body = [preamble, ...segments.map(spoken)].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return { segments, preamble, body: segments.length ? body : String(raw || '').replace(/\s+/g, ' ').trim(), format: segments.length ? format : 'none' };
}

const FILLER = /^(?:(?:so|okay|ok|alright|all right|right|now|and|well|hey|then|next|first|um|uh|итак|ну|так|окей|ладно|а|и|теперь|вот|дальше|далее|сначала|первое|эм)[\s,.!:—-]+)+/i;

/** "0:00 Intro" style text: up to 7 words, no sentence end. */
export function isHeading(s) {
  const clean = String(s || '').trim();
  const wc = clean ? clean.split(/\s+/).length : 0;
  return wc > 0 && wc <= 7 && !/[.!?…]$/.test(clean);
}

/** A short chapter label from the chapter's text (offline, deterministic). */
export function stubChapterTitle(text, lang, isFirst, head = '') {
  if (isHeading(head)) return cap(head.trim().replace(/[\s:;,.—–-]+$/, ''));
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (isFirst || !clean) return lang === 'ru' ? 'Вступление' : 'Intro';
  const first = clean.split(/(?<=[.!?…])\s/)[0].replace(FILLER, '');
  const stop = stopwords(lang);
  let ws = first.replace(/[.!?…"«»()]/g, '').split(' ').filter(Boolean).slice(0, 6);
  while (ws.length > 2 && stop.has(words(ws[ws.length - 1])[0])) ws.pop();
  return cap(ws.join(' ').replace(/[\s,;:—–-]+$/, '')) || (lang === 'ru' ? 'Часть' : 'Part');
}

/** Words that usually open a new part of a talk. */
const TRANSITION = /^(?:now|next|step \d|let's talk|moving on|finally|so,? let's|to sum up|теперь|дальше|далее|начнём|начнем|пора|переходим|шаг \d|подведём|подведем|итак|и последнее)/i;

/** Typical speaking pace, used to estimate how long the last segment runs. */
const WPS = 2.5;

/**
 * Groups segments into chapters and applies YouTube's rules.
 * Sparse timestamps (section markers) become chapters one-to-one; dense ones (captions) are grouped
 * into ~2-minute chapters, cutting at the start of a sentence when one is near.
 */
export function buildChapters(parsed, lang = 'en') {
  const segs = parsed.segments;
  if (!segs.length) return { chapters: [], duration: 0, valid: false, checks: null, issue: 'no_timestamps' };

  const last = segs[segs.length - 1];
  const duration = Math.round(last.t + Math.max(MIN_CHAPTER_SEC, words(last.text).length / WPS));
  const gaps = segs.slice(1).map((s, i) => s.t - segs[i].t).sort((a, b) => a - b);
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : Infinity;
  const dense = segs.length > 15 || medianGap < 30;

  let groups;
  if (!dense) {
    groups = segs.map((s) => ({ t: s.t, head: s.head, parts: [s.text] }));
  } else {
    const target = Math.max(MIN_CHAPTERS, Math.min(10, Math.round(duration / 120)));
    const cuts = new Set([0]);
    for (let k = 1; k < target; k++) {
      const goal = (duration * k) / target;
      const win = duration / target / 4;
      let best = -1;
      let bestD = Infinity;
      for (let i = 1; i < segs.length; i++) {
        const d = Math.abs(segs[i].t - goal);
        if (d > win) continue;
        const sentenceStart = /[.!?…]\s*$/.test(segs[i - 1].text);
        const topicStart = TRANSITION.test(segs[i].text);
        const score = d - (sentenceStart ? win / 2 : 0) - (topicStart ? win : 0);
        if (score < bestD) { bestD = score; best = i; }
      }
      if (best < 0) { // nothing inside the window: nearest segment
        for (let i = 1; i < segs.length; i++) if (Math.abs(segs[i].t - goal) < bestD) { bestD = Math.abs(segs[i].t - goal); best = i; }
      }
      if (best > 0) cuts.add(best);
    }
    const idx = [...cuts].sort((a, b) => a - b);
    groups = idx.map((start, n) => ({ t: segs[start].t, parts: segs.slice(start, idx[n + 1] ?? segs.length).map((s) => s.text) }));
  }

  // Rule: the first chapter starts at 0:00.
  if (groups[0].t > 0) {
    if (groups[0].t >= MIN_CHAPTER_SEC) groups.unshift({ t: 0, parts: [parsed.preamble || ''], intro: true });
    else groups[0].t = 0;
  }
  // Rule: each chapter is at least 10 seconds. When two marks are closer than that, the earlier one keeps
  // its start and name and the later mark is dropped (its words join the earlier chapter).
  for (let i = 0; i + 1 < groups.length;) {
    if (groups[i + 1].t - groups[i].t < MIN_CHAPTER_SEC) { groups[i].parts.push(...groups[i + 1].parts); groups.splice(i + 1, 1); } else i++;
  }
  const lastG = groups[groups.length - 1];
  if (groups.length > 1 && duration - lastG.t < MIN_CHAPTER_SEC) { groups[groups.length - 2].parts.push(...lastG.parts); groups.pop(); }

  const hours = duration >= 3600;
  const chapters = groups.map((g, i) => {
    const text = g.parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const title = g.intro ? (lang === 'ru' ? 'Вступление' : 'Intro') : stubChapterTitle(dense ? text : g.parts[0], lang, i === 0, g.head);
    return { t: g.t, label: fmt(g.t, hours), title, text };
  });

  const checks = chapterChecks(chapters, duration);
  return { chapters, duration, valid: Object.values(checks).every(Boolean), checks, issue: checks.minThree ? null : 'too_few', dense };
}

export function chapterChecks(chapters, duration) {
  return {
    startsAtZero: chapters.length > 0 && chapters[0].t === 0,
    minThree: chapters.length >= MIN_CHAPTERS,
    minTenSeconds: chapters.every((c, i) => (i + 1 < chapters.length ? chapters[i + 1].t : duration) - c.t >= MIN_CHAPTER_SEC),
    ascending: chapters.every((c, i) => i === 0 || c.t > chapters[i - 1].t),
  };
}

/** "0:00 Intro\n1:15 Grind size..." */
export function chaptersBlock(chapters) {
  return chapters.map((c) => `${c.label} ${c.title}`).join('\n');
}
