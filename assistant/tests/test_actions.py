# Action drafts: db() is faked per table, so only the shaping and the guards are tested. No network.
import pytest

from assistant import actions, stats

L = "l" * 36
SETTINGS = {"legs_to_win": 3, "starting_score": 501, "game_type": "501", "default_scoring_mode": "x01",
            "group_settings": {"a": 1}, "playoff_settings": {"b": 2}, "tournament_type": "league"}


def round_row(id="t1", name="Kolo 5", starts_at="2026-10-30T19:00:00+00:00", venue="Pub"):
    return {"id": id, "name": name, "starts_at": starts_at, "venue": venue, **SETTINGS}


class FakeDb:
    def __init__(self, manager=True, **rows):
        self.manager, self.rows, self.name = manager, rows, None

    def rpc(self, name, params):
        assert (name, params) == ("can_manage_league", {"l_id": L})
        return type("R", (), {"execute": lambda s: type("D", (), {"data": self.manager})()})()

    def table(self, name):
        self.name = name
        return self

    def __getattr__(self, method):
        return lambda *args, **kwargs: self

    def execute(self):
        return type("Result", (), {"data": self.rows[self.name]})()


def fake(monkeypatch, **kw):
    kw.setdefault("leagues", [{"name": "Piatková liga"}])
    kw.setdefault("tournament_players", [])
    kw.setdefault("league_members", [])
    kw.setdefault("players", [])
    monkeypatch.setattr(stats, "db", lambda: FakeDb(**kw))
    monkeypatch.setattr(stats, "_demo", lambda: {"players": set()})
    monkeypatch.setattr(stats, "_user_id", type("V", (), {"get": lambda s: "u1"})())


def player(id, name):
    return {"id": id, "name": name}


def test_next_round_copies_settings_and_players(monkeypatch):
    fake(monkeypatch, tournaments=[round_row()], tournament_players=[{"players": player("p1", "Erik")}])
    draft = actions.next_round_draft(L)
    assert draft["settings"] == SETTINGS and draft["players"] == [player("p1", "Erik")]
    assert (draft["league"], draft["venue"], draft["copied_from"]["id"]) == ("Piatková liga", "Pub", "t1")


def test_next_round_date_is_last_plus_7_days(monkeypatch):
    fake(monkeypatch, tournaments=[round_row()])
    assert actions.next_round_draft(L)["starts_at"] == "2026-11-06T19:00:00+00:00"


def test_next_round_without_last_date_has_no_date(monkeypatch):
    fake(monkeypatch, tournaments=[round_row(starts_at=None)])
    assert actions.next_round_draft(L)["starts_at"] is None


def test_next_round_explicit_date_and_name_win(monkeypatch):
    fake(monkeypatch, tournaments=[round_row()])
    draft = actions.next_round_draft(L, "2026-12-01T18:00:00+00:00", "Finále")
    assert (draft["starts_at"], draft["name"]) == ("2026-12-01T18:00:00+00:00", "Finále")


@pytest.mark.parametrize("last,expected", [("Kolo 5", "Kolo 6"), ("Round 12", "Round 13"), ("Piatok", "Piatok 2")])
def test_next_round_name(monkeypatch, last, expected):
    fake(monkeypatch, tournaments=[round_row(name=last)])
    assert actions.next_round_draft(L)["name"] == expected


def test_next_round_uses_latest_round(monkeypatch):
    # The ordering and the deleted filter are the query's job: the draft takes the first row it gets.
    fake(monkeypatch, tournaments=[round_row("new", "Kolo 9"), round_row("old", "Kolo 1")])
    assert actions.next_round_draft(L)["copied_from"]["id"] == "new"


def test_next_round_without_previous_round_is_error(monkeypatch):
    fake(monkeypatch, tournaments=[])
    assert "error" in actions.next_round_draft(L)


def test_not_a_manager_is_error(monkeypatch):
    fake(monkeypatch, manager=False, tournaments=[round_row()])
    assert "error" in actions.next_round_draft(L)
    assert "error" in actions.add_members_draft(L, ["Erik"])


def members(monkeypatch, names, roster=None, members=None):
    fake(monkeypatch, league_members=[{"players": m} for m in members or []],
         players=roster if roster is not None else [player("p1", "Peter Novák")])
    return actions.add_members_draft(L, names)


def test_members_existing_new_and_already(monkeypatch):
    draft = members(monkeypatch, ["Peter Novak", "Eva Malá", "Marek"], members=[player("p2", "Eva Malá")])
    assert draft["existing"] == [player("p1", "Peter Novák")]
    assert (draft["already_members"], draft["new"]) == (["Eva Malá"], ["Marek"])


def test_members_ambiguous_name_is_error(monkeypatch):
    result = members(monkeypatch, ["Peter"], roster=[player("p1", "Peter Novák"), player("p3", "Peter Horváth")])
    assert "Peter Novák" in result["error"] and "Peter Horváth" in result["error"]


def test_members_nothing_to_add_is_error(monkeypatch):
    assert "error" in members(monkeypatch, ["Eva Malá"], members=[player("p2", "Eva Malá")])


def test_members_name_count_limits(monkeypatch):
    assert "error" in members(monkeypatch, [])
    assert "error" in members(monkeypatch, [f"N{i}" for i in range(21)])


@pytest.mark.parametrize("bad", ["", "   ", "x" * 101])
def test_members_blank_or_long_name_is_error(monkeypatch, bad):
    assert "error" in members(monkeypatch, ["Marek", bad])


def test_members_first_name_of_a_member_is_already(monkeypatch):
    roster = [player("p2", "Eva Malá")]
    draft = members(monkeypatch, ["Eva", "Marek"], roster=roster, members=[player("p2", "Eva Malá")])
    assert (draft["existing"], draft["already_members"], draft["new"]) == ([], ["Eva"], ["Marek"])


def test_members_member_outside_roster_is_already(monkeypatch):
    draft = members(monkeypatch, ["Eva Malá", "Marek"], members=[player("p9", "Eva Malá")])
    assert draft["already_members"] == ["Eva Malá"]


def test_members_weak_match_is_error_not_new(monkeypatch):
    result = members(monkeypatch, ["Jano"], roster=[player("p4", "Jan Kolár")])  # scores 0.86: close, not sure
    assert "Jan Kolár" in result["error"]


def test_members_duplicates_are_one_name(monkeypatch):
    draft = members(monkeypatch, ["Marek", "marek", " MAREK "])
    assert draft["new"] == ["Marek"]


def test_members_exact_full_name_beats_first_name_matches(monkeypatch):
    roster = [player("p1", "Peter Novák"), player("p3", "Peter")]
    assert members(monkeypatch, ["Peter"], roster=roster)["existing"] == [player("p3", "Peter")]


def test_members_demo_players_are_not_matched(monkeypatch):
    fake(monkeypatch, players=[player("d1", "Marek Demo")])
    monkeypatch.setattr(stats, "_demo", lambda: {"players": {"d1"}})
    assert actions.add_members_draft(L, ["Marek Demo"])["new"] == ["Marek Demo"]


def test_next_round_bad_date_is_error(monkeypatch):
    fake(monkeypatch, tournaments=[round_row()])
    assert "error" in actions.next_round_draft(L, "next friday")
    assert actions.next_round_draft(L, "2026-12-01")["starts_at"] == "2026-12-01"
