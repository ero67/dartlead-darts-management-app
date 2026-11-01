# Follow-up suggestions with no network: the model is a stub and Langfuse is unreachable, so the code prompt is used.
import pytest
from langchain_core.runnables import RunnableLambda

from assistant import followups, prompts
from assistant.followups import FOLLOWUPS_PROMPT, Followups, clean, suggest


@pytest.fixture(autouse=True)
def code_prompt(monkeypatch):
    def unreachable():
        raise ConnectionError

    monkeypatch.setattr(prompts, "get_client", unreachable)
    monkeypatch.setattr(prompts, "_skip_until", 0.0)


def stub_model(monkeypatch, questions):
    seen = []

    def run(prompt_value):
        seen.append(prompt_value.to_string())
        return Followups(questions=questions)

    monkeypatch.setattr(followups, "structured", RunnableLambda(run))
    return seen


def test_model_call_is_bounded_and_not_retried():
    # A call the stream stopped waiting for must free its worker thread, not hold it for the defaults.
    assert (followups.model.timeout, followups.model.max_retries) == (10, 0)


def test_clean_strips_and_drops_empty():
    assert clean(["  a? ", "", "   "]) == ["a?"]


def test_clean_drops_over_80():
    assert clean(["x" * 81, "ok?"]) == ["ok?"]


def test_clean_keeps_three():
    assert clean(list("abcde")) == ["a", "b", "c"]


def test_suggest_passes_the_language(monkeypatch):
    seen = stub_model(monkeypatch, ["Ako sa mu darilo?"])
    suggest("Aký je Peter?", "Peter má priemer 60.", "Slovak", {})
    assert "in Slovak" in seen[0]
    assert "Aký je Peter?" in seen[0] and "Peter má priemer 60." in seen[0]


def test_suggest_cuts_a_long_answer(monkeypatch):
    seen = stub_model(monkeypatch, [])
    suggest("q", "a" * 5000, "English", {})
    assert "a" * 4000 in seen[0] and "a" * 4001 not in seen[0]


def test_suggest_returns_cleaned_questions(monkeypatch):
    stub_model(monkeypatch, [" Who is next? ", "", "y" * 81, "b?", "c?", "d?"])
    assert suggest("q", "a", "English", {}) == ["Who is next?", "b?", "c?"]


def test_suggest_with_no_questions_is_empty(monkeypatch):
    stub_model(monkeypatch, [])
    assert suggest("Who?", "Which Peter do you mean?", "English", {}) == []


def test_prompt_rules():
    assert "{language}" in FOLLOWUPS_PROMPT
    assert "asks the user something" in FOLLOWUPS_PROMPT and "return an empty list" in FOLLOWUPS_PROMPT
    assert "Never invent one" in FOLLOWUPS_PROMPT and "appear in the question or the answer" in FOLLOWUPS_PROMPT
    assert "Do not repeat the question the user just asked" in FOLLOWUPS_PROMPT
    assert "darts terms such as checkout" in FOLLOWUPS_PROMPT and "under 80 characters" in FOLLOWUPS_PROMPT
