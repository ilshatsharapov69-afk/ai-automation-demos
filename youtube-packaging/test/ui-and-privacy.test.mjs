import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { T } from '../public/i18n.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('every UI string exists in both EN and RU, none empty', () => {
  const en = Object.keys(T.en).sort();
  const ru = Object.keys(T.ru).sort();
  assert.deepEqual(ru, en);
  for (const lang of ['en', 'ru']) for (const [k, v] of Object.entries(T[lang])) assert.ok(String(v).trim(), `${lang}.${k}`);
});

test('every data-i / data-ph key used in index.html has a translation', () => {
  const html = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
  const keys = [...html.matchAll(/data-(?:i|ph)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 30);
  for (const k of keys) assert.ok(k in T.en && k in T.ru, k);
  const js = readFileSync(join(ROOT, 'public/app.js'), 'utf8');
  for (const m of js.matchAll(/\bt\('([a-zA-Z]+)'\)/g)) assert.ok(m[1] in T.en, `app.js uses t('${m[1]}')`);
});

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (['node_modules', '.wrangler', 'shots'].includes(f)) return [];
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test('no time zone, UTC offset or personal address strings in the demo (privacy rule)', () => {
  const bad = /\b(?:UTC|GMT)\s*[+-]\s*\d|\b(?:Europe|Asia|America|Africa|Australia)\/[A-Z][a-z]+|Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/;
  for (const f of files(ROOT).filter((p) => ['.js', '.mjs', '.html', '.css', '.md', '.json', '.jsonc', '.txt', '.srt'].includes(extname(p)))) {
    assert.ok(!bad.test(readFileSync(f, 'utf8')), f);
  }
});

test('the page has no third-party scripts or trackers (everything is served from the Worker)', () => {
  const html = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
  for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^https?:\/\//.test(m[1]), `external resource: ${m[1]}`);
  }
});
