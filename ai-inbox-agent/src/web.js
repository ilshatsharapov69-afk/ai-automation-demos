// Server-rendered web pages: the inbox (list + detail with the draft editor) and the public request form.
import biz from '../data/business.js';
import { T, L } from './i18n.js';
import { fmtMoney, daysUntil } from './extract.js';
import { reasonsText, ownerCard } from './telegram.js';
import { replySubject } from './pipeline.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const W = {
  en: {
    app: 'AI inbox agent', inbox: 'Inbox', form: 'Try it: send a message', demoBanner: "Public demo of a fictional business. The web form is live. Email and Telegram messages are seeded samples, and the owner's Telegram alerts are previews. Please do not enter real personal data.",
    ai: { read: 'read by AI', rules: 'read by rules', draftAi: 'reply by AI', draftTpl: 'reply from template', sample: 'sample', yours: 'your message', tryTitle: 'Try the agent yourself', tryText: 'Send a message in English or Russian. The AI sorts it, pulls out the details and drafts a reply in a few seconds. It appears here, visible only to you.', tryBtn: 'Send a message', left: (n, cap) => `AI reads left for you this hour: ${n} of ${cap}`, dayOut: 'AI daily demo limit reached, showing the rule-based result.', off: 'AI is off in this deployment, results come from the rules.' },
    notes: { ip_cap: 'AI hourly demo limit for this visitor reached, showing the rule-based result.', day_cap: 'AI daily demo limit reached, showing the rule-based result.', off: 'AI is off in this deployment, showing the rule-based result.', no_ai: 'AI is not connected in this deployment, showing the rule-based result.', error: 'The AI answer was unusable, showing the rule-based result.' },
    how: 'How the agent handled it', hRead: 'Read', hExtract: 'Extracted', hScore: 'Scored', hDraft: 'Reply drafted', hOwner: 'Owner alert',
    hReadAi: (m, cat) => `AI (${m}) sorted it as ${cat}; the rules then checked every field against the message.`, hReadRules: (cat) => `Rules sorted it as ${cat}.`,
    hFields: (n) => (n ? `${n} fields found` : 'no details found'), hScoreLead: (s, hot) => `${s} of 100${hot ? ', hot lead' : ''}`, hScoreNone: 'Not a lead, no score.',
    hDraftAi: (m) => `AI (${m}) wrote it using only the FAQ facts.`, hDraftTpl: 'A template built it from the same FAQ facts.', hDraftOwner: 'Edited by the owner.', hDraftNone: 'Spam: no reply.',
    hOwnerYes: "Hot lead: this card goes to the owner's Telegram. Preview below, nothing is sent in the demo.", hOwnerNo: 'Not hot: it waits in the inbox, no Telegram ping.', hOwnerSpam: 'Spam: the owner is not pinged.',
    ownerPreview: 'What the owner would get in Telegram', previewNote: 'Preview only. No bot is connected in this public demo.',
    sampleNote: 'This is sample data and read-only. Send your own message through the form to try Approve, Edit and Reject.',
    limited: 'Too many messages from your connection this hour. Please try again later.',
    built: 'Built by Ilshat', contact: 'Telegram @shov69', builtUrl: 'https://ilshat-builds.sherlock753cc.workers.dev/',
    tiles: { total: 'Requests', hot: 'Hot leads', waiting: 'Waiting for you', spam: 'Spam filtered', by_ai: 'Read by AI' },
    filters: { all: 'All', hot: '🔥 Hot', lead: 'Leads', support: 'Support', partnership: 'Partnership', spam: 'Spam' },
    empty: 'Nothing here yet. Send a message through the web form and it will appear.',
    score: 'score', back: '← All requests', original: 'Original message', fields: 'What the agent extracted', draft: 'Draft reply',
    f: { category: 'Category', name: 'Name', email: 'Email', phone: 'Phone', telegram: 'Telegram', product: 'Product', budget: 'Budget', deadline: 'Deadline', order: 'Order', score: 'Lead score', status: 'Status', channel: 'Channel', received: 'Received' },
    conf: (c, by) => `${Math.round(c * 100)}% · by ${by}`,
    approve: '✅ Approve & send', save: '💾 Save draft', reject: '❌ Reject', mailto: '✉️ Reply in your mail app',
    demoNoSend: 'Demo inbox: approving here marks the request approved but sends nothing.',
    noDraft: 'Spam: no reply drafted, the owner was not notified.',
    flash: { approved: 'Approved.', sent: 'Reply sent.', rejected: 'Rejected.', saved: 'Draft saved.', already: 'This request was already decided.' },
    formTitle: 'Leave a request', formLead: 'Write what you need, in English or Russian. The AI agent sorts it, pulls out the details and drafts a reply from the FAQ in a few seconds. Try a kitchen quote, a broken door or a spam pitch.',
    fName: 'Your name', fContact: 'Email, phone or @telegram', fMsg: 'Message', fMsgPh: 'What do you need? Budget and deadline, if you know them.', fSend: 'Send request',
    thanks: 'Thank you! Your request has been received.', thanksNext: 'The team usually replies within one working day.',
    demoWhat: 'Here is what the agent did with it', open: 'Open it in the inbox →', another: 'Send another', yourDraft: 'Drafted reply',
    footer: `${biz.name.en} is a fictional business. Demo built on Cloudflare Workers, D1 and Workers AI.`,
    days: (d) => T.en.inDays(d),
  },
  ru: {
    app: 'ИИ-агент входящих', inbox: 'Входящие', form: 'Попробовать: написать', demoBanner: 'Публичное демо вымышленного бизнеса. Форма работает вживую. Письма и Telegram-сообщения - заготовленные примеры, а уведомления владельцу в Telegram показаны превью. Не вводите настоящие персональные данные.',
    ai: { read: 'разобрал ИИ', rules: 'разобрали правила', draftAi: 'ответ от ИИ', draftTpl: 'ответ по шаблону', sample: 'пример', yours: 'ваше сообщение', tryTitle: 'Попробуйте агента сами', tryText: 'Напишите сообщение по-русски или по-английски. ИИ за пару секунд определит тип, вытащит детали и подготовит ответ. Оно появится здесь, видно только вам.', tryBtn: 'Отправить сообщение', left: (n, cap) => `Разборов ИИ у вас на этот час: ${n} из ${cap}`, dayOut: 'Дневной демо-лимит ИИ исчерпан, показан результат по правилам.', off: 'В этой установке ИИ выключен, результат даёт разбор по правилам.' },
    notes: { ip_cap: 'Часовой демо-лимит ИИ для вашего подключения исчерпан, показан результат по правилам.', day_cap: 'Дневной демо-лимит ИИ исчерпан, показан результат по правилам.', off: 'В этой установке ИИ выключен, показан результат по правилам.', no_ai: 'В этой установке ИИ не подключён, показан результат по правилам.', error: 'Ответ ИИ не удалось использовать, показан результат по правилам.' },
    how: 'Как агент обработал заявку', hRead: 'Разбор', hExtract: 'Извлечено', hScore: 'Оценка', hDraft: 'Черновик ответа', hOwner: 'Уведомление владельцу',
    hReadAi: (m, cat) => `ИИ (${m}) определил тип: ${cat}; затем правила сверили каждое поле с текстом сообщения.`, hReadRules: (cat) => `Правила определили тип: ${cat}.`,
    hFields: (n) => (n ? `найдено полей: ${n}` : 'деталей не найдено'), hScoreLead: (s, hot) => `${s} из 100${hot ? ', горячий лид' : ''}`, hScoreNone: 'Не лид, оценки нет.',
    hDraftAi: (m) => `ИИ (${m}) написал ответ, опираясь только на факты из FAQ.`, hDraftTpl: 'Шаблон собрал ответ из тех же фактов FAQ.', hDraftOwner: 'Отредактировано владельцем.', hDraftNone: 'Спам: ответа нет.',
    hOwnerYes: 'Горячий лид: эта карточка уходит владельцу в Telegram. Ниже превью, в демо ничего не отправляется.', hOwnerNo: 'Не горячий: ждёт во входящих, без уведомления в Telegram.', hOwnerSpam: 'Спам: владельца не беспокоим.',
    ownerPreview: 'Что получил бы владелец в Telegram', previewNote: 'Только превью. В этом публичном демо бот не подключён.',
    sampleNote: 'Это пример данных, только для чтения. Отправьте своё сообщение через форму, чтобы попробовать кнопки Одобрить, Изменить и Отклонить.',
    limited: 'Слишком много сообщений с вашего подключения за этот час. Попробуйте позже.',
    built: 'Сделал Ильшат', contact: 'Telegram @shov69', builtUrl: 'https://ilshat-builds.sherlock753cc.workers.dev/ru/',
    tiles: { total: 'Заявок', hot: 'Горячих лидов', waiting: 'Ждут решения', spam: 'Спама отсеяно', by_ai: 'Разобрал ИИ' },
    filters: { all: 'Все', hot: '🔥 Горячие', lead: 'Лиды', support: 'Поддержка', partnership: 'Партнёрство', spam: 'Спам' },
    empty: 'Здесь пока пусто. Отправьте сообщение через форму, и оно появится.',
    score: 'балл', back: '← Все заявки', original: 'Исходное сообщение', fields: 'Что извлёк агент', draft: 'Черновик ответа',
    f: { category: 'Категория', name: 'Имя', email: 'Почта', phone: 'Телефон', telegram: 'Telegram', product: 'Продукт', budget: 'Бюджет', deadline: 'Срок', order: 'Заказ', score: 'Оценка лида', status: 'Статус', channel: 'Канал', received: 'Получено' },
    conf: (c, by) => `${Math.round(c * 100)}% · ${by}`,
    approve: '✅ Одобрить и отправить', save: '💾 Сохранить черновик', reject: '❌ Отклонить', mailto: '✉️ Ответить из почты',
    demoNoSend: 'Демо-входящие: одобрение здесь меняет статус, но ничего не отправляет.',
    noDraft: 'Спам: черновик не создан, владелец не уведомлён.',
    flash: { approved: 'Одобрено.', sent: 'Ответ отправлен.', rejected: 'Отклонено.', saved: 'Черновик сохранён.', already: 'По этой заявке уже есть решение.' },
    formTitle: 'Оставить заявку', formLead: 'Напишите, что нужно, по-русски или по-английски. ИИ-агент за пару секунд разберёт заявку, вытащит детали и подготовит ответ по FAQ. Попробуйте запрос цены на кухню, жалобу на сломанную дверцу или спам-рассылку.',
    fName: 'Ваше имя', fContact: 'Почта, телефон или @telegram', fMsg: 'Сообщение', fMsgPh: 'Что нужно сделать? Бюджет и срок, если знаете.', fSend: 'Отправить заявку',
    thanks: 'Спасибо! Заявка получена.', thanksNext: 'Обычно команда отвечает в течение рабочего дня.',
    demoWhat: 'Вот что агент сделал с заявкой', open: 'Открыть во входящих →', another: 'Отправить ещё', yourDraft: 'Черновик ответа',
    footer: `«${biz.name.ru}» - вымышленный бизнес. Демо на Cloudflare Workers, D1 и Workers AI.`,
    days: (d) => T.ru.inDays(d),
  },
};

const CSS = `
:root{--bg:#f6f3ec;--card:#fff;--ink:#1f1c17;--mut:#6b655a;--line:#e4ded2;--acc:#2f6b4f;--acc2:#e7f0ea;--hot:#c2410c;--hot2:#fdebe1;
--lead:#2f6b4f;--support:#1d5f8a;--partnership:#7a4fa3;--spam:#8a8378}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Segoe UI",system-ui,-apple-system,sans-serif}
a{color:var(--acc)}header{background:#23382d;color:#fff}header .in{max-width:1180px;margin:0 auto;padding:12px 20px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.brand{font-weight:700;letter-spacing:.2px}.brand small{display:block;font-weight:400;opacity:.75;font-size:12.5px}
nav{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}nav a{color:#fff;text-decoration:none;padding:6px 11px;border-radius:8px;font-size:14px}nav a.on,nav a:hover{background:rgba(255,255,255,.14)}
.banner{background:#fff6dd;border-bottom:1px solid #eedfb0;color:#6a5413;font-size:13px;text-align:center;padding:6px 16px}
main{max-width:1180px;margin:0 auto;padding:20px}
.tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}.tile b{display:block;font-size:26px;line-height:1.1}.tile span{color:var(--mut);font-size:13px}
.tile.hot b{color:var(--hot)}
.filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.filters a{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 12px;text-decoration:none;color:var(--ink);font-size:13.5px}
.filters a.on{background:var(--ink);color:#fff;border-color:var(--ink)}.filters a i{font-style:normal;color:var(--mut);margin-left:4px}.filters a.on i{color:#cfc8bb}
.list{display:flex;flex-direction:column;gap:8px}
.row{display:grid;grid-template-columns:130px 1fr 120px;gap:14px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-decoration:none;color:inherit}
.row:hover{border-color:#c9c0ae}.row.hot{border-left:4px solid var(--hot)}.row.spam{opacity:.62}
.when{font-size:12.5px;color:var(--mut)}.when b{display:block;color:var(--ink);font-size:13.5px;font-weight:600}
.who{font-weight:600}.who span{font-weight:400;color:var(--mut);font-size:13.5px}.sum{margin:2px 0 6px;color:#3a352d}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{font-size:12px;border-radius:6px;padding:1px 8px;background:#f1ede4;color:#4b463d;white-space:nowrap}
.cat{color:#fff;font-weight:600}.cat.lead{background:var(--lead)}.cat.support{background:var(--support)}.cat.partnership{background:var(--partnership)}.cat.spam{background:var(--spam)}
.chip.hotc{background:var(--hot2);color:var(--hot);font-weight:600}
.side{text-align:right}.sc{font-size:22px;font-weight:700;line-height:1}.sc small{font-size:11px;color:var(--mut);font-weight:400;display:block}.sc.h{color:var(--hot)}
.st{display:inline-block;margin-top:6px;font-size:11.5px;border-radius:999px;padding:2px 8px;background:#efeae0;color:#5b554a}.st.new{background:#fff1c7;color:#7a5a00}.st.sent,.st.approved{background:var(--acc2);color:var(--acc)}.st.rejected{background:#f3e3e3;color:#8b2b2b}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:12px;padding:30px;text-align:center;color:var(--mut)}
.grid{display:grid;grid-template-columns:1.05fr 1fr;gap:16px}.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.box h2{font-size:14px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut);margin:0 0 10px}
.msg{white-space:pre-wrap;font:inherit;background:#faf8f3;border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0}.subj{font-weight:600;margin-bottom:6px}
table.kv{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}table.kv td{padding:6px 4px;border-top:1px solid var(--line);vertical-align:top}table.kv td:first-child{color:var(--mut);width:34%}
.why{font-size:12.5px;color:var(--mut)}
textarea{width:100%;min-height:360px;font:inherit;font-size:14.5px;line-height:1.5;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fffdf9;resize:vertical}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}button,.btn{font:inherit;font-size:14px;border:0;border-radius:9px;padding:9px 14px;cursor:pointer;text-decoration:none;display:inline-block}
.ok{background:var(--acc);color:#fff}.sv{background:#ece6da;color:var(--ink)}.no{background:#f6e1e1;color:#8b2b2b}.ml{background:#e3ecf5;color:#1d4f73}
.note{font-size:12.5px;color:var(--mut);margin-top:10px}.flash{background:var(--acc2);color:var(--acc);border-radius:10px;padding:8px 12px;margin-bottom:12px;font-weight:600}
.back{display:inline-block;margin-bottom:12px;text-decoration:none}
.formcard{max-width:560px;margin:10px auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px 24px}
.formcard h1{margin:0 0 6px;font-size:24px}.formcard p.lead{color:var(--mut);margin:0 0 16px}label{display:block;font-weight:600;font-size:14px;margin:12px 0 4px}
input[type=text]{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#fffdf9}.formcard textarea{min-height:140px}
.hp{position:absolute;left:-5000px}.formcard .ok{margin-top:16px;width:100%;padding:12px}
footer{max-width:1180px;margin:0 auto;padding:10px 20px 30px;color:var(--mut);font-size:12.5px}
.chip.aic{background:#e4f1ea;color:#1f5a3f;font-weight:600}.chip.rc{background:#eee9df;color:#6b655a}.chip.smp{background:#f3efe6;color:#8a8378;border:1px dashed #d8d1c2}.chip.mine{background:#e6eef8;color:#1d4f73;font-weight:600}
.try{display:flex;gap:16px;align-items:center;flex-wrap:wrap;background:linear-gradient(135deg,#e9f3ed,#f6f3ec);border:1px solid #cfe2d6;border-radius:14px;padding:14px 18px;margin-bottom:16px}
.try h2{margin:0 0 2px;font-size:17px}.try p{margin:0;color:#3d4a42;font-size:14px;max-width:640px}.try .go{margin-left:auto;text-align:center}.try .go a{display:inline-block;background:var(--acc);color:#fff;text-decoration:none;font-weight:600;border-radius:10px;padding:10px 18px}.try .go small{display:block;color:var(--mut);margin-top:6px;font-size:12.5px}
.aiwarn{background:#fff6dd;border:1px solid #eedfb0;color:#6a5413;border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:13.5px}
.how{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:16px}.how h2{font-size:14px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut);margin:0 0 10px}
.steps{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.step{background:#faf8f3;border:1px solid var(--line);border-radius:10px;padding:9px 11px;font-size:13px;line-height:1.4}.step b{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--mut);margin-bottom:3px}
.step.ai{background:#eaf4ee;border-color:#cfe2d6}.step.ai b{color:#1f5a3f}
.tgprev{background:#e7ebf0;border-radius:14px;padding:14px;margin-top:16px}.tgprev h2{margin:0 0 4px}.tgprev .pn{font-size:12.5px;color:var(--mut);margin-bottom:10px}
.tgmsg{background:#fff;border-radius:12px 12px 12px 4px;padding:10px 12px;font-size:14px;white-space:pre-wrap;box-shadow:0 1px 1px rgba(0,0,0,.08);max-width:520px;overflow-wrap:anywhere}.tgmsg blockquote{margin:4px 0;padding:2px 0 2px 10px;border-left:3px solid #7aa7d6;color:#2b3440}
.tgkb{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;max-width:520px}.tgkb span{flex:1;min-width:110px;text-align:center;background:#d6e0ec;color:#2b4a6b;border-radius:8px;padding:7px 8px;font-size:13px}
.samplenote{background:#f3efe6;border:1px dashed #d8d1c2;border-radius:10px;padding:10px 12px;font-size:13.5px;color:#5b554a;margin-top:12px}.samplenote a{font-weight:600}
.drafted{white-space:pre-wrap;background:#faf8f3;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0;font-size:14px}
.built{display:flex;gap:14px;flex-wrap:wrap;margin-top:6px}.built a{color:var(--mut)}
@media (max-width:820px){.steps{grid-template-columns:1fr 1fr}.try .go{margin-left:0;width:100%;text-align:left}.try .go a{display:block;text-align:center}.banner{font-size:12px;padding:5px 12px}.try{padding:10px 14px;gap:8px;margin-bottom:12px}.try h2{font-size:15px}.try p{display:none}.try .go small{margin-top:4px}.tiles{grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.tile{padding:8px 10px}.tile b{font-size:20px}.tile span{font-size:12px}.filters{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}.filters a{white-space:nowrap}main{padding:14px}.grid{grid-template-columns:1fr}.row{grid-template-columns:1fr auto}.row .when{grid-column:1/-1;display:flex;gap:8px}.row .when b{display:inline}}
`;

export function langFrom(url, req) {
  const q = url.searchParams.get('lang');
  if (q === 'ru' || q === 'en') return q;
  return /^ru|,\s*ru/i.test(req.headers.get('Accept-Language') || '') ? 'ru' : 'en';
}

function layout(lang, title, active, body, { demo, path = '/inbox' } = {}) {
  const w = W[lang];
  const other = lang === 'ru' ? 'en' : 'ru';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(biz.short)}</title><style>${CSS}</style></head><body>
<header><div class="in"><div class="brand">${esc(biz.name[lang])}<small>${w.app}${demo ? ' · demo' : ''}</small></div>
<nav><a href="/inbox?lang=${lang}" class="${active === 'inbox' ? 'on' : ''}">${w.inbox}</a><a href="/form?lang=${lang}" class="${active === 'form' ? 'on' : ''}">${w.form}</a><a href="${esc(path)}${path.includes('?') ? '&' : '?'}lang=${other}">${other.toUpperCase()}</a></nav></div></header>
${demo ? `<div class="banner">${w.demoBanner}</div>` : ''}
<main>${body}</main><footer>${w.footer}<div class="built"><a href="${w.builtUrl}">${w.built}</a><a href="https://t.me/shov69">${w.contact}</a></div></footer></body></html>`;
}

function fmtWhen(iso, lang) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(d);
  return { day, time };
}
const fmtDate = (iso, lang) => new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
const modelShort = (m) => String(m || '').replace(/^@cf\//, '').replace(/^meta\//, '');

/** Which path produced the result: the AI or the rules, plus where the message comes from. */
function pathChips(r, lang) {
  const a = W[lang].ai;
  const out = [];
  out.push(r.classified_by === 'ai' ? `<span class="chip aic">🤖 ${a.read}</span>` : `<span class="chip rc">📏 ${a.rules}</span>`);
  if (r.draft_source === 'ai') out.push(`<span class="chip aic">✍️ ${a.draftAi}</span>`);
  else if (r.draft_source === 'template') out.push(`<span class="chip rc">📄 ${a.draftTpl}</span>`);
  if (r.origin === 'seed') out.push(`<span class="chip smp">${a.sample}</span>`);
  if (r.origin === 'visitor') out.push(`<span class="chip mine">${a.yours}</span>`);
  return out.join('');
}

function chipsFor(r, lang, now) {
  const t = T[lang];
  const out = [`<span class="chip cat ${r.category}">${t.cat[r.category]}</span>`];
  if (r.category === 'spam') return out.concat(pathChips(r, lang)).join(''); // numbers in a spam pitch are not a budget
  if (r.hot) out.push(`<span class="chip hotc">🔥 ${lang === 'ru' ? 'горячий' : 'hot'}</span>`);
  if (r.product) out.push(`<span class="chip">🪵 ${esc(t.product[r.product])}</span>`);
  if (r.budget_amount != null) out.push(`<span class="chip">💰 ${esc(fmtMoney(r.budget_amount, r.budget_currency, lang))}</span>`);
  if (r.deadline_date) out.push(`<span class="chip">📅 ${esc(fmtDate(r.deadline_date, lang))} · ${t.inDays(daysUntil(r.deadline_date, now))}</span>`);
  if (r.order_no) out.push(`<span class="chip">🧾 #${esc(r.order_no)}</span>`);
  return out.concat(pathChips(r, lang)).join('');
}

const aiNote = (r, lang) => (r.ai_note && r.ai_note !== 'ok' && W[lang].notes[r.ai_note] ? `<div class="aiwarn">${W[lang].notes[r.ai_note]}</div>` : '');

function leftLine(left, lang) {
  const a = W[lang].ai;
  if (!left) return '';
  if (!left.on) return a.off;
  if (left.dayLeft === 0) return a.dayOut;
  return a.left(left.ip, left.ipCap);
}

export function inboxPage({ rows, stats, lang, filter = 'all', demo, now, flash, left }) {
  const w = W[lang];
  const t = T[lang];
  const tiles = ['total', 'hot', 'waiting', 'spam', 'by_ai']
    .map((k) => `<div class="tile ${k === 'hot' ? 'hot' : ''}"><b>${stats[k] || 0}</b><span>${w.tiles[k]}</span></div>`).join('');
  const counts = { all: stats.total, hot: stats.hot, lead: stats.lead, support: stats.support, partnership: stats.partnership, spam: stats.spam };
  const filters = Object.keys(w.filters)
    .map((k) => `<a href="/inbox?cat=${k}&lang=${lang}" class="${filter === k ? 'on' : ''}">${w.filters[k]}<i>${counts[k] || 0}</i></a>`).join('');
  const list = rows.length
    ? rows.map((r) => {
        const when = fmtWhen(r.created_at, lang);
        const who = esc(r.name || r.email || r.telegram || r.phone || r.sender || '-');
        const contact = [r.email, r.phone, r.telegram].filter(Boolean).filter((x) => x !== r.name).slice(0, 2).map(esc).join(' · ');
        return `<a class="row ${r.hot ? 'hot' : ''} ${r.category === 'spam' ? 'spam' : ''}" href="/inbox/${r.id}?lang=${lang}">
<div class="when"><b>${t.chanIcon[r.channel]} ${t.chan[r.channel]}</b>${when.day}, ${when.time}</div>
<div><div class="who">${who}${contact && r.name ? ` <span>· ${contact}</span>` : ''}</div><div class="sum">${esc(r.summary)}</div><div class="chips">${chipsFor(r, lang, now)}</div></div>
<div class="side">${r.category === 'lead' ? `<div class="sc ${r.hot ? 'h' : ''}">${r.score}<small>${w.score} /100</small></div>` : ''}<span class="st ${r.status}">${t.st[r.status]}</span></div></a>`;
      }).join('\n')
    : `<div class="empty">${w.empty}</div>`;
  const fl = flash && w.flash[flash] ? `<div class="flash">${w.flash[flash]}</div>` : '';
  const tryBox = demo
    ? `<div class="try"><div><h2>🤖 ${w.ai.tryTitle}</h2><p>${w.ai.tryText}</p></div><div class="go"><a href="/form?lang=${lang}">${w.ai.tryBtn} →</a><small>${leftLine(left, lang)}</small></div></div>`
    : '';
  return layout(lang, w.inbox, 'inbox', `${fl}${tryBox}<div class="tiles">${tiles}</div><div class="filters">${filters}</div><div class="list">${list}</div>`, { demo, path: `/inbox?cat=${filter}` });
}

/** The agent's path for one request, step by step: which parts the AI did and which the rules did. */
function howPanel(r, lang) {
  const w = W[lang];
  const t = T[lang];
  const ai = r.classified_by === 'ai';
  const fields = [r.name, r.email, r.phone, r.telegram, r.product, r.order_no, r.budget_amount, r.deadline_date].filter((x) => x != null && x !== '').length;
  const draftTxt = r.draft_source === 'ai' ? w.hDraftAi(esc(modelShort(r.ai_draft_model))) : r.draft_source === 'template' ? w.hDraftTpl : r.draft_source === 'owner' ? w.hDraftOwner : w.hDraftNone;
  const owner = r.category === 'spam' ? w.hOwnerSpam : r.hot ? w.hOwnerYes : w.hOwnerNo;
  const step = (cls, h, txt) => `<div class="step ${cls}"><b>${h}</b>${txt}</div>`;
  return `<div class="how"><h2>${w.how}</h2><div class="steps">
${step(ai ? 'ai' : '', `${ai ? '🤖' : '📏'} ${w.hRead}`, ai ? w.hReadAi(esc(modelShort(r.ai_model)), t.cat[r.category]) : w.hReadRules(t.cat[r.category]))}
${step('', `🔎 ${w.hExtract}`, w.hFields(fields))}
${step('', `📊 ${w.hScore}`, r.category === 'lead' ? w.hScoreLead(r.score, r.hot) : w.hScoreNone)}
${step(r.draft_source === 'ai' ? 'ai' : '', `✍️ ${w.hDraft}`, draftTxt)}
${step('', `📨 ${w.hOwner}`, owner)}
</div></div>${aiNote(r, lang)}`;
}
function ownerPreview(r, lang, now, origin) {
  const w = W[lang];
  if (r.category === 'spam' || !r.hot) return '';
  const card = ownerCard(r, lang, { origin, now });
  const kb = (card.reply_markup.inline_keyboard || []).flat().map((b) => `<span>${esc(b.text)}</span>`).join('');
  return `<div class="tgprev"><h2>📱 ${w.ownerPreview}</h2><div class="pn">${w.previewNote}</div><div class="tgmsg">${card.text}</div><div class="tgkb">${kb}</div></div>`;
}

export function detailPage({ row: r, lang, demo, owner, now, flash, origin }) {
  const w = W[lang];
  const t = T[lang];
  const when = fmtWhen(r.created_at, lang);
  const mine = r.origin === 'visitor';
  const kv = [
    [w.f.channel, `${t.chanIcon[r.channel]} ${t.chan[r.channel]} · ${when.day}, ${when.time}`],
    [w.f.category, `<span class="chip cat ${r.category}">${t.cat[r.category]}</span> <span class="why">${w.conf(r.confidence || 0, t.by[r.classified_by])}</span>`],
    [w.f.name, esc(r.name)], [w.f.email, esc(r.email)], [w.f.phone, esc(r.phone)], [w.f.telegram, esc(r.telegram)],
    [w.f.product, r.product ? esc(t.product[r.product]) : ''],
    [w.f.budget, r.budget_amount != null && r.category !== 'spam' ? `${esc(fmtMoney(r.budget_amount, r.budget_currency, lang))} <span class="why">«${esc(r.budget_text)}»</span>` : ''],
    [w.f.deadline, r.deadline_date && r.category !== 'spam' ? `${esc(fmtDate(r.deadline_date, lang))} · ${t.inDays(daysUntil(r.deadline_date, now))} <span class="why">«${esc(r.deadline_text)}»</span>` : ''],
    [w.f.order, r.order_no ? '#' + esc(r.order_no) : ''],
    [w.f.score, r.category === 'lead' ? `<b style="color:${r.hot ? 'var(--hot)' : 'inherit'}">${r.score}/100${r.hot ? ' 🔥' : ''}</b><div class="why">${esc(reasonsText(r, lang))}</div>` : ''],
    [w.f.status, `<span class="st ${r.status}">${t.st[r.status]}</span>`],
  ].filter(([, v]) => v).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  const canAct = owner || mine; // sample data is read-only for the public
  const editable = r.status === 'new' && r.draft && canAct;
  const mail = r.email && r.draft && canAct && (r.status === 'approved' || r.status === 'new')
    ? `<a class="btn ml" href="mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(replySubject(r))}&body=${encodeURIComponent(r.draft)}">${w.mailto}</a>` : '';
  const right = r.draft
    ? `<form method="post" action="/inbox/${r.id}?lang=${lang}"><textarea name="draft" ${editable ? '' : 'readonly'}>${esc(r.draft)}</textarea>
<div class="why">${t.by[r.draft_source] || r.draft_source}</div>
<div class="btns">${editable ? `<button class="ok" name="action" value="approve">${w.approve}</button><button class="sv" name="action" value="save">${w.save}</button><button class="no" name="action" value="reject">${w.reject}</button>` : ''}${mail}</div></form>
${demo && !owner && editable ? `<div class="note">${w.demoNoSend}</div>` : ''}${demo && !canAct ? `<div class="samplenote">${w.sampleNote} <a href="/form?lang=${lang}">${w.form} →</a></div>` : ''}`
    : `<div class="note">${w.noDraft}</div>${demo && !canAct ? `<div class="samplenote">${w.sampleNote} <a href="/form?lang=${lang}">${w.form} →</a></div>` : ''}`;
  const fl = flash && w.flash[flash] ? `<div class="flash">${w.flash[flash]}</div>` : '';
  return layout(lang, `#${r.id}`, 'inbox', `${fl}<a class="back" href="/inbox?lang=${lang}">${w.back}</a>
${howPanel(r, lang)}
<div class="grid"><div class="box"><h2>${w.original} · #${r.id}</h2>${r.subject ? `<div class="subj">${esc(r.subject)}</div>` : ''}<pre class="msg">${esc(r.body)}</pre>
<h2 style="margin-top:18px">${w.fields}</h2><table class="kv">${kv}</table></div>
<div class="box"><h2>${w.draft}</h2>${right}${ownerPreview(r, lang, now, origin)}</div></div>`, { demo, path: `/inbox/${r.id}` });
}

export function formPage({ lang, demo, done, left, limited }) {
  const w = W[lang];
  let body;
  if (done) {
    const r = done;
    body = `<div class="formcard"><h1>${w.thanks}</h1><p class="lead">${w.thanksNext}</p>
${demo ? `<div class="box" style="margin-top:8px"><h2>${w.demoWhat}</h2><div class="chips" style="margin-bottom:8px">${chipsFor(r, lang, new Date())}</div>${aiNote(r, lang)}
<div class="sum">${esc(r.summary)}</div>${r.category === 'lead' ? `<div class="why">${w.f.score}: ${r.score}/100${r.hot ? ' 🔥' : ''}</div>` : ''}
${r.draft ? `<h2 style="margin-top:12px">${w.yourDraft}</h2><div class="drafted">${esc(r.draft)}</div>` : ''}${r.id ? `<p><a href="/inbox/${r.id}?lang=${lang}">${w.open}</a></p>` : ''}</div>` : ''}
<p><a href="/form?lang=${lang}">${w.another}</a> · <small>${leftLine(left, lang)}</small></p></div>`;
  } else {
    body = `<form class="formcard" method="post" action="/form?lang=${lang}"><h1>${w.formTitle}</h1><p class="lead">${w.formLead}</p>
${limited ? `<div class="aiwarn">${w.limited}</div>` : ''}
<input type="hidden" name="lang" value="${lang}"><div class="hp"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<label for="n">${w.fName}</label><input type="text" id="n" name="name" maxlength="80" required>
<label for="c">${w.fContact}</label><input type="text" id="c" name="contact" maxlength="200" required>
<label for="m">${w.fMsg}</label><textarea id="m" name="message" maxlength="4000" required placeholder="${esc(w.fMsgPh)}"></textarea>
<button class="ok" type="submit">${w.fSend}</button><div class="note">${leftLine(left, lang)}<br>${esc(biz.note[lang])}</div></form>`;
  }
  return layout(lang, w.formTitle, 'form', body, { demo, path: '/form' });
}
