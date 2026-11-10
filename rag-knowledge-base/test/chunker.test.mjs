import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkDocument, chunkCorpus, parseSections, MAX, OVERLAP } from '../src/chunker.js';
import { DOCS } from '../data/docs.js';

const doc = {
  id: 'x1',
  title: 'Title',
  body: '## One\nShort paragraph.\n\n## Two\nFirst paragraph of the second section is here and it is long enough to matter. It has two sentences.\n\nSecond paragraph of the second section keeps going with more words so that the section must be cut into two chunks.\n\nThird paragraph closes the section.',
};

test('a document is split at headings first', () => {
  const secs = parseSections(doc.body, doc.title);
  assert.deepEqual(secs.map((s) => s.heading), ['One', 'Two']);
  const ch = chunkDocument(doc, { max: 120, overlap: 30 });
  assert.equal(ch[0].heading, 'One');
  assert.ok(ch.slice(1).every((c) => c.heading === 'Two'));
  assert.ok(!ch[0].text.includes('First paragraph'), 'no chunk crosses a heading');
});

test('chunks are slices of the body, so a citation can highlight them', () => {
  for (const c of chunkDocument(doc, { max: 120, overlap: 30 })) {
    assert.equal(doc.body.slice(c.start, c.end).trim(), c.text);
  }
});

test('long sections get an overlap: the next chunk starts before the previous one ends', () => {
  const ch = chunkDocument(doc, { max: 120, overlap: 30 }).filter((c) => c.heading === 'Two');
  assert.ok(ch.length >= 2);
  for (let i = 1; i < ch.length; i++) {
    assert.ok(ch[i].start < ch[i - 1].end, 'overlap');
    assert.ok(ch[i].start >= ch[i - 1].start, 'never before the previous start');
    assert.ok(ch[i - 1].end - ch[i].start <= 30 + 12, 'overlap stays about the requested size');
  }
});

test('size limit is respected (a chunk is never longer than max plus the overlap)', () => {
  const long = { id: 'x2', title: 'T', body: '## A\n' + 'Это предложение. '.repeat(80).trim() };
  const ch = chunkDocument(long, { max: 200, overlap: 40 });
  assert.ok(ch.length > 3);
  assert.ok(ch.every((c) => c.text.length <= 200 + 40));
});

test('every word of every document ends up in some chunk', () => {
  for (const d of DOCS) {
    const covered = new Array(d.body.length).fill(false);
    for (const c of chunkDocument(d)) for (let i = c.start; i < c.end; i++) covered[i] = true;
    const missing = [];
    for (const m of d.body.matchAll(/^(?!##)\S.*$/gm)) {
      for (let k = 0; k < m[0].length; k++) if (!covered[m.index + k] && /\S/.test(m[0][k])) missing.push(m.index + k);
    }
    assert.equal(missing.length, 0, `${d.id}: ${missing.length} characters not covered`);
  }
});

test('ids are stable and the embedding text carries the title and heading', () => {
  const ch = chunkDocument(DOCS[0]);
  assert.deepEqual(ch.map((c) => c.id), ch.map((_, i) => `${DOCS[0].id}#${i}`));
  assert.ok(ch[0].embedText.startsWith(`${DOCS[0].title} / ${ch[0].heading}\n`));
});

test('the demo corpus: 15-25 documents, mostly Russian with some English, several chunks each', () => {
  assert.ok(DOCS.length >= 15 && DOCS.length <= 25);
  const en = DOCS.filter((d) => d.lang === 'en').length;
  assert.ok(en >= 2 && en < DOCS.length - en);
  const all = chunkCorpus(DOCS);
  assert.ok(all.length > DOCS.length * 2);
  assert.ok(all.every((c) => c.text.length <= MAX + OVERLAP));
  assert.equal(new Set(all.map((c) => c.id)).size, all.length);
});

test('no em dash anywhere in the visible corpus', () => {
  assert.ok(!DOCS.some((d) => /\u2014/.test(d.title + d.body)));
});
