"""Offline provider: returns the best-matching FAQ answer verbatim. Free, instant, deterministic."""
from __future__ import annotations

from typing import Sequence

from ..kb import Entry


class StubProvider:
    name = "stub"

    def answer(self, question: str, lang: str, context: Sequence[Entry], business: str) -> str:
        best = context[0]
        return best.a.get(lang) or next(iter(best.a.values()))
