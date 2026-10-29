# Phase 3: read live player stats from Supabase. Plain functions, no LLM: step 3 turns them into tools.
# The numbers follow getPlayerProfile in src/services/tournamentService.js, so the assistant agrees with the app.
import json
import os
import re
import sys
import unicodedata
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, datetime
from difflib import SequenceMatcher

from dotenv import load_dotenv
from supabase import Client, create_client

from assistant.winprob import HISTORY_MATCHES

load_dotenv()
# Every query runs as the caller: the chat service sets a client carrying the user's JWT (as_user), so RLS
# decides what the assistant can see, exactly as in the app. Scripts and evals fall back to anon, which sees
# what a visitor without an account sees.
_anon = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
_client: ContextVar[Client] = ContextVar("supabase_client", default=_anon)
_user_id: ContextVar[str | None] = ContextVar("user_id", default=None)  # who "me" / "my" means


def db() -> Client:
    return _client.get()


@contextmanager
def as_user(access_token: str, user_id: str | None = None):
    """Run the stats queries inside this block as the signed-in user with that Supabase access token."""
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
    client.postgrest.auth(access_token)
    tokens = _client.set(client), _user_id.set(user_id)
    try:
        yield
    finally:
        _client.reset(tokens[0])
        _user_id.reset(tokens[1])


HIGH_SCORE_BANDS = [80, 95, 133, 170, 180]  # same as src/utils/dartStats.js


def _norm(text: str) -> str:
    # "Ján Šťastný" -> "jan stastny": people type names without Slovak accents.
    return "".join(c for c in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(c))


def _rank(query: str, rows: list[dict], limit: int) -> list[dict]:
    # Best name matches first, with a 0-1 score; the caller decides what a tie means.
    query = _norm(query).strip()

    def score(row: dict) -> float:
        full = _norm(row["name"])
        words = full.split()
        if query == full:
            return 1.0
        if query in words:  # first or last name alone
            return 0.95
        if any(w.startswith(query) for w in words):  # "Pet" -> "Peter"
            return 0.9
        if " " in query and query in full:  # part of a longer name, "demo liga" -> "Demo Liga Šípky"
            return 0.9
        return max(SequenceMatcher(None, query, w).ratio() for w in [full, *words])  # typos, "Jano" -> "Jan"

    ranked = sorted(((score(r), r) for r in rows), key=lambda sr: sr[0], reverse=True)
    return [{"id": r["id"], "name": r["name"], "match": round(s, 2)} for s, r in ranked if s >= 0.75][:limit]


def find_player(name: str, limit: int = 5) -> list[dict]:
    """Players whose name is close to `name`, best match first. More than one result means: ask which one."""
    # shortcut: ranks every player name in Python (PostgREST returns at most 1000 rows); move to a
    # pg_trgm RPC when there are more players than that.
    return _rank(name, db().table("players").select("id, name").execute().data, limit)


def find_league(name: str, limit: int = 5) -> list[dict]:
    """Leagues the caller can see whose name is close to `name`, best match first."""
    return _rank(name, db().table("leagues").select("id, name").eq("deleted", False).execute().data, limit)


def _tournaments(player_id: str, league_id: str | None = None) -> dict[str, str]:
    # The player's tournaments as {id: name}. Soft-deleted ones don't count, like on the profile page;
    # with a league, only its current season (season_id IS NULL).
    links = db().table("tournament_players").select("tournament_id").eq("player_id", player_id).execute().data
    query = db().table("tournaments").select("id, name").in_("id", [l["tournament_id"] for l in links]).eq("deleted", False)
    if league_id:
        query = query.eq("league_id", league_id).is_("season_id", "null")
    return {t["id"]: t["name"] for t in query.execute().data}


def get_player_stats(player_id: str, league_id: str | None = None, last_n: int | None = None) -> dict:
    """Career stats of one player; only the current season of `league_id`, or only the last `last_n` matches."""
    player = db().table("players").select("id, name").eq("id", player_id).single().execute().data
    tournament_ids = list(_tournaments(player_id, league_id))

    scope = "career" if not (league_id or last_n) else ", ".join(
        s for s in [league_id and "current league season", last_n and f"last {last_n} matches"] if s)
    result = {"player": player["name"], "player_id": player_id, "scope": scope}
    if not tournament_ids:
        return {**result, "matches": 0}

    fields = ", ".join(f"{alias}{n}:result->player{n}Stats->{key}" for n in (1, 2) for alias, key in
                       [("o", "oneEighties"), ("c", "checkouts"), ("a", "doubleAttempts"), ("v", "visitScores")])
    # shortcut: one page (max 1000 matches per player); page with .range() if a player ever plays more.
    query = (db().table("matches")
             .select(f"id, player1_id, winner_id, game_type, {fields}")
             .or_(f"player1_id.eq.{player_id},player2_id.eq.{player_id}")
             .eq("status", "completed")
             .in_("tournament_id", tournament_ids)
             .order("updated_at", desc=True))
    matches = (query.limit(last_n) if last_n else query).execute().data

    # Per-match rows; fetched by player and filtered here, as the app does (an id list can overflow the URL).
    match_ids = {m["id"] for m in matches}
    rows = [r for r in db().table("match_player_stats").select("*").eq("player_id", player_id).execute().data
            if r["match_id"] in match_ids]

    # Average, checkouts and darts are X01 numbers; Cricket matches only count for wins and legs.
    cricket = {m["id"] for m in matches if "cricket" in (m["game_type"] or "").lower()}
    x01_rows = [r for r in rows if r["match_id"] not in cricket]
    total_score = sum(r["total_score"] or 0 for r in x01_rows)
    total_darts = sum(r["total_darts"] or 0 for r in x01_rows)

    one_eighties = hits = attempts = 0
    bands = dict.fromkeys(HIGH_SCORE_BANDS, 0)
    for m in matches:
        if m["id"] in cricket:
            continue
        n = 1 if m["player1_id"] == player_id else 2
        one_eighties += m[f"o{n}"] or 0
        if (m[f"a{n}"] or 0) > 0:  # older matches never recorded attempts; leave their hits out too
            attempts += m[f"a{n}"]
            hits += len(m[f"c{n}"] or [])
        if m[f"v{n}"]:
            for score in m[f"v{n}"]:
                for band in HIGH_SCORE_BANDS:
                    bands[band] += score >= band
        else:  # older matches only know their 180s (as in the tournament statistics tab)
            bands[180] += m[f"o{n}"] or 0

    wins = sum(m["winner_id"] == player_id for m in matches)
    return {
        **result,
        "matches": len(matches),
        "wins": wins,
        "losses": len(matches) - wins,
        "legs_won": sum(r["legs_won"] or 0 for r in rows),
        "legs_lost": sum(r["legs_lost"] or 0 for r in rows),
        "x01_matches": len(matches) - len(cricket),
        # Σscore / Σdarts × 3, not the mean of match averages: long matches weigh more, as in the app.
        "average": round(total_score / total_darts * 3, 2) if total_darts else None,
        "best_match_average": max((float(r["average"] or 0) for r in x01_rows), default=None),
        "highest_checkout": max((r["highest_checkout"] or 0 for r in x01_rows), default=None) or None,
        "darts_thrown": total_darts,
        "180s": one_eighties,
        "checkout_percent": round(hits / attempts * 100, 1) if attempts else None,
        "checkout_hits": hits,
        "checkout_attempts": attempts,
        "high_scores": {f"{band}+": count for band, count in bands.items()},
    }


def get_recent_matches(player_id: str, n: int = 5) -> dict:
    """The player's newest completed matches, newest first, as on the profile page."""
    player = db().table("players").select("id, name").eq("id", player_id).single().execute().data
    tournaments = _tournaments(player_id)
    if not tournaments:
        return {"player": player["name"], "matches": []}
    matches = (db().table("matches")
               .select("id, tournament_id, winner_id, player1_id, player1_legs, player2_legs, is_playoff, game_type,"
                       " completed_at, updated_at, m1:result->player1Stats->marks, d1:result->player1Stats->darts,"
                       " m2:result->player2Stats->marks, d2:result->player2Stats->darts,"
                       " player1:players!matches_player1_id_fkey(name), player2:players!matches_player2_id_fkey(name)")
               .or_(f"player1_id.eq.{player_id},player2_id.eq.{player_id}")
               .eq("status", "completed")
               .in_("tournament_id", list(tournaments))
               .order("updated_at", desc=True)
               .limit(n)
               .execute().data)
    averages = {r["match_id"]: r["average"] for r in
                db().table("match_player_stats").select("match_id, average").eq("player_id", player_id)
                .in_("match_id", [m["id"] for m in matches]).execute().data}

    rows = []
    for m in matches:
        me, other = (1, 2) if m["player1_id"] == player_id else (2, 1)
        cricket = "cricket" in (m["game_type"] or "").lower()
        darts = m[f"d{me}"] or 0
        rows.append({
            "date": (m["completed_at"] or m["updated_at"])[:10],
            "tournament": tournaments[m["tournament_id"]],
            "opponent": (m[f"player{other}"] or {}).get("name"),
            "result": "won" if m["winner_id"] == player_id else "lost",
            "legs": f"{m[f'player{me}_legs'] or 0}:{m[f'player{other}_legs'] or 0}",
            "playoff": bool(m["is_playoff"]),
            "game": "cricket" if cricket else "x01",
            # X01: 3-dart average; Cricket: marks per round (MPR), both as on the profile page.
            **({"mpr": round((m[f"m{me}"] or 0) / darts * 3, 2) if darts else None} if cricket
               else {"average": float(averages[m["id"]]) if averages.get(m["id"]) is not None else None}),
        })
    return {"player": player["name"], "matches": rows}


def _totals_from_rows(rows: list[dict], ids: list[str], per_player: int) -> dict[str, list[dict]]:
    # Rows are newest first with s1/d1/s2/d2 = each side's total score and darts. Matches without darts are dropped.
    totals: dict[str, list[dict]] = {i: [] for i in ids}

    def add(pid, opponent_id, score, darts, row):
        mine = totals.get(pid)
        if mine is not None and len(mine) < per_player and (darts or 0) > 0:
            mine.append({"score": score or 0, "darts": darts, "at": row["completed_at"],
                         "won": row["winner_id"] == pid, "opponent_id": opponent_id})

    for r in rows:
        add(r["player1_id"], r["player2_id"], r["s1"], r["d1"], r)
        add(r["player2_id"], r["player1_id"], r["s2"], r["d2"], r)
    return totals


def recent_match_totals(player_ids: list[str], per_player: int = HISTORY_MATCHES, before: str | None = None) -> dict[str, list[dict]]:
    """Each player's recent completed X01 matches, newest first, as {score, darts, at, won, opponent_id}.

    Mirrors matchService.getRecentMatchTotals: the input for winprob.player_strength, form and head-to-head."""
    ids = list(dict.fromkeys(i for i in player_ids if re.fullmatch(r"[0-9a-fA-F-]{36}", i or "")))
    if not ids:
        return {}
    listed = ",".join(ids)
    query = (db().table("matches")
             .select("player1_id, player2_id, winner_id, completed_at, s1:result->player1Stats->totalScore,"
                     " d1:result->player1Stats->totalDarts, s2:result->player2Stats->totalScore,"
                     " d2:result->player2Stats->totalDarts")
             .eq("status", "completed")
             .eq("game_type", "x01")  # strength is X01-only; Cricket rows would also eat the limit
             .or_(f"player1_id.in.({listed}),player2_id.in.({listed})"))
    try:  # an unparseable `before` is ignored, as in the app
        query = query.lt("completed_at", datetime.fromisoformat(before).isoformat()) if before else query
    except ValueError:
        pass
    # shortcut: one global newest-first limit, so a very active player can crowd out others' older matches;
    # per-player limits need an RPC.
    rows = query.order("completed_at", desc=True, nullsfirst=False).limit(min(per_player * len(ids), 3000)).execute().data
    return _totals_from_rows(rows, ids, per_player)


def get_head_to_head(player_id: str, opponent_id: str | None = None) -> dict:
    """The player's record against each opponent over all completed matches, most played first.
    Wins and legs count every game type, as in the app's head-to-head (leagueService.getHeadToHead)."""
    player = db().table("players").select("id, name").eq("id", player_id).single().execute().data
    tournaments = _tournaments(player_id)
    if not tournaments:
        return {"player": player["name"], "opponents": []}
    # shortcut: one page (max 1000 matches per player), as in get_player_stats.
    matches = (db().table("matches")
               .select("player1_id, player2_id, winner_id, player1_legs, player2_legs,"
                       " player1:players!matches_player1_id_fkey(name), player2:players!matches_player2_id_fkey(name)")
               .or_(f"player1_id.eq.{player_id},player2_id.eq.{player_id}")
               .eq("status", "completed")
               .in_("tournament_id", list(tournaments))
               .execute().data)

    # Counted here, not by the model: summing dozens of rows is where models slip.
    records: dict[str, dict] = {}
    for m in matches:
        me, other = (1, 2) if m["player1_id"] == player_id else (2, 1)
        opponent = m[f"player{other}_id"]
        if opponent is None or (opponent_id and opponent != opponent_id):
            continue
        r = records.setdefault(opponent, {"opponent": (m[f"player{other}"] or {}).get("name"),
                                          "matches": 0, "wins": 0, "losses": 0, "legs_won": 0, "legs_lost": 0})
        r["matches"] += 1
        r["wins"] += m["winner_id"] == player_id
        r["losses"] += m["winner_id"] == opponent
        r["legs_won"] += m[f"player{me}_legs"] or 0
        r["legs_lost"] += m[f"player{other}_legs"] or 0
    return {"player": player["name"],
            "opponents": sorted(records.values(), key=lambda r: (r["matches"], r["wins"]), reverse=True)}


def get_league_standings(league_id: str) -> dict:
    """The current season's league table, sorted like the app: points, then leg difference, then legs won."""
    league = db().table("leagues").select("name, season_name, season_started_at").eq("id", league_id).single().execute().data
    # Unnamed seasons are "Season 2026/27" from their start; one starting before July is last year's (leagueSeason.js).
    start = date.fromisoformat(league["season_started_at"][:10]) if league["season_started_at"] else date.today()
    year = start.year if start.month >= 7 else start.year - 1
    rows = (db().table("league_leaderboard")
            .select("total_points, tournaments_played, best_placement, avg_placement, legs_won, legs_lost, player:players(name)")
            .eq("league_id", league_id).execute().data)
    rows.sort(key=lambda r: (r["total_points"] or 0, (r["legs_won"] or 0) - (r["legs_lost"] or 0), r["legs_won"] or 0),
              reverse=True)
    return {
        "league": league["name"],
        "season": league["season_name"] or f"Season {year}/{(year + 1) % 100:02d}",
        "standings": [{
            "position": i,
            "player": r["player"]["name"],
            "points": r["total_points"] or 0,
            "tournaments_played": r["tournaments_played"] or 0,
            "best_placement": r["best_placement"],
            "average_placement": round(float(r["avg_placement"]), 2) if r["avg_placement"] is not None else None,
            "legs": f"{r['legs_won'] or 0}:{r['legs_lost'] or 0}",
        } for i, r in enumerate(rows, 1)],
    }


def get_me() -> dict:
    """The signed-in user and the players linked to their account; scripts and evals have nobody signed in."""
    user_id = _user_id.get()
    if not user_id:
        return {"signed_in": False}
    players = db().table("players").select("id, name").eq("user_id", user_id).execute().data
    managed = db().table("tournaments").select("id", count="exact").eq("user_id", user_id).eq("deleted", False).execute()
    return {"signed_in": True, "players": players, "tournaments_managed": managed.count}


def _date(row: dict) -> str | None:
    return (row.get("starts_at") or row.get("created_at") or "")[:10] or None


def _checkout_value(checkout) -> int:
    # Newer results store a number, older ones a string like "T20 + T20 + D25" (getCheckoutValue in the app).
    if isinstance(checkout, (int, float)):
        return int(checkout)
    if not isinstance(checkout, str):
        return 0
    total = 0
    for part in (p.strip() for p in checkout.split("+")):
        factor = {"T": 3, "D": 2, "S": 1}.get(part[:1])
        digits = part[1:] if factor else part
        total += int(digits) * (factor or 1) if digits.isdigit() else 0
    return total


def _podium(matches: list[dict]) -> dict[str, int]:
    """player_id -> place 1-3 from a tournament's completed playoff matches, as on the tournament summary page:
    the final decides 1 and 2, the 3rd-place match decides 3, without one both semi-final losers are 3rd."""
    playoff = [m for m in matches if m["is_playoff"] and m["winner_id"]]
    if not playoff:
        return {}
    last = max(m["playoff_round"] or 0 for m in playoff)
    loser = lambda m: m["player2_id"] if m["winner_id"] == m["player1_id"] else m["player1_id"]  # noqa: E731
    places = {}
    third = [m for m in playoff if m["playoff_round"] == last and m["playoff_match_number"] == 2]
    for m in (third or [m for m in playoff if m["playoff_round"] == last - 1]):
        places[m["winner_id"] if third else loser(m)] = 3
    for m in playoff:
        if m["playoff_round"] == last and (m["playoff_match_number"] or 1) == 1:
            places[m["winner_id"]], places[loser(m)] = 1, 2
    return places


_MATCH_FIELDS = ("id, tournament_id, player1_id, player2_id, winner_id, is_playoff, playoff_round, playoff_match_number,"
                 " game_type, player1:players!matches_player1_id_fkey(name), player2:players!matches_player2_id_fkey(name),"
                 + ", ".join(f"{a}{n}:result->player{n}Stats->{k}" for n in (1, 2) for a, k in
                             [("s", "totalScore"), ("d", "totalDarts"), ("a", "average"), ("c", "checkouts"), ("o", "oneEighties")]))


def _sides(m: dict):
    """Both players' view of one match: (player_id, name, opponent name, their stats from the match result)."""
    for me, other in ((1, 2), (2, 1)):
        yield (m[f"player{me}_id"], (m[f"player{me}"] or {}).get("name"), (m[f"player{other}"] or {}).get("name"),
               {k: m[f"{k}{me}"] for k in "sdaco"})


def list_tournaments(mine: bool = False, player_id: str | None = None, league_id: str | None = None,
                     status: str | None = None, limit: int = 10) -> dict:
    """Tournaments newest first: the signed-in user's own (mine), one player's, one league's, or any."""
    query = db().table("tournaments").select("id, name, status, starts_at, created_at, leagues(name)", count="exact").eq("deleted", False)
    if mine:
        if not _user_id.get():
            return {"error": "Nobody is signed in, so there are no own tournaments to list."}
        query = query.eq("user_id", _user_id.get())  # the dashboard's "My tournaments"
    if player_id:
        query = query.in_("id", list(_tournaments(player_id)))
    if league_id:
        query = query.eq("league_id", league_id)
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).limit(limit).execute()
    return {"total": result.count, "tournaments": [
        {"id": t["id"], "name": t["name"], "date": _date(t), "status": t["status"], "league": (t["leagues"] or {}).get("name")}
        for t in result.data]}


def find_tournament(name: str, limit: int = 5) -> list[dict]:
    """Tournaments whose name is close to `name`, best match first, with date and status to tell rounds apart."""
    rows = db().table("tournaments").select("id, name, status, starts_at, created_at").eq("deleted", False).execute().data
    by_id = {r["id"]: r for r in rows}
    return [{**c, "date": _date(by_id[c["id"]]), "status": by_id[c["id"]]["status"]} for c in _rank(name, rows, limit)]


def list_leagues(mine: bool = False) -> dict:
    """Leagues the caller can see (RLS decides), or only the ones the signed-in user created."""
    query = db().table("leagues").select("id, name, status, season_name").eq("deleted", False)
    if mine:
        if not _user_id.get():
            return {"error": "Nobody is signed in, so there are no own leagues to list."}
        query = query.eq("created_by", _user_id.get())
    return {"leagues": query.order("name").execute().data}


def get_tournament_summary(tournament_id: str) -> dict:
    """A tournament's podium and awards, as on its summary page: best tournament average, best single-match
    average, highest checkout and most 180s (X01; ties are all listed)."""
    t = (db().table("tournaments").select("name, status, starts_at, created_at, game_type, leagues(name)")
         .eq("id", tournament_id).single().execute().data)
    players = db().table("tournament_players").select("player_id", count="exact").eq("tournament_id", tournament_id).execute().count
    matches = (db().table("matches").select(_MATCH_FIELDS).eq("tournament_id", tournament_id)
               .eq("status", "completed").execute().data)
    names = {pid: name for m in matches for pid, name, _, _ in _sides(m)}
    places = _podium(matches)
    summary = {"tournament": t["name"], "date": _date(t), "status": t["status"], "game": t["game_type"] or "x01",
               "league": (t["leagues"] or {}).get("name"), "players": players, "completed_matches": len(matches),
               "podium": sorted(({"place": p, "player": names.get(pid)} for pid, p in places.items()), key=lambda r: r["place"])}
    if "cricket" in (t["game_type"] or "").lower():
        return {**summary, "awards": "Cricket tournament: the X01 averages, checkouts and 180s do not apply."}

    totals, best_match, checkout, one_eighties = {}, [], {}, {}
    for m in matches:
        for pid, name, opponent, s in _sides(m):
            if not pid:
                continue
            score, darts = totals.get(pid, (0, 0))
            totals[pid] = (score + (s["s"] or 0), darts + (s["d"] or 0))
            if (s["a"] or 0) > 0:
                best_match.append({"player": name, "opponent": opponent, "average": round(float(s["a"]), 2)})
            checkout[pid] = max([checkout.get(pid, 0), *(_checkout_value((c or {}).get("checkout")) for c in s["c"] or [])])
            one_eighties[pid] = one_eighties.get(pid, 0) + (s["o"] or 0)

    def leaders(values: dict) -> dict | None:
        top = max(values.values(), default=0)
        return {"value": top, "players": [names.get(p) for p, v in values.items() if v == top]} if top else None

    averages = {p: round(s / d * 3, 2) for p, (s, d) in totals.items() if d}
    best_match.sort(key=lambda r: r["average"], reverse=True)
    return {**summary, "awards": {
        "best_tournament_average": leaders(averages),
        "tournament_averages_top5": [{"player": names.get(p), "average": a}
                                     for p, a in sorted(averages.items(), key=lambda pa: pa[1], reverse=True)[:5]],
        "best_match_average": [r for r in best_match if r["average"] == best_match[0]["average"]] if best_match else None,
        "highest_checkout": leaders(checkout),
        "most_180s": leaders(one_eighties),
    }}


def _all_rows(build) -> list[dict]:
    # PostgREST returns at most 1000 rows per request; app-wide questions page with .range() (a fresh query each time).
    rows, start = [], 0
    while True:
        page = build().range(start, start + 999).execute().data
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def get_records(stat: str, min_checkout: int | None = None, league_id: str | None = None, limit: int = 10) -> dict:
    """Records across every tournament the caller can see (or one league's), from the match results the summary
    pages use: checkouts (highest per player, or how often each player finished min_checkout or more), 180s,
    best single-match averages, best overall averages (players with 5+ X01 matches). X01 only."""
    query = db().table("tournaments").select("id, name, starts_at, created_at").eq("deleted", False)
    if league_id:
        query = query.eq("league_id", league_id)
    tournaments = {t["id"]: t for t in query.execute().data}
    if not tournaments:
        return {"stat": stat, "records": []}
    matches = _all_rows(lambda: db().table("matches").select(_MATCH_FIELDS).in_("tournament_id", list(tournaments))
                        .eq("status", "completed").order("id"))

    names, checkouts, one_eighties, totals, match_averages = {}, {}, {}, {}, []
    for m in matches:
        if "cricket" in (m["game_type"] or "").lower():
            continue
        t = tournaments[m["tournament_id"]]
        for pid, name, opponent, s in _sides(m):
            if not pid:
                continue
            names[pid] = name
            checkouts.setdefault(pid, []).extend(_checkout_value((c or {}).get("checkout")) for c in s["c"] or [])
            one_eighties[pid] = one_eighties.get(pid, 0) + (s["o"] or 0)
            score, darts, played = totals.get(pid, (0, 0, 0))
            totals[pid] = (score + (s["s"] or 0), darts + (s["d"] or 0), played + 1)
            if s["a"]:
                match_averages.append({"player": name, "opponent": opponent, "average": round(float(s["a"]), 2),
                                       "tournament": t["name"], "date": _date(t)})

    if stat == "checkouts" and min_checkout:
        hits = {p: [v for v in vals if v >= min_checkout] for p, vals in checkouts.items()}
        rows = [{"player": names[p], "times": len(v), "highest": max(v)} for p, v in hits.items() if v]
        rows.sort(key=lambda r: (r["times"], r["highest"]), reverse=True)
    elif stat == "checkouts":
        rows = sorted(({"player": names[p], "highest": max(v), "checkouts": len(v)} for p, v in checkouts.items() if v),
                      key=lambda r: r["highest"], reverse=True)
    elif stat == "180s":
        rows = sorted(({"player": names[p], "180s": n} for p, n in one_eighties.items() if n), key=lambda r: r["180s"], reverse=True)
    elif stat == "match_average":
        rows = sorted(match_averages, key=lambda r: r["average"], reverse=True)
    elif stat == "average":
        rows = sorted(({"player": names[p], "average": round(s / d * 3, 2), "matches": n}
                       for p, (s, d, n) in totals.items() if d and n >= 5), key=lambda r: r["average"], reverse=True)
    else:
        return {"error": f"Unknown stat {stat!r}; use checkouts, 180s, match_average or average."}
    # Records count per player record, as the profile pages do; when two records share a name (a duplicate in the
    # data), say so, or "Jozef Dániel: 9" hides the other Jozef Dániel's 3.
    same_name = {}
    for name in names.values():
        same_name[name] = same_name.get(name, 0) + 1
    for row in rows[:limit]:
        if same_name.get(row["player"], 0) > 1:
            row["note"] = f"{same_name[row['player']]} separate player records share this name; counted separately"
    return {"stat": stat, "min_checkout": min_checkout, "league_id": league_id, "tournaments": len(tournaments),
            "players_with_records": len(rows), "records": rows[:limit]}


def get_player_tournaments(player_id: str) -> dict:
    """Every tournament the player played, newest first, with their placing (1-3 from the playoffs, or the league's
    recorded placement), wins and losses, tournament average, best match average, highest checkout and 180s."""
    player = db().table("players").select("id, name").eq("id", player_id).single().execute().data
    tournaments = _tournaments(player_id)
    if not tournaments:
        return {"player": player["name"], "tournaments": []}
    meta = {t["id"]: t for t in db().table("tournaments").select("id, starts_at, created_at, game_type, status")
            .in_("id", list(tournaments)).execute().data}
    matches = (db().table("matches").select(_MATCH_FIELDS).in_("tournament_id", list(tournaments))
               .eq("status", "completed").execute().data)
    # League rounds record a placement for every player; it fills in where the playoffs don't decide one.
    league_places = {r["tournament_id"]: r["placement"] for r in
                     db().table("league_tournament_results").select("tournament_id, placement").eq("player_id", player_id).execute().data}

    rows = []
    for tid, name in tournaments.items():
        in_t = [m for m in matches if m["tournament_id"] == tid]
        mine = [(m, s) for m in in_t for pid, _, _, s in _sides(m) if pid == player_id]
        score = sum(s["s"] or 0 for _, s in mine)
        darts = sum(s["d"] or 0 for _, s in mine)
        cricket = "cricket" in (meta[tid]["game_type"] or "").lower()
        rows.append({
            "tournament": name, "tournament_id": tid, "date": _date(meta[tid]), "status": meta[tid]["status"],
            "game": "cricket" if cricket else "x01",
            "placement": _podium(in_t).get(player_id) or league_places.get(tid),
            "wins": sum(m["winner_id"] == player_id for m, _ in mine),
            "losses": sum(bool(m["winner_id"]) and m["winner_id"] != player_id for m, _ in mine),
            **({} if cricket else {
                "average": round(score / darts * 3, 2) if darts else None,
                "best_match_average": max((round(float(s["a"]), 2) for _, s in mine if s["a"]), default=None),
                "highest_checkout": max((_checkout_value((c or {}).get("checkout")) for _, s in mine for c in s["c"] or []),
                                        default=None) or None,
                "180s": sum(s["o"] or 0 for _, s in mine),
            }),
        })
    rows.sort(key=lambda r: r["date"] or "", reverse=True)
    return {"player": player["name"], "tournaments": rows}


def main() -> None:
    name = " ".join(sys.argv[1:]) or "Peter"
    candidates = find_player(name)
    print("candidates:", candidates)
    if candidates:
        print(json.dumps(get_player_stats(candidates[0]["id"]), indent=2, ensure_ascii=False))
