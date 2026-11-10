# 03 · Webhook → CRM (amoCRM / Bitrix24)

**RU:** принимает заявки с сайта (Tilda, WordPress CF7, Taplink, любой JSON), приводит телефон к `+7…`, отсеивает
повторы, ищет существующий контакт, создаёт сделку/лид в amoCRM или Bitrix24 с UTM и комментарием и (по желанию) шлёт
уведомление в Telegram.

**EN:** receives form submissions (Tilda, WordPress CF7, Taplink, any JSON), normalises the phone, drops duplicates,
finds an existing contact, creates a lead in amoCRM or Bitrix24 with UTM tags and a note, and optionally pings a
Telegram chat.

Stack: Python 3.10+, FastAPI, httpx. CRM clients are plain async classes, usable from bots and scripts too.

## Run in 2 commands

```bash
pip install -r requirements.txt
CRM=memory WEBHOOK_SECRET=change-me python -m crmhook
```

Then send a lead:

```bash
curl -X POST "http://localhost:8000/webhook/tilda?token=change-me" -d "Name=Иван" -d "Phone=8 912 000-11-22" -d "utm_source=vk"
```

Tests, offline (CRM APIs and Telegram mocked with `httpx.MockTransport`):

```bash
pip install -r requirements-dev.txt && pytest
```

## Connect a real CRM

**amoCRM / Kommo.** Settings → Integrations → Create integration (private) → Keys and access → **Long-lived token**.
Set `CRM=amocrm`, `AMO_BASE_URL=https://<subdomain>.amocrm.ru`, `AMO_TOKEN=…`; optionally `AMO_PIPELINE_ID` and
`AMO_STATUS_ID` (open the pipeline in the browser, ids are in the URL / `GET /api/v4/leads/pipelines`).
Flow: `GET /api/v4/contacts?query=<last 10 digits>` → if found `POST /api/v4/leads` linked to that contact,
else `POST /api/v4/leads/complex` (lead + contact in one call) → `POST /api/v4/leads/notes` with comment, form, page, UTM.

**Bitrix24.** Developer resources → Other → **Inbound webhook**, permissions `crm`. Set `CRM=bitrix24`,
`BITRIX_WEBHOOK_URL=https://<portal>.bitrix24.ru/rest/<user>/<secret>/`.
Flow: `crm.duplicate.findbycomm` by phone, then e-mail → `crm.lead.add` with `PHONE`, `EMAIL`, `UTM_*`, `COMMENTS`,
`CONTACT_ID` when the person is already known.

**The site.** Tilda: Site settings → Forms → Webhook → `https://<host>/webhook/tilda?token=<secret>` (Tilda's
`test=test` check gets `ok`). WordPress CF7: "CF7 to Webhook" plugin, same URL. Anything else: POST form-data or JSON.

Deploy anywhere that runs Python (Render/Railway/Fly free tiers, a VPS): `uvicorn crmhook.__main__:build_from_env --factory`.

## Behaviour worth showing the client

| Situation | Answer |
|---|---|
| Wrong / missing token | `403`, nothing is created. |
| No phone and no e-mail | `422 {"status":"rejected"}`. |
| Same submission again within 10 minutes (double click, sender retry) | `200 {"status":"duplicate"}`, no second lead. |
| CRM is down / 5xx / rate limit | retried with backoff (honours `Retry-After`, Bitrix `QUERY_LIMIT_EXCEEDED`); if still failing `502`, so the sender retries; the dedupe key is not stored. |
| Telegram is down | lead is still created, the error is logged. |

## Adapt in 30 minutes

| Client asks for | Change |
|---|---|
| Custom fields (budget, city, product) | amoCRM: add `{"field_id": <id>, "values": [{"value": …}]}` to `custom_fields_values` in `_lead_payload`; Bitrix: `UF_CRM_…` keys in `lead_fields`. Unknown form fields already land in the note. |
| Deals instead of leads in Bitrix24 | `crm.deal.add` with `CONTACT_ID` (create the contact with `crm.contact.add` first). |
| Other form field names | `ALIASES` in `crmhook/leads.py`. |
| Another CRM (RetailCRM, HubSpot, Pipedrive) | A class with `async create_lead(lead) -> CrmResult`, reuse `request_json` for retries. |
| Several workers / restarts must keep dedupe | Store `Deduper.seen` in Redis or SQLite. |
| amoCRM OAuth with refresh tokens instead of a long-lived token | Add a token store and refresh on `401` in `AmoCRMClient._call` (`POST /oauth2/access_token`, `grant_type=refresh_token`). |

## Files

```
crmhook/app.py            FastAPI endpoint: auth, parsing, dedupe, CRM call, notification
crmhook/leads.py          Lead model, field aliases, phone normalisation, Tilda test ping
crmhook/crm/base.py       CrmResult, CrmError, request_json (retries/backoff)
crmhook/crm/amocrm.py     amoCRM v4 client
crmhook/crm/bitrix24.py   Bitrix24 inbound-webhook client
crmhook/crm/memory.py     in-memory CRM for local runs
crmhook/notify.py         Telegram notifier
```
