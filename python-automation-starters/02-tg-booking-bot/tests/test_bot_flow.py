"""Full conversations through the real Dispatcher with a fake Telegram and a temp SQLite file."""
from datetime import datetime

import pytest

from bookingbot.bot import AdminAct, BookIt, CancelIt, Menu, Pick, build_dispatcher
from bookingbot.db import Repo
from tests.fakebot import TgSim

ADMIN = 777
CLIENT = 100
OTHER = 200
NOW = datetime(2026, 11, 5, 9, 0)  # Thursday


@pytest.fixture
def repo(tmp_path):
    return Repo(tmp_path / "bookings.db")


@pytest.fixture
def sim(repo):
    return TgSim(build_dispatcher(repo, admin_ids=(ADMIN,), clock=lambda: NOW))


async def book_cut_at_noon(sim, user_id=CLIENT, lang="ru"):
    await sim.click(Pick(svc="cut", day="20261106", hm="1200").pack(), user_id=user_id, lang=lang)
    await sim.click(BookIt(svc="cut", day="20261106", hm="1200").pack(), user_id=user_id, lang=lang)


async def test_full_booking_flow_and_admin_confirmation(sim, repo):
    await sim.send("/start")
    assert "записаться" in sim.last(CLIENT).text
    assert [d for _, d in sim.buttons(CLIENT)] == [Menu(action="book").pack(), Menu(action="my").pack()]

    await sim.click(Menu(action="book").pack())
    assert sim.last(CLIENT).text == "Выберите услугу:"
    assert sim.buttons(CLIENT)[0][0] == "Стрижка (60 мин) · 1500 ₽"

    await sim.click(Pick(svc="cut").pack())
    day_labels = [text for text, _ in sim.buttons(CLIENT)]
    assert day_labels[:3] == ["Чт 05.11", "Пт 06.11", "Сб 07.11"]
    assert "Вс 08.11" not in day_labels  # day off

    await sim.click(Pick(svc="cut", day="20261106").pack())
    assert sim.last(CLIENT).text == "Свободное время на Пт 06.11:"
    times = [text for text, _ in sim.buttons(CLIENT)]
    assert times[0] == "10:00" and "18:00" in times and "18:30" not in times

    await book_cut_at_noon(sim)
    assert "Заявка №1" in sim.last(CLIENT).text
    booking = repo.get(1)
    assert (booking.starts_at, booking.ends_at, booking.status) == (
        datetime(2026, 11, 6, 12, 0), datetime(2026, 11, 6, 13, 0), "new")

    admin_msg = sim.last(ADMIN)
    assert "Запись №1" in admin_msg.text and "Пт 06.11 12:00" in admin_msg.text and "@client" in admin_msg.text
    assert [d for _, d in sim.buttons(ADMIN)] == [AdminAct(action="ok", id=1).pack(), AdminAct(action="no", id=1).pack()]

    await sim.click(AdminAct(action="ok", id=1).pack(), user_id=ADMIN)
    assert repo.get(1).status == "confirmed"
    assert "Статус: подтверждена" in sim.last(ADMIN).text
    assert sim.last(CLIENT).text.startswith("✅ Запись №1 подтверждена")


async def test_taken_slot_disappears_and_cannot_be_double_booked(sim, repo):
    await book_cut_at_noon(sim, user_id=CLIENT)
    await sim.click(Pick(svc="cut", day="20261106").pack(), user_id=OTHER)
    times = [text for text, _ in sim.buttons(OTHER)]
    assert "12:00" not in times and "11:30" not in times and "13:00" in times
    # An old button pressed anyway:
    await sim.click(BookIt(svc="cut", day="20261106", hm="1130").pack(), user_id=OTHER)
    assert len(repo.for_day(datetime(2026, 11, 6).date())) == 1
    assert sim.last(OTHER).text == "Свободное время на Пт 06.11:"  # shown fresh times again


async def test_crafted_buttons_rejected(sim, repo):
    await sim.click(BookIt(svc="cut", day="20261108", hm="1200").pack())  # Sunday
    await sim.click(BookIt(svc="cut", day="20261105", hm="0930").pack())  # before lead time / opening
    await sim.click(BookIt(svc="cut", day="20261105", hm="1015").pack())  # not on the 30-min grid
    await sim.click(BookIt(svc="nope", day="20261106", hm="1200").pack())
    assert repo.for_day(datetime(2026, 11, 5).date()) == []
    assert repo.get(1) is None


async def test_only_admin_can_confirm(sim, repo):
    await book_cut_at_noon(sim)
    await sim.click(AdminAct(action="ok", id=1).pack(), user_id=CLIENT)
    assert repo.get(1).status == "new"
    await sim.click(AdminAct(action="no", id=1).pack(), user_id=ADMIN)
    assert repo.get(1).status == "declined"
    assert "отклонена" in sim.last(CLIENT).text
    # the slot is free again after a decline
    await sim.click(Pick(svc="cut", day="20261106").pack(), user_id=OTHER)
    assert "12:00" in [text for text, _ in sim.buttons(OTHER)]


async def test_my_bookings_and_cancel(sim, repo):
    await book_cut_at_noon(sim)
    await sim.send("/my")
    assert "№1 · Стрижка · Пт 06.11 12:00 · ожидает" in sim.last(CLIENT).text
    assert sim.buttons(CLIENT)[0] == ("Отменить №1", CancelIt(id=1).pack())
    await sim.click(CancelIt(id=1).pack(), user_id=OTHER)  # someone else's booking
    assert repo.get(1).status == "new"
    await sim.click(CancelIt(id=1).pack())
    assert repo.get(1).status == "cancelled"
    assert "нет предстоящих" in sim.last(CLIENT).text
    assert "Клиент отменил запись №1" in sim.last(ADMIN).text


async def test_english_client(sim, repo):
    await sim.send("/start", lang="en")
    assert sim.last(CLIENT).text.startswith("Hello!")
    await book_cut_at_noon(sim, lang="en")
    assert sim.last(CLIENT).text.startswith("Done! Request #1")
    await sim.click(AdminAct(action="ok", id=1).pack(), user_id=ADMIN)
    assert sim.last(CLIENT).text == "✅ Booking #1 is confirmed: Haircut, Fri 06.11 12:00. See you!"


async def test_today_for_admin_only(sim, repo):
    await sim.click(Pick(svc="color", day="20261105", hm="1400").pack())
    await sim.click(BookIt(svc="color", day="20261105", hm="1400").pack())
    await sim.send("/today", user_id=ADMIN)
    assert "14:00–16:00 · Окрашивание" in sim.last(ADMIN).text
    before = len(sim.messages(CLIENT))
    await sim.send("/today", user_id=CLIENT)
    assert len(sim.messages(CLIENT)) == before  # ignored for non-admins
