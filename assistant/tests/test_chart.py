# Chart data: the stats functions behind each chart are faked, so only the shaping and the guards are tested. No network.
from datetime import datetime, timedelta, timezone

import pytest

from assistant import stats
from assistant.tools import TOOLS, show_chart

A, B = "a" * 36, "b" * 36


class FakeDb:
    """stats.db() for the name lookups: .single() returns the one row of the table."""

    def __init__(self, **rows):
        self.rows, self.name = rows, None

    def table(self, name):
        self.name = name
        return self

    def __getattr__(self, method):
        return lambda *args, **kwargs: self

    def execute(self):
        return type("Result", (), {"data": self.rows[self.name]})()


def match(score, darts, day):
    return {"score": score, "darts": darts, "at": f"2026-10-{day:02d}T10:00:00+00:00", "won": True, "opponent_id": B}


def fake_form(monkeypatch, matches, seen=None):
    monkeypatch.setattr(stats, "db", lambda: FakeDb(players={"name": "Erik"}))

    def totals(ids, per_player):
        if seen is not None:
            seen.append(per_player)
        return {A: matches}
    monkeypatch.setattr(stats, "recent_match_totals", totals)


def test_form_is_oldest_first_with_match_averages(monkeypatch):
    fake_form(monkeypatch, [match(300, 15, 5), match(150, 6, 3), match(360, 18, 1)])  # newest first
    result = stats.chart("form", player_id=A)
    assert (result["kind"], result["chart"], result["stat"], result["subject"]) == ("line", "form", "average", "Erik")
    assert [p["value"] for p in result["points"]] == [60.0, 75.0, 60.0]
    assert [p["label"] for p in result["points"]] == ["2026-10-01", "2026-10-03", "2026-10-05"]


def test_form_keeps_only_20_matches(monkeypatch):
    seen = []
    fake_form(monkeypatch, [match(300, 15, 1)] * 3, seen)
    stats.chart("form", player_id=A)
    assert seen == [20]


def test_too_few_points_is_an_error(monkeypatch):
    fake_form(monkeypatch, [match(300, 15, 2), match(360, 18, 1)])
    assert "error" in stats.chart("form", player_id=A)


def records(rows):
    return lambda stat, league_id=None, limit=10, **_: {"stat": stat, "records": rows[:limit]}


def test_ranking_180s_top_8(monkeypatch):
    monkeypatch.setattr(stats, "get_records", records([{"player": f"P{i}", "180s": 20 - i} for i in range(12)]))
    result = stats.chart("ranking", stat="180s")
    assert (result["kind"], result["chart"], result["subject"]) == ("bars", "ranking", None)
    assert len(result["points"]) == 8
    assert result["points"][0] == {"label": "P0", "value": 20}


def test_ranking_checkouts_uses_highest(monkeypatch):
    monkeypatch.setattr(stats, "get_records", records([{"player": f"P{i}", "highest": 100 + i, "checkouts": 1} for i in range(3)]))
    assert [p["value"] for p in stats.chart("ranking", stat="checkouts")["points"]] == [100, 101, 102]


def test_ranking_match_average_uses_average(monkeypatch):
    monkeypatch.setattr(stats, "get_records", records([{"player": f"P{i}", "average": 60.5 + i} for i in range(3)]))
    assert stats.chart("ranking", stat="match_average")["points"][0]["value"] == 60.5


def test_ranking_points_needs_a_league():
    assert "error" in stats.chart("ranking", stat="points")


def test_ranking_points_from_standings(monkeypatch):
    table = {"league": "Pub League", "standings": [{"player": f"P{i}", "points": 30 - i} for i in range(10)]}
    monkeypatch.setattr(stats, "get_league_standings", lambda league_id: table)
    result = stats.chart("ranking", stat="points", league_id="l1")
    assert (result["subject"], len(result["points"])) == ("Pub League", 8)


def test_ranking_names_the_league_for_other_stats(monkeypatch):
    monkeypatch.setattr(stats, "db", lambda: FakeDb(leagues={"name": "Pub League"}))
    monkeypatch.setattr(stats, "get_records", records([{"player": f"P{i}", "180s": i + 1} for i in range(3)]))
    assert stats.chart("ranking", stat="180s", league_id="l1")["subject"] == "Pub League"


def test_ranking_passes_records_error_on(monkeypatch):
    monkeypatch.setattr(stats, "get_records", lambda *a, **k: {"error": "Unknown stat 'x'"})
    assert stats.chart("ranking", stat="x") == {"error": "Unknown stat 'x'"}


def practice_rows(monkeypatch, rows, user="user-1"):
    monkeypatch.setattr(stats, "_all_rows", lambda build: rows)
    token = stats._user_id.set(user)
    return token


def session(game, value, days_ago, **extra):
    at = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    key = stats.PRACTICE_METRICS[game][0]
    return {"game": game, "finished_at": at, "stats": {key: value, **extra}}


def test_practice_needs_sign_in():
    assert "error" in stats.chart("practice", game="x01")


def test_practice_leaves_out_short_old_and_unfinished_sessions(monkeypatch):
    rows = [session("x01", 40, 200, totalDarts=30),  # outside the 90 day window
            session("x01", 41, 30, totalDarts=30), session("x01", 42, 20, totalDarts=30),
            session("x01", 99, 10, totalDarts=3),  # under nine darts
            {"game": "x01", "finished_at": None, "stats": {"average": 50, "totalDarts": 30}},  # unfinished
            session("x01", 43, 5, totalDarts=30)]
    token = practice_rows(monkeypatch, rows)
    try:
        result = stats.chart("practice", game="x01")
    finally:
        stats._user_id.reset(token)
    assert (result["kind"], result["chart"], result["stat"], result["lower_is_better"]) == ("line", "practice", "average", False)
    assert [p["value"] for p in result["points"]] == [41, 42, 43]


def test_practice_around_the_clock_is_lower_is_better(monkeypatch):
    rows = [session("aroundTheClock", 3.5 - i / 10, 10 - i, targetsCompleted=20, targetsTotal=20) for i in range(3)]
    token = practice_rows(monkeypatch, rows)
    try:
        result = stats.chart("practice", game="aroundTheClock")
    finally:
        stats._user_id.reset(token)
    assert (result["stat"], result["lower_is_better"]) == ("avgDartsPerTarget", True)


def test_practice_percent_metric_has_unit(monkeypatch):
    rows = [session("checkout", 30 + i, 10 - i, attempts=12) for i in range(3)]
    token = practice_rows(monkeypatch, rows)
    try:
        result = stats.chart("practice", game="checkout")
    finally:
        stats._user_id.reset(token)
    assert (result["stat"], result["unit"]) == ("hitPercent", "%")


def test_head_to_head_rows(monkeypatch):
    record = {"opponent": "Jano", "matches": 4, "wins": 3, "losses": 1, "legs_won": 12, "legs_lost": 7}
    monkeypatch.setattr(stats, "get_head_to_head", lambda p, o: {"player": "Erik", "opponents": [record]})
    career = {A: {"player": "Erik", "average": 55.0, "checkout_percent": 30.0, "180s": 9},
              B: {"player": "Jano", "average": 50.5, "checkout_percent": 25.0, "180s": 4}}
    monkeypatch.setattr(stats, "get_player_stats", lambda pid: career[pid])
    result = stats.chart("head_to_head", player_id=A, opponent_id=B)
    assert (result["kind"], result["chart"], result["players"]) == ("versus", "head_to_head", ["Erik", "Jano"])
    assert result["rows"] == [
        {"stat": "wins", "scope": "direct", "a": 3, "b": 1}, {"stat": "legs", "scope": "direct", "a": 12, "b": 7},
        {"stat": "average", "scope": "career", "a": 55.0, "b": 50.5},
        {"stat": "checkout_percent", "scope": "career", "a": 30.0, "b": 25.0},
        {"stat": "180s", "scope": "career", "a": 9, "b": 4}]


def test_head_to_head_drops_a_null_row(monkeypatch):
    record = {"opponent": "Jano", "matches": 1, "wins": 1, "losses": 0, "legs_won": 3, "legs_lost": 1}
    monkeypatch.setattr(stats, "get_head_to_head", lambda p, o: {"player": "Erik", "opponents": [record]})
    career = {A: {"player": "Erik", "average": 55.0, "checkout_percent": 30.0, "180s": 9},
              B: {"player": "Jano", "average": 50.5, "checkout_percent": None, "180s": 4}}
    monkeypatch.setattr(stats, "get_player_stats", lambda pid: career[pid])
    rows = stats.chart("head_to_head", player_id=A, opponent_id=B)["rows"]
    assert "checkout_percent" not in [r["stat"] for r in rows]


def test_head_to_head_never_met_is_an_error(monkeypatch):
    monkeypatch.setattr(stats, "get_head_to_head", lambda p, o: {"player": "Erik", "opponents": []})
    assert "error" in stats.chart("head_to_head", player_id=A, opponent_id=B)


@pytest.mark.parametrize("args", [{"kind": "form"}, {"kind": "practice"}, {"kind": "ranking"},
                                  {"kind": "head_to_head", "player_id": A}, {"kind": "head_to_head", "player_id": A, "opponent_id": A},
                                  {"kind": "pie"}])
def test_missing_argument_is_an_error(args):
    assert "error" in stats.chart(**args)


def test_show_chart_is_a_tool():
    assert "show_chart" in {t.name for t in TOOLS}


def test_show_chart_passes_its_arguments(monkeypatch):
    seen = {}
    monkeypatch.setattr(stats, "chart", lambda *args, **kwargs: seen.update(args=args, kwargs=kwargs) or {"ok": True})
    result = show_chart.invoke({"kind": "head_to_head", "player_id": A, "opponent_id": B})
    assert result == {"ok": True}
    assert seen["args"] == ("head_to_head",)
    assert seen["kwargs"] == {"player_id": A, "opponent_id": B, "stat": None, "league_id": None, "game": None, "days": 90}
