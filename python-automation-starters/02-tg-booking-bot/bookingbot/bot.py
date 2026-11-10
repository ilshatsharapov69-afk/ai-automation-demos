"""aiogram 3 handlers. The whole booking flow lives in callback data, so a restart loses nothing."""
from __future__ import annotations

import html
import logging
from datetime import datetime
from typing import Callable

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.filters.callback_data import CallbackData
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, Message, User
from aiogram.utils.keyboard import InlineKeyboardBuilder

from . import catalog
from .db import Booking, Repo, SlotTaken
from .slots import free_starts, open_days
from .texts import fmt_day, fmt_when, lang_of, t

log = logging.getLogger(__name__)
Clock = Callable[[], datetime]


class Menu(CallbackData, prefix="m"):
    action: str  # home | book | my


class Pick(CallbackData, prefix="p"):
    svc: str
    day: str = ""  # YYYYMMDD
    hm: str = ""   # HHMM


class BookIt(CallbackData, prefix="b"):
    svc: str
    day: str
    hm: str


class CancelIt(CallbackData, prefix="c"):
    id: int


class AdminAct(CallbackData, prefix="a"):
    action: str  # ok | no
    id: int


# --- keyboards -------------------------------------------------------------

def home_kb(lang: str) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=t("btn_book", lang), callback_data=Menu(action="book"))
    kb.button(text=t("btn_my", lang), callback_data=Menu(action="my"))
    kb.adjust(1)
    return kb.as_markup()


def services_kb(lang: str) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for s in catalog.SERVICES:
        price = f" · {s.price} {catalog.CURRENCY}" if s.price else ""
        kb.button(text=f"{s.name[lang]} ({s.minutes} мин){price}" if lang == "ru" else f"{s.name[lang]} ({s.minutes} min){price}",
                  callback_data=Pick(svc=s.id))
    kb.button(text=t("btn_back", lang), callback_data=Menu(action="home"))
    kb.adjust(1)
    return kb.as_markup()


def days_kb(svc: str, now: datetime, lang: str) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    days = open_days(now.date())
    for d in days:
        kb.button(text=fmt_day(d, lang), callback_data=Pick(svc=svc, day=f"{d:%Y%m%d}"))
    kb.button(text=t("btn_back", lang), callback_data=Menu(action="book"))
    kb.adjust(*([3] * (len(days) // 3)), len(days) % 3 or 3, 1)
    return kb.as_markup()


def times_kb(svc: str, day: str, starts: list[datetime], lang: str) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for s in starts:
        kb.button(text=f"{s:%H:%M}", callback_data=Pick(svc=svc, day=day, hm=f"{s:%H%M}"))
    kb.button(text=t("btn_back", lang), callback_data=Pick(svc=svc))
    kb.adjust(*([4] * (len(starts) // 4)), len(starts) % 4 or 4, 1)
    return kb.as_markup()


def admin_kb(booking_id: int) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=t("admin_ok", "ru"), callback_data=AdminAct(action="ok", id=booking_id))
    kb.button(text=t("admin_no", "ru"), callback_data=AdminAct(action="no", id=booking_id))
    return kb.as_markup()


# --- helpers ---------------------------------------------------------------

def user_lang(user: User | None) -> str:
    return lang_of(user.language_code if user else None)


def describe(b: Booking, lang: str) -> tuple[str, str]:
    service = catalog.service_by_id(b.service_id)
    return (service.name[lang] if service else b.service_id), fmt_when(b.starts_at, lang)


def client_label(b: Booking) -> str:
    who = f"@{b.username}" if b.username else (b.full_name or "—")
    return f'{html.escape(who)} (<a href="tg://user?id={b.user_id}">id {b.user_id}</a>)'


def parse_day(day: str) -> datetime:
    return datetime.strptime(day, "%Y%m%d")


# --- client handlers ------------------------------------------------------

async def start(message: Message) -> None:
    lang = user_lang(message.from_user)
    await message.answer(t("hello", lang), reply_markup=home_kb(lang))


async def menu(callback: CallbackQuery, callback_data: Menu, repo: Repo, clock: Clock) -> None:
    lang = user_lang(callback.from_user)
    await callback.answer()
    if callback_data.action == "home":
        await callback.message.edit_text(t("hello", lang), reply_markup=home_kb(lang))
    elif callback_data.action == "book":
        await callback.message.edit_text(t("pick_service", lang), reply_markup=services_kb(lang))
    elif callback_data.action == "my":
        await show_my(callback.message, callback.from_user.id, lang, repo, clock, edit=True)


async def my_command(message: Message, repo: Repo, clock: Clock) -> None:
    await show_my(message, message.from_user.id, user_lang(message.from_user), repo, clock, edit=False)


async def show_my(message: Message, user_id: int, lang: str, repo: Repo, clock: Clock, *, edit: bool) -> None:
    bookings = repo.upcoming_for_user(user_id, clock())
    kb = InlineKeyboardBuilder()
    if not bookings:
        text = t("my_empty", lang)
    else:
        lines = [t("my_title", lang)]
        for b in bookings:
            service, when = describe(b, lang)
            lines.append(f"№{b.id} · {service} · {when} · {t('status_' + b.status, lang)}")
            kb.button(text=f"{t('btn_cancel_booking', lang)} №{b.id}", callback_data=CancelIt(id=b.id))
        text = "\n".join(lines)
    kb.button(text=t("btn_back", lang), callback_data=Menu(action="home"))
    kb.adjust(1)
    if edit:
        await message.edit_text(text, reply_markup=kb.as_markup())
    else:
        await message.answer(text, reply_markup=kb.as_markup())


async def pick(callback: CallbackQuery, callback_data: Pick, repo: Repo, clock: Clock) -> None:
    lang = user_lang(callback.from_user)
    service = catalog.service_by_id(callback_data.svc)
    if service is None:
        await callback.answer()
        return
    now = clock()
    if not callback_data.day:  # step 2: choose a day
        await callback.answer()
        await callback.message.edit_text(t("pick_day", lang), reply_markup=days_kb(service.id, now, lang))
        return
    day = parse_day(callback_data.day).date()
    if not callback_data.hm:  # step 3: choose a time
        starts = free_starts(day, service.minutes, repo.busy(day), now)
        if not starts:
            await callback.answer(t("no_time", lang), show_alert=True)
            return
        await callback.answer()
        await callback.message.edit_text(t("pick_time", lang, day=fmt_day(day, lang)),
                                         reply_markup=times_kb(service.id, callback_data.day, starts, lang))
        return
    # step 4: confirm
    await callback.answer()
    start = datetime.strptime(callback_data.day + callback_data.hm, "%Y%m%d%H%M")
    kb = InlineKeyboardBuilder()
    kb.button(text=t("btn_confirm", lang), callback_data=BookIt(svc=service.id, day=callback_data.day, hm=callback_data.hm))
    kb.button(text=t("btn_back", lang), callback_data=Pick(svc=service.id, day=callback_data.day))
    kb.adjust(1)
    await callback.message.edit_text(t("check", lang, service=service.name[lang], when=fmt_when(start, lang)),
                                     reply_markup=kb.as_markup())


async def book(callback: CallbackQuery, callback_data: BookIt, bot: Bot, repo: Repo, clock: Clock,
               admin_ids: tuple[int, ...]) -> None:
    lang = user_lang(callback.from_user)
    service = catalog.service_by_id(callback_data.svc)
    start = datetime.strptime(callback_data.day + callback_data.hm, "%Y%m%d%H%M")
    now = clock()
    # Re-check against the rules: buttons can be old, or crafted.
    day = start.date()
    if service is None or day not in open_days(now.date()) or start not in free_starts(day, service.minutes, [], now):
        await callback.answer(t("taken", lang), show_alert=True)
        return
    user = callback.from_user
    try:
        booking = repo.create(user_id=user.id, username=user.username, full_name=user.full_name, lang=lang,
                              service_id=service.id, starts_at=start, minutes=service.minutes, now=now)
    except SlotTaken:
        await callback.answer(t("taken", lang), show_alert=True)
        starts = free_starts(day, service.minutes, repo.busy(day), now)
        await callback.message.edit_text(t("pick_time", lang, day=fmt_day(day, lang)),
                                         reply_markup=times_kb(service.id, callback_data.day, starts, lang))
        return
    await callback.answer()
    await callback.message.edit_text(t("booked", lang, id=booking.id), reply_markup=home_kb(lang))
    service_ru, when_ru = describe(booking, "ru")
    for admin_id in admin_ids:
        try:
            await bot.send_message(admin_id, t("admin_new", "ru", id=booking.id, service=service_ru, when=when_ru,
                                               client=client_label(booking)), reply_markup=admin_kb(booking.id))
        except Exception:  # one blocked admin must not break the booking
            log.exception("Could not notify admin %s", admin_id)


async def cancel_booking(callback: CallbackQuery, callback_data: CancelIt, bot: Bot, repo: Repo, clock: Clock,
                         admin_ids: tuple[int, ...]) -> None:
    lang = user_lang(callback.from_user)
    booking = repo.set_status(callback_data.id, "cancelled", user_id=callback.from_user.id)
    if booking is None:
        await callback.answer(t("not_found", lang), show_alert=True)
        return
    await callback.answer(t("cancelled", lang, id=booking.id))
    await show_my(callback.message, callback.from_user.id, lang, repo, clock, edit=True)
    for admin_id in admin_ids:
        try:
            await bot.send_message(admin_id, t("admin_client_cancelled", "ru", id=booking.id,
                                               when=fmt_when(booking.starts_at, "ru")))
        except Exception:
            log.exception("Could not notify admin %s", admin_id)


# --- admin handlers --------------------------------------------------------

async def admin_action(callback: CallbackQuery, callback_data: AdminAct, bot: Bot, repo: Repo) -> None:
    status = "confirmed" if callback_data.action == "ok" else "declined"
    booking = repo.set_status(callback_data.id, status, only_from=("new",))
    if booking is None:
        await callback.answer(t("not_found", "ru"), show_alert=True)
        return
    await callback.answer()
    await callback.message.edit_text(
        t("admin_done", "ru", text=html.escape(callback.message.text or ""), status=t("status_" + status, "ru")),
        reply_markup=None)
    service, when = describe(booking, booking.lang)
    key = "client_confirmed" if status == "confirmed" else "client_declined"
    try:
        await bot.send_message(booking.user_id, t(key, booking.lang, id=booking.id, service=service, when=when))
    except Exception:
        log.exception("Could not notify client %s", booking.user_id)


async def today(message: Message, repo: Repo, clock: Clock) -> None:
    day = clock().date()
    bookings = repo.for_day(day)
    if not bookings:
        await message.answer(t("admin_today_empty", "ru", day=fmt_day(day, "ru")))
        return
    lines = [t("admin_today", "ru", day=fmt_day(day, "ru"))]
    for b in bookings:
        service, _ = describe(b, "ru")
        lines.append(f"{b.starts_at:%H:%M}–{b.ends_at:%H:%M} · {service} · {client_label(b)} · {t('status_' + b.status, 'ru')}")
    await message.answer("\n".join(lines))


async def stale(callback: CallbackQuery) -> None:
    await callback.answer()


def make_router(admin_ids: tuple[int, ...]) -> Router:
    router = Router(name="booking")
    is_admin = F.from_user.id.in_(set(admin_ids))
    router.message.register(start, CommandStart())
    router.message.register(my_command, Command("my"))
    router.message.register(today, Command("today"), is_admin)
    router.callback_query.register(menu, Menu.filter())
    router.callback_query.register(pick, Pick.filter())
    router.callback_query.register(book, BookIt.filter())
    router.callback_query.register(cancel_booking, CancelIt.filter())
    router.callback_query.register(admin_action, AdminAct.filter(), is_admin)
    router.callback_query.register(stale)
    return router


def build_dispatcher(repo: Repo, *, admin_ids: tuple[int, ...] = (), clock: Clock = datetime.now) -> Dispatcher:
    dp = Dispatcher(storage=MemoryStorage(), repo=repo, admin_ids=tuple(admin_ids), clock=clock)
    dp.include_router(make_router(tuple(admin_ids)))
    return dp
