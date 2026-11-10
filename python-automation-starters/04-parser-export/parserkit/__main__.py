"""python -m parserkit --pages 3 --out books.csv [--json books.json] [--sheet-id ID]"""
from __future__ import annotations

import argparse
import logging
import sys

from .crawl import crawl
from .export import to_csv, to_json, to_sheets
from .fetch import Fetcher, FetchError
from .sites import SITES


def main(argv: list[str] | None = None, fetcher: Fetcher | None = None) -> int:
    p = argparse.ArgumentParser(prog="parserkit", description="Paginated parser with retries and CSV/JSON/Sheets export")
    p.add_argument("--site", default="books", choices=sorted(SITES))
    p.add_argument("--pages", type=int, default=3, help="max pages to walk")
    p.add_argument("--limit", type=int, default=None, help="max rows")
    p.add_argument("--delay", type=float, default=0.5, help="seconds between requests")
    p.add_argument("--out", default="result.csv", help="CSV path ('' to skip)")
    p.add_argument("--json", default="", help="also write JSON here")
    p.add_argument("--sheet-id", default="", help="also export to this Google Sheet")
    p.add_argument("--worksheet", default="Data")
    p.add_argument("--credentials", default="service_account.json")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    fetcher = fetcher or Fetcher(delay=args.delay)
    rows = []
    try:
        for row in crawl(SITES[args.site], fetcher, max_pages=args.pages, max_items=args.limit):
            rows.append(row)
    except FetchError as exc:
        # Keep what we already have: a partial export beats nothing.
        logging.error("Stopped early: %s (%s rows collected)", exc, len(rows))
    if args.out:
        print(f"CSV: {to_csv(rows, args.out)} ({len(rows)} rows)")
    if args.json:
        print(f"JSON: {to_json(rows, args.json)}")
    if args.sheet_id:
        n = to_sheets(rows, args.sheet_id, worksheet=args.worksheet, credentials_file=args.credentials)
        print(f"Google Sheets: {n} rows -> {args.sheet_id}/{args.worksheet}")
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
