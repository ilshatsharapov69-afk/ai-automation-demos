"""Offline Telegram: a recording session plus helpers that feed fake updates into a Dispatcher.

No network, no token. Every Bot API call is stored in `sim.session.requests`.
"""
from __future__ import annotations

import itertools
from datetime import datetime, timezone

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.base import BaseSession
from aiogram.enums import ParseMode
from aiogram.methods import EditMessageReplyMarkup, EditMessageText, SendMessage
from aiogram.types import CallbackQuery, Chat, Message, Update, User


class RecordingSession(BaseSession):
    def __init__(self) -> None:
        super().__init__()
        self.requests: list = []
        self._ids = itertools.count(1000)

    async def make_request(self, bot, method, timeout=None):
        self.requests.append(method)
        if isinstance(method, SendMessage):
            return Message(
                message_id=next(self._ids),
                date=datetime.now(timezone.utc),
                chat=Chat(id=method.chat_id, type="private"),
                text=method.text,
                reply_markup=method.reply_markup,
            )
        return True

    async def stream_content(self, *args, **kwargs):  # pragma: no cover - not used
        raise NotImplementedError
        yield b""

    async def close(self) -> None:
        pass


class TgSim:
    """One fake private chat per user id."""

    def __init__(self, dp: Dispatcher):
        self.dp = dp
        self.session = RecordingSession()
        self.bot = Bot("42:TEST", session=self.session, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        self._update_ids = itertools.count(1)
        self._msg_ids = itertools.count(1)

    def user(self, user_id: int, lang: str = "ru", username: str | None = "client") -> User:
        return User(id=user_id, is_bot=False, first_name="Test", username=username, language_code=lang)

    async def send(self, text: str, user_id: int = 100, lang: str = "ru", username: str | None = "client") -> None:
        msg = Message(
            message_id=next(self._msg_ids),
            date=datetime.now(timezone.utc),
            chat=Chat(id=user_id, type="private"),
            from_user=self.user(user_id, lang, username),
            text=text,
        )
        await self.dp.feed_update(self.bot, Update(update_id=next(self._update_ids), message=msg))

    async def click(self, data: str, user_id: int = 100, lang: str = "ru", username: str | None = "client",
                    message_text: str = "(bot message)") -> None:
        """Tap an inline button; `message_text` is the text of the bot message the button belongs to."""
        msg = Message(
            message_id=next(self._msg_ids),
            date=datetime.now(timezone.utc),
            chat=Chat(id=user_id, type="private"),
            from_user=User(id=42, is_bot=True, first_name="Bot"),
            text=message_text,
        )
        cb = CallbackQuery(id=str(next(self._update_ids)), from_user=self.user(user_id, lang, username),
                           chat_instance="x", message=msg, data=data)
        await self.dp.feed_update(self.bot, Update(update_id=next(self._update_ids), callback_query=cb))

    # --- inspection helpers -------------------------------------------------
    def messages(self, chat_id: int | None = None) -> list:
        return [r for r in self.session.requests
                if isinstance(r, (SendMessage, EditMessageText)) and (chat_id is None or r.chat_id == chat_id)]

    def texts(self, chat_id: int | None = None) -> list[str]:
        return [m.text for m in self.messages(chat_id)]

    def last(self, chat_id: int | None = None):
        return self.messages(chat_id)[-1]

    def buttons(self, chat_id: int | None = None) -> list[tuple[str, str]]:
        """(text, callback_data) of the inline keyboard on the last message."""
        markup = self.last(chat_id).reply_markup
        if markup is None:
            return []
        return [(b.text, b.callback_data) for row in markup.inline_keyboard for b in row]

    def calls(self, method_type) -> list:
        return [r for r in self.session.requests if isinstance(r, method_type)]


__all__ = ["TgSim", "RecordingSession", "EditMessageReplyMarkup"]
