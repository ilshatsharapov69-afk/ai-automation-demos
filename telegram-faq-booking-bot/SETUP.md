# Telegram FAQ + booking bot: setup and deploy

What it is: a Telegram bot for a **fictional** beauty studio ("Lumi Beauty Studio") that shows the packaged
offer "AI assistant on your FAQ + bookings + leads to the owner". RU and EN (picked from the user's Telegram
language, `/lang` switches). Stack: Cloudflare Worker + D1 + Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
free daily allowance on the Cloudflare account; no paid key). If the AI is unavailable or a chat passes 25 AI
answers a day, the bot falls back to keyword search over the FAQ, so it never goes silent.

Files: `src/worker.js` (webhook), `src/bot.js` (flows), `src/answer.js` (AI + fallback), `src/i18n.js` (all
texts), `data/faq.json` (the fictional business: services, prices, FAQ), `migrations/0001_init.sql` (D1),
`test/e2e.mjs` (fake-update test), `scripts/deploy.mjs` (one-command deploy).

## 1. Create the bot (1 minute, by hand)

1. In Telegram open **@BotFather** → `/newbot`.
2. Name: `Lumi Beauty Demo` (or any name without a place in it). Username: something like
   `lumi_ai_demo_bot` (must end in `bot`; no city, country or personal name).
3. BotFather replies with a token like `123456789:AA...`. Paste that one line into
   `bot-token.txt` in this folder and save. The file is git-ignored; never paste the token into a chat.
4. Open your new bot in Telegram and press **Start** once (the deploy script reads your chat id from this, so
   the owner cards come to you).

## 2. Deploy (one command)

```bash
cd telegram-faq-booking-bot && node scripts/deploy.mjs
```

Two prompts may appear: when the D1 database is created, wrangler may offer to add it to the config: answer **No**
(the script writes the id itself; Yes adds a second `[[d1_databases]]` block and breaks the deploy). When the
migration runs, it may ask to confirm: answer **Yes**.

It creates the D1 database (first run only, writes its id into `wrangler.toml`), applies the migration,
deploys the Worker `faq-booking-demo-bot` to your `*.workers.dev`, stores `BOT_TOKEN`, a random `WEBHOOK_SECRET` and
`OWNER_CHAT_ID` as Cloudflare secrets, sets the Telegram webhook with that secret, and sets the bot's commands and
description. `node scripts/deploy.mjs --dry` prints the steps without doing anything. Uses your existing wrangler
login (checked 2026-11-04: OAuth token with workers, d1 and ai write scopes).

If the owner chat was not found (the owner did not press Start first): send `/id` to the bot, then
`node scripts/deploy.mjs --owner <that number>`.

## 3. After the portfolio is live

Put your contact and the portfolio link into `wrangler.toml` `[vars]` (`CONTACT = "@your_username"`,
`PORTFOLIO_URL = "https://<name>.pages.dev"`), then `npx wrangler deploy` from this folder. They show in
"About this demo".

## Run the local test (no token, no Telegram)

```bash
cd telegram-faq-booking-bot && npm run db:local && npm run dev
```

In a second terminal:

```bash
cd telegram-faq-booking-bot && npm run test:e2e
```

`.dev.vars` sets `OWNER_CHAT_ID=999` and `OWNER_LANG=en` for the test. Without `BOT_TOKEN` the Worker sends nothing to Telegram and
returns every Bot API call it would have made; the test prints them as a transcript (`test/transcript.md`) and
runs 24 checks. The AI binding is remote even in local dev, so the test uses a little of the free AI allowance.

## How it behaves (for a buyer)

- Free text = a question. The AI answers only from `data/faq.json`; if the FAQ does not cover it, the bot says
  so and offers to pass the question to the owner (the question becomes a request, no retyping).
- `📅 Book a visit`: service → day → time → name → phone (share-contact button) → confirm.
- Each booking or request goes to the owner (`OWNER_CHAT_ID`) as a card with Confirm / Decline buttons; the
  client is told the result. In demo mode the visitor also gets a copy of that card and can press the buttons
  on their own lead.
- `📊 Owner view` (`/admin`): counts, the last leads, and the questions the bot could not answer. The real owner
  sees everything; a visitor sees only their own test leads.
- To reuse for a client: replace `data/faq.json` (services, prices, FAQ), the business name in it, and the welcome
  text in `src/i18n.js`; set `DEMO_MODE = "off"`.

## Limits worth knowing

- Workers AI free allowance is 10,000 "neurons" a day per account (Cloudflare docs, not re-checked on 2026-11-04; one test
  answer used about 2.5 neurons for a short prompt, our prompts are longer). Past it, the FAQ fallback answers.
- D1 free plan: 100,000 row writes a day; one booking is about 10 writes.
- All five time slots show for every day, including today after those hours have passed: fine for a fictional
  demo, a client version would hide past slots and check real availability.
- No reminders before the visit and no calendar sync: those are paid add-ons for a client, not in the demo.
