"""Turn whatever a site/form/landing sends into one normalised Lead."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Mapping

# Field name aliases seen in Tilda, Taplink, WordPress (CF7), Webflow, Google Forms scripts, Marquiz…
ALIASES: dict[str, tuple[str, ...]] = {
    "name": ("name", "Name", "fio", "FIO", "full_name", "fullname", "client_name", "имя", "Имя", "your-name"),
    "phone": ("phone", "Phone", "tel", "telephone", "phone_number", "телефон", "Телефон", "your-phone"),
    "email": ("email", "Email", "e-mail", "E-mail", "mail", "your-email"),
    "comment": ("comment", "Comment", "message", "Message", "text", "question", "комментарий", "Комментарий", "your-message"),
    "form": ("formname", "form_name", "formid", "form", "form_id"),
    "page": ("page", "page_url", "referer", "url"),
    "external_id": ("tranid", "lead_id", "id", "submission_id"),
}
UTM_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")
SERVICE_KEYS = {"test", "COOKIES", "tranid", "formid", "formname"}


class LeadError(ValueError):
    pass


@dataclass
class Lead:
    name: str = ""
    phone: str = ""
    email: str = ""
    comment: str = ""
    source: str = "site"
    form: str = ""
    page: str = ""
    external_id: str = ""
    utm: dict[str, str] = field(default_factory=dict)
    extra: dict[str, str] = field(default_factory=dict)  # unknown fields, kept for the note

    @property
    def title(self) -> str:
        who = self.name or self.phone or self.email
        return f"Заявка с сайта: {who}" + (f" ({self.form})" if self.form else "")

    def dedup_key(self) -> str:
        """Same person + same form + same external id = same lead (webhook retries, double clicks)."""
        raw = "|".join([self.source, self.form, self.external_id, self.phone, self.email.lower(), self.comment])
        return hashlib.sha256(raw.encode()).hexdigest()

    def note(self) -> str:
        lines = []
        if self.comment:
            lines.append(f"Комментарий: {self.comment}")
        if self.form:
            lines.append(f"Форма: {self.form}")
        if self.page:
            lines.append(f"Страница: {self.page}")
        lines += [f"{k}: {v}" for k, v in self.utm.items()]
        lines += [f"{k}: {v}" for k, v in self.extra.items()]
        return "\n".join(lines)


def normalize_phone(raw: str) -> str:
    """'8 (999) 123-45-67' -> '+79991234567'. Returns '' for junk."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    elif len(digits) == 10 and digits.startswith("9"):
        digits = "7" + digits
    return "+" + digits if 10 <= len(digits) <= 15 else ""


def _first(data: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return ""


def is_tilda_test(data: Mapping[str, Any]) -> bool:
    """Tilda checks a new webhook URL by POSTing test=test."""
    return data.get("test") == "test" and len(data) <= 2


def parse_lead(data: Mapping[str, Any], source: str = "site") -> Lead:
    """Map a flat dict (form fields or JSON) to a Lead. Raises LeadError if there is no way to contact the person."""
    flat = {str(k): v for k, v in data.items() if not isinstance(v, (dict, list))}
    known = {alias for aliases in ALIASES.values() for alias in aliases} | set(UTM_KEYS) | SERVICE_KEYS
    raw_phone = _first(flat, ALIASES["phone"])
    email = _first(flat, ALIASES["email"]).lower()
    lead = Lead(
        name=_first(flat, ALIASES["name"])[:200],
        phone=normalize_phone(raw_phone),
        email=email if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) else "",
        comment=_first(flat, ALIASES["comment"])[:4000],
        source=source,
        form=_first(flat, ALIASES["form"]),
        page=_first(flat, ALIASES["page"]),
        external_id=_first(flat, ALIASES["external_id"]),
        utm={k: str(flat[k]) for k in UTM_KEYS if flat.get(k)},
        extra={k: str(v)[:500] for k, v in flat.items() if k not in known and v not in (None, "")},
    )
    if raw_phone and not lead.phone:
        lead.extra["phone_raw"] = raw_phone
    if not lead.phone and not lead.email:
        raise LeadError("phone or email is required")
    return lead
