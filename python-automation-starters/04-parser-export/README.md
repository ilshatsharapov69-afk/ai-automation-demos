# 04 · Parser with pagination, retries and CSV / JSON / Google Sheets export

**RU:** парсер каталога: проходит страницы (ссылка «далее» или `?page=N`), повторяет запросы при 429/5xx/обрывах
(с учётом `Retry-After`), делает паузы между запросами, убирает дубли, чистит цены и рейтинги, сохраняет CSV для Excel,
JSON и Google Таблицу. При сбое посередине сохраняет то, что успел собрать.

**EN:** a catalogue parser: walks pages (next link or `?page=N`), retries 429/5xx/network errors (honours
`Retry-After`), waits between requests, drops duplicates, cleans prices and ratings, exports Excel-friendly CSV, JSON
and Google Sheets. If it fails half-way it still saves what it has.

Stack: Python 3.10+, httpx, BeautifulSoup. The demo target is <https://books.toscrape.com>, a public sandbox built for
scraping practice.

## Run in 2 commands

```bash
pip install -r requirements.txt
python -m parserkit --pages 3 --out books.csv --json books.json
```

Add `--sheet-id <id>` to push the same rows to Google Sheets (service account as in starter 01: share the sheet with
the account's e-mail, key file `service_account.json` or `--credentials path`).

Tests, offline (saved HTML pages served by `httpx.MockTransport`, sleeps recorded instead of waited):

```bash
pip install -r requirements-dev.txt && pytest
```

## What is already handled

| Problem | How |
|---|---|
| 429 / 5xx / connection reset | up to 4 retries, exponential backoff with jitter, `Retry-After` respected (capped at 60 s) |
| 403 / 401 / 404 | not retried (403 = blocked: change headers/proxy, do not hammer); 404 in page-number mode = last page |
| Being polite / not banned | `--delay` between requests, browser User-Agent, one connection |
| Endless pagination | stops on a page it has already seen, on an empty page, on `--pages` and `--limit` |
| Same item on two pages | de-duplicated by `key` (URL by default) |
| Prices like `1 299,00 ₽`, `$1,299.00`, `£51.77` | `money()` → float |
| Excel shows `Ð¢ÐµÑÑ` instead of Cyrillic | CSV is UTF-8 with BOM and `;` |
| A cell `=HYPERLINK(...)` from the site | prefixed with `'` in CSV, written `RAW` to Sheets |
| Crash on page 37 of 40 | rows collected so far are still exported, exit code 0 |

## Adapt in 30 minutes

1. Open the target page, right-click a product card → Inspect. Note the card selector and the selectors inside it.
2. Add a `SiteConfig` to `parserkit/sites.py` and register it in `SITES`:

```python
SHOP = SiteConfig(
    name="shop",
    start_url="https://example.com/catalog?page=1",
    page_url="https://example.com/catalog?page={page}",   # or next_page="a.pagination__next@href"
    item="div.product-card",
    fields={"title": "a.product-card__title", "price": ".price", "url": "a.product-card__title@href",
            "sku": "@data-sku"},
    clean={"price": money},
)
```

3. Save one page to `tests/fixtures/`, copy `test_parse_page_fields_and_next_link`, run `pytest`, then
   `python -m parserkit --site shop`.

| Client asks for | Change |
|---|---|
| Open each item page for details | In `crawl`, after a row is built, `fetcher.get(row["url"])` and `parse_page` with a detail config. |
| JSON API instead of HTML (many SPAs) | Find the XHR in DevTools → Network, call it with `fetcher.client.get(...).json()`; pagination logic stays. |
| JavaScript-rendered pages | Playwright `page.content()` instead of `fetcher.get`; parsing and export unchanged. |
| Proxies | `httpx.Client(proxy="http://user:pass@host:port")` passed to `Fetcher`. |
| Daily run with only new items | cron + keep the set of seen keys in SQLite; export only new rows. |
| Excel `.xlsx` | `openpyxl` (`ws.append(row)`) next to `to_csv`. |

## Files

```
parserkit/fetch.py    Fetcher: retries, backoff, Retry-After, delay; FetchError / NotFound
parserkit/sites.py    SiteConfig + the books.toscrape.com example; money() and star_rating() cleaners
parserkit/crawl.py    parse_page() and crawl() with loop/empty/limit guards and dedupe
parserkit/export.py   to_csv (Excel-friendly), to_json, to_sheets (gspread, chunked)
tests/fixtures/       three saved catalogue pages + an empty page
```
