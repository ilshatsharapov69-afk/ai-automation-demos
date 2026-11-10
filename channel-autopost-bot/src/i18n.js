// Every user-facing text, EN and RU. Bot messages are plain text (no parse_mode), so user content needs no escaping.

export const pickLang = (code) => (String(code || '').toLowerCase().startsWith('ru') ? 'ru' : 'en');

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};
const short = (s, n = 42) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
export { short };

export const DEMO_TITLE = { en: 'Pinecone Coffee Notes', ru: 'Кофейные заметки Pinecone' };

const en = {
  lang: 'en',
  menu: { new: '➕ New post', ai: '✨ AI draft', queue: '🗓 Queue', stats: '📊 Stats', schedule: '⚙️ Schedule', paid: '💳 Paid access', subscribe: '💳 Subscribe', access: '🎫 My access' },
  start: (name, title, demo) =>
    `Hi, ${name}! I run the channel «${title}» for you.\n\n` +
    '➕ Send me text or a photo with a caption: it goes to the queue as a draft.\n' +
    '✨ Give me a topic: I write a draft with AI.\n' +
    '✅ Every draft comes as a preview with Approve / Edit buttons.\n' +
    '⏰ Approved posts go out by themselves at your time slots.\n' +
    '📊 Stats of what was published; 💳 a paid-access flow for a private channel.' +
    (demo ? '\n\nDemo mode: this is your own sandbox with a fictional coffee channel. «Published» posts arrive in this chat instead of a channel. /reset starts over.' : ''),
  subscriberStart: (name, title) => `Hi, ${name}! This bot sells access to the private channel «${title}».\n\nPress 💳 Subscribe to choose a plan, 🎫 My access to see your subscription.`,
  help: 'Commands: /new, /draft <topic>, /queue, /schedule, /slots 09:00 19:00, /tz +2, /title <name>, /stats, /subscribe, /status, /lang, /cancel' ,
  newPost: 'Send the post: text, or a photo with a caption (formatting, links and emoji are kept). Forwarded posts work too.',
  askTopic: 'What should the post be about? One line, e.g. «how to store coffee beans at home».',
  writing: '✍️ Writing a draft…',
  cancelled: 'OK, cancelled.',
  nothingToCancel: 'Nothing to cancel.',
  tooLongCaption: (n) => `A photo caption can be up to 1024 characters; this one has ${n}. Shorten it or send the text without a photo.`,
  tooLongText: (n) => `A post can be up to 4096 characters; this one has ${n}.`,
  emptyPost: 'There is nothing to post. Send text or a photo.',
  unsupported: 'I can queue text and photos. For other formats (video, albums, polls) see the README: they are a small extension.',
  // preview footer
  srcManual: '✍️ by you',
  srcAi: '✨ AI draft (Workers AI)',
  srcStub: '✨ AI draft (offline template)',
  stDraft: (id, src) => `📝 Draft #${id} · ${src}`,
  stApproved: (id, when) => `✅ Approved #${id} · goes out ${when}`,
  stPublished: (id, when) => `📣 Published #${id} · ${when}`,
  stFailed: (id, err) => `⚠️ #${id} was not published: ${err}`,
  stDeleted: (id) => `🗑 Draft #${id} deleted.`,
  btn: { approve: '✅ Approve', edit: '✏️ Edit', time: '🕐 Set time', del: '🗑 Delete', regen: '🔄 Another version', now: '⚡ Publish now', back: '↩️ Back to drafts', retry: '⚡ Try again', open: (id) => `#${id}`, slots: '⚙️ Time slots', cancel: '✖️ Cancel', custom: '✍️ My own times' },
  askEdit: (id) => `Send the new version of #${id}: text replaces the text, a photo replaces the photo (its caption becomes the text). /cancel to keep it as is.`,
  askTime: (id, tz) => `When should #${id} go out? Times are ${tz}. Examples: 18:30 · tomorrow 9:00 · 07.11 18:30 · 2026-11-07 18:30`,
  badTime: 'I did not get the time. Examples: 18:30 · tomorrow 9:00 · 07.11 18:30 (/cancel to stop)',
  replaced: (id) => `✏️ #${id} was changed: the new version is below.`,
  noSlot: 'No free slot in the next 90 days. Add time slots in ⚙️ Schedule.',
  notFound: 'This post is gone (deleted or reset).',
  alreadyPublished: 'Already published.',
  toast: { approved: (when) => `Approved: ${when}`, back: 'Back to drafts', deleted: 'Deleted', published: 'Published', failed: 'Not published, see the message', regen: 'New version' },
  publishedNotice: (title) => `↑ Published to «${title}». Demo: posts come to this chat instead of a channel.`,
  failNotice: (id, err) => `⚠️ Post #${id} was not published: ${err}\nCheck that the bot is an admin of the channel with the «Post messages» right, then press «Try again» on the preview.`,
  queue: (title, slots, tz, items, drafts) =>
    `🗓 Queue · ${title}\nSlots: ${slots.join(' · ')} (${tz})\n\n` +
    (items.length ? `Scheduled (${items.length}):\n${items.join('\n')}` : 'Nothing scheduled. Approve a draft and it takes the next free slot.') +
    (drafts.length ? `\n\nDrafts waiting for you (${drafts.length}):\n${drafts.join('\n')}` : '') +
    '\n\nTap a number to open the preview.',
  queueItem: (when, id, text) => `• ${when} — #${id} ${text}`,
  draftItem: (id, text) => `• #${id} ${text}`,
  photoOnly: '[photo]',
  schedule: (slots, tz) =>
    `⚙️ Schedule\nApproved posts go out at: ${slots.join(' · ')} (${tz}), one post per slot, in order.\n\n` +
    'Pick a preset or set your own: /slots 08:30 12:00 20:00\nTime zone: /tz +2 (or /tz -5, /tz 0)\nPosts that are already scheduled keep their times.',
  presets: [['10:00'], ['09:00', '19:00'], ['09:00', '13:00', '19:00']],
  presetLabel: (s) => `${s.length}×/day: ${s.join(' · ')}`,
  askSlots: 'Send the times, separated by spaces: 08:30 12:00 20:00',
  badSlots: 'Times look like 09:00 or 18:30, separated by spaces (up to 12).',
  slotsSet: (slots, tz) => `Saved. Slots: ${slots.join(' · ')} (${tz}).`,
  badTz: 'Time zone looks like +2, -5, +5:30 or 0 (UTC).',
  tzSet: (tz) => `Time zone saved: ${tz}.`,
  titleSet: (t) => `Channel name saved: «${t}».`,
  channelSet: (c) => `Posts will go to ${c}. Make the bot an admin there with the «Post messages» right.`,
  badChannel: 'Send the channel as @username or its numeric id (-100…).',
  stats: (s) =>
    `📊 Stats · ${s.title}\n\n` +
    `Published: ${s.total} in total, ${s.week} in the last 7 days\n\n` +
    `${s.bars}\n\n` +
    `With photo: ${s.photo} · text only: ${s.text}\n` +
    `AI drafts: ${s.ai} · written by you: ${s.manual}\n` +
    `Average length: ${s.avgLen} characters\n` +
    (s.lastAt ? `Last post: ${s.lastAt}\n` : '') +
    `\nQueue: ${s.queued} scheduled` + (s.nextAt ? `, next ${s.nextAt}` : '') + (s.coverUntil ? `; content until ${s.coverUntil}` : '') +
    `\nDrafts waiting: ${s.drafts}` + (s.failed ? `\nNot published (needs attention): ${s.failed}` : '') +
    `\n\n💳 Paid access: ${s.subs} active · ${s.revenue} (mock payments)` +
    `\nAI drafts today: ${s.aiUsed} of ${s.aiLimit}`,
  // paid access (MOCK)
  plansIntro: (title) =>
    `💳 Access to the private channel «${title}»\n\n` +
    '⚠️ MOCK PAYMENT. This is a demo of the flow: no card is asked and no money is charged. ' +
    'In a real setup this step becomes a Telegram Stars invoice or a payment page of your provider.\n\nChoose a plan:',
  plan: { m1: '1 month', m3: '3 months', y1: '1 year' },
  planBtn: (name, price) => `${name} — ${price}`,
  checkout: (plan, price) =>
    `🧾 Checkout (MOCK)\nPlan: ${plan}\nTotal: ${price}\n\nNothing is charged: the button below only simulates a successful payment.`,
  payBtn: (price) => `💳 Pay ${price} (mock)`,
  paid: (plan, until) => `✅ Payment received (mock). Plan: ${plan}. Access until ${until}.`,
  inviteReal: '🔗 Your personal invite link (one person, valid 24 hours):',
  inviteBtn: '➡️ Join the channel',
  inviteDemo: '🔗 Demo: here a live bot sends a one-person invite link to your private channel (createChatInviteLink, valid 24 h). Nothing is created in the demo.',
  inviteFail: (err) => `Could not create the invite link: ${err}. The owner has been told and will send it to you.`,
  payCancelled: 'Payment cancelled. Nothing was charged.',
  payStale: 'This checkout is no longer valid. Open 💳 again.',
  status: (plan, until, left) => `🎫 Your access: ${plan}, active until ${until} (${left}).`,
  daysLeft: (n) => `${n} ${n === 1 ? 'day' : 'days'} left`,
  noAccess: 'You have no active access. Press 💳 to choose a plan.',
  renewBtn: '🔁 Renew',
  simulateBtn: '⏩ Simulate the end of access (demo)',
  ownerNewSub: (who, plan, until) => `💰 New subscriber (mock payment): ${who}, ${plan}, until ${until}.`,
  remind: (until) => `⏳ Your access to the channel ends ${until}. Renew so you do not lose it.`,
  expired: (title) => `Your access to «${title}» has ended.` ,
  expiredDemo: ' Demo: a live bot also removes the member from the private channel here (banChatMember + unbanChatMember).',
  subscriberOnly: 'This bot sells access to a private channel. Press 💳 Subscribe.',
  aiLimit: (n) => `The AI limit for today (${n} drafts) is used up, so this one is from the offline template.`,
  langSet: 'Language: English.',
  reset: 'Sandbox reset: fictional channel, sample queue and history restored.',
  resetLive: '/reset only works in demo mode.',
  id: (id) => `Your Telegram id: ${id}`,
};

const ru = {
  lang: 'ru',
  menu: { new: '➕ Новый пост', ai: '✨ Черновик с ИИ', queue: '🗓 Очередь', stats: '📊 Статистика', schedule: '⚙️ Расписание', paid: '💳 Платный доступ', subscribe: '💳 Оформить доступ', access: '🎫 Мой доступ' },
  start: (name, title, demo) =>
    `Привет, ${name}! Я веду для вас канал «${title}».\n\n` +
    '➕ Пришлите текст или фото с подписью — пост встанет в очередь черновиком.\n' +
    '✨ Дайте тему — напишу черновик с помощью ИИ.\n' +
    '✅ Каждый черновик приходит превью с кнопками «Одобрить» / «Изменить».\n' +
    '⏰ Одобренные посты выходят сами в ваши слоты по расписанию.\n' +
    '📊 Статистика опубликованного; 💳 продажа доступа в закрытый канал.' +
    (demo ? '\n\nДемо-режим: это ваша личная песочница с вымышленным кофейным каналом. «Опубликованные» посты приходят в этот чат вместо канала. /reset — начать заново.' : ''),
  subscriberStart: (name, title) => `Привет, ${name}! Через этого бота оформляется доступ в закрытый канал «${title}».\n\n💳 Оформить доступ — выбрать тариф, 🎫 Мой доступ — посмотреть подписку.`,
  help: 'Команды: /new, /draft <тема>, /queue, /schedule, /slots 09:00 19:00, /tz +2, /title <название>, /stats, /subscribe, /status, /lang, /cancel',
  newPost: 'Пришлите пост: текст или фото с подписью (жирный, ссылки и эмодзи сохранятся). Пересланные посты тоже подходят.',
  askTopic: 'О чём пост? Одной строкой, например: «как хранить кофейные зёрна дома».',
  writing: '✍️ Пишу черновик…',
  cancelled: 'Хорошо, отменил.',
  nothingToCancel: 'Отменять нечего.',
  tooLongCaption: (n) => `Подпись к фото — до 1024 символов, здесь ${n}. Сократите или пришлите текст без фото.`,
  tooLongText: (n) => `Пост — до 4096 символов, здесь ${n}.`,
  emptyPost: 'Публиковать нечего. Пришлите текст или фото.',
  unsupported: 'В очередь можно поставить текст и фото. Видео, альбомы и опросы — небольшая доработка, см. README.',
  srcManual: '✍️ ваш текст',
  srcAi: '✨ черновик ИИ (Workers AI)',
  srcStub: '✨ черновик ИИ (офлайн-шаблон)',
  stDraft: (id, src) => `📝 Черновик #${id} · ${src}`,
  stApproved: (id, when) => `✅ Одобрен #${id} · выйдет ${when}`,
  stPublished: (id, when) => `📣 Опубликован #${id} · ${when}`,
  stFailed: (id, err) => `⚠️ #${id} не опубликован: ${err}`,
  stDeleted: (id) => `🗑 Черновик #${id} удалён.`,
  btn: { approve: '✅ Одобрить', edit: '✏️ Изменить', time: '🕐 Время', del: '🗑 Удалить', regen: '🔄 Другой вариант', now: '⚡ Опубликовать сейчас', back: '↩️ В черновики', retry: '⚡ Ещё раз', open: (id) => `#${id}`, slots: '⚙️ Слоты', cancel: '✖️ Отмена', custom: '✍️ Своё время' },
  askEdit: (id) => `Пришлите новую версию #${id}: текст заменит текст, фото заменит фото (подпись станет текстом). /cancel — оставить как есть.`,
  askTime: (id, tz) => `Когда выпустить #${id}? Время ${tz}. Примеры: 18:30 · завтра 9:00 · 07.11 18:30 · 2026-11-07 18:30`,
  badTime: 'Не понял время. Примеры: 18:30 · завтра 9:00 · 07.11 18:30 (/cancel — отменить)',
  replaced: (id) => `✏️ #${id} изменён: новая версия ниже.`,
  noSlot: 'Свободных слотов на 90 дней нет. Добавьте время в ⚙️ Расписании.',
  notFound: 'Этого поста уже нет (удалён или сброшен).',
  alreadyPublished: 'Уже опубликован.',
  toast: { approved: (when) => `Одобрен: ${when}`, back: 'Вернул в черновики', deleted: 'Удалён', published: 'Опубликован', failed: 'Не опубликован, см. сообщение', regen: 'Новый вариант' },
  publishedNotice: (title) => `↑ Опубликовано в «${title}». Демо: посты приходят в этот чат вместо канала.`,
  failNotice: (id, err) => `⚠️ Пост #${id} не опубликован: ${err}\nПроверьте, что бот — админ канала с правом «Публикация сообщений», и нажмите «Ещё раз» на превью.`,
  queue: (title, slots, tz, items, drafts) =>
    `🗓 Очередь · ${title}\nСлоты: ${slots.join(' · ')} (${tz})\n\n` +
    (items.length ? `Запланировано (${items.length}):\n${items.join('\n')}` : 'Ничего не запланировано. Одобрите черновик — он займёт ближайший свободный слот.') +
    (drafts.length ? `\n\nЧерновики ждут вас (${drafts.length}):\n${drafts.join('\n')}` : '') +
    '\n\nНажмите номер, чтобы открыть превью.',
  queueItem: (when, id, text) => `• ${when} — #${id} ${text}`,
  draftItem: (id, text) => `• #${id} ${text}`,
  photoOnly: '[фото]',
  schedule: (slots, tz) =>
    `⚙️ Расписание\nОдобренные посты выходят в: ${slots.join(' · ')} (${tz}), по одному на слот, по порядку.\n\n` +
    'Выберите готовый вариант или задайте свой: /slots 08:30 12:00 20:00\nЧасовой пояс: /tz +2 (или /tz -5, /tz 0)\nУже запланированные посты сохраняют своё время.',
  presets: [['10:00'], ['09:00', '19:00'], ['09:00', '13:00', '19:00']],
  presetLabel: (s) => `${s.length} в день: ${s.join(' · ')}`,
  askSlots: 'Пришлите время через пробел: 08:30 12:00 20:00',
  badSlots: 'Время в виде 09:00 или 18:30, через пробел (до 12 слотов).',
  slotsSet: (slots, tz) => `Сохранил. Слоты: ${slots.join(' · ')} (${tz}).`,
  badTz: 'Часовой пояс в виде +2, -5, +5:30 или 0 (UTC).',
  tzSet: (tz) => `Часовой пояс сохранён: ${tz}.`,
  titleSet: (t) => `Название канала сохранено: «${t}».`,
  channelSet: (c) => `Посты будут выходить в ${c}. Сделайте бота админом канала с правом «Публикация сообщений».`,
  badChannel: 'Пришлите канал как @username или числовой id (-100…).',
  stats: (s) =>
    `📊 Статистика · ${s.title}\n\n` +
    `Опубликовано: всего ${s.total}, за 7 дней ${s.week}\n\n` +
    `${s.bars}\n\n` +
    `С фото: ${s.photo} · только текст: ${s.text}\n` +
    `Черновики ИИ: ${s.ai} · ваши тексты: ${s.manual}\n` +
    `Средняя длина: ${s.avgLen} симв.\n` +
    (s.lastAt ? `Последний пост: ${s.lastAt}\n` : '') +
    `\nОчередь: запланировано ${s.queued}` + (s.nextAt ? `, ближайший ${s.nextAt}` : '') + (s.coverUntil ? `; контента до ${s.coverUntil}` : '') +
    `\nЧерновиков ждёт: ${s.drafts}` + (s.failed ? `\nНе опубликовано (нужно внимание): ${s.failed}` : '') +
    `\n\n💳 Платный доступ: активных ${s.subs} · ${s.revenue} (тестовые оплаты)` +
    `\nЧерновиков ИИ сегодня: ${s.aiUsed} из ${s.aiLimit}`,
  plansIntro: (title) =>
    `💳 Доступ в закрытый канал «${title}»\n\n` +
    '⚠️ ТЕСТОВАЯ ОПЛАТА (заглушка). Это демонстрация сценария: карту не спрашиваем, деньги не списываются. ' +
    'В рабочей версии здесь будет счёт в Telegram Stars или страница оплаты вашей платёжной системы.\n\nВыберите тариф:',
  plan: { m1: '1 месяц', m3: '3 месяца', y1: '1 год' },
  planBtn: (name, price) => `${name} — ${price}`,
  checkout: (plan, price) =>
    `🧾 Оформление (ЗАГЛУШКА)\nТариф: ${plan}\nК оплате: ${price}\n\nНичего не списывается: кнопка ниже только имитирует успешную оплату.`,
  payBtn: (price) => `💳 Оплатить ${price} (тест)`,
  paid: (plan, until) => `✅ Оплата получена (тестовая). Тариф: ${plan}. Доступ до ${until}.`,
  inviteReal: '🔗 Ваша личная ссылка-приглашение (на одного человека, действует 24 часа):',
  inviteBtn: '➡️ Вступить в канал',
  inviteDemo: '🔗 Демо: здесь рабочий бот присылает персональную ссылку в ваш закрытый канал (createChatInviteLink, на одного человека, 24 часа). В демо ссылка не создаётся.',
  inviteFail: (err) => `Не получилось создать ссылку: ${err}. Владелец канала уже в курсе и пришлёт её вам.`,
  payCancelled: 'Оплата отменена. Ничего не списано.',
  payStale: 'Это оформление уже не действует. Нажмите 💳 ещё раз.',
  status: (plan, until, left) => `🎫 Ваш доступ: ${plan}, действует до ${until} (${left}).`,
  daysLeft: (n) => `${plural(n, 'остался', 'осталось', 'осталось')} ${n} ${plural(n, 'день', 'дня', 'дней')}`,
  noAccess: 'Активного доступа нет. Нажмите 💳, чтобы выбрать тариф.',
  renewBtn: '🔁 Продлить',
  simulateBtn: '⏩ Имитировать окончание доступа (демо)',
  ownerNewSub: (who, plan, until) => `💰 Новый подписчик (тестовая оплата): ${who}, ${plan}, до ${until}.`,
  remind: (until) => `⏳ Доступ в канал заканчивается ${until}. Продлите, чтобы не потерять.`,
  expired: (title) => `Доступ в «${title}» закончился.`,
  expiredDemo: ' Демо: рабочий бот в этот момент ещё и исключает участника из закрытого канала (banChatMember + unbanChatMember).',
  subscriberOnly: 'Через этого бота оформляется доступ в закрытый канал. Нажмите 💳 Оформить доступ.',
  aiLimit: (n) => `Лимит ИИ на сегодня (${n} черновиков) исчерпан, этот черновик — из офлайн-шаблона.`,
  langSet: 'Язык: русский.',
  reset: 'Песочница сброшена: вымышленный канал, примерная очередь и история восстановлены.',
  resetLive: '/reset работает только в демо-режиме.',
  id: (id) => `Ваш Telegram id: ${id}`,
};

export const TEXTS = { en, ru };
export const t = (lang) => TEXTS[lang === 'ru' ? 'ru' : 'en'];

/** Reply-keyboard label -> command, for both languages. */
export const MENU_COMMANDS = (() => {
  const map = {};
  for (const L of [en, ru]) {
    map[L.menu.new] = '/new'; map[L.menu.ai] = '/draft'; map[L.menu.queue] = '/queue'; map[L.menu.stats] = '/stats';
    map[L.menu.schedule] = '/schedule'; map[L.menu.paid] = '/subscribe'; map[L.menu.subscribe] = '/subscribe'; map[L.menu.access] = '/status';
  }
  return map;
})();
