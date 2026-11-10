"""Retrieval, hand-off rules and every provider, all offline (HTTP via MockTransport, Claude via a fake client)."""
import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from faqbot.answerer import FaqAnswerer
from faqbot.kb import Index, KnowledgeBase, detect_lang, tokenize
from faqbot.providers import HANDOFF, OpenAICompatProvider, ProviderError, StubProvider, WorkersAIProvider, make_provider
from faqbot.providers.anthropic_provider import AnthropicProvider

KB = KnowledgeBase.load(Path(__file__).parent.parent / "faq.json")


def stub_answerer(**kw):
    return FaqAnswerer(KB, StubProvider(), **kw)


@pytest.mark.parametrize("question,entry_id", [
    ("Сколько стоит доставка?", "delivery_price"),
    ("а во сколько вы закрываетесь", "hours"),
    ("можно торт на свадьбу заказать?", "custom_cake"),
    ("у вас есть без глютена?", "gluten"),
    ("как вернуть деньги за испорченный заказ", "refund"),
    ("скидки есть?", "loyalty"),
    ("сколько ждать курьера", "delivery_time"),
    ("how much is shipping", "delivery_price"),
    ("can I pay with cash", "payment"),
    ("Do you cater for an office party?", "corporate"),
])
def test_retrieval_finds_the_right_entry(question, entry_id):
    answer = stub_answerer().answer(question)
    assert not answer.handoff
    assert answer.sources[0] == entry_id
    assert answer.lang == detect_lang(question)


@pytest.mark.parametrize("question", ["есть ли парковка рядом?", "какая погода завтра", "Где вы находитесь?",
                                      "Do you deliver on weekends?", "", "!!!"])
def test_unknown_questions_are_handed_off(question):
    answer = stub_answerer().answer(question)
    assert answer.handoff
    assert answer.text == KB.handoff[answer.lang]


def test_english_question_gets_english_answer():
    answer = stub_answerer().answer("What are your opening hours?")
    assert answer.text == "We are open every day 8:00–21:00; on public holidays 9:00–18:00."


def test_tokenizer_stems_russian_forms_together():
    assert tokenize("доставка")[0] == tokenize("доставку")[0] == tokenize("доставки")[0]
    assert tokenize("Подскажите, пожалуйста, у вас") == []  # only stop words


def test_confidence_is_share_of_question_found():
    hits = Index(KB.entries).search("сколько стоит доставка до дома", k=1)
    assert hits[0].entry.id == "delivery_price"
    assert 0 < hits[0].confidence < 1  # "дома" is unknown to the FAQ


class FakeProvider:
    name = "fake"

    def __init__(self, reply=None, error=None):
        self.reply, self.error = reply, error
        self.calls = []

    def answer(self, question, lang, context, business):
        self.calls.append((question, lang, [e.id for e in context], business))
        if self.error:
            raise self.error
        return self.reply


def test_llm_gets_question_lang_context_and_business():
    provider = FakeProvider("Доставка стоит 199 ₽.")
    answer = FaqAnswerer(KB, provider).answer("Сколько стоит доставка?")
    assert answer.text == "Доставка стоит 199 ₽." and answer.provider == "fake"
    question, lang, ids, business = provider.calls[0]
    assert (question, lang, ids[0]) == ("Сколько стоит доставка?", "ru", "delivery_price")
    assert "Тёплый хлеб" in business


def test_llm_not_called_when_confidence_is_low():
    provider = FakeProvider("should not be used")
    answer = FaqAnswerer(KB, provider).answer("какая погода завтра")
    assert answer.handoff and provider.calls == []


def test_llm_handoff_token_becomes_handoff_message():
    answer = FaqAnswerer(KB, FakeProvider(HANDOFF)).answer("Do you have vegan cakes?")
    assert answer.handoff and answer.text == KB.handoff["en"]


def test_provider_failure_falls_back_to_faq_text():
    answer = FaqAnswerer(KB, FakeProvider(error=ProviderError("timeout"))).answer("Сколько стоит доставка?")
    assert not answer.handoff and answer.provider == "fallback-faq"
    assert answer.text.startswith("Доставка 199 ₽")


def test_long_question_is_truncated():
    provider = FakeProvider("ok")
    FaqAnswerer(KB, provider, max_question_chars=50).answer("Сколько стоит доставка?" + "!" * 500)
    assert len(provider.calls[0][0]) == 50


# --- providers --------------------------------------------------------------------------------------------

def entries(*ids):
    return [e for e in KB.entries if e.id in ids]


def test_openai_compatible_request_and_parsing():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": " Доставка 199 ₽. "}}]})

    provider = OpenAICompatProvider("http://localhost:11434/v1/", "llama3.1:8b", "KEY",
                                    http=httpx.Client(transport=httpx.MockTransport(handler)))
    text = provider.answer("Сколько стоит доставка?", "ru", entries("delivery_price"), "пекарня")
    assert text == "Доставка 199 ₽."
    assert seen["url"] == "http://localhost:11434/v1/chat/completions"
    assert seen["auth"] == "Bearer KEY"
    system, user = seen["body"]["messages"]
    assert system["role"] == "system" and "ONLY" in system["content"] and "Russian" in system["content"]
    assert HANDOFF in system["content"]
    assert "[1] Q: Сколько стоит доставка?" in user["content"] and "<<<\nСколько стоит доставка?\n>>>" in user["content"]


def test_openai_compatible_errors_become_provider_error():
    provider = OpenAICompatProvider("http://x/v1", "m", http=httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(500, text="boom"))))
    with pytest.raises(ProviderError):
        provider.answer("q", "en", entries("hours"), "b")
    provider = OpenAICompatProvider("http://x/v1", "m", http=httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"unexpected": True}))))
    with pytest.raises(ProviderError):
        provider.answer("q", "en", entries("hours"), "b")


def test_workers_ai_request_and_parsing():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"result": {"response": "Open 8–21."}, "success": True, "errors": []})

    provider = WorkersAIProvider("ACC", "TOKEN", http=httpx.Client(transport=httpx.MockTransport(handler)))
    assert provider.answer("hours?", "en", entries("hours"), "bakery") == "Open 8–21."
    assert seen["url"] == "https://api.cloudflare.com/client/v4/accounts/ACC/ai/run/@cf/meta/llama-3.1-8b-instruct"
    assert [m["role"] for m in seen["body"]["messages"]] == ["system", "user"]


class FakeAnthropic:
    """Mimics client.beta.messages.create of the official SDK."""

    def __init__(self, response=None, error=None):
        self.kwargs = None
        self.response, self.error = response, error
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return self.response


def message(text="", stop_reason="end_turn"):
    content = [SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)] if text else []
    return SimpleNamespace(content=content, stop_reason=stop_reason)


def test_anthropic_request_shape():
    client = FakeAnthropic(message("Доставка 199 ₽."))
    provider = AnthropicProvider(client=client)
    assert provider.answer("Сколько стоит доставка?", "ru", entries("delivery_price"), "пекарня") == "Доставка 199 ₽."
    kw = client.kwargs
    assert kw["model"] == "claude-opus-5-5"
    assert kw["output_config"] == {"effort": "low"}
    assert kw["fallbacks"] == "default" and kw["betas"] == ["server-side-fallback-2026-07-01"]
    assert "ONLY" in kw["system"] and kw["messages"][0]["role"] == "user"


def test_anthropic_refusal_is_handoff_and_errors_are_provider_errors():
    assert AnthropicProvider(client=FakeAnthropic(message(stop_reason="refusal"))).answer(
        "q", "en", entries("hours"), "b") == HANDOFF
    with pytest.raises(ProviderError):
        AnthropicProvider(client=FakeAnthropic(error=RuntimeError("network"))).answer("q", "en", entries("hours"), "b")
    with pytest.raises(ProviderError):
        AnthropicProvider(client=FakeAnthropic(message())).answer("q", "en", entries("hours"), "b")


def test_make_provider_from_env():
    assert make_provider({}).name == "stub"
    ollama = make_provider({"LLM_PROVIDER": "ollama", "LLM_MODEL": "qwen2.5:7b"})
    assert ollama.url == "http://localhost:11434/v1/chat/completions" and ollama.model == "qwen2.5:7b"
    assert make_provider({"LLM_PROVIDER": "workers-ai", "CF_ACCOUNT_ID": "a", "CF_API_TOKEN": "t"}).name == "workers-ai"
    with pytest.raises(ValueError):
        make_provider({"LLM_PROVIDER": "nope"})


def test_anthropic_with_real_sdk_over_mock_transport():
    """The real SDK builds the HTTP request; we check what would go over the wire."""
    anthropic = pytest.importorskip("anthropic")
    # SDK 2.x ships its own HTTP stack (httpx2); 1.x/0.x use httpx. Mock whichever it uses.
    try:
        import httpx2 as http_lib
    except ImportError:
        http_lib = httpx
    seen = {}

    def handler(request):
        seen["path"] = request.url.path
        seen["headers"] = request.headers
        seen["body"] = json.loads(request.content)
        return http_lib.Response(200, json={
            "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
            "content": [{"type": "text", "text": "Open 8:00–21:00 every day."}],
            "stop_reason": "end_turn", "stop_sequence": None,
            "usage": {"input_tokens": 10, "output_tokens": 5},
        })

    client = anthropic.Anthropic(api_key="test-key", base_url="http://anthropic.test", max_retries=0,
                                 http_client=http_lib.Client(transport=http_lib.MockTransport(handler)))
    answer = FaqAnswerer(KB, AnthropicProvider(client=client)).answer("What are your opening hours?")
    assert answer.text == "Open 8:00–21:00 every day." and answer.provider == "anthropic"
    assert seen["path"] == "/v1/messages"
    # SDK versions differ: x-api-key (older) or Authorization: Bearer (2.x).
    assert "test-key" in (seen["headers"].get("x-api-key", "") + seen["headers"].get("authorization", ""))
    assert "server-side-fallback-2026-07-01" in seen["headers"]["anthropic-beta"]
    body = seen["body"]
    assert body["model"] == "claude-opus-5-5" and body["fallbacks"] == "default"
    assert body["output_config"] == {"effort": "low"} and body["max_tokens"] == 16000
