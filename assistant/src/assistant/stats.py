# Phase 3: read live player stats from Supabase. Plain functions, no LLM: step 3 turns them into tools.
# The numbers follow getPlayerProfile in src/services/tournamentService.js, so the assistant agrees with the app.
import json
import os
import sys
import unicodedata
from datetime import date
from difflib import SequenceMatcher

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
# shortcut: anon key, so only publicly readable rows (players, matches, stats); switch to the user's JWT
# in the service so league tables and any stricter RLS apply per user.
db = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])

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
    return _rank(name, db.table("players").select("id, name").execute().data, limit)


def find_league(name: str, limit: int = 5) -> list[dict]:
    """Leagues the caller can see whose name is close to `name`, best match first."""
    return _rank(name, db.table("leagues").select("id, name").eq("deleted", False).execute().data, limit)


def _tournaments(player_id: str, league_id: str | None = None) -> dict[str, str]:
    # The player's tournaments as {id: name}. Soft-deleted ones don't count, like on the profile page;
    # with a league, only its current season (season_id IS NULL).
    links = db.table("tournament_players").select("tournament_id").eq("player_id", player_id).execute().data
    query = db.table("tournaments").select("id, name").in_("id", [l["tournament_id"] for l in links]).eq("deleted", False)
    if league_id:
        query = query.eq("league_id", league_id).is_("season_id", "null")
    return {t["id"]: t["name"] for t in query.execute().data}


def get_player_stats(player_id: str, league_id: str | None = None, last_n: int | None = None) -> dict:
    """Career stats of one player; only the current season of `league_id`, or only the last `last_n` matches."""
    player = db.table("players").select("id, name").eq("id", player_id).single().execute().data
    tournament_ids = list(_tournaments(player_id, league_id))

    scope = "career" if not (league_id or last_n) else ", ".join(
        s for s in [league_id and "current league season", last_n and f"last {last_n} matches"] if s)
    result = {"player": player["name"], "player_id": player_id, "scope": scope}
    if not tournament_ids:
        return {**result, "matches": 0}

    fields = ", ".join(f"{alias}{n}:result->player{n}Stats->{key}" for n in (1, 2) for alias, key in
                       [("o", "oneEighties"), ("c", "checkouts"), ("a", "doubleAttempts"), ("v", "visitScores")])
    # shortcut: one page (max 1000 matches per player); page with .range() if a player ever plays more.
    query = (db.table("matches")
             .select(f"id, player1_id, winner_id, game_type, {fields}")
             .or_(f"player1_id.eq.{player_id},player2_id.eq.{player_id}")
             .eq("status", "completed")
             .in_("tournament_id", tournament_ids)
             .order("updated_at", desc=True))
    matches = (query.limit(last_n) if last_n else query).execute().data

    # Per-match rows; fetched by player and filtered here, as the app does (an id list can overflow the URL).
    match_ids = {m["id"] for m in matches}
    rows = [r for r in db.table("match_player_stats").select("*").eq("player_id", player_id).execute().data
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
    player = db.table("players").select("id, name").eq("id", player_id).single().execute().data
    tournaments = _tournaments(player_id)
    if not tournaments:
        return {"player": player["name"], "matches": []}
    matches = (db.table("matches")
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
                db.table("match_player_stats").select("match_id, average").eq("player_id", player_id)
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


def get_league_standings(league_id: str) -> dict:
    """The current season's league table, sorted like the app: points, then leg difference, then legs won."""
    league = db.table("leagues").select("name, season_name, season_started_at").eq("id", league_id).single().execute().data
    # Unnamed seasons are "Season 2026/27" from their start; one starting before July is last year's (leagueSeason.js).
    start = date.fromisoformat(league["season_started_at"][:10]) if league["season_started_at"] else date.today()
    year = start.year if start.month >= 7 else start.year - 1
    rows = (db.table("league_leaderboard")
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


def main() -> None:
    name = " ".join(sys.argv[1:]) or "Peter"
    candidates = find_player(name)
    print("candidates:", candidates)
    if candidates:
        print(json.dumps(get_player_stats(candidates[0]["id"]), indent=2, ensure_ascii=False))
