import pytest

from crmhook.leads import LeadError, is_tilda_test, normalize_phone, parse_lead


@pytest.mark.parametrize("raw,expected", [
    ("8 (999) 123-45-67", "+79991234567"),
    ("+7 999 123 45 67", "+79991234567"),
    ("9991234567", "+79991234567"),
    ("+49 30 1234567", "+49301234567"),
    ("123", ""),
])
def test_normalize_phone(raw, expected):
    assert normalize_phone(raw) == expected


def test_tilda_form_fields():
    lead = parse_lead({
        "Name": "Иван", "Phone": "+7 (912) 000-11-22", "Email": "IVAN@MAIL.RU", "Comment": "Нужен сайт",
        "formname": "Callback", "tranid": "123:456", "utm_source": "vk", "utm_campaign": "autumn",
        "COOKIES": "_ga=1", "budget": "50000",
    }, source="tilda")
    assert (lead.name, lead.phone, lead.email, lead.comment) == ("Иван", "+79120001122", "ivan@mail.ru", "Нужен сайт")
    assert (lead.form, lead.external_id, lead.source) == ("Callback", "123:456", "tilda")
    assert lead.utm == {"utm_source": "vk", "utm_campaign": "autumn"}
    assert lead.extra == {"budget": "50000"}  # unknown fields are kept, service ones dropped
    assert "budget: 50000" in lead.note()


def test_wordpress_cf7_names_and_email_only():
    lead = parse_lead({"your-name": "Ann", "your-email": "ann@example.com", "your-message": "Hi"})
    assert (lead.name, lead.phone, lead.email, lead.comment) == ("Ann", "", "ann@example.com", "Hi")


def test_needs_a_contact():
    with pytest.raises(LeadError):
        parse_lead({"name": "No contacts", "phone": "12"})


def test_bad_phone_kept_in_extra_when_email_present():
    lead = parse_lead({"phone": "call me", "email": "a@b.co"})
    assert lead.phone == "" and lead.extra["phone_raw"] == "call me"


def test_dedup_key_stable_and_distinct():
    a = parse_lead({"phone": "89991234567", "formname": "A"})
    b = parse_lead({"phone": "+7 999 123 45 67", "formname": "A"})
    c = parse_lead({"phone": "+7 999 123 45 67", "formname": "B"})
    assert a.dedup_key() == b.dedup_key() != c.dedup_key()


def test_tilda_test_ping():
    assert is_tilda_test({"test": "test"})
    assert not is_tilda_test({"test": "test", "Phone": "1", "Name": "x"})
