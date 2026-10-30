# Server tests with no network: the graph and the Supabase RPCs are stubbed.
import asyncio
import json
import logging
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
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


class FakeDb:
    """Stands in for stats.db(): records each rpc(name, params) call; execute() raises `error` if given."""

    def __init__(self, error=None):
        self.error, self.calls = error, []

    def rpc(self, name, params=None):
        self.calls.append((name, params))
        return self

    def execute(self):
        if self.error:
            raise self.error


@pytest.fixture
def fake_db(monkeypatch):
    """Patches stats.db and stats.as_user; returns a factory so a test can choose the db error. as_user calls
    land in db.users as (token, user_id)."""

    def install(error=None):
        db = FakeDb(error)
        db.users = []

        @contextmanager
        def as_user(token, user_id=None):
            db.users.append((token, user_id))
            yield

        monkeypatch.setattr(stats, "db", lambda: db)
        monkeypatch.setattr(stats, "as_user", as_user)
        return db

    return install


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


def test_failed_refund_keeps_error_event(use_graph, fake_db, caplog):
    use_graph(FakeGraph([text_chunk()], error=GraphRecursionError()))
    db = fake_db(error=ConnectionError("supabase is down"))
    with caplog.at_level(logging.ERROR, logger="assistant"):
        events = run()
    assert [e["type"] for e in events] == ["text", "error"]
    assert [name for name, _ in db.calls] == ["refund_assistant_question"]  # the refund was attempted and failed
    assert "could not refund" in caplog.text


def test_refund_question_calls_rpc_as_user(fake_db):
    db = fake_db()
    server.refund_question("user-1", "token", QUESTION_ID)
    assert db.calls == [("refund_assistant_question", {"p_question_id": QUESTION_ID})]
    assert db.users == [("token", "user-1")]


def test_database_without_refund_migration(use_graph, fake_db):
    db = fake_db()
    db.execute = lambda: type("Response", (), {"data": {"allowed": True, "used": 1, "limit": 5}})()  # no question_id
    assert server.use_question("user-1", "token") is None  # the question is still allowed
    db.calls.clear()
    use_graph(FakeGraph(error=RuntimeError("boom")))
    assert [e["type"] for e in run(question_id=None)] == ["error"]
    assert db.calls == []  # nothing to give back, so no refund RPC


class FakeLangfuse:
    """Stands in for get_client(): records create_score kwargs; raises `error` if given."""

    def __init__(self, error=None):
        self.error, self.scores = error, []

    def create_score(self, **kwargs):
        if self.error:
            raise self.error
        self.scores.append(kwargs)


@pytest.fixture
def feedback(monkeypatch):
    """A TestClient for /feedback with sign-in accepted and Langfuse faked; returns (post, langfuse, questions)."""
    langfuse, questions = FakeLangfuse(), []
    monkeypatch.setattr(server, "verify", lambda authorization: ("user-1", "token"))
    monkeypatch.setattr(server, "get_client", lambda: langfuse)
    monkeypatch.setattr(server, "use_question", lambda *args: questions.append(args))
    client = TestClient(server.app)

    def post(**body):
        return client.post("/feedback", json={"trace_id": TRACE_ID, "value": 1, **body}, headers={"Authorization": "Bearer token"})

    return post, langfuse, questions


def test_feedback_needs_sign_in():
    response = TestClient(server.app).post("/feedback", json={"trace_id": TRACE_ID, "value": 1})
    assert response.status_code == 401


def test_feedback_rejects_bad_trace_id(feedback):
    post, langfuse, _ = feedback
    assert post(trace_id="abc").status_code == 422
    assert langfuse.scores == []


def test_feedback_rejects_long_comment(feedback):
    post, langfuse, _ = feedback
    assert post(comment="x" * 501).status_code == 422
    assert langfuse.scores == []


def test_feedback_scores_trace(feedback):
    post, langfuse, _ = feedback
    response = post(value=0, comment="wrong number")
    assert response.status_code == 204
    assert langfuse.scores == [{"trace_id": TRACE_ID, "name": "user-feedback", "value": 0, "data_type": "BOOLEAN",
                                "comment": "wrong number"}]


def test_feedback_blank_comment_is_none(feedback):
    post, langfuse, _ = feedback
    assert post(comment="   ").status_code == 204
    assert langfuse.scores[0]["comment"] is None


def test_feedback_does_not_use_a_question(feedback):
    post, _, questions = feedback
    post()
    assert questions == []


def test_feedback_langfuse_failure_is_502(feedback):
    post, langfuse, _ = feedback
    langfuse.error = RuntimeError("langfuse is down")
    assert post().status_code == 502


# --- the page the user is on ---------------------------------------------------------------------------------

LEAGUE_ID = "0b1f6d5e-9c1a-4d2b-8e3f-123456789abc"


class RecordingGraph(FakeGraph):
    def __init__(self):
        super().__init__([text_chunk()])
        self.inputs = []

    async def astream(self, graph_input, *args, **kwargs):
        self.inputs.append(graph_input)
        async for item in super().astream(graph_input):
            yield item


@pytest.fixture
def chat(monkeypatch, use_graph):
    """A TestClient for /chat with sign-in accepted; returns (post, graph) where graph records its inputs."""
    graph = RecordingGraph()
    use_graph(graph)
    monkeypatch.setattr(server, "verify", lambda authorization: ("user-1", "token"))
    monkeypatch.setattr(server, "use_question", lambda *args: QUESTION_ID)
    monkeypatch.setattr(server, "refund_question", lambda *args: None)
    client = TestClient(server.app)

    def post(**body):
        return client.post("/chat", json={"message": "Who leads?", "thread_id": "t1", **body}, headers={"Authorization": "Bearer token"})

    return post, graph


@pytest.mark.parametrize("page", [
    {"kind": "shop", "id": LEAGUE_ID},
    {"kind": "league"},
    {"kind": "league", "id": "abc"},
    {"kind": "practice", "id": "abc"},
])
def test_chat_rejects_bad_page(chat, page):
    post, graph = chat
    assert post(page=page).status_code == 422
    assert graph.inputs == []


def test_chat_accepts_practice_page_without_id(chat):
    post, graph = chat
    assert post(page={"kind": "practice"}).status_code == 200
    assert graph.inputs[0]["page"] == {"kind": "practice", "id": None}


def test_page_reaches_graph(chat):
    post, graph = chat
    assert post(page={"kind": "league", "id": LEAGUE_ID.upper()}).status_code == 200
    assert graph.inputs[0]["page"] == {"kind": "league", "id": LEAGUE_ID.upper()}


def test_no_page_is_none_in_graph_input(chat):
    # None overwrites the page of an earlier turn in the same thread.
    post, graph = chat
    assert post().status_code == 200
    assert graph.inputs[0]["page"] is None
