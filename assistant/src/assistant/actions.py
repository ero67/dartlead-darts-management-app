# Drafts for the actions the assistant proposes. Read-only: the app writes after the user confirms.
import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from assistant import stats

SETTINGS = ["legs_to_win", "starting_score", "game_type", "default_scoring_mode", "group_settings", "playoff_settings", "tournament_type"]
MAX_NAMES = 20
MAX_ROUND_PLAYERS = 64
MATCH, TIE, EPSILON = 0.9, 0.05, 1e-9
MAX_NAME_LENGTH = 100
ZONE = ZoneInfo("Europe/Bratislava")  # the app's time zone, as in agent.today_line
DEFAULT_TIME = time(19, 0)
# "kolo 5" first, so a year or a league number before it ("Liga 2 kolo 7") is not taken for the round's; then "5. kolo".
ROUND_NUMBER = (re.compile(r"\b(?:kolo|kola|round|runda)\s*(\d+)"), re.compile(r"(\d+)\.?\s*(?:kolo|kola|round|runda)\b"))


def _league(league_id: str) -> dict:
    if not stats.db().rpc("can_manage_league", {"l_id": league_id}).execute().data:
        return {"error": "You can only change leagues you manage."}
    rows = stats.db().table("leagues").select("name").eq("id", league_id).limit(1).execute().data
    return {"name": rows[0]["name"]} if rows else {"error": "League not found."}


def _next_name(name: str) -> str:
    # The number next to a round word is the round's: "7.kolo Liga 3" -> "8.kolo Liga 3"; else the last number.
    folded = "".join(stats._norm(c)[:1] or c for c in name)  # one character per character, so positions match name
    found = next(filter(None, (pattern.search(folded) for pattern in ROUND_NUMBER)), None)
    if found:
        start, end = found.span(1)
    else:
        last = list(re.finditer(r"\d+", name))[-1:]
        if not last:
            return f"{name} 2"
        start, end = last[0].span()
    return f"{name[:start]}{int(name[start:end]) + 1}{name[end:]}"


def _local(value: str) -> datetime:
    # No offset means Bratislava time: the database would read it as UTC, while the card shows it as local.
    moment = datetime.fromisoformat(value)
    return moment.replace(tzinfo=ZONE) if moment.tzinfo is None else moment.astimezone(ZONE)


def _starts_at(value: str | None, last: str | None) -> str | None:
    """The round's start as an ISO date-time with an offset, in Bratislava time; None when nothing gives a date."""
    previous = _local(last) if last else None
    if value is None:
        # Same tzinfo, so the 7 days are wall-clock days: 19:00 stays 19:00 across a DST change.
        return (previous + timedelta(days=7)).isoformat() if previous else None
    try:
        day = date.fromisoformat(value)  # a date alone starts at the last round's time of day
    except ValueError:
        return _local(value).isoformat()
    return datetime.combine(day, previous.time() if previous else DEFAULT_TIME, tzinfo=ZONE).isoformat()


def _names(names: list[str], new_names: list[str] | None, limit: int) -> tuple[list[str], set[str], dict | None]:
    """Deduped names, the normalised ones confirmed as new, and an error when the names are not usable."""
    unique: dict[str, str] = {}
    for n in [*(new_names or []), *names]:  # first wins, so a name in both lists stays new
        unique.setdefault(stats._norm(n.strip()), n.strip())  # "Marek" and "marek" are one name
    names = list(unique.values())
    if not 1 <= len(names) <= limit:
        return names, set(), {"error": f"Give between 1 and {limit} names."}
    if any(not n or len(n) > MAX_NAME_LENGTH for n in names):
        return names, set(), {"error": f"Every name must be between 1 and {MAX_NAME_LENGTH} characters."}
    return names, {stats._norm(n.strip()) for n in new_names or []}, None


def _members(league_id: str) -> list[dict]:
    return [r["players"] for r in stats.db().table("league_members").select("players(id, name)")
            .eq("league_id", league_id).eq("is_active", True).is_("left_at", "null").execute().data]


def _roster() -> list[dict]:
    hidden = stats._demo()["players"]
    # shortcut: ranks the whole roster in Python (PostgREST returns at most 1000 rows); move to a
    # pg_trgm RPC when a manager has more players than that.
    return [p for p in stats.db().table("players").select("id, name").eq("owner_id", stats._user_id.get()).execute().data
            if p["id"] not in hidden]


def _is_member(name: str, members: list[dict]) -> bool:
    return any(m["match"] == 1.0 for m in stats._rank(name, members, 1))


def _pick(name: str, rows: list[dict], member_ids: set[str] = frozenset()) -> tuple[dict | None, list[dict]]:
    """The row `name` clearly means, or None, and the close rows: None with close rows means ask which one."""
    close = stats._rank(name, rows, len(rows))  # sorted is stable: among equal scores, rows keep their order
    if not close:
        return None, []
    top = close[0]
    if top["match"] == 1.0:  # an exact full name; another exact one is the same name stored twice: take the first
        return top, close
    is_member = top["id"] in member_ids
    rivals = [c for c in close[1:] if top["match"] - c["match"] <= TIE + EPSILON
              and stats._norm(c["name"]) != stats._norm(top["name"])  # stored twice: the first, as createTournament takes
              and not (is_member and c["id"] not in member_ids and c["match"] == top["match"])]  # a member wins a tie
    if top["match"] < MATCH or rivals:
        return None, [top, *rivals] if rivals else close[:2]
    return top, close


def _ask(close: list[dict]) -> str:
    return f'{" or ".join(c["name"] for c in close)}?' if close else "no such player, is it a new player?"


def _unclear(unclear: dict[str, str]) -> dict:
    # Every unclear name in one error, so the agent asks about all of them at once.
    asks = " ".join(f'"{name}": {question}' for name, question in unclear.items())
    return {"error": f"Some names are unclear. Ask the user about all of them at once: {asks}"}


def _round_players(league_id: str, names: list[str], confirmed_new: set[str]) -> dict:
    # Members and roster ranked together, members first so they win equal scores.
    members = _members(league_id)
    member_ids = {m["id"] for m in members}
    rows = members + [p for p in _roster() if p["id"] not in member_ids]
    players, new, unclear, given = [], [], {}, {}
    for name in names:
        top, close = _pick(name, rows, member_ids)
        # A confirmed new name skips matching, unless it is exactly a stored name: createTournament would not see that
        # "Jozef Kral" is "Jozef Kráľ" and would insert a duplicate.
        if stats._norm(name) in confirmed_new and not (top and top["match"] == 1.0):
            new.append(name)
        elif top is None:
            unclear[name] = _ask(close)
        elif top["id"] in given:
            unclear[name] = f'the same player as "{given[top["id"]]}"?'
        else:
            given[top["id"]] = name
            players.append({"id": top["id"], "name": top["name"]})
    return _unclear(unclear) if unclear else {"players": players, "new_players": new}


def next_round_draft(league_id: str, starts_at: str | None = None, name: str | None = None,
                     players: list[str] | None = None, new_players: list[str] | None = None,
                     include_last_round: bool = False) -> dict:
    listed = bool(players or new_players)  # without a list, the last round's players; with one, it replaces them
    # unless include_last_round adds it to them
    if listed:
        names, confirmed_new, error = _names(players or [], new_players, MAX_ROUND_PLAYERS)
        if error:
            return error
    league = _league(league_id)
    if "error" in league:
        return league
    last = (stats.db().table("tournaments").select(f"id, name, starts_at, venue, {', '.join(SETTINGS)}")
            .eq("league_id", league_id).eq("deleted", False)
            .order("starts_at", desc=True, nullsfirst=False).order("created_at", desc=True).limit(1).execute().data)
    if not last:
        return {"error": "This league has no previous round to copy."}
    last = last[0]
    try:
        starts_at = _starts_at(starts_at, last["starts_at"])
    except ValueError:
        return {"error": "The date must be an ISO date or date-time, like 2026-11-06T19:00:00+01:00."}
    chosen = {"players": [], "new_players": []}
    if listed:
        chosen = _round_players(league_id, names, confirmed_new)
        if "error" in chosen:
            return chosen
    if include_last_round or not listed:
        rows = stats.db().table("tournament_players").select("players(id, name)").eq("tournament_id", last["id"]).execute().data
        previous = [{"id": r["players"]["id"], "name": r["players"]["name"]} for r in rows]
        ids = {p["id"] for p in previous}
        chosen["players"] = previous + [p for p in chosen["players"] if p["id"] not in ids]
    return {
        "league_id": league_id, "league": league["name"], "name": name or _next_name(last["name"]),
        "starts_at": starts_at, "venue": last["venue"], "settings": {k: last[k] for k in SETTINGS}, **chosen,
        "copied_from": {"id": last["id"], "name": last["name"], "starts_at": last["starts_at"]},
    }


def add_members_draft(league_id: str, names: list[str], new_names: list[str] | None = None) -> dict:
    # new_names are confirmed by the manager as new players: they skip roster matching.
    names, confirmed_new, error = _names(names, new_names, MAX_NAMES)
    if error:
        return error
    league = _league(league_id)
    if "error" in league:
        return league
    members = _members(league_id)
    member_ids = {m["id"] for m in members}
    roster = _roster()
    existing, new, already, unclear, given = [], [], [], {}, {}
    for name in names:
        if _is_member(name, members):  # a member outside the roster
            already.append(name)
            continue
        if stats._norm(name) in confirmed_new:
            new.append(name)
            continue
        top, close = _pick(name, roster)
        if top is None and close:
            unclear[name] = _ask(close)
        elif top is None:
            new.append(name)
        elif top["id"] in member_ids:
            already.append(name)
        elif top["id"] in given:
            unclear[name] = f'the same player as "{given[top["id"]]}"?'
        else:
            given[top["id"]] = name
            existing.append({"id": top["id"], "name": top["name"]})
    if unclear:
        return _unclear(unclear)
    if not existing and not new:
        return {"error": "Everyone is already a member of this league."}
    return {"league_id": league_id, "league": league["name"], "existing": existing, "new": new, "already_members": already}
