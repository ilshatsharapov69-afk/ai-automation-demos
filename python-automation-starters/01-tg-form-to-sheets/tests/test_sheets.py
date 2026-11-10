"""GoogleSheetWriter against a fake gspread client: no Google account, no network."""
import csv

import gspread
import pytest

from form2sheets.sheets import CsvWriter, GoogleSheetWriter, sanitize


class FakeResponse:
    def __init__(self, code):
        self.code = code
        self.text = ""

    def json(self):
        return {"error": {"code": self.code, "message": "quota", "status": "RESOURCE_EXHAUSTED"}}


class FakeWorksheet:
    def __init__(self, fail_times=0, fail_code=429):
        self.rows: list[list] = []
        self.options: list[str] = []
        self.fail_times = fail_times
        self.fail_code = fail_code

    def row_values(self, n):
        return self.rows[n - 1] if len(self.rows) >= n else []

    def append_row(self, values, value_input_option="RAW"):
        if self.fail_times:
            self.fail_times -= 1
            raise gspread.exceptions.APIError(FakeResponse(self.fail_code))
        self.rows.append(list(values))
        self.options.append(value_input_option)


class FakeBook:
    def __init__(self, ws=None):
        self.sheets = {"Leads": ws} if ws else {}

    def worksheet(self, name):
        if name not in self.sheets:
            raise gspread.exceptions.WorksheetNotFound(name)
        return self.sheets[name]

    def add_worksheet(self, title, rows, cols):
        self.sheets[title] = FakeWorksheet()
        return self.sheets[title]


class FakeClient:
    def __init__(self, book):
        self.book = book
        self.opened = []

    def open_by_key(self, key):
        self.opened.append(key)
        return self.book


def test_sanitize():
    assert sanitize("=HYPERLINK(\"x\")") == "'=HYPERLINK(\"x\")"
    assert sanitize("+79991234567") == "'+79991234567"
    assert sanitize("Анна") == "Анна"
    assert sanitize(None) == ""


async def test_creates_sheet_with_headers_then_appends():
    book = FakeBook()
    writer = GoogleSheetWriter("SHEET123", headers=["Date", "Name"], client=FakeClient(book))
    await writer.append(["2026-11-05", "=1+1"])
    await writer.append(["2026-11-05", "Bob"])
    ws = book.sheets["Leads"]
    assert ws.rows == [["Date", "Name"], ["2026-11-05", "'=1+1"], ["2026-11-05", "Bob"]]
    assert ws.options == ["RAW", "USER_ENTERED", "USER_ENTERED"]


def test_existing_header_not_duplicated():
    ws = FakeWorksheet()
    ws.rows.append(["Date", "Name"])
    writer = GoogleSheetWriter("S", headers=["Date", "Name"], client=FakeClient(FakeBook(ws)))
    writer.append_sync(["d", "n"])
    assert ws.rows == [["Date", "Name"], ["d", "n"]]


def test_retries_quota_errors():
    ws = FakeWorksheet(fail_times=2, fail_code=429)
    sleeps = []
    writer = GoogleSheetWriter("S", client=FakeClient(FakeBook(ws)), sleep=sleeps.append, backoff=1)
    writer.append_sync(["a"])
    assert ws.rows == [["a"]]
    assert sleeps == [1, 2]


def test_does_not_retry_permission_error():
    ws = FakeWorksheet(fail_times=5, fail_code=403)
    writer = GoogleSheetWriter("S", client=FakeClient(FakeBook(ws)), sleep=lambda s: None)
    with pytest.raises(gspread.exceptions.APIError):
        writer.append_sync(["a"])


async def test_csv_writer(tmp_path):
    path = tmp_path / "leads.csv"
    writer = CsvWriter(path, headers=["Дата", "Имя"])
    await writer.append(["2026-11-05", "Анна"])
    await writer.append(["2026-11-05", "Борис"])
    raw = path.read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf")  # BOM so Excel shows Cyrillic correctly
    rows = list(csv.reader(path.read_text(encoding="utf-8-sig").splitlines(), delimiter=";"))
    assert rows == [["Дата", "Имя"], ["2026-11-05", "Анна"], ["2026-11-05", "Борис"]]
