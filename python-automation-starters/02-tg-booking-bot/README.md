# 02 · Telegram booking bot (inline keyboard, admin confirmation, SQLite)

**RU:** клиент выбирает услугу → день → свободное время кнопками, подтверждает; запись сохраняется в SQLite, админ
получает уведомление с кнопками «Подтвердить / Отклонить», клиент — ответ. «Мои записи» с отменой, `/today` для админа.

**EN:** the client picks service → day → free time with inline buttons and confirms; the booking goes to SQLite, the admin
gets a notification with "Confirm / Decline", the client gets the answer. "My bookings" with cancel, `/today` for admins.

Stack: Python 3.10+, aiogram 3, stdlib `sqlite3`. No other services.

## Run in 2 commands

```bash
pip install -r requirements.txt
BOT_TOKEN=123:abc ADMIN_IDS=111111111 python -m bookingbot
```

Tests, offline (fake Telegram, temp database):

```bash
pip install -r requirements-dev.txt && pytest
```

## What is already handled

- Visits of different lengths: a 2-hour service blocks 4 half-hour starts; slots never cross closing time.
- No double booking: the overlap check and the insert run in one `BEGIN IMMEDIATE` transaction. If two people press
  the same time, the second gets "just taken" and a fresh list of times.
- Old or forged buttons: `BookIt` re-checks day off, opening hours, the 30-minute grid and the minimum lead time.
- Declined or cancelled bookings free the slot. Only admins (`ADMIN_IDS`) can confirm, decline or call `/today`.
- Clients can cancel only their own bookings; admins are told.
- The flow is stored in callback data, not in memory, so a bot restart does not break half-finished bookings.
- RU/EN by the user's Telegram language; admin messages are in Russian (change in `bot.py`).

## Adapt in 30 minutes

| Client asks for | Change |
|---|---|
| Their services, prices, hours, days off, slot step | `bookingbot/catalog.py` only. |
| Several masters / rooms | Add `master_id` to the `bookings` table and to the overlap query in `db.py`, add one more `Pick` step. |
| Ask for a phone number before booking | Send a `KeyboardButton(request_contact=True)` in `start`, store it in a `users` table. |
| Reminders a day / 2 hours before | A loop with `asyncio.sleep(60)` (or APScheduler) that selects confirmed bookings starting in the window and sends a message; add a `reminded` column. |
| Mirror bookings to Google Sheets / CRM | Call the writer from starter 01 or the CRM client from starter 03 after `repo.create`. |
| Postgres instead of SQLite | Same SQL; use an exclusion constraint or `SELECT … FOR UPDATE` instead of `BEGIN IMMEDIATE`. |
| Payment before confirmation | Telegram Payments: `send_invoice` after `BookIt`, confirm on `successful_payment`. |

## Files

```
bookingbot/catalog.py   services, opening hours, days off (edit this first)
bookingbot/slots.py     pure scheduling logic (free starts, overlaps)
bookingbot/db.py        SQLite repository, transactional double-booking guard
bookingbot/bot.py       aiogram handlers and keyboards, CallbackData factories
bookingbot/texts.py     RU/EN strings
tests/                  slot maths, repository, full chat flows with a fake Telegram
```
