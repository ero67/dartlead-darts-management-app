# Phase 4: one graph for every question. The Phase 1 router picks the sources, the Phase 2 retriever adds
# doc chunks, and the Phase 3 tools look up stats; one agent node writes the answer from all of it.
# A checkpointer keeps each conversation, and rewrite turns follow-ups ("Novák") into standalone questions.
#   START -> rewrite -> route -> off_topic -> END
#                            -> retrieve -> agent <-> tools -> END   (retrieve only for rules/app, tools only for stats)
import json
import os
import sys
import uuid
from typing import Annotated, TypedDict

from langchain_core.documents import Document
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig, chain
from langchain_openai import ChatOpenAI
from langfuse import get_client, propagate_attributes
from langfuse.langchain import CallbackHandler
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from assistant.answer import format_sources  # importing loads .env
from assistant.ask_stats import MAX_STEPS, run_tool, tools_by_name
from assistant.prompts import template
from assistant.retrieve import retriever
from assistant.router import chain as router
from assistant.tools import ACTION_TOOLS, TOOLS

SYSTEM_PROMPT = """You are the assistant of DartLead, an app for running darts tournaments and leagues.

- Darts rules and how to use the app: answer ONLY from the numbered sources below and cite them like [1]
  or [2][3]. If they do not cover it, say you don't know based on the DartLead docs, and do not guess.
- Players' statistics: use the tools and only numbers they return; never invent or estimate a statistic.
  If a name matches several players about equally, ask which one is meant. Write numbers from tools as plain
  text; brackets are only for the numbered sources, as [n].
  Questions across all players or tournaments (records, who hit a 170, most 180s) take one get_records call.
  Never call a tool once per tournament or player to build an answer: if no tool answers it in a few calls,
  say what you can answer instead.
- Always call show_chart, once, before you answer, when the question is about: a player's form or trend (kind form),
  a top list or ranking of three or more (kind ranking), a head-to-head comparison of two players (kind head_to_head),
  or the user's own practice over time (kind practice). Call it together with, or right after, the tool that has
  the numbers. Write the answer so it stands alone, as if no chart exists, and never mention a chart or graph.
- Never add judgements, benchmarks or comparisons that no tool or source gives (what counts as "good", what
  professionals or amateurs average). If asked whether a number is good, say DartLead has no benchmark for it,
  and compare it only with numbers the tools return (the player's recent form, other players' numbers).
- Practice and improvement: a suggestion must name the number from a tool it is based on and cite the coaching guide like other docs ([n]). Never suggest anything the guide does not cover.
- A recap of a round or tournament: a 5–8 line post for the league's group chat in the question's language, with a few fitting emojis, using only facts from get_round_recap.
- The page the user is on (below, if any): when they say "this league", "this match" or "he" without a name, mean that page's
  league, tournament, match or player and pass its id to the tools, unless the conversation just named someone else.
  A name or id in the question wins over the page.
- Actions: use propose_next_round or propose_add_league_members only when the user asks for that action, one per
  answer. Each shows the user a card to confirm, and its result is what the user did. Never say an action is done
  unless the result's status is "done". On "cancelled", say nothing was changed. On "failed", say what failed (the
  result's error). On "changed", the user wrote a new message instead of confirming: follow it, and propose again
  if it changes the action.
- Never show ids or field names in an answer. The rating is the "form rating" (Slovak: "forma").
Format with Markdown where it helps: **bold** key numbers, short lists, a small table for comparisons.
Answer in {language}, even when names or data are in another language. Be brief.

{page}

Sources:
{context}"""
OFF_TOPIC_PROMPT = """You are the assistant of DartLead, an app for running darts tournaments and leagues.
The question is not about darts or DartLead. In one or two sentences, in {language},
say that you can help with darts rules, using the DartLead app, and players' statistics. Do not answer the question itself."""
REWRITE_PROMPT = """Rewrite the user's last message as a standalone question that can be understood without the
conversation, in the language of the last message. Keep the names, numbers and details from earlier turns that
it refers to. If it is already standalone, return it unchanged. Return only the question.
{page}"""
# Sits in the rewrite's page text, so a turn on no page carries no dangling sentence.
REWRITE_PAGE_RULE = ('If the message refers to that page, say so in the question ("in this league", "this player"), unless the '
                     'conversation just named someone else. Never write an id.')

model = ChatOpenAI(model=os.environ["ANSWER_MODEL"], base_url="https://openrouter.ai/api/v1",
                   api_key=os.environ["OPENROUTER_API_KEY"], name="write-answer")
model_with_tools = model.bind_tools(TOOLS)
model_with_actions = model.bind_tools(TOOLS + ACTION_TOOLS)
tools_with_actions = tools_by_name | {t.name: t for t in ACTION_TOOLS}
action_names = {t.name for t in ACTION_TOOLS}
rewriter = model.with_config(run_name="rewrite-question")


class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]  # the whole conversation, appended by each node (reducer)
    question: str  # this turn's question, standalone (rewritten from the last message)
    sources: list[str]  # the router's pick: rules, stats, app; empty = off topic
    language: str  # the question's language, named by the router ("English", "Slovak")
    docs: list[Document]  # retrieved chunks for this question
    page: dict | None  # the page the user is on, sent with every message: no reducer, so each turn overwrites it
    actions: bool  # the app can show a confirmation card, so the proposal tools are on; overwritten each turn like page


def page_line(page: dict | None) -> str:
    if not page:
        return ""
    return "The user is on a practice page." if page["kind"] == "practice" else f"The user is viewing the {page['kind']} with id {page['id']}."


def rewrite_page(page: dict | None) -> str:
    return f"{page_line(page)}\n{REWRITE_PAGE_RULE}" if page else ""


def rewrite(state: State) -> dict:
    # The router and retriever see one question, not the conversation: "Novák" alone looks off topic.
    *history, last = state["messages"]
    page = rewrite_page(state.get("page"))
    if not history and not page:
        return {"question": last.content}  # first message on no page: nothing to resolve, no extra model call
    # Only text turns (tool calls and results are noise here). shortcut: the last 8 of them; summarise older
    # turns if long chats need them.
    turns = [m for m in history if isinstance(m, (HumanMessage, AIMessage)) and m.content][-8:]
    transcript = "\n".join(f"{'User' if isinstance(m, HumanMessage) else 'Assistant'}: {m.content}" for m in turns)
    conversation = f"Conversation:\n{transcript}\n\n" if transcript else ""
    human = HumanMessage(f"{conversation}Last message: {last.content}")
    reply = (template("rewrite", REWRITE_PROMPT) | rewriter).invoke({"page": page, "messages": [human]})
    return {"question": reply.content.strip()}


def route(state: State) -> dict:
    # Docs are reset too, so a later question never answers from an earlier one's chunks.
    route = router.invoke({"question": state["question"]})
    return {"sources": route.sources, "language": route.language, "docs": []}


def retrieve(state: State) -> dict:
    return {"docs": retriever.invoke(state["question"])}


def off_topic(state: State) -> dict:
    reply = (template("off-topic", OFF_TOPIC_PROMPT) | model).invoke(
        {"language": state["language"], "messages": [state["messages"][-1]]})
    return {"messages": [reply]}


def call_agent(state: State) -> dict:
    context = format_sources(state["docs"]) if state["docs"] else "(none)"
    # Tools only when the router saw a stats question: no tool tokens or detours for rules and app questions.
    llm = (model_with_actions if state.get("actions") else model_with_tools) if "stats" in state["sources"] else model
    reply = (template("agent", SYSTEM_PROMPT) | llm).invoke(
        {"context": context, "language": state["language"], "page": page_line(state.get("page")), "messages": state["messages"]})
    return {"messages": [reply]}


def call_tools(state: State) -> dict:
    calls = state["messages"][-1].tool_calls
    tools = tools_with_actions if state.get("actions") else tools_by_name
    # One proposal per turn: a resumed run re-runs this node, and its single pause must meet the user's single answer.
    first = next((c for c in calls if c["name"] in action_names), None)
    return {"messages": [run_tool(c, tools) if c is first or c["name"] not in action_names else
                         ToolMessage("Error: propose one action at a time.", tool_call_id=c["id"], status="error")
                         for c in calls]}


def after_route(state: State) -> str:
    if not state["sources"]:
        return "off_topic"
    return "retrieve" if {"rules", "app"} & set(state["sources"]) else "agent"


def after_agent(state: State) -> str:
    return "tools" if state["messages"][-1].tool_calls else END


builder = StateGraph(State)
builder.add_node("rewrite", rewrite)
builder.add_node("route", route)
builder.add_node("retrieve", retrieve)
builder.add_node("off_topic", off_topic)
builder.add_node("agent", call_agent)
builder.add_node("tools", call_tools)
builder.add_edge(START, "rewrite")
builder.add_edge("rewrite", "route")
builder.add_conditional_edges("route", after_route, ["off_topic", "retrieve", "agent"])
builder.add_edge("retrieve", "agent")
builder.add_conditional_edges("agent", after_agent, ["tools", END])
builder.add_edge("tools", "agent")
builder.add_edge("off_topic", END)
# The checkpointer saves the state after every node, per thread_id; the next question in that thread
# starts from the saved messages. In memory here, for the CLI and evals; the API compiles the same
# builder with a Postgres checkpointer (server.py), so conversations survive restarts.
graph = builder.compile(checkpointer=InMemorySaver())


@chain  # one Langfuse trace per question
def ask(question: str, config: RunnableConfig, page: dict | None = None, actions: bool = False) -> dict:
    # Same thread_id = same conversation. Without one, every question starts a new conversation (as the evals want).
    thread_id = config.get("configurable", {}).get("thread_id") or str(uuid.uuid4())
    run_config = {"recursion_limit": 2 * MAX_STEPS + 3, "configurable": {"thread_id": thread_id}}
    try:
        # rewrite + route + retrieve, then MAX_STEPS agent turns with the tool runs between them
        state = graph.invoke({"messages": [HumanMessage(question)], "page": page, "actions": actions}, run_config)
    except GraphRecursionError:
        return {"answer": "Sorry, this needed more steps than I may take. Try a narrower question: one player, tournament or league.", "question": question,
                "sources": [], "docs": [], "tools": [], "proposal": None}
    # This turn = everything from the last user message on; earlier turns' tool calls don't count.
    start = max(i for i, m in enumerate(state["messages"]) if isinstance(m, HumanMessage))
    # A paused run ends on the proposal, not on text: the evals see the card's content as the answer.
    interrupts = graph.get_state(run_config).interrupts
    proposal = interrupts[0].value if interrupts else None
    return {
        "answer": "PROPOSAL " + json.dumps(proposal, ensure_ascii=False) if proposal else state["messages"][-1].content,
        "question": state["question"],
        "sources": state["sources"],
        "docs": state["docs"],
        "tools": [c["name"] for m in state["messages"][start:] for c in getattr(m, "tool_calls", [])],
        "proposal": proposal,
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    questions = [" ".join(sys.argv[1:])] if sys.argv[1:] else [
        "Can I finish on a single 20?",
        "How do I show live results on a TV at the venue?",
        "What is Igor Benko's checkout percentage?",
        "Is Igor Benko's checkout percentage good, and how is it counted?",
        "Kto vedie Demo Ligu?",
        "What's the best pizza in Bratislava?",
    ]
    for question in questions:
        with propagate_attributes(trace_name="ask", tags=["phase-4"]):
            result = ask.invoke(question, config={"callbacks": [CallbackHandler()], "run_name": "ask"})
        print(f"\nQ: {question}\n   sources: {result['sources']}  docs: {len(result['docs'])}  tools: {result['tools']}")
        print(f"A: {result['answer']}")
    get_client().shutdown()  # short-lived script: send queued traces before exiting


def chat() -> None:
    # One conversation in the terminal; it is also one Langfuse session, so its turns show together.
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    thread_id = str(uuid.uuid4())
    print("DartLead assistant. Empty line to quit.")
    try:
        while question := input("\n> ").strip():
            with propagate_attributes(trace_name="ask", session_id=thread_id, tags=["phase-4", "chat"]):
                result = ask.invoke(question, config={"callbacks": [CallbackHandler()], "run_name": "ask",
                                                      "configurable": {"thread_id": thread_id}})
            if result["question"] != question:
                print(f"  (understood as: {result['question']})")
            print(result["answer"])
    except EOFError:  # piped input ran out
        pass
    get_client().shutdown()  # send queued traces before exiting
