// Demo sandbox content for the fictional channel "Pinecone Coffee Notes". Everything here is made up.
// Seeded published posts with photo: 'seed' are history only (counted in stats, never sent), so a fake file_id never reaches Telegram.

export const SEED = {
  en: {
    published: [
      { text: '☕ Morning ritual: grind the beans right before brewing. Ground coffee loses most of its aroma within 15 minutes.\n\nTry it tomorrow and tell us if you taste the difference 👇', photo: 'seed', source: 'manual' },
      { text: '💡 Three things that make home espresso better\n\n1. Fresh beans: 7-30 days after roasting.\n2. Same dose every time: use scales.\n3. Clean the machine weekly.\n\nWhich one do you skip? 👇\n\n#espresso #homebrew', source: 'ai', topic: 'home espresso tips' },
      { text: '🫘 New on our shelf this week: a washed coffee from a small farm, notes of apricot and black tea. Small batch, so it will not stay long.', photo: 'seed', source: 'manual' },
      { text: '🤔 Why does the same coffee taste different every day?\n\nWater temperature, grind and time change the cup more than the beans do. Change one thing at a time and write it down.\n\n#brewing #coffee', source: 'ai', topic: 'why coffee tastes different' },
      { text: '📌 Save this: pour-over ratio 1:16. 15 g of coffee, 240 g of water at 93-96 °C, about 3 minutes in total.', source: 'manual' },
      { text: '🙌 Thank you for 1,000 readers! Ask us anything about coffee in the comments: we answer every question this week.', photo: 'seed', source: 'manual' },
    ],
    upcoming: [
      { text: '🚫 Common mistakes with a French press\n\n• Grinding too fine: the cup gets muddy.\n• Steeping «a bit longer»: it turns bitter.\n• Leaving coffee in the press: it keeps brewing.\n\nWhat else would you add? 👇\n\n#frenchpress #coffee', source: 'ai', topic: 'french press mistakes' },
      { text: '☀️ Weekend idea: cold brew. 100 g of coarse coffee, 1 litre of cold water, 14 hours in the fridge, then strain. Smooth, sweet, no bitterness.', source: 'manual' },
    ],
    drafts: [
      { text: '📣 Next week: a live Q&A with our roaster in this channel. Send your questions in advance, the best ones get a bag of coffee.', source: 'manual' },
    ],
  },
  ru: {
    published: [
      { text: '☕ Утренний ритуал: мелите зёрна прямо перед заваркой. Молотый кофе теряет большую часть аромата за 15 минут.\n\nПопробуйте завтра и расскажите, почувствовали ли разницу 👇', photo: 'seed', source: 'manual' },
      { text: '💡 Три вещи, которые делают домашний эспрессо лучше\n\n1. Свежие зёрна: 7–30 дней после обжарки.\n2. Одинаковая доза каждый раз — помогут весы.\n3. Чистка машины раз в неделю.\n\nЧто из этого вы пропускаете? 👇\n\n#эспрессо #кофедома', source: 'ai', topic: 'советы по домашнему эспрессо' },
      { text: '🫘 Новинка этой недели: мытый кофе с небольшой фермы, ноты абрикоса и чёрного чая. Партия маленькая, долго не задержится.', photo: 'seed', source: 'manual' },
      { text: '🤔 Почему один и тот же кофе каждый день на вкус разный?\n\nТемпература воды, помол и время меняют чашку сильнее, чем сами зёрна. Меняйте что-то одно и записывайте.\n\n#заваривание #кофе', source: 'ai', topic: 'почему вкус кофе меняется' },
      { text: '📌 Сохраните: пропорция для пуровера 1:16. 15 г кофе, 240 г воды 93–96 °C, около 3 минут.', source: 'manual' },
      { text: '🙌 Нас уже 1000! Задавайте любые вопросы о кофе в комментариях — на этой неделе ответим на все.', photo: 'seed', source: 'manual' },
    ],
    upcoming: [
      { text: '🚫 Частые ошибки с френч-прессом\n\n• Слишком мелкий помол — чашка мутная.\n• Настаивать «чуть подольше» — горчит.\n• Оставлять кофе в прессе — он продолжает завариваться.\n\nЧто бы вы добавили? 👇\n\n#френчпресс #кофе', source: 'ai', topic: 'ошибки с френч-прессом' },
      { text: '☀️ Идея на выходные: колд брю. 100 г кофе крупного помола, 1 литр холодной воды, 14 часов в холодильнике, затем процедить. Мягко, сладко, без горечи.', source: 'manual' },
    ],
    drafts: [
      { text: '📣 На следующей неделе — прямой эфир с нашим обжарщиком прямо в канале. Присылайте вопросы заранее, за лучшие подарим пачку кофе.', source: 'manual' },
    ],
  },
};
