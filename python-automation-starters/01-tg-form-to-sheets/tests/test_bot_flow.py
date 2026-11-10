"""End-to-end conversation through the real Dispatcher, with a fake Telegram and a fake sheet."""
from datetime import datetime

from form2sheets.bot import build_dispatcher
from form2sheets.form import sheet_headers
from tests.fakebot import TgSim

ADMIN = 999


class MemoryWriter:
    def __init__(self, fail=0):
        self.rows = []
        self.fail = fail

    async def append(self, row):
        if self.fail:
            self.fail -= 1
            raise RuntimeError("Sheets is down")
        self.rows.append(list(row))


def make(writer):
    dp = build_dispatcher(writer, admin_chat_id=ADMIN, clock=lambda: datetime(2026, 11, 5, 12, 30))
    return TgSim(dp)


async def fill(sim, lang="ru"):
    await sim.send("/start", lang=lang)
    await sim.send("Анна", lang=lang)
    await sim.send("8 999 123 45 67", lang=lang)
    await sim.send("/skip", lang=lang)           # email
    await sim.click("pick:project", lang=lang)  # service
    await sim.send("50 000", lang=lang)          # budget
    await sim.send("Нужен бот", lang=lang)       # comment


async def test_happy_path_writes_row_and_notifies_admin():
    writer = MemoryWriter()
    sim = make(writer)
    await fill(sim)
    assert "Проверьте данные" in sim.last(100).text
    assert [d for _, d in sim.buttons(100)] == ["form:send", "form:restart"]

    await sim.click("form:send")
    assert writer.rows == [[
        "2026-11-05 12:30:00", "100", "@client", "ru",
        "Анна", "+79991234567", "", "Проект под ключ", "50000", "Нужен бот",
    ]]
    assert len(writer.rows[0]) == len(sheet_headers())
    assert "Спасибо" in sim.texts(100)[-1]
    admin_msg = sim.last(ADMIN).text
    assert "Новая заявка" in admin_msg and "+79991234567" in admin_msg


async def test_validation_errors_repeat_question():
    sim = make(MemoryWriter())
    await sim.send("/start")
    await sim.send("Анна")
    await sim.send("12")  # bad phone
    assert "Не похоже на телефон" in sim.last(100).text
    await sim.send("+7 999 123 45 67")
    assert "Email" in sim.last(100).text


async def test_required_question_cannot_be_skipped():
    sim = make(MemoryWriter())
    await sim.send("/start")
    await sim.send("/skip")
    assert "обязательный" in sim.last(100).text


async def test_english_user_gets_english():
    writer = MemoryWriter()
    sim = make(writer)
    await sim.send("/start", lang="en")
    assert sim.texts(100)[0].startswith("Hi!")
    await sim.send("Ann", lang="en")
    await sim.send("+44 20 7946 0958", lang="en")
    await sim.send("ann@example.com", lang="en")
    await sim.send("Support", lang="en")  # typed instead of the button
    await sim.send("/skip", lang="en")
    await sim.send("/skip", lang="en")
    await sim.click("form:send", lang="en")
    assert writer.rows[0][3:] == ["en", "Ann", "+442079460958", "ann@example.com", "Support", "", ""]


async def test_failed_save_keeps_answers_for_retry():
    writer = MemoryWriter(fail=1)
    sim = make(writer)
    await fill(sim)
    await sim.click("form:send")
    assert writer.rows == []
    await sim.click("form:send")  # second press works
    assert len(writer.rows) == 1


async def test_cancel_and_restart():
    writer = MemoryWriter()
    sim = make(writer)
    await fill(sim)
    await sim.click("form:restart")
    assert sim.last(100).text == "Как вас зовут?"
    await sim.send("/cancel")
    assert "отменена" in sim.last(100).text
    await sim.click("form:send")  # stale button after cancel does nothing
    assert writer.rows == []
