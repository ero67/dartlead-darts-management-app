# The page the user is on: its prompt line, and the prompts still format with the new {page} variable.
import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableLambda

from assistant import agent, prompts
from assistant.agent import REWRITE_PAGE_RULE, REWRITE_PROMPT, SYSTEM_PROMPT, page_line
from assistant.dataset import case_input

PAGE = {"kind": "league", "id": "8c532608-8d07-45b9-8684-9cca4491213d"}
PAGE_LINE = "The user is viewing the league with id 8c532608-8d07-45b9-8684-9cca4491213d."


def test_page_line():
    assert page_line({"kind": "league", "id": "abc"}) == "The user is viewing the league with id abc."
    assert page_line({"kind": "practice", "id": None}) == "The user is on a practice page."
    assert page_line(None) == ""


def test_prompts_format_with_page(monkeypatch):
    monkeypatch.setattr(prompts, "_skip_until", float("inf"))  # no Langfuse: the code text
    agent = prompts.template("agent", SYSTEM_PROMPT).format_messages(
        context="X", language="Slovak", page="P", messages=[HumanMessage("hi")])
    assert "P" in agent[0].content
    rewrite = prompts.template("rewrite", REWRITE_PROMPT).format_messages(page="P", messages=[HumanMessage("hi")])
    assert "P" in rewrite[0].content


def test_rewrite_page_rule_never_asks_for_an_id():
    assert agent.rewrite_page(None) == ""  # no page, no dangling sentence
    text = agent.rewrite_page(PAGE)
    assert text.startswith(PAGE_LINE) and text.endswith(REWRITE_PAGE_RULE)
    assert 'say so in the question ("in this league", "this player")' in REWRITE_PAGE_RULE
    assert "Never write an id." in REWRITE_PAGE_RULE and "unless the conversation just named someone else" in REWRITE_PAGE_RULE
    assert "id" not in REWRITE_PROMPT.replace("{page}", "").split("Return only the question.")[1]


@pytest.fixture
def no_langfuse(monkeypatch):
    monkeypatch.setattr(prompts, "_skip_until", float("inf"))  # the code text, no network


def fake_model(monkeypatch, name):
    """Replaces agent.<name> with a model that records the prompt it gets and answers 'rewritten'."""
    calls = []
    monkeypatch.setattr(agent, name, RunnableLambda(lambda prompt: calls.append(prompt.to_messages()) or AIMessage("rewritten")))
    return calls


def test_rewrite_skips_model_without_history_or_page(monkeypatch, no_langfuse):
    calls = fake_model(monkeypatch, "rewriter")
    assert agent.rewrite({"messages": [HumanMessage("hi")], "page": None}) == {"question": "hi"}
    assert calls == []


def test_rewrite_first_message_on_a_page(monkeypatch, no_langfuse):
    calls = fake_model(monkeypatch, "rewriter")
    assert agent.rewrite({"messages": [HumanMessage("who leads?")], "page": PAGE}) == {"question": "rewritten"}
    (system, human), = calls
    assert PAGE_LINE in system.content and REWRITE_PAGE_RULE in system.content
    assert human.content == "Last message: who leads?"  # no Conversation block


def test_rewrite_with_history_has_conversation(monkeypatch, no_langfuse):
    calls = fake_model(monkeypatch, "rewriter")
    messages = [HumanMessage("Novak"), AIMessage("Which Novak?"), HumanMessage("Peter")]
    agent.rewrite({"messages": messages, "page": None})
    (system, human), = calls
    assert PAGE_LINE not in system.content and REWRITE_PAGE_RULE not in system.content and "Never write an id" not in system.content
    assert human.content == "Conversation:\nUser: Novak\nAssistant: Which Novak?\n\nLast message: Peter"


@pytest.mark.parametrize("page, line", [(PAGE, PAGE_LINE), (None, "")])
def test_call_agent_passes_page_line(monkeypatch, no_langfuse, page, line):
    calls = fake_model(monkeypatch, "model_with_tools")
    state = {"messages": [HumanMessage("who leads?")], "docs": [], "sources": ["stats"], "language": "English", "page": page}
    agent.call_agent(state)
    assert calls[0][0].content == SYSTEM_PROMPT.format(context="(none)", language="English", page=line)


def test_case_input_carries_page():
    case = {"question": "who leads?", "page": PAGE}
    assert case_input(case) == {"question": "who leads?", "history": [], "page": PAGE}
    assert case_input({"question": "q", "history": ["a"]}) == {"question": "q", "history": ["a"], "page": None}
