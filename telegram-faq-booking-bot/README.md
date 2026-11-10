# Telegram FAQ + booking bot (demo)

A Telegram bot for a fictional beauty studio: it answers questions about prices, hours and services with an LLM
over the studio's FAQ, books a visit in a few taps, and sends every booking to the owner's Telegram with Confirm and
Decline buttons. English and Russian (picked from the user's Telegram language, `/lang` switches).

Live: [@shov_demo_bot](https://t.me/shov_demo_bot)

- **Stack:** Cloudflare Worker (webhook) + D1 + Workers AI (`llama-3.3-70b-instruct-fp8-fast`).
- **Never goes silent:** if the AI is unavailable or a chat passes its daily AI cap, answers fall back to keyword search
  over the FAQ.
- **Files:** `src/bot.js` flows, `src/answer.js` AI + fallback, `src/i18n.js` texts, `data/faq.json` the fictional
  business, `migrations/` D1 schema, `scripts/deploy.mjs` one-command deploy.
- **Test:** `test/e2e.mjs` drives the bot with fake Telegram updates against `wrangler dev`; a recorded run is in
  `test/transcript.md`.

Setup and deploy: [SETUP.md](SETUP.md).
