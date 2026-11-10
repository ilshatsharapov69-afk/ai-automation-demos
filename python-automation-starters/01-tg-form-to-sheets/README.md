# 01 · Telegram form → Google Sheets

**RU:** бот задаёт вопросы анкеты по шагам (имя, телефон, email, услуга кнопками, бюджет, комментарий), проверяет ответы,
показывает сводку с кнопками «Отправить / Заново» и пишет строку в Google Таблицу. Админ получает копию заявки.

**EN:** a step-by-step form bot (name, phone, email, service via buttons, budget, comment) that validates answers, shows a
summary with "Send / Start over", appends a row to a Google Sheet and forwards a copy to an admin chat.

Stack: Python 3.10+, aiogram 3, gspread (service account). Without `SHEET_ID` it writes `leads.csv` instead, so the first
run needs only a bot token.

## Run in 2 commands

```bash
pip install -r requirements.txt
BOT_TOKEN=123:abc python -m form2sheets
```

(or copy `.env.example` to `.env` and fill it in, then `python -m form2sheets`).

Tests, fully offline (fake Telegram, fake Google client):

```bash
pip install -r requirements-dev.txt && pytest
```

## Google service account (once, about 5 minutes, free)

1. <https://console.cloud.google.com/> → create a project → **APIs & Services → Library** → enable **Google Sheets API**.
2. **IAM & Admin → Service accounts → Create**. No roles needed. Open it → **Keys → Add key → JSON**.
   Save the file next to the code as `service_account.json` (already in `.gitignore`; never commit it).
3. Open the target Google Sheet → **Share** → paste the service account's email
   (`…@….iam.gserviceaccount.com`, it is inside the JSON as `client_email`) → **Editor**.
4. Put the sheet id (the part between `/d/` and `/edit` in its URL) into `SHEET_ID`.

The bot creates the worksheet (`WORKSHEET`, default `Leads`) and the header row if they are missing. Values starting with
`= + - @` are written with a leading `'`, so a phone `+7…` stays text and nobody can inject a formula through the form.
Quota errors (429/5xx) are retried with backoff; the user's answers stay in memory and "Send" can be pressed again.

## Adapt in 30 minutes

| Client asks for | Change |
|---|---|
| Other questions | Edit `FIELDS` in `form2sheets/form.py`: `kind` is `text`, `phone`, `email`, `int` or `choice`; `optional=True` enables `/skip`. Columns follow automatically. |
| Other wording / language | `form2sheets/texts.py` (RU and EN side by side). |
| A different table layout | `sheet_headers()` / `sheet_row()` in `form.py`. |
| Write to Excel/CSV, Airtable, Notion | Any object with `async append(row)`; see `CsvWriter` in `sheets.py`. |
| Notify a group instead of one admin | Put the group chat id (negative number) into `ADMIN_CHAT_ID`. |
| Keep state across restarts | Swap `MemoryStorage` for `RedisStorage` in `build_dispatcher`. |
| Webhook instead of polling | Standard aiogram `SimpleRequestHandler`; the handlers do not change. |

## Files

```
form2sheets/form.py     questions, validation, sheet row layout
form2sheets/bot.py      aiogram handlers (generic FSM over FIELDS)
form2sheets/sheets.py   GoogleSheetWriter (gspread, retries, sanitising) and CsvWriter
form2sheets/texts.py    RU/EN strings
tests/fakebot.py        offline Telegram: records Bot API calls, feeds fake updates
```
