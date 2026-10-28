# Phase 3: score the stats agent on evals/stats_cases.json, tool path and answer separately.
# Expected numbers come from the app's pages or independent SQL (see each case's "source"), not from the tools.
import json
import re
import sys
from pathlib import Path

from langfuse import get_client, propagate_attributes
from langfuse.langchain import CallbackHandler

from assistant.ask_stats import ask_stats  # importing loads .env

CASES = Path(__file__).parents[2] / "evals" / "stats_cases.json"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    cases = json.loads(CASES.read_text(encoding="utf-8"))
    tools_ok = answers_ok = 0
    for case in cases:
        with propagate_attributes(trace_name="ask-stats", tags=["phase-3", "stats-eval"]):
            result = ask_stats.invoke(case["question"], config={"callbacks": [CallbackHandler()], "run_name": "ask-stats"})
        # Models differ in typography (’ vs ', non-breaking hyphens); normalise so the regexes see one form.
        answer = result["answer"].replace("’", "'").replace("‑", "-")

        # Tool path: every expected tool was called (order and repeats don't matter).
        path_ok = set(case["tools"]) <= set(result["tools"])
        # Answer: all expected facts present and none of the forbidden ones (shortcut: an LLM judge in Phase 5).
        ok = (all(re.search(p, answer, re.IGNORECASE) for p in case["must_include"])
              and not any(re.search(p, answer, re.IGNORECASE) for p in case.get("must_not_include", [])))
        tools_ok += path_ok
        answers_ok += ok

        print(f"{'T' if path_ok else 't'}{'A' if ok else 'a'}  {case['question']}")
        if not (path_ok and ok):
            print(f"      tools:  {result['tools']}  (expected {case['tools']})")
            print(f"      answer: {' '.join(answer.split())[:240]}")
    n = len(cases)
    print(f"\ntool path: {tools_ok}/{n}   answers: {answers_ok}/{n}   (T/A = pass, t/a = fail)")
    get_client().shutdown()  # short-lived script: send queued traces before exiting
    sys.exit(0 if tools_ok == answers_ok == n else 1)
