// Shared constants and the bot's RU/EN copy. The Mini App has its own copy in public/app.js.
export const STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
export const OPEN_STATUSES = ['new', 'contacted', 'qualified', 'proposal'];
export const SOURCES = ['telegram', 'website', 'referral', 'call', 'event'];
export const COMPANY = { en: 'Brasswick Interiors', ru: 'Brasswick Interiors' }; // fictional office fit-out company

export const STATUS_LABEL = {
  en: { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' },
  ru: { new: 'Новый', contacted: 'Связались', qualified: 'Квалифицирован', proposal: 'КП отправлено', won: 'Выигран', lost: 'Проигран' },
};

export const pickLang = (code) => (String(code || '').toLowerCase().startsWith('ru') ? 'ru' : 'en');

const T = {
  en: {
    start: (name, demo) =>
      `Hi, ${name}! This is the sales CRM of ${COMPANY.en}${demo ? ' (a demo with fictional data)' : ''}.\n\n` +
      'Open the app for leads, statuses, notes, reminders and stats. Every morning I send you a short digest, ' +
      'and I ping you when a reminder is due.\n\n' +
      '/digest - today\'s digest now\n/today - reminders for today\n/new <name> - add a lead from the chat\n/lang - Русский' +
      (demo ? '\n/reset - start the demo over' : ''),
    open: 'Open CRM',
    openLead: 'Open lead',
    noAccess: 'This CRM is for the sales team only. Ask your admin for an invite link.',
    joined: (ws) => `You joined ${ws}. Welcome to the team!`,
    badInvite: 'This invite link is not valid any more. Ask your admin for a new one.',
    invite: (link) => `Invite link for your team (anyone with it can join):\n${link}`,
    adminOnly: 'Only an admin can do this.',
    reset: 'Done: your demo sandbox is back to the starting data.',
    resetOff: 'Reset is only available in the demo.',
    lang: 'Language: English',
    unknown: 'Use the button below to open the CRM, or /help for the commands.',
    newUsage: 'Send /new and the lead name, e.g. /new Kim Lee, Acme Dental, +1 555 0100',
    newDone: (id, name) => `Lead #${id} "${name}" added and assigned to you.`,
    reminder: (text, lead) => `⏰ Reminder: ${text}\nLead: ${lead}`,
    todayNone: 'No reminders for today. 🎉',
    todayHead: 'Reminders for today:',
    digestHead: (name, date) => `☀️ Good morning, ${name}! Your digest for ${date}`,
    dRemToday: (n) => `⏰ Due today: ${n}`,
    dOverdue: (n) => `⚠️ Overdue: ${n}`,
    dNewMine: (n) => `🆕 New leads for you: ${n}`,
    dUnassigned: (n) => `📥 Unassigned leads: ${n}`,
    dPipeline: (n, v) => `📊 Team pipeline: ${n} open leads, ${v}`,
    dWon: (n, v) => `🏆 Won this week: ${n} (${v})`,
    dNothing: 'Nothing urgent today. A good day to call the leads you have not touched for a while.',
    dStale: (n) => `💤 Your leads with no activity for 7+ days: ${n}`,
  },
  ru: {
    start: (name, demo) =>
      `Привет, ${name}! Это CRM отдела продаж ${COMPANY.ru}${demo ? ' (демо с вымышленными данными)' : ''}.\n\n` +
      'В приложении: лиды, статусы, заметки, напоминания и статистика. Каждое утро я присылаю короткую сводку, ' +
      'а когда подходит срок напоминания — пишу вам.\n\n' +
      '/digest — сводка за сегодня\n/today — напоминания на сегодня\n/new <имя> — добавить лида из чата\n/lang — English' +
      (demo ? '\n/reset — начать демо заново' : ''),
    open: 'Открыть CRM',
    openLead: 'Открыть лида',
    noAccess: 'Эта CRM только для отдела продаж. Попросите у администратора ссылку-приглашение.',
    joined: (ws) => `Вы в команде ${ws}. Добро пожаловать!`,
    badInvite: 'Ссылка-приглашение больше не действует. Попросите у администратора новую.',
    invite: (link) => `Ссылка-приглашение для команды (по ней может войти любой):\n${link}`,
    adminOnly: 'Это может сделать только администратор.',
    reset: 'Готово: в вашей демо-песочнице снова исходные данные.',
    resetOff: 'Сброс доступен только в демо.',
    lang: 'Язык: русский',
    unknown: 'Откройте CRM кнопкой ниже или посмотрите команды: /help.',
    newUsage: 'Отправьте /new и имя лида, например: /new Ким Ли, Acme Dental, +1 555 0100',
    newDone: (id, name) => `Лид #${id} «${name}» добавлен и назначен на вас.`,
    reminder: (text, lead) => `⏰ Напоминание: ${text}\nЛид: ${lead}`,
    todayNone: 'На сегодня напоминаний нет. 🎉',
    todayHead: 'Напоминания на сегодня:',
    digestHead: (name, date) => `☀️ Доброе утро, ${name}! Сводка на ${date}`,
    dRemToday: (n) => `⏰ На сегодня: ${n}`,
    dOverdue: (n) => `⚠️ Просрочено: ${n}`,
    dNewMine: (n) => `🆕 Новые лиды на вас: ${n}`,
    dUnassigned: (n) => `📥 Лиды без ответственного: ${n}`,
    dPipeline: (n, v) => `📊 Воронка команды: ${n} открытых лидов, ${v}`,
    dWon: (n, v) => `🏆 Выиграно за неделю: ${n} (${v})`,
    dNothing: 'Срочного ничего нет. Хороший день, чтобы позвонить тем, с кем давно не говорили.',
    dStale: (n) => `💤 Ваши лиды без активности 7+ дней: ${n}`,
  },
};

export const t = (lang) => T[lang === 'ru' ? 'ru' : 'en'];

export function money(value, lang, currency = 'USD') {
  try {
    return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value || 0);
  } catch {
    return `${value || 0} ${currency}`;
  }
}
