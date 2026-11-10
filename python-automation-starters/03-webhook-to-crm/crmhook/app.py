"""FastAPI receiver: POST /webhook/{source} → normalise → dedupe → CRM → (optional) Telegram."""
from __future__ import annotations

import hmac
import json
import logging
import time
from typing import Any, Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from .crm.base import CrmClient, CrmError
from .leads import LeadError, is_tilda_test, parse_lead
from .notify import TelegramNotifier, lead_text

log = logging.getLogger(__name__)


class Deduper:
    """Remembers lead keys for `ttl` seconds. In-memory; swap for Redis/SQLite if you run several workers."""

    def __init__(self, ttl: float = 600, clock: Callable[[], float] = time.monotonic):
        self.ttl, self.clock = ttl, clock
        self.seen: dict[str, float] = {}

    def seen_recently(self, key: str) -> bool:
        now = self.clock()
        self.seen = {k: t for k, t in self.seen.items() if now - t < self.ttl}
        return key in self.seen

    def remember(self, key: str) -> None:
        self.seen[key] = self.clock()


async def read_payload(request: Request) -> dict[str, Any]:
    ctype = request.headers.get("content-type", "")
    if "application/json" in ctype:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            raise HTTPException(400, "invalid JSON")
        if not isinstance(data, dict):
            raise HTTPException(400, "JSON object expected")
        # Some builders wrap fields: {"data": {...}} or {"fields": {...}}
        for key in ("data", "fields", "lead"):
            if isinstance(data.get(key), dict):
                data = {**data, **data[key]}
        return data
    form = await request.form()
    return {k: v for k, v in form.items() if isinstance(v, str)}


def create_app(crm: CrmClient, *, secret: str = "", crm_name: str = "CRM",
               notifier: TelegramNotifier | None = None, deduper: Deduper | None = None) -> FastAPI:
    app = FastAPI(title="webhook → CRM")
    deduper = deduper or Deduper()

    @app.get("/health")
    async def health() -> dict:
        return {"ok": True}

    @app.post("/webhook/{source}")
    async def webhook(source: str, request: Request):
        token = request.query_params.get("token") or request.headers.get("X-Webhook-Token", "")
        if secret and not hmac.compare_digest(token, secret):
            raise HTTPException(403, "bad token")
        data = await read_payload(request)
        if is_tilda_test(data):
            return PlainTextResponse("ok")
        try:
            lead = parse_lead(data, source=source[:32])
        except LeadError as exc:
            return JSONResponse({"status": "rejected", "reason": str(exc)}, status_code=422)
        key = lead.dedup_key()
        if deduper.seen_recently(key):
            return {"status": "duplicate"}
        try:
            result = await crm.create_lead(lead)
        except CrmError as exc:
            log.error("CRM failed, sender should retry: %s", exc)
            return JSONResponse({"status": "error", "reason": "crm unavailable"}, status_code=502)
        deduper.remember(key)
        if notifier:
            await notifier.send(lead_text(lead, result, crm_name))
        return {"status": "ok", "lead_id": result.lead_id, "contact_id": result.contact_id,
                "contact_existed": result.contact_existed}

    return app
