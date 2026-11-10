"""Optional: a short Telegram message to the sales chat for every new lead."""
from __future__ import annotations

import html
import logging

import httpx

from .crm.base import CrmResult
from .leads import Lead

log = logging.getLogger(__name__)


def lead_text(lead: Lead, result: CrmResult, crm_name: str) -> str:
    lines = [f"🆕 <b>{html.escape(lead.title)}</b>"]
    if lead.phone:
        lines.append(f"📞 {lead.phone}")
    if lead.email:
        lines.append(f"✉️ {html.escape(lead.email)}")
    if lead.comment:
        lines.append(f"💬 {html.escape(lead.comment[:500])}")
    if lead.utm.get("utm_source"):
        lines.append(f"🔗 {html.escape(lead.utm['utm_source'])}")
    repeat = " (повторное обращение)" if result.contact_existed else ""
    lines.append(f"{crm_name}: #{result.lead_id}{repeat}")
    return "\n".join(lines)


class TelegramNotifier:
    def __init__(self, token: str, chat_id: str | int, http: httpx.AsyncClient | None = None):
        self.url = f"https://api.telegram.org/bot{token}/sendMessage"
        self.chat_id = chat_id
        self.http = http or httpx.AsyncClient(timeout=10)

    async def send(self, text: str) -> bool:
        """Never raises: a failed notification must not lose the lead."""
        try:
            resp = await self.http.post(self.url, json={"chat_id": self.chat_id, "text": text, "parse_mode": "HTML",
                                                        "disable_web_page_preview": True})
            if resp.status_code != 200:
                log.warning("Telegram notify failed: %s %s", resp.status_code, resp.text[:200])
                return False
            return True
        except httpx.HTTPError:
            log.exception("Telegram notify failed")
            return False
