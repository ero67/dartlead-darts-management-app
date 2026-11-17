# Match stats cleanup (admin)

## Why

In two rounds of the 2026 league part 3 (3.kolo, 5.kolo) some matches would
not score, so managers clicked through them entering made-up visits. Winners
and leg scores are real; the throwing numbers (averages, checkouts, darts per
leg, 180s) are fake and now lead the league top-10 boards. We need a safe,
repeatable admin tool to remove such numbers without hand-editing the DB.

## Goals / non-goals

- Goal: admin can find bad matches, clear their throwing stats, and restore them.
- Goal: winner, legs, status and standings points are never touched.
- Non-goal: editing stat values by hand (nobody knows the real throws).
- Non-goal: manager access, Cricket matches, preventing the click-through
  (managers already have the result override; telling them is a follow-up).
- Anti-goal: any path that clears without a backup, or clears a match twice.

## Approaches

- **A. Clear with backup (picked).** One RPC copies the stats to a backup
  table and removes them in the same transaction. Every reader (league
  boards, profiles, standings average, assistant, installed Android apps)
  already skips matches without stats, so no reader changes.
- B. "Stats don't count" flag. Non-destructive, but 6–8 readers plus the
  assistant must learn the flag, and installed apps keep showing fake numbers.
- C. Hand-edit values. Rejected: real values are unknown.

## What prod data showed (2026-11-17)

Fake matches were entered as ~all visits = 60. Rule "≥50% of a side's
visits share one score" flags 7 matches (5 in 3.kolo playoffs, 2 in 5.kolo)
and 0 of ~600 sides in other rounds. One suspect 5.kolo match (73.3 avg) is
not repetitive, so a second flag compares to the player's own average.

## Design

**Migration** (admin-only, `is_admin()` checked inside each function,
`SECURITY DEFINER`, `search_path = ''`, idempotent):

- Table `match_stats_backups`: `id`, `match_id`, `result_stats jsonb`
  (`{player1Stats, player2Stats}` as they were), `player_stats jsonb`
  (the match's `match_player_stats` rows), `cleared_by`, `cleared_at`,
  `restored_by`, `restored_at`. RLS on, no policies (RPC access only).
  Partial unique index on `match_id WHERE restored_at IS NULL`, so a match
  can't have two open backups.
- `admin_match_stats_review(league_id)`: one row per completed X01 match of
  the league's non-deleted tournaments: tournament, players, legs score,
  per side average / best checkout / fewest winning-leg darts / 180s /
  visit count / top repeated-visit share, each player's league average over
  their other matches, and whether stats are currently cleared.
- `admin_clear_match_stats(match_ids uuid[])`: all ids must belong to one
  tournament and number ≤ 20, else error. Skips (and reports) matches that
  are not completed, Cricket, already cleared, or have no stats. For the
  rest, in one transaction: insert backup; remove `player1Stats` /
  `player2Stats` from `result`; zero `total_darts`, `total_score`,
  `average`, `highest_checkout` in `match_player_stats` (legs kept);
  write `admin_audit_log`. Returns `{cleared, skipped}`.
- `admin_restore_match_stats(match_ids uuid[])`: per open backup, refuse
  if the match has stats again (`rescored`) or was reset / given a new result
  since (`changed`: not completed, or a backed-up stats row is gone); either
  way the stale backup is closed so the match can be cleared again. Else put
  back the JSONB keys (nulls inside kept) and the four columns exactly, set
  `restored_*`, audit log. Winner/legs/status untouched in both directions.
- Clear also backs up and removes the top-level `visits` log. A match shows
  as cleared only while it has an open backup and no stats.

**Admin UI**: new "Match stats" section in Admin → Data fixes
(English, like the rest of the admin panel).

- League picker, then round picker; each round shows its suspicious count.
- Filters: player search, "Suspicious only". Sortable columns: average,
  best checkout, fewest darts, 180s.
- Flags with the reason shown: *repetitive visits* (≥50% same score, ≥8
  visits) and *far above own average* (≥ +15 over their other matches).
- Tick matches → "Clear stats" → confirm dialog listing every match and
  every number that will disappear → result toast with cleared/skipped.
- Cleared matches stay in the list, marked, with a "Restore" button.

**Service**: three thin calls in `tournamentService.js` (or a new section
of the admin service code already used by Data fixes).

## Rollout

Apply the migration on staging, clear + restore one match there and check
the league boards, a player profile and the match modal. Then prod, as a
single migration via the management API + migration repair (histories have
drifted; never plain `db push`). Then clear the 7 flagged matches and review
the borderline one by hand.

## Left to the builder

Exact component split, sort/filter UI widgets, the precise SQL for the
review RPC, how the match statistics modal looks for a cleared match
(must not crash).
