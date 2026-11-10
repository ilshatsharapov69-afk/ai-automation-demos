"""User-facing strings, RU and EN."""
from __future__ import annotations

from datetime import date, datetime

TEXTS: dict[str, dict[str, str]] = {
    "hello": {"ru": "Здравствуйте! Я помогу записаться. Выберите действие:",
              "en": "Hello! I can book you in. What would you like to do?"},
    "btn_book": {"ru": "📅 Записаться", "en": "📅 Book"},
    "btn_my": {"ru": "🗂 Мои записи", "en": "🗂 My bookings"},
    "btn_back": {"ru": "← Назад", "en": "← Back"},
    "btn_confirm": {"ru": "✅ Подтвердить", "en": "✅ Confirm"},
    "btn_cancel_booking": {"ru": "Отменить", "en": "Cancel"},
    "pick_service": {"ru": "Выберите услугу:", "en": "Choose a service:"},
    "pick_day": {"ru": "Выберите день:", "en": "Choose a day:"},
    "pick_time": {"ru": "Свободное время на {day}:", "en": "Free times on {day}:"},
    "no_time": {"ru": "На этот день свободного времени нет, выберите другой.", "en": "No free time that day, please pick another."},
    "check": {"ru": "Проверьте запись:\n{service}\n{when}\n\nПодтвердить?", "en": "Please check:\n{service}\n{when}\n\nConfirm?"},
    "booked": {"ru": "Готово! Заявка №{id} отправлена администратору, придёт подтверждение.",
               "en": "Done! Request #{id} was sent to the admin; you will get a confirmation."},
    "taken": {"ru": "Это время только что заняли, выберите другое.", "en": "Someone has just taken that time, please choose another."},
    "my_empty": {"ru": "У вас нет предстоящих записей.", "en": "You have no upcoming bookings."},
    "my_title": {"ru": "Ваши записи:", "en": "Your bookings:"},
    "cancelled": {"ru": "Запись №{id} отменена.", "en": "Booking #{id} is cancelled."},
    "not_found": {"ru": "Запись не найдена или уже изменена.", "en": "Booking not found or already changed."},
    "client_confirmed": {"ru": "✅ Запись №{id} подтверждена: {service}, {when}. Ждём вас!",
                         "en": "✅ Booking #{id} is confirmed: {service}, {when}. See you!"},
    "client_declined": {"ru": "❌ К сожалению, запись №{id} ({when}) отклонена. Выберите другое время: /start",
                        "en": "❌ Sorry, booking #{id} ({when}) was declined. Please choose another time: /start"},
    "admin_new": {"ru": "🆕 Запись №{id}\n{service}\n{when}\nКлиент: {client}", "en": "🆕 Booking #{id}\n{service}\n{when}\nClient: {client}"},
    "admin_ok": {"ru": "✅ Подтвердить", "en": "✅ Confirm"},
    "admin_no": {"ru": "❌ Отклонить", "en": "❌ Decline"},
    "admin_done": {"ru": "{text}\n\nСтатус: {status}", "en": "{text}\n\nStatus: {status}"},
    "admin_client_cancelled": {"ru": "↩️ Клиент отменил запись №{id} ({when}).", "en": "↩️ Client cancelled booking #{id} ({when})."},
    "admin_today_empty": {"ru": "На {day} записей нет.", "en": "No bookings on {day}."},
    "admin_today": {"ru": "Записи на {day}:", "en": "Bookings on {day}:"},
    "status_new": {"ru": "ожидает", "en": "pending"},
    "status_confirmed": {"ru": "подтверждена", "en": "confirmed"},
    "status_declined": {"ru": "отклонена", "en": "declined"},
    "status_cancelled": {"ru": "отменена", "en": "cancelled"},
}

WEEKDAYS = {
    "ru": ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    "en": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
}


def t(key: str, lang: str, **kw) -> str:
    template = TEXTS[key].get(lang) or TEXTS[key]["en"]
    return template.format(**kw) if kw else template


def lang_of(language_code: str | None) -> str:
    return "ru" if (language_code or "").split("-")[0] in {"ru", "uk", "be", "kk"} else "en"


def fmt_day(d: date, lang: str) -> str:
    return f"{WEEKDAYS[lang][d.weekday()]} {d:%d.%m}"


def fmt_when(dt: datetime, lang: str) -> str:
    return f"{fmt_day(dt.date(), lang)} {dt:%H:%M}"
