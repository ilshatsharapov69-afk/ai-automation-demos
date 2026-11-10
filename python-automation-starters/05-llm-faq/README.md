# 05 · LLM FAQ answerer (pluggable provider, offline stub, Telegram front-end)

**RU:** отвечает на вопросы клиентов по базе FAQ (`faq.json`). Сначала находит подходящие записи (BM25 с простым
русским/английским стеммингом), и только если уверен — просит модель сформулировать ответ строго по этим записям. Если
ответа в базе нет, не выдумывает, а передаёт вопрос менеджеру. Провайдер меняется одной переменной: офлайн-заглушка,
Ollama, Cloudflare Workers AI, любой OpenAI-совместимый API, Claude. Есть Telegram-бот.

**EN:** answers customer questions from an FAQ file. It retrieves matching entries first (BM25 with a small RU/EN
stemmer) and calls the model only when confident, with instructions to answer strictly from those entries. When the
FAQ has no answer it hands off to a human instead of guessing. One variable switches the provider: offline stub,
Ollama, Cloudflare Workers AI, any OpenAI-compatible API, or Claude. Includes a Telegram bot.

Stack: Python 3.10+, httpx; aiogram 3 for Telegram; `anthropic` SDK only for the Claude provider.

## Run in 2 commands

```bash
pip install -r requirements.txt
python -m faqbot "Сколько стоит доставка?"
```

```
Доставка 199 ₽, бесплатно при заказе от 1500 ₽.
  [stub, sources: delivery_price, delivery_time, zone; confidence 1.00]
```

`python -m faqbot` without arguments opens a console chat; `BOT_TOKEN=… python -m faqbot --telegram` starts the bot.
The default provider is `stub` (returns the best FAQ answer verbatim), so everything works offline with no keys.

Tests, offline (HTTP providers via `httpx.MockTransport`, Claude via a fake client and via the real SDK over a mock
transport, Telegram via a recording session):

```bash
pip install -r requirements-dev.txt && pytest
```

## Providers

| `LLM_PROVIDER` | Cost | Settings |
|---|---|---|
| `stub` | free, offline | none |
| `ollama` | free, runs locally | `ollama pull llama3.1:8b`, `LLM_MODEL=llama3.1:8b` |
| `workers-ai` | free daily allowance on Cloudflare | `CF_ACCOUNT_ID`, `CF_API_TOKEN` (Workers AI permission), optional `LLM_MODEL` |
| `openai` | depends on the service | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (OpenRouter, Groq, DeepSeek, OpenAI, LM Studio…) |
| `anthropic` | paid API | `ANTHROPIC_API_KEY`; model `claude-opus-5-5` by default (`LLM_MODEL` to change), `effort: low`, server-side refusal fallback on (`fallbacks: "default"`) |

A new provider is one class with `name` and `answer(question, lang, context, business) -> str` (see
`faqbot/providers/stub.py`); register it in `make_provider`.

## Guard rails (what to tell the client)

- **No made-up answers.** Below the confidence threshold the model is not called at all; the model is also told to
  reply `HANDOFF` when the excerpts do not answer the question. Both become the polite hand-off text from `faq.json`,
  and the Telegram bot forwards the question to `ADMIN_CHAT_ID`.
- **Prompt injection.** The customer text is wrapped and declared as data; only FAQ excerpts are given as facts.
- **Model down / timeout.** The best FAQ answer is returned instead (`provider: fallback-faq`).
- **Language.** Answers in the language of the question (RU/EN).
- **Cost.** Short prompts (top 3 entries), `max_tokens` caps for HTTP providers, low effort for Claude, and no call
  for off-topic questions.

## Adapt in 30 minutes

| Client asks for | Change |
|---|---|
| Their FAQ | Replace `faq.json` (`q`, `a` per language, `tags` with synonyms and typical misspellings). A Google Sheet → export CSV → 10-line converter. |
| Too many / too few hand-offs | `MIN_CONFIDENCE`; add synonyms to `tags` of the entry that should have matched. |
| Answers from documents/PDF, not Q&A | Split documents into chunks of ~800 characters, load them as entries (`q` = heading, `a` = chunk). |
| Tone of voice, length | `system_prompt()` in `faqbot/providers/base.py`. |
| Web widget / API instead of Telegram | `FaqAnswerer.answer()` is plain Python: wrap it in FastAPI (see starter 03) in 10 lines. |
| Remember the conversation | Keep the last 3 Q/A per chat and add them to `user_prompt()`. |
| Log unanswered questions to grow the FAQ | Append `answer.handoff` questions to a CSV or to Google Sheets (starter 01 writer). |

## Files

```
faq.json                        fictional bakery FAQ, RU/EN
faqbot/kb.py                    tokenizer + stemmer, BM25 index, confidence, language detection
faqbot/answerer.py              retrieve → threshold → provider → hand-off / fallback
faqbot/providers/               stub, OpenAI-compatible, Workers AI, Anthropic, factory
faqbot/telegram.py              aiogram front-end, forwards unanswered questions to the admin
```
