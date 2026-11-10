# AI automation demos

Working demos of the things small businesses ask for: AI agents that sort and answer requests, RAG over company
documents, Telegram bots and Mini Apps, lead capture, scrapers with dashboards. Each one is deployed and can be
tried in a browser or in Telegram. All businesses in them are fictional.

Built with Claude Code: a spec, the agent writes the code, offline tests, an independent review, then my acceptance.

| Demo | What it does | Stack | Try it |
|---|---|---|---|
| [ai-inbox-agent](ai-inbox-agent/) | Requests from a web form, an email webhook and a Telegram bot: an LLM sorts each one, extracts the contact and budget, scores the lead and drafts a reply from the FAQ | Workers, D1, Workers AI (Llama 3.1 8B classifies, Llama 3.3 70B drafts) | [live](https://ai-inbox-agent-demo.sherlock753cc.workers.dev/inbox) |
| [rag-knowledge-base](rag-knowledge-base/) | Answers questions over a fictional company's documents, with citations | Workers AI `bge-m3` embeddings, Vectorize + D1 FTS5, hybrid ranking | [live](https://rag-knowledge-base-demo.sherlock753cc.workers.dev/) |
| [telegram-faq-booking-bot](telegram-faq-booking-bot/) | FAQ answers by LLM, bookings, an owner card with Confirm / Decline | Worker webhook, D1, Workers AI | [@shov_demo_bot](https://t.me/shov_demo_bot) |
| [tg-crm-miniapp](tg-crm-miniapp/) | A sales CRM inside Telegram: leads, statuses, morning digest and reminders | Telegram Mini App, `initData` HMAC check, Workers, D1 | [live](https://tg-crm-miniapp-demo.sherlock753cc.workers.dev/) |
| [landing-quiz](landing-quiz/) | A landing page with a 5-step cost quiz; the lead goes to a database and to the owner's Telegram | Workers static assets, D1 | [live](https://landing-quiz-demo.sherlock753cc.workers.dev/) |
| [scraper-dashboard](scraper-dashboard/) | A price monitor: scraper, change history, dashboard | Worker, D1, lazy refresh behind a D1 lock | [live](https://price-monitor-demo.sherlock753cc.workers.dev/) |
| [youtube-packaging](youtube-packaging/) | Titles, chapters, tags and thumbnail text from a transcript; an outlier finder | Workers AI, D1 rate limits | [live](https://video-packager-demo.sherlock753cc.workers.dev/) |
| [channel-autopost-bot](channel-autopost-bot/) | Runs a Telegram channel: AI drafts, Approve / Edit previews, posts go out at set time slots | Worker, D1, Workers AI | code only |
| [python-automation-starters](python-automation-starters/) | Five Python starters: Telegram form → Google Sheets, booking bot, webhook → amoCRM / Bitrix24, parser → export, LLM FAQ bot | aiogram 3, FastAPI, httpx, SQLite, pytest | `pytest` |

## Running

Every Cloudflare demo: `npm ci && npm test` (offline tests), `npx wrangler dev` to run locally, `npx wrangler deploy` to
deploy. The D1 `database_id` values in `wrangler.toml` are zeroed: create your own database with
`npx wrangler d1 create <name>` and put its id there. The README in each folder has the details.

Python starters: `cd python-automation-starters && ./run_tests.sh --install` (118 tests at the last run).

## Contact

Ilshat Sharapov · Telegram [@shov69](https://t.me/shov69) · [sherlock753cc@gmail.com](mailto:sherlock753cc@gmail.com)
· [github.com/ilshatsharapov69-afk](https://github.com/ilshatsharapov69-afk)
