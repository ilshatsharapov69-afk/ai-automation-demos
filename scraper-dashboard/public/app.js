// Dashboard for the price monitor demo. Plain JS, no build step, no external scripts.
(function () {
  'use strict';

  var I18N = {
    en: {
      title: 'Price monitor', demo: 'demo',
      source: 'Watching {site} · {cats}',
      intro: 'This is a price monitor, the kind a shop uses to watch competitors. It reads a public test shop built for scraping practice (books.toscrape.com), stores every price in a database, and shows what moved. It refreshes itself: a visit starts a new check when the last one is more than {h} hours old.',
      demoTitle: 'Demo mode.',
      demoText: 'The test shop never changes its prices, so each check here adds a few small simulated price and stock changes. For a real client the monitor stores exactly what the site shows.',
      search: 'Search', searchPh: 'Title or id', category: 'Category', all: 'All', priceFrom: 'Price from', priceTo: 'to',
      stock: 'Stock', any: 'Any', inStock: 'In stock', outStock: 'Out of stock',
      changed: 'Changed', anyTime: 'Any time', d1: 'Last 24 h', d7: 'Last 7 days', d30: 'Last 30 days',
      sort: 'Sort', sLast: 'Last change', sChange: 'Change %', sPrice: 'Price', sTitle: 'Title', sRating: 'Rating',
      order: 'Order', desc: 'Descending', asc: 'Ascending', reset: 'Reset', csv: 'Export CSV', csvChanges: 'Changes CSV',
      thTitle: 'Title', thCategory: 'Category', thPrice: 'Price', thChange: 'Change', thRating: 'Rating', thStock: 'Stock', thLast: 'Last change',
      count: '{from}–{to} of {total}', none: 'Nothing matches these filters.',
      history: 'Price history', pick: 'Pick a row in the table.', openSource: 'Open on site',
      perRun: 'Changes per run', perRunSub: 'Price and stock changes found by each refresh.',
      feed: 'Recent changes', runs: 'Run log', schedule: 'Refreshes itself every {h} h when visited · alerts {alerts}', alertsOn: 'on (Telegram)', alertsOff: 'off',
      rTime: 'Started', rStatus: 'Status', rPages: 'Pages', rItems: 'Items', rChanges: 'Changes', rTook: 'Took',
      tItems: 'Items tracked', tItemsSub: 'in {n} categories', t24: 'Changes, 24 h', t24Sub: '▼ {down} cheaper · ▲ {up} pricier',
      t7: 'Changes, 7 days', t7Sub: 'price, stock, new, removed', tAvg: 'Average price', tAvgSub: 'listed items', tOut: 'Out of stock', tOutSub: '{p}% of items',
      lastRun: 'Last run {when}', never: 'No runs yet',
      st: { ok: 'ok', partial: 'partial', error: 'failed', running: 'running' },
      k: { price: 'price', stock: 'stock', new: 'new', gone: 'removed', back: 'back' },
      inS: 'in stock', outS: 'out of stock', backOnSite: 'back on the site', removed: 'removed from the site', added: 'new listing',
      run: 'Run', changesN: 'changes', since: 'since first seen', noChange: 'no change',
      noRuns: 'The first check has not happened yet.',
      footer: 'Demo project. Data: books.toscrape.com, a public sandbox made for scraping practice (its prices are fictional).', builtBy: 'Built by Ilshat',
    },
    ru: {
      title: 'Монитор цен', demo: 'демо',
      source: 'Слежу за {site} · {cats}',
      intro: 'Это монитор цен: так магазин следит за конкурентами. Он читает открытый тестовый магазин, сделанный для тренировки парсинга (books.toscrape.com), сохраняет каждую цену в базе и показывает, что изменилось. Обновляется сам: заход на страницу запускает новую проверку, если прошлой больше {h} ч.',
      demoTitle: 'Демо-режим.',
      demoText: 'В тестовом магазине цены не меняются, поэтому каждая проверка здесь добавляет несколько небольших смоделированных изменений цен и наличия. У клиента монитор сохраняет ровно то, что показывает сайт.',
      search: 'Поиск', searchPh: 'Название или id', category: 'Категория', all: 'Все', priceFrom: 'Цена от', priceTo: 'до',
      stock: 'Наличие', any: 'Любое', inStock: 'В наличии', outStock: 'Нет в наличии',
      changed: 'Изменение', anyTime: 'Когда угодно', d1: 'За 24 ч', d7: 'За 7 дней', d30: 'За 30 дней',
      sort: 'Сортировка', sLast: 'Последнее изменение', sChange: 'Изменение, %', sPrice: 'Цена', sTitle: 'Название', sRating: 'Рейтинг',
      order: 'Порядок', desc: 'По убыванию', asc: 'По возрастанию', reset: 'Сбросить', csv: 'Выгрузить CSV', csvChanges: 'CSV изменений',
      thTitle: 'Название', thCategory: 'Категория', thPrice: 'Цена', thChange: 'Изменение', thRating: 'Рейтинг', thStock: 'Наличие', thLast: 'Изменён',
      count: '{from}–{to} из {total}', none: 'По этим фильтрам ничего нет.',
      history: 'История цены', pick: 'Выберите строку в таблице.', openSource: 'Открыть на сайте',
      perRun: 'Изменения по запускам', perRunSub: 'Сколько изменений цен и наличия нашла каждая проверка.',
      feed: 'Последние изменения', runs: 'Журнал запусков', schedule: 'Обновляется само раз в {h} ч при заходе · уведомления {alerts}', alertsOn: 'включены (Telegram)', alertsOff: 'выключены',
      rTime: 'Начало', rStatus: 'Статус', rPages: 'Страниц', rItems: 'Товаров', rChanges: 'Изменений', rTook: 'Время',
      tItems: 'Товаров на контроле', tItemsSub: 'в {n} категориях', t24: 'Изменений за 24 ч', t24Sub: '▼ {down} дешевле · ▲ {up} дороже',
      t7: 'Изменений за 7 дней', t7Sub: 'цены, наличие, новые, исчезнувшие', tAvg: 'Средняя цена', tAvgSub: 'по товарам на сайте', tOut: 'Нет в наличии', tOutSub: '{p}% товаров',
      lastRun: 'Последний запуск {when}', never: 'Запусков ещё не было',
      st: { ok: 'успешно', partial: 'частично', error: 'ошибка', running: 'идёт' },
      k: { price: 'цена', stock: 'наличие', new: 'новый', gone: 'исчез', back: 'вернулся' },
      inS: 'в наличии', outS: 'нет в наличии', backOnSite: 'снова на сайте', removed: 'исчез с сайта', added: 'новый товар',
      run: 'Запуск', changesN: 'изменений', since: 'с первого замера', noChange: 'без изменений',
      noRuns: 'Первой проверки ещё не было.',
      footer: 'Демо-проект. Данные: books.toscrape.com, открытая песочница для практики парсинга (цены на ней вымышленные).', builtBy: 'Сделал Ильшат',
    },
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  var params = new URLSearchParams(location.search);
  var lang = params.get('lang') || store.get('pm-lang') || ((navigator.language || '').toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en');
  if (!I18N[lang]) lang = 'en';
  var state = { offset: 0, limit: 15, selected: params.get('item') || null, summary: null, items: [], runs: [], history: null };
  var FILTERS = ['q', 'category', 'min', 'max', 'stock', 'changed', 'sort', 'dir'];

  function t(key, vars) {
    var s = I18N[lang][key];
    if (s == null) s = I18N.en[key];
    if (typeof s === 'string' && vars) s = s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ''; });
    return s;
  }
  function locale() { return lang === 'ru' ? 'ru-RU' : 'en-GB'; }
  function money(cents, cur) {
    if (cents == null) return '—';
    try { return new Intl.NumberFormat(locale(), { style: 'currency', currency: cur || 'GBP' }).format(cents / 100); }
    catch (e) { return (cents / 100).toFixed(2); }
  }
  function num(n, d) { return new Intl.NumberFormat(locale(), { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }).format(n); }
  function when(ms, withYear) {
    if (!ms) return '—';
    var o = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
    if (withYear) o.year = 'numeric';
    return new Intl.DateTimeFormat(locale(), o).format(new Date(ms));
  }
  function short(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short' }).format(d) + ' ' + new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(d);
  }
  function day(ms) { return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short' }).format(new Date(ms)); }
  function pct(p) { return (p > 0 ? '+' : p < 0 ? '−' : '') + num(Math.abs(p), 1) + '%'; }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); });
    return n;
  }
  function api(path) {
    return fetch(path, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error(path + ': HTTP ' + r.status);
      return r.json();
    });
  }

  // ---------- i18n ----------
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('title') + ' · ' + t('demo');
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n'), { h: 6 }); });
    $('#builtBy').href = lang === 'ru' ? 'https://ilshat-builds.sherlock753cc.workers.dev/ru/' : 'https://ilshat-builds.sherlock753cc.workers.dev/';
    document.querySelectorAll('[data-i18n-ph]').forEach(function (n) { n.placeholder = t(n.getAttribute('data-i18n-ph')); });
    document.querySelectorAll('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === lang)); });
  }

  // ---------- filters ----------
  var form = $('#filters');
  function filterQuery(extra) {
    var q = new URLSearchParams();
    FILTERS.forEach(function (k) { var v = form.elements[k].value.trim(); if (v) q.set(k, v); });
    Object.keys(extra || {}).forEach(function (k) { q.set(k, extra[k]); });
    return q;
  }
  function syncUrl() {
    var q = filterQuery();
    if (lang !== 'en') q.set('lang', lang);
    if (state.selected) q.set('item', state.selected);
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    $('#csv').href = '/api/export.csv?' + filterQuery();
    var cq = new URLSearchParams();
    if (form.elements.category.value) cq.set('category', form.elements.category.value);
    cq.set('type', 'changes');
    $('#csvChanges').href = '/api/export.csv?' + cq;
  }
  FILTERS.forEach(function (k) { if (params.get(k)) form.elements[k].value = params.get(k); });
  var debounce;
  form.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { state.offset = 0; loadItems(); }, 250);
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  $('#reset').addEventListener('click', function () {
    form.reset();
    form.elements.category.value = '';
    state.offset = 0;
    loadItems();
  });
  $('#prev').addEventListener('click', function () { state.offset = Math.max(0, state.offset - state.limit); loadItems(); });
  $('#next').addEventListener('click', function () { state.offset += state.limit; loadItems(); });
  document.querySelectorAll('.lang button').forEach(function (b) {
    b.addEventListener('click', function () {
      lang = b.dataset.lang;
      store.set('pm-lang', lang);
      applyLang();
      renderAll();
    });
  });

  // ---------- summary ----------
  function renderSummary() {
    var s = state.summary;
    if (!s) return;
    var host = s.source.replace(/^https?:\/\//, '').replace(/\/$/, '');
    $('#source').textContent = t('source', { site: host, cats: s.categories.map(function (c) { return c.category; }).join(', ') });
    $('#demoBanner').hidden = !s.simulated;
    var lr = s.lastRun;
    var pill = $('#lastRun');
    pill.textContent = '';
    if (lr) {
      pill.appendChild(el('span', { class: 'status ' + lr.status }));
      pill.appendChild(document.createTextNode(t('lastRun', { when: when(lr.started_at) }) + ' · ' + (t('st')[lr.status] || lr.status)));
    } else pill.textContent = t('never');
    var tt = s.totals;
    var tiles = [
      [t('tItems'), num(tt.items || 0), t('tItemsSub', { n: s.categories.length })],
      [t('t24'), num(tt.changes_24h || 0), t('t24Sub', { down: tt.down_24h, up: tt.up_24h })],
      [t('t7'), num(tt.changes_7d || 0), t('t7Sub')],
      [t('tAvg'), money(tt.avg_price_cents, tt.currency), t('tAvgSub')],
      [t('tOut'), num(tt.out_of_stock || 0), t('tOutSub', { p: tt.items ? num((tt.out_of_stock || 0) * 100 / tt.items, 1) : 0 })],
    ];
    var box = $('#tiles');
    box.textContent = '';
    tiles.forEach(function (x) {
      box.appendChild(el('div', { class: 'tile' }, [el('div', { class: 'label', text: x[0] }), el('div', { class: 'value', text: x[1] }), el('div', { class: 'sub', text: x[2] })]));
    });
    var sel = form.elements.category;
    var cur = sel.value || params.get('category') || '';
    while (sel.options.length > 1) sel.remove(1);
    s.categories.forEach(function (c) { sel.appendChild(el('option', { value: c.category, text: c.category + ' (' + c.n + ')' })); });
    sel.value = cur;
    $('#intro').textContent = t('intro', { h: s.refreshHours });
    $('#schedule').textContent = t('schedule', { h: s.refreshHours, alerts: s.alerts ? t('alertsOn') : t('alertsOff') });
  }

  // ---------- items table ----------
  function stars(n) {
    if (!n) return '—';
    return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  }
  function deltaCell(it) {
    var td = el('td', { class: 'r' });
    if (it.change_pct == null || it.change_pct === 0) { td.appendChild(el('span', { class: 'delta flat', text: '—' })); return td; }
    var down = it.change_pct < 0;
    td.appendChild(el('span', { class: 'delta ' + (down ? 'down' : 'up'), text: (down ? '▼ ' : '▲ ') + pct(it.change_pct), title: money(it.prev_price_cents, it.currency) + ' → ' + money(it.price_cents, it.currency) }));
    return td;
  }
  function renderItems(data) {
    var tb = $('#items tbody');
    tb.textContent = '';
    if (!data.items.length) {
      tb.appendChild(el('tr', null, [el('td', { colspan: '6', class: 'empty', text: t('none') })]));
    }
    data.items.forEach(function (it) {
      var tr = el('tr', { 'data-id': it.id, tabindex: '0', 'aria-selected': String(it.id === state.selected) }, [
        el('td', { class: 't' }, [el('span', { text: it.title, title: it.title }), el('small', { class: 'cat', text: it.category || '' })]),
        el('td', { class: 'r', text: money(it.price_cents, it.currency) }),
        deltaCell(it),
        el('td', { class: 'stars', text: stars(it.rating), 'aria-label': (it.rating || 0) + '/5' }),
        el('td', null, [el('span', { class: 'stock ' + (it.in_stock ? 'in' : 'out'), text: it.in_stock ? t('inS') : t('outS') })]),
        el('td', { class: 'when', text: short(it.last_change) }),
      ]);
      tr.addEventListener('click', function () { select(it.id); });
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(it.id); } });
      tb.appendChild(tr);
    });
    var to = Math.min(data.offset + data.limit, data.total);
    $('#count').textContent = data.total ? t('count', { from: data.offset + 1, to: to, total: data.total }) : '';
    $('#prev').disabled = data.offset === 0;
    $('#next').disabled = to >= data.total;
  }
  function loadItems() {
    syncUrl();
    return api('/api/items?' + filterQuery({ limit: state.limit, offset: state.offset })).then(function (d) {
      state.itemsData = d;
      renderItems(d);
      if (!state.selected && d.items.length) select(d.items[0].id);
    });
  }
  function select(id) {
    state.selected = id;
    document.querySelectorAll('#items tbody tr').forEach(function (r) { r.setAttribute('aria-selected', String(r.dataset.id === id)); });
    syncUrl();
    return api('/api/history?id=' + encodeURIComponent(id)).then(function (h) { state.history = h; renderHistory(); })
      .catch(function () { state.history = null; renderHistory(); });
  }

  // ---------- tooltip ----------
  var tip = $('#tooltip');
  function showTip(evt, strong, lines) {
    tip.textContent = '';
    tip.appendChild(el('strong', { text: strong }));
    lines.forEach(function (l) { tip.appendChild(el('div', null, l.key ? [el('span', { class: 'key' }), l.text] : [l.text || l])); });
    tip.hidden = false;
    var x = evt.clientX + 14, y = evt.clientY + 14;
    var r = tip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - 14;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { tip.hidden = true; }

  function niceTicks(lo, hi, count) {
    if (lo === hi) { lo -= 1; hi += 1; }
    var step = Math.pow(10, Math.floor(Math.log10((hi - lo) / count)));
    var err = (count * step) / (hi - lo);
    if (err <= 0.15) step *= 10; else if (err <= 0.35) step *= 5; else if (err <= 0.75) step *= 2;
    var start = Math.floor(lo / step) * step, ticks = [];
    for (var v = start; ; v += step) {
      ticks.push(Math.round(v * 100) / 100);
      if (v >= hi - step * 1e-6) break; // the last tick covers the maximum
    }
    return ticks;
  }

  // ---------- price history chart (step line, crosshair + tooltip) ----------
  function renderHistory() {
    var box = $('#historyChart');
    box.textContent = '';
    var h = state.history;
    var link = $('#historyLink');
    if (!h || !h.points.length) {
      $('#historyTitle').textContent = t('pick');
      link.hidden = true;
      box.appendChild(el('div', { class: 'placeholder', text: t('pick') }));
      return;
    }
    var it = h.item, pts = h.points;
    var first = pts[0].price_cents, last = pts[pts.length - 1].price_cents;
    $('#historyTitle').textContent = it.title + ' · ' + money(last, it.currency) + (first !== last ? ' (' + pct((last - first) * 100 / first) + ' ' + t('since') + ')' : ' · ' + t('noChange'));
    link.href = it.url;
    link.hidden = false;

    var W = box.clientWidth || 600, H = box.clientHeight || 250;
    var m = { l: 54, r: 62, t: 12, b: 26 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var prices = pts.map(function (p) { return p.price_cents / 100; });
    var lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
    var pad = Math.max((hi - lo) * 0.15, hi * 0.03);
    var ticks = niceTicks(lo - pad, hi + pad, 4);
    var y0 = ticks[0], y1 = ticks[ticks.length - 1];
    var t0 = pts[0].at, t1 = pts[pts.length - 1].at;
    if (t1 === t0) t1 = t0 + 1;
    var X = function (ms) { return m.l + ((ms - t0) / (t1 - t0)) * iw; };
    var Y = function (v) { return m.t + ih - ((v - y0) / (y1 - y0)) * ih; };
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('history') + ': ' + it.title });
    ticks.forEach(function (v) {
      s.appendChild(svg('line', { class: 'gridline', x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v) }));
      s.appendChild(svg('text', { class: 'tick', x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end', text: money(Math.round(v * 100), it.currency) }));
    });
    s.appendChild(svg('line', { class: 'baseline', x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih }));
    var nX = Math.min(5, pts.length);
    for (var i = 0; i < nX; i++) {
      var ms = t0 + ((t1 - t0) * i) / Math.max(1, nX - 1);
      s.appendChild(svg('text', { class: 'tick', x: X(ms), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === nX - 1 ? 'end' : 'middle', text: t1 - t0 < 36 * 3600000 ? new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(ms)) : day(ms) }));
    }
    var d = '', area = '';
    pts.forEach(function (p, i) {
      var x = X(p.at), y = Y(p.price_cents / 100);
      if (i === 0) d += 'M' + x + ' ' + y; else d += 'H' + x + 'V' + y;
    });
    area = d + 'V' + (m.t + ih) + 'H' + X(t0) + 'Z';
    s.appendChild(svg('path', { class: 'area', d: area }));
    s.appendChild(svg('path', { class: 'line', d: d }));
    pts.forEach(function (p, i) {
      var changed = i > 0 && p.price_cents !== pts[i - 1].price_cents;
      if (changed || !p.in_stock || i === 0 || i === pts.length - 1) {
        s.appendChild(svg('circle', { class: 'dot' + (p.in_stock ? '' : ' out'), cx: X(p.at), cy: Y(p.price_cents / 100), r: changed || !p.in_stock ? 4.5 : 3.5 }));
      }
    });
    s.appendChild(svg('text', { class: 'label', x: X(t1) + 8, y: Y(last / 100) + 4, text: money(last, it.currency) }));
    var cross = svg('line', { class: 'cross', y1: m.t, y2: m.t + ih, visibility: 'hidden' });
    s.appendChild(cross);
    var hit = svg('rect', { class: 'hit', x: m.l, y: m.t, width: iw, height: ih });
    s.appendChild(hit);
    function onMove(e) {
      var r = s.getBoundingClientRect();
      var mx = ((e.clientX - r.left) / r.width) * W;
      var best = 0;
      pts.forEach(function (p, i) { if (Math.abs(X(p.at) - mx) < Math.abs(X(pts[best].at) - mx)) best = i; });
      var p = pts[best], prev = pts[best - 1];
      cross.setAttribute('x1', X(p.at)); cross.setAttribute('x2', X(p.at)); cross.setAttribute('visibility', 'visible');
      var lines = [{ key: true, text: t('run') + ' #' + p.run_id + ' · ' + when(p.at) }];
      if (prev && prev.price_cents !== p.price_cents) lines.push(money(prev.price_cents, it.currency) + ' → ' + money(p.price_cents, it.currency) + ' (' + pct((p.price_cents - prev.price_cents) * 100 / prev.price_cents) + ')');
      lines.push(p.in_stock ? t('inS') : t('outS'));
      showTip(e, money(p.price_cents, it.currency), lines);
    }
    hit.addEventListener('pointermove', onMove);
    hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
    box.appendChild(s);
  }

  // ---------- changes per run (bars, per-bar tooltip) ----------
  function topRounded(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return '';
    return 'M' + x + ' ' + (y + h) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + (y + h) + 'Z';
  }
  function renderRunsChart() {
    var box = $('#runsChart');
    box.textContent = '';
    var runs = state.runs.slice(0, 30).reverse();
    if (!runs.length) { box.appendChild(el('div', { class: 'placeholder', text: t('noRuns') })); return; }
    var W = box.clientWidth || 600, H = box.clientHeight || 250;
    var m = { l: 34, r: 8, t: 16, b: 26 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var max = Math.max(1, Math.max.apply(null, runs.map(function (r) { return r.changes || 0; })));
    var ticks = niceTicks(0, max, 4).filter(function (v) { return v === Math.round(v); });
    var top = ticks[ticks.length - 1] || 1;
    var Y = function (v) { return m.t + ih - (v / top) * ih; };
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('perRun') });
    ticks.forEach(function (v) {
      s.appendChild(svg('line', { class: 'gridline', x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v) }));
      s.appendChild(svg('text', { class: 'tick', x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end', text: num(v) }));
    });
    var slot = iw / runs.length, bw = Math.max(3, Math.min(22, slot - 2));
    var maxIdx = 0;
    runs.forEach(function (r, i) { if ((r.changes || 0) > (runs[maxIdx].changes || 0)) maxIdx = i; });
    runs.forEach(function (r, i) {
      var x = m.l + i * slot + (slot - bw) / 2, v = r.changes || 0;
      var y = Y(v), hgt = m.t + ih - y;
      if (hgt > 0) s.appendChild(svg('path', { class: 'bar', d: topRounded(x, y, bw, hgt, 4) }));
      if (i === maxIdx && v > 0) s.appendChild(svg('text', { class: 'label', x: x + bw / 2, y: y - 5, 'text-anchor': 'middle', text: num(v) }));
      var hit = svg('rect', { class: 'hit', x: m.l + i * slot, y: m.t, width: slot, height: ih, tabindex: '0' });
      var show = function (e) {
        showTip(e.clientX != null ? e : { clientX: hit.getBoundingClientRect().left, clientY: hit.getBoundingClientRect().top },
          num(v) + ' ' + t('changesN'), [t('run') + ' #' + r.id + ' · ' + when(r.started_at), t('st')[r.status] || r.status]);
      };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', hideTip);
      hit.addEventListener('blur', hideTip);
      s.appendChild(hit);
    });
    s.appendChild(svg('line', { class: 'baseline', x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih }));
    var a = runs[0], b = runs[runs.length - 1];
    s.appendChild(svg('text', { class: 'tick', x: m.l, y: H - 6, text: '#' + a.id + ' · ' + day(a.started_at) }));
    if (runs.length > 1) s.appendChild(svg('text', { class: 'tick', x: m.l + iw, y: H - 6, 'text-anchor': 'end', text: '#' + b.id + ' · ' + day(b.started_at) }));
    box.appendChild(s);
  }

  function renderRunsTable() {
    var tb = $('#runs tbody');
    tb.textContent = '';
    state.runs.forEach(function (r) {
      var ms = r.finished_at ? r.finished_at - r.started_at : null;
      var took = ms == null ? '—' : ms < 100 ? '< 0' + (lang === 'ru' ? ',' : '.') + '1 s' : num(ms / 1000, 1) + ' s';
      tb.appendChild(el('tr', { title: r.error || '' }, [
        el('td', { text: String(r.id) }), el('td', { text: when(r.started_at) }),
        el('td', null, [el('span', { class: 'status ' + r.status, text: t('st')[r.status] || r.status })]),
        el('td', { class: 'r', text: num(r.pages || 0) }), el('td', { class: 'r', text: num(r.items || 0) }),
        el('td', { class: 'r', text: num(r.changes || 0) }), el('td', { class: 'r', text: took }),
      ]));
    });
  }

  // ---------- change feed ----------
  var ICON = { price: '', stock: '', new: '🆕', gone: '🗑', back: '↩️' };
  function renderFeed(changes) {
    var tb = $('#feed tbody');
    tb.textContent = '';
    if (!changes.length) tb.appendChild(el('tr', null, [el('td', { class: 'empty', text: t('noRuns') })]));
    changes.forEach(function (c) {
      var detail, icon = ICON[c.kind], cls = '';
      if (c.kind === 'price') {
        var p = (c.new_value - c.old_value) * 100 / c.old_value;
        icon = p < 0 ? '▼' : '▲';
        cls = 'delta ' + (p < 0 ? 'down' : 'up');
        detail = money(c.old_value, c.currency) + ' → ' + money(c.new_value, c.currency) + ' (' + pct(p) + ')';
      } else if (c.kind === 'stock') {
        icon = c.new_value ? '✅' : '⛔';
        detail = c.new_value ? t('inS') : t('outS');
      } else if (c.kind === 'new') detail = t('added') + ' · ' + money(c.new_value, c.currency);
      else if (c.kind === 'back') detail = t('backOnSite') + ' · ' + money(c.new_value, c.currency);
      else detail = t('removed');
      var tr = el('tr', { 'data-id': c.item_id }, [
        el('td', { class: 'k' }, [el('span', { class: cls, text: icon, 'aria-label': t('k')[c.kind] })]),
        el('td', { class: 't' }, [el('span', { text: c.title || c.item_id, title: c.title || '' })]),
        el('td', { class: cls ? 'r ' : 'r' }, [el('span', { class: cls || 'muted', text: detail })]),
        el('td', { class: 'when', text: when(c.at) }),
      ]);
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', function () { select(c.item_id); $('#historyCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
      tb.appendChild(tr);
    });
  }

  function renderAll() {
    renderSummary();
    if (state.itemsData) renderItems(state.itemsData);
    renderHistory();
    renderRunsChart();
    renderRunsTable();
    if (state.changes) renderFeed(state.changes);
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { renderHistory(); renderRunsChart(); }, 150);
  });

  applyLang();
  Promise.all([
    api('/api/summary').then(function (s) { state.summary = s; renderSummary(); }),
    api('/api/runs?limit=30').then(function (r) { state.runs = r.runs; renderRunsChart(); renderRunsTable(); }),
    api('/api/changes?limit=40').then(function (c) { state.changes = c.changes; renderFeed(c.changes); }),
  ]).then(function () {
    var p = loadItems();
    if (state.selected) select(state.selected);
    return p;
  }).then(function () { document.body.setAttribute('data-ready', '1'); })
    .catch(function (e) {
      document.body.setAttribute('data-ready', 'error');
      $('#tiles').textContent = String(e.message || e);
    });
})();
