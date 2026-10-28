# Phase 3: read live player stats from Supabase. Plain functions, no LLM: step 3 turns them into tools.
# The numbers follow getPlayerProfile in src/services/tournamentService.js, so the assistant agrees with the app.
import json
import os
import sys
import unicodedata
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


def find_player(name: str, limit: int = 5) -> list[dict]:
    """Players whose name is close to `name`, best match first. More than one result means: ask which one."""
    # shortcut: ranks every player name in Python (PostgREST returns at most 1000 rows); move to a
    # pg_trgm RPC when there are more players than that.
    players = db.table("players").select("id, name").execute().data
    query = _norm(name).strip()

    def score(player: dict) -> float:
        full = _norm(player["name"])
        words = full.split()
        if query == full:
            return 1.0
        if query in words:  # first or last name alone
            return 0.95
        if any(w.startswith(query) for w in words):  # "Pet" -> "Peter"
            return 0.9
        return max(SequenceMatcher(None, query, w).ratio() for w in [full, *words])  # typos, "Jano" -> "Jan"

    ranked = sorted(((score(p), p) for p in players), key=lambda sp: sp[0], reverse=True)
    return [{"id": p["id"], "name": p["name"], "match": round(s, 2)} for s, p in ranked if s >= 0.75][:limit]


def get_player_stats(player_id: str, league_id: str | None = None, last_n: int | None = None) -> dict:
    """Career stats of one player; only the current season of `league_id`, or only the last `last_n` matches."""
    player = db.table("players").select("id, name").eq("id", player_id).single().execute().data
    links = db.table("tournament_players").select("tournament_id").eq("player_id", player_id).execute().data
    # Soft-deleted tournaments don't count, like on the profile page. The current season = season_id IS NULL.
    tournaments = db.table("tournaments").select("id").in_("id", [l["tournament_id"] for l in links]).eq("deleted", False)
    if league_id:
        tournaments = tournaments.eq("league_id", league_id).is_("season_id", "null")
    tournament_ids = [t["id"] for t in tournaments.execute().data]

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


def main() -> None:
    name = " ".join(sys.argv[1:]) or "Peter"
    candidates = find_player(name)
    print("candidates:", candidates)
    if candidates:
        print(json.dumps(get_player_stats(candidates[0]["id"]), indent=2, ensure_ascii=False))
