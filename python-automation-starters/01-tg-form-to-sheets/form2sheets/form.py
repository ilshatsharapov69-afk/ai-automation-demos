"""The questionnaire: which questions the bot asks and how answers are validated.

To adapt for a new client, edit FIELDS only. Every field becomes one column in the sheet.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Choice:
    value: str
    label: dict[str, str]  # {"ru": ..., "en": ...}


@dataclass(frozen=True)
class Field:
    key: str
    header: str  # column header in the sheet
    prompt: dict[str, str]
    kind: str = "text"  # text | phone | email | int | choice
    choices: tuple[Choice, ...] = ()
    optional: bool = False


FIELDS: tuple[Field, ...] = (
    Field(
        key="name",
        header="Имя / Name",
        prompt={"ru": "Как вас зовут?", "en": "What is your name?"},
    ),
    Field(
        key="phone",
        header="Телефон / Phone",
        prompt={"ru": "Ваш телефон для связи (например +7 999 123-45-67):",
                "en": "Your phone number (for example +44 20 7946 0958):"},
        kind="phone",
    ),
    Field(
        key="email",
        header="Email",
        prompt={"ru": "Email (или /skip, чтобы пропустить):", "en": "Email (or /skip):"},
        kind="email",
        optional=True,
    ),
    Field(
        key="service",
        header="Услуга / Service",
        prompt={"ru": "Что вас интересует?", "en": "What are you interested in?"},
        kind="choice",
        choices=(
            Choice("consult", {"ru": "Консультация", "en": "Consultation"}),
            Choice("project", {"ru": "Проект под ключ", "en": "Turnkey project"}),
            Choice("support", {"ru": "Поддержка", "en": "Support"}),
        ),
    ),
    Field(
        key="budget",
        header="Бюджет / Budget",
        prompt={"ru": "Примерный бюджет (числом, или /skip):", "en": "Approximate budget (a number, or /skip):"},
        kind="int",
        optional=True,
    ),
    Field(
        key="comment",
        header="Комментарий / Comment",
        prompt={"ru": "Комментарий (или /skip):", "en": "Any comment? (or /skip)"},
        optional=True,
    ),
)


class InvalidAnswer(ValueError):
    """Raised with a text key from texts.TEXTS describing what is wrong."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


def normalize_phone(raw: str) -> str:
    """'8 (999) 123-45-67' -> '+79991234567'; keeps other countries as +<digits>."""
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    elif len(digits) == 10 and digits.startswith("9"):
        digits = "7" + digits
    if not 10 <= len(digits) <= 15:
        raise InvalidAnswer("err_phone")
    return "+" + digits


def find_choice(field: Field, text: str) -> Choice | None:
    needle = text.strip().casefold()
    for choice in field.choices:
        if needle == choice.value.casefold() or needle in {v.casefold() for v in choice.label.values()}:
            return choice
    return None


def validate(field: Field, raw: str) -> str:
    """Return the cleaned value or raise InvalidAnswer."""
    text = (raw or "").strip()
    if not text:
        raise InvalidAnswer("err_empty")
    if len(text) > 1000:
        raise InvalidAnswer("err_too_long")
    if field.kind == "phone":
        return normalize_phone(text)
    if field.kind == "email":
        if not EMAIL_RE.match(text):
            raise InvalidAnswer("err_email")
        return text.lower()
    if field.kind == "int":
        digits = re.sub(r"[\s_.,]", "", text)
        if not digits.isdigit():
            raise InvalidAnswer("err_int")
        return str(int(digits))
    if field.kind == "choice":
        choice = find_choice(field, text)
        if choice is None:
            raise InvalidAnswer("err_choice")
        return choice.value
    return text


def display_value(field: Field, value: str, lang: str) -> str:
    if field.kind == "choice":
        for choice in field.choices:
            if choice.value == value:
                return choice.label[lang]
    return value


def sheet_headers() -> list[str]:
    return ["Дата / Date", "Telegram ID", "Username", "Lang", *[f.header for f in FIELDS]]


def sheet_row(answers: dict[str, str], *, created_at: str, user_id: int, username: str | None, lang: str) -> list[str]:
    values = [display_value(f, answers.get(f.key, ""), lang) if answers.get(f.key) else "" for f in FIELDS]
    return [created_at, str(user_id), f"@{username}" if username else "", lang, *values]
