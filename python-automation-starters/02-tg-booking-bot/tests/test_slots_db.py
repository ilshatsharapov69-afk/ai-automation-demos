from datetime import date, datetime

import pytest

from bookingbot.db import Repo, SlotTaken
from bookingbot.slots import free_starts, open_days, overlaps

NOW = datetime(2026, 11, 5, 9, 0)  # Thursday
DAY = date(2026, 11, 5)


def test_open_days_skip_sunday():
    days = open_days(DAY)
    assert date(2026, 11, 8) not in days  # Sunday
    assert days[0] == DAY and len(days) == 6


def test_free_starts_respect_hours_lead_time_and_length():
    starts = free_starts(DAY, 60, [], NOW)
    assert starts[0] == datetime(2026, 11, 5, 10, 0)
    assert starts[-1] == datetime(2026, 11, 5, 18, 0)  # 18:00 + 60 min = closing time
    late = free_starts(DAY, 60, [], datetime(2026, 11, 5, 12, 10))
    assert late[0] == datetime(2026, 11, 5, 13, 30)  # now + 60 min lead time, next step
    assert free_starts(DAY, 120, [], NOW)[-1] == datetime(2026, 11, 5, 17, 0)


def test_busy_interval_blocks_overlapping_starts():
    busy = [(datetime(2026, 11, 5, 12, 0), datetime(2026, 11, 5, 14, 0))]
    starts = free_starts(DAY, 60, busy, NOW)
    assert datetime(2026, 11, 5, 11, 0) in starts      # ends exactly at 12:00
    assert datetime(2026, 11, 5, 11, 30) not in starts  # would run into 12:00
    assert datetime(2026, 11, 5, 13, 30) not in starts
    assert datetime(2026, 11, 5, 14, 0) in starts
    assert overlaps(datetime(2026, 11, 5, 13), datetime(2026, 11, 5, 15), busy)


@pytest.fixture
def repo(tmp_path):
    return Repo(tmp_path / "t.db")


def make(repo, start, minutes=60, user_id=1):
    return repo.create(user_id=user_id, username="u", full_name="U", lang="ru", service_id="cut",
                       starts_at=start, minutes=minutes, now=NOW)


def test_no_double_booking(repo):
    b = make(repo, datetime(2026, 11, 5, 12, 0), minutes=120)
    assert b.id == 1 and b.status == "new"
    with pytest.raises(SlotTaken):
        make(repo, datetime(2026, 11, 5, 13, 0), user_id=2)
    make(repo, datetime(2026, 11, 5, 14, 0), user_id=2)  # back to back is fine
    assert repo.busy(DAY) == [
        (datetime(2026, 11, 5, 12, 0), datetime(2026, 11, 5, 14, 0)),
        (datetime(2026, 11, 5, 14, 0), datetime(2026, 11, 5, 15, 0)),
    ]


def test_cancel_frees_slot_and_checks_owner(repo):
    b = make(repo, datetime(2026, 11, 5, 12, 0))
    assert repo.set_status(b.id, "cancelled", user_id=999) is None  # not the owner
    assert repo.set_status(b.id, "cancelled", user_id=1).status == "cancelled"
    assert repo.busy(DAY) == []
    make(repo, datetime(2026, 11, 5, 12, 0), user_id=2)


def test_admin_cannot_confirm_twice(repo):
    b = make(repo, datetime(2026, 11, 5, 12, 0))
    assert repo.set_status(b.id, "confirmed", only_from=("new",)).status == "confirmed"
    assert repo.set_status(b.id, "declined", only_from=("new",)) is None


def test_upcoming_and_day_lists(repo):
    make(repo, datetime(2026, 11, 5, 12, 0))
    make(repo, datetime(2026, 11, 6, 12, 0))
    assert [b.starts_at.day for b in repo.upcoming_for_user(1, NOW)] == [5, 6]
    assert [b.starts_at.day for b in repo.for_day(DAY)] == [5]
