from assistant import stats


class Query:
    """Ignores filters and returns `rows` as they are."""

    def __init__(self, rows):
        self.rows = rows

    def __getattr__(self, name):
        return lambda *args, **kwargs: self

    def execute(self):
        self.data = self.rows
        return self


def test_cleared_match_average_is_missing_not_zero(monkeypatch):
    # An admin stats clear zeroes match_player_stats.average; that is "no data", not a 0.0 average.
    tables = {
        "players": {"id": "p1", "name": "P1"},
        "matches": [{"id": "m1", "tournament_id": "t1", "winner_id": "p1", "player1_id": "p1", "player1_legs": 2,
                     "player2_legs": 0, "is_playoff": False, "game_type": "x01", "completed_at": "2026-10-10T19:00:00",
                     "updated_at": None, "m1": None, "d1": None, "m2": None, "d2": None,
                     "player1": {"name": "P1"}, "player2": {"name": "P2"}}],
        "match_player_stats": [{"match_id": "m1", "average": 0}],
    }

    class Db:
        def table(self, name):
            return Query(tables[name])

    monkeypatch.setattr(stats, "db", Db)
    monkeypatch.setattr(stats, "_tournaments", lambda player_id: {"t1": "Round 1"})
    assert stats.get_recent_matches("p1")["matches"][0]["average"] is None
