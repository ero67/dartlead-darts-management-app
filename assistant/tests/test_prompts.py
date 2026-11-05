# Prompt loading with no network: get_client() is stubbed with a fake that builds real Langfuse prompt clients.
import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableLambda
from langfuse.api import Prompt_Text
from langfuse.model import TextPromptClient

from assistant import agent, prompts
from assistant.agent import SYSTEM_PROMPT
from assistant.router import SYSTEM_PROMPT as ROUTER_PROMPT


class FakeLangfuse:
    """get_prompt returns what the real SDK returns: the Langfuse prompt, or the fallback marked is_fallback."""

    def __init__(self, fallback_only):
        self.fallback_only = fallback_only

    def get_prompt(self, name, *, type, label, fallback, **_):
        prompt = Prompt_Text(name=name, version=3, prompt=fallback, type="text", labels=[label], tags=[], config={},
                             commit_message=None)
        return TextPromptClient(prompt, is_fallback=self.fallback_only)


@pytest.fixture(autouse=True)
def reset_skip_window(monkeypatch):
    monkeypatch.setattr(prompts, "_skip_until", 0.0)


def use_langfuse(monkeypatch, fallback_only):
    monkeypatch.setattr(prompts, "get_client", lambda: FakeLangfuse(fallback_only))


def test_to_langfuse_doubles_variables():
    assert prompts.to_langfuse("Answer in {language}.\n{context}") == "Answer in {{language}}.\n{{context}}"


def test_fallback_formats_like_code(monkeypatch):
    use_langfuse(monkeypatch, fallback_only=True)
    messages = prompts.template("agent", SYSTEM_PROMPT).format_messages(
        context="X", language="Slovak", page="", messages=[HumanMessage("hi")])
    assert [m.type for m in messages] == ["system", "human"]
    assert messages[0].content == SYSTEM_PROMPT.format(context="X", language="Slovak", page="")
    assert messages[1].content == "hi"


def test_linked_when_from_langfuse(monkeypatch):
    use_langfuse(monkeypatch, fallback_only=False)
    tpl = prompts.template("agent", SYSTEM_PROMPT)
    assert tpl.metadata["langfuse_prompt"].name == "agent"


def test_fallback_is_not_linked(monkeypatch):
    use_langfuse(monkeypatch, fallback_only=True)
    assert not (prompts.template("agent", SYSTEM_PROMPT).metadata or {}).get("langfuse_prompt")


@pytest.mark.parametrize("edit", [lambda text: text + "\nPlayer: {{player}}", lambda text: text.replace("{{context}}", "")])
def test_edited_variables_use_code_text(monkeypatch, edit):
    class Edited(FakeLangfuse):
        def get_prompt(self, name, *, type, label, fallback, **_):
            return super().get_prompt(name, type=type, label=label, fallback=edit(fallback))

    monkeypatch.setattr(prompts, "get_client", lambda: Edited(fallback_only=False))
    tpl = prompts.template("agent", SYSTEM_PROMPT)
    messages = tpl.format_messages(context="X", language="Slovak", page="", messages=[HumanMessage("hi")])
    assert messages[0].content == SYSTEM_PROMPT.format(context="X", language="Slovak", page="")
    assert not (tpl.metadata or {}).get("langfuse_prompt")
    assert prompts._skip_until == 0.0  # Langfuse is up, so it is asked again next time


def test_router_template_has_question(monkeypatch):
    use_langfuse(monkeypatch, fallback_only=True)
    messages = prompts.template("router", ROUTER_PROMPT, human="{question}").format_messages(question="hi")
    assert [m.type for m in messages] == ["system", "human"]
    assert messages[1].content == "hi"


def test_router_sends_action_requests_to_stats_and_app():
    # The proposal tools are bound only for stats; app brings the documented steps for an app without cards.
    assert '("create the next round", "add Marek to the league") need stats and app' in ROUTER_PROMPT


def agent_system_text(monkeypatch, actions, sources):
    """The system text call_agent sends, with the code prompt and a stub model."""
    use_langfuse(monkeypatch, fallback_only=True)
    sent = []
    for name in ("model", "model_with_tools", "model_with_actions"):
        monkeypatch.setattr(agent, name, RunnableLambda(lambda prompt: sent.append(prompt.messages[0].content) or AIMessage("")))
    agent.call_agent({"messages": [HumanMessage("q")], "docs": [], "sources": sources, "language": "English",
                      "actions": actions})
    return sent[0]


def test_stored_prompt_has_no_actions_rule():
    assert "propose_" not in SYSTEM_PROMPT


@pytest.mark.parametrize("actions, sources, has_rule", [
    (True, ["stats", "app"], True),
    (False, ["stats", "app"], False),  # an app without cards
    (True, ["app"], False),  # no tools bound
])
def test_actions_rule_only_with_the_proposal_tools(monkeypatch, actions, sources, has_rule):
    text = agent_system_text(monkeypatch, actions, sources)
    assert (agent.ACTIONS_RULE in text) is has_rule
    assert agent.today_line() in text


class CountingLangfuse(FakeLangfuse):
    """Counts get_prompt calls; raises `error` instead of answering when given (e.g. keys missing)."""

    def __init__(self, fallback_only, error=None):
        super().__init__(fallback_only)
        self.calls, self.error = 0, error

    def get_prompt(self, *args, **kwargs):
        self.calls += 1
        if self.error:
            raise self.error
        return super().get_prompt(*args, **kwargs)


@pytest.mark.parametrize("client", [CountingLangfuse(True), CountingLangfuse(True, error=RuntimeError("no keys"))])
def test_failed_fetch_skips_langfuse_for_a_minute(monkeypatch, client):
    monkeypatch.setattr(prompts, "get_client", lambda: client)
    first = prompts.template("agent", SYSTEM_PROMPT)
    second = prompts.template("agent", SYSTEM_PROMPT)
    assert client.calls == 1  # the second call did not ask Langfuse
    for tpl in (first, second):
        messages = tpl.format_messages(context="X", language="Slovak", page="", messages=[HumanMessage("hi")])
        assert messages[0].content == SYSTEM_PROMPT.format(context="X", language="Slovak", page="")
        assert not (tpl.metadata or {}).get("langfuse_prompt")
