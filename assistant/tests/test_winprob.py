# The Python win model must give the JS model's numbers: winprob_cases.json is the JS run on fixed inputs
# (regenerate with `node assistant/tests/winprob_cases.mjs` from the repo root). No network.
import json
import re
from pathlib import Path

import pytest

from assistant import stats, winprob

CASES = json.loads((Path(__file__).parent / "winprob_cases.json").read_text())


def snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def assert_close(got, expected):
    if isinstance(expected, dict):
        assert got.keys() == expected.keys()
        for k in expected:
            assert_close(got[k], expected[k])
    elif isinstance(expected, list):
        assert len(got) == len(expected)
        for g, e in zip(got, expected):
            assert_close(g, e)
    elif isinstance(expected, float):
        assert abs(got - expected) < 1e-9
    else:
        assert got == expected


@pytest.mark.parametrize("case", CASES, ids=[f"{i}-{c['fn']}" for i, c in enumerate(CASES)])
def test_matches_js(case):
    if case["args"] is None:  # a constant
        return assert_close(getattr(winprob, case["fn"]), case["expected"])
    args = list(case["args"])
    # A trailing object is the JS options bag: camelCase keys become keyword arguments.
    kwargs = {snake(k): v for k, v in args.pop().items()} if args and isinstance(args[-1], dict) and case["fn"] != "biggestUpset" else {}
    assert_close(getattr(winprob, snake(case["fn"]))(*args, **kwargs), case["expected"])


def test_totals_from_rows():
    a, b, c = "a" * 36, "b" * 36, "c" * 36
    rows = [  # newest first, as the query returns them
        {"player1_id": a, "player2_id": b, "winner_id": a, "completed_at": "2026-10-02", "s1": 300, "d1": 30, "s2": 200, "d2": 27},
        {"player1_id": b, "player2_id": a, "winner_id": a, "completed_at": "2026-10-01", "s1": 150, "d1": 0, "s2": 270, "d2": 24},
        {"player1_id": a, "player2_id": c, "winner_id": c, "completed_at": "2026-09-30", "s1": 100, "d1": 12, "s2": 110, "d2": 12},
    ]
    got = stats._totals_from_rows(rows, [a, b], 2)
    assert got[a] == [
        {"score": 300, "darts": 30, "at": "2026-10-02", "won": True, "opponent_id": b},
        {"score": 270, "darts": 24, "at": "2026-10-01", "won": True, "opponent_id": b},
    ]
    # b's second match has darts == 0 (dropped), and c was not asked for.
    assert got[b] == [{"score": 200, "darts": 27, "at": "2026-10-02", "won": False, "opponent_id": a}]
    assert c not in got
    # per_player=1 keeps only the newest.
    assert [r["at"] for r in stats._totals_from_rows(rows, [a], 1)[a]] == ["2026-10-02"]
