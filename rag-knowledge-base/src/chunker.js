// Structure-aware chunking. A document is split at "## " headings first, then packed paragraph by paragraph
// (long paragraphs are cut at sentence ends) up to MAX characters. Each chunk after the first one in a section
// starts OVERLAP characters before the previous chunk ended, so a fact on a boundary is whole in at least one chunk.
// Chunks are slices of the original body (start/end offsets), which is how a citation can highlight the passage.

export const MAX = 330;
export const OVERLAP = 70;

/** Cut [from, to) of `body` into pieces of at most `max` chars, at sentence ends where possible. */
function splitLong(body, from, to, max) {
  const out = [];
  let s = from;
  while (to - s > max) {
    const window = body.slice(s, s + max);
    let cut = -1;
    const re = /[.!?»)]\s/g;
    let m;
    while ((m = re.exec(window))) cut = m.index + 1;
    if (cut < max * 0.4) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = max;
    out.push([s, s + cut]);
    s += cut;
    while (s < to && /\s/.test(body[s])) s++;
  }
  if (s < to) out.push([s, to]);
  return out;
}

/** Parse a body into sections: [{heading, units: [[start, end], ...]}], units = paragraphs (blank-line separated). */
export function parseSections(body, defaultHeading = '') {
  const sections = [];
  let cur = { heading: defaultHeading, units: [] };
  const push = () => { if (cur.units.length) sections.push(cur); };
  let pos = 0;
  let paraStart = -1;
  let paraEnd = -1;
  const flush = () => { if (paraStart >= 0) cur.units.push([paraStart, paraEnd]); paraStart = -1; };
  for (const line of body.split('\n')) {
    const lineEnd = pos + line.length;
    const h = /^##\s+(.+)$/.exec(line);
    if (h) { flush(); push(); cur = { heading: h[1].trim(), units: [] }; }
    else if (line.trim() === '') flush();
    else { if (paraStart < 0) paraStart = pos; paraEnd = lineEnd; }
    pos = lineEnd + 1;
  }
  flush();
  push();
  return sections;
}

export function chunkDocument(doc, { max = MAX, overlap = OVERLAP } = {}) {
  const chunks = [];
  for (const sec of parseSections(doc.body, doc.title)) {
    // Units: paragraphs, with the over-long ones cut into sentences.
    const units = sec.units.flatMap(([s, e]) => (e - s > max ? splitLong(doc.body, s, e, max) : [[s, e]]));
    let cs = null;
    let ce = null;
    const emit = () => {
      if (cs === null) return;
      chunks.push({ heading: sec.heading, start: cs, end: ce });
      cs = null;
    };
    for (const [s, e] of units) {
      if (cs !== null && e - cs > max) {
        const prevEnd = ce;
        const prevStart = cs;
        emit();
        // Overlap: the next chunk starts a little before the previous one ended (on a word boundary).
        let o = Math.max(prevStart, prevEnd - overlap);
        while (o < prevEnd && !/\s/.test(doc.body[o - 1] ?? ' ')) o++;
        cs = o >= s ? s : o;
        ce = e;
      } else {
        if (cs === null) cs = s;
        ce = e;
      }
    }
    emit();
  }
  return chunks.map((c, i) => {
    const text = doc.body.slice(c.start, c.end).trim();
    return {
      id: `${doc.id}#${i}`,
      doc_id: doc.id,
      idx: i,
      heading: c.heading,
      start: c.start,
      end: c.end,
      text,
      // What the embedding model sees: the passage plus where it comes from.
      embedText: `${doc.title} / ${c.heading}\n${text}`,
    };
  });
}

export function chunkCorpus(docs, opts) {
  return docs.flatMap((d) => chunkDocument(d, opts));
}
