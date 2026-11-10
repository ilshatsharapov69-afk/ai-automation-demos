"""Bitrix24 REST client through an inbound webhook: crm.lead.add with duplicate-contact lookup.

Auth: Bitrix24 → Developer resources → Other → Inbound webhook, scope "crm". You get a URL like
https://<portal>.bitrix24.ru/rest/1/<secret>/ — that URL is the only setting.
Docs: https://apidocs.bitrix24.ru/api-reference/crm/leads/crm-lead-add.html
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx

from ..leads import Lead
from .base import CrmError, CrmResult, Sleep, request_json

# Bitrix answers 503 + {"error": "QUERY_LIMIT_EXCEEDED"} above ~2 requests/second; request_json retries 503.


class Bitrix24Client:
    def __init__(self, webhook_url: str, *, source_id: str = "WEB", assigned_by_id: int | None = None,
                 http: httpx.AsyncClient | None = None, sleep: Sleep = asyncio.sleep):
        self.webhook_url = webhook_url.rstrip("/") + "/"
        self.http = http or httpx.AsyncClient(timeout=15)
        self.source_id = source_id
        self.assigned_by_id = assigned_by_id
        self.sleep = sleep

    async def call(self, method: str, params: dict[str, Any]) -> Any:
        data = await request_json(self.http, "POST", f"{self.webhook_url}{method}.json", json=params, sleep=self.sleep)
        if not isinstance(data, dict) or "error" in data:
            raise CrmError(f"{method}: {data!r}")
        return data.get("result")

    async def find_contact(self, lead: Lead) -> int | None:
        for kind, value in (("PHONE", lead.phone), ("EMAIL", lead.email)):
            if not value:
                continue
            result = await self.call("crm.duplicate.findbycomm",
                                     {"entity_type": "CONTACT", "type": kind, "values": [value]})
            ids = (result or {}).get("CONTACT", []) if isinstance(result, dict) else []
            if ids:
                return int(ids[0])
        return None

    def lead_fields(self, lead: Lead, contact_id: int | None) -> dict[str, Any]:
        fields: dict[str, Any] = {
            "TITLE": lead.title[:255],
            "NAME": lead.name,
            "SOURCE_ID": self.source_id,
            "SOURCE_DESCRIPTION": lead.page or lead.form,
            "COMMENTS": lead.note(),
        }
        if lead.phone:
            fields["PHONE"] = [{"VALUE": lead.phone, "VALUE_TYPE": "WORK"}]
        if lead.email:
            fields["EMAIL"] = [{"VALUE": lead.email, "VALUE_TYPE": "WORK"}]
        for key, value in lead.utm.items():
            fields[key.upper()] = value  # UTM_SOURCE, UTM_MEDIUM… are standard lead fields
        if contact_id:
            fields["CONTACT_ID"] = contact_id
        if self.assigned_by_id:
            fields["ASSIGNED_BY_ID"] = self.assigned_by_id
        return fields

    async def create_lead(self, lead: Lead) -> CrmResult:
        contact_id = await self.find_contact(lead)
        lead_id = await self.call("crm.lead.add", {"fields": self.lead_fields(lead, contact_id),
                                                   "params": {"REGISTER_SONET_EVENT": "Y"}})
        if not lead_id:
            raise CrmError(f"crm.lead.add returned {lead_id!r}")
        return CrmResult(lead_id=int(lead_id), contact_id=contact_id, contact_existed=contact_id is not None)
