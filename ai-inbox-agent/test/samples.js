// Sample incoming messages (RU and EN) for the offline tests, the screenshots and `npm run seed`.
// All people, companies, phones and addresses are invented (555-01xx and example.* are reserved for fiction).
// `expect` is what the rule-based fallback must produce with no AI at NOW.
export const NOW = '2026-11-05T09:00:00Z';

export const SAMPLES = [
  {
    id: 'en-form-kitchen', channel: 'form',
    in: { name: 'Emily Carter', contact: 'emily.carter@example.com', message: "Hi! We're renovating our house and need a custom oak kitchen, about 4 m along one wall plus an island. Budget is around $9,000 and we'd love it installed by December 15. Can someone come to measure next week? Phone +1 202 555 0142." },
    expect: { category: 'lead', lang: 'en', name: 'Emily Carter', email: 'emily.carter@example.com', phone: '+1 202 555 0142', budget: [9000, 'USD'], deadline: '2026-12-15', product: 'kitchen', hot: true },
  },
  {
    id: 'en-email-table', channel: 'email',
    in: { from: 'Mark Ellis <mark.ellis@example.net>', subject: 'Table quote', text: 'Hello, how much would a walnut dining table for 6 people cost? No rush, just collecting quotes for next year.\n\nThanks,\nMark' },
    expect: { category: 'lead', lang: 'en', name: 'Mark Ellis', email: 'mark.ellis@example.net', budget: null, deadline: null, product: 'table', hot: false },
  },
  {
    id: 'en-tg-wardrobe-defect', channel: 'telegram',
    in: { from: { id: 5101, first_name: 'Tom', username: 'tom_w_demo', language_code: 'en' }, text: "Hi, my wardrobe from order #10482 arrived last week but one sliding door doesn't close properly and there's a scratch on the side panel. What should I do?" },
    expect: { category: 'support', lang: 'en', telegram: '@tom_w_demo', order: '10482', hot: false },
  },
  {
    id: 'en-email-designer', channel: 'email',
    in: { from: 'Laura Kim <laura@studio-kim.example>', subject: 'Partnership for interior designers', text: 'Hi Oakbloom team,\n\nI run a small interior design studio and we place about 10 kitchen and wardrobe orders a year for our clients. Would you be open to a partnership with a referral commission?\n\nBest regards,\nLaura Kim' },
    expect: { category: 'partnership', lang: 'en', name: 'Laura Kim', email: 'laura@studio-kim.example', hot: false },
  },
  {
    id: 'en-email-seo-spam', channel: 'email',
    in: { from: 'Growth Team <promo@rank-boost.example>', subject: 'Get 300% more leads!!!', text: 'Dear business owner, we will put your website on page 1 of Google in 7 days. Guaranteed backlinks, crypto payments accepted. Click here: http://rank-boost.example/offer http://rank-boost.example/pay\nUnsubscribe' },
    expect: { category: 'spam', lang: 'en', hot: false },
  },
  {
    id: 'en-tg-cafe', channel: 'telegram',
    in: { from: { id: 5102, first_name: 'Dan', username: 'dbrooks_cafe', language_code: 'en' }, text: "We're opening a cafe and need counters, shelving and 12 tables. Budget up to $25k, we need everything in 3 weeks. My name is Daniel Brooks." },
    expect: { category: 'lead', lang: 'en', name: 'Daniel Brooks', telegram: '@dbrooks_cafe', budget: [25000, 'USD'], deadline: '2026-11-26', product: 'office', hot: true },
  },
  {
    id: 'en-form-delivery', channel: 'form',
    in: { name: 'Olivia Grant', contact: '+1 202 555 0177', message: 'Hello, when will my kitchen be delivered? Order 20311, it was promised for this week.' },
    expect: { category: 'support', lang: 'en', name: 'Olivia Grant', phone: '+1 202 555 0177', order: '20311', hot: false },
  },
  {
    id: 'en-email-coffee-table', channel: 'email',
    in: { from: 'Nina Park <nina.park@example.org>', subject: 'Coffee table', text: 'Hi, could you quote a small oak coffee table? Budget about $600.' },
    expect: { category: 'lead', lang: 'en', name: 'Nina Park', budget: [600, 'USD'], product: 'table', hot: false },
  },
  {
    id: 'ru-form-kitchen', channel: 'form',
    in: { name: 'Ирина Соколова', contact: '+7 900 555-01-23', message: 'Здравствуйте! Хотим кухню из массива дуба, угловую, около 3,5 метров. Бюджет до 600 тыс. рублей, нужно установить до 20 декабря. Когда можно сделать замер?' },
    expect: { category: 'lead', lang: 'ru', name: 'Ирина Соколова', phone: '+7 900 555-01-23', budget: [600000, 'RUB'], deadline: '2026-12-20', product: 'kitchen', hot: true },
  },
  {
    id: 'ru-email-wardrobe', channel: 'email',
    in: { from: 'Павел <pavel.orlov@example.ru>', subject: 'Шкаф-купе в прихожую', text: 'Добрый день. Сколько будет стоить шкаф-купе 2,4 м в прихожую? Сроки не горят, примерно к марту.\n\nС уважением,\nПавел Орлов' },
    expect: { category: 'lead', lang: 'ru', name: 'Павел Орлов', email: 'pavel.orlov@example.ru', budget: null, deadline: '2027-03-01', product: 'wardrobe', hot: false },
  },
  {
    id: 'ru-tg-hinge', channel: 'telegram',
    in: { from: { id: 5103, first_name: 'Светлана', username: 'sveta_demo', language_code: 'ru' }, text: 'Добрый день, заказ №10377: на кухне перестала закрываться дверца верхнего шкафа, петля разболталась. Это по гарантии?' },
    expect: { category: 'support', lang: 'ru', telegram: '@sveta_demo', order: '10377', hot: false },
  },
  {
    id: 'ru-email-supplier', channel: 'email',
    in: { from: 'ЛесПром Снаб <sales@lesprom-snab.example>', subject: 'Предложение о сотрудничестве', text: 'Здравствуйте! Мы поставщик мебельного щита из дуба и ясеня, предлагаем сотрудничество на условиях дилерской скидки 15%. Готовы привезти образцы.\n\nМенеджер Алексей, +7 900 555-01-77' },
    expect: { category: 'partnership', lang: 'ru', phone: '+7 900 555-01-77', hot: false },
  },
  {
    id: 'ru-email-spam', channel: 'email',
    in: { from: 'Promo <info@top-promo.example>', subject: 'Клиенты для вашего бизнеса', text: 'Продвижение сайта в ТОП Яндекса за 3 дня! Базы клиентов, рассылки, заработок от 100 000 руб в месяц без вложений. Подробнее: https://top-promo.example https://t.me/promo_example_bot' },
    expect: { category: 'spam', lang: 'ru', hot: false },
  },
  {
    id: 'ru-tg-office', channel: 'telegram',
    in: { from: { id: 5104, first_name: 'Олег', username: 'oleg_office_demo', language_code: 'ru' }, text: 'Меня зовут Олег Белов. Нужен стол из слэба ореха на 10 человек и стеллажи в офис. Бюджет 450-500 тыс, срочно, хотим через 2 недели.' },
    expect: { category: 'lead', lang: 'ru', name: 'Олег Белов', telegram: '@oleg_office_demo', budget: [500000, 'RUB'], deadline: '2026-11-19', product: 'table', hot: true },
  },
  {
    id: 'ru-form-showroom', channel: 'form',
    in: { name: 'Марина', contact: '@marina_demo', message: 'Подскажите, вы работаете по субботам? Хочу заехать в шоурум посмотреть образцы шпона для шкафа.' },
    expect: { category: 'lead', lang: 'ru', name: 'Марина', telegram: '@marina_demo', budget: null, product: 'wardrobe', hot: false },
  },
  {
    id: 'en-form-wardrobe-range', channel: 'form',
    in: { name: 'Sarah Novak', contact: 'sarah.n@example.com', message: 'Looking for a built-in wardrobe for the bedroom, 3 m wide, budget 4-5k USD, ideally by end of January.' },
    expect: { category: 'lead', lang: 'en', name: 'Sarah Novak', email: 'sarah.n@example.com', budget: [5000, 'USD'], deadline: '2027-01-31', product: 'wardrobe', hot: true },
  },
];
