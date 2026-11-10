"""Where finished forms go: Google Sheets (service account) or a local CSV for development."""
from __future__ import annotations

import asyncio
import csv
import logging
import time
from pathlib import Path
from typing import Any, Callable, Protocol, Sequence

log = logging.getLogger(__name__)

RETRYABLE_CODES = {429, 500, 502, 503, 504}


class SheetWriter(Protocol):
    async def append(self, row: Sequence[Any]) -> None: ...


def sanitize(value: Any) -> str:
    """Stop formula injection and keep '+7999…' as text: a leading ' is hidden by Sheets."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


class GoogleSheetWriter:
    """Appends rows to one worksheet. Auth: a service-account JSON key (see README).

    `client` lets tests (or a pre-built gspread client) skip the real auth.
    """

    def __init__(
        self,
        spreadsheet_id: str,
        worksheet: str = "Leads",
        headers: Sequence[str] = (),
        credentials_file: str | None = "service_account.json",
        client: Any = None,
        retries: int = 3,
        backoff: float = 1.0,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.spreadsheet_id = spreadsheet_id
        self.worksheet_name = worksheet
        self.headers = list(headers)
        self.credentials_file = credentials_file
        self._client = client
        self._ws = None
        self.retries = retries
        self.backoff = backoff
        self.sleep = sleep

    def _worksheet(self):
        if self._ws is not None:
            return self._ws
        import gspread  # imported lazily so CSV mode works without Google libs configured

        client = self._client or gspread.service_account(filename=self.credentials_file)
        book = client.open_by_key(self.spreadsheet_id)
        try:
            ws = book.worksheet(self.worksheet_name)
        except gspread.exceptions.WorksheetNotFound:
            ws = book.add_worksheet(title=self.worksheet_name, rows=1000, cols=max(len(self.headers), 10))
        if self.headers and not ws.row_values(1):
            ws.append_row(self.headers, value_input_option="RAW")
        self._ws = ws
        return ws

    def append_sync(self, row: Sequence[Any]) -> None:
        from gspread.exceptions import APIError

        values = [sanitize(v) for v in row]
        for attempt in range(self.retries + 1):
            try:
                self._worksheet().append_row(values, value_input_option="USER_ENTERED")
                return
            except APIError as exc:
                if exc.code not in RETRYABLE_CODES or attempt == self.retries:
                    raise
                delay = self.backoff * 2**attempt
                log.warning("Sheets API %s, retry in %.1fs", exc.code, delay)
                self.sleep(delay)

    async def append(self, row: Sequence[Any]) -> None:
        # gspread is synchronous; keep the bot's event loop free.
        await asyncio.to_thread(self.append_sync, row)


class CsvWriter:
    """Local fallback: same rows into a CSV that opens in Excel (UTF-8 with BOM, ';')."""

    def __init__(self, path: str | Path, headers: Sequence[str] = ()):
        self.path = Path(path)
        self.headers = list(headers)

    def append_sync(self, row: Sequence[Any]) -> None:
        new = not self.path.exists() or self.path.stat().st_size == 0
        with self.path.open("a", newline="", encoding="utf-8-sig" if new else "utf-8") as fh:
            writer = csv.writer(fh, delimiter=";")
            if new and self.headers:
                writer.writerow(self.headers)
            writer.writerow([sanitize(v) for v in row])

    async def append(self, row: Sequence[Any]) -> None:
        await asyncio.to_thread(self.append_sync, row)
