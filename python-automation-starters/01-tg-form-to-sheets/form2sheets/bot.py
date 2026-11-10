"""aiogram 3 handlers: a generic step-by-step form driven by form.FIELDS."""
from __future__ import annotations

import html
import logging
from datetime import datetime
from typing import Callable

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from .form import FIELDS, Field, InvalidAnswer, display_value, find_choice, sheet_row, validate
from .sheets import SheetWriter
from .texts import lang_of, t

log = logging.getLogger(__name__)


class Form(StatesGroup):
    filling = State()
    confirm = State()


def choice_keyboard(field: Field, lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=c.label[lang], callback_data=f"pick:{c.value}")] for c in field.choices
    ])


def confirm_keyboard(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=t("btn_confirm", lang), callback_data="form:send"),
        InlineKeyboardButton(text=t("btn_restart", lang), callback_data="form:restart"),
    ]])


def summary(answers: dict[str, str], lang: str) -> str:
    lines = [f"<b>{t('summary', lang)}</b>"]
    for f in FIELDS:
        value = answers.get(f.key)
        if value:
            lines.append(f"{html.escape(f.header)}: {html.escape(display_value(f, value, lang))}")
    return "\n".join(lines)


async def ask(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    step, lang = data["step"], data["lang"]
    if step >= len(FIELDS):
        await state.set_state(Form.confirm)
        await message.answer(summary(data["answers"], lang), reply_markup=confirm_keyboard(lang))
        return
    field = FIELDS[step]
    markup = choice_keyboard(field, lang) if field.kind == "choice" else None
    await message.answer(field.prompt[lang], reply_markup=markup)


async def store_and_next(message: Message, state: FSMContext, value: str) -> None:
    data = await state.get_data()
    answers = dict(data["answers"])
    answers[FIELDS[data["step"]].key] = value
    await state.update_data(answers=answers, step=data["step"] + 1)
    await ask(message, state)


async def start(message: Message, state: FSMContext) -> None:
    lang = lang_of(message.from_user.language_code if message.from_user else None)
    await state.clear()
    await state.set_state(Form.filling)
    await state.update_data(lang=lang, step=0, answers={})
    await message.answer(t("hello", lang))
    await ask(message, state)


async def cancel(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    await state.clear()
    await message.answer(t("cancelled", data.get("lang") or lang_of(message.from_user.language_code)))


async def skip(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    field = FIELDS[data["step"]]
    if not field.optional:
        await message.answer(t("not_skippable", data["lang"]))
        return
    await store_and_next(message, state, "")


async def answer(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    field, lang = FIELDS[data["step"]], data["lang"]
    try:
        value = validate(field, message.text)
    except InvalidAnswer as exc:
        markup = choice_keyboard(field, lang) if field.kind == "choice" else None
        await message.answer(t(exc.code, lang), reply_markup=markup)
        return
    await store_and_next(message, state, value)


async def pick(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    field = FIELDS[data["step"]]
    choice = find_choice(field, callback.data.removeprefix("pick:")) if field.kind == "choice" else None
    await callback.answer()
    if choice is None:  # stale button from an earlier question
        return
    await callback.message.edit_reply_markup(reply_markup=None)
    await store_and_next(callback.message, state, choice.value)


async def confirm_hint(message: Message, state: FSMContext) -> None:
    await message.answer(t("use_buttons", (await state.get_data())["lang"]))


async def restart(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.set_state(Form.filling)
    await state.update_data(step=0, answers={})
    await ask(callback.message, state)


async def send(callback: CallbackQuery, state: FSMContext, bot: Bot, writer: SheetWriter,
               clock: Callable[[], datetime], admin_chat_id: int | None = None) -> None:
    data = await state.get_data()
    lang, answers = data["lang"], data["answers"]
    user = callback.from_user
    row = sheet_row(answers, created_at=clock().strftime("%Y-%m-%d %H:%M:%S"),
                    user_id=user.id, username=user.username, lang=lang)
    try:
        await writer.append(row)
    except Exception:  # keep the answers, let the user press again
        log.exception("Saving the form failed")
        await callback.answer(t("save_failed", lang), show_alert=True)
        return
    await callback.answer()
    await state.clear()
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.message.answer(t("saved", lang))
    if admin_chat_id:
        who = html.escape(f"@{user.username}" if user.username else user.full_name)
        await bot.send_message(admin_chat_id, f"{t('admin_new', 'ru')} — {who}\n{summary(answers, 'ru')}")


async def stale_button(callback: CallbackQuery) -> None:
    """Buttons from a finished or cancelled form: just stop the loading spinner."""
    await callback.answer()


def make_router() -> Router:
    """A fresh router per dispatcher (aiogram routers can be attached only once)."""
    router = Router(name="form")
    router.message.register(start, CommandStart())
    router.message.register(cancel, Command("cancel"))
    router.message.register(skip, Form.filling, Command("skip"))
    router.message.register(answer, Form.filling, F.text)
    router.callback_query.register(pick, Form.filling, F.data.startswith("pick:"))
    router.message.register(confirm_hint, Form.confirm)
    router.callback_query.register(restart, Form.confirm, F.data == "form:restart")
    router.callback_query.register(send, Form.confirm, F.data == "form:send")
    router.callback_query.register(stale_button)
    return router


def build_dispatcher(writer: SheetWriter, *, admin_chat_id: int | None = None,
                     clock: Callable[[], datetime] = datetime.now) -> Dispatcher:
    dp = Dispatcher(storage=MemoryStorage(), writer=writer, admin_chat_id=admin_chat_id, clock=clock)
    dp.include_router(make_router())
    return dp
