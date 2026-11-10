import pytest

from form2sheets.form import FIELDS, InvalidAnswer, normalize_phone, sheet_headers, sheet_row, validate

by_key = {f.key: f for f in FIELDS}


@pytest.mark.parametrize("raw,expected", [
    ("8 (999) 123-45-67", "+79991234567"),
    ("+7 999 123 45 67", "+79991234567"),
    ("9991234567", "+79991234567"),
    ("+44 20 7946 0958", "+442079460958"),
])
def test_phone_normalized(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["123", "abc", "+1 2"])
def test_bad_phone(raw):
    with pytest.raises(InvalidAnswer) as exc:
        validate(by_key["phone"], raw)
    assert exc.value.code == "err_phone"


def test_email_and_int_and_choice():
    assert validate(by_key["email"], " Ann@Example.COM ") == "ann@example.com"
    with pytest.raises(InvalidAnswer):
        validate(by_key["email"], "ann@")
    assert validate(by_key["budget"], "50 000") == "50000"
    with pytest.raises(InvalidAnswer):
        validate(by_key["budget"], "много")
    # typed label in either language matches the choice
    assert validate(by_key["service"], "консультация") == "consult"
    assert validate(by_key["service"], "Support") == "support"
    with pytest.raises(InvalidAnswer):
        validate(by_key["service"], "что-то другое")


def test_empty_and_too_long():
    with pytest.raises(InvalidAnswer):
        validate(by_key["name"], "   ")
    with pytest.raises(InvalidAnswer):
        validate(by_key["name"], "x" * 1001)


def test_row_matches_headers():
    answers = {"name": "Анна", "phone": "+79991234567", "service": "project", "budget": "50000"}
    row = sheet_row(answers, created_at="2026-11-05 10:00:00", user_id=7, username="ann", lang="ru")
    headers = sheet_headers()
    assert len(row) == len(headers)
    record = dict(zip(headers, row))
    assert record["Username"] == "@ann"
    assert record["Услуга / Service"] == "Проект под ключ"  # label, not the internal value
    assert record["Email"] == ""
