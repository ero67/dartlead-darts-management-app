# Phase 3: the tool-calling loop. The model asks for tools, we run them and send the results back,
# until it answers in text. Phase 4 rebuilds this loop as a LangGraph graph.
import os
import sys

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import chain
from langchain_openai import ChatOpenAI
from langfuse import get_client, propagate_attributes
from langfuse.langchain import CallbackHandler

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


@chain  # a Runnable, so one Langfuse trace holds every model turn and tool run of a question
def ask_stats(question: str) -> str:
    messages = [SystemMessage(SYSTEM_PROMPT), HumanMessage(question)]
    for _ in range(MAX_STEPS):
        reply = model_with_tools.invoke(messages)
        messages.append(reply)
        if not reply.tool_calls:
            return reply.content
        messages += [run_tool(call) for call in reply.tool_calls]  # a model may ask for several at once
    return "Sorry, I could not work that out in a few steps."


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
            answer = ask_stats.invoke(question, config={"callbacks": [CallbackHandler()], "run_name": "ask-stats"})
        print(f"\nQ: {question}\nA: {answer}")
    get_client().shutdown()  # short-lived script: send queued traces before exiting
