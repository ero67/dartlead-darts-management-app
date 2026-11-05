# Action drafts: db() is faked per table, so only the shaping and the guards are tested. The proposal tools pause
# a tiny graph with an in-memory checkpointer. No network.
import json

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableLambda
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.errors import GraphInterrupt
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

from assistant import actions, agent, prompts, stats
from assistant.ask_stats import run_tool

L = "l" * 36
SETTINGS = {"legs_to_win": 3, "starting_score": 501, "game_type": "501", "default_scoring_mode": "x01",
            "group_settings": {"a": 1}, "playoff_settings": {"b": 2}, "tournament_type": "league"}


def round_row(id="t1", name="Kolo 5", starts_at="2026-10-30T19:00:00+01:00", venue="Pub"):
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
    assert actions.next_round_draft(L)["starts_at"] == "2026-11-06T19:00:00+01:00"


@pytest.mark.parametrize("last, expected", [
    ("2026-10-23T19:00:00+02:00", "2026-10-30T19:00:00+01:00"),  # summer time ends on 25 October
    ("2026-03-27T19:00:00+01:00", "2026-04-03T19:00:00+02:00"),  # and starts on 29 March
    ("2026-10-23T17:00:00+00:00", "2026-10-30T19:00:00+01:00"),  # a UTC value is read in Bratislava time
])
def test_next_round_date_keeps_the_local_time_across_dst(monkeypatch, last, expected):
    fake(monkeypatch, tournaments=[round_row(starts_at=last)])
    assert actions.next_round_draft(L)["starts_at"] == expected


@pytest.mark.parametrize("last, given, expected", [
    ("2026-10-30T18:30:00+00:00", "2026-11-13", "2026-11-13T19:30:00+01:00"),  # the last round's local time of day
    (None, "2026-11-13", "2026-11-13T19:00:00+01:00"),  # no last date: 19:00
    (None, "2026-11-13T18:00:00", "2026-11-13T18:00:00+01:00"),  # no offset: Bratislava, not UTC
    (None, "2026-07-03 18:00", "2026-07-03T18:00:00+02:00"),
    (None, "2026-12-01T18:00:00+00:00", "2026-12-01T19:00:00+01:00"),  # an offset is kept as the same moment
])
def test_next_round_given_date_gets_a_time_and_an_offset(monkeypatch, last, given, expected):
    fake(monkeypatch, tournaments=[round_row(starts_at=last)])
    assert actions.next_round_draft(L, given)["starts_at"] == expected


def test_next_round_without_last_date_has_no_date(monkeypatch):
    fake(monkeypatch, tournaments=[round_row(starts_at=None)])
    assert actions.next_round_draft(L)["starts_at"] is None


def test_next_round_explicit_date_and_name_win(monkeypatch):
    fake(monkeypatch, tournaments=[round_row()])
    draft = actions.next_round_draft(L, "2026-12-01T18:00:00+01:00", "Finále")
    assert (draft["starts_at"], draft["name"]) == ("2026-12-01T18:00:00+01:00", "Finále")


@pytest.mark.parametrize("last,expected", [
    ("Kolo 5", "Kolo 6"), ("Round 12", "Round 13"), ("Demo Liga Šípky – 4. kolo", "Demo Liga Šípky – 5. kolo"),
    ("Round 12 Finals", "Round 13 Finals"), ("Piatok", "Piatok 2"),
    ("7.kolo Testovacia liga 3", "8.kolo Testovacia liga 3"),  # the number next to "kolo", not the part number
    ("Demo Liga – 4. kolo", "Demo Liga – 5. kolo"), ("Kolo 5 (2026)", "Kolo 6 (2026)"), ("Piatok 3", "Piatok 4"),
    ("2. KOLA liga 9", "3. KOLA liga 9"), ("Runda 4, sezóna 2", "Runda 5, sezóna 2"),
    ("Sezóna 2026 Kolo 5", "Sezóna 2026 Kolo 6"), ("Liga 2 kolo 7", "Liga 2 kolo 8"), ("2026 Round 3", "2026 Round 4"),
    ("3.kolo 2026", "4.kolo 2026"), ("X 10. kolo 2026", "X 11. kolo 2026"), ("4. kolo 2. časť", "5. kolo 2. časť"),
])
def test_next_round_name(monkeypatch, last, expected):
    fake(monkeypatch, tournaments=[round_row(name=last)])
    assert actions.next_round_draft(L)["name"] == expected


def test_next_round_without_list_has_no_new_players(monkeypatch):
    fake(monkeypatch, tournaments=[round_row()], tournament_players=[{"players": player("p1", "Erik")}])
    assert actions.next_round_draft(L)["new_players"] == []


def listed(monkeypatch, names, new=None, members=(), roster=(), include_last_round=False):
    fake(monkeypatch, tournaments=[round_row()], tournament_players=[{"players": player("p0", "Last Round")}],
         league_members=[{"players": m} for m in members], players=list(roster))
    return actions.next_round_draft(L, players=names, new_players=new, include_last_round=include_last_round)


def test_next_round_last_round_plus_an_existing_player(monkeypatch):
    draft = listed(monkeypatch, ["Eva Malá"], roster=[player("p2", "Eva Malá")], include_last_round=True)
    assert (draft["players"], draft["new_players"]) == ([player("p0", "Last Round"), player("p2", "Eva Malá")], [])


def test_next_round_last_round_plus_a_new_player(monkeypatch):
    draft = listed(monkeypatch, [], ["Zoltán Neznámy"], include_last_round=True)
    assert (draft["players"], draft["new_players"]) == ([player("p0", "Last Round")], ["Zoltán Neznámy"])


def test_next_round_last_round_player_listed_again_is_not_duplicated(monkeypatch):
    draft = listed(monkeypatch, ["Last Round", "Eva Malá"], members=[player("p0", "Last Round")],
                   roster=[player("p2", "Eva Malá")], include_last_round=True)
    assert draft["players"] == [player("p0", "Last Round"), player("p2", "Eva Malá")]


def test_next_round_list_replaces_last_round(monkeypatch):
    draft = listed(monkeypatch, ["Peter Novak", "eva"], members=[player("p1", "Peter Novák")], roster=[player("p2", "Eva Malá")])
    assert (draft["players"], draft["new_players"]) == ([player("p1", "Peter Novák"), player("p2", "Eva Malá")], [])


def test_next_round_member_wins_over_roster(monkeypatch):
    # "Peter" is clear among the league's members, though the roster has two Peters.
    draft = listed(monkeypatch, ["Peter"], members=[player("p1", "Peter Novák")],
                   roster=[player("p1", "Peter Novák"), player("p3", "Peter Horváth")])
    assert draft["players"] == [player("p1", "Peter Novák")]


def test_next_round_member_with_nickname_matches(monkeypatch):
    draft = listed(monkeypatch, ["Peter Novák"], members=[player("p1", 'Peter " Rýchly " Novák')])
    assert draft["players"] == [player("p1", 'Peter " Rýchly " Novák')]


def test_next_round_lists_every_unclear_name_at_once(monkeypatch):
    result = listed(monkeypatch, ["Peter", "Jano", "Zoltán Neznámy", "Eva Malá"],
                    roster=[player("p1", "Peter Novák"), player("p3", "Peter Horváth"), player("p4", "Jan Kolár"),
                            player("p2", "Eva Malá")])
    for text in ('"Peter"', "Peter Novák", "Peter Horváth", '"Jano"', "Jan Kolár", '"Zoltán Neznámy"'):
        assert text in result["error"]
    assert "Eva" not in result["error"]


def test_next_round_confirmed_new_players(monkeypatch):
    draft = listed(monkeypatch, ["Eva Malá", "eva malá"], ["Zoltán Neznámy", "Peter Novák"], members=[player("p1", "Peter Novák")],
                   roster=[player("p2", "Eva Malá"), player("p5", "Zoltán Neznámy st.")])
    # A confirmed new name skips matching, unless it is exactly a member's.
    assert draft["players"] == [player("p1", "Peter Novák"), player("p2", "Eva Malá")]
    assert draft["new_players"] == ["Zoltán Neznámy"]


def test_next_round_exact_roster_name_with_close_member_asks(monkeypatch):
    # Never the close member silently; the exact non-member only when no member matches too.
    result = listed(monkeypatch, ["Petr Novák"], members=[player("p1", "Peter Novák")], roster=[player("p2", "Petr Novák")])
    assert "Petr Novák or Peter Novák" in result["error"]
    draft = listed(monkeypatch, ["Petr Novák"], members=[player("p1", "Pavol Malý")], roster=[player("p2", "Petr Novák")])
    assert draft["players"] == [player("p2", "Petr Novák")]


def test_next_round_exact_non_member_with_member_match_asks(monkeypatch):
    result = listed(monkeypatch, ["Katka"], members=[player("p1", "Katka Nová")], roster=[player("p2", "Katka")])
    assert "Katka or Katka Nová" in result["error"]


def test_next_round_kept_players_are_matched_first(monkeypatch):
    # "Peter" is clear among the last round's players, though the roster has another Peter.
    fake(monkeypatch, tournaments=[round_row()], tournament_players=[{"players": player("p0", "Peter Novák")}],
         players=[player("p3", "Peter Horváth"), player("p0", "Peter Novák")])
    assert "error" in actions.next_round_draft(L, players=["Peter"])  # without the last round: two Peters
    draft = actions.next_round_draft(L, players=["Peter"], include_last_round=True)
    assert draft["players"] == [player("p0", "Peter Novák")]


def test_next_round_kept_players_count_towards_the_cap(monkeypatch):
    fake(monkeypatch, tournaments=[round_row()], tournament_players=[{"players": player(f"k{i}", f"K{i}")} for i in range(60)])
    assert "error" in actions.next_round_draft(L, new_players=[f"N{i}" for i in range(5)], include_last_round=True)
    assert len(actions.next_round_draft(L, new_players=[f"N{i}" for i in range(4)], include_last_round=True)["new_players"]) == 4


def test_next_round_member_wins_only_equal_scores(monkeypatch):
    # "Peter" scores 0.95 for both: the member. Against "Pieter Kováč" (0.91) the member's lead is too small: ask.
    draft = listed(monkeypatch, ["Peter"], members=[player("p1", "Peter Novák")], roster=[player("p3", "Peter Kováč")])
    assert draft["players"] == [player("p1", "Peter Novák")]
    result = listed(monkeypatch, ["Peter"], members=[player("p1", "Peter Novák")], roster=[player("p3", "Pieter Kováč")])
    assert "Pieter Kováč" in result["error"]


def test_next_round_two_names_for_one_player_is_unclear(monkeypatch):
    result = listed(monkeypatch, ["Peter Novák", "Peter"], members=[player("p1", "Peter Novák")])
    assert '"Peter": the same player as "Peter Novák"' in result["error"]


def test_next_round_first_name_prefix_asks(monkeypatch):
    result = listed(monkeypatch, ["Martin"], roster=[player("p1", "Martina Malá")])
    assert "Martina Malá" in result["error"]


def test_next_round_new_name_equal_after_accents_is_existing(monkeypatch):
    draft = listed(monkeypatch, [], ["Jozef Kral"], roster=[player("p1", "Jozef Kráľ")])
    assert (draft["players"], draft["new_players"]) == ([player("p1", "Jozef Kráľ")], [])


def test_next_round_same_name_stored_twice_takes_the_first(monkeypatch):
    draft = listed(monkeypatch, ["Tomas Novak", "Ivan"], roster=[player("p1", "Tomáš Novák"), player("p2", "Tomáš Novák"),
                                                                 player("p3", "Ivan Malý"), player("p4", "Ivan Malý")])
    assert draft["players"] == [player("p1", "Tomáš Novák"), player("p3", "Ivan Malý")]


def test_next_round_list_limits(monkeypatch):
    assert "error" in listed(monkeypatch, [f"A{i}" for i in range(40)], [f"B{i}" for i in range(25)])
    assert "error" in listed(monkeypatch, ["Marek", "  "])
    assert "error" in listed(monkeypatch, ["x" * 101])
    assert len(listed(monkeypatch, [], [f"B{i}" for i in range(64)])["new_players"]) == 64


def test_rank_ignores_a_nickname_between_names():
    rows = [player("p1", 'Peter " Rýchly " Novák'), player("p2", "Petra Nováková")]
    assert stats._rank("Peter Novak", rows, 2)[0] == {"id": "p1", "name": 'Peter " Rýchly " Novák', "match": 0.9}
    assert all(r["id"] != "p1" for r in stats._rank("Peter Kováč", rows, 2))  # every query word must be in the name


def test_members_nickname_is_existing_not_new(monkeypatch):
    draft = members(monkeypatch, ["Peter Novák"], roster=[player("p1", 'Peter " Rýchly " Novák')])
    assert (draft["existing"], draft["new"]) == ([player("p1", 'Peter " Rýchly " Novák')], [])


def test_members_two_names_for_one_player_is_unclear(monkeypatch):
    result = members(monkeypatch, ["Peter Novák", "Peter"])
    assert '"Peter": the same player as "Peter Novák"' in result["error"]


def test_members_first_name_prefix_asks(monkeypatch):
    assert "Martina Malá" in members(monkeypatch, ["Martin"], roster=[player("p1", "Martina Malá")])["error"]


def test_members_lists_every_unclear_name_at_once(monkeypatch):
    result = members(monkeypatch, ["Peter", "Jano"], roster=[player("p1", "Peter Novák"), player("p3", "Peter Horváth"),
                                                             player("p4", "Jan Kolár")])
    assert all(n in result["error"] for n in ("Peter Horváth", "Jan Kolár"))


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


def test_members_near_miss_in_new_names_becomes_new(monkeypatch):
    fake(monkeypatch, league_members=[], players=[player("p1", "Marek Kováč")])
    assert "error" in actions.add_members_draft(L, ["Marek Testovací"])
    draft = actions.add_members_draft(L, [], ["Marek Testovací"])
    assert (draft["new"], draft["existing"]) == (["Marek Testovací"], [])


def test_members_new_name_equal_to_a_member_is_already(monkeypatch):
    fake(monkeypatch, league_members=[{"players": player("p2", "Eva Malá")}], players=[])
    draft = actions.add_members_draft(L, ["Marek"], ["Eva Malá"])
    assert (draft["already_members"], draft["new"]) == (["Eva Malá"], ["Marek"])


def test_members_dedupe_across_both_lists(monkeypatch):
    fake(monkeypatch, league_members=[], players=[])
    draft = actions.add_members_draft(L, ["marek"], [" Marek "])
    assert draft["new"] == ["Marek"]


def test_members_blank_new_name_is_error(monkeypatch):
    fake(monkeypatch, league_members=[], players=[])
    assert "error" in actions.add_members_draft(L, ["Marek"], ["  "])


def test_members_limit_counts_both_lists(monkeypatch):
    fake(monkeypatch, league_members=[], players=[])
    assert "error" in actions.add_members_draft(L, [f"A{i}" for i in range(10)], [f"B{i}" for i in range(11)])
    assert "new" in actions.add_members_draft(L, [f"A{i}" for i in range(10)], [f"B{i}" for i in range(10)])


def test_next_round_bad_date_is_error(monkeypatch):
    fake(monkeypatch, tournaments=[round_row()])
    assert "error" in actions.next_round_draft(L, "next friday")
    assert actions.next_round_draft(L, "2026-12-01")["starts_at"] == "2026-12-01T19:00:00+01:00"


DRAFT = {"league": "Piatková liga", "name": "Kolo 6"}
DONE = {"status": "done", "tournament_id": "t2"}


def call(name="propose_next_round", id="c1", **args):
    return {"name": name, "args": {"league_id": L, **args}, "id": id, "type": "tool_call"}


def tools_graph(monkeypatch, draft=DRAFT):
    """The agent's tools node alone, with a checkpointer so it can pause and resume."""
    monkeypatch.setattr(actions, "next_round_draft", lambda *args: draft)
    builder = StateGraph(agent.State)
    builder.add_node("tools", agent.call_tools)
    builder.add_edge(START, "tools")
    builder.add_edge("tools", END)
    return builder.compile(checkpointer=InMemorySaver()), {"configurable": {"thread_id": "t"}}


def run(graph, config, *calls, actions=True):
    return graph.invoke({"messages": [AIMessage("", tool_calls=list(calls))], "actions": actions}, config)


def test_action_tools_only_with_capability(monkeypatch):
    names = lambda llm: {t["function"]["name"] for t in llm.kwargs["tools"]}  # noqa: E731
    actions_only = {"propose_next_round", "propose_add_league_members"}
    assert actions_only <= names(agent.model_with_actions) and not actions_only & names(agent.model_with_tools)
    monkeypatch.setattr(prompts, "_skip_until", float("inf"))
    used = []
    for name in ("model_with_tools", "model_with_actions"):
        monkeypatch.setattr(agent, name, RunnableLambda(lambda prompt, name=name: used.append(name) or AIMessage("")))
    for actions_on in (False, True):
        agent.call_agent({"messages": [HumanMessage("q")], "docs": [], "sources": ["stats"], "language": "English",
                          "actions": actions_on})
    assert used == ["model_with_tools", "model_with_actions"]


def test_tool_pauses_with_the_draft(monkeypatch):
    graph, config = tools_graph(monkeypatch)
    run(graph, config, call())
    assert [i.value for i in graph.get_state(config).interrupts] == [{"action": "propose_next_round", "draft": DRAFT}]


def test_resume_value_is_the_tool_result(monkeypatch):
    graph, config = tools_graph(monkeypatch)
    run(graph, config, call())
    state = graph.invoke(Command(resume=DONE), config)
    assert json.loads(state["messages"][-1].content) == DONE and not graph.get_state(config).interrupts


def test_error_draft_does_not_pause(monkeypatch):
    graph, config = tools_graph(monkeypatch, {"error": "No previous round."})
    state = run(graph, config, call())
    assert "No previous round." in state["messages"][-1].content and not graph.get_state(config).interrupts


def test_resume_wins_over_a_draft_that_no_longer_builds(monkeypatch):
    # After "done" the members are already in the league, so the re-run tool builds an error draft.
    graph, config = tools_graph(monkeypatch)
    run(graph, config, call())
    monkeypatch.setattr(actions, "next_round_draft", lambda *args: {"error": "Nothing to add."})
    assert json.loads(graph.invoke(Command(resume=DONE), config)["messages"][-1].content) == DONE


def test_resume_wins_over_a_draft_that_raises(monkeypatch):
    # A failing read while the draft is rebuilt must not turn the app's finished write into an error.
    graph, config = tools_graph(monkeypatch)
    run(graph, config, call())

    def raises(*args):
        raise RuntimeError("network down")

    monkeypatch.setattr(actions, "next_round_draft", raises)
    assert json.loads(graph.invoke(Command(resume=DONE), config)["messages"][-1].content) == DONE


def test_draft_that_raises_does_not_pause(monkeypatch):
    graph, config = tools_graph(monkeypatch)
    monkeypatch.setattr(actions, "next_round_draft", lambda *args: 1 / 0)
    assert "division by zero" in run(graph, config, call())["messages"][-1].content
    assert not graph.get_state(config).interrupts


def test_one_proposal_per_turn(monkeypatch):
    graph, config = tools_graph(monkeypatch)
    run(graph, config, call(id="c1"), call(id="c2"))
    state = graph.invoke(Command(resume=DONE), config)
    assert json.loads(state["messages"][-2].content) == DONE and "one action" in state["messages"][-1].content


def test_proposal_without_capability_is_refused(monkeypatch):
    graph, config = tools_graph(monkeypatch)
    state = run(graph, config, call(), actions=False)
    assert "no tool called" in state["messages"][-1].content and not graph.get_state(config).interrupts


def test_run_tool_lets_the_pause_through():
    @tool
    def pauses() -> str:
        """Pauses."""
        raise GraphInterrupt(())

    @tool
    def breaks() -> str:
        """Breaks."""
        raise ValueError("boom")

    tools = {"pauses": pauses, "breaks": breaks}
    with pytest.raises(GraphInterrupt):
        run_tool({"name": "pauses", "args": {}, "id": "c1", "type": "tool_call"}, tools)
    result = run_tool({"name": "breaks", "args": {}, "id": "c2", "type": "tool_call"}, tools)
    assert isinstance(result, ToolMessage) and result.status == "error" and "boom" in result.content


def test_ask_reports_a_proposal(monkeypatch):
    def propose(state):
        return {"question": "next round", "sources": ["stats"], "docs": [], "messages": [AIMessage("", tool_calls=[call()])]}

    graph, _ = tools_graph(monkeypatch)
    builder = StateGraph(agent.State)
    builder.add_node("agent", propose)
    builder.add_node("tools", agent.call_tools)
    builder.add_edge(START, "agent")
    builder.add_edge("agent", "tools")
    builder.add_edge("tools", END)
    monkeypatch.setattr(agent, "graph", builder.compile(checkpointer=InMemorySaver()))
    result = agent.ask.invoke("Create the next round", config={}, actions=True)
    proposal = {"action": "propose_next_round", "draft": DRAFT}
    assert result["proposal"] == proposal and "propose_next_round" in result["tools"]
    assert result["answer"] == "PROPOSAL " + json.dumps(proposal, ensure_ascii=False)
