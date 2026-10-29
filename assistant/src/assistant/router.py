# Phase 1: decide where the answer to a question lives (rules, stats, app help, or nowhere).
import sys
from typing import Literal

from dotenv import load_dotenv

load_dotenv()  # before importing Langfuse, which reads its keys from the environment

from langchain_core.runnables import chain as runnable  # noqa: E402
from langchain_google_genai import ChatGoogleGenerativeAI  # noqa: E402
from langfuse import get_client, propagate_attributes  # noqa: E402
from langfuse.langchain import CallbackHandler  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from assistant.prompts import template  # noqa: E402


class Route(BaseModel):
    """Where the answer to a DartLead question can be found."""

    # A list, not one label: "Peter needs 40, is D20 standard and how often does he hit doubles?" needs both.
    sources: list[Literal["rules", "stats", "app"]] = Field(
        description="Every source needed to answer the question. Empty if no source can answer it (off topic)."
    )
    players: list[str] = Field(description="Names of darts players mentioned in the question, exactly as written.")
    # Named here because the answer model drifts into the language of the data (Slovak names, Slovak tournaments).
    language: str = Field(description="The language the question is written in, as an English name: English, Slovak, …")


SYSTEM_PROMPT = """You route questions sent to the assistant of DartLead, an app for running darts tournaments and leagues.

Sources:
- rules: how darts is played (scoring, busts, checkouts, game formats)
- stats: data stored in DartLead about real players, matches, tournaments or leagues, including the user's own
  ("my tournaments", "my average", "which leagues are there", "who won the last round")
- app: how to use the DartLead app itself

Pick every source the answer needs. Pick none if the question is not about darts or DartLead."""

# Routing is easy, so the cheaper Lite model is enough.
# name: the step's name in Langfuse, so it survives a provider switch (default is the class name).
model = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", name="pick-sources")
structured = model.with_structured_output(Route)


@runnable
def chain(inputs: dict) -> Route:
    # Built per call so the prompt is the Langfuse one (SDK-cached). Callers keep chain.invoke({"question": ...}).
    return (template("router", SYSTEM_PROMPT, human="{question}") | structured).invoke(inputs)


def main() -> None:
    question = " ".join(sys.argv[1:]) or "Do I need a double to finish?"
    with propagate_attributes(trace_name="classify-question", tags=["phase-1"]):
        route = chain.invoke(
            {"question": question},
            config={"callbacks": [CallbackHandler()], "run_name": "classify-question"},
        )
    print(repr(route))
    get_client().shutdown()  # short-lived script: send queued traces before exiting
