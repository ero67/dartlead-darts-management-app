# Phase 6 (local first): the chat API the web app talks to. POST /chat takes a message and a thread id with
# the user's Supabase access token, runs the Phase 4 graph as that user, and streams the run as NDJSON events
# (one JSON object per line): steps, tool calls, sources, and the reply text as it is written.
import ast
import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from langchain_core.messages import AIMessageChunk, HumanMessage
from langfuse import Langfuse, get_client, propagate_attributes
from langfuse.langchain import CallbackHandler
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.errors import GraphRecursionError
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel, Field, model_validator
from starlette.concurrency import run_in_threadpool
from supabase import create_client

from assistant import stats  # importing loads .env
from assistant.agent import MAX_STEPS, builder
from assistant.agent import graph as memory_graph

log = logging.getLogger("assistant")
auth = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"]).auth
ANSWER_NODES = {"agent", "off_topic"}  # nodes whose text is the reply; rewrite and route stay internal
KEEP_DAYS = 30  # conversations untouched this long are deleted at start-up (the privacy policy says so)
graph = memory_graph


async def forget_old_conversations(pool: AsyncConnectionPool, saver: AsyncPostgresSaver) -> int:
    async with pool.connection() as conn:
        rows = await (await conn.execute(
            "SELECT thread_id FROM checkpoints GROUP BY thread_id"
            " HAVING max((checkpoint->>'ts')::timestamptz) < now() - make_interval(days => %s)", (KEEP_DAYS,))).fetchall()
    for row in rows:
        await saver.adelete_thread(row["thread_id"])
    return len(rows)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Conversations live in Postgres (schema "assistant", see the assistant_access migration), so they
    # survive restarts and scale-to-zero. Without CHECKPOINT_DATABASE_URL they stay in memory (local runs).
    global graph
    url = os.environ.get("CHECKPOINT_DATABASE_URL")
    if not url:
        log.warning("CHECKPOINT_DATABASE_URL is not set: conversations are kept in memory only")
        yield
        return
    # The session pooler (port 5432) keeps one server connection per client one, so prepared statements work.
    async with AsyncConnectionPool(url, min_size=1, max_size=5, open=False, check=AsyncConnectionPool.check_connection,
                                   kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row}) as pool:
        saver = AsyncPostgresSaver(pool)
        await saver.setup()  # creates or migrates the checkpoint tables; safe on every start
        log.warning("deleted %d old conversations", await forget_old_conversations(pool, saver))
        graph = builder.compile(checkpointer=saver)
        yield
    graph = memory_graph


app = FastAPI(title="DartLead assistant", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ASSISTANT_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174").split(","),
    allow_methods=["POST"],
    allow_headers=["Authorization", "Content-Type"],
)


UUID_RE = r"(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"


class PageContext(BaseModel):
    """The page the user is on, so "who leads?" on a league page means that league."""

    kind: Literal["league", "tournament", "match", "player", "practice"]
    id: str | None = Field(default=None, pattern=UUID_RE)  # practice is the user's own, so it has none

    @model_validator(mode="after")
    def needs_id(self):
        if self.kind != "practice" and self.id is None:
            raise ValueError(f"a {self.kind} page needs an id")
        return self


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    thread_id: str = Field(min_length=1, max_length=100)  # made by the widget, one per conversation
    page: PageContext | None = None


class FeedbackRequest(BaseModel):
    trace_id: str = Field(pattern=r"^[0-9a-f]{32}$")  # the id the done event carried
    value: Literal[0, 1]  # 1 = thumbs up, 0 = thumbs down
    comment: str | None = Field(default=None, max_length=500)


def verify(authorization: str | None) -> tuple[str, str]:
    """The user id and access token from 'Authorization: Bearer <token>', checked with Supabase Auth."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to use the assistant.")
    token = authorization.removeprefix("Bearer ")
    try:
        # shortcut: one Supabase Auth call per message; verify the JWT locally (JWKS) if latency or volume grows.
        user = auth.get_user(token).user
    except Exception:
        user = None
    if user is None:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    return user.id, token


def event(event_type: str, **data) -> str:
    return json.dumps({"type": event_type, **data}, ensure_ascii=False, default=str) + "\n"


def tool_output(content):
    # Tools return dicts and lists, which LangChain turns into text: JSON when it can, else a Python literal
    # (single quotes, None). Parse either back for the trace; literal_eval only reads literals, it never runs code.
    # Error messages stay text.
    for parse in (json.loads, ast.literal_eval):
        try:
            return parse(content)
        except (ValueError, SyntaxError, TypeError):
            pass
    return content


async def answer_events(message: str, thread_id: str, user_id: str, token: str, question_id: str, trace_id: str,
                        page: dict | None = None):
    """Yield the run as NDJSON events, running every stats query as the user:
    step (rewrite, route) -> sources -> tool_start / tool_end -> text (deltas) -> done | error.
    done carries the Langfuse trace id (feedback scores attach to it); a failed answer gives the question back."""
    config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 2 * MAX_STEPS + 3,
              "callbacks": [CallbackHandler(trace_context={"trace_id": trace_id})], "run_name": "chat"}
    try:
        with stats.as_user(token, user_id), propagate_attributes(trace_name="chat", session_id=thread_id, user_id=user_id,
                                                        tags=["phase-6", "api"]):
            # "updates": each node's output when it finishes; "messages": the reply's tokens as they are written.
            async for mode, payload in graph.astream({"messages": [HumanMessage(message)], "page": page}, config,
                                                     stream_mode=["updates", "messages"]):
                if mode == "messages":
                    chunk, meta = payload
                    # Only reply text: no tool-call chunks, no rewrite/router output.
                    if (meta.get("langgraph_node") in ANSWER_NODES and isinstance(chunk, AIMessageChunk)
                            and chunk.content and not chunk.tool_call_chunks):
                        yield event("text", delta=chunk.content)
                    continue
                for node, update in payload.items():
                    if node == "rewrite" and update["question"] != message:
                        yield event("step", kind="rewrite", question=update["question"])
                    elif node == "route":
                        yield event("step", kind="route", sources=update["sources"])
                    elif node == "retrieve":
                        yield event("sources", items=[{"source": d.metadata["source"], "section": d.metadata.get("section")}
                                                      for d in update["docs"]])
                    elif node == "agent":
                        for call in update["messages"][-1].tool_calls:
                            yield event("tool_start", id=call["id"], name=call["name"], args=call["args"])
                    elif node == "tools":
                        for m in update["messages"]:
                            yield event("tool_end", id=m.tool_call_id, name=m.name, status=m.status,
                                        output=tool_output(m.content))
        yield event("done", trace_id=trace_id)
    except GraphRecursionError:
        await run_in_threadpool(refund_question, user_id, token, question_id)
        yield event("error", message="Sorry, this needed more steps than I may take. Try a narrower question: one player, tournament or league.")
    except Exception:
        log.exception("chat failed")
        await run_in_threadpool(refund_question, user_id, token, question_id)
        yield event("error", message="Sorry, something went wrong. Please try again.")


def use_question(user_id: str, token: str) -> str | None:
    """Count this question against the user's daily limit and return its id, or refuse it (use_assistant_question
    in Supabase checks who may use the assistant and the limit; admins get a higher one). The id is None on a
    database without the refund migration; such a question simply cannot be given back."""
    with stats.as_user(token, user_id):
        quota = stats.db().rpc("use_assistant_question").execute().data
    if quota["allowed"]:
        return quota.get("question_id")
    if quota["reason"] == "limit":
        raise HTTPException(429, f"You have used today's {quota['limit']} questions. Try again tomorrow.")
    raise HTTPException(403, "The assistant is not available for your account yet.")


def refund_question(user_id: str, token: str, question_id: str | None) -> None:
    """Give a question back after a failed answer (refund_assistant_question allows it for 10 minutes, once).
    Never raises: the user must still get the error event."""
    if question_id is None:
        return
    try:
        with stats.as_user(token, user_id):
            stats.db().rpc("refund_assistant_question", {"p_question_id": question_id}).execute()
    except Exception:
        log.exception("could not refund question %s", question_id)


@app.post("/chat")
async def chat(request: ChatRequest, authorization: str | None = Header(default=None)):
    user_id, token = await run_in_threadpool(verify, authorization)
    question_id = await run_in_threadpool(use_question, user_id, token)
    trace_id = Langfuse.create_trace_id()
    # The user id is part of the thread key, so nobody can continue someone else's conversation.
    thread_id = f"{user_id}:{request.thread_id}"
    return StreamingResponse(answer_events(request.message, thread_id, user_id, token, question_id, trace_id,
                                         request.page.model_dump() if request.page else None),
                             media_type="application/x-ndjson; charset=utf-8")


@app.post("/feedback", status_code=204)
async def feedback(request: FeedbackRequest, authorization: str | None = Header(default=None)):
    await run_in_threadpool(verify, authorization)  # not use_question: a rating is not a question
    # shortcut: trace ownership not checked, store (trace_id, user_id) if scores ever drive anything automatic.
    # create_score only queues the score (sent in the background): 204 means accepted, not stored; 502 is a client set-up error.
    try:
        await run_in_threadpool(get_client().create_score, trace_id=request.trace_id, name="user-feedback", value=request.value,
                                data_type="BOOLEAN", comment=(request.comment or "").strip() or None)
    except Exception:
        log.exception("could not store feedback")
        raise HTTPException(502, "Could not save your feedback. Please try again.")
    return Response(status_code=204)


def main() -> None:
    import uvicorn

    # HOST=0.0.0.0 in the container. psycopg's async mode cannot run on Windows' default (Proactor) loop.
    config = uvicorn.Config(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8000")))
    asyncio.run(uvicorn.Server(config).serve(), loop_factory=asyncio.SelectorEventLoop)
