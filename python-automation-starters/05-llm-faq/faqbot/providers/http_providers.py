"""Providers over plain HTTP: any OpenAI-compatible endpoint and Cloudflare Workers AI."""
from __future__ import annotations

from typing import Sequence

import httpx

from ..kb import Entry
from .base import ProviderError, system_prompt, user_prompt


def _messages(question: str, lang: str, context: Sequence[Entry], business: str) -> list[dict]:
    return [
        {"role": "system", "content": system_prompt(lang, business)},
        {"role": "user", "content": user_prompt(question, lang, context)},
    ]


class OpenAICompatProvider:
    """POST {base_url}/chat/completions. Works with Ollama (http://localhost:11434/v1, free, local), LM Studio,
    OpenRouter, Groq, DeepSeek, OpenAI and other services that speak this format."""

    name = "openai-compatible"

    def __init__(self, base_url: str, model: str, api_key: str = "", *, timeout: float = 30,
                 http: httpx.Client | None = None):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.model = model
        self.headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self.http = http or httpx.Client(timeout=timeout)

    def answer(self, question: str, lang: str, context: Sequence[Entry], business: str) -> str:
        body = {"model": self.model, "messages": _messages(question, lang, context, business),
                "temperature": 0.2, "max_tokens": 400}
        try:
            resp = self.http.post(self.url, json=body, headers=self.headers)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise ProviderError(f"{self.name}: {exc!r}") from exc


class WorkersAIProvider:
    """Cloudflare Workers AI REST API (has a free daily allowance)."""

    name = "workers-ai"

    def __init__(self, account_id: str, api_token: str, model: str = "@cf/meta/llama-3.1-8b-instruct", *,
                 timeout: float = 30, http: httpx.Client | None = None):
        self.url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
        self.headers = {"Authorization": f"Bearer {api_token}"}
        self.http = http or httpx.Client(timeout=timeout)

    def answer(self, question: str, lang: str, context: Sequence[Entry], business: str) -> str:
        try:
            resp = self.http.post(self.url, json={"messages": _messages(question, lang, context, business),
                                                  "max_tokens": 400}, headers=self.headers)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success", True):
                raise ProviderError(f"workers-ai: {data.get('errors')}")
            return data["result"]["response"].strip()
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            raise ProviderError(f"{self.name}: {exc!r}") from exc
