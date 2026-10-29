# Phase 6 (local first): the chat API the web app talks to. POST /chat takes a message and a thread id with
# the user's Supabase access token, runs the Phase 4 graph as that user, and streams the run as NDJSON events
# (one JSON object per line): steps, tool calls, sources, and the reply text as it is written.
import ast
import json
import logging
import os

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessageChunk, HumanMessage
from langfuse import propagate_attributes
from langfuse.langchain import CallbackHandler
from langgraph.errors import GraphRecursionError
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from supabase import create_client

from assistant import stats  # importing loads .env
from assistant.agent import MAX_STEPS, graph

log = logging.getLogger("assistant")
auth = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"]).auth
ANSWER_NODES = {"agent", "off_topic"}  # nodes whose text is the reply; rewrite and route stay internal

app = FastAPI(title="DartLead assistant")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ASSISTANT_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174").split(","),
    allow_methods=["POST"],
    allow_headers=["Authorization", "Content-Type"],
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    thread_id: str = Field(min_length=1, max_length=100)  # made by the widget, one per conversation


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


async def answer_events(message: str, thread_id: str, user_id: str, token: str):
    """Yield the run as NDJSON events, running every stats query as the user:
    step (rewrite, route) -> sources -> tool_start / tool_end -> text (deltas) -> done | error."""
    config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 2 * MAX_STEPS + 3,
              "callbacks": [CallbackHandler()], "run_name": "chat"}
    try:
        with stats.as_user(token, user_id), propagate_attributes(trace_name="chat", session_id=thread_id, user_id=user_id,
                                                        tags=["phase-6", "api"]):
            # "updates": each node's output when it finishes; "messages": the reply's tokens as they are written.
            async for mode, payload in graph.astream({"messages": [HumanMessage(message)]}, config,
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
        yield event("done")
    except GraphRecursionError:
        yield event("error", message="Sorry, this needed more steps than I may take. Try a narrower question: one player, tournament or league.")
    except Exception:
        log.exception("chat failed")
        yield event("error", message="Sorry, something went wrong. Please try again.")


@app.post("/chat")
async def chat(request: ChatRequest, authorization: str | None = Header(default=None)):
    user_id, token = await run_in_threadpool(verify, authorization)
    # shortcut: no per-user rate limit yet (Phase 6, before real users).
    # The user id is part of the thread key, so nobody can continue someone else's conversation.
    thread_id = f"{user_id}:{request.thread_id}"
    return StreamingResponse(answer_events(request.message, thread_id, user_id, token),
                             media_type="application/x-ndjson; charset=utf-8")


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))
