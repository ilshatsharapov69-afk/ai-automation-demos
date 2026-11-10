import { T } from './i18n.js';
import { analyzeOutliers, short } from './lib/outliers.js';
import { fmt } from './lib/chapters.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const params = new URLSearchParams(location.search);
let lang = params.get('lang') || store.get('vp-lang') || ((navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en');
if (!T[lang]) lang = 'en';
let tab = params.get('tab') === 'outliers' ? 'outliers' : 'package';
let last = null; // last packaging result
let lastOut = null; // last outlier analysis

const t = (k) => T[lang][k] ?? T.en[k] ?? k;

function applyLang() {
  document.documentElement.lang = lang;
  document.title = t('docTitle');
  document.querySelectorAll('[data-i]').forEach((el) => { el.textContent = t(el.dataset.i); });
  document.querySelectorAll('[data-ph]').forEach((el) => { el.placeholder = t(el.dataset.ph); });
  document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
  $('#by-link').href = lang === 'ru' ? 'https://ilshat-builds.sherlock753cc.workers.dev/ru/' : 'https://ilshat-builds.sherlock753cc.workers.dev/';
  if (last) renderPackage(last);
  if (lastOut) renderOutliers(lastOut);
}

function applyTab() {
  document.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
  $('#tab-package').hidden = tab !== 'package';
  $('#tab-outliers').hidden = tab !== 'outliers';
  document.querySelector('.lead').hidden = tab === 'outliers';
}

document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.lang; store.set('vp-lang', lang); applyLang(); }));
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; applyTab(); if (tab === 'outliers') demoOutliers(); }));
$('#lead-go').addEventListener('click', () => { tab = 'outliers'; applyTab(); demoOutliers(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

// ---------- packaging ----------

const SAMPLES = { en: { file: 'samples/cold-brew-en.txt', keyword: 'cold brew at home' }, ru: { file: 'samples/basil-ru.srt', keyword: 'базилик на подоконнике' } };

async function loadSample(which) {
  const s = SAMPLES[which];
  const r = await fetch(s.file);
  $('#text').value = await r.text();
  $('#keyword').value = s.keyword;
  $('#outlang').value = 'auto';
}
document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => loadSample(b.dataset.sample)));
// The form opens pre-filled (a made-up channel), so one click on Generate gives a result.
loadSample(lang === 'ru' ? 'ru' : 'en');

$('#file').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (f) $('#text').value = (await f.text()).slice(0, 60000);
  e.target.value = '';
});

function showError(el, msg) { el.textContent = msg; el.hidden = !msg; }

$('#pkg-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#text').value.trim();
  const err = $('#pkg-error');
  if (!text) return showError(err, t('errEmpty'));
  showError(err, '');
  const go = $('#go');
  go.disabled = true;
  go.textContent = t('working');
  try {
    const r = await fetch('/api/package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, keyword: $('#keyword').value, lang: $('#outlang').value }),
    });
    const j = await r.json();
    if (!r.ok) {
      showError(err, j.error === 'too_long' ? t('errTooLong').replace('{max}', j.max) : j.error === 'empty' ? t('errEmpty') : t('errNetwork'));
      return;
    }
    last = j;
    renderPackage(j);
    $('#result').hidden = false;
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    showError(err, t('errNetwork'));
  } finally {
    go.disabled = false;
    go.textContent = t('generate');
  }
});

function countClass(n, soft, hard) { return n > hard ? 'bad' : n > soft ? 'warn' : ''; }

function thumbHtml(text, i) {
  const ws = esc(text).split(' ');
  // Highlight the most "trigger" word: a number if there is one, else the last word.
  let hi = ws.findIndex((w) => /\d/.test(w));
  if (hi < 0) hi = ws.length - 1;
  return ws.map((w, k) => (k === hi ? `<span class="hl">${w}</span>` : w)).join(' ');
}

// Abstract subject for the mock (no faces, no brands): a spotlight circle and an arrow pointing at it.
const SUBJECT = (i) => [
  '<svg class="subject" viewBox="0 0 100 100" aria-hidden="true"><circle cx="58" cy="52" r="30" fill="rgba(255,255,255,.18)" stroke="#fff" stroke-width="4"/><circle cx="58" cy="52" r="15" fill="#fff" opacity=".9"/><path d="M8 92 L34 66" stroke="#ffe14d" stroke-width="8" stroke-linecap="round"/><path d="M22 64 L36 64 L36 78" fill="none" stroke="#ffe14d" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '<svg class="subject" viewBox="0 0 100 100" aria-hidden="true"><rect x="30" y="18" width="52" height="70" rx="10" fill="rgba(255,255,255,.2)" stroke="#fff" stroke-width="4"/><path d="M42 40 L70 40 M42 54 L70 54 M42 68 L60 68" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="80" cy="22" r="13" fill="#ff3b30" stroke="#fff" stroke-width="3"/><path d="M80 15v9M80 28v1" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
  '<svg class="subject" viewBox="0 0 100 100" aria-hidden="true"><path d="M14 84 L38 58 L54 70 L86 30" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M70 28 L88 28 L88 46" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="38" cy="58" r="6" fill="#ffe14d"/><circle cx="54" cy="70" r="6" fill="#ffe14d"/></svg>',
][i % 3];

function renderPackage(r) {
  const ai = r.source === 'ai';
  $('#src').textContent = ai ? t('srcAi') : t('srcStub');
  $('#src').className = 'badge' + (ai ? ' ai' : '');
  const meta = [`${r.lang.toUpperCase()}`];
  if (r.duration) meta.push(`${t('length')} ≈ ${fmt(r.duration, r.duration >= 3600)}`);
  meta.push(`${t('chaptersN')}: ${r.chaptersValid ? r.chapters.length : 0}`);
  if (r.cached) meta.push(t('cached'));
  if (r.quota) meta.push(`${t('quotaLeft')}: ${r.quota.ipLeft}/${r.quota.ipMax}`);
  $('#meta').textContent = meta.join(' · ');

  const note = $('#note');
  let n = '';
  if (r.note === 'ai_off') n = t('noteAiOff');
  else if (r.note === 'ai_error') n = t('noteAiError');
  else if (r.note === 'ai_unreadable') n = t('noteAiUnreadable');
  else if (r.note === 'ai_ip_limit') n = t('noteIpLimit');
  else if (r.note === 'ai_day_limit') n = t('noteDayLimit');
  else if (r.fromStub?.length) n = t('noteFromStub') + r.fromStub.join(', ');
  note.textContent = n;
  note.hidden = !n;

  $('#titles').innerHTML = r.titles.map((x, i) => `
    <li><span class="tt">${esc(x.title)}</span>
      <span class="side"><span class="count ${countClass(x.title.length, 70, 100)}">${x.title.length} ${t('chars')}</span><button type="button" class="btn small" data-copy="title:${i}">${t('copy')}</button></span>
      <span class="why">${esc(x.reason)}</span></li>`).join('');

  const dur = r.duration ? fmt(r.duration, r.duration >= 3600) : '';
  $('#thumbs').innerHTML = r.thumbs.map((x, i) => `
    <figure class="tcard" style="margin:0">
      <div class="thumb p${i}"><div class="ttext">${thumbHtml(x.text, i)}</div>${SUBJECT(i)}${dur ? `<span class="dur">${dur}</span>` : ''}</div>
      <div class="feed"><span class="av"></span><div><div class="ft">${esc(r.titles[i]?.title || '')}</div><div class="fm">${t('yourChannel')} · ${t('preview')}</div></div></div>
      ${x.reason ? `<p class="why">${esc(x.reason)}</p>` : ''}
    </figure>`).join('');

  // Shrink the text so the longest word always fits the text box (no mid-word breaks).
  document.querySelectorAll('.ttext').forEach((el) => {
    const longest = Math.max(...el.textContent.split(/\s+/).map((w) => w.length), 1);
    el.style.fontSize = Math.min(10.5, 54 / (longest * 0.7)).toFixed(2) + 'cqw';
  });

  $('#desc').innerHTML = esc(r.description).replace(/^((?:\d+:)?\d{1,2}:\d{2}) /gm, '<span class="ts">$1</span> ');
  const dl = r.description.length;
  $('#desc-count').textContent = `${dl} / 5000`;
  $('#desc-count').className = 'count ' + countClass(dl, 4500, 5000);

  const c = r.chapterChecks;
  let checks = '';
  if (c) {
    const row = (ok, key) => `<span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${t(key)}</span>`;
    checks = row(c.startsAtZero, 'checkZero') + row(c.minThree, 'checkThree') + row(c.minTenSeconds, 'checkTen') + row(c.ascending, 'checkAsc');
  }
  if (r.chapterIssue === 'no_timestamps') checks += `<span class="msg">${t('noTimestamps')}</span>`;
  else if (r.chapterIssue === 'too_few') checks += `<span class="msg">${t('tooFew')}</span>`;
  $('#checks').innerHTML = checks;

  $('#tags').innerHTML = r.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join('');
  $('#tags-count').textContent = `${r.tagsLength} / 500`;
  $('#tags-count').className = 'count ' + countClass(r.tagsLength, 450, 500);
  $('#pinned').textContent = r.pinned;
}

function copyText(key) {
  if (!last) return '';
  if (key === 'desc') return last.description;
  if (key === 'tags') return last.tags.join(', ');
  if (key === 'pinned') return last.pinned;
  if (key.startsWith('title:')) return last.titles[+key.slice(6)]?.title || '';
  if (key === 'all') {
    return [
      `## ${t('titles')}`, ...last.titles.map((x, i) => `${i + 1}. ${x.title}`), '',
      `## ${t('thumbs')}`, ...last.thumbs.map((x) => `- ${x.text}`), '',
      `## ${t('description')}`, last.description, '',
      `## ${t('tags')}`, last.tags.join(', '), '',
      `## ${t('pinned')}`, last.pinned,
    ].join('\n');
  }
  return '';
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy], #copy-all');
  if (!b) return;
  const text = copyText(b.id === 'copy-all' ? 'all' : b.dataset.copy);
  try { await navigator.clipboard.writeText(text); } catch { return; }
  const old = b.textContent;
  b.textContent = t('copied');
  setTimeout(() => { b.textContent = old; }, 1200);
});

// ---------- outliers ----------

let demoLoaded = false;
async function loadOutDemo() {
  $('#out-text').value = await (await fetch(lang === 'ru' ? 'samples/competitors-ru.txt' : 'samples/competitors.txt')).text();
  demoLoaded = true;
}
// First visit to the outlier tab: fill the demo list and run it, so the result is visible without any typing.
async function demoOutliers() {
  if (lastOut || $('#out-text').value.trim()) return;
  await loadOutDemo();
  $('#out-form').requestSubmit();
}
$('#sample-out').addEventListener('click', async () => { await loadOutDemo(); $('#out-form').requestSubmit(); });
$('#out-text').addEventListener('input', () => { demoLoaded = false; $('#demo-flag').hidden = true; });

$('#out-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const threshold = Math.max(1, parseFloat($('#threshold').value) || 3);
  const res = analyzeOutliers($('#out-text').value, { threshold });
  if (!res.rows.length && !res.errors.length) { showError($('#out-error'), t('outEmpty')); $('#out-result').hidden = true; return; }
  showError($('#out-error'), '');
  lastOut = res;
  renderOutliers(res);
  $('#out-result').hidden = false;
  $('#demo-flag').hidden = !demoLoaded;
});

const ratioFmt = (x) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2)).replace(/\.0$/, '') + '×';
const loc = (s) => (lang === 'ru' ? s.replace('.', ',') : s);

function renderOutliers(res) {
  $('#st-n').textContent = res.rows.length;
  $('#st-med').textContent = loc(ratioFmt(res.median));
  $('#st-out').textContent = res.outliers;
  const max = Math.max(...res.rows.map((r) => r.ratio), 1);
  const band = { outlier: t('bandOutlier'), above: t('bandAbove'), normal: t('bandNormal') };
  $('#out-rows').innerHTML = res.rows.map((r, i) => `
    <tr class="${r.band}">
      <td class="num">${i + 1}</td>
      <td class="vt">${esc(r.title)}${r.band !== 'normal' ? `<span class="pill ${r.band}">${band[r.band]}</span>` : ''}</td>
      <td><div class="bar"><b>${loc(ratioFmt(r.ratio))}</b><i style="width:${Math.max(3, Math.round((Math.sqrt(r.ratio) / Math.sqrt(max)) * 120))}px"></i></div></td>
      <td class="num">${short(r.views, lang)}</td>
      <td class="num">${short(r.subs, lang)}</td>
      <td class="num">${loc(ratioFmt(r.vsMedian))}</td>
    </tr>`).join('');
  const reason = { number: t('reasonNumber'), columns: t('reasonColumns'), zero_subs: t('reasonZero') };
  $('#out-skipped').hidden = !res.errors.length;
  $('#out-errs').innerHTML = res.errors.map((x) => `<li>${t('line')} ${x.line}: ${reason[x.reason]} - <code>${esc(x.text.slice(0, 80))}</code></li>`).join('');
}

applyLang();
applyTab();
if (tab === 'outliers') demoOutliers();
