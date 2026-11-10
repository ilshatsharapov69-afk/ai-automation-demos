// "Views ÷ subscribers" outlier finder for a pasted list of competitor videos. Runs in the browser; pure.
// One video per line: title | views | subscribers   (tab, ";" or CSV also work; a header line is skipped)
// Numbers: 1234567, 1 234 567, 1,234,567, 1.2M, 350K, 4,5k, 1,2 млн, 350 тыс, 2 млрд.

const MULT = { k: 1e3, 'к': 1e3, 'тыс': 1e3, m: 1e6, 'м': 1e6, 'млн': 1e6, b: 1e9, 'млрд': 1e9 };

/** Parses a view/subscriber count; null if it is not a number. */
export function parseCount(input) {
  let s = String(input ?? '').toLowerCase().replace(/[   \s]+/g, ' ').trim();
  s = s.replace(/\b(views?|subscribers?|subs?)\b|просмотр\S*|подписчик\S*|^~|^≈/g, '').trim();
  const m = s.match(/^(\d[\d\s.,']*?)\s*(k|к|тыс|m|м|млн|b|млрд)?\.?$/);
  if (!m) return null;
  let num = m[1].replace(/\s|'/g, '');
  const unit = m[2];
  if (unit) {
    num = num.replace(',', '.');
    if ((num.match(/\./g) || []).length > 1) return null;
    const v = parseFloat(num);
    return Number.isFinite(v) ? Math.round(v * MULT[unit]) : null;
  }
  if (/^\d{1,3}([.,]\d{3})+$/.test(num)) num = num.replace(/[.,]/g, ''); // 1,234,567 / 1.234.567
  else if (/^\d+[.,]\d+$/.test(num)) num = num.replace(',', '.'); // 12,5 (rare for counts)
  if (!/^\d+(\.\d+)?$/.test(num)) return null;
  return Math.round(parseFloat(num));
}

function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Splits one pasted line into [title, views, subs] (title may contain the delimiter). */
export function splitLine(line) {
  let cells;
  if (line.includes('\t')) cells = line.split('\t');
  else if (line.includes('|')) cells = line.split('|');
  else if (line.includes(';')) cells = line.split(';');
  else cells = splitCsv(line);
  cells = cells.map((c) => c.trim());
  while (cells.length && cells[cells.length - 1] === '') cells.pop();
  if (cells.length < 3) return null;
  const subs = cells.pop();
  const views = cells.pop();
  return [cells.join(' ').trim(), views, subs];
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * @param {string} text pasted list
 * @param {{threshold?: number}} opts flag a video when views >= threshold × subscribers (default 3)
 */
export function analyzeOutliers(text, { threshold = 3 } = {}) {
  const rows = [];
  const errors = [];
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const cells = splitLine(line);
    const views = cells ? parseCount(cells[1]) : null;
    const subs = cells ? parseCount(cells[2]) : null;
    if (views === null || subs === null) {
      const header = /views|subs|просмотр|подписч|title|назван/i.test(line);
      if (!(header && rows.length === 0 && errors.length === 0)) errors.push({ line: i + 1, text: line, reason: cells ? 'number' : 'columns' });
      return;
    }
    if (subs <= 0) { errors.push({ line: i + 1, text: line, reason: 'zero_subs' }); return; }
    rows.push({ line: i + 1, title: cells[0] || `#${i + 1}`, views, subs, ratio: views / subs });
  });

  const med = median(rows.map((r) => r.ratio));
  for (const r of rows) {
    r.vsMedian = med > 0 ? r.ratio / med : 0;
    r.band = r.ratio >= threshold ? 'outlier' : r.ratio >= 1 ? 'above' : 'normal';
  }
  rows.sort((a, b) => b.ratio - a.ratio || a.line - b.line);
  return {
    rows,
    errors,
    threshold,
    median: med,
    outliers: rows.filter((r) => r.band === 'outlier').length,
  };
}

/** 1234 -> "1.2K", 2500000 -> "2.5M" (EN) / "2,5 млн" (RU). */
export function short(n, lang = 'en') {
  const units = lang === 'ru' ? [[1e9, ' млрд'], [1e6, ' млн'], [1e3, ' тыс.']] : [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, u] of units) {
    if (n >= v) {
      const x = n / v;
      const s = (x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, ''));
      return (lang === 'ru' ? s.replace('.', ',') : s) + u;
    }
  }
  return String(n);
}
