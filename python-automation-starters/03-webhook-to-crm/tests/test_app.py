"""The webhook endpoint end to end, with an in-memory CRM and a mocked Telegram."""
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from crmhook.app import Deduper, create_app
from crmhook.crm import CrmError, MemoryCRM
from crmhook.notify import TelegramNotifier

TILDA_FORM = {"Name": "Иван", "Phone": "8 912 000-11-22", "formname": "Callback", "tranid": "1:1",
              "utm_source": "vk"}


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


@pytest.fixture
def tg():
    sent = []

    def handler(request):
        sent.append(json.loads(request.content))
        return httpx.Response(200, json={"ok": True})

    notifier = TelegramNotifier("T", -100, http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    return notifier, sent


def make(crm=None, notifier=None, clock=None):
    crm = crm or MemoryCRM()
    app = create_app(crm, secret="s3cret", crm_name="amoCRM", notifier=notifier,
                     deduper=Deduper(ttl=600, clock=clock or Clock()))
    return TestClient(app), crm


def test_tilda_form_creates_lead_and_notifies(tg):
    notifier, sent = tg
    client, crm = make(notifier=notifier)
    resp = client.post("/webhook/tilda?token=s3cret", data=TILDA_FORM)
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "lead_id": 2, "contact_id": 1, "contact_existed": False}
    [(_, lead)] = crm.leads
    assert (lead.name, lead.phone, lead.source) == ("Иван", "+79120001122", "tilda")
    assert sent[0]["chat_id"] == -100
    assert "Заявка с сайта: Иван" in sent[0]["text"] and "+79120001122" in sent[0]["text"] and "amoCRM: #2" in sent[0]["text"]


def test_json_body_with_nested_fields_and_header_token():
    client, crm = make()
    resp = client.post("/webhook/landing", headers={"X-Webhook-Token": "s3cret"},
                       json={"data": {"name": "Ann", "email": "ann@example.com"}, "utm_source": "google"})
    assert resp.status_code == 200
    assert crm.leads[0][1].utm == {"utm_source": "google"}


def test_wrong_token_rejected():
    client, crm = make()
    assert client.post("/webhook/tilda?token=nope", data=TILDA_FORM).status_code == 403
    assert client.post("/webhook/tilda", data=TILDA_FORM).status_code == 403
    assert crm.leads == []


def test_tilda_test_ping_answers_ok_without_lead():
    client, crm = make()
    resp = client.post("/webhook/tilda?token=s3cret", data={"test": "test"})
    assert resp.status_code == 200 and resp.text == "ok"
    assert crm.leads == []


def test_no_contact_is_422():
    client, _ = make()
    resp = client.post("/webhook/tilda?token=s3cret", data={"Name": "Nobody"})
    assert resp.status_code == 422


def test_duplicate_within_ttl_is_ignored_then_allowed_later():
    clock = Clock()
    client, crm = make(clock=clock)
    assert client.post("/webhook/tilda?token=s3cret", data=TILDA_FORM).json()["status"] == "ok"
    assert client.post("/webhook/tilda?token=s3cret", data=TILDA_FORM).json() == {"status": "duplicate"}
    clock.now = 601
    second = client.post("/webhook/tilda?token=s3cret", data=TILDA_FORM).json()
    assert second["status"] == "ok" and second["contact_existed"] is True
    assert len(crm.leads) == 2


def test_crm_down_returns_502_and_retry_is_not_deduped():
    class FlakyCRM(MemoryCRM):
        def __init__(self):
            super().__init__()
            self.fail = 1

        async def create_lead(self, lead):
            if self.fail:
                self.fail -= 1
                raise CrmError("down")
            return await super().create_lead(lead)

    client, crm = make(crm=FlakyCRM())
    assert client.post("/webhook/tilda?token=s3cret", data=TILDA_FORM).status_code == 502
    assert client.post("/webhook/tilda?token=s3cret", data=TILDA_FORM).json()["status"] == "ok"
    assert len(crm.leads) == 1


def test_bad_json_is_400():
    client, _ = make()
    resp = client.post("/webhook/x?token=s3cret", content=b"{oops", headers={"content-type": "application/json"})
    assert resp.status_code == 400


def test_health():
    client, _ = make()
    assert client.get("/health").json() == {"ok": True}
