# Phase 3: the stats functions as LangChain tools. The model only reads each tool's name, docstring and
# argument types (sent as JSON Schema), so the docstrings below are prompts, written for the model.
import json
import os
import sys
from typing import Literal

from langchain_core.tools import tool
from langchain_core.utils.function_calling import convert_to_openai_tool
from langchain_openai import ChatOpenAI
from langfuse import get_client, propagate_attributes
from langfuse.langchain import CallbackHandler

from assistant import stats  # importing loads .env


@tool(parse_docstring=True)
def find_player(name: str) -> list[dict]:
    """Look up DartLead players by name. Call this first whenever a question names a player, because
    the other tools need the player's id. Accents and small typos are fine ("Kucera" finds "Kučera").

    Returns candidates best first, each with id, name and a match score from 0 to 1. If two or more
    candidates score about the same, ask the user which one they mean instead of picking one.
    An empty list means no player has that name.

    Args:
        name: The player's name in its basic form (nominative): full name, first name or last name.
            Slovak questions decline names, so convert them first: "Jána Nováka", "Jánovi Novákovi" and
            "s Jánom Novákom" are all "Ján Novák"; "Zuzany Kollárovej" is "Zuzana Kollárová".
    """
    return stats.find_player(name)


@tool(parse_docstring=True)
def get_player_stats(player_id: str, last_n: int | None = None) -> dict:
    """Get a player's darts statistics from completed DartLead matches: matches, wins, losses, legs,
    3-dart average, best match average, highest checkout, darts thrown, 180s, checkout percentage and
    high-score counts (visits of 80+, 95+, 133+, 170+ and 180).

    Average, checkouts, darts and high scores count X01 matches only; wins and legs count every game.
    A null value means there is no data for it, not zero.

    Args:
        player_id: The id from find_player. Never guess it.
        last_n: Only the player's most recent N matches, for questions about recent form. Leave it out for career stats.
    """
    return stats.get_player_stats(player_id, last_n=last_n)


@tool(parse_docstring=True)
def get_recent_matches(player_id: str, n: int = 5) -> dict:
    """List a player's most recent completed matches, newest first: date, tournament, opponent, won or
    lost, legs score, whether it was a playoff match, and the player's 3-dart average (X01) or marks per
    round (Cricket). Use it for questions about specific matches ("who did he play last?", "did she win
    her last match?"); use get_player_stats for totals and averages over many matches.

    Args:
        player_id: The id from find_player. Never guess it.
        n: How many matches, newest first (default 5).
    """
    return stats.get_recent_matches(player_id, n)


@tool(parse_docstring=True)
def get_head_to_head(player_id: str, opponent_id: str | None = None) -> dict:
    """Get a player's record against each opponent over all completed matches: matches, wins, losses,
    legs won and lost, already counted. Use it for "who beat X the most", "who has X beaten most often",
    or the record between two players. Read the counts from the result; do not count matches yourself.

    Args:
        player_id: The id from find_player. Never guess it.
        opponent_id: Another player's id from find_player, to get only the record between these two.
            Leave it out to get every opponent.
    """
    return stats.get_head_to_head(player_id, opponent_id)


@tool(parse_docstring=True)
def find_league(name: str) -> list[dict]:
    """Look up DartLead leagues by name. Call this first whenever a question names a league, because
    get_league_standings needs the league's id. Returns candidates best first with id, name and a match
    score from 0 to 1. If several score about the same, ask which league is meant. An empty list means
    there is no league with that name that the user can see.

    Args:
        name: The league's name as the user wrote it, or part of it.
    """
    return stats.find_league(name)


@tool(parse_docstring=True)
def get_league_standings(league_id: str) -> dict:
    """Get a league's table for the current season, top first: position, player, points, tournaments
    played, best and average placement, and legs won:lost. Players are ranked by points, then leg
    difference, then legs won, as in the app. Use it for "who leads the league", a player's position,
    or the points gap between players.

    Args:
        league_id: The id from find_league. Never guess it.
    """
    return stats.get_league_standings(league_id)


@tool
def get_me() -> dict:
    """Find out who the user is: whether they are signed in, the DartLead players linked to their account,
    and how many tournaments they manage. Call this first whenever the question says "I", "me", "my" or
    "mine" (my average, my best tournament, my tournaments). If no player is linked, ask the user for their
    player name and use find_player.
    """
    return stats.get_me()


@tool(parse_docstring=True)
def list_tournaments(mine: bool = False, player_id: str | None = None, league_id: str | None = None,
                     status: str | None = None) -> dict:
    """List tournaments newest first (up to 10) with name, date, status and league, plus the total count.
    Use it for "what tournaments do I have", "which tournaments did X play", "what is running now".

    Args:
        mine: Only tournaments the signed-in user created and manages ("my tournaments" for a manager).
        player_id: Only tournaments this player played in (id from find_player or get_me).
        league_id: Only the rounds of this league (id from find_league).
        status: Only this status: "started" (running) or "completed".
    """
    return stats.list_tournaments(mine=mine, player_id=player_id, league_id=league_id, status=status)


@tool(parse_docstring=True)
def find_tournament(name: str) -> list[dict]:
    """Look up tournaments by name. Call this first whenever a question names a tournament, because
    get_tournament_summary needs its id. Returns candidates best first with id, name, date, status, league_id and a
    match score (two leagues can share a name: league_id tells their rounds apart); league rounds have similar names ("… – 3. kolo"), so use the date or round number to pick,
    and ask the user if it is still unclear.

    Args:
        name: The tournament's name as the user wrote it, or part of it.
    """
    return stats.find_tournament(name)


@tool(parse_docstring=True)
def get_tournament_summary(tournament_id: str) -> dict:
    """Get one tournament's result, as on its summary page: date, status, players, the podium (places 1-3)
    and the X01 awards: best tournament average, the top 5 tournament averages, best single-match average
    (with the opponent), highest checkout and most 180s. Ties list every player. Use it for "who won X",
    "highest match average in X", "who threw the most 180s in X". It covers ONE tournament: for records across
    tournaments or players use get_records, never this tool once per tournament.

    Args:
        tournament_id: The id from find_tournament or list_tournaments. Never guess it.
    """
    return stats.get_tournament_summary(tournament_id)


@tool(parse_docstring=True)
def get_player_tournaments(player_id: str) -> dict:
    """Get every tournament a player played, newest first: placing (1-3, or the league's recorded
    placement), wins and losses, tournament average, best match average, highest checkout and 180s.
    Use it for "my best tournament", "how did X do in each round", "which tournaments did X win".
    "Best" can mean best placing or highest tournament average: say which one you used.

    Args:
        player_id: The id from find_player or get_me. Never guess it.
    """
    return stats.get_player_tournaments(player_id)


@tool(parse_docstring=True)
def get_records(stat: Literal["checkouts", "180s", "match_average", "average"], min_checkout: int | None = None,
                league_id: str | None = None, limit: int = 10) -> dict:
    """Get records across every tournament (or one league), counted from all completed X01 matches, best first.
    Use it for app-wide questions: "who has hit a 170", "who has the most 180s", "highest match average ever",
    "best average in the league". One call answers them; never loop over tournaments instead.

    Args:
        stat: "checkouts" (highest checkout per player), "180s" (total per player), "match_average" (best
            single-match averages, with opponent and tournament) or "average" (overall average, 5+ matches).
        min_checkout: With stat "checkouts": only checkouts of at least this value, and how many times each player
            hit one (e.g. 170 for "who hit a 170", 100 for "ton-plus checkouts").
        league_id: Only this league's tournaments (id from find_league). Leave it out for every tournament.
        limit: How many rows to return (default 10).
    """
    return stats.get_records(stat, min_checkout=min_checkout, league_id=league_id, limit=limit)


@tool(parse_docstring=True)
def list_leagues(mine: bool = False) -> dict:
    """List the leagues the user can see, with name, status and season. Use it for "which leagues are
    there" or when the user asks about "a league" without naming it.

    Args:
        mine: Only leagues the signed-in user created.
    """
    return stats.list_leagues(mine=mine)


@tool(parse_docstring=True)
def get_my_practice(game: Literal["x01", "checkout", "oneTwentyOne", "aroundTheClock", "cricket"] | None = None,
                    days: int = 30) -> dict:
    """Get the signed-in user's OWN practice sessions (Practice in the app), summarised per game: how many
    sessions, the main number's mean, its trend (older half vs newer half of the period) and the all-time
    best. Main numbers: x01 average, checkout hitPercent, oneTwentyOne successPercent, aroundTheClock
    avgDartsPerTarget (lower is better, see lower_is_better) and cricket mpr. Checkout and Around the Clock also
    list weak_spots (targets missed most, with how many sessions they showed up in); x01 puts the practice
    numbers next to the match numbers of the user's linked player. Use it for "how is my practice going",
    "what should I practise".

    Practice is private: this works only for the signed-in user and only about themselves. If the question is
    about another player's practice, do not call it; say that practice is private. If the result says
    signed_in is false, tell the user to sign in to see their practice. If games is empty, there were no practice
    sessions in that period: say so and suggest a longer days, do not guess. Sessions too short to count (as in
    the app's Personal bests) are left out of the mean, trend and best: sessions is how many sessions the game had
    in the period and sessions_counted is how many of them count towards the numbers. A game whose sessions are
    all older than the period stays in games with sessions 0 (its best still covers everything). first_session and
    last_session are the dates of the period's first and last session.

    Args:
        game: Only this game. Leave it out for every game that has sessions.
        days: How many days back the mean, trend and weak spots cover (default 30, at most 365). The best
            always covers all sessions.
    """
    return stats.get_my_practice(game, days)


@tool(parse_docstring=True)
def get_player_form(player_id: str, matches: int = 20) -> dict:
    """Get how a player's X01 form has moved, with the same form rating the app uses for its form and win
    chances: the rating now, the rating `matches` matches ago and the change, the plain average and win-loss
    record over the last `matches` matches, and the player's average per calendar month (up to 6, newest last).
    Use it for "is X improving", "how is X's form", "has X got better this year". It is X01 only. before and
    change are null when there are not at least 20 earlier matches to compare with: say there is not enough
    history to compare, and use the plain average and the monthly averages instead.

    Args:
        player_id: The id from find_player or get_me. Never guess it.
        matches: How many recent matches the comparison spans (default 20, at most 60).
    """
    return stats.get_player_form(player_id, matches)


@tool(parse_docstring=True)
def get_match_preview(match_id: str | None = None, player_id: str | None = None, opponent_id: str | None = None,
                      legs_to_win: int = 3) -> dict:
    """Preview a match with the app's own win chance (the % the app shows before a match), each player's form
    rating, the head-to-head record and each player's last 5 results. Use it for "who is favourite", "what are
    the chances", "preview this match". Each player in players has win_chance (their chance of winning the match)
    and leg_win_chance, already formatted like the app ("63%", "<1%"): give these strings as they are, never
    work out or estimate a chance yourself. head_to_head wins and legs are the first player's (players[0]).
    If the user is on a match page, pass its match_id. For a match in progress the chance uses the current legs.
    When win_chance is null, read note and say why: a finished match, a Cricket match (the model is X01-only)
    or a player with no X01 matches.

    Args:
        match_id: The match's id, when the user is on a match page or you were given one. Leave it out for two players.
        player_id: With opponent_id, the first player's id from find_player.
        opponent_id: With player_id, the second player's id from find_player.
        legs_to_win: Legs needed to win, only when you pass two players (default 3); a match id carries its own.
    """
    return stats.get_match_preview(match_id, player_id, opponent_id, legs_to_win)


@tool(parse_docstring=True)
def get_round_recap(tournament_id: str) -> dict:
    """Get the facts for a short league group-chat post about one round (tournament): its summary (podium, best
    averages, highest checkout, most 180s), the total number of 180s, the round's biggest upset (the winner with
    the lowest win chance beforehand, under 40%, with the score and that chance as a string such as "23%": give it
    as it is) and, for a league round, the top 3
    of the league table. Use it for "write a recap / summary post of round X". The facts here are all you may use:
    do not add results, numbers or players that are not in the result. The league top 3 is the table as it is now.
    A null biggest_upset means no match was an upset; say nothing about one.

    Args:
        tournament_id: The id from find_tournament or list_tournaments. Never guess it.
    """
    return stats.get_round_recap(tournament_id)


TOOLS = [find_player, get_player_stats, get_recent_matches, get_head_to_head, find_league, get_league_standings,
         get_me, list_tournaments, find_tournament, get_tournament_summary, get_player_tournaments, get_records, list_leagues,
         get_my_practice, get_player_form, get_match_preview, get_round_recap]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    # What the model receives for each tool: name, description and a JSON Schema of the arguments.
    print(json.dumps(convert_to_openai_tool(get_player_stats), indent=2, ensure_ascii=False))

    model = ChatOpenAI(model=os.environ["ANSWER_MODEL"], base_url="https://openrouter.ai/api/v1",
                       api_key=os.environ["OPENROUTER_API_KEY"], name="pick-tools")
    # bind_tools sends the schemas with every request. Nothing runs: we only look at what the model asks for.
    model_with_tools = model.bind_tools(TOOLS)
    questions = sys.argv[1:] or [
        "What is Igor Benko's average?",
        "How has Kucera played in his last 5 matches?",
        "How many 180s does Peter have?",
        "Who invented darts?",
    ]
    for question in questions:
        with propagate_attributes(trace_name="plan-tool-calls", tags=["phase-3"]):
            reply = model_with_tools.invoke(question, config={"callbacks": [CallbackHandler()], "run_name": "plan-tool-calls"})
        print(f"\nQ: {question}")
        print(f"   tool calls: {[(c['name'], c['args']) for c in reply.tool_calls] or 'none'}")
        if reply.content:
            print(f"   text: {' '.join(reply.content.split())[:200]}")
    get_client().shutdown()  # short-lived script: send queued traces before exiting
