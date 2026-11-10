"""HTTP fetching with retries, backoff, Retry-After and a polite delay between requests."""
from __future__ import annotations

import logging
import random
import time
from typing import Callable

import httpx

log = logging.getLogger(__name__)
RETRY_STATUS = {408, 425, 429, 500, 502, 503, 504}
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept-Language": "ru,en;q=0.8",
}


class FetchError(Exception):
    def __init__(self, url: str, status: int | None, message: str):
        super().__init__(f"{url}: {message}")
        self.url, self.status = url, status


class NotFound(FetchError):
    pass


class Fetcher:
    def __init__(self, client: httpx.Client | None = None, *, retries: int = 4, backoff: float = 1.0,
                 max_wait: float = 60.0, delay: float = 0.5, jitter: float = 0.3,
                 sleep: Callable[[float], None] = time.sleep):
        """delay: pause before every request after the first (be polite, avoid bans)."""
        self.client = client or httpx.Client(headers=DEFAULT_HEADERS, timeout=20, follow_redirects=True)
        self.retries, self.backoff, self.max_wait = retries, backoff, max_wait
        self.delay, self.jitter, self.sleep = delay, jitter, sleep
        self.requests_made = 0

    def _wait_for(self, attempt: int, resp: httpx.Response | None) -> float:
        if resp is not None:
            retry_after = resp.headers.get("Retry-After", "").strip()
            if retry_after.isdigit():
                return min(float(retry_after), self.max_wait)
        return min(self.backoff * 2**attempt + random.uniform(0, self.jitter), self.max_wait)

    def get(self, url: str, **params) -> str:
        if self.requests_made and self.delay:
            self.sleep(self.delay)
        for attempt in range(self.retries + 1):
            self.requests_made += 1
            resp = None
            try:
                resp = self.client.get(url, params=params or None)
            except httpx.TransportError as exc:
                if attempt == self.retries:
                    raise FetchError(url, None, repr(exc)) from exc
                log.warning("%s: %r, retrying", url, exc)
            else:
                if resp.status_code == 404:
                    raise NotFound(url, 404, "not found")
                if resp.status_code < 400:
                    return resp.text
                if resp.status_code not in RETRY_STATUS or attempt == self.retries:
                    raise FetchError(url, resp.status_code, f"HTTP {resp.status_code}")
                log.warning("%s: HTTP %s, retrying", url, resp.status_code)
            self.sleep(self._wait_for(attempt, resp))
        raise FetchError(url, None, "retries exhausted")  # pragma: no cover
