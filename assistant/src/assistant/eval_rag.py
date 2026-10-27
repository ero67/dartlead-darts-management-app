# Phase 2: score the RAG chain on evals/rag_cases.json, retrieval and answer separately.
import json
import re
import sys
from pathlib import Path

from langfuse import get_client, propagate_attributes
from langfuse.langchain import CallbackHandler

from assistant.answer import chain  # importing loads .env

CASES = Path(__file__).parents[2] / "evals" / "rag_cases.json"
UNKNOWN = re.compile(r"don't know|do not know|neviem|nevie", re.IGNORECASE)


def main() -> None:
    cases = json.loads(CASES.read_text(encoding="utf-8"))
    retrieval_hits = answers_ok = 0
    for case in cases:
        with propagate_attributes(trace_name="answer-question", tags=["phase-2", "rag-eval"]):
            result = chain.invoke(case["question"], config={"callbacks": [CallbackHandler()], "run_name": "answer-question"})
        found = [f"{d.metadata['source']} > {d.metadata.get('section')}" for d in result["docs"]]
        answer = result["answer"]

        # Retrieval: at least one of the expected sections is in the top k. Unknown cases have nothing to find.
        hit = case.get("unknown", False) or any(s in found for s in case["sections"])
        # Answer: crude keyword check (shortcut: an LLM judge replaces this in Phase 5).
        if case.get("unknown"):
            ok = bool(UNKNOWN.search(answer))
        else:
            ok = not UNKNOWN.search(answer) and all(re.search(p, answer, re.IGNORECASE) for p in case["must_include"])
        retrieval_hits += hit
        answers_ok += ok

        print(f"{'R' if hit else 'r'}{'A' if ok else 'a'}  {case['question']}")
        if not (hit and ok):
            print(f"      retrieved: {found}")
            print(f"      answer:    {' '.join(answer.split())[:220]}")
    n = len(cases)
    print(f"\nretrieval: {retrieval_hits}/{n}   answers: {answers_ok}/{n}   (R/A = pass, r/a = fail)")
    get_client().shutdown()  # short-lived script: send queued traces before exiting
    sys.exit(0 if retrieval_hits == answers_ok == n else 1)
