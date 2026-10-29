# Practice summary and form trend: pure helpers tested directly, the db-facing functions with a recording fake. No network.
from datetime import datetime, timedelta, timezone

import pytest

from assistant import stats, winprob


class FakeTable:
    """Stands in for stats.db(): every query method returns itself, execute() returns the rows of the table."""

    def __init__(self, tables=None):
        self.tables, self.calls, self.name = tables or {}, [], None

    def table(self, name):
        self.calls.append(name)
        self.name = name
        return self

    def __getattr__(self, method):  # select / eq / order / range / limit ...
        return lambda *args, **kwargs: self

    def execute(self):
        rows = self.tables.get(self.name, [])
        return type("Result", (), {"data": rows, "count": len(rows)})()


def session(avg, day, **extra):
    return {"game": "x01", "finished_at": f"2026-10-{day:02d}T10:00:00+00:00", "stats": {"average": avg, **extra}}


def test_not_signed_in(monkeypatch):
    db = FakeTable()
    monkeypatch.setattr(stats, "db", lambda: db)
    assert stats.get_my_practice() == {"signed_in": False}
    assert db.calls == []


def test_trend_halves_and_bests():
    rows = [session(a, d) for a, d in [(40, 1), (42, 2), (50, 3), (52, 4)]]
    x01 = stats._practice_summary(rows, None)["games"]["x01"]
    assert x01["trend"] == {"older_half": 41.0, "newer_half": 51.0}
    assert x01["best"] == 52


def test_odd_count_middle_goes_to_newer_half():
    rows = [session(a, d) for a, d in [(10, 1), (20, 2), (30, 3)]]
    assert stats._practice_summary(rows, None)["games"]["x01"]["trend"] == {"older_half": 10.0, "newer_half": 25.0}


def test_best_covers_sessions_outside_the_window():
    rows = [session(80, 1), session(40, 20), session(42, 21)]
    since = datetime(2026, 10, 10, tzinfo=timezone.utc)
    x01 = stats._practice_summary(rows, None, since)["games"]["x01"]
    assert (x01["sessions"], x01["best"]) == (2, 80)


def test_x01_best_ignores_sessions_under_nine_darts():
    rows = [session(120, 1, totalDarts=3), session(45, 2, totalDarts=60)]
    assert stats._practice_summary(rows, None)["games"]["x01"]["best"] == 45


def test_aroundtheclock_lower_is_better():
    rows = [{"game": "aroundTheClock", "finished_at": f"2026-10-0{d}T10:00:00+00:00", "stats": {"avgDartsPerTarget": v}}
            for d, v in [(1, 3.0), (2, 2.5)]]
    atc = stats._practice_summary(rows, None)["games"]["aroundTheClock"]
    assert atc["lower_is_better"] is True and atc["best"] == 2.5
    assert stats._practice_summary([session(40, 1)], None)["games"]["x01"]["lower_is_better"] is False


def checkout(day, hardest):
    return {"game": "checkout", "finished_at": f"2026-10-{day:02d}T10:00:00+00:00",
            "stats": {"hitPercent": 30, "hardest": hardest}}


def test_hardest_counts():
    rows = [checkout(1, [40, 32]), checkout(2, [32, 16]), checkout(3, [32])]
    assert stats._practice_summary(rows, None)["games"]["checkout"]["weak_spots"] == [
        {"target": 32, "count": 3}, {"target": 40, "count": 1}, {"target": 16, "count": 1}]


def test_hardest_items_as_the_app_stores_them():
    # checkoutTrainer.js stores {target, misses}; aroundTheClock.js {target, darts} (1 dart = no trouble)
    rows = [checkout(1, [{"target": 40, "misses": 2}]), checkout(2, [{"target": 40, "misses": 1}])]
    assert stats._practice_summary(rows, None)["games"]["checkout"]["weak_spots"] == [{"target": 40, "count": 2}]
    atc = [{"game": "aroundTheClock", "finished_at": "2026-10-01T10:00:00+00:00",
            "stats": {"avgDartsPerTarget": 2, "hardest": [{"target": 7, "darts": 5}, {"target": 3, "darts": 1}]}}]
    assert stats._practice_summary(atc, None)["games"]["aroundTheClock"]["weak_spots"] == [{"target": 7, "count": 1}]


def test_x01_vs_matches():
    rows = [session(45, 1, firstNineAverage=50, checkoutPercent=20)]
    x01 = stats._practice_summary(rows, {"average": 55.1, "checkout_percent": 30.0})["games"]["x01"]
    assert x01["practice"] == {"first_nine_average": 50.0, "checkout_percent": 20.0}
    assert x01["matches"] == {"average": 55.1, "checkout_percent": 30.0}
    assert "matches" not in stats._practice_summary(rows, None)["games"]["x01"]


def test_days_capped_at_a_year(monkeypatch):
    now = datetime.now(timezone.utc)
    rows = [{"game": "x01", "finished_at": (now - timedelta(days=d)).isoformat(), "stats": {"average": 40}}
            for d in (300, 400)]
    monkeypatch.setattr(stats, "db", lambda: FakeTable({"practice_sessions": rows, "players": []}))
    token = stats._user_id.set("user-1")
    try:
        result = stats.get_my_practice(days=1000)
    finally:
        stats._user_id.reset(token)
    assert result["days"] == 365
    assert result["games"]["x01"]["sessions"] == 1  # the 400-day-old one is outside the window


def history(n, start=datetime(2026, 10, 25, tzinfo=timezone.utc)):
    # newest first, one match every 3 days; score 100 / 6 darts = 50 average, improving by 1 point per match
    return [{"score": 100 + (n - i) * 2, "darts": 6, "at": (start - timedelta(days=3 * i)).isoformat(),
             "won": i % 2 == 0, "opponent_id": "x"} for i in range(n)]


def test_form_change_and_months():
    h = history(25)
    form = stats._form(h, 20)
    assert form["form"]["current"] == round(winprob.player_strength(h), 1)
    assert form["form"]["before"] == round(winprob.player_strength(h[20:]), 1)  # 20 matches ago
    assert form["form"]["change"] == round(winprob.player_strength(h) - winprob.player_strength(h[20:]), 1)
    months = form["monthly_averages"]
    assert [m["month"] for m in months] == ["2026-08", "2026-09", "2026-10"]  # newest last
    aug = [m for m in h if m["at"].startswith("2026-08")]
    assert months[0]["average"] == round(sum(m["score"] for m in aug) / sum(m["darts"] for m in aug) * 3, 1)
    assert sum(m["matches"] for m in months) == 25


def test_monthly_averages_keep_the_newest_six():
    h = history(30, start=datetime(2026, 10, 25, tzinfo=timezone.utc))
    h = [{**m, "at": (datetime(2026, 10, 25, tzinfo=timezone.utc) - timedelta(days=31 * i)).isoformat()} for i, m in enumerate(h)]
    months = stats._form(h, 20)["monthly_averages"]
    assert len(months) == 6 and months[-1]["month"] == "2026-10"


def test_form_without_enough_history():
    assert stats._form([], 20) == {"matches": 0}
    assert stats._form(history(5), 20)["form"]["before"] is None


def test_form_caps_matches_at_60(monkeypatch):
    monkeypatch.setattr(stats, "db", lambda: FakeTable({"players": {"id": "p", "name": "Peter"}}))
    seen = []
    monkeypatch.setattr(stats, "recent_match_totals",
                        lambda ids, per_player, **kw: seen.append(per_player) or {"p": history(10)})
    result = stats.get_player_form("p", matches=200)
    assert result["window"] == 60 and result["player"] == "Peter"
    assert seen == [60 + winprob.HISTORY_MATCHES]
