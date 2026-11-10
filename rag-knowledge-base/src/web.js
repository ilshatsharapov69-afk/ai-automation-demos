// The one page. Plain HTML + CSS + a small script, no framework, no build step.
// NOTE: the client script below avoids backticks on purpose (it lives inside a template string).
import { I18N, BUILT_BY } from './i18n.js';

const CSS = `
:root{--bg:#f5f2ec;--card:#fff;--ink:#1c2a31;--muted:#5d6b73;--line:#e3ddd1;--teal:#0e5a62;--teal-soft:#e2f0f0;--amber:#b86a1d;--amber-soft:#fbeedc;--green:#2c7a4b;--green-soft:#e3f3e8;--red:#a23b3b;--red-soft:#f8e6e4;--r:12px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
button,input{font:inherit;color:inherit}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
header.top{border-bottom:1px solid var(--line);background:var(--card)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;height:58px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.2px}
.logo{width:26px;height:26px;border-radius:7px;background:var(--teal);display:grid;place-items:center;color:#fff;font-size:15px}
.tag{font-size:12px;font-weight:600;color:var(--amber);background:var(--amber-soft);padding:3px 9px;border-radius:99px;white-space:nowrap}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:#fff}
.seg button{border:0;background:transparent;padding:6px 12px;cursor:pointer;font-weight:600;font-size:14px;color:var(--muted)}
.seg button[aria-pressed=true]{background:var(--teal);color:#fff}
.hero{padding:34px 0 18px}
h1{font:700 clamp(28px,4.2vw,42px)/1.1 ui-serif,Georgia,"Times New Roman",serif;margin:0 0 12px;letter-spacing:-.5px}
.lead{max-width:760px;color:var(--muted);margin:0 0 16px}
.stats{display:flex;flex-wrap:wrap;gap:8px}
.stat{font-size:13px;background:var(--card);border:1px solid var(--line);border-radius:99px;padding:4px 12px;color:var(--muted)}
.stat b{color:var(--ink)}
.tabs{display:flex;gap:6px;margin:18px 0 16px;border-bottom:1px solid var(--line)}
.tabs button{border:0;background:transparent;padding:10px 16px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1px}
.tabs button[aria-selected=true]{color:var(--teal);border-color:var(--teal)}
form.ask{display:flex;gap:10px}
form.ask input{flex:1;min-width:0;padding:14px 16px;border:1.5px solid var(--line);border-radius:var(--r);background:#fff;font-size:17px;outline:none}
form.ask input:focus{border-color:var(--teal);box-shadow:0 0 0 3px var(--teal-soft)}
.btn{background:var(--teal);color:#fff;border:0;border-radius:var(--r);padding:0 22px;font-weight:700;cursor:pointer;min-height:50px}
.btn:disabled{opacity:.55;cursor:wait}
.exlabel{font-size:13px;color:var(--muted);margin:14px 0 8px}
.examples{display:flex;flex-wrap:wrap;gap:8px}
.ex{border:1px solid var(--line);background:#fff;border-radius:99px;padding:8px 14px;cursor:pointer;text-align:left;font-size:14.5px;line-height:1.35}
.ex:hover{border-color:var(--teal);background:var(--teal-soft)}
.ex.neg{border-style:dashed;color:var(--red)}
.ex.neg:hover{border-color:var(--red);background:var(--red-soft)}
.meta{font-size:13px;color:var(--muted);margin:10px 0 0;display:flex;gap:16px;flex-wrap:wrap}
.grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:22px;margin-top:22px;align-items:start}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px}
.card h2{font-size:13px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:0 0 10px;display:flex;justify-content:space-between;gap:10px;align-items:center}
.answer{font-size:18px;line-height:1.6}
.answer.refused{background:var(--red-soft);border-color:#ecc9c5}
.answer.refused .big{font-weight:700;font-size:20px;color:var(--red)}
.note{font-size:14px;color:var(--muted);margin-top:12px}
.warn{font-size:14px;background:var(--amber-soft);border:1px solid #f0d6b2;color:#6f4210;border-radius:9px;padding:9px 12px;margin-top:12px}
.cite{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 5px;margin:0 2px;border-radius:6px;border:0;background:var(--amber);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;vertical-align:1px}
.cite:hover{filter:brightness(.92)}
.pill{font-size:11.5px;font-weight:700;border-radius:99px;padding:2px 9px;text-transform:none;letter-spacing:0}
.pill.cache{background:var(--green-soft);color:var(--green)}
.panel h2 .hint{font-weight:400;text-transform:none;letter-spacing:0;font-size:12.5px}
.chunk{border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 10px;background:#fff;transition:box-shadow .2s,border-color .2s}
.chunk.used{border-left:4px solid var(--amber)}
.chunk.hl{border-color:var(--amber);box-shadow:0 0 0 3px var(--amber-soft)}
.chunk .top{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}
.chunk .t{font-weight:700;font-size:14.5px;line-height:1.3}
.chunk .h{font-size:13px;color:var(--muted)}
.num{flex:none;background:var(--amber);color:#fff;border-radius:6px;font-size:12px;font-weight:700;padding:1px 7px}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.b{font-size:12px;border-radius:6px;padding:2px 8px;font-weight:600;background:#eef0f1;color:#46555d}
.b.vector{background:var(--teal-soft);color:var(--teal)}
.b.fts{background:var(--amber-soft);color:var(--amber)}
.b.both{background:var(--green-soft);color:var(--green)}
.chunk p{margin:0;font-size:14px;color:#33434b;white-space:pre-wrap}
.link{border:0;background:none;color:var(--teal);font-weight:600;font-size:13px;cursor:pointer;padding:6px 0 0;text-decoration:underline;text-underline-offset:3px}
.busy{display:flex;gap:12px;align-items:center;color:var(--muted)}
.spin{width:18px;height:18px;border-radius:50%;border:3px solid var(--teal-soft);border-top-color:var(--teal);animation:sp .8s linear infinite;flex:none}
@keyframes sp{to{transform:rotate(360deg)}}
.steps{margin:10px 0 0;padding:0;list-style:none;font-size:14px;color:var(--muted)}
.steps li{padding:2px 0}
details.how{margin:28px 0 8px}
details.how summary{cursor:pointer;font-weight:700;color:var(--teal)}
details.how ol{margin:10px 0 0;padding-left:22px;color:var(--muted)}
details.how li{margin:5px 0}
.docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.doc{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;text-align:left;cursor:pointer}
.doc:hover{border-color:var(--teal)}
.doc .id{font-size:12px;color:var(--muted)}
.doc .t{font-weight:700;margin:2px 0 6px;line-height:1.3}
.doc .m{font-size:12.5px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap}
.docview .body{white-space:pre-wrap;font-size:15.5px;line-height:1.65}
.docview .body .h{font-weight:700;color:var(--teal)}
.docview mark{background:var(--amber-soft);border-bottom:2px solid var(--amber);color:inherit;border-radius:3px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 16px}
.chip{border:1px solid var(--line);background:#fff;border-radius:8px;padding:4px 10px;font-size:13px;cursor:pointer}
.chip.on{background:var(--amber-soft);border-color:var(--amber)}
footer{margin:34px 0 28px;color:var(--muted);font-size:13.5px;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}
footer a{color:var(--teal);font-weight:600}
[hidden]{display:none!important}
@media (max-width:860px){.grid{grid-template-columns:1fr}.hero{padding-top:22px}}
@media (max-width:520px){.wrap{padding:0 14px}form.ask{flex-direction:column}.btn{min-height:48px}.card{padding:15px 15px}.answer{font-size:17px}.tag{display:none}}
`;

const JS = `
var I18N = __I18N__, EXAMPLES = __EXAMPLES__, BUILT = __BUILT__;
var $ = function (s) { return document.querySelector(s); };
var lang = (new URLSearchParams(location.search).get('lang')) || localStorage.getItem('rag-lang') || (navigator.language || '').slice(0, 2);
if (lang !== 'ru') lang = 'en';
var info = null, last = null, busy = false;
function t(k) { return I18N[lang][k]; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function fmt(s, o) { return s.replace(/\\{(\\w+)\\}/g, function (_, k) { return o[k]; }); }

function applyLang() {
  document.documentElement.lang = lang;
  document.title = 'Harborline: ' + t('title');
  document.querySelectorAll('[data-t]').forEach(function (el) { el.textContent = t(el.getAttribute('data-t')); });
  $('#q').placeholder = t('placeholder');
  document.querySelectorAll('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.l === lang ? 'true' : 'false'); });
  $('#how ol').innerHTML = t('howSteps').map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
  var a = $('#built'); a.textContent = t('builtBy'); a.href = BUILT[lang];
  renderExamples(); renderStats();
  if (last) renderResult(last);
  if (docState.list) renderDocList();
  if (docState.open) openDoc(docState.open.id, docState.open.chunk, true);
}

function renderStats() {
  if (!info) return;
  $('#stats').innerHTML =
    '<span class="stat"><b>' + info.docs + '</b> ' + t('docs') + '</span>' +
    '<span class="stat"><b>' + info.chunks + '</b> ' + t('chunks') + '</span>' +
    '<span class="stat">' + t('vectors') + '</span>' +
    '<span class="stat">' + t('hybrid') + '</span>';
  $('#meta').innerHTML = '<span>' + t('left') + ': <b>' + info.ipLeft + '/' + info.per_ip_hourly + '</b></span><span>' + t('day') + ': <b>' + info.dayLeft + '/' + info.daily_cap + '</b></span>';
}

function renderExamples() {
  $('#examples').innerHTML = EXAMPLES.map(function (e, i) {
    var neg = i === EXAMPLES.length - 1;
    return '<button type="button" class="ex' + (neg ? ' neg' : '') + '" data-q="' + esc(e[lang]) + '">' + esc(e[lang]) + (neg ? ' <small>(' + esc(t('notInBase')) + ')</small>' : '') + '</button>';
  }).join('');
}

function showBusy() {
  var steps = [t('step1'), t('step2'), t('step3'), t('step4')];
  $('#result').hidden = false;
  $('#answerCol').innerHTML = '<div class="card"><div class="busy"><span class="spin"></span><b>' + esc(t('searching')) + '</b></div><ul class="steps" id="steps">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>';
  $('#panel').innerHTML = '';
}

function ask(q) {
  q = (q || '').trim();
  if (busy) return;
  if (q.length < 3) { $('#q').focus(); return; }
  busy = true; $('#go').disabled = true; $('#q').value = q;
  showBusy();
  fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
    .then(function (x) {
      if (!x.ok) throw new Error('bad');
      last = x.j;
      if (x.j.limits) { info.ipLeft = x.j.limits.ipLeft; info.dayLeft = x.j.limits.dayLeft; renderStats(); }
      renderResult(x.j);
      if (window.innerWidth < 860) $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
    .catch(function () { $('#answerCol').innerHTML = '<div class="card"><div class="warn">' + esc(t('error')) + '</div></div>'; })
    .then(function () { busy = false; $('#go').disabled = false; });
}

function answerHtml(text) {
  return esc(text).replace(/\\[(\\d+)\\]/g, '<button type="button" class="cite" data-n="$1" aria-label="source $1">$1</button>');
}

function renderResult(r) {
  $('#result').hidden = false;
  var h = '';
  if (r.mode === 'search_only') {
    var msg = r.reason === 'ip' ? fmt(t('reasonIp'), { n: info.per_ip_hourly }) : r.reason === 'global' ? t('reasonGlobal') : t('reasonError');
    h = '<div class="card"><h2>' + esc(t('answer')) + '</h2><div class="warn"><b>' + esc(t('searchOnly')) + '</b><br>' + esc(msg) + '</div></div>';
  } else if (r.refused) {
    var why = r.reason === 'weak_retrieval' ? fmt(t('refusedWeak'), { score: (r.best_vector || 0).toFixed(2), min: Number(r.min_vector).toFixed(2) }) : t('refusedModel');
    h = '<div class="card answer refused"><h2>' + esc(t('answer')) + (r.cached ? '<span class="pill cache">' + esc(t('cached')) + '</span>' : '') + '</h2><div class="big">' + esc(r.answer) + '</div><div class="note">' + esc(why) + '</div></div>';
  } else {
    h = '<div class="card answer"><h2>' + esc(t('answer')) + (r.cached ? '<span class="pill cache">' + esc(t('cached')) + '</span>' : '') + '</h2><div>' + answerHtml(r.answer) + '</div>' + (r.uncited ? '<div class="warn">' + esc(t('uncited')) + '</div>' : '') + '</div>';
  }
  $('#answerCol').innerHTML = h;
  renderPanel(r);
}

function renderPanel(r) {
  var used = {};
  (r.cited || []).forEach(function (n) { used[n] = 1; });
  var h = '<div class="card panel"><h2>' + esc(t('retrieved')) + '</h2><div class="note" style="margin:-4px 0 12px">' + esc(t('retrievedHint')) + '</div>';
  r.sources.forEach(function (s, i) {
    var badges = '<span class="b ' + s.found_by + '">' + esc(t('found')[s.found_by]) + '</span>';
    if (s.vector_score !== null) badges += '<span class="b">' + t('cosine') + ' ' + s.vector_score.toFixed(3) + ' (#' + s.vector_rank + ')</span>';
    if (s.fts_rank !== null) badges += '<span class="b">BM25 #' + s.fts_rank + '</span>';
    badges += '<span class="b">' + t('rrf') + ' ' + s.rrf.toFixed(4) + '</span>';
    h += '<article class="chunk' + (s.n && used[s.n] ? ' used' : '') + '" id="chunk-' + (s.n || 'x' + i) + '" data-id="' + esc(s.id) + '">' +
      '<div class="top"><div><div class="t">' + esc(s.title) + '</div><div class="h">' + esc(s.heading) + ' &middot; ' + esc(s.id) + '</div></div>' +
      (s.n ? '<span class="num" title="' + esc(t('inPrompt')) + '">[' + s.n + ']</span>' : '<span class="b">' + t('rank') + ' ' + (i + 1) + '</span>') + '</div>' +
      '<div class="badges">' + badges + '</div><p>' + esc(s.text) + '</p>' +
      '<button type="button" class="link" data-doc="' + esc(s.doc_id) + '" data-chunk="' + esc(s.id) + '">' + esc(t('openDoc')) + '</button></article>';
  });
  $('#panel').innerHTML = h + '</div>';
}

function highlight(n) {
  var el = document.getElementById('chunk-' + n);
  if (!el) return;
  document.querySelectorAll('.chunk.hl').forEach(function (x) { x.classList.remove('hl'); });
  el.classList.add('hl');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(function () { el.classList.remove('hl'); }, 2600);
}

/* Documents view */
var docState = { list: null, open: null };
function showTab(name) {
  $('#askView').hidden = name !== 'ask'; $('#docsView').hidden = name !== 'docs';
  $('#tabAsk').setAttribute('aria-selected', name === 'ask'); $('#tabDocs').setAttribute('aria-selected', name === 'docs');
  if (name === 'docs' && !docState.list) loadDocs();
  if (name === 'docs' && !docState.open) { $('#docList').hidden = false; $('#docOne').hidden = true; }
}
function loadDocs() {
  $('#docList').innerHTML = '<p class="note">' + esc(t('loading')) + '</p>';
  fetch('/api/docs').then(function (r) { return r.json(); }).then(function (j) { docState.list = j.docs; renderDocList(); });
}
function renderDocList() {
  $('#docList').innerHTML = '<div class="docs">' + docState.list.map(function (d) {
    return '<button type="button" class="doc" data-open="' + d.id + '"><div class="id">' + d.id + ' &middot; ' + esc(d.category) + '</div><div class="t">' + esc(d.title) + '</div><div class="m"><span>' + esc(t('docLang')[d.lang]) + '</span><span>' + d.chunks + ' ' + esc(t('chunks')) + '</span><span>' + d.chars + ' chars</span></div></button>';
  }).join('') + '</div>';
}
function openDoc(id, chunkId, keepTab) {
  if (!keepTab) showTab('docs');
  fetch('/api/docs/' + id).then(function (r) { return r.json(); }).then(function (d) {
    docState.open = { id: id, chunk: chunkId || null };
    var cur = d.chunks.filter(function (c) { return c.id === chunkId; })[0];
    var body = d.body;
    if (cur) body = body.slice(0, cur.start) + '\\u0001' + body.slice(cur.start, cur.end) + '\\u0002' + body.slice(cur.end);
    var html = esc(body).replace(/^## (.*)$/gm, '<span class="h">$1</span>').replace(/\\u0001/g, '<mark id="mk">').replace(/\\u0002/g, '</mark>');
    $('#docList').hidden = true; $('#docOne').hidden = false;
    $('#docOne').innerHTML = '<button type="button" class="link" id="docBack">&larr; ' + esc(t('back')) + '</button>' +
      '<div class="card docview" style="margin-top:8px"><h2><span>' + esc(d.id) + ' &middot; ' + esc(d.category) + '</span></h2><div style="font:700 24px/1.2 ui-serif,Georgia,serif;margin:0 0 10px">' + esc(d.title) + '</div>' +
      '<div class="note" style="margin:0 0 6px">' + esc(t('chunksOf')) + '</div><div class="chips">' +
      d.chunks.map(function (c) { return '<button type="button" class="chip' + (c.id === chunkId ? ' on' : '') + '" data-doc="' + d.id + '" data-chunk="' + c.id + '">#' + c.idx + ' &middot; ' + esc(c.heading) + '</button>'; }).join('') +
      '</div><div class="body">' + html + '</div></div>';
    var mk = document.getElementById('mk'); if (mk) mk.scrollIntoView({ block: 'center' });
  });
}

document.addEventListener('click', function (e) {
  var el = e.target.closest('button'); if (!el) return;
  if (el.classList.contains('cite')) return highlight(el.dataset.n);
  if (el.classList.contains('ex')) return ask(el.dataset.q);
  if (el.dataset.l) { lang = el.dataset.l; localStorage.setItem('rag-lang', lang); return applyLang(); }
  if (el.dataset.open) return openDoc(el.dataset.open, null);
  if (el.dataset.doc) return openDoc(el.dataset.doc, el.dataset.chunk);
  if (el.id === 'docBack') { docState.open = null; $('#docOne').hidden = true; $('#docList').hidden = false; }
  if (el.id === 'tabAsk') showTab('ask');
  if (el.id === 'tabDocs') showTab('docs');
});
$('#form').addEventListener('submit', function (e) { e.preventDefault(); ask($('#q').value); });

fetch('/api/status').then(function (r) { return r.json(); }).then(function (s) { info = s; applyLang(); });
applyLang();
`;

export function page({ examples }) {
  const js = JS.replace('__I18N__', () => JSON.stringify(I18N)).replace('__EXAMPLES__', () => JSON.stringify(examples)).replace('__BUILT__', () => JSON.stringify(BUILT_BY));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Harborline: ask the knowledge base (RAG demo)</title>
<meta name="description" content="RAG demo: hybrid vector and full-text search over a fictional company knowledge base, answers with numbered citations.">
<style>${CSS}</style>
</head>
<body>
<header class="top"><div class="wrap">
  <div class="brand"><span class="logo">H</span><span>Harborline</span><span class="tag" data-t="fictional">Fictional company. Demo data.</span></div>
  <div class="seg" role="group" aria-label="Language"><button type="button" data-l="en" aria-pressed="true">EN</button><button type="button" data-l="ru" aria-pressed="false">RU</button></div>
</div></header>
<div class="wrap">
  <section class="hero">
    <h1 data-t="title">Ask the knowledge base</h1>
    <p class="lead" data-t="lead"></p>
    <div class="stats" id="stats"></div>
  </section>
  <div class="tabs" role="tablist"><button type="button" role="tab" id="tabAsk" aria-selected="true" data-t="tabAsk">Ask</button><button type="button" role="tab" id="tabDocs" aria-selected="false" data-t="tabDocs">Documents</button></div>

  <main id="askView">
    <form class="ask" id="form" autocomplete="off"><input id="q" type="text" maxlength="300" aria-label="Question"><button class="btn" id="go" type="submit" data-t="ask">Ask</button></form>
    <div class="exlabel" data-t="examples"></div>
    <div class="examples" id="examples"></div>
    <div class="meta" id="meta"></div>
    <div class="grid" id="result" hidden><div id="answerCol"></div><aside id="panel"></aside></div>
    <details class="how" id="how"><summary data-t="how">How it works</summary><ol></ol></details>
  </main>

  <main id="docsView" hidden>
    <h2 style="font:700 26px/1.2 ui-serif,Georgia,serif;margin:0 0 6px" data-t="docsTitle"></h2>
    <p class="lead" data-t="docsLead"></p>
    <div id="docList"></div>
    <div id="docOne" hidden></div>
  </main>

  <footer><span><a id="built" href="${BUILT_BY.en}" target="_blank" rel="noopener">Built by Ilshat</a> &middot; Telegram @shov69</span><span>Cloudflare Workers, D1 + FTS5, Vectorize, Workers AI</span></footer>
</div>
<script>${js}</script>
</body>
</html>`;
}
