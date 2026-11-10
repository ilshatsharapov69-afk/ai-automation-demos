"""Crawler, retries and exporters against saved HTML served by httpx.MockTransport (no network)."""
import csv
import json
from pathlib import Path

import gspread
import httpx
import pytest

from parserkit.__main__ import main
from parserkit.crawl import crawl, parse_page
from parserkit.export import to_csv, to_json, to_sheets
from parserkit.fetch import Fetcher, FetchError, NotFound
from parserkit.sites import BOOKS, SiteConfig, money, star_rating

FIX = Path(__file__).parent / "fixtures"
BASE = "https://books.toscrape.com/catalogue/"


class FakeSite:
    """Serves fixtures; `script[url]` is a list of status codes / exceptions to return before the page."""

    def __init__(self, script=None, pages=None):
        self.script = {k: list(v) for k, v in (script or {}).items()}
        self.pages = pages or {f"{BASE}page-{n}.html": (FIX / f"page-{n}.html").read_text("utf-8") for n in (1, 2, 3)}
        self.hits: list[str] = []

    def __call__(self, request):
        url = str(request.url).split("?")[0]
        self.hits.append(url)
        queue = self.script.get(url)
        if queue:
            item = queue.pop(0)
            if isinstance(item, Exception):
                raise item
            status, headers = item if isinstance(item, tuple) else (item, {})
            return httpx.Response(status, headers=headers, text="busy")
        if url in self.pages:
            return httpx.Response(200, text=self.pages[url], headers={"content-type": "text/html; charset=utf-8"})
        return httpx.Response(404, text="nope")


def fetcher_for(site, sleeps=None, **kw):
    sleeps = [] if sleeps is None else sleeps
    client = httpx.Client(transport=httpx.MockTransport(site))
    return Fetcher(client, sleep=sleeps.append, jitter=0, **kw)


def test_parse_page_fields_and_next_link():
    html = (FIX / "page-1.html").read_text("utf-8")
    items, next_url = parse_page(html, BASE + "page-1.html", BOOKS)
    assert next_url == BASE + "page-2.html"
    assert items[0] == {
        "title": "A Light in the Attic",  # full title from @title, not the truncated link text
        "price": 51.77,
        "in_stock": True,
        "rating": 3,
        "url": BASE + "a-light-in-the-attic_1000/index.html",
    }
    assert items[2]["in_stock"] is False


def test_crawl_follows_next_dedupes_and_stops_on_last_page():
    site = FakeSite()
    rows = list(crawl(BOOKS, fetcher_for(site, delay=0)))
    assert len(rows) == 8  # 9 cards, one repeated across pages
    assert [r["title"] for r in rows][-1] == "Наш «тест» & <кириллица>"
    assert site.hits == [BASE + "page-1.html", BASE + "page-2.html", BASE + "page-3.html"]


def test_max_pages_and_max_items():
    assert len(list(crawl(BOOKS, fetcher_for(FakeSite(), delay=0), max_pages=2))) == 6
    site = FakeSite()
    assert len(list(crawl(BOOKS, fetcher_for(site, delay=0), max_items=4))) == 4
    assert len(site.hits) == 2  # stopped as soon as it had enough


def test_retries_5xx_429_with_retry_after_and_network_errors():
    site = FakeSite(script={BASE + "page-2.html": [
        503,
        (429, {"Retry-After": "7"}),
        httpx.ConnectError("reset"),
    ]})
    sleeps = []
    rows = list(crawl(BOOKS, fetcher_for(site, sleeps, delay=0, backoff=1)))
    assert len(rows) == 8
    assert sleeps == [1, 7, 4]  # backoff 1*2^0, then Retry-After, then 1*2^2


def test_polite_delay_between_requests():
    sleeps = []
    list(crawl(BOOKS, fetcher_for(FakeSite(), sleeps, delay=0.5)))
    assert sleeps == [0.5, 0.5]


def test_gives_up_after_retries_and_does_not_retry_403():
    site = FakeSite(script={BASE + "page-1.html": [500] * 10})
    with pytest.raises(FetchError) as exc:
        fetcher_for(site, retries=2).get(BASE + "page-1.html")
    assert exc.value.status == 500 and len(site.hits) == 3
    site = FakeSite(script={BASE + "page-1.html": [403]})
    with pytest.raises(FetchError):
        fetcher_for(site).get(BASE + "page-1.html")
    assert len(site.hits) == 1
    with pytest.raises(NotFound):
        fetcher_for(FakeSite()).get(BASE + "missing.html")


def test_page_number_mode_stops_on_404_and_empty_page():
    cfg = SiteConfig(**{**BOOKS.__dict__, "next_page": None, "page_url": BASE + "page-{page}.html"})
    assert len(list(crawl(cfg, fetcher_for(FakeSite(), delay=0)))) == 8  # page-4 is 404 -> stop
    pages = FakeSite().pages
    pages[BASE + "page-2.html"] = (FIX / "empty.html").read_text()
    assert len(list(crawl(cfg, fetcher_for(FakeSite(pages=pages), delay=0)))) == 3


def test_pagination_loop_guard():
    pages = FakeSite().pages
    pages[BASE + "page-2.html"] = pages[BASE + "page-2.html"].replace('href="page-3.html"', 'href="page-1.html"')
    site = FakeSite(pages=pages)
    rows = list(crawl(BOOKS, fetcher_for(site, delay=0)))
    assert len(rows) == 6 and len(site.hits) == 2


@pytest.mark.parametrize("text,value", [("£51.77", 51.77), ("1 299,00 ₽", 1299.0), ("$1,299.00", 1299.0),
                                        ("1.299,50 €", 1299.5), ("1,299", 1299.0), ("", None)])
def test_money(text, value):
    assert money(text) == value


def test_star_rating():
    assert star_rating("star-rating Five") == 5 and star_rating("star-rating") is None


ROWS = [{"title": "Наш «тест»", "price": 9.99, "in_stock": True, "url": "u1"},
        {"title": "=cmd", "price": None, "in_stock": False, "url": "u2", "extra": "x"}]


def test_csv_excel_friendly(tmp_path):
    path = to_csv(ROWS, tmp_path / "out.csv")
    assert path.read_bytes().startswith(b"\xef\xbb\xbf")
    rows = list(csv.reader(path.read_text("utf-8-sig").splitlines(), delimiter=";"))
    assert rows[0] == ["title", "price", "in_stock", "url", "extra"]
    assert rows[1] == ["Наш «тест»", "9.99", "yes", "u1", ""]
    assert rows[2] == ["'=cmd", "", "no", "u2", "x"]  # no formula injection in Excel


def test_json(tmp_path):
    path = to_json(ROWS, tmp_path / "out.json")
    assert json.loads(path.read_text("utf-8"))[0]["title"] == "Наш «тест»"


class FakeWS:
    def __init__(self):
        self.calls = []

    def clear(self):
        self.calls.append(("clear",))

    def append_rows(self, values, value_input_option):
        self.calls.append(("append", values, value_input_option))


class FakeBook:
    def __init__(self, ws=None):
        self.ws = ws
        self.added = None

    def worksheet(self, name):
        if self.ws is None:
            raise gspread.exceptions.WorksheetNotFound(name)
        return self.ws

    def add_worksheet(self, title, rows, cols):
        self.added = (title, rows, cols)
        self.ws = FakeWS()
        return self.ws


class FakeGC:
    def __init__(self, book):
        self.book = book

    def open_by_key(self, key):
        assert key == "SHEET"
        return self.book


def test_sheets_export_replaces_contents_in_chunks():
    ws = FakeWS()
    rows = [{"n": i} for i in range(5)]
    assert to_sheets(rows, "SHEET", client=FakeGC(FakeBook(ws)), chunk=4) == 5
    assert ws.calls[0] == ("clear",)
    assert ws.calls[1] == ("append", [["n"], [0], [1], [2]], "RAW")
    assert ws.calls[2] == ("append", [[3], [4]], "RAW")


def test_sheets_export_creates_worksheet():
    book = FakeBook()
    to_sheets(ROWS, "SHEET", worksheet="Books", client=FakeGC(book))
    assert book.added == ("Books", 3, 5)
    assert book.ws.calls[0][1][1] == ["Наш «тест»", 9.99, "yes", "u1", ""]


def test_cli_end_to_end(tmp_path, capsys):
    out, js = tmp_path / "books.csv", tmp_path / "books.json"
    code = main(["--pages", "5", "--out", str(out), "--json", str(js)], fetcher=fetcher_for(FakeSite(), delay=0))
    assert code == 0
    assert "(8 rows)" in capsys.readouterr().out
    assert len(json.loads(js.read_text("utf-8"))) == 8


def test_cli_keeps_partial_results_on_failure(tmp_path):
    site = FakeSite(script={BASE + "page-2.html": [500] * 10})
    out = tmp_path / "partial.csv"
    code = main(["--out", str(out)], fetcher=fetcher_for(site, delay=0, retries=1))
    assert code == 0
    assert len(out.read_text("utf-8-sig").splitlines()) == 1 + 3
