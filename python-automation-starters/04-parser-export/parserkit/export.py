"""Exporters: CSV that Excel opens correctly, JSON, Google Sheets (service account)."""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Sequence


def _columns(rows: Sequence[dict[str, Any]]) -> list[str]:
    cols: list[str] = []
    for row in rows:
        cols += [k for k in row if k not in cols]
    return cols


def _cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    return value


def _safe(value: Any) -> Any:
    """Text starting with = + - @ would run as a formula in Excel: prefix it with '."""
    return "'" + value if isinstance(value, str) and value[:1] in ("=", "+", "-", "@") else value


def to_csv(rows: Sequence[dict[str, Any]], path: str | Path, *, delimiter: str = ";") -> Path:
    """UTF-8 with BOM and ';' by default: double-click opens it in Russian/European Excel without mojibake."""
    path = Path(path)
    cols = _columns(rows)
    with path.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=cols, delimiter=delimiter, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({c: _safe(_cell(row.get(c))) for c in cols})
    return path


def to_json(rows: Sequence[dict[str, Any]], path: str | Path) -> Path:
    path = Path(path)
    path.write_text(json.dumps(list(rows), ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def to_sheets(rows: Sequence[dict[str, Any]], spreadsheet_id: str, *, worksheet: str = "Data",
              credentials_file: str = "service_account.json", client: Any = None, chunk: int = 500) -> int:
    """Replace the worksheet contents with a header + rows. Returns rows written (without header).
    Auth is the same service account as starter 01 (share the sheet with its e-mail)."""
    import gspread

    client = client or gspread.service_account(filename=credentials_file)
    book = client.open_by_key(spreadsheet_id)
    cols = _columns(rows)
    try:
        ws = book.worksheet(worksheet)
        ws.clear()
    except gspread.exceptions.WorksheetNotFound:
        ws = book.add_worksheet(title=worksheet, rows=len(rows) + 1, cols=max(len(cols), 1))
    values = [cols] + [[_cell(r.get(c)) for c in cols] for r in rows]
    for start in range(0, len(values), chunk):  # Sheets API limits request size; ~500 rows per call is safe
        ws.append_rows(values[start:start + chunk], value_input_option="RAW")
    return len(rows)
