"""Site descriptions. A new site is usually one SiteConfig: CSS selectors plus small cleaners."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class SiteConfig:
    name: str
    start_url: str
    item: str                       # CSS selector of one card/row
    fields: dict[str, str]          # column -> "css", "css@attr" or "@attr" (attribute of the card itself)
    next_page: str | None = None    # CSS selector of the "next" link …
    page_url: str | None = None     # … or a template like "https://site/list?page={page}"
    absolute: tuple[str, ...] = ("url",)   # columns to turn into absolute URLs
    key: str = "url"                # column used to drop duplicates
    clean: dict[str, Callable[[str], Any]] = field(default_factory=dict)


def money(text: str) -> float | None:
    """'£51.77' / '1 299,00 ₽' / '$1,299.00' -> float."""
    s = re.sub(r"[^\d,.]", "", text or "")
    if not s:
        return None
    if "," in s and "." in s:
        s = s.replace(",", "") if s.rfind(".") > s.rfind(",") else s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".") if len(s.rsplit(",", 1)[1]) <= 2 else s.replace(",", "")
    return float(s)


WORD_NUMBERS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}


def star_rating(class_attr: str) -> int | None:
    return next((WORD_NUMBERS[w.lower()] for w in (class_attr or "").split() if w.lower() in WORD_NUMBERS), None)


# books.toscrape.com is a public sandbox built for scraping practice: safe to demo against.
BOOKS = SiteConfig(
    name="books",
    start_url="https://books.toscrape.com/catalogue/page-1.html",
    item="article.product_pod",
    fields={
        "title": "h3 a@title",
        "price": "p.price_color",
        "in_stock": "p.availability",
        "rating": "p.star-rating@class",
        "url": "h3 a@href",
    },
    next_page="li.next a@href",
    clean={
        "price": money,
        "in_stock": lambda s: "in stock" in s.lower(),
        "rating": star_rating,
    },
)

SITES: dict[str, SiteConfig] = {BOOKS.name: BOOKS}
