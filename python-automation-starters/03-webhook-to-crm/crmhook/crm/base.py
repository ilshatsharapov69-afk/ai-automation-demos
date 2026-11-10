"""Common bits for CRM clients: result type, errors and an HTTP call with retries."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Protocol

import httpx

from ..leads import Lead

log = logging.getLogger(__name__)
RETRY_STATUS = {429, 500, 502, 503, 504}


@dataclass
class CrmResult:
    lead_id: int | str
    contact_id: int | str | None = None
    contact_existed: bool = False


class CrmError(Exception):
    """CRM refused or is unreachable. The webhook answers 502 so the sender can retry."""


class CrmClient(Protocol):
    async def create_lead(self, lead: Lead) -> CrmResult: ...


Sleep = Callable[[float], Awaitable[None]]


async def request_json(http: httpx.AsyncClient, method: str, url: str, *, retries: int = 3,
                       backoff: float = 0.5, sleep: Sleep = asyncio.sleep, **kwargs: Any) -> Any:
    """One API call: retries 429/5xx/network errors with exponential backoff (honours Retry-After),
    returns parsed JSON (None for 204), raises CrmError otherwise."""
    for attempt in range(retries + 1):
        try:
            resp = await http.request(method, url, **kwargs)
        except httpx.TransportError as exc:
            if attempt == retries:
                raise CrmError(f"{method} {url}: {exc!r}") from exc
            await sleep(backoff * 2**attempt)
            continue
        if resp.status_code in RETRY_STATUS and attempt < retries:
            retry_after = resp.headers.get("Retry-After", "")
            delay = float(retry_after) if retry_after.isdigit() else backoff * 2**attempt
            log.warning("%s %s -> %s, retry in %.1fs", method, url, resp.status_code, delay)
            await sleep(min(delay, 30))
            continue
        if resp.status_code == 204:
            return None
        if resp.status_code >= 400:
            raise CrmError(f"{method} {url} -> {resp.status_code}: {resp.text[:500]}")
        try:
            return resp.json()
        except ValueError as exc:
            raise CrmError(f"{method} {url}: not JSON") from exc
    raise CrmError(f"{method} {url}: retries exhausted")  # pragma: no cover
