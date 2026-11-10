// Builds the static site into public/: index.html (EN), ru/index.html (RU), privacy.html, 404.html.
// Copy: src/site/content.mjs. Quiz steps and prices: public/js/quiz-model.js. Run: npm run build
// The test suite checks that the committed pages match this output.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { C, UI, BRAND, DEMO_CONTACT, PORTFOLIO } from '../src/site/content.mjs';
import { icon, logo, heroPlan, projectPlan } from '../src/site/icons.mjs';
import { STEPS, STEP, CURRENCY, estimate, formatMoney, formatRange, formatWeeks } from '../public/js/quiz-model.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ASSET_V = '1'; // bump to bust browser caches of css/js after a change

function quizHtml(lang) {
  const u = UI[lang];
  const total = STEPS.length;
  const steps = STEPS.map((s, i) => {
    const hidden = i ? ' hidden' : '';
    const head = `<legend class="step-title">${esc(s.title[lang])}</legend>${s.hint ? `<p class="step-hint">${esc(s.hint[lang])}</p>` : ''}`;
    if (s.kind === 'range') {
      const presets = s.presets.map((n) => `<button type="button" class="chip-btn" data-area="${n}">${n} ${s.unit[lang]}</button>`).join('');
      return `<fieldset class="step" data-step="${s.id}" data-kind="range"${hidden}>${head}
<div class="area"><label class="area-big"><input class="area-input" type="number" inputmode="numeric" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.default}" aria-label="${esc(s.title[lang])}, ${s.unit[lang]}"><span class="area-unit">${s.unit[lang]}</span>${icon('pencil', 'ic area-pen')}</label>
<input id="q-area" class="area-range" type="range" name="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.default}" aria-label="${esc(s.title[lang])}">
<div class="area-scale" aria-hidden="true"><span>${s.min}</span><span>${s.max} ${s.unit[lang]}</span></div>
<div class="presets">${presets}</div></div></fieldset>`;
    }
    const type = s.kind === 'multi' ? 'checkbox' : 'radio';
    const cls = s.options.length === 3 ? 'opts opts-3' : s.options.length === 5 ? 'opts opts-5' : 'opts';
    const opts = s.options.map((o) => `<label class="opt"><input type="${type}" name="${s.id}" value="${o.id}"><span class="opt-ic">${icon(o.icon)}</span><span class="opt-t"><b>${esc(o.label[lang])}</b>${o.hint ? `<small>${esc(o.hint[lang])}</small>` : ''}</span><span class="opt-tick">${icon('check')}</span></label>`).join('');
    return `<fieldset class="step" data-step="${s.id}" data-kind="${s.kind}"${hidden}>${head}<div class="${cls}">${opts}</div></fieldset>`;
  }).join('\n');

  const contacts = Object.entries(u.contactOpts).map(([v, t], i) => `<label class="chip"><input type="radio" name="contact" value="${v}"${i ? '' : ' checked'}><span>${esc(t)}</span></label>`).join('');
  return `<div class="quiz-wrap">
<form class="quiz card" id="quiz" novalidate data-lang="${lang}">
<div class="quiz-top"><p class="quiz-count" aria-live="polite">${esc(u.step.replace('{n}', 1).replace('{total}', total))}</p><div class="bar" aria-hidden="true"><i></i></div></div>
${steps}
<section class="step step-result" data-step="result" hidden aria-labelledby="est-title" tabindex="-1">
<div class="est"><p class="est-k" id="est-title">${esc(u.estimateTitle)}</p><p class="est-v" data-out="range">—</p><p class="est-w">${esc(u.duration)}: <b data-out="weeks">—</b></p><ul class="est-list" data-out="breakdown"></ul><p class="est-note">${esc(u.rangeNote)}</p></div>
<div class="lead"><h3>${esc(u.formTitle)}</h3><p class="lead-sub">${esc(u.formSub)}</p>
<div class="field"><label for="f-name">${esc(u.name)}</label><input id="f-name" name="name" autocomplete="name" maxlength="60" required placeholder="${esc(u.namePh)}" aria-describedby="e-name"><p class="err" id="e-name"></p></div>
<div class="field"><label for="f-phone">${esc(u.phone)}</label><input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="32" required placeholder="${esc(u.phonePh)}" aria-describedby="e-phone"><p class="err" id="e-phone"></p></div>
<fieldset class="field"><legend>${esc(u.contact)}</legend><div class="chips">${contacts}</div></fieldset>
<div class="field"><label for="f-comment">${esc(u.comment)}</label><textarea id="f-comment" name="comment" rows="2" maxlength="500" placeholder="${esc(u.commentPh)}" aria-describedby="e-comment"></textarea><p class="err" id="e-comment"></p></div>
<div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
<label class="consent"><input type="checkbox" name="consent" aria-describedby="e-consent"><span>${u.consent}</span></label><p class="err" id="e-consent"></p>
<p class="form-err" role="alert" hidden></p>
<p class="demo-hint">${esc(u.demoHint)}</p>
<button type="submit" class="btn btn-primary btn-lg btn-block">${esc(u.submit)} ${icon('send')}</button>
</div>
</section>
<section class="step step-done" data-step="done" hidden tabindex="-1">
<div class="done-ic">${icon('check')}</div><h3 data-out="doneTitle"></h3><p data-out="doneText"></p><p class="done-est" data-out="doneEst"></p><p class="done-demo">${esc(u.doneDemo)}</p>
<div class="tg-card" data-out="card" hidden><p class="tg-card-k">${icon('send')} ${esc(u.cardTitle)}</p><div class="tg-bubble"><div class="tg-text" data-out="cardText"></div><div class="tg-btn" data-out="cardBtn"></div></div></div>
<button type="button" class="btn btn-ghost" data-act="again">${esc(u.again)}</button>
</section>
<div class="quiz-nav"><button type="button" class="btn btn-ghost" data-act="back" hidden>${icon('arrow', 'ic flip')} ${esc(u.back)}</button><p class="nav-hint" aria-live="polite"></p><button type="button" class="btn btn-primary" data-act="next">${esc(u.next)} ${icon('arrow')}</button></div>
<noscript><p class="noscript">${esc(C[lang].noscript)}</p></noscript>
</form>
<aside class="quiz-side card" aria-label="${esc(u.summary)}">
<p class="side-k">${esc(u.summary)}</p>
<ol class="side-list" data-out="summary"><li class="side-empty">${esc(u.summaryEmpty)}</li></ol>
<div class="side-price"><p class="side-k">${esc(u.livePrice)}</p><p class="side-v" data-out="live">${esc(u.livePriceSoon)}</p></div>
<ul class="side-trust"><li>${icon('shield')} ${esc(C[lang].hero.bullets[1])}</li><li>${icon('camera')} ${esc(C[lang].hero.bullets[2])}</li></ul>
</aside>
</div>
<script type="application/json" id="quiz-ui">${JSON.stringify(u).replace(/</g, '\\u003c')}</script>`;
}

function page(lang) {
  const c = C[lang];
  const cur = CURRENCY[lang];
  const brand = BRAND[lang];
  const heroEst = estimate({ property: 'resale', area: 54, scope: 'standard', extras: ['bathroom'], start: 'month' }, cur);
  const other = lang === 'en' ? 'ru' : 'en';

  const prices = STEP.scope.options.map((o) => `<article class="price card${o.id === 'standard' ? ' price-pop' : ''}">
${o.id === 'standard' ? `<p class="badge">${esc(c.prices.popular)}</p>` : ''}<span class="price-ic">${icon(o.icon)}</span><h3>${esc(o.label[lang])}</h3>
<p class="price-v"><small>${esc(c.prices.from)}</small> ${esc(formatMoney(o.rate[cur], cur, lang))} <small>${esc(c.prices.perM2)}</small></p>
<ul>${c.prices.items[o.id].map((x) => `<li>${icon('check')} ${esc(x)}</li>`).join('')}</ul>
<a class="btn ${o.id === 'standard' ? 'btn-primary' : 'btn-ghost'} btn-block" href="#calc" data-preset-scope="${o.id}">${esc(c.prices.cta)}</a>
</article>`).join('\n');

  const process = c.process.steps.map(([t, d], i) => `<li><span class="num">${i + 1}</span><h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join('');
  const projects = c.projects.items.map((p) => {
    const e = estimate(p.answers, cur);
    const contract = Math.round((e.min + e.max) / 2 / (cur === 'RUB' ? 10000 : 100)) * (cur === 'RUB' ? 10000 : 100);
    return `<article class="proj card"><div class="proj-art proj-${p.plan}">${projectPlan(p.plan)}</div><div class="proj-body"><h3>${esc(p.title)}</h3><p class="proj-meta">${esc(p.meta)}</p><p>${esc(p.quote)}</p>
<dl class="proj-num"><div><dt>${esc(c.projects.inContract)}</dt><dd>${esc(formatMoney(contract, cur, lang))}</dd></div><div><dt>${esc(c.projects.final)}</dt><dd>${esc(formatMoney(contract, cur, lang))} ${icon('check')}</dd></div></dl></div></article>`;
  }).join('\n');
  const faq = c.faq.items.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
  const trustIcons = ['users', 'wallet', 'broom', 'person'];
  const trust = c.trust.map(([b, s], i) => `<li>${icon(trustIcons[i])}<span><b>${esc(b)}</b>${esc(s)}</span></li>`).join('');
  const demoCta = DEMO_CONTACT.url ? ` <a href="${esc(DEMO_CONTACT.url)}" rel="noopener" target="_blank">${esc(c.demoCta)} ${esc(DEMO_CONTACT.label)}</a>` : '';

  return `<!doctype html>
<html lang="${c.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
<meta name="theme-color" content="#1c2226">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.description)}">
<link rel="alternate" hreflang="${other}" href="${C[other].path}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${lang === 'ru' ? '<link rel="preload" href="/fonts/manrope-cyrillic.woff2" as="font" type="font/woff2" crossorigin>\n' : ''}<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/style.css?v=${ASSET_V}">
<script type="module" src="/js/quiz.js?v=${ASSET_V}"></script>
</head>
<body>
<a class="skip" href="#quiz">${esc(c.quiz.h2)}</a>
<div class="demo-strip"><div class="wrap"><span class="demo-dot"></span><p>${esc(c.demo)}${demoCta} <a class="built" href="${esc(PORTFOLIO[lang])}">${esc(c.builtBy)}</a></p></div></div>
<header class="site-head"><div class="wrap head-in">
<a class="logo" href="${c.path}" aria-label="${esc(brand)}">${logo}<span>${esc(brand)}</span></a>
<nav class="nav" aria-label="${lang === 'ru' ? 'Разделы' : 'Sections'}">${c.nav.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`).join('')}</nav>
<div class="head-act"><a class="lang" href="${c.langSwitch.href}" hreflang="${other}" title="${esc(c.langSwitch.title)}">${c.langSwitch.label}</a><a class="btn btn-primary btn-sm" href="#calc">${esc(c.headerCta)}</a></div>
</div></header>

<main>
<section class="hero"><div class="wrap hero-in">
<div class="hero-copy">
<p class="eyebrow">${esc(c.hero.eyebrow)}</p>
<h1>${c.hero.h1}</h1>
<p class="hero-lead">${esc(c.hero.lead)}</p>
<div class="hero-cta"><a class="btn btn-primary btn-lg" href="#calc">${esc(c.hero.cta)} ${icon('arrow')}</a><a class="btn btn-ghost btn-lg" href="#projects">${esc(c.hero.secondary)}</a></div>
<p class="hero-note">${esc(c.hero.ctaNote)}</p>
<ul class="hero-bullets">${c.hero.bullets.map((b, i) => `<li>${icon(['wallet', 'shield', 'camera'][i])} ${esc(b)}</li>`).join('')}</ul>
</div>
<div class="hero-art" aria-hidden="true">
<div class="plan-card">${heroPlan(c.hero.plan)}</div>
<div class="float-est"><p class="fe-k">${esc(c.hero.cardTitle)}</p><p class="fe-l">${esc(c.hero.cardLine)}</p><p class="fe-v">${esc(formatRange(heroEst, lang))}</p><p class="fe-w">${esc(c.hero.cardWeeks)}: <b>${esc(formatWeeks(heroEst, lang))}</b></p></div>
<div class="float-chip">${icon('camera')} ${esc(c.hero.chip)}</div>
</div>
</div></section>

<section class="trust"><div class="wrap"><ul>${trust}</ul></div></section>

<section class="sec sec-quiz" id="calc"><div class="wrap">
<div class="sec-head"><p class="kicker">${esc(c.quiz.kicker)}</p><h2>${esc(c.quiz.h2)}</h2><p>${esc(c.quiz.sub)}</p></div>
${quizHtml(lang)}
</div></section>

<section class="sec" id="prices"><div class="wrap">
<div class="sec-head"><p class="kicker">${esc(c.prices.kicker)}</p><h2>${esc(c.prices.h2)}</h2><p>${esc(c.prices.sub)}</p></div>
<div class="prices">${prices}</div>
</div></section>

<section class="sec sec-dark" id="process"><div class="wrap">
<div class="sec-head"><p class="kicker">${esc(c.process.kicker)}</p><h2>${esc(c.process.h2)}</h2></div>
<ol class="process">${process}</ol>
</div></section>

<section class="sec" id="projects"><div class="wrap">
<div class="sec-head"><p class="kicker">${esc(c.projects.kicker)}</p><h2>${esc(c.projects.h2)}</h2><p>${esc(c.projects.sub)}</p></div>
<div class="projects">${projects}</div>
</div></section>

<section class="sec sec-faq" id="faq"><div class="wrap faq-in">
<div class="sec-head"><p class="kicker">${esc(c.faq.kicker)}</p><h2>${esc(c.faq.h2)}</h2></div>
<div class="faq">${faq}</div>
</div></section>

<section class="final"><div class="wrap final-in"><h2>${esc(c.final.h2)}</h2><a class="btn btn-primary btn-lg" href="#calc">${esc(c.final.cta)} ${icon('arrow')}</a></div></section>
</main>

<footer class="site-foot"><div class="wrap foot-in">
<a class="logo" href="${c.path}">${logo}<span>${esc(brand)}</span></a>
<p>${esc(c.footer.about)}</p>
<nav><a href="/privacy">${esc(c.footer.privacy)}</a><a href="/owner-demo?lang=${lang}" rel="nofollow">${esc(c.footer.admin)}</a><a href="${c.langSwitch.href}" hreflang="${other}">${c.langSwitch.label}</a></nav>
</div></footer>
</body>
</html>
`;
}

function simplePage(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/css/style.css?v=${ASSET_V}"></head>
<body class="simple"><main class="wrap doc"><a class="logo" href="/">${logo}<span>Planka / Планка</span></a>${body}</main></body></html>
`;
}

const privacy = simplePage('Privacy · Конфиденциальность', `
<h1>Privacy policy</h1>
<p>This is a demo site of a fictional company. The calculator form sends your name, phone, preferred way of contact, comment, quiz answers and the ad tags of the link you came from (utm_*) to the site owner. They are stored in the demo owner’s database and nowhere else (no Telegram bot is connected in this demo), only to show how a lead is handled. Please use made-up details, not real personal data. Your IP address is not stored; a one-way hash of it is kept to stop spam. Ask the owner to delete your data at any time.</p>
<h1 lang="ru">Политика конфиденциальности</h1>
<p lang="ru">Это демо-сайт вымышленной компании. Форма калькулятора передаёт владельцу сайта имя, телефон, удобный способ связи, комментарий, ответы квиза и рекламные метки ссылки (utm_*). Они хранятся только в демо-базе владельца (Telegram-бот в этом демо не подключён), чтобы показать, как обрабатывается заявка. Пожалуйста, указывайте выдуманные данные, а не настоящие личные. IP-адрес не хранится; для защиты от спама хранится его необратимый хеш. Попросите владельца удалить ваши данные в любой момент.</p>
<p><a href="/">← English</a> · <a href="/ru/">← Русский</a></p>`);

const notFound = simplePage('Page not found · Страница не найдена', `
<h1>Page not found</h1><p>This page does not exist. <a href="/">Go to the home page</a>.</p>
<h1 lang="ru">Страница не найдена</h1><p lang="ru">Такой страницы нет. <a href="/ru/">На главную</a>.</p>`);

export function buildSite() {
  return { 'index.html': page('en'), 'ru/index.html': page('ru'), 'privacy.html': privacy, '404.html': notFound };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL('../public/', import.meta.url);
  mkdirSync(new URL('ru/', out), { recursive: true });
  for (const [f, html] of Object.entries(buildSite())) {
    writeFileSync(new URL(f, out), html);
    console.log(`public/${f}  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
  }
}
