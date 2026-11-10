"""Pure scheduling logic: which days and start times are free. No Telegram, no database."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Iterable

from . import catalog


def open_days(today: date, days_ahead: int = catalog.DAYS_AHEAD) -> list[date]:
    days = (today + timedelta(days=i) for i in range(days_ahead))
    return [d for d in days if d.weekday() not in catalog.DAYS_OFF]


def overlaps(start: datetime, end: datetime, busy: Iterable[tuple[datetime, datetime]]) -> bool:
    return any(start < b_end and b_start < end for b_start, b_end in busy)


def free_starts(day: date, minutes: int, busy: Iterable[tuple[datetime, datetime]], now: datetime) -> list[datetime]:
    """Start times on `day` where a `minutes`-long visit fits inside opening hours,
    does not overlap `busy` intervals and is at least MIN_LEAD_MIN after `now`.
    All datetimes are naive local time of the business."""
    busy = list(busy)
    start = datetime.combine(day, catalog.OPEN_AT)
    close = datetime.combine(day, catalog.CLOSE_AT)
    earliest = now + timedelta(minutes=catalog.MIN_LEAD_MIN)
    step = timedelta(minutes=catalog.SLOT_STEP_MIN)
    length = timedelta(minutes=minutes)
    result = []
    while start + length <= close:
        if start >= earliest and not overlaps(start, start + length, busy):
            result.append(start)
        start += step
    return result
