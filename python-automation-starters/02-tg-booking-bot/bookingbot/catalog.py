"""What can be booked and when. Edit this file to adapt the bot to a new business."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import time


@dataclass(frozen=True)
class Service:
    id: str
    name: dict[str, str]
    minutes: int
    price: int  # in the business currency, shown as is


SERVICES: tuple[Service, ...] = (
    Service("cut", {"ru": "Стрижка", "en": "Haircut"}, 60, 1500),
    Service("color", {"ru": "Окрашивание", "en": "Colouring"}, 120, 4000),
    Service("consult", {"ru": "Консультация", "en": "Consultation"}, 30, 0),
)

OPEN_AT = time(10, 0)
CLOSE_AT = time(19, 0)
SLOT_STEP_MIN = 30          # a slot may start every 30 minutes
DAYS_AHEAD = 7              # how many days the calendar shows
DAYS_OFF = {6}              # weekday numbers closed (Mon=0 … Sun=6)
MIN_LEAD_MIN = 60           # earliest booking: now + 1 hour
CURRENCY = "₽"


def service_by_id(service_id: str) -> Service | None:
    return next((s for s in SERVICES if s.id == service_id), None)
