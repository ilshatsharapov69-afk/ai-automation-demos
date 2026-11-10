// Retrieval eval: each question lists the documents that contain the answer (any one of them counts as a hit).
// The unanswerable questions check the refusal side: the base must NOT answer them.
export const EVAL = [
  { q: 'Сколько стоит доставка по городу?', docs: ['d01', 'd22'] },
  { q: 'Можно ли вернуть шкаф, который сделали на заказ?', docs: ['d05', 'd22'] },
  { q: 'Сколько месяцев гарантия на каркас дивана?', docs: ['d07', 'd23'] },
  { q: 'Какая скидка у корпоративного клиента при заказе от 500 000 рублей?', docs: ['d11', 'd24'] },
  { q: 'Во сколько новый сотрудник приходит в первый рабочий день?', docs: ['d13', 'd25'] },
  { q: 'Сколько ночей длится пробный период матраса?', docs: ['d20'] },
  { q: 'How long does it take to make a made-to-order sofa?', docs: ['d04', 'd22'] },
  { q: 'Кто должен согласовать компенсацию больше трёх тысяч рублей?', docs: ['d18'] },
  { q: 'Can I pay in instalments over twelve months?', docs: ['d10'] },
  { q: 'За сколько минут оператор должен ответить клиенту в чате?', docs: ['d16'] },
];

export const UNANSWERABLE = [
  'Как зовут директора компании и сколько у вас магазинов?',
  'Do you sell electric scooters?',
  'Какая завтра погода?',
  'Do you match the prices of competitors?',
];
