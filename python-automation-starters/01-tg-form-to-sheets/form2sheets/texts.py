"""All user-facing strings, RU and EN."""

TEXTS: dict[str, dict[str, str]] = {
    "hello": {
        "ru": "Здравствуйте! Заполните короткую анкету, менеджер свяжется с вами. /cancel — отменить.",
        "en": "Hi! Please fill in a short form and a manager will contact you. /cancel to stop.",
    },
    "summary": {"ru": "Проверьте данные:", "en": "Please check your answers:"},
    "btn_confirm": {"ru": "✅ Отправить", "en": "✅ Send"},
    "btn_restart": {"ru": "↩️ Заново", "en": "↩️ Start over"},
    "saved": {"ru": "Спасибо! Заявка принята, скоро свяжемся.", "en": "Thank you! Your request is saved, we will be in touch soon."},
    "save_failed": {
        "ru": "Не получилось сохранить заявку, попробуйте нажать «Отправить» ещё раз через минуту.",
        "en": "Could not save your request, please press “Send” again in a minute.",
    },
    "cancelled": {"ru": "Анкета отменена. /start — начать заново.", "en": "Form cancelled. /start to begin again."},
    "not_skippable": {"ru": "Этот вопрос обязательный.", "en": "This question is required."},
    "use_buttons": {"ru": "Нажмите кнопку ниже 👇", "en": "Please tap a button below 👇"},
    "admin_new": {"ru": "🆕 Новая заявка", "en": "🆕 New request"},
    "err_empty": {"ru": "Пустой ответ, попробуйте ещё раз.", "en": "Empty answer, please try again."},
    "err_too_long": {"ru": "Слишком длинный ответ (до 1000 символов).", "en": "Too long (1000 characters max)."},
    "err_phone": {"ru": "Не похоже на телефон. Пример: +7 999 123-45-67", "en": "That does not look like a phone number. Example: +44 20 7946 0958"},
    "err_email": {"ru": "Не похоже на email. Пример: name@example.com", "en": "That does not look like an email. Example: name@example.com"},
    "err_int": {"ru": "Нужно число, например 50000.", "en": "Please send a number, for example 5000."},
    "err_choice": {"ru": "Выберите вариант кнопкой.", "en": "Please pick an option with a button."},
}


def t(key: str, lang: str) -> str:
    return TEXTS[key].get(lang) or TEXTS[key]["en"]


def lang_of(language_code: str | None) -> str:
    return "ru" if (language_code or "").split("-")[0] in {"ru", "uk", "be", "kk"} else "en"
