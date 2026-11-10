"""Pick a provider from environment variables (see .env.example)."""
from __future__ import annotations

import os
from typing import Mapping

from .base import HANDOFF, Provider, ProviderError
from .http_providers import OpenAICompatProvider, WorkersAIProvider
from .stub import StubProvider


def make_provider(env: Mapping[str, str] = os.environ) -> Provider:
    kind = env.get("LLM_PROVIDER", "stub").lower()
    if kind == "stub":
        return StubProvider()
    if kind == "ollama":
        return OpenAICompatProvider(env.get("OLLAMA_URL", "http://localhost:11434/v1"), env.get("LLM_MODEL", "llama3.1:8b"))
    if kind in ("openai", "openai-compatible"):
        return OpenAICompatProvider(env.get("LLM_BASE_URL", "https://api.openai.com/v1"), env["LLM_MODEL"],
                                    env.get("LLM_API_KEY", ""))
    if kind == "workers-ai":
        return WorkersAIProvider(env["CF_ACCOUNT_ID"], env["CF_API_TOKEN"],
                                 env.get("LLM_MODEL", "@cf/meta/llama-3.1-8b-instruct"))
    if kind == "anthropic":
        from .anthropic_provider import DEFAULT_MODEL, AnthropicProvider

        return AnthropicProvider(env.get("LLM_MODEL", DEFAULT_MODEL))
    raise ValueError(f"Unknown LLM_PROVIDER={kind!r}: use stub, ollama, openai, workers-ai or anthropic")


__all__ = ["make_provider", "Provider", "ProviderError", "HANDOFF", "StubProvider", "OpenAICompatProvider",
           "WorkersAIProvider"]
