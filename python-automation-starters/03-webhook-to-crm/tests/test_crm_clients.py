"""amoCRM and Bitrix24 clients against httpx.MockTransport: exact requests checked, no network."""
import json

import httpx
import pytest

from crmhook.crm import AmoCRMClient, Bitrix24Client, CrmError
from crmhook.leads import parse_lead

LEAD = parse_lead({"name": "Анна", "phone": "8 999 123-45-67", "email": "Ann@Example.com",
                   "comment": "Перезвоните", "utm_source": "yandex", "formname": "Заявка"})


class Recorder:
    """A fake HTTP server: routes[(method, path)] is a list of responses served in order."""

    def __init__(self, routes):
        self.routes = {k: list(v) for k, v in routes.items()}
        self.calls: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        queue = self.routes.get((request.method, request.url.path))
        if not queue:
            return httpx.Response(404, json={"error": "no route"})
        item = queue.pop(0) if len(queue) > 1 else queue[0]
        return item if isinstance(item, httpx.Response) else httpx.Response(200, json=item)

    def bodies(self, method, path):
        return [json.loads(r.content) for r in self.calls if r.method == method and r.url.path == path]


async def no_sleep(_):
    pass


def amo(recorder):
    http = httpx.AsyncClient(transport=httpx.MockTransport(recorder))
    return AmoCRMClient("https://demo.amocrm.ru", "TOKEN", pipeline_id=11, status_id=22, http=http, sleep=no_sleep)


async def test_amocrm_new_contact_uses_complex_and_adds_note():
    rec = Recorder({
        ("GET", "/api/v4/contacts"): [httpx.Response(204)],  # amoCRM answers 204 when nothing is found
        ("POST", "/api/v4/leads/complex"): [[{"id": 501, "contact_id": 901, "company_id": None, "merged": False}]],
        ("POST", "/api/v4/leads/notes"): [{"_embedded": {"notes": [{"id": 1}]}}],
    })
    result = await amo(rec).create_lead(LEAD)
    assert (result.lead_id, result.contact_id, result.contact_existed) == (501, 901, False)

    assert rec.calls[0].headers["Authorization"] == "Bearer TOKEN"
    assert rec.calls[0].url.params["query"] == "9991234567"  # last 10 digits match any stored format
    [payload] = rec.bodies("POST", "/api/v4/leads/complex")[0]
    assert payload["name"] == "Заявка с сайта: Анна (Заявка)"
    assert payload["pipeline_id"] == 11 and payload["status_id"] == 22
    assert payload["_embedded"]["tags"] == [{"name": "site"}, {"name": "yandex"}]
    contact = payload["_embedded"]["contacts"][0]
    assert contact["first_name"] == "Анна"
    assert contact["custom_fields_values"] == [
        {"field_code": "PHONE", "values": [{"value": "+79991234567", "enum_code": "WORK"}]},
        {"field_code": "EMAIL", "values": [{"value": "ann@example.com", "enum_code": "WORK"}]},
    ]
    [note] = rec.bodies("POST", "/api/v4/leads/notes")[0]
    assert note["entity_id"] == 501 and note["note_type"] == "common"
    assert "Комментарий: Перезвоните" in note["params"]["text"] and "utm_source: yandex" in note["params"]["text"]


async def test_amocrm_existing_contact_is_linked_not_duplicated():
    rec = Recorder({
        ("GET", "/api/v4/contacts"): [{"_embedded": {"contacts": [{"id": 77}]}}],
        ("POST", "/api/v4/leads"): [{"_embedded": {"leads": [{"id": 502}]}}],
        ("POST", "/api/v4/leads/notes"): [{}],
    })
    result = await amo(rec).create_lead(LEAD)
    assert (result.lead_id, result.contact_id, result.contact_existed) == (502, 77, True)
    [payload] = rec.bodies("POST", "/api/v4/leads")[0]
    assert payload["_embedded"]["contacts"] == [{"id": 77}]
    assert rec.bodies("POST", "/api/v4/leads/complex") == []


async def test_amocrm_retries_429_then_succeeds():
    sleeps = []

    async def record_sleep(s):
        sleeps.append(s)

    rec = Recorder({
        ("GET", "/api/v4/contacts"): [httpx.Response(429, headers={"Retry-After": "2"}), httpx.Response(204)],
        ("POST", "/api/v4/leads/complex"): [[{"id": 1, "contact_id": 2}]],
        ("POST", "/api/v4/leads/notes"): [{}],
    })
    client = amo(rec)
    client.sleep = record_sleep
    await client.create_lead(LEAD)
    assert sleeps[0] == 2.0


async def test_amocrm_auth_error_is_crm_error():
    rec = Recorder({("GET", "/api/v4/contacts"): [httpx.Response(401, json={"title": "Unauthorized"})]})
    with pytest.raises(CrmError):
        await amo(rec).create_lead(LEAD)


def bitrix(recorder):
    http = httpx.AsyncClient(transport=httpx.MockTransport(recorder))
    return Bitrix24Client("https://demo.bitrix24.ru/rest/1/secret", assigned_by_id=5, http=http, sleep=no_sleep)


async def test_bitrix_lead_add_with_found_contact():
    base = "/rest/1/secret/"
    rec = Recorder({
        ("POST", base + "crm.duplicate.findbycomm.json"): [{"result": {"CONTACT": [42]}}],
        ("POST", base + "crm.lead.add.json"): [{"result": 1234, "time": {}}],
    })
    result = await bitrix(rec).create_lead(LEAD)
    assert (result.lead_id, result.contact_id, result.contact_existed) == (1234, 42, True)
    find = rec.bodies("POST", base + "crm.duplicate.findbycomm.json")[0]
    assert find == {"entity_type": "CONTACT", "type": "PHONE", "values": ["+79991234567"]}
    body = rec.bodies("POST", base + "crm.lead.add.json")[0]
    fields = body["fields"]
    assert fields["TITLE"] == "Заявка с сайта: Анна (Заявка)"
    assert fields["PHONE"] == [{"VALUE": "+79991234567", "VALUE_TYPE": "WORK"}]
    assert fields["EMAIL"] == [{"VALUE": "ann@example.com", "VALUE_TYPE": "WORK"}]
    assert fields["UTM_SOURCE"] == "yandex" and fields["CONTACT_ID"] == 42 and fields["ASSIGNED_BY_ID"] == 5
    assert body["params"] == {"REGISTER_SONET_EVENT": "Y"}


async def test_bitrix_no_duplicates_and_rate_limit_retry():
    base = "/rest/1/secret/"
    rec = Recorder({
        ("POST", base + "crm.duplicate.findbycomm.json"): [{"result": []}],  # Bitrix returns [] when empty
        ("POST", base + "crm.lead.add.json"): [
            httpx.Response(503, json={"error": "QUERY_LIMIT_EXCEEDED"}),
            {"result": 99},
        ],
    })
    result = await bitrix(rec).create_lead(LEAD)
    assert (result.lead_id, result.contact_id) == (99, None)
    assert "CONTACT_ID" not in rec.bodies("POST", base + "crm.lead.add.json")[-1]["fields"]
    # phone lookup, then email lookup, then 2 attempts of lead.add
    assert len(rec.calls) == 4


async def test_bitrix_error_payload_raises():
    base = "/rest/1/secret/"
    rec = Recorder({
        ("POST", base + "crm.duplicate.findbycomm.json"): [{"result": []}],
        ("POST", base + "crm.lead.add.json"): [httpx.Response(400, json={"error": "INVALID_CREDENTIALS"})],
    })
    with pytest.raises(CrmError):
        await bitrix(rec).create_lead(LEAD)
