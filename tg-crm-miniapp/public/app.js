// Telegram Mini App CRM front end. Plain JS, no build step. Talks to /api/*: with `Authorization: tma <initData>` inside Telegram, with a sandbox cookie in a plain browser.
(() => {
  'use strict';
  const tg = window.Telegram && window.Telegram.WebApp;
  const $ = (s, el = document) => el.querySelector(s);
  const view = $('#view');

  const I18N = {
    en: {
      sub: 'Sales CRM', demo: 'demo', tabLeads: 'Leads', tabReminders: 'Reminders', tabStats: 'Stats',
      search: 'Search name, company, phone', all: 'All', open: 'Open', overdue: 'Overdue',
      everyone: 'Team', mine: 'Mine', unassigned: 'No owner', noLeads: 'No leads match these filters.',
      pipeline: 'pipeline', back: 'Back', call: 'Call', email: 'E-mail', copy: 'Copy',
      status: 'Status', details: 'Details', owner: 'Owner', value: 'Deal size', source: 'Source', phone: 'Phone',
      created: 'Created', reminders: 'Reminders', addReminder: 'Add reminder', remText: 'What to do, e.g. call back',
      in1h: 'In 1 hour', tomorrow: 'Tomorrow 10:00', in3d: 'In 3 days', nextMon: 'Monday 10:00',
      timeline: 'Notes & history', addNote: 'Add note', notePh: 'Call summary, next step…', noReminders: 'No open reminders.',
      ev_created: 'Lead created', ev_status: 'Status', ev_owner: 'Owner', ev_ownerNone: 'Owner removed', you: 'you',
      newLead: 'New lead', name: 'Contact name', company: 'Company', note: 'First note', save: 'Save lead', required: 'Name is required',
      today: 'Today', yesterday: 'Yesterday', tomorrowW: 'Tomorrow', upcoming: 'Upcoming', nothingDue: 'Nothing due. Nice!',
      sendDigest: 'Send me today\'s digest', digestSent: 'Digest sent to your chat with the bot', digestPreview: 'Digest (could not send: open the bot once and press Start)',
      kOpen: 'Open pipeline', kWon: 'Won, 30 days', kRate: 'Win rate, 90 days', kAvg: 'Average deal', leadsN: (n) => `${n} leads`, dealsN: (n) => `${n} deals`,
      closed: 'won vs lost', funnel: 'Pipeline by status', weekly: 'New leads per week', sources: 'Lead sources', team: 'Team',
      thOpen: 'Open', thWon: 'Won 30d', wk: (d) => d, wonN: (n) => `${n} won`, saved: 'Saved', err: 'Something went wrong',
      banner: 'Demo in the browser. In Telegram this opens as a Mini App inside the chat.', previewDigest: 'Preview the morning digest', digestOwner: 'The owner gets this message in Telegram every morning', resetDemo: 'Reset demo data', resetDone: 'Demo data restored', fictional: 'Fictional company and data. Demo built on Cloudflare Workers + D1.',
      ago: { now: 'just now', m: (n) => `${n} min ago`, h: (n) => `${n} h ago`, d: (n) => `${n} d ago` },
    },
    ru: {
      sub: 'CRM отдела продаж', demo: 'демо', tabLeads: 'Лиды', tabReminders: 'Напоминания', tabStats: 'Статистика',
      search: 'Поиск: имя, компания, телефон', all: 'Все', open: 'Открытые', overdue: 'Просрочено',
      everyone: 'Команда', mine: 'Мои', unassigned: 'Без ответств.', noLeads: 'Под эти фильтры лидов нет.',
      pipeline: 'в воронке', back: 'Назад', call: 'Позвонить', email: 'Почта', copy: 'Копировать',
      status: 'Статус', details: 'Данные', owner: 'Ответственный', value: 'Сумма сделки', source: 'Источник', phone: 'Телефон',
      created: 'Создан', reminders: 'Напоминания', addReminder: 'Добавить напоминание', remText: 'Что сделать, например перезвонить',
      in1h: 'Через час', tomorrow: 'Завтра 10:00', in3d: 'Через 3 дня', nextMon: 'Пн 10:00',
      timeline: 'Заметки и история', addNote: 'Добавить заметку', notePh: 'Итог звонка, следующий шаг…', noReminders: 'Открытых напоминаний нет.',
      ev_created: 'Лид создан', ev_status: 'Статус', ev_owner: 'Ответственный', ev_ownerNone: 'Ответственный снят', you: 'вы',
      newLead: 'Новый лид', name: 'Имя контакта', company: 'Компания', note: 'Первая заметка', save: 'Сохранить лида', required: 'Укажите имя',
      today: 'Сегодня', yesterday: 'Вчера', tomorrowW: 'Завтра', upcoming: 'Позже', nothingDue: 'Ничего не горит. Отлично!',
      sendDigest: 'Прислать сводку за сегодня', digestSent: 'Сводка отправлена в чат с ботом', digestPreview: 'Сводка (не отправлена: откройте бота и нажмите Start)',
      kOpen: 'Открытая воронка', kWon: 'Выиграно за 30 дней', kRate: 'Конверсия, 90 дней', kAvg: 'Средняя сделка', leadsN: (n) => `${n} лидов`, dealsN: (n) => `${n} сделок`,
      closed: 'выигрыши к проигрышам', funnel: 'Воронка по статусам', weekly: 'Новые лиды по неделям', sources: 'Источники лидов', team: 'Команда',
      thOpen: 'Открыто', thWon: 'Выигр. 30д', wk: (d) => d, wonN: (n) => `выигр. ${n}`, saved: 'Сохранено', err: 'Что-то пошло не так',
      banner: 'Демо в браузере. В Telegram это же открывается как мини-приложение прямо в чате.', previewDigest: 'Показать сводку за сегодня', digestOwner: 'Такое сообщение владелец получает в Telegram каждое утро', resetDemo: 'Сбросить демо-данные', resetDone: 'Демо-данные восстановлены', fictional: 'Компания и данные вымышлены. Демо на Cloudflare Workers + D1.',
      ago: { now: 'только что', m: (n) => `${n} мин назад`, h: (n) => `${n} ч назад`, d: (n) => `${n} дн назад` },
    },
  };
  const STATUS = {
    en: { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' },
    ru: { new: 'Новый', contacted: 'Связались', qualified: 'Квалифицирован', proposal: 'КП отправлено', won: 'Выигран', lost: 'Проигран' },
  };
  const SOURCE = {
    en: { telegram: 'Telegram', website: 'Website', referral: 'Referral', call: 'Phone call', event: 'Expo / event' },
    ru: { telegram: 'Telegram', website: 'Сайт', referral: 'Рекомендация', call: 'Звонок', event: 'Выставка' },
  };
  const AV_COLORS = ['#2f7de1', '#d9622b', '#1f9d74', '#9b51e0', '#c2417a', '#3d8a9e'];
  const ICON = {
    search: '<svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 0 1 5.6 11.2l4.6 4.6-1.4 1.4-4.6-4.6A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm1 5h-2v6l5 3 1-1.7-4-2.3Z"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1Z"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 7 8-5H4Zm0 2L4 9v8h16V9Z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><path d="M8 7V3h13v13h-4v4H4V7Zm2 0h7v7h2V5h-9ZM6 9v9h9V9Z"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M4 4h16v12l-4 4H4Zm11 15v-4h4"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M5 3h2v18H5Zm3 1h11l-2.5 4L19 12H8Z"/></svg>',
    user: '<svg viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-9 2-9 5v2h18v-2c0-3-5-5-9-5Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7Z"/></svg>',
  };

  const S = { lang: 'en', me: null, team: [], currency: 'USD', demo: true, filters: { status: 'open', owner: 'all', q: '' }, remScope: 'mine', initData: '' };
  const T = () => I18N[S.lang];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const loc = () => (S.lang === 'ru' ? 'ru-RU' : 'en-US');
  const money = (v, compact) => {
    try {
      return new Intl.NumberFormat(loc(), { style: 'currency', currency: S.currency, maximumFractionDigits: compact && v >= 10000 ? 1 : 0, notation: compact && v >= 10000 ? 'compact' : 'standard' }).format(v || 0);
    } catch { return `${v} ${S.currency}`; }
  };
  const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const avatar = (id, name, cls = '') => (id ? `<span class="av ${cls}" style="background:${AV_COLORS[id % AV_COLORS.length]}" title="${esc(name)}">${esc(initials(name))}</span>` : `<span class="av none ${cls}">–</span>`);
  const pill = (s) => `<span class="pill" style="--c:var(--s-${s})">${esc(STATUS[S.lang][s])}</span>`;
  const haptic = (kind = 'light') => { try { tg && tg.HapticFeedback && (kind === 'ok' ? tg.HapticFeedback.notificationOccurred('success') : tg.HapticFeedback.impactOccurred(kind)); } catch {} };

  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  function dayWord(d) {
    const now = new Date();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    const t = new Date(now); t.setDate(now.getDate() + 1);
    if (sameDay(d, now)) return T().today;
    if (sameDay(d, y)) return T().yesterday;
    if (sameDay(d, t)) return T().tomorrowW;
    return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
  }
  const hm = (d) => d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit', hour12: false });
  const when = (iso) => { const d = new Date(iso); return `${dayWord(d)}, ${hm(d)}`; };
  function ago(iso) {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    const a = T().ago;
    if (m < 2) return a.now;
    if (m < 60) return a.m(m);
    if (m < 60 * 24) return a.h(Math.round(m / 60));
    if (m < 60 * 24 * 14) return a.d(Math.round(m / 1440));
    return new Date(iso).toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
  }

  let toastTimer;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(S.initData ? { Authorization: `tma ${S.initData}` } : {}) },
      credentials: 'same-origin',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    return data;
  }

  function applyStatic() {
    document.documentElement.lang = S.lang;
    $('#lang-btn').textContent = S.lang === 'ru' ? 'EN' : 'RU';
    $('#ws-sub').innerHTML = `${esc(T().sub)}${S.demo ? ` <span class="demo">${esc(T().demo)}</span>` : ''}`;
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = T()[el.dataset.t]; });
    const banner = $('#banner');
    banner.hidden = !S.browser;
    banner.textContent = T().banner;
  }

  const resetLink = () => (S.demo ? ` <button class="linkbtn" data-reset type="button">${esc(T().resetDemo)}</button>` : '');
  function bindReset() {
    document.querySelectorAll('[data-reset]').forEach((b) => {
      b.onclick = async () => {
        try { await api('/api/reset', { method: 'POST' }); toast(T().resetDone); route(); refreshBadge(); } catch (e) { toast(e.message); }
      };
    });
  }

  function setTab(name) {
    $('#tabs').hidden = !name;
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
  }

  function showBack(on) {
    if (!tg || !tg.BackButton) return;
    if (on) tg.BackButton.show(); else tg.BackButton.hide();
  }

  // ---------- leads list ----------
  async function renderLeads() {
    setTab('leads');
    showBack(false);
    const f = S.filters;
    const qs = new URLSearchParams({ status: f.status, ...(f.owner !== 'all' ? { owner: f.owner } : {}), ...(f.q ? { q: f.q } : {}) });
    const data = await api(`/api/leads?${qs}`);
    const c = data.counts;
    const chips = [['open', T().open], ['all', T().all], ...['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'].map((s) => [s, STATUS[S.lang][s]]), ['overdue', T().overdue]];
    const total = data.leads.filter((l) => !['won', 'lost'].includes(l.status)).reduce((n, l) => n + l.value, 0);
    view.innerHTML = `
      <div class="search">${ICON.search}<input id="q" type="search" placeholder="${esc(T().search)}" value="${esc(f.q)}" autocomplete="off"></div>
      <div class="chips" id="chips">${chips.map(([k, label]) => `<button class="chip ${f.status === k ? 'on' : ''} ${k === 'overdue' && c.overdue ? 'warn' : ''}" data-s="${k}">${esc(label)}<b>${c[k] ?? 0}</b></button>`).join('')}</div>
      <div class="row-tools">
        <div class="seg" id="owner-seg">${[['all', T().everyone], ['me', T().mine], ['none', T().unassigned]].map(([k, l]) => `<button data-o="${k}" class="${f.owner === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
        <div class="grow"></div>
        <div class="summary"><b>${esc(money(total, true))}</b> ${esc(T().pipeline)}</div>
      </div>
      ${data.leads.length ? `<div class="list">${data.leads.map(leadRow).join('')}</div>` : `<div class="list"><div class="empty">${esc(T().noLeads)}</div></div>`}
      <p class="footnote">${esc(S.demo ? T().fictional : '')}${resetLink()}</p>
      <button class="fab" id="fab" aria-label="${esc(T().newLead)}">${ICON.plus.replace('<svg', '<svg width="26" height="26" fill="currentColor"')}</button>`;
    bindReset();
    $('#chips').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { f.status = b.dataset.s; haptic(); renderLeads(); } };
    $('#owner-seg').onclick = (e) => { const b = e.target.closest('[data-o]'); if (b) { f.owner = b.dataset.o; haptic(); renderLeads(); } };
    let qTimer;
    $('#q').oninput = (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { f.q = e.target.value.trim(); renderLeads().then(() => { const i = $('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250); };
    $('#fab').onclick = () => { location.hash = '#/new'; };
  }

  function leadRow(l) {
    const late = l.next_due && l.next_due < new Date().toISOString();
    return `<a class="lead" href="#/lead/${l.id}">
      ${avatar(l.owner_id, l.owner_name)}
      <div class="lead-main">
        <div class="lead-top"><span class="lead-name">${esc(l.company || l.name)}</span><span class="lead-value">${esc(money(l.value))}</span></div>
        <div class="lead-sub"><span class="co">${esc(l.company ? l.name : l.phone || '')}</span><span>${esc(ago(l.updated_at))}</span></div>
        <div class="meta">${pill(l.status)}${l.next_due ? `<span class="due ${late ? 'late' : ''}">${ICON.clock}${esc(when(l.next_due))}</span>` : ''}</div>
      </div></a>`;
  }

  // ---------- lead card ----------
  async function renderLead(id) {
    setTab(null);
    showBack(true);
    const data = await api(`/api/leads/${id}`);
    const l = data.lead;
    const ownerOpts = [`<option value="">${esc(T().unassigned)}</option>`, ...S.team.map((m) => `<option value="${m.id}" ${m.id === l.owner_id ? 'selected' : ''}>${esc(m.name)}${m.id === S.me.id ? ` (${esc(T().you)})` : ''}</option>`)].join('');
    const srcOpts = Object.entries(SOURCE[S.lang]).map(([k, v]) => `<option value="${k}" ${k === l.source ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const open = data.reminders.filter((r) => !r.done);
    view.innerHTML = `
      <button class="back" onclick="history.back()">‹ ${esc(T().back)}</button>
      <section class="hero">
        <div class="hero-top">${avatar(l.id, l.name)}<div><h1>${esc(l.name)}</h1><div class="co">${esc(l.company || '')}</div></div></div>
        <div class="actions">
          <a class="act" href="tel:${esc((l.phone || '').replace(/[^\d+]/g, ''))}" aria-disabled="${!l.phone}">${ICON.phone}${esc(T().call)}</a>
          <a class="act" href="mailto:${esc(l.email || '')}" aria-disabled="${!l.email}">${ICON.mail}${esc(T().email)}</a>
          <button class="act" id="copy" aria-disabled="${!l.phone}">${ICON.copy}${esc(T().copy)}</button>
        </div>
      </section>
      <h2>${esc(T().status)}</h2>
      <div class="card"><div class="status-row" id="status-row">${['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'].map((s) => `<button class="st ${s === l.status ? 'on' : ''}" style="--c:var(--s-${s})" data-st="${s}">${esc(STATUS[S.lang][s])}</button>`).join('')}</div></div>
      <h2>${esc(T().details)}</h2>
      <div class="card fields">
        <div class="field"><label for="f-owner">${esc(T().owner)}</label><select id="f-owner">${ownerOpts}</select></div>
        <div class="field"><label for="f-value">${esc(T().value)}, ${esc(S.currency)}</label><input id="f-value" type="number" inputmode="numeric" min="0" step="100" value="${l.value}"></div>
        <div class="field"><label for="f-source">${esc(T().source)}</label><select id="f-source">${srcOpts}</select></div>
        <div class="field"><label>${esc(T().phone)}</label><span class="val">${esc(l.phone || '—')}</span></div>
        <div class="field"><label>E-mail</label><span class="val">${esc(l.email || '—')}</span></div>
        <div class="field"><label>${esc(T().created)}</label><span class="val">${esc(new Date(l.created_at).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' }))}</span></div>
      </div>
      <h2>${esc(T().reminders)} <span class="count">${open.length || ''}</span></h2>
      <div class="card">
        ${data.reminders.length ? data.reminders.map((r) => remItem(r, false)).join('') : `<div class="rem-sub">${esc(T().noReminders)}</div>`}
        <form class="composer" id="rem-form">
          <input type="text" id="rem-text" maxlength="300" placeholder="${esc(T().remText)}" required>
          <div class="presets" id="presets">${[['1h', T().in1h], ['tom', T().tomorrow], ['3d', T().in3d], ['mon', T().nextMon]].map(([k, v]) => `<button type="button" data-p="${k}">${esc(v)}</button>`).join('')}</div>
          <input type="datetime-local" id="rem-due" required>
          <button class="btn ghost" type="submit">${esc(T().addReminder)}</button>
        </form>
      </div>
      <h2>${esc(T().timeline)}</h2>
      <div class="card">
        <form class="composer" id="note-form" style="margin-top:0">
          <textarea id="note-text" rows="2" maxlength="2000" placeholder="${esc(T().notePh)}" required></textarea>
          <button class="btn" type="submit">${esc(T().addNote)}</button>
        </form>
        <div class="timeline" style="margin-top:8px">${data.notes.map(evItem).join('')}</div>
      </div>`;

    const on = $('.st.on');
    if (on) on.parentElement.scrollLeft = on.offsetLeft - on.parentElement.clientWidth / 2 + on.clientWidth / 2;
    const patch = async (body) => {
      try { await api(`/api/leads/${l.id}`, { method: 'PATCH', body }); haptic('ok'); toast(T().saved); return true; } catch (e) { toast(e.message || T().err); return false; }
    };
    $('#status-row').onclick = async (e) => { const b = e.target.closest('[data-st]'); if (b && b.dataset.st !== l.status && (await patch({ status: b.dataset.st }))) renderLead(l.id); };
    $('#f-owner').onchange = async (e) => { if (await patch({ owner_id: e.target.value ? Number(e.target.value) : null })) renderLead(l.id); };
    $('#f-source').onchange = (e) => patch({ source: e.target.value });
    $('#f-value').onchange = (e) => patch({ value: Number(e.target.value) || 0 });
    $('#copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(l.phone || ''); toast(l.phone || ''); };
    $('#presets').onclick = (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      const d = new Date();
      if (b.dataset.p === '1h') d.setHours(d.getHours() + 1, Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
      else if (b.dataset.p === 'tom') { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); }
      else if (b.dataset.p === '3d') { d.setDate(d.getDate() + 3); d.setHours(10, 0, 0, 0); }
      else { d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); d.setHours(10, 0, 0, 0); }
      const pad = (n) => String(n).padStart(2, '0');
      $('#rem-due').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      document.querySelectorAll('#presets button').forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#rem-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(`/api/leads/${l.id}/reminders`, { method: 'POST', body: { text: $('#rem-text').value, due_at: new Date($('#rem-due').value).toISOString() } });
        haptic('ok'); renderLead(l.id); refreshBadge();
      } catch (err) { toast(err.message); }
    };
    $('#note-form').onsubmit = async (e) => {
      e.preventDefault();
      try { await api(`/api/leads/${l.id}/notes`, { method: 'POST', body: { text: $('#note-text').value } }); haptic('ok'); renderLead(l.id); } catch (err) { toast(err.message); }
    };
    bindTicks(() => renderLead(l.id));
  }

  function remItem(r, withLead) {
    const late = !r.done && r.due_at < new Date().toISOString();
    const lead = withLead ? ` · <a href="#/lead/${r.lead_id}">${esc(r.lead_company || r.lead_name)}</a>` : '';
    const who = withLead && S.remScope === 'all' ? ` · ${esc(r.member_name || '')}` : (!withLead && r.member_id !== S.me.id ? ` · ${esc(r.member_name || '')}` : '');
    return `<div class="rem ${r.done ? 'is-done' : ''}">
      <button class="tick ${r.done ? 'done' : ''}" data-rid="${r.id}" data-done="${r.done ? 1 : 0}" aria-label="done"></button>
      <div class="rem-link"><div class="rem-text">${esc(r.text)}</div>
      <div class="rem-sub"><span class="due ${late ? 'late' : ''}">${ICON.clock}${esc(when(r.due_at))}</span>${lead}${who}</div></div></div>`;
  }

  function bindTicks(after) {
    view.querySelectorAll('[data-rid]').forEach((b) => {
      b.onclick = async () => {
        try { await api(`/api/reminders/${b.dataset.rid}`, { method: 'PATCH', body: { done: b.dataset.done !== '1' } }); haptic('ok'); after(); refreshBadge(); } catch (e) { toast(e.message); }
      };
    });
  }

  function evItem(n) {
    const head = `<b>${esc(n.author_name || '—')}</b> · ${esc(when(n.created_at))}`;
    if (n.kind === 'note') return `<div class="ev"><span class="ev-dot">${ICON.note}</span><div class="ev-body"><div class="ev-head">${head}</div><div class="ev-text">${esc(n.text)}</div></div></div>`;
    let text = T().ev_created;
    let icon = ICON.plus;
    if (n.kind === 'status') {
      const [a, b] = n.text.split('>');
      text = `${T().ev_status}: ${STATUS[S.lang][a] || a} → ${STATUS[S.lang][b] || b}`;
      icon = ICON.flag;
    } else if (n.kind === 'owner') {
      text = n.text ? `${T().ev_owner}: ${n.text}` : T().ev_ownerNone;
      icon = ICON.user;
    }
    return `<div class="ev sys"><span class="ev-dot">${icon}</span><div class="ev-body"><div class="ev-head">${head}</div><div class="ev-text">${esc(text)}</div></div></div>`;
  }

  // ---------- new lead ----------
  function renderNew() {
    setTab(null);
    showBack(true);
    const srcOpts = Object.entries(SOURCE[S.lang]).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    const ownerOpts = [...S.team.map((m) => `<option value="${m.id}" ${m.id === S.me.id ? 'selected' : ''}>${esc(m.name)}</option>`), `<option value="">${esc(T().unassigned)}</option>`].join('');
    view.innerHTML = `
      <button class="back" onclick="history.back()">‹ ${esc(T().back)}</button>
      <h2 style="margin-top:6px">${esc(T().newLead)}</h2>
      <form class="card form" id="new-form">
        <label>${esc(T().name)} *<input name="name" maxlength="120" required></label>
        <label>${esc(T().company)}<input name="company" maxlength="120"></label>
        <div class="two"><label>${esc(T().phone)}<input name="phone" type="tel" maxlength="40"></label><label>E-mail<input name="email" type="email" maxlength="120"></label></div>
        <div class="two"><label>${esc(T().source)}<select name="source">${srcOpts}</select></label><label>${esc(T().value)}, ${esc(S.currency)}<input name="value" type="number" min="0" step="100" inputmode="numeric"></label></div>
        <label>${esc(T().owner)}<select name="owner_id">${ownerOpts}</select></label>
        <label>${esc(T().note)}<textarea name="note" rows="3" maxlength="2000"></textarea></label>
        <button class="btn" type="submit">${esc(T().save)}</button>
      </form>`;
    $('#new-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      if (!fd.name.trim()) return toast(T().required);
      try {
        const r = await api('/api/leads', { method: 'POST', body: { ...fd, value: Number(fd.value) || 0, owner_id: fd.owner_id ? Number(fd.owner_id) : null } });
        haptic('ok');
        location.replace(`#/lead/${r.lead.id}`);
      } catch (err) { toast(err.message); }
    };
  }

  // ---------- reminders ----------
  async function renderReminders() {
    setTab('reminders');
    showBack(false);
    const g = await api(`/api/reminders?scope=${S.remScope}`);
    const group = (title, list) => (list.length ? `<h2>${esc(title)} <span class="count">${list.length}</span></h2><div class="card">${list.map((r) => remItem(r, true)).join('')}</div>` : '');
    const any = g.overdue.length + g.today.length + g.upcoming.length;
    view.innerHTML = `
      <div class="row-tools">
        <div class="seg" id="rem-seg">${[['mine', T().mine], ['all', T().everyone]].map(([k, l]) => `<button data-sc="${k}" class="${S.remScope === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
      </div>
      ${group(T().overdue, g.overdue)}${group(T().today, g.today)}${group(T().upcoming, g.upcoming)}
      ${any ? '' : `<div class="card empty">${esc(T().nothingDue)}</div>`}
      <div style="margin-top:16px"><button class="btn ghost" id="digest">${esc(S.browser ? T().previewDigest : T().sendDigest)}</button></div>
      <div id="digest-out"></div>`;
    $('#rem-seg').onclick = (e) => { const b = e.target.closest('[data-sc]'); if (b) { S.remScope = b.dataset.sc; renderReminders(); } };
    $('#digest').onclick = async () => {
      try {
        const r = await api('/api/digest', { method: 'POST' });
        haptic('ok');
        const head = r.sent ? T().digestSent : r.preview ? T().digestOwner : T().digestPreview;
        if (r.sent) toast(head);
        $('#digest-out').innerHTML = `<h2>${esc(head)}</h2><div class="card ev-text">${esc(r.text)}</div>`;
      } catch (e) { toast(e.message); }
    };
    bindTicks(renderReminders);
  }

  async function refreshBadge() {
    try {
      const g = await api('/api/reminders?scope=mine');
      const n = g.overdue.length + g.today.length;
      const b = $('#rem-badge');
      b.textContent = n;
      b.hidden = !n;
    } catch {}
  }

  // ---------- stats ----------
  async function renderStats() {
    setTab('stats');
    showBack(false);
    const s = await api('/api/stats');
    const maxF = Math.max(1, ...s.funnel.map((f) => f.count));
    const maxS = Math.max(1, ...s.by_source.map((f) => f.count));
    const maxW = Math.max(1, ...s.weekly_new.map((w) => w.count));
    const weekLabel = (iso) => new Date(iso).toLocaleDateString(loc(), { day: 'numeric', month: 'numeric' });
    view.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="k">${esc(T().kOpen)}</div><div class="v">${esc(money(s.open_value, true))}</div><div class="d">${esc(T().leadsN(s.open_count))}</div></div>
        <div class="kpi"><div class="k">${esc(T().kWon)}</div><div class="v">${esc(money(s.won_30d.value, true))}</div><div class="d">${esc(T().dealsN(s.won_30d.count))}</div></div>
        <div class="kpi"><div class="k">${esc(T().kRate)}</div><div class="v">${s.win_rate_90d === null ? '—' : `${s.win_rate_90d}%`}</div><div class="d">${esc(T().closed)}</div></div>
        <div class="kpi"><div class="k">${esc(T().kAvg)}</div><div class="v">${esc(money(s.avg_deal, true))}</div><div class="d">${esc(T().dealsN(s.funnel.find((f) => f.status === 'won').count))}</div></div>
      </div>
      <h2>${esc(T().funnel)}</h2>
      <div class="card bars">${s.funnel.map((f) => `<div class="bar-row" title="${esc(STATUS[S.lang][f.status])}: ${f.count} · ${esc(money(f.value))}">
        <span class="lbl">${esc(STATUS[S.lang][f.status])}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(f.count / maxF) * 100}%;background:var(--s-${f.status})"></span></span>
        <span class="num">${f.count} <small>· ${esc(money(f.value, true))}</small></span></div>`).join('')}</div>
      <h2>${esc(T().weekly)}</h2>
      <div class="card">
        <div class="cols">${s.weekly_new.map((w, i) => `<div class="col ${i === 7 ? 'last' : ''}" title="${esc(weekLabel(w.start))}: ${w.count}">${i === 7 || w.count === maxW ? `<span class="cv">${w.count}</span>` : ''}<i style="height:${Math.max(3, (w.count / maxW) * 84)}px"></i></div>`).join('')}</div>
        <div class="col-labels">${s.weekly_new.map((w) => `<span>${esc(weekLabel(w.start))}</span>`).join('')}</div>
      </div>
      <h2>${esc(T().sources)}</h2>
      <div class="card bars">${s.by_source.slice().sort((a, b) => b.count - a.count).map((f) => `<div class="bar-row">
        <span class="lbl">${esc(SOURCE[S.lang][f.source])}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(f.count / maxS) * 100}%"></span></span>
        <span class="num">${f.count} <small>· ${esc(T().wonN(f.won))}</small></span></div>`).join('')}</div>
      <h2>${esc(T().team)}</h2>
      <div class="card"><table class="team"><thead><tr><th></th><th>${esc(T().thOpen)}</th><th>${esc(T().thWon)}</th></tr></thead><tbody>
        ${s.by_owner.slice().sort((a, b) => b.open_value - a.open_value).map((o) => `<tr><td><span class="who">${avatar(o.id, o.name, 'sm')}${esc(o.name)}${o.id === S.me.id ? ` <small style="display:inline">(${esc(T().you)})</small>` : ''}</span></td>
          <td>${o.open}<small>${esc(money(o.open_value, true))}</small></td><td>${o.won30}<small>${esc(money(o.won30_value, true))}</small></td></tr>`).join('')}
      </tbody></table></div>
      <p class="footnote">${esc(S.demo ? T().fictional : '')}${resetLink()}</p>`;
    bindReset();
  }

  // ---------- router ----------
  async function route() {
    const h = location.hash || '#/leads';
    window.scrollTo(0, 0);
    try {
      let m;
      if ((m = /^#\/lead\/(\d+)/.exec(h))) await renderLead(m[1]);
      else if (h === '#/new') renderNew();
      else if (h === '#/reminders') await renderReminders();
      else if (h === '#/stats') await renderStats();
      else await renderLeads();
    } catch (e) {
      view.innerHTML = `<div class="card empty">${esc(e.status === 404 ? '404' : e.message || T().err)}</div>`;
    }
  }

  // Inside Telegram: the signed initData. In a plain browser: empty, and the Worker issues a sandbox cookie.
  const getInitData = async () => (tg && tg.initData) || '';

  async function boot() {
    if (tg) {
      tg.ready();
      tg.expand && tg.expand();
      document.body.classList.add('in-tg');
      document.documentElement.dataset.theme = tg.colorScheme || 'light';
      tg.onEvent && tg.onEvent('themeChanged', () => { document.documentElement.dataset.theme = tg.colorScheme; });
      tg.BackButton && tg.BackButton.onClick(() => history.back());
      if (!tg.initData) document.body.classList.remove('in-tg');
    }
    S.initData = await getInitData();
    try {
      const me = await api('/api/me');
      Object.assign(S, { me: me.me, team: me.team, currency: me.currency, demo: me.demo, lang: me.me.lang, browser: !!me.browser });
      document.body.classList.toggle('browser', S.browser);
      $('#ws-name').textContent = me.workspace.name;
      // Keep the member's UTC offset fresh so the digest arrives at 9:00 their time.
      const tz = -new Date().getTimezoneOffset();
      if (tz !== me.me.tz_offset) api('/api/me', { method: 'POST', body: { tz_offset: tz } }).catch(() => {});
    } catch (e) {
      S.lang = (navigator.language || '').startsWith('ru') ? 'ru' : 'en';
      applyStatic();
      view.innerHTML = `<div class="card empty">${esc(e.message)}</div>`;
      return;
    }
    applyStatic();
    $('#lang-btn').onclick = async () => {
      S.lang = S.lang === 'ru' ? 'en' : 'ru';
      applyStatic();
      route();
      api('/api/me', { method: 'POST', body: { lang: S.lang } }).catch(() => {});
    };
    window.addEventListener('hashchange', route);
    await route();
    refreshBadge();
  }

  boot();
})();
