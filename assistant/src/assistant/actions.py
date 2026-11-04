# Drafts for the actions the assistant proposes. Read-only: the app writes after the user confirms.
import re
from datetime import datetime, timedelta

from assistant import stats

SETTINGS = ["legs_to_win", "starting_score", "game_type", "default_scoring_mode", "group_settings", "playoff_settings", "tournament_type"]
MAX_NAMES = 20
MATCH, TIE = 0.9, 0.05


def _league(league_id: str) -> dict:
    if not stats.db().rpc("can_manage_league", {"l_id": league_id}).execute().data:
        return {"error": "You can only change leagues you manage."}
    rows = stats.db().table("leagues").select("name").eq("id", league_id).limit(1).execute().data
    return {"name": rows[0]["name"]} if rows else {"error": "League not found."}


def _next_name(name: str) -> str:
    return re.sub(r"\d+$", lambda m: str(int(m.group()) + 1), name) if re.search(r"\d+$", name) else f"{name} 2"


def next_round_draft(league_id: str, starts_at: str | None = None, name: str | None = None) -> dict:
    league = _league(league_id)
    if "error" in league:
        return league
    last = (stats.db().table("tournaments").select(f"id, name, starts_at, venue, {', '.join(SETTINGS)}")
            .eq("league_id", league_id).eq("deleted", False)
            .order("starts_at", desc=True, nullsfirst=False).order("created_at", desc=True).limit(1).execute().data)
    if not last:
        return {"error": "This league has no previous round to copy."}
    last = last[0]
    if starts_at is None and last["starts_at"]:
        starts_at = (datetime.fromisoformat(last["starts_at"]) + timedelta(days=7)).isoformat()
    rows = stats.db().table("tournament_players").select("players(id, name)").eq("tournament_id", last["id"]).execute().data
    return {
        "league_id": league_id, "league": league["name"], "name": name or _next_name(last["name"]),
        "starts_at": starts_at, "venue": last["venue"], "settings": {k: last[k] for k in SETTINGS},
        "players": [{"id": r["players"]["id"], "name": r["players"]["name"]} for r in rows],
        "copied_from": {"id": last["id"], "name": last["name"], "starts_at": last["starts_at"]},
    }


def add_members_draft(league_id: str, names: list[str]) -> dict:
    if not 1 <= len(names) <= MAX_NAMES:
        return {"error": f"Give between 1 and {MAX_NAMES} names."}
    league = _league(league_id)
    if "error" in league:
        return league
    members = [r["players"] for r in stats.db().table("league_members").select("players(id, name)")
               .eq("league_id", league_id).is_("left_at", "null").execute().data]
    roster = stats.db().table("players").select("id, name").eq("owner_id", stats._user_id.get()).execute().data
    existing, new, already = [], [], []
    for name in names:
        if any(m["match"] == 1.0 for m in stats._rank(name, members, 1)):
            already.append(name)
            continue
        close = [m for m in stats._rank(name, roster, 2) if m["match"] >= MATCH]
        if len(close) == 2 and close[0]["match"] - close[1]["match"] <= TIE:
            return {"error": f'"{name}" matches both {close[0]["name"]} and {close[1]["name"]}. Ask which one.'}
        if not close:
            new.append(name)
        elif close[0]["id"] not in {p["id"] for p in existing}:
            existing.append({"id": close[0]["id"], "name": close[0]["name"]})
    if not existing and not new:
        return {"error": "Everyone is already a member of this league."}
    return {"league_id": league_id, "league": league["name"], "existing": existing, "new": new, "already_members": already}
