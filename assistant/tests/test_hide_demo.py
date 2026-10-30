import pytest

from assistant import stats

DEMO = {"leagues": {"demo-league"}, "tournaments": {"demo-round"}, "players": {"demo-player"}}


class Query:
    """Records filters; `rows` are returned as they are, so a test sees what the code does with them."""

    def __init__(self, rows, log):
        self.rows, self.log = rows, log
        self.not_ = self
        self.count = len(rows)

    def __getattr__(self, name):
        def method(*args, **kwargs):
            self.log.append((name, args))
            return self
        return method

    def execute(self):
        self.data = self.rows
        return self


@pytest.fixture
def fake(monkeypatch):
    log, tables = [], {}

    class Db:
        def table(self, name):
            log.append(("table", (name,)))
            return Query(tables.get(name, []), log)

    monkeypatch.setattr(stats, "db", Db)
    monkeypatch.setattr(stats, "_demo", lambda: DEMO)
    return tables, log


def test_find_player_skips_demo_players(fake):
    tables, _ = fake
    tables["players"] = [{"id": "demo-player", "name": "Igor Benko"}, {"id": "real", "name": "Igor Novak"}]
    assert [p["id"] for p in stats.find_player("Igor")] == ["real"]


def test_find_tournament_skips_demo_rounds(fake):
    tables, _ = fake
    row = {"status": "completed", "starts_at": None, "created_at": "2026-10-01", "league_id": None}
    tables["tournaments"] = [{**row, "id": "demo-round", "name": "Liga 4. kolo"}, {**row, "id": "real", "name": "Liga 4. kolo"}]
    assert [t["id"] for t in stats.find_tournament("Liga 4. kolo")] == ["real"]


@pytest.mark.parametrize("call", [lambda: stats.find_league("Demo"), lambda: stats.list_leagues()])
def test_leagues_are_filtered_by_the_flag(fake, call):
    _, log = fake
    call()
    assert ("eq", ("is_demo", False)) in log


def test_list_tournaments_hides_demo_rounds(fake):
    _, log = fake
    stats.list_tournaments()
    assert ("in_", ("id", ["demo-round"])) in log


def test_list_tournaments_of_a_league_keeps_them(fake):
    _, log = fake
    stats.list_tournaments(league_id="demo-league")
    assert ("in_", ("id", ["demo-round"])) not in log


def test_records_hide_demo_rounds(fake):
    _, log = fake
    stats.get_records("180s")
    assert ("in_", ("id", ["demo-round"])) in log


def test_records_of_a_league_keep_them(fake):
    _, log = fake
    stats.get_records("180s", league_id="demo-league")
    assert ("eq", ("league_id", "demo-league")) in log
    assert ("in_", ("id", ["demo-round"])) not in log


def test_demo_is_cached(monkeypatch):
    calls = []

    class Db:
        def table(self, name):
            calls.append(name)
            return Query([], [])

    monkeypatch.setattr(stats, "db", Db)
    monkeypatch.setattr(stats, "_demo_cache", None)
    assert stats._demo() == {"leagues": set(), "tournaments": set(), "players": set()}
    stats._demo()
    assert calls == ["leagues"]  # no demo league: nothing more to read, and the second call is the cache
