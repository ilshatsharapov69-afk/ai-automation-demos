from pathlib import Path

from faqbot.answerer import FaqAnswerer
from faqbot.kb import KnowledgeBase
from faqbot.providers import StubProvider
from faqbot.telegram import build_dispatcher
from tests.fakebot import TgSim

KB = KnowledgeBase.load(Path(__file__).parent.parent / "faq.json")
ADMIN = 555


def make():
    return TgSim(build_dispatcher(FaqAnswerer(KB, StubProvider()), admin_chat_id=ADMIN))


async def test_start_and_answer():
    sim = make()
    await sim.send("/start")
    assert "Тёплый хлеб" in sim.last(100).text
    await sim.send("Сколько стоит доставка?")
    assert sim.last(100).text == "Доставка 199 ₽, бесплатно при заказе от 1500 ₽."
    assert sim.messages(ADMIN) == []


async def test_unknown_question_goes_to_admin():
    sim = make()
    await sim.send("есть ли парковка <рядом>?", username="ann")
    assert "передал вопрос менеджеру" in sim.last(100).text
    admin = sim.last(ADMIN).text
    assert "@ann" in admin and "парковка &lt;рядом&gt;" in admin  # escaped for HTML parse mode


async def test_english_user():
    sim = make()
    await sim.send("/start", lang="en")
    assert sim.last(100).text.startswith("Hi!")
    await sim.send("can I pay with cash", lang="en")
    assert "cash to the courier" in sim.last(100).text
