# Drafts for the actions the assistant proposes. Read-only: the app writes after the user confirms.
import re
from datetime import datetime, timedelta

from assistant import stats

SETTINGS = ["legs_to_win", "starting_score", "game_type", "default_scoring_mode", "group_settings", "playoff_settings", "tournament_type"]
MAX_NAMES = 20
MATCH, TIE, EPSILON = 0.9, 0.05, 1e-9
MAX_NAME_LENGTH = 100


def _league(league_id: str) -> dict:
    if not stats.db().rpc("can_manage_league", {"l_id": league_id}).execute().data:
        return {"error": "You can only change leagues you manage."}
    rows = stats.db().table("leagues").select("name").eq("id", league_id).limit(1).execute().data
    return {"name": rows[0]["name"]} if rows else {"error": "League not found."}


def _next_name(name: str) -> str:
    # The last number is the round's: "4. kolo" -> "5. kolo", "Round 12 Finals" -> "Round 13 Finals".
    last = list(re.finditer(r"\d+", name))[-1:]
    return f"{name[:last[0].start()]}{int(last[0].group()) + 1}{name[last[0].end():]}" if last else f"{name} 2"


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
    if starts_at is not None:
        try:
            datetime.fromisoformat(starts_at)
        except ValueError:
            return {"error": "The date must be an ISO date or date-time, like 2026-11-06T19:00:00+00:00."}
    elif last["starts_at"]:
        starts_at = (datetime.fromisoformat(last["starts_at"]) + timedelta(days=7)).isoformat()
    rows = stats.db().table("tournament_players").select("players(id, name)").eq("tournament_id", last["id"]).execute().data
    return {
        "league_id": league_id, "league": league["name"], "name": name or _next_name(last["name"]),
        "starts_at": starts_at, "venue": last["venue"], "settings": {k: last[k] for k in SETTINGS},
        "players": [{"id": r["players"]["id"], "name": r["players"]["name"]} for r in rows],
        "copied_from": {"id": last["id"], "name": last["name"], "starts_at": last["starts_at"]},
    }


def add_members_draft(league_id: str, names: list[str], new_names: list[str] | None = None) -> dict:
    # new_names are confirmed by the manager as new players: they skip roster matching.
    unique: dict[str, str] = {}
    for n in [*(new_names or []), *names]:  # first wins, so a name in both lists stays new
        unique.setdefault(stats._norm(n.strip()), n.strip())  # "Marek" and "marek" are one name
    confirmed_new = {stats._norm(n.strip()) for n in new_names or []}
    names = list(unique.values())
    if not 1 <= len(names) <= MAX_NAMES:
        return {"error": f"Give between 1 and {MAX_NAMES} names."}
    if any(not n or len(n) > MAX_NAME_LENGTH for n in names):
        return {"error": f"Every name must be between 1 and {MAX_NAME_LENGTH} characters."}
    league = _league(league_id)
    if "error" in league:
        return league
    members = [r["players"] for r in stats.db().table("league_members").select("players(id, name)")
               .eq("league_id", league_id).is_("left_at", "null").execute().data]
    member_ids = {m["id"] for m in members}
    hidden = stats._demo()["players"]
    # shortcut: ranks the whole roster in Python (PostgREST returns at most 1000 rows); move to a
    # pg_trgm RPC when a manager has more players than that.
    roster = [p for p in stats.db().table("players").select("id, name").eq("owner_id", stats._user_id.get()).execute().data
              if p["id"] not in hidden]
    existing, new, already = [], [], []
    for name in names:
        if any(m["match"] == 1.0 for m in stats._rank(name, members, 1)):  # a member outside the roster
            already.append(name)
            continue
        if stats._norm(name) in confirmed_new:
            new.append(name)
            continue
        close = stats._rank(name, roster, 2)
        if not close:
            new.append(name)
            continue
        # An exact full name (1.0) wins over first-name-only matches; otherwise the best match must reach MATCH and lead by more than TIE.
        top, rest = close[0], close[1:]
        exact = top["match"] == 1.0 and (not rest or rest[0]["match"] < 1.0)
        if not exact and (top["match"] < MATCH or (rest and top["match"] - rest[0]["match"] <= TIE + EPSILON)):
            return {"error": f'Which player is "{name}": {" or ".join(c["name"] for c in close)}? Ask which one.'}
        if top["id"] in member_ids:
            already.append(name)
        elif top["id"] not in {p["id"] for p in existing}:
            existing.append({"id": top["id"], "name": top["name"]})
    if not existing and not new:
        return {"error": "Everyone is already a member of this league."}
    return {"league_id": league_id, "league": league["name"], "existing": existing, "new": new, "already_members": already}
