# The page the user is on: its prompt line, and the prompts still format with the new {page} variable.
from langchain_core.messages import HumanMessage

from assistant import prompts
from assistant.agent import REWRITE_PROMPT, SYSTEM_PROMPT, page_line


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
