# Phase 3: the stats functions as LangChain tools. The model only reads each tool's name, docstring and
# argument types (sent as JSON Schema), so the docstrings below are prompts, written for the model.
import json
import os
import sys

from langchain_core.tools import tool
from langchain_core.utils.function_calling import convert_to_openai_tool
from langchain_openai import ChatOpenAI
from langfuse import get_client, propagate_attributes
from langfuse.langchain import CallbackHandler

from assistant import stats  # importing loads .env


@tool(parse_docstring=True)
def find_player(name: str) -> list[dict]:
    """Look up DartLead players by name. Call this first whenever a question names a player, because
    the other tools need the player's id. Accents and small typos are fine ("Kucera" finds "Kučera").

    Returns candidates best first, each with id, name and a match score from 0 to 1. If two or more
    candidates score about the same, ask the user which one they mean instead of picking one.
    An empty list means no player has that name.

    Args:
        name: The player's name as the user wrote it: full name, first name or last name.
    """
    return stats.find_player(name)


@tool(parse_docstring=True)
def get_player_stats(player_id: str, last_n: int | None = None) -> dict:
    """Get a player's darts statistics from completed DartLead matches: matches, wins, losses, legs,
    3-dart average, best match average, highest checkout, darts thrown, 180s, checkout percentage and
    high-score counts (visits of 80+, 95+, 133+, 170+ and 180).

    Average, checkouts, darts and high scores count X01 matches only; wins and legs count every game.
    A null value means there is no data for it, not zero.

    Args:
        player_id: The id from find_player. Never guess it.
        last_n: Only the player's most recent N matches, for questions about recent form. Leave it out for career stats.
    """
    return stats.get_player_stats(player_id, last_n=last_n)


TOOLS = [find_player, get_player_stats]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    # What the model receives for each tool: name, description and a JSON Schema of the arguments.
    print(json.dumps(convert_to_openai_tool(get_player_stats), indent=2, ensure_ascii=False))

    model = ChatOpenAI(model=os.environ["ANSWER_MODEL"], base_url="https://openrouter.ai/api/v1",
                       api_key=os.environ["OPENROUTER_API_KEY"], name="pick-tools")
    # bind_tools sends the schemas with every request. Nothing runs: we only look at what the model asks for.
    model_with_tools = model.bind_tools(TOOLS)
    questions = sys.argv[1:] or [
        "What is Igor Benko's average?",
        "How has Kucera played in his last 5 matches?",
        "How many 180s does Peter have?",
        "Who invented darts?",
    ]
    for question in questions:
        with propagate_attributes(trace_name="plan-tool-calls", tags=["phase-3"]):
            reply = model_with_tools.invoke(question, config={"callbacks": [CallbackHandler()], "run_name": "plan-tool-calls"})
        print(f"\nQ: {question}")
        print(f"   tool calls: {[(c['name'], c['args']) for c in reply.tool_calls] or 'none'}")
        if reply.content:
            print(f"   text: {' '.join(reply.content.split())[:200]}")
    get_client().shutdown()  # short-lived script: send queued traces before exiting
