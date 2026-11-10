"""SQLite storage. Double booking is prevented inside one write transaction."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS bookings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    username    TEXT,
    full_name   TEXT,
    lang        TEXT NOT NULL DEFAULT 'ru',
    service_id  TEXT NOT NULL,
    starts_at   TEXT NOT NULL,   -- ISO local time, 'YYYY-MM-DDTHH:MM'
    ends_at     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'new',  -- new | confirmed | declined | cancelled
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_starts ON bookings(starts_at);
CREATE INDEX IF NOT EXISTS bookings_user ON bookings(user_id);
"""

ACTIVE = ("new", "confirmed")


class SlotTaken(Exception):
    pass


@dataclass
class Booking:
    id: int
    user_id: int
    username: str | None
    full_name: str | None
    lang: str
    service_id: str
    starts_at: datetime
    ends_at: datetime
    status: str

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "Booking":
        return cls(row["id"], row["user_id"], row["username"], row["full_name"], row["lang"], row["service_id"],
                   datetime.fromisoformat(row["starts_at"]), datetime.fromisoformat(row["ends_at"]), row["status"])


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M")


class Repo:
    def __init__(self, path: str | Path = "bookings.db"):
        # isolation_level=None: we manage transactions explicitly with BEGIN IMMEDIATE.
        self.conn = sqlite3.connect(str(path), isolation_level=None, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def busy(self, day: date) -> list[tuple[datetime, datetime]]:
        lo, hi = _iso(datetime.combine(day, datetime.min.time())), _iso(datetime.combine(day + timedelta(days=1), datetime.min.time()))
        rows = self.conn.execute(
            f"SELECT starts_at, ends_at FROM bookings WHERE status IN {ACTIVE} AND starts_at < ? AND ends_at > ?",
            (hi, lo),
        ).fetchall()
        return [(datetime.fromisoformat(r[0]), datetime.fromisoformat(r[1])) for r in rows]

    def create(self, *, user_id: int, username: str | None, full_name: str | None, lang: str,
               service_id: str, starts_at: datetime, minutes: int, now: datetime) -> Booking:
        ends_at = starts_at + timedelta(minutes=minutes)
        cur = self.conn.cursor()
        cur.execute("BEGIN IMMEDIATE")  # write lock: two users cannot grab the same slot
        try:
            clash = cur.execute(
                f"SELECT 1 FROM bookings WHERE status IN {ACTIVE} AND starts_at < ? AND ends_at > ? LIMIT 1",
                (_iso(ends_at), _iso(starts_at)),
            ).fetchone()
            if clash:
                raise SlotTaken(_iso(starts_at))
            cur.execute(
                "INSERT INTO bookings (user_id, username, full_name, lang, service_id, starts_at, ends_at, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, username, full_name, lang, service_id, _iso(starts_at), _iso(ends_at), now.isoformat(timespec="seconds")),
            )
            booking_id = cur.lastrowid
            cur.execute("COMMIT")
        except BaseException:
            cur.execute("ROLLBACK")
            raise
        return self.get(booking_id)

    def get(self, booking_id: int) -> Booking | None:
        row = self.conn.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,)).fetchone()
        return Booking.from_row(row) if row else None

    def upcoming_for_user(self, user_id: int, now: datetime) -> list[Booking]:
        rows = self.conn.execute(
            f"SELECT * FROM bookings WHERE user_id = ? AND status IN {ACTIVE} AND starts_at >= ? ORDER BY starts_at",
            (user_id, _iso(now)),
        ).fetchall()
        return [Booking.from_row(r) for r in rows]

    def for_day(self, day: date) -> list[Booking]:
        rows = self.conn.execute(
            f"SELECT * FROM bookings WHERE status IN {ACTIVE} AND substr(starts_at, 1, 10) = ? ORDER BY starts_at",
            (day.isoformat(),),
        ).fetchall()
        return [Booking.from_row(r) for r in rows]

    def set_status(self, booking_id: int, status: str, *, only_from: tuple[str, ...] = ACTIVE,
                   user_id: int | None = None) -> Booking | None:
        """Change status if the booking is currently in `only_from` (and belongs to `user_id` if given)."""
        sql = f"UPDATE bookings SET status = ? WHERE id = ? AND status IN ({','.join('?' * len(only_from))})"
        params: list = [status, booking_id, *only_from]
        if user_id is not None:
            sql += " AND user_id = ?"
            params.append(user_id)
        changed = self.conn.execute(sql, params).rowcount
        return self.get(booking_id) if changed else None
