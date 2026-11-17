# Match Stats Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin tool to find matches with fake throwing stats, clear those stats (with a backup), and restore them, without touching results.

**Architecture:** One migration adds a backup table and three admin-only RPCs (review, clear, restore); all detection logic lives in SQL and is covered by a SQL self-check. A new `MatchStatsCleanup` component in Admin → Data fixes calls them through three thin `tournamentService` methods.

**Tech Stack:** Supabase Postgres (plpgsql), React 19, shadcn/ui, Sonner toasts, `confirmDialog()`.

**Spec:** `docs/superpowers/specs/2026-11-17-match-stats-cleanup-design.md`

## Global Constraints

- Work on branch `feat/match-stats-cleanup` from `origin/main` in a worktree; the main checkout has unrelated uncommitted work on `feat/celebrations-polish`.
- Every RPC: `SECURITY DEFINER`, `SET search_path = ''`, first statement `IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;`, `REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;`. Migration idempotent (`CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`).
- Never modify `winner_id`, `player1_legs`, `player2_legs`, `status`, `completed_at`, or `match_player_stats.legs_won/legs_lost`.
- X01 only: skip matches whose tournament has `game_type = 'cricket'`.
- Clear: ≤ 20 ids per call, all from one tournament.
- Flags: *repetitive* = side has ≥ 8 visits and ≥ 50% of `visitScores` share one value; *above average* = match average ≥ player's own average + 15 (own average = 3 × Σ totalScore / Σ totalDarts over their other completed X01 matches in the same league).
- Admin panel UI copy is English (no `t()`), like the rest of `AdminPanel.jsx`. Named exports only.
- Each clear/restore writes one `admin_audit_log` row per match (`action` = `'clear_match_stats'` / `'restore_match_stats'`, `target_user_id` = tournament owner, `details` = `{match_id, tournament_id}`).
- No personal data in fixtures: test players are "P1", "P2"…

## Review Focus

1. A match cleared, then re-scored by a manager, then "Restore" pressed: newer real stats must not be overwritten (skip `'rescored'`). Test in Task 1.
2. Double click / second clear of the same match: must not replace the backup with empty stats (skip `'already_cleared'` + partial unique index). Test in Task 1.
3. Match with a `result` but no `player1Stats` (results-only entry, many in 3.kolo): review shows it with null stats and no flags; clear skips it `'no_stats'`. Test in Task 1.
4. `checkout` / `darts` values stored as JSON strings vs numbers: review must cast via `->>` then `::numeric`, never compare text (a text max put "81" above "141" during recon). Test in Task 1 (seed one checkout as a string).
5. Viewing a cleared match afterwards (match statistics modal, player profile, league stats tab) must render without errors. Checked in Task 2 Step 6.

---

### Task 1: Migration + SQL self-check

**Files:**
- Create: `supabase/migrations/20261117120000_match_stats_cleanup.sql`
- Test: `supabase/tests/match_stats_cleanup.sql`

**Interfaces:**
- Produces:
  - Table `public.match_stats_backups(id uuid pk default gen_random_uuid(), match_id uuid not null references matches(id) on delete cascade, result_stats jsonb not null, player_stats jsonb not null, cleared_by uuid, cleared_at timestamptz not null default now(), restored_by uuid, restored_at timestamptz)`; RLS enabled, no policies; `CREATE UNIQUE INDEX ... ON match_stats_backups(match_id) WHERE restored_at IS NULL`.
  - `public.admin_match_stats_review(p_league_id uuid) RETURNS TABLE(match_id uuid, tournament_id uuid, tournament_name text, tournament_created_at timestamptz, completed_at timestamptz, is_playoff boolean, has_stats boolean, stats_cleared boolean, p1 jsonb, p2 jsonb)` ordered by `tournament_created_at, completed_at`. Each side jsonb: `{id, name, legs, average, bestCheckout, fewestDarts, oneEighties, visits, repeatShare, ownAverage, repetitive, aboveAverage}` (numbers or null). Rows: completed matches of non-deleted, non-cricket tournaments with `league_id = p_league_id`.
  - `public.admin_clear_match_stats(p_match_ids uuid[]) RETURNS jsonb` → `{"cleared":[uuid…],"skipped":[{"match_id":uuid,"reason":text}…]}`. Raises `'too_many_matches'` (> 20) and `'mixed_tournaments'` (ids span > 1 tournament), both ERRCODE `22023`. Skip reasons: `not_found`, `not_completed`, `cricket`, `already_cleared`, `no_stats`.
  - `public.admin_restore_match_stats(p_match_ids uuid[]) RETURNS jsonb` → `{"restored":[…],"skipped":[{"match_id","reason"}…]}`. Skip reasons: `no_backup`, `rescored` (match `result` has `player1Stats` or `player2Stats` again).

- [ ] **Step 1: Write the failing self-check** `supabase/tests/match_stats_cleanup.sql`, in the style of `supabase/tests/review_security_fixes.sql` (header with run command, `BEGIN … ROLLBACK`, users in `auth.users` with `raw_app_meta_data` role, `set_config('request.jwt.claims', …)` + `SET LOCAL ROLE authenticated`, ends with `SELECT 'ALL ASSERTS PASSED';`). Seed: one admin, one manager; league L; X01 tournaments T1, T2 and cricket tournament TC; players P1–P3; matches:
  - `MF` (T1, 2:0, P1 wins): p1 `visitScores` 10× `60` + 2 others, p2 `visitScores` 12× `60`, p1 checkouts `[{"checkout":"141"}]` (string) and `[{"checkout":81}]`, legs `[{darts:21,isWin:true},…]`, `oneEighties` 0, `average` 70, totals set; matching `match_player_stats` rows (total_darts, total_score, average, highest_checkout non-zero, legs_won 2/0).
  - `MN` (T1, normal): 12 varied visits per side, average 40.
  - `MR` (T1): `result` without `player1Stats`/`player2Stats`.
  - `MT2` (T2, normal), `MC` (TC, cricket, with stats).
  
  Asserts:
  - as manager: each of the three RPCs raises SQLSTATE `42501`.
  - review(L): `MF` p1 `repetitive` true, `bestCheckout` = 141 (numeric, beats 81), `fewestDarts` = 21; `MN` both sides `repetitive` false; `MR` `has_stats` false; no row for `MC`.
  - clear(`{MF, MR}`): `cleared` = `[MF]`, `MR` skipped `no_stats`; `MF.result` has no `player1Stats`/`player2Stats` keys, `winner_id`/legs/status unchanged; its `match_player_stats` rows have total_darts/total_score/average/highest_checkout = 0 and legs_won unchanged; one open backup row; 1 `admin_audit_log` row `clear_match_stats`; review shows `stats_cleared` true.
  - clear(`{MF}`) again → skipped `already_cleared`; still one backup row.
  - clear(`{MN, MT2}`) raises `22023` (mixed); clear of 21 ids raises `22023`; clear(`{MC}`) skipped `cricket`.
  - restore(`{MF}`): `result->'player1Stats'` and `match_player_stats` values equal the seeded originals; backup `restored_at` not null.
  - rescored case: clear `MN`, then `UPDATE matches SET result = result || '{"player1Stats":{"average":1}}'` on `MN`, restore(`{MN}`) → skipped `rescored`, `MN.result->'player1Stats'->>'average'` still `'1'`.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx supabase start   # stop the tonight stack first if running
docker exec -i supabase_db_dartlead-darts-management-app psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/match_stats_cleanup.sql
```
Expected: ERROR, relation/function `admin_match_stats_review` does not exist.

- [ ] **Step 3: Write the migration** with the interfaces above. Header comment in the style of `20261029130000_admin_cleanup.sql` (what, why, "Installed Android apps don't call any of these. Idempotent."). Clear locks the match rows `FOR UPDATE`, inserts the backup (`result_stats` = `jsonb_build_object('player1Stats', result->'player1Stats', 'player2Stats', result->'player2Stats')`, `player_stats` = `jsonb_agg(to_jsonb(mps))` of that match's `match_player_stats` rows, `'[]'` when none) before removing keys with `result - 'player1Stats' - 'player2Stats'`. Restore writes back each `player_stats` element's four stat columns by `id`. Own average in review uses a CTE over all the league's X01 match sides, then subtracts the current match's totals.

- [ ] **Step 4: Apply and run the self-check**

```bash
npx supabase migration up
docker exec -i supabase_db_dartlead-darts-management-app psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/match_stats_cleanup.sql
```
Expected last line: `ALL ASSERTS PASSED`. Also run the migration file a second time with psql: no error (idempotent).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261117120000_match_stats_cleanup.sql supabase/tests/match_stats_cleanup.sql
git commit -m "Let admins clear and restore fake match stats with a backup"
```

### Task 2: Admin UI + service calls

**Files:**
- Create: `src/components/MatchStatsCleanup.jsx`
- Modify: `src/services/tournamentService.js` (next to `purgeTournaments`, ~line 1987)
- Modify: `src/components/AdminPanel.jsx` (render inside `<TabsContent value="data">`, ~line 1115, as the first card)

**Interfaces:**
- Consumes: Task 1 RPCs.
- Produces: `tournamentService.getMatchStatsReview(leagueId) → Promise<Row[]>`, `tournamentService.clearMatchStats(matchIds) → Promise<{cleared, skipped}>`, `tournamentService.restoreMatchStats(matchIds) → Promise<{restored, skipped}>`. Same shape as `purgeTournaments` (`if (error) throw new Error(error.message)`). `export function MatchStatsCleanup()` (no props).

- [ ] **Step 1: Add the three service methods.**

- [ ] **Step 2: Build `MatchStatsCleanup`** (Card titled "Match stats", description "Clear made-up averages, checkouts and darts from matches. Results stay. Cleared stats can be restored."):
  - League `Select` from `leagueService.getLeagues()`; on change load the review rows.
  - Round `Select` from the rows' distinct tournaments, label `"{name} ({n} suspicious)"`, where suspicious = any side `repetitive || aboveAverage`. Default: first round with suspicious > 0, else first.
  - Player filter `Input` (case-insensitive substring on either side's name) and "Suspicious only" `Switch` (default on).
  - `Table` columns: checkbox, players + legs score, then per side average / best checkout / fewest darts / 180s; sortable by those four (click header, desc first; fewest darts asc first). Flag `Badge`s on a side: "Repetitive visits ({repeatShare as %})", "+{average − ownAverage} over own avg". Cleared rows show a "Cleared" badge and a "Restore" button instead of a checkbox; rows with `has_stats` false show "No stats" and no checkbox.
  - "Clear stats ({n})" button, disabled at 0 or > 20 selected. On click: `confirmDialog()` with `destructive: true`, title "Clear stats of {n} matches?", message listing each match `"P1 vs P2 · avg 70.0 / 65.3 · best CO 141 / 81 · fewest 21 / – darts"` and the line "Winners and legs stay. You can restore from the backup."; then call, `toast.success` with cleared count, `toast.warning` listing skipped reasons if any, reload rows, clear selection. Restore: same with title "Restore stats?". Errors → `toast.error(error.message)`.

- [ ] **Step 3: Render `<MatchStatsCleanup />` in the Data fixes tab.**

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors in the three touched files.

- [ ] **Step 5: Verify in the browser against the local stack.** Seed (scratchpad SQL, not committed) a league with one completed tournament containing a repetitive match like `MF` and a normal one; sign in as `admin@local.test` / `password123` on `npm run dev -- --port 5174`; Admin → Data fixes → pick the league: the round shows "(1 suspicious)", the toggle hides the normal match, clear it via the dialog, row shows "Cleared", Restore brings the numbers back.

- [ ] **Step 6: Check cleared-match rendering.** With the seeded match cleared, open the league Statistics tab, both players' profiles, and the match statistics modal from the tournament: no console errors, cleared match contributes no average/checkout. Fix any reader that crashes on missing `player1Stats` (guard only, no feature change).

- [ ] **Step 7: Commit**

```bash
git add src/components/MatchStatsCleanup.jsx src/components/AdminPanel.jsx src/services/tournamentService.js
git commit -m "Add match stats cleanup to the admin Data fixes tab"
```

### Task 3: Rollout (needs the user's go-ahead at each environment)

- [ ] **Step 1:** Ask the user before applying. Apply the migration to staging (`wtnhrlvdwyzqvtawljgm`) as a single migration via the management API, then `supabase migration repair --status applied 20261117120000`; deploy web with `npx vercel --prod` per the staging memory; clear + restore one match there.
- [ ] **Step 2:** Ask again, then the same on prod (`hdorqfkaiigjlwobupnq`). Open a PR to `main` (web deploys on merge). No Android release needed: installed apps never call these RPCs and already tolerate missing stats.
- [ ] **Step 3:** Hand over to the user to clear the 7 flagged matches (3.kolo: `580878a3`, `e9661bdf`, `2048aa50`, `e2e6ed8a`, `0d2e5daa`; 5.kolo: `3bc7c484`, `5afa7205`) and decide on the borderline `0903a979`.
