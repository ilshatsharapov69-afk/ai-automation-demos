"""Question → retrieve FAQ entries → (confident?) → provider → answer or hand-off to a human."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from .kb import Index, KnowledgeBase, detect_lang
from .providers.base import HANDOFF, Provider, ProviderError

log = logging.getLogger(__name__)


@dataclass
class Answer:
    text: str
    lang: str
    handoff: bool
    sources: list[str] = field(default_factory=list)
    provider: str = ""
    confidence: float = 0.0


class FaqAnswerer:
    def __init__(self, kb: KnowledgeBase, provider: Provider, *, top_k: int = 3, min_confidence: float | None = None,
                 max_question_chars: int = 1000):
        """min_confidence: below it we hand off without calling the provider. Default is stricter for the stub
        (it repeats the FAQ text blindly) than for an LLM (which can still say HANDOFF itself)."""
        self.kb = kb
        self.index = Index(kb.entries)
        self.provider = provider
        self.top_k = top_k
        self.min_confidence = min_confidence if min_confidence is not None else (0.55 if provider.name == "stub" else 0.35)
        self.max_question_chars = max_question_chars

    def _handoff(self, lang: str, confidence: float = 0.0, provider: str = "") -> Answer:
        return Answer(self.kb.handoff[lang], lang, True, provider=provider, confidence=confidence)

    def answer(self, question: str) -> Answer:
        question = (question or "").strip()[: self.max_question_chars]
        lang = detect_lang(question)
        hits = self.index.search(question, self.top_k)
        # Not confident → no model call at all: cheaper and no room for a made-up answer.
        if not hits or hits[0].confidence < self.min_confidence:
            return self._handoff(lang, hits[0].confidence if hits else 0.0)
        context = [h.entry for h in hits]
        provider_name = self.provider.name
        try:
            text = self.provider.answer(question, lang, context, self.kb.business[lang])
        except ProviderError as exc:
            # The model is down: the matched FAQ answer is still better than silence.
            log.warning("Provider failed, answering from the FAQ: %s", exc)
            text, provider_name = hits[0].entry.a[lang], "fallback-faq"
        if not text or HANDOFF in text:
            return self._handoff(lang, hits[0].confidence, provider_name)
        return Answer(text, lang, False, [e.id for e in context], provider_name, hits[0].confidence)
