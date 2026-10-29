# Match preview and round recap: pure helpers tested directly, the db-facing functions with a recording fake. No network.
from assistant import stats, winprob


class FakeTable:
    """Stands in for stats.db(): every query method returns itself, execute() returns the rows of the table."""

    def __init__(self, tables=None):
        self.tables, self.queries, self.name = tables or {}, [], None

    def table(self, name):
        self.name = name
        return self

    def __getattr__(self, method):  # select / eq / single / in_ ...
        def record(*args, **kwargs):
            self.queries.append((self.name, method, args))
            return self
        return record

    def execute(self):
        rows = self.tables.get(self.name, [])
        return type("Result", (), {"data": rows, "count": len(rows)})()


def history(avg, n=10):
    return [{"score": avg * 2, "darts": 6, "at": f"2026-10-{20 - i:02d}T10:00:00+00:00", "won": True, "opponent_id": "x"}
            for i in range(n)]


A, B = {"id": "a", "name": "Anna"}, {"id": "b", "name": "Boris"}
HISTORIES = {"a": history(60), "b": history(45)}


def stub_preview(monkeypatch, match=None, histories=HISTORIES):
    db = FakeTable({"matches": match, "players": [A, B]})
    monkeypatch.setattr(stats, "db", lambda: db)
    monkeypatch.setattr(stats, "recent_match_totals", lambda ids, **kw: histories)
    monkeypatch.setattr(stats, "get_head_to_head", lambda p, o=None: {"player": "Anna", "opponents": [{"opponent": "Boris", "matches": 2}]})
    monkeypatch.setattr(stats, "get_recent_matches", lambda p, n=5: {"player": p, "matches": [{"result": "won"}]})
    return db


def match_row(**extra):
    return {"player1_id": "a", "player2_id": "b", "winner_id": None, "status": "pending", "player1_legs": 0,
            "player2_legs": 0, "legs_to_win": 3, "game_type": "x01", "player1": {"name": "Anna"},
            "player2": {"name": "Boris"}, **extra}


def test_preview_by_players(monkeypatch):
    stub_preview(monkeypatch)
    r = stats.get_match_preview(player_id="a", opponent_id="b")
    s1, s2 = winprob.player_strength(HISTORIES["a"]), winprob.player_strength(HISTORIES["b"])
    assert [p["strength"] for p in r["players"]] == [s1, s2]
    assert [p["matches_counted"] for p in r["players"]] == [10, 10]
    assert r["match_win_probability"] == winprob.match_win_probability(s1, s2, legs_to_win=3)
    assert r["leg_win_probability"] == winprob.leg_win_probability(s1, s2)
    assert r["match_win_probability"] > 0.5 and r["note"] is None
    assert r["head_to_head"]["matches"] == 2 and set(r["recent"]) == {"a", "b"}


def test_preview_by_match_in_progress(monkeypatch):
    stub_preview(monkeypatch, match_row(status="in_progress", player1_legs=2, player2_legs=1))
    r = stats.get_match_preview(match_id="m1")
    s1, s2 = winprob.player_strength(HISTORIES["a"]), winprob.player_strength(HISTORIES["b"])
    assert r["legs"] == [2, 1]
    assert r["match_win_probability"] == winprob.match_win_probability(s1, s2, legs_to_win=3, legs_a=2, legs_b=1)


def test_preview_missing_history(monkeypatch):
    stub_preview(monkeypatch, histories={"a": history(60)})
    r = stats.get_match_preview(player_id="a", opponent_id="b")
    assert r["match_win_probability"] is None and r["leg_win_probability"] is None
    assert "Boris" in r["note"] and "Anna" not in r["note"]
    assert r["players"][1]["strength"] is None and r["players"][0]["strength"] is not None


def test_preview_completed_match(monkeypatch):
    stub_preview(monkeypatch, match_row(status="completed", winner_id="b", player1_legs=1, player2_legs=3))
    monkeypatch.setattr(stats, "recent_match_totals", lambda *a, **k: (_ for _ in ()).throw(AssertionError("no history needed")))
    r = stats.get_match_preview(match_id="m1")
    assert r["match_win_probability"] is None
    assert "Boris" in r["note"] and "1:3" in r["note"]


def test_preview_cricket_match(monkeypatch):
    stub_preview(monkeypatch, match_row(game_type="cricket"))
    r = stats.get_match_preview(match_id="m1")
    assert r["match_win_probability"] is None and r["leg_win_probability"] is None
    assert "X01" in r["note"]


def test_preview_needs_players(monkeypatch):
    stub_preview(monkeypatch)
    assert "error" in stats.get_match_preview()
    assert "error" in stats.get_match_preview(player_id="a")


# --- recap -------------------------------------------------------------------------------------------------------

def rmatch(p1, p2, winner, legs, o1=0, o2=0, **extra):
    return {"player1_id": p1, "player2_id": p2, "winner_id": winner, "status": "completed", "player1_legs": legs[0],
            "player2_legs": legs[1], "legs_to_win": 3, "game_type": "x01", "player1": {"name": p1.upper()},
            "player2": {"name": p2.upper()}, "o1": o1, "o2": o2, "s1": 0, "d1": 0, "s2": 0, "d2": 0, "a1": None, "a2": None,
            "c1": None, "c2": None, **extra}


def stub_recap(monkeypatch, league_id="l1", game_type="x01"):
    tournament = {"starts_at": "2026-10-20T09:00:00+00:00", "created_at": "2026-10-01T09:00:00+00:00",
                  "league_id": league_id, "game_type": game_type}
    # a is far stronger than b: b beating a is the upset; c vs a is expected
    matches = [rmatch("a", "b", "b", (1, 3), o1=1, o2=2), rmatch("a", "c", "a", (3, 0), o1=1)]
    monkeypatch.setattr(stats, "db", lambda: FakeTable({"tournaments": tournament, "matches": matches}))
    monkeypatch.setattr(stats, "get_tournament_summary", lambda tid: {"tournament": "Round 3", "podium": []})
    seen = []
    monkeypatch.setattr(stats, "recent_match_totals", lambda ids, **kw: seen.append(kw) or
                        {"a": history(70), "b": history(40), "c": history(45)})
    monkeypatch.setattr(stats, "get_league_standings", lambda lid: {"standings": [{"position": i} for i in range(1, 6)]})
    return seen


def test_recap_with_league(monkeypatch):
    seen = stub_recap(monkeypatch)
    r = stats.get_round_recap("t1")
    assert seen == [{"before": "2026-10-20T09:00:00+00:00"}]  # strengths as they were before the round
    assert [e["position"] for e in r["league_top3"]] == [1, 2, 3]
    assert r["summary"]["tournament"] == "Round 3"
    assert r["total_180s"] == 4
    upset = r["biggest_upset"]
    assert (upset["winner"], upset["loser"], upset["score"]) == ("B", "A", "3:1") and upset["chance"] < 0.4


def test_recap_without_league(monkeypatch):
    stub_recap(monkeypatch, league_id=None)
    r = stats.get_round_recap("t1")
    assert r["league_top3"] is None
    assert r["total_180s"] == 4 and r["biggest_upset"] is not None and r["summary"]


def test_recap_falls_back_to_created_at(monkeypatch):
    seen = stub_recap(monkeypatch)
    stats.db().tables["tournaments"]["starts_at"] = None
    stats.get_round_recap("t1")
    assert seen == [{"before": "2026-10-01T09:00:00+00:00"}]


def test_recap_cricket_has_no_upset_or_180s(monkeypatch):
    stub_recap(monkeypatch, game_type="cricket")
    r = stats.get_round_recap("t1")
    assert r["biggest_upset"] is None and r["total_180s"] is None
