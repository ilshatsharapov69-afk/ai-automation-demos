// The fictional business the agent works for. Every fact here is invented for the demo.
// To reuse for a client: replace this file (name, products, FAQ, hot-lead thresholds) and redeploy.
export default {
  name: { en: 'Oakbloom Furniture Workshop', ru: 'Мебельная мастерская Oakbloom' },
  short: 'Oakbloom',
  note: {
    en: 'Fictional demo business. All facts are invented to show how the agent works.',
    ru: 'Вымышленный демо-бизнес. Все факты придуманы, чтобы показать работу агента.',
  },
  signature: { en: 'Oakbloom team', ru: 'Команда Oakbloom' },

  // What the workshop sells. kw = lowercase stems that point to the product in a message.
  products: [
    { id: 'kitchen', en: 'custom kitchen', ru: 'кухня на заказ', price_en: 'from $4,500', price_ru: 'от 350 000 ₽', weeks: [6, 8],
      kw: ['kitchen', 'кухн', 'кухон'] },
    { id: 'wardrobe', en: 'built-in wardrobe', ru: 'встроенный шкаф', price_en: 'from $1,200', price_ru: 'от 90 000 ₽', weeks: [3, 4],
      kw: ['wardrobe', 'closet', 'шкаф', 'гардероб', 'купе'] },
    { id: 'table', en: 'solid-wood table', ru: 'стол из массива', price_en: 'from $900', price_ru: 'от 70 000 ₽', weeks: [3, 5],
      kw: ['table', 'стол', 'столешниц'] },
    { id: 'office', en: 'office or shop fit-out', ru: 'мебель для офиса или магазина', price_en: 'quoted per project', price_ru: 'смета под проект', weeks: [6, 10],
      kw: ['office', 'shop fit', 'store fit', 'reception', 'cafe', 'café', 'restaurant', 'офис', 'магазин', 'ресепшн', 'кафе', 'ресторан', 'стеллаж'] },
  ],

  // FAQ facts the reply drafts may use. Nothing outside these facts goes into a draft.
  faq: [
    { id: 'prices', kw: ['price', 'cost', 'how much', 'quote', 'estimate', 'budget', 'цен', 'стоим', 'сколько', 'смет', 'бюджет', 'рассчит', 'посчит'],
      en: 'Custom kitchens start from $4,500, built-in wardrobes from $1,200, solid-wood tables from $900; office and shop fit-outs are quoted per project. The final price comes after a free measurement.',
      ru: 'Кухни на заказ от 350 000 ₽, встроенные шкафы от 90 000 ₽, столы из массива от 70 000 ₽; мебель для офиса и магазина считаем под проект. Точная цена после бесплатного замера.' },
    { id: 'leadtime', kw: ['how long', 'lead time', 'deadline', 'weeks', 'when can', 'by ', 'срок', 'недел', 'успеете', 'когда', 'к нов', 'до '],
      en: 'Usual lead time: kitchens 6-8 weeks, wardrobes 3-4 weeks, tables 3-5 weeks from the signed design. Rush slots are sometimes available; we confirm them case by case.',
      ru: 'Обычные сроки: кухня 6-8 недель, шкаф 3-4 недели, стол 3-5 недель от утверждённого проекта. Срочные слоты иногда есть, подтверждаем отдельно.' },
    { id: 'measure', kw: ['measure', 'visit', 'design', 'project', 'замер', 'выезд', 'дизайн', 'проект', 'эскиз'],
      en: 'Measurement and the first 3D design are free; a designer visits within 3 working days of the request.',
      ru: 'Замер и первый 3D-проект бесплатно; дизайнер приезжает в течение 3 рабочих дней после заявки.' },
    { id: 'payment', kw: ['pay', 'prepay', 'deposit', 'invoice', 'instal', 'оплат', 'предоплат', 'аванс', 'рассроч', 'счёт', 'счет'],
      en: 'We take a 50% deposit after the design is signed and the rest on installation. Card, bank transfer and invoices for companies.',
      ru: 'Предоплата 50% после подписания проекта, остальное после монтажа. Карта, перевод, счёт для юрлиц.' },
    { id: 'warranty', kw: ['warranty', 'guarantee', 'broke', 'broken', 'hinge', 'door', 'drawer', 'scratch', 'crack', 'defect', 'repair', 'fix', 'гарант', 'сломал', 'петл', 'дверц', 'ящик', 'царап', 'трещин', 'дефект', 'ремонт', 'скрип', 'не закрыва'],
      en: 'Every piece has a 24-month warranty on fittings and build. Warranty fixes are free: send the order number and a photo, and a technician comes within 5 working days.',
      ru: 'На всю мебель гарантия 24 месяца на фурнитуру и сборку. Гарантийный ремонт бесплатный: пришлите номер заказа и фото, мастер приедет в течение 5 рабочих дней.' },
    { id: 'delivery', kw: ['deliver', 'install', 'shipping', 'arrive', 'late', 'delay', 'status', 'достав', 'монтаж', 'установ', 'привез', 'задерж', 'опазд', 'статус'],
      en: 'Delivery and installation are included within 50 km of the workshop; farther away we quote the trip. Each order has a manager who sends status updates.',
      ru: 'Доставка и монтаж включены в радиусе 50 км от мастерской, дальше считаем выезд отдельно. У каждого заказа есть менеджер, который сообщает статус.' },
    { id: 'materials', kw: ['oak', 'ash', 'walnut', 'veneer', 'mdf', 'material', 'wood', 'дуб', 'ясен', 'орех', 'шпон', 'мдф', 'материал', 'массив', 'дерев'],
      en: 'We work with solid oak, ash and walnut, veneered panels and painted MDF; samples are brought to the measurement.',
      ru: 'Работаем с массивом дуба, ясеня и ореха, шпонированными панелями и крашеным МДФ; образцы привозим на замер.' },
    { id: 'partners', kw: ['partner', 'collaborat', 'cooperat', 'designer', 'architect', 'commission', 'referral', 'supplier', 'dealer', 'партн', 'сотруднич', 'дизайнер', 'архитект', 'комисси', 'реферал', 'поставщ', 'дилер'],
      en: 'Interior designers and architects get 10% partner commission on referred orders and a dedicated project manager. Supplier and other partnership offers are reviewed by the owner weekly.',
      ru: 'Дизайнерам интерьера и архитекторам платим 10% партнёрского вознаграждения с приведённых заказов и даём отдельного менеджера. Предложения поставщиков и другие партнёрства владелец рассматривает раз в неделю.' },
    { id: 'hours', kw: ['hours', 'open', 'weekend', 'showroom', 'working', 'часы', 'работаете', 'выходн', 'шоурум'],
      en: 'The showroom is open Tuesday to Saturday, 10:00-19:00; replies to messages come within one working day.',
      ru: 'Шоурум открыт со вторника по субботу, 10:00-19:00; на сообщения отвечаем в течение рабочего дня.' },
  ],

  // Hot-lead rule: the score (0-100) is explained line by line in the owner card.
  hot: {
    minScore: 70,
    bigBudget: { RUB: 300000, USD: 3500, EUR: 3200 },
    soonDays: 45,
  },
};
