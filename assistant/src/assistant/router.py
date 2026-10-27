# Phase 1: decide where the answer to a question lives (rules, stats, app help, or nowhere).
import sys
from typing import Literal

from dotenv import load_dotenv

load_dotenv()  # before importing Langfuse, which reads its keys from the environment

from langchain_core.prompts import ChatPromptTemplate  # noqa: E402
from langchain_google_genai import ChatGoogleGenerativeAI  # noqa: E402
from langfuse import get_client, propagate_attributes  # noqa: E402
from langfuse.langchain import CallbackHandler  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402


class Route(BaseModel):
    """Where the answer to a DartLead question can be found."""

    # A list, not one label: "Peter needs 40, is D20 standard and how often does he hit doubles?" needs both.
    sources: list[Literal["rules", "stats", "app"]] = Field(
        description="Every source needed to answer the question. Empty if no source can answer it (off topic)."
    )
    players: list[str] = Field(description="Names of darts players mentioned in the question, exactly as written.")


SYSTEM_PROMPT = """You route questions sent to the assistant of DartLead, an app for running darts tournaments and leagues.

Sources:
- rules: how darts is played (scoring, busts, checkouts, game formats)
- stats: numbers about real players, matches or leagues stored in DartLead
- app: how to use the DartLead app itself

Pick every source the answer needs. Pick none if the question is not about darts or DartLead."""

prompt = ChatPromptTemplate.from_messages([("system", SYSTEM_PROMPT), ("human", "{question}")])
# Routing is easy, so the cheaper Lite model is enough.
# name: the step's name in Langfuse, so it survives a provider switch (default is the class name).
model = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", name="pick-sources")
chain = prompt | model.with_structured_output(Route)


def main() -> None:
    question = " ".join(sys.argv[1:]) or "Do I need a double to finish?"
    with propagate_attributes(trace_name="classify-question", tags=["phase-1"]):
        route = chain.invoke(
            {"question": question},
            config={"callbacks": [CallbackHandler()], "run_name": "classify-question"},
        )
    print(repr(route))
    get_client().shutdown()  # short-lived script: send queued traces before exiting
