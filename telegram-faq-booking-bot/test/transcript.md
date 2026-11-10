# Demo bot: local end-to-end transcript

Run 2026-11-04T09:45:12.114Z against `wrangler dev` (http://127.0.0.1:18797), fake Telegram updates, no bot token: every Bot API call the bot would make is captured. Answers marked by source in the checks. Owner chat id = 999.

## 1. English visitor: questions

**test_en →** "/start"
> **bot → test_en**: Hi! I am the assistant of <b>Lumi Beauty Studio</b>, a fictional beauty studio made to demo this bot.
> 
> What I can do:
> • answer questions about prices, hours and services (try: "how much is a manicure?")
> • book a visit in a few taps
> • take a request and pass it to the owner
> 
> Every booking goes to the owner's Telegram with Confirm and Decline buttons. In this demo you get a copy of that owner card, and "Owner view" opens the admin panel.
> 
> Use test data, not your real phone number. _(+ reply keyboard)_
- check: welcome in English with menu: PASS

**test_en →** "how much is a manicure?"
> _(answer source: ai)_
> **bot → test_en**: A manicure costs $35 and takes 60 minutes.
> [📅 Book a visit]
- check: manicure price answered ($35): PASS

**test_en →** "do you work on sundays?"
> _(answer source: ai)_
> **bot → test_en**: Yes, we are open every day, including Sundays, from 10:00 to 20:00.
> [📅 Book a visit]
- check: Sunday hours answered (10:00): PASS

**test_en →** "can I pay with bitcoin?"
> _(answer source: none)_
> **bot → test_en**: I do not have an exact answer to that. I can pass your question to the studio and they will reply here.
> [✍️ Pass it to the studio]
- check: unknown question handled (handoff offered or no invented answer): PASS

## 2. English visitor: hand a question to the owner

**test_en →** "do you do wedding makeup at home?"
> _(answer source: none)_
> **bot → test_en**: I do not have an exact answer to that. I can pass your question to the studio and they will reply here.
> [✍️ Pass it to the studio]
- check: out-of-FAQ question gets the handoff button: PASS

**test_en →** taps `go:handoff`
> **bot → test_en**: Leave a request and the studio will write back here. Your name?

**test_en →** "Anna"
> **bot → test_en**: Your phone number? Tap the button below or type it (a test number is fine). _(+ reply keyboard)_

**test_en →** "+1 555 0100"
> **bot → test_en**: Thank you. Request #1 is sent to the studio, they will reply here. _(+ reply keyboard)_
> **bot → OWNER**: <b>🆕 New request #1</b>
> Anna · +1 555 0100
> do you do wedding makeup at home? (@test_en)
> Status: new
> [✅ Confirm] [❌ Decline]
> **bot → test_en**: 👀 Demo: this is the card the business owner gets in their Telegram. The buttons work, try them:
> **bot → test_en**: <b>🆕 New request #1</b>
> Anna · +1 555 0100
> do you do wedding makeup at home? (@test_en)
> Status: new
> [✅ Confirm] [❌ Decline]
- check: request saved and owner notified: PASS

## 3. English visitor: booking in 4 steps

**test_en →** "📅 Book a visit"
> **bot → test_en**: Step 1 of 4. Which service?
> [Manicure · $35] [Pedicure · $45] [Haircut · $40] [Hair colouring · from $90] [Brows and lashes · $30]

**test_en →** taps `svc:mani`
> **bot → test_en** _(editMessageText)_: Step 2 of 4. Manicure: which day?
> [Wed 4 Nov] [Thu 5 Nov] [Fri 6 Nov] [Sat 7 Nov] [Sun 8 Nov]

**test_en →** taps `day:2026-11-05`
> **bot → test_en** _(editMessageText)_: Step 3 of 4. Manicure, Thu 5 Nov: which time?
> [10:00] [12:00] [14:00] [16:00] [18:00]

**test_en →** taps `slot:14:00`
> **bot → test_en** _(editMessageText)_: Manicure, Thu 5 Nov 14:00 ✓
> **bot → test_en**: Step 4 of 4. Your name?

**test_en →** "Anna"
> **bot → test_en**: Your phone number? Tap the button below or type it (a test number is fine). _(+ reply keyboard)_

**test_en →** "not a phone"
> **bot → test_en**: That does not look like a phone number or a @username. Please send it again.
- check: bad contact rejected: PASS

**test_en →** "+1 555 0100"
> **bot → test_en**: Got it. _(+ reply keyboard)_
> **bot → test_en**: Please check your booking:
> 
> Manicure, Thu 5 Nov 14:00
> Anna · +1 555 0100
> 
> Confirm?
> [✅ Confirm] [✖️ Cancel]
- check: booking summary shown with Confirm: PASS

**test_en →** taps `bk:ok`
> _(bot: popup)_ Saved.
> _(bot → test_en: buttons removed)_
> **bot → test_en**: Done. Booking #2 is sent to the studio. You will get a message here as soon as they confirm it. _(+ reply keyboard)_
> **bot → OWNER**: <b>🆕 New booking #2</b>
> Manicure, Thu 5 Nov 14:00
> Anna · +1 555 0100 (@test_en)
> Status: new
> [✅ Confirm] [❌ Decline]
> **bot → test_en**: 👀 Demo: this is the card the business owner gets in their Telegram. The buttons work, try them:
> **bot → test_en**: <b>🆕 New booking #2</b>
> Manicure, Thu 5 Nov 14:00
> Anna · +1 555 0100 (@test_en)
> Status: new
> [✅ Confirm] [❌ Decline]
- check: owner got the booking card with buttons: PASS
- check: visitor got the demo copy of the owner card: PASS

**test_en →** taps `bk:ok`
- check: second tap on Confirm creates no second booking: PASS

**test_en →** taps `slot:16:00`
- check: a stale time button does not restart the booking: PASS

**test_en →** "сколько стоит педикюр?"
> _(answer source: ai)_
> **bot → test_en**: Педикюр стоит 2 500 ₽, продолжительность процедуры 75 минут.
> [📅 Book a visit]
- check: a Russian question in an English chat gets a Russian answer: PASS

## 4. Someone else cannot touch that booking; the owner confirms it

**test_ru →** taps `own:ok:2`
> _(bot: popup)_ Это не ваша заявка.
- check: stranger cannot confirm a lead that is not theirs: PASS

**owner →** taps `own:ok:2`
> _(bot: popup)_ Status: confirmed
> **bot → OWNER** _(editMessageText)_: <b>🆕 New booking #2</b>
> Manicure, Thu 5 Nov 14:00
> Anna · +1 555 0100 (@test_en)
> Status: confirmed
> **bot → test_en**: ✅ The studio confirmed booking #2: Manicure, Thu 5 Nov 14:00. See you!
- check: owner confirms, client is told: PASS

**test_en →** taps `own:no:2`
> _(bot: popup)_ Status: confirmed
- check: second tap does not change a decided lead: PASS

## 5. Russian visitor

**test_ru →** "/start"
> **bot → test_ru**: Здравствуйте! Я ассистент <b>Lumi Beauty Studio</b>, вымышленной студии красоты, сделанной для демонстрации этого бота.
> 
> Что я умею:
> • отвечать на вопросы о ценах, графике и услугах (попробуйте: «сколько стоит маникюр?»)
> • записывать на визит в несколько нажатий
> • принимать заявку и передавать её владельцу
> 
> Каждая запись приходит владельцу в Telegram с кнопками «Подтвердить» и «Отклонить». В демо вам приходит копия этой карточки, а «Кабинет владельца» открывает админку.
> 
> Вводите тестовые данные, не свой настоящий номер. _(+ reply keyboard)_
- check: welcome in Russian: PASS

**test_ru →** "сколько стоит окрашивание?"
> _(answer source: ai)_
> **bot → test_ru**: Окрашивание стоит от 5 000 ₽, цена зависит от длины и техники, точную цену мастер называет после короткого осмотра волос.
> [📅 Записаться]
- check: colouring price answered in Russian (5 000): PASS

**test_ru →** "Можно оплатить картой?"
> _(answer source: ai)_
> **bot → test_ru**: Да, можно оплатить картой или наличными после визита.
> [📅 Записаться]
- check: card payment answered in Russian: PASS

**test_ru →** "✍️ Оставить заявку"
> **bot → test_ru**: Оставьте заявку, и студия ответит вам здесь. Как вас зовут?

**test_ru →** "Мария"
> **bot → test_ru**: Ваш телефон? Нажмите кнопку ниже или напишите его (можно тестовый). _(+ reply keyboard)_

**test_ru →** "@maria_test"
> **bot → test_ru**: Какой у вас вопрос или запрос? _(+ reply keyboard)_

**test_ru →** "Хочу подарочный сертификат на 3000 рублей"
> **bot → test_ru**: Спасибо. Заявка #3 отправлена в студию, ответ придёт сюда. _(+ reply keyboard)_
> **bot → OWNER**: <b>🆕 New request #3</b>
> Мария · @maria_test
> Хочу подарочный сертификат на 3000 рублей (@test_ru)
> Status: new
> [✅ Confirm] [❌ Decline]
> **bot → test_ru**: 👀 Демо: вот такая карточка приходит владельцу бизнеса в Telegram. Кнопки работают, нажмите:
> **bot → test_ru**: <b>🆕 Новая заявка #3</b>
> Мария · @maria_test
> Хочу подарочный сертификат на 3000 рублей (@test_ru)
> Статус: новая
> [✅ Подтвердить] [❌ Отклонить]
- check: Russian request saved and sent to owner: PASS

**test_ru →** "📊 Кабинет владельца"
> **bot → test_ru**: <b>📊 Кабинет владельца, демо: вы видите только свои тестовые заявки. Настоящий владелец видит здесь заявки всех клиентов.</b>
> 
> Заявок сегодня: 1 · всего: 1
> Записи: 0 (новых 0, подтверждено 0, отклонено 0)
> Заявки: 1
> Вопросов задано: 2, отвечено по FAQ: 2
> 
> Последние заявки:
> #3 Заявка · Мария · Хочу подарочный сертификат на 3000 рубле · новая
- check: demo owner view shows only own leads: PASS

## 6. Owner view (real owner sees everything)

**owner →** "/admin"
> **bot → OWNER**: <b>📊 Owner view (all leads)</b>
> 
> Leads today: 3 · total: 3
> Bookings: 1 (new 0, confirmed 1, declined 0)
> Requests: 2
> Questions asked: 7, answered from the FAQ: 5
> 
> Last leads:
> #3 Request · Мария · Хочу подарочный сертификат на 3000 рубле · new
> #2 Manicure · Thu 5 Nov 14:00 · Anna · confirmed
> #1 Request · Anna · do you do wedding makeup at home? · new
> 
> Questions the bot could not answer (add them to the FAQ):
> • do you do wedding makeup at home?
> • can I pay with bitcoin?
- check: owner view lists both visitors: PASS

**test_en →** "🌐 Русский"
> **bot → test_en**: Язык: русский. _(+ reply keyboard)_

**test_en →** "/id"
> **bot → test_en**: Ваш chat id: <code>222</code>
- check: /id works: PASS
- check: answers came from the AI, not only the keyword fallback (5 of 7): PASS

## Result

All checks passed.
