"""Claude through the official `anthropic` SDK (optional dependency: pip install anthropic)."""
from __future__ import annotations

from typing import Any, Sequence

from ..kb import Entry
from .base import HANDOFF, ProviderError, system_prompt, user_prompt

DEFAULT_MODEL = "claude-opus-5-5"


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, model: str = DEFAULT_MODEL, *, effort: str = "low", client: Any = None):
        """client: an `anthropic.Anthropic()` instance; by default one is built from ANTHROPIC_API_KEY."""
        if client is None:
            import anthropic

            client = anthropic.Anthropic()
        self.client = client
        self.model = model
        self.effort = effort  # short FAQ answers: low effort is fast and cheap

    def answer(self, question: str, lang: str, context: Sequence[Entry], business: str) -> str:
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=16000,
                system=system_prompt(lang, business),
                messages=[{"role": "user", "content": user_prompt(question, lang, context)}],
                output_config={"effort": self.effort},
                # If a safety classifier declines, the API retries on a recommended fallback model server-side.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except Exception as exc:  # anthropic.APIError and network errors
            raise ProviderError(f"anthropic: {exc!r}") from exc
        if response.stop_reason == "refusal":
            return HANDOFF
        text = "".join(block.text for block in response.content if getattr(block, "type", "") == "text").strip()
        if not text:
            raise ProviderError(f"anthropic: empty answer (stop_reason={response.stop_reason})")
        return text
