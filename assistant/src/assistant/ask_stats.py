# Phase 4: the tool-calling loop as a LangGraph graph. The model asks for tools, we run them and send
# the results back, until it answers in text:  START -> model -> (tools -> model)* -> END
import os
import sys
from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import chain
from langchain_openai import ChatOpenAI
from langfuse import get_client, propagate_attributes
from langfuse.langchain import CallbackHandler
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from assistant.tools import TOOLS  # importing loads .env

SYSTEM_PROMPT = """You are the assistant of DartLead, an app for running darts tournaments and leagues.
Answer questions about players' statistics using the tools. Use only numbers the tools return; never
invent or estimate a statistic. If a name matches several players about equally, ask which one is meant.
Answer in the same language as the question. Be brief."""
MAX_STEPS = 5  # model turns; stops a model that keeps calling tools forever

model = ChatOpenAI(model=os.environ["ANSWER_MODEL"], base_url="https://openrouter.ai/api/v1",
                   api_key=os.environ["OPENROUTER_API_KEY"], name="stats-agent")
model_with_tools = model.bind_tools(TOOLS)
tools_by_name = {t.name: t for t in TOOLS}


def run_tool(call: dict) -> ToolMessage:
    # The model only asks; this is where our code decides. Errors go back as text so the model can recover.
    tool = tools_by_name.get(call["name"])
    if tool is None:
        return ToolMessage(f"Error: there is no tool called {call['name']}.", tool_call_id=call["id"])
    try:
        return tool.invoke(call)  # given a whole tool call, a tool returns a ToolMessage with the same id
    except Exception as e:
        return ToolMessage(f"Error: {e}", tool_call_id=call["id"], status="error")


class State(TypedDict):
    # add_messages is the reducer: a node's returned messages are appended, not swapped in.
    messages: Annotated[list[AnyMessage], add_messages]


def call_model(state: State) -> dict:
    # Node: the system prompt is added per call, so the state holds only the conversation.
    return {"messages": [model_with_tools.invoke([SystemMessage(SYSTEM_PROMPT), *state["messages"]])]}


def call_tools(state: State) -> dict:
    # Node: run every tool the last model turn asked for (a model may ask for several at once).
    return {"messages": [run_tool(call) for call in state["messages"][-1].tool_calls]}


def after_model(state: State) -> str:
    # Conditional edge: only decides where to go next, never calls anything.
    return "tools" if state["messages"][-1].tool_calls else END


builder = StateGraph(State)
builder.add_node("model", call_model)
builder.add_node("tools", call_tools)
builder.add_edge(START, "model")
builder.add_conditional_edges("model", after_model, ["tools", END])
builder.add_edge("tools", "model")  # the loop back
graph = builder.compile()


@chain  # one Langfuse trace per question, with the graph's nodes nested inside
def ask_stats(question: str) -> dict:
    try:
        # Every node run is one step: MAX_STEPS model turns plus the tool runs between them.
        state = graph.invoke({"messages": [HumanMessage(question)]}, {"recursion_limit": 2 * MAX_STEPS})
    except GraphRecursionError:
        return {"answer": "Sorry, I could not work that out in a few steps.", "tools": []}
    tools_used = [c["name"] for m in state["messages"] for c in getattr(m, "tool_calls", [])]
    return {"answer": state["messages"][-1].content, "tools": tools_used}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    questions = [" ".join(sys.argv[1:])] if sys.argv[1:] else [
        "What is Igor Benko's average?",
        "How has Kucera played in his last 5 matches?",
        "How many 180s does Peter have?",
        "Who has the better checkout percentage, Igor Benko or Andrej Kučera?",
        "Koľko 180 hodil Rastislav Hudák?",
    ]
    for question in questions:
        with propagate_attributes(trace_name="ask-stats", tags=["phase-3"]):
            result = ask_stats.invoke(question, config={"callbacks": [CallbackHandler()], "run_name": "ask-stats"})
        print(f"\nQ: {question}\nA: {result['answer']}\n   tools: {result['tools']}")
    get_client().shutdown()  # short-lived script: send queued traces before exiting
