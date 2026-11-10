"""amoCRM (Kommo) API v4 client: find contact by phone/email, create lead (+contact), add a note.

Auth: a long-lived token (amoCRM → Settings → Integrations → your private integration → "Long-lived token").
Docs: https://www.amocrm.ru/developers/content/crm_platform/leads-api
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx

from ..leads import Lead
from .base import CrmError, CrmResult, Sleep, request_json


class AmoCRMClient:
    def __init__(self, base_url: str, token: str, *, pipeline_id: int | None = None, status_id: int | None = None,
                 responsible_user_id: int | None = None, tags: tuple[str, ...] = ("site",),
                 http: httpx.AsyncClient | None = None, sleep: Sleep = asyncio.sleep):
        """base_url: https://<subdomain>.amocrm.ru (or .kommo.com)."""
        self.base_url = base_url.rstrip("/")
        self.http = http or httpx.AsyncClient(timeout=15)
        self.headers = {"Authorization": f"Bearer {token}"}
        self.pipeline_id = pipeline_id
        self.status_id = status_id
        self.responsible_user_id = responsible_user_id
        self.tags = tags
        self.sleep = sleep

    async def _call(self, method: str, path: str, **kwargs: Any) -> Any:
        return await request_json(self.http, method, self.base_url + path, headers=self.headers,
                                  sleep=self.sleep, **kwargs)

    async def find_contact(self, lead: Lead) -> int | None:
        for query in (lead.phone.lstrip("+")[-10:] if lead.phone else "", lead.email):
            if not query:
                continue
            data = await self._call("GET", "/api/v4/contacts", params={"query": query, "limit": 1})
            contacts = (data or {}).get("_embedded", {}).get("contacts", [])  # 204 = nothing found
            if contacts:
                return contacts[0]["id"]
        return None

    def _contact_payload(self, lead: Lead) -> dict:
        fields = []
        if lead.phone:
            fields.append({"field_code": "PHONE", "values": [{"value": lead.phone, "enum_code": "WORK"}]})
        if lead.email:
            fields.append({"field_code": "EMAIL", "values": [{"value": lead.email, "enum_code": "WORK"}]})
        return {"first_name": lead.name or lead.phone or lead.email, "custom_fields_values": fields}

    def _lead_payload(self, lead: Lead) -> dict:
        payload: dict[str, Any] = {"name": lead.title[:255]}
        if self.pipeline_id:
            payload["pipeline_id"] = self.pipeline_id
        if self.status_id:
            payload["status_id"] = self.status_id
        if self.responsible_user_id:
            payload["responsible_user_id"] = self.responsible_user_id
        tags = [*self.tags, *([lead.utm["utm_source"]] if lead.utm.get("utm_source") else [])]
        payload["_embedded"] = {"tags": [{"name": tag} for tag in tags]}
        return payload

    async def create_lead(self, lead: Lead) -> CrmResult:
        contact_id = await self.find_contact(lead)
        existed = contact_id is not None
        payload = self._lead_payload(lead)
        if existed:
            payload["_embedded"]["contacts"] = [{"id": contact_id}]
            data = await self._call("POST", "/api/v4/leads", json=[payload])
            try:
                lead_id = data["_embedded"]["leads"][0]["id"]
            except (KeyError, IndexError, TypeError) as exc:
                raise CrmError(f"unexpected amoCRM answer: {data!r}") from exc
        else:
            payload["_embedded"]["contacts"] = [self._contact_payload(lead)]
            data = await self._call("POST", "/api/v4/leads/complex", json=[payload])
            try:
                lead_id, contact_id = data[0]["id"], data[0]["contact_id"]
            except (KeyError, IndexError, TypeError) as exc:
                raise CrmError(f"unexpected amoCRM answer: {data!r}") from exc
        note = lead.note()
        if note:
            await self._call("POST", "/api/v4/leads/notes",
                             json=[{"entity_id": lead_id, "note_type": "common", "params": {"text": note}}])
        return CrmResult(lead_id=lead_id, contact_id=contact_id, contact_existed=existed)
