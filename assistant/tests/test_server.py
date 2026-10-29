# Server tests with no network: the graph and the Supabase RPCs are stubbed.
import asyncio
import json

import pytest
from langchain_core.messages import AIMessageChunk
from langgraph.errors import GraphRecursionError

from assistant import server, stats

TRACE_ID = "0123456789abcdef0123456789abcdef"
QUESTION_ID = "11111111-2222-3333-4444-555555555555"


def text_chunk(text="Hi"):
    return "messages", (AIMessageChunk(content=text), {"langgraph_node": "agent"})


class FakeGraph:
    """Stands in for the compiled graph: astream yields the (mode, payload) items, then raises `error` if given."""

    def __init__(self, items=(), error=None):
        self.items, self.error = list(items), error

    async def astream(self, *args, **kwargs):
        for item in self.items:
            yield item
        if self.error:
            raise self.error


@pytest.fixture
def use_graph(monkeypatch):
    return lambda graph: monkeypatch.setattr(server, "graph", graph)


@pytest.fixture
def refunds(monkeypatch):
    calls = []
    monkeypatch.setattr(server, "refund_question", lambda *args: calls.append(args))
    return calls


def run(question_id=QUESTION_ID):
    async def collect():
        return [json.loads(line) async for line in server.answer_events("hello", "t1", "user-1", "token", question_id, TRACE_ID)]

    return asyncio.run(collect())


def test_done_carries_trace_id(use_graph, refunds):
    use_graph(FakeGraph([text_chunk()]))
    events = run()
    assert events[-1] == {"type": "done", "trace_id": TRACE_ID}
    assert refunds == []


def test_error_refunds_question(use_graph, refunds):
    use_graph(FakeGraph(error=RuntimeError("boom")))
    events = run()
    assert [e["type"] for e in events] == ["error"]
    assert refunds == [("user-1", "token", QUESTION_ID)]


def test_error_after_partial_text_refunds(use_graph, refunds):
    use_graph(FakeGraph([text_chunk()], error=GraphRecursionError()))
    events = run()
    assert [e["type"] for e in events] == ["text", "error"]
    assert len(refunds) == 1


def test_failed_refund_keeps_error_event(use_graph, monkeypatch):
    use_graph(FakeGraph([text_chunk()], error=GraphRecursionError()))

    def broken_db():
        raise ConnectionError("supabase is down")

    monkeypatch.setattr(stats, "db", broken_db)
    events = run()
    assert [e["type"] for e in events] == ["text", "error"]
