# Prompt loading with no network: get_client() is stubbed with a fake that builds real Langfuse prompt clients.
from langchain_core.messages import HumanMessage
from langfuse.api import Prompt_Text
from langfuse.model import TextPromptClient

from assistant import prompts
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


def use_langfuse(monkeypatch, fallback_only):
    monkeypatch.setattr(prompts, "get_client", lambda: FakeLangfuse(fallback_only))


def test_to_langfuse_doubles_variables():
    assert prompts.to_langfuse("Answer in {language}.\n{context}") == "Answer in {{language}}.\n{{context}}"


def test_fallback_formats_like_code(monkeypatch):
    use_langfuse(monkeypatch, fallback_only=True)
    messages = prompts.template("agent", SYSTEM_PROMPT).format_messages(
        context="X", language="Slovak", messages=[HumanMessage("hi")])
    assert [m.type for m in messages] == ["system", "human"]
    assert messages[0].content == SYSTEM_PROMPT.format(context="X", language="Slovak")
    assert messages[1].content == "hi"


def test_linked_when_from_langfuse(monkeypatch):
    use_langfuse(monkeypatch, fallback_only=False)
    tpl = prompts.template("agent", SYSTEM_PROMPT)
    assert tpl.metadata["langfuse_prompt"].name == "agent"


def test_fallback_is_not_linked(monkeypatch):
    use_langfuse(monkeypatch, fallback_only=True)
    assert not (prompts.template("agent", SYSTEM_PROMPT).metadata or {}).get("langfuse_prompt")


def test_router_template_has_question(monkeypatch):
    use_langfuse(monkeypatch, fallback_only=True)
    messages = prompts.template("router", ROUTER_PROMPT, human="{question}").format_messages(question="hi")
    assert [m.type for m in messages] == ["system", "human"]
    assert messages[1].content == "hi"
