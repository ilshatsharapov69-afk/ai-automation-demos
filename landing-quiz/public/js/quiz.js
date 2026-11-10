// Quiz controller: one step at a time, live summary, estimate, lead form -> POST /api/lead.
// The steps are rendered into the HTML at build time (accessible radios/checkboxes); this file only drives them.
import { STEPS, STEP, CURRENCY, estimate, formatMoney, formatRange, formatWeeks, label } from './quiz-model.js';

const form = document.getElementById('quiz');
const head = document.querySelector('.site-head');
if (head) {
  const onScroll = () => head.classList.toggle('scrolled', window.scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Remember ad tags (utm_*) from the landing URL for this visit, so they reach the owner with the lead.
const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term'];
function readUtm() {
  const q = new URLSearchParams(location.search);
  const fromUrl = Object.fromEntries(UTM_KEYS.map((k) => [k, q.get(`utm_${k}`)]).filter(([, v]) => v));
  try {
    if (Object.keys(fromUrl).length) sessionStorage.setItem('utm', JSON.stringify(fromUrl));
    return JSON.parse(sessionStorage.getItem('utm') || '{}');
  } catch {
    return fromUrl;
  }
}
const utm = readUtm();

if (form) initQuiz(form);

function initQuiz(form) {
  const lang = form.dataset.lang === 'ru' ? 'ru' : 'en';
  const u = JSON.parse(document.getElementById('quiz-ui').textContent);
  const cur = CURRENCY[lang];
  const total = STEPS.length;
  const sections = [...form.querySelectorAll('.step')];
  const $ = (sel, root = form) => root.querySelector(sel);
  const out = (name) => document.querySelector(`[data-out="${name}"]`);
  const btnNext = $('[data-act=next]');
  const btnBack = $('[data-act=back]');
  const hint = $('.nav-hint');
  const count = $('.quiz-count');
  const bar = $('.bar i');
  const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

  const answers = { property: null, area: STEP.area.default, scope: null, extras: [], start: null };
  let idx = 0;
  let areaTouched = false;
  let sending = false;

  // ---------- navigation ----------
  function show(i, { focus = true } = {}) {
    idx = i;
    sections.forEach((s, k) => { s.hidden = k !== i; });
    const atResult = i === total;
    const atDone = i === total + 1;
    form.classList.toggle('at-result', atResult);
    form.classList.toggle('at-done', atDone);
    btnBack.hidden = i === 0 || atDone;
    count.textContent = i < total ? fill(u.step, { n: i + 1, total }) : u.resultStep;
    bar.style.width = `${(Math.min(i, total) + 1) / (total + 1) * 100}%`;
    hint.textContent = '';
    updateNext();
    if (atResult) renderResult();
    if (focus) {
      // Never auto-focus a text field: on phones that pops up the keyboard. Radios, the slider or the section itself.
      const kind = STEPS[i] && STEPS[i].kind;
      const target = kind === 'range' ? sections[i].querySelector('.area-range')
        : kind ? sections[i].querySelector('input:checked') || sections[i].querySelector('input')
          : sections[i];
      if (target) target.focus({ preventScroll: true });
      const top = form.getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * 0.5) form.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  }
  function stepDone(i) {
    const s = STEPS[i];
    if (!s) return true;
    if (s.kind === 'single') return !!answers[s.id];
    return true; // range always has a value, extras are optional
  }
  function updateNext() {
    const s = STEPS[idx];
    if (!s) return;
    const last = idx === total - 1;
    const text = s.kind === 'multi' && !answers.extras.length ? u.skip : last ? u.seeResult : u.next;
    btnNext.firstChild.nodeValue = `${text} `;
  }
  btnNext.addEventListener('click', () => {
    if (!stepDone(idx)) { hint.textContent = u.pick; return; }
    show(idx + 1);
  });
  btnBack.addEventListener('click', () => show(Math.max(0, idx - 1)));
  $('[data-act=again]').addEventListener('click', () => {
    form.querySelector('[name=comment]').value = '';
    show(0);
  });

  // ---------- answers ----------
  let advanceTimer;
  form.addEventListener('change', (ev) => {
    const el = ev.target;
    const s = STEP[el.name];
    if (!s) return;
    if (s.kind === 'single') {
      answers[s.id] = el.value;
      updateSummary();
      clearTimeout(advanceTimer);
      // Auto-advance after a single choice (a short pause so the tick is visible).
      if (STEPS[idx] && STEPS[idx].id === s.id) advanceTimer = setTimeout(() => show(idx + 1), 260);
    } else if (s.kind === 'multi') {
      answers.extras = [...form.querySelectorAll(`[name=${s.id}]:checked`)].map((x) => x.value);
      updateSummary();
      updateNext();
    }
  });

  // area: slider, the big number (an input) and presets stay in sync
  const range = $('.area-range');
  const num = $('.area-input');
  const presets = [...form.querySelectorAll('[data-area]')];
  // The box hugs the digits: CSS field-sizing where supported, otherwise an estimate in ch.
  const fieldSizing = window.CSS && CSS.supports && CSS.supports('field-sizing', 'content');
  const sizeNum = () => { if (!fieldSizing) num.style.width = `${Math.max(2, String(num.value).length) * 0.92 + 0.2}ch`; };
  function setArea(v, from) {
    const s = STEP.area;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return;
    const c = Math.min(s.max, Math.max(s.min, n));
    answers.area = c;
    areaTouched = true;
    if (from !== 'range') range.value = c;
    if (from !== 'num') num.value = c; // while typing, keep what the user typed (e.g. "1" on the way to "120")
    sizeNum();
    range.style.setProperty('--p', `${(c - s.min) / (s.max - s.min) * 100}%`);
    presets.forEach((b) => b.classList.toggle('on', Number(b.dataset.area) === c));
    updateSummary();
  }
  range.addEventListener('input', () => setArea(range.value, 'range'));
  num.addEventListener('input', () => { sizeNum(); if (num.value !== '' && Number(num.value) >= STEP.area.min) setArea(num.value, 'num'); });
  num.addEventListener('blur', () => setArea(num.value || answers.area));
  // The first tap selects the whole number, so typing replaces it instead of landing in the middle of "55".
  num.addEventListener('mousedown', (e) => {
    if (document.activeElement === num) return; // already editing: place the caret normally
    e.preventDefault();
    num.focus();
    num.select();
  });
  num.addEventListener('focus', () => num.select()); // keyboard (Tab) and taps on the unit or pencil
  presets.forEach((b) => b.addEventListener('click', () => setArea(b.dataset.area)));
  setArea(STEP.area.default);
  areaTouched = false;

  // Enter in the quiz steps means "next", not "submit the form"
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && idx < total && e.target.tagName === 'INPUT') {
      e.preventDefault();
      if (e.target === num) setArea(num.value || answers.area);
      btnNext.click();
    }
  });

  // Price cards: "Calculate for my area" preselects the renovation level.
  document.querySelectorAll('[data-preset-scope]').forEach((a) => a.addEventListener('click', () => {
    const r = form.querySelector(`[name=scope][value="${a.dataset.presetScope}"]`);
    if (r) { r.checked = true; answers.scope = r.value; updateSummary(); }
  }));

  // ---------- summary + estimate ----------
  function canEstimate() { return answers.property && answers.scope && answers.area; }
  function updateSummary() {
    const list = out('summary');
    const items = [];
    for (const s of STEPS) {
      let v = null;
      if (s.kind === 'single' && answers[s.id]) v = label(s.id, answers[s.id], lang);
      if (s.kind === 'range' && (areaTouched || answers.property)) v = `${answers.area} ${s.unit[lang]}`;
      if (s.kind === 'multi' && answers.extras.length) v = answers.extras.map((x) => label('extras', x, lang)).join(', ');
      if (v) items.push(`<li><div><span>${esc(s.title[lang])}</span>${esc(v)}</div></li>`);
    }
    list.innerHTML = items.length ? items.join('') : `<li class="side-empty">${esc(u.summaryEmpty)}</li>`;
    const live = out('live');
    if (canEstimate()) {
      const e = estimate(answers, cur);
      live.classList.add('has');
      live.innerHTML = `${rangeHtml(e)}<small>${esc(u.duration)}: ${esc(formatWeeks(e, lang))}</small>`;
    } else {
      live.classList.remove('has');
      live.textContent = u.livePriceSoon;
    }
  }
  // "1 030 000 ₽ – 1 280 000 ₽": the line may break after the dash, never inside an amount
  const rangeHtml = (e) => `<span class="nw">${esc(formatMoney(e.min, e.currency, lang))} –</span> <span class="nw">${esc(formatMoney(e.max, e.currency, lang))}</span>`;
  function renderResult() {
    if (!canEstimate()) return;
    const e = estimate(answers, cur);
    out('range').innerHTML = rangeHtml(e);
    out('weeks').textContent = formatWeeks(e, lang);
    out('breakdown').innerHTML = e.breakdown.map((b) => {
      const name = b.id === 'base' ? `${esc(u.breakdown.base)}: ${esc(label('scope', answers.scope, lang))}, <span class="nw">${answers.area} ${esc(u.breakdown.area)}</span>` : esc(label('extras', b.id, lang));
      return `<li><span>${name}</span><b>${esc(formatMoney(b.amount, cur, lang))}</b></li>`;
    }).join('');
  }

  // ---------- lead form ----------
  const fields = { name: $('[name=name]'), phone: $('[name=phone]'), comment: $('[name=comment]'), consent: $('[name=consent]') };
  const formErr = $('.form-err');
  function setErr(name, code) {
    const el = fields[name];
    const box = document.getElementById(`e-${name}`);
    if (el) el.setAttribute('aria-invalid', code ? 'true' : 'false');
    if (box) box.textContent = code ? u.errors[code] || u.errors.invalid : '';
  }
  for (const [name, el] of Object.entries(fields)) el.addEventListener('input', () => setErr(name, null));

  function clientCheck(d) {
    const e = {};
    if (!d.name) e.name = 'required';
    else if (d.name.length < 2 || !/^[\p{L}][\p{L}\p{M} .'’-]*$/u.test(d.name)) e.name = 'name_invalid';
    const digits = d.phone.replace(/\D/g, '');
    if (!d.phone) e.phone = 'required';
    else if (!/^\+?[\d\s().-]+$/.test(d.phone) || digits.length < 7 || digits.length > 15) e.phone = 'phone_invalid';
    if (d.comment.length > 500) e.comment = 'too_long';
    if (!d.consent) e.consent = 'consent_required';
    return e;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (idx !== total || sending) return;
    const data = {
      lang,
      answers: { ...answers },
      name: fields.name.value.trim(),
      phone: fields.phone.value.trim(),
      contact: (form.querySelector('[name=contact]:checked') || {}).value || 'call',
      comment: fields.comment.value.trim(),
      consent: fields.consent.checked,
      website: form.querySelector('[name=website]').value,
      utm,
      page: location.pathname,
    };
    formErr.hidden = true;
    const errs = clientCheck(data);
    ['name', 'phone', 'comment', 'consent'].forEach((k) => setErr(k, errs[k]));
    const first = Object.keys(errs)[0];
    if (first) { fields[first].focus(); return; }

    const btn = form.querySelector('[type=submit]');
    const btnHtml = btn.innerHTML;
    sending = true;
    btn.disabled = true;
    btn.textContent = u.sending;
    try {
      const r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        const e = j.estimate || estimate(answers, cur);
        out('doneTitle').textContent = fill(u.doneTitle, { name: data.name });
        out('doneText').textContent = fill(u.doneText, { id: j.id ?? '-' });
        out('doneEst').textContent = `${formatRange(e, lang)} · ${formatWeeks(e, lang)}`;
        // Demo: no Telegram bot is connected, so the server returns the card the owner would get. Its HTML is built by the
        // server from escaped values and only contains <b> tags.
        const cardBox = out('card');
        if (j.card && cardBox) {
          out('cardText').innerHTML = j.card.html;
          out('cardBtn').textContent = j.card.button || '';
          cardBox.hidden = false;
        } else if (cardBox) cardBox.hidden = true;
        show(total + 1);
        try { window.dataLayer && window.dataLayer.push({ event: 'lead', lead_id: j.id }); } catch {}
      } else if (r.status === 422 && j.errors) {
        const stepErr = STEPS.findIndex((s) => j.errors[s.id]);
        if (stepErr >= 0) { show(stepErr); hint.textContent = u.errors.invalid; return; }
        ['name', 'phone', 'comment', 'consent'].forEach((k) => setErr(k, j.errors[k]));
        const f = ['name', 'phone', 'comment', 'consent'].find((k) => j.errors[k]);
        if (f) fields[f].focus();
        else showFormErr(u.errors.server);
      } else {
        showFormErr(r.status === 429 ? (j.error === 'demo_full' ? u.errors.demo_full : u.errors.rate_limited) : u.errors.server);
      }
    } catch {
      showFormErr(u.errors.network);
    } finally {
      sending = false;
      btn.disabled = false;
      btn.innerHTML = btnHtml;
    }
  });
  function showFormErr(t) { formErr.textContent = t; formErr.hidden = false; }

  show(0, { focus: false });
  updateSummary();
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
