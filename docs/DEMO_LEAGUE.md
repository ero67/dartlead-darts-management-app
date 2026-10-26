# Demo league

`scripts/seed-demo-league.mjs` fills an environment with a finished, realistic
league for sales demos: **Demo Liga Šípky**. It has 14 fictional players and four
Friday rounds over the past four weeks. Each round has groups and an 8-player
single-elimination playoff with a 3rd-place match. Round 3 is Cricket and the
others are 501 double-out. The script also fills the league leaderboard and the
statistics tabs. The 4th round is the one to show: its public `/tournament/:id`
and `/tv/:id` links are printed at the end.

The script writes everything through the app's own services as an ordinary
manager, so RLS applies exactly as in the app. It uses no service key and no
SQL. The app's engines and bots play the matches. Each bot is fixed at a
3-dart average between 45 and 86. The seed is fixed, so every run produces
the same results.

## 1. Create the demo manager account (once per environment)

1. Sign up in the app with a dedicated address, e.g. `demo@<your-domain>`, and
   confirm the email.
2. As an admin, open **Admin**, find the account and give it the `manager` role
   (see `MDDocs/ADMIN_SETUP.md`).

Use this account only for the demo. The players it creates belong to its own
roster.

Locally you can create it with SQL instead. Insert the user into `auth.users`
with `raw_app_meta_data.role = 'manager'` and add an `auth.identities` row, the
same way as `admin@local.test` in `supabase/seed.sql`.

## 2. Run

Requirements:

- `npm install`.
- Headless Chromium for playwright-core:
  `npx -y playwright@1.58.2 install chromium-headless-shell`. The script finds
  playwright-core in the npx cache. Set `PLAYWRIGHT_CORE=/path/to/playwright-core`
  to use a different copy.

```bash
# local stack (.env.local)
DEMO_EMAIL=demo@local.test DEMO_PASSWORD=... node scripts/seed-demo-league.mjs

# another environment: the Vite mode picks the env file (.env.<mode>.local)
DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/seed-demo-league.mjs --mode production
```

The script prints the target Supabase URL first. It starts its own Vite dev
server on port 5199 (change it with `--port`), signs in through the login form
and runs the app code in the page. The **Start Playoffs** button is clicked in
the real UI, because the bracket is generated in the tournament page.

A full run takes a few minutes: about 170 matches. When it finishes, it prints
the league id, every round's id and the showcase URLs. They use
`VITE_PUBLIC_APP_URL`, or `http://localhost:5173` when that is not set.

## 3. Reset / rerun

If the demo league already exists, the script refuses to run. Add `--reset` to
replace it. The reset soft-deletes the previous demo rounds and the league
(`deleteTournament` and `deleteLeague`, the same as in the app), then builds
everything again. The player rows are reused.

## Notes

- **Dates.** Rounds are backdated to the last four Fridays from 19:00. This
  uses the generic update services for `tournaments.created_at` and
  `leagues.created_at`. No service sets a match's completion time, so
  `matches.completed_at` is updated with the app's Supabase client. RLS still
  applies.
- **Logged-out visitors.** Tournament pages and the TV view work without
  login. League pages (leaderboard, statistics) need a login, because league
  tables are readable only by authenticated users.
