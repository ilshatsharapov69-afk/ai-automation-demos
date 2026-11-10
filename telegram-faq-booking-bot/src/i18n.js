// All user-facing text, Russian and English. Keep it plain: no markdown, HTML only for <b>.
import data from '../data/faq.json';

const B = data.business.name;

export const MENU = {
  en: { ask: '💬 Ask a question', book: '📅 Book a visit', req: '✍️ Leave a request', owner: '📊 Owner view', about: 'ℹ️ About this demo', lang: '🌐 Русский' },
  ru: { ask: '💬 Задать вопрос', book: '📅 Записаться', req: '✍️ Оставить заявку', owner: '📊 Кабинет владельца', about: 'ℹ️ О демо', lang: '🌐 English' },
};

/** Which menu action a typed text is, in either language (null if it is not a menu button). */
export function menuAction(text) {
  for (const lang of ['en', 'ru']) {
    for (const [k, v] of Object.entries(MENU[lang])) if (text === v) return k;
  }
  return null;
}

export function mainKeyboard(lang) {
  const m = MENU[lang];
  return {
    keyboard: [[{ text: m.ask }, { text: m.book }], [{ text: m.req }, { text: m.owner }], [{ text: m.about }, { text: m.lang }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export const T = {
  en: {
    welcome:
      `Hi! I am the assistant of <b>${B}</b>, a fictional beauty studio made to demo this bot.\n\n` +
      'What I can do:\n' +
      '• answer questions about prices, hours and services (try: "how much is a manicure?")\n' +
      '• book a visit in a few taps\n' +
      '• take a request and pass it to the owner\n\n' +
      'Every booking goes to the owner\'s Telegram with Confirm and Decline buttons. In this demo you get a copy of that owner card, and "Owner view" opens the admin panel.\n\n' +
      'Use test data, not your real phone number.',
    askPrompt: 'Type your question in any words, for example: "do you work on Sundays?" or "how long does colouring take?"',
    pickService: 'Step 1 of 4. Which service?',
    pickDay: (svc) => `Step 2 of 4. ${svc}: which day?`,
    pickSlot: (svc, day) => `Step 3 of 4. ${svc}, ${day}: which time?`,
    askName: 'Step 4 of 4. Your name?',
    askContact: 'Your phone number? Tap the button below or type it (a test number is fine).',
    shareContact: '📱 Share my number',
    badContact: 'That does not look like a phone number or a @username. Please send it again.',
    badName: 'Please send a name of up to 60 characters.',
    confirmBooking: (s) => `Please check your booking:\n\n${s}\n\nConfirm?`,
    btnConfirm: '✅ Confirm',
    btnCancel: '✖️ Cancel',
    bookingSent: (id) => `Done. Booking #${id} is sent to the studio. You will get a message here as soon as they confirm it.`,
    cancelled: 'Cancelled. Anything else?',
    reqName: 'Leave a request and the studio will write back here. Your name?',
    reqNote: 'What is your question or request?',
    reqSent: (id) => `Thank you. Request #${id} is sent to the studio, they will reply here.`,
    demoCardIntro: '👀 Demo: this is the card the business owner gets in their Telegram. The buttons work, try them:',
    ownerCardTitleBooking: (id) => `🆕 New booking #${id}`,
    ownerCardTitleRequest: (id) => `🆕 New request #${id}`,
    ownerBtnOk: '✅ Confirm',
    ownerBtnNo: '❌ Decline',
    clientConfirmed: (id, s) => `✅ The studio confirmed booking #${id}: ${s}. See you!`,
    clientDeclined: (id) => `The studio could not take booking #${id} at that time. Tap "📅 Book a visit" to pick another slot.`,
    clientReqDone: (id) => `✅ The studio took request #${id} and will reply here shortly.`,
    statusSet: (st) => `Status: ${st}`,
    st: { new: 'new', confirmed: 'confirmed', declined: 'declined' },
    noAnswer: 'I do not have an exact answer to that. I can pass your question to the studio and they will reply here.',
    btnHandoff: '✍️ Pass it to the studio',
    btnBook: '📅 Book a visit',
    remindButtons: 'Booking is in progress: please pick an option with the buttons above, or send /cancel.',
    langSet: 'Language: English.',
    yourId: (id) => `Your chat id: <code>${id}</code>`,
    ownerTitleAll: '📊 Owner view (all leads)',
    ownerTitleDemo: '📊 Owner view, demo: you see only the test leads you created. The real owner sees everyone\'s leads here.',
    ownerStats: (o) =>
      `Leads today: ${o.today} · total: ${o.total}\n` +
      `Bookings: ${o.bookings} (new ${o.bNew}, confirmed ${o.bOk}, declined ${o.bNo})\n` +
      `Requests: ${o.requests}\n` +
      `Questions asked: ${o.qAll}, answered from the FAQ: ${o.qOk}`,
    ownerLast: 'Last leads:',
    ownerNone: 'No leads yet. Tap "📅 Book a visit" to create a test one.',
    ownerUnanswered: 'Questions the bot could not answer (add them to the FAQ):',
    about: (contact, url) =>
      'This bot is a demo of a ready offer: an AI assistant for a small business in Telegram.\n\n' +
      '• answers clients from the business FAQ, in Russian and English\n' +
      '• takes bookings and requests and sends them to the owner with Confirm and Decline buttons\n' +
      '• owner view with leads, statuses and the questions the bot could not answer\n' +
      '• runs on Cloudflare Workers with a database, no server to maintain\n\n' +
      'Built by Ilshat with Claude Code. I can set up the same bot on your FAQ and your services.' +
      (contact ? `\nContact: ${contact}` : '') +
      (url ? `\nCases and prices: ${url}` : ''),
    leadSaved: 'Saved.',
    gotIt: 'Got it.',
    noAnswerMid: 'I do not have an exact answer to that. Finish the booking and add the question when the studio confirms, or tap "✍️ Leave a request" afterwards.',
    notYours: 'This lead is not yours.',
    tooFast: 'Too many questions today. The FAQ answers still work, and you can leave a request.',
  },
  ru: {
    welcome:
      `Здравствуйте! Я ассистент <b>${B}</b>, вымышленной студии красоты, сделанной для демонстрации этого бота.\n\n` +
      'Что я умею:\n' +
      '• отвечать на вопросы о ценах, графике и услугах (попробуйте: «сколько стоит маникюр?»)\n' +
      '• записывать на визит в несколько нажатий\n' +
      '• принимать заявку и передавать её владельцу\n\n' +
      'Каждая запись приходит владельцу в Telegram с кнопками «Подтвердить» и «Отклонить». В демо вам приходит копия этой карточки, а «Кабинет владельца» открывает админку.\n\n' +
      'Вводите тестовые данные, не свой настоящий номер.',
    askPrompt: 'Напишите вопрос своими словами, например: «работаете в воскресенье?» или «сколько длится окрашивание?»',
    pickService: 'Шаг 1 из 4. Какая услуга?',
    pickDay: (svc) => `Шаг 2 из 4. ${svc}: какой день?`,
    pickSlot: (svc, day) => `Шаг 3 из 4. ${svc}, ${day}: какое время?`,
    askName: 'Шаг 4 из 4. Как вас зовут?',
    askContact: 'Ваш телефон? Нажмите кнопку ниже или напишите его (можно тестовый).',
    shareContact: '📱 Отправить мой номер',
    badContact: 'Не похоже на телефон или @username. Пришлите ещё раз, пожалуйста.',
    badName: 'Пришлите имя до 60 символов.',
    confirmBooking: (s) => `Проверьте запись:\n\n${s}\n\nПодтверждаете?`,
    btnConfirm: '✅ Подтвердить',
    btnCancel: '✖️ Отмена',
    bookingSent: (id) => `Готово. Запись #${id} отправлена в студию. Как только её подтвердят, вам придёт сообщение здесь.`,
    cancelled: 'Отменено. Чем ещё помочь?',
    reqName: 'Оставьте заявку, и студия ответит вам здесь. Как вас зовут?',
    reqNote: 'Какой у вас вопрос или запрос?',
    reqSent: (id) => `Спасибо. Заявка #${id} отправлена в студию, ответ придёт сюда.`,
    demoCardIntro: '👀 Демо: вот такая карточка приходит владельцу бизнеса в Telegram. Кнопки работают, нажмите:',
    ownerCardTitleBooking: (id) => `🆕 Новая запись #${id}`,
    ownerCardTitleRequest: (id) => `🆕 Новая заявка #${id}`,
    ownerBtnOk: '✅ Подтвердить',
    ownerBtnNo: '❌ Отклонить',
    clientConfirmed: (id, s) => `✅ Студия подтвердила запись #${id}: ${s}. Ждём вас!`,
    clientDeclined: (id) => `Студия не может принять запись #${id} в это время. Нажмите «📅 Записаться» и выберите другое.`,
    clientReqDone: (id) => `✅ Студия приняла заявку #${id} и скоро ответит здесь.`,
    statusSet: (st) => `Статус: ${st}`,
    st: { new: 'новая', confirmed: 'подтверждена', declined: 'отклонена' },
    noAnswer: 'Точного ответа на это у меня нет. Могу передать вопрос в студию, вам ответят здесь.',
    btnHandoff: '✍️ Передать в студию',
    btnBook: '📅 Записаться',
    remindButtons: 'Идёт запись: выберите вариант кнопками выше или отправьте /cancel.',
    langSet: 'Язык: русский.',
    yourId: (id) => `Ваш chat id: <code>${id}</code>`,
    ownerTitleAll: '📊 Кабинет владельца (все заявки)',
    ownerTitleDemo: '📊 Кабинет владельца, демо: вы видите только свои тестовые заявки. Настоящий владелец видит здесь заявки всех клиентов.',
    ownerStats: (o) =>
      `Заявок сегодня: ${o.today} · всего: ${o.total}\n` +
      `Записи: ${o.bookings} (новых ${o.bNew}, подтверждено ${o.bOk}, отклонено ${o.bNo})\n` +
      `Заявки: ${o.requests}\n` +
      `Вопросов задано: ${o.qAll}, отвечено по FAQ: ${o.qOk}`,
    ownerLast: 'Последние заявки:',
    ownerNone: 'Заявок пока нет. Нажмите «📅 Записаться», чтобы создать тестовую.',
    ownerUnanswered: 'Вопросы, на которые бот не ответил (их стоит добавить в FAQ):',
    about: (contact, url) =>
      'Этот бот — демо готового решения: ИИ-ассистент для малого бизнеса в Telegram.\n\n' +
      '• отвечает клиентам по FAQ бизнеса, на русском и английском\n' +
      '• принимает записи и заявки и отправляет их владельцу с кнопками «Подтвердить» и «Отклонить»\n' +
      '• кабинет владельца: заявки, статусы и вопросы, на которые бот не ответил\n' +
      '• работает на Cloudflare Workers с базой данных, сервер обслуживать не нужно\n\n' +
      'Сделал Ильшат на Claude Code. Могу собрать такого же бота на вашем FAQ и ваших услугах.' +
      (contact ? `\nСвязь: ${contact}` : '') +
      (url ? `\nКейсы и цены: ${url}` : ''),
    leadSaved: 'Сохранено.',
    gotIt: 'Принято.',
    noAnswerMid: 'Точного ответа на это у меня нет. Закончите запись, а вопрос задайте студии, когда она подтвердит, или нажмите «✍️ Оставить заявку» после записи.',
    notYours: 'Это не ваша заявка.',
    tooFast: 'На сегодня вопросов слишком много. Ответы из FAQ продолжают работать, и можно оставить заявку.',
  },
};

export function detectLang(code) {
  return /^(ru|uk|be|kk|uz|ky|tg)/i.test(code || '') ? 'ru' : 'en';
}
