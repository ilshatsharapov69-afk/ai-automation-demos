"""Optional Telegram front-end (aiogram 3). The answerer itself does not depend on Telegram."""
from __future__ import annotations

import asyncio
import html
import logging

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import CommandStart
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import Message

from .answerer import FaqAnswerer
from .kb import detect_lang

log = logging.getLogger(__name__)

HELLO = {
    "ru": "Здравствуйте! Я отвечаю на вопросы о {business}. Спросите, например: «Сколько стоит доставка?»",
    "en": "Hi! I answer questions about {business}. Try: “How much does delivery cost?”",
}


async def start(message: Message, answerer: FaqAnswerer) -> None:
    lang = "ru" if (message.from_user.language_code or "").startswith(("ru", "uk", "be", "kk")) else "en"
    await message.answer(HELLO[lang].format(business=html.escape(answerer.kb.business[lang])))


async def question(message: Message, bot: Bot, answerer: FaqAnswerer, admin_chat_id: int | None = None) -> None:
    await bot.send_chat_action(message.chat.id, "typing")
    # Providers are synchronous HTTP calls: run them off the event loop.
    result = await asyncio.to_thread(answerer.answer, message.text)
    await message.answer(html.escape(result.text))
    if result.handoff and admin_chat_id:
        who = html.escape(f"@{message.from_user.username}" if message.from_user.username else message.from_user.full_name)
        await bot.send_message(admin_chat_id,
                               f"❓ Вопрос без ответа от {who} (chat {message.chat.id}):\n{html.escape(message.text)}")


async def not_text(message: Message) -> None:
    lang = detect_lang(message.caption or "") if message.caption else "ru"
    await message.answer("Пока понимаю только текст 🙂" if lang == "ru" else "I only understand text for now 🙂")


def build_dispatcher(answerer: FaqAnswerer, *, admin_chat_id: int | None = None) -> Dispatcher:
    router = Router(name="faq")
    router.message.register(start, CommandStart())
    router.message.register(question, F.text)
    router.message.register(not_text)
    dp = Dispatcher(storage=MemoryStorage(), answerer=answerer, admin_chat_id=admin_chat_id)
    dp.include_router(router)
    return dp
