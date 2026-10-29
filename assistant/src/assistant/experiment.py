# Phase 5: run the whole assistant on the Langfuse dataset and score every answer, so runs can be compared
# case by case in Langfuse (scores, cost, latency).
#   uv run experiment baseline                 -> every case, as a run of the dataset
#   uv run experiment judge-check rag-01,off-01 -> only these cases, a local run (not linked to the dataset)
import os
import re
import sys
import uuid
from collections import defaultdict

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langfuse import Evaluation, get_client
from langfuse.langchain import CallbackHandler
from pydantic import BaseModel, Field

from assistant.agent import ask, graph  # importing loads .env
from assistant.dataset import DATASET, load_cases

# A different model family from the answer model, so the judge does not favour its own style.
# shortcut: Flash-Lite keeps a 61-case run at a few cents; move to a stronger judge if calibration shows misgrades.
JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "google/gemini-3.5-flash-lite")


def task(*, item, **_):
    """Ask the case's question (after replaying its history in the same thread) and keep what the agent saw."""
    data = item["input"] if isinstance(item, dict) else item.input
    config = {"configurable": {"thread_id": str(uuid.uuid4())}, "callbacks": [CallbackHandler()]}
    for turn in data.get("history", []):
        ask.invoke(turn, config=config)
    result = ask.invoke(data["question"], config=config)
    messages = graph.get_state(config).values["messages"]
    return {
        "answer": result["answer"],
        "tools": result["tools"],
        "sections": [f"{d.metadata['source']} > {d.metadata.get('section')}" for d in result["docs"]],
        # The evidence the answer may rely on: retrieved chunks and every tool result in the conversation
        # (a follow-up can answer from an earlier turn's results without calling a tool again).
        "evidence": [d.page_content for d in result["docs"]]
                    + [f"{m.name} -> {m.content}" for m in messages if isinstance(m, ToolMessage)],
    }


# --- Deterministic checks: cheap, exact, and silent when a case doesn't define them --------------------------

def _text(output) -> str:
    # Models differ in typography (’ vs ', non-breaking hyphens); normalise so the regexes see one form.
    return output["answer"].replace("’", "'").replace("‑", "-")


def tool_path(*, output, expected_output, **_):
    want = expected_output.get("tools")
    if not want:
        return []
    ok = set(want) <= set(output["tools"])
    return Evaluation(name="tool_path", value=float(ok), comment=None if ok else f"called {output['tools']}, expected {want}")


def retrieval(*, output, expected_output, **_):
    want = expected_output.get("sections")
    if not want:
        return []
    ok = any(s in output["sections"] for s in want)
    return Evaluation(name="retrieval", value=float(ok), comment=None if ok else f"retrieved {output['sections']}")


def keywords(*, output, expected_output, **_):
    must, must_not = expected_output.get("must_include", []), expected_output.get("must_not_include", [])
    if not (must or must_not):
        return []
    text = _text(output)
    missing = [p for p in must if not re.search(p, text, re.IGNORECASE)]
    forbidden = [p for p in must_not if re.search(p, text, re.IGNORECASE)]
    ok = not (missing or forbidden)
    return Evaluation(name="keywords", value=float(ok), comment=None if ok else f"missing {missing}, forbidden {forbidden}")


# --- LLM judge: what regexes can't see (meaning, behaviour, made-up facts) ------------------------------------

class Verdict(BaseModel):
    correctness: int = Field(ge=1, le=5, description="1-5 against the reference, see the rubric")
    behavior_ok: bool = Field(description="True if the assistant did what the expected behaviour asks")
    grounded: bool = Field(description="True if every factual claim is supported by the evidence or the reference")
    language_ok: bool = Field(description="True if the answer is in the language of the user's question")
    reason: str = Field(description="One or two sentences: what is wrong, or why it is right")


JUDGE_PROMPT = """You grade answers of the DartLead assistant (an app for darts tournaments and leagues).

Compare the ASSISTANT ANSWER with the REFERENCE ANSWER and the EVIDENCE the assistant had.
- correctness (1-5): 5 = every fact and number in the reference is present and correct and nothing is wrong;
  4 = correct with a minor omission; 3 = partly correct or an important omission; 2 = mostly wrong;
  1 = wrong, missing or invented. Numbers must match (rounding to one decimal is fine); wording may differ;
  extra correct detail is fine. When the expected behaviour is not "answer", give 5 if it did that behaviour and
  invented nothing (a polite redirect to what it can help with counts as not knowing); lower only if it guessed.
- behavior_ok, for the EXPECTED BEHAVIOUR: answer = it answers; ask = it asks a clarifying question instead of
  guessing; answer_or_ask = either answers (covering every reasonable reading) or asks which is meant; refuse = it politely declines an off-topic request; dont_know = it says it does not know or the docs do
  not cover it, inventing nothing; not_found = it says it cannot find what was named (offering similar items that
  do exist, or asking which one is meant, is fine).
- grounded: false if the answer states facts, numbers, benchmarks or opinions-as-facts that neither the evidence
  nor the reference supports (for example "elite players average 40%"). Asking a question or declining is grounded.
- language_ok: the answer is in the same language as the user's question (names may stay as they are).
Be strict about numbers and invented facts, lenient about wording and formatting."""

# max_tokens: a verdict is ~200 tokens; without a cap a looping judge once wrote 65,521 tokens ($0.16 for one call).
judge = ChatOpenAI(model=JUDGE_MODEL, base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"],
                   name="judge", max_tokens=1000).with_structured_output(Verdict)


def llm_judge(*, input, output, expected_output, **_):
    history = "".join(f"Earlier user message: {h}\n" for h in input.get("history", []))
    evidence = "\n---\n".join(output["evidence"])[:8000] or "(none)"
    verdict = judge.invoke([SystemMessage(JUDGE_PROMPT), HumanMessage(
        f"{history}QUESTION: {input['question']}\nEXPECTED BEHAVIOUR: {expected_output['behavior']}\n"
        f"REFERENCE ANSWER: {expected_output['answer']}\n\nEVIDENCE:\n{evidence}\n\nASSISTANT ANSWER:\n{output['answer']}")])
    return [Evaluation(name="correctness", value=verdict.correctness, comment=verdict.reason),
            Evaluation(name="behavior", value=float(verdict.behavior_ok)),
            Evaluation(name="grounded", value=float(verdict.grounded)),
            Evaluation(name="language", value=float(verdict.language_ok))]


# --- Run level: one number per metric, plus "passed" (every check of the case is good) -------------------------

def _passed(evaluations) -> bool:
    scores = {e.name: e.value for e in evaluations}
    return scores.get("correctness", 0) >= 4 and all(v == 1 for k, v in scores.items() if k != "correctness")


def averages(*, item_results, **_):
    values = defaultdict(list)
    for r in item_results:
        for e in r.evaluations:
            values[e.name].append(e.value)
    return [Evaluation(name=f"avg_{name}", value=round(sum(v) / len(v), 3)) for name, v in values.items()] + [
        Evaluation(name="pass_rate", value=round(sum(_passed(r.evaluations) for r in item_results) / len(item_results), 3))]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    run_name = sys.argv[1] if len(sys.argv) > 1 else "baseline"
    only = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None
    langfuse = get_client()
    kwargs = dict(name="dartlead-assistant", run_name=run_name, task=task, evaluators=[tool_path, retrieval, keywords, llm_judge],
                  run_evaluators=[averages], max_concurrency=2,  # free-tier router and embedding rate limits
                  metadata={"answer_model": os.environ["ANSWER_MODEL"], "judge_model": JUDGE_MODEL})
    if only:  # a quick local run on chosen cases
        cases = [c for c in load_cases() if c["id"] in only]
        result = langfuse.run_experiment(data=[{"input": {"question": c["question"], "history": c.get("history", [])},
                                                "expected_output": c["expected"], "metadata": {"type": c["type"], "id": c["id"]}}
                                               for c in cases], **kwargs)
    else:
        result = langfuse.get_dataset(DATASET).run_experiment(**kwargs)

    by_type = defaultdict(lambda: [0, 0])
    for r in result.item_results:
        meta = (r.item.get("metadata") if isinstance(r.item, dict) else r.item.metadata) or {}
        by_type[meta.get("type", "?")][0] += _passed(r.evaluations)
        by_type[meta.get("type", "?")][1] += 1
        if not _passed(r.evaluations):
            question = (r.item["input"] if isinstance(r.item, dict) else r.item.input)["question"]
            print(f"\nFAIL {meta.get('id') or getattr(r.item, 'id', '')}: {question}")
            for e in r.evaluations:
                if e.value != 1 and not (e.name == "correctness" and e.value >= 4):
                    print(f"   {e.name}={e.value}  {e.comment or ''}")
            print(f"   answer: {' '.join(r.output['answer'].split())[:240]}" if r.output else "   (task failed)")
    print("\npassed by type: " + ", ".join(f"{t} {p}/{n}" for t, (p, n) in sorted(by_type.items())))
    print("run: " + ", ".join(f"{e.name}={e.value}" for e in result.run_evaluations))
    langfuse.flush()
