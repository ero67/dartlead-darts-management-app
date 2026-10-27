# Phase 1: run the router on every question in evals/router_cases.json and report pass/fail.
import json
import sys
from pathlib import Path

from langfuse import get_client, propagate_attributes
from langfuse.langchain import CallbackHandler

from assistant.router import chain  # importing router loads .env first

CASES = Path(__file__).parents[2] / "evals" / "router_cases.json"


def main() -> None:
    cases = json.loads(CASES.read_text(encoding="utf-8"))
    failures = 0
    for case in cases:
        # Same trace name as normal runs; the tag keeps eval traffic filterable in Langfuse.
        with propagate_attributes(trace_name="classify-question", tags=["phase-1", "router-eval"]):
            route = chain.invoke(
                {"question": case["question"]},
                config={"callbacks": [CallbackHandler()], "run_name": "classify-question"},
            )
        # Sets, because order doesn't matter: ["rules", "stats"] == ["stats", "rules"].
        ok = set(route.sources) == set(case["sources"]) and set(route.players) == set(case["players"])
        failures += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {case['question']}")
        if not ok:
            print(f"      expected sources={case['sources']} players={case['players']}")
            print(f"      got      sources={route.sources} players={route.players}")
    print(f"\n{len(cases) - failures}/{len(cases)} passed")
    get_client().shutdown()  # short-lived script: send queued traces before exiting
    sys.exit(1 if failures else 0)  # non-zero exit lets CI fail the build later
