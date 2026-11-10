"""A CRM that lives in memory: for local runs without a CRM account and for tests."""
from __future__ import annotations

import itertools
import logging

from ..leads import Lead
from .base import CrmResult

log = logging.getLogger(__name__)


class MemoryCRM:
    def __init__(self) -> None:
        self.leads: list[tuple[int, Lead]] = []
        self.contacts: dict[str, int] = {}
        self._ids = itertools.count(1)

    async def create_lead(self, lead: Lead) -> CrmResult:
        key = lead.phone or lead.email
        existed = key in self.contacts
        contact_id = self.contacts.setdefault(key, next(self._ids))
        lead_id = next(self._ids)
        self.leads.append((lead_id, lead))
        log.info("MemoryCRM: lead %s for contact %s: %s", lead_id, contact_id, lead.title)
        return CrmResult(lead_id=lead_id, contact_id=contact_id, contact_existed=existed)
