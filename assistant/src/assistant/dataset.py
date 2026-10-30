# Phase 5: evals/agent_cases.json is the source of truth; this copies it into a Langfuse Dataset, which
# experiments run against so Langfuse can compare runs (scores, cost, latency) case by case.
import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # before Langfuse reads its keys

from langfuse import get_client  # noqa: E402

CASES = Path(__file__).parents[2] / "evals" / "agent_cases.json"
DATASET = "dartlead-assistant"


def load_cases() -> list[dict]:
    return json.loads(CASES.read_text(encoding="utf-8"))


def case_input(case: dict) -> dict:
    # One place for what an item's input carries, so synced items and local runs cannot drift apart.
    return {"question": case["question"], "history": case.get("history", []), "page": case.get("page")}


def main() -> None:
    langfuse = get_client()
    cases = load_cases()
    langfuse.create_dataset(name=DATASET, description="DartLead assistant eval cases (assistant/evals/agent_cases.json)")
    for c in cases:
        # The case id is the item id, so syncing again updates items instead of adding duplicates.
        langfuse.create_dataset_item(
            dataset_name=DATASET,
            id=c["id"],
            input=case_input(c),
            expected_output=c["expected"],
            metadata={"type": c["type"], "source": c["source"]},
        )
    langfuse.flush()
    items = langfuse.get_dataset(DATASET).items
    print(f"{len(cases)} cases synced; dataset {DATASET!r} has {len(items)} items")
