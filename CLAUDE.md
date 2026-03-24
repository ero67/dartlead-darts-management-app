# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Dev server at localhost:5173
npm run build            # Production build (Vite)
npm run lint             # ESLint
npm run preview          # Preview production build

# E2E Tests (Cypress) - requires dev server running
npm run test:e2e         # All tests headless
npm run test:e2e:open    # Cypress interactive UI
npm run test:e2e:headed  # Tests with visible browser

# Single test file
npx cypress run --spec "cypress/e2e/<test-file>.cy.js"
```

## Architecture

React 19 SPA with Supabase (PostgreSQL + Auth) backend, built with Vite, deployed on Vercel.

### State Management

Six React Context providers (nested in App.jsx), no Redux:

- **TournamentContext** — useReducer-based CRUD, match lifecycle, standings. Syncs to localStorage.
- **LeagueContext** — useReducer-based league CRUD, member/leaderboard management.
- **LiveMatchContext** — tracks which device/board is running which match (uses Maps).
- **AuthContext** — wraps Supabase Auth (email/password + Google OAuth). Roles (`admin`/`manager`) stored in `user_metadata.role`.
- **AdminContext** — exposes `isAdmin`, `isManager`, `canCreateTournaments` from auth metadata.
- **LanguageContext** — Slovak/English with `t('key.path')` lookup, falls back to English. Persists to localStorage.
- **ThemeContext** — dark/light mode toggle, persists to localStorage.

### Services Layer

`src/services/tournamentService.js` and `leagueService.js` contain all Supabase queries and business logic (standings calculation, playoff bracket management, match scoring). Components call services through context dispatch actions.

### Key Business Logic

- **Standings**: customizable sort order (matches won → leg difference → average → head-to-head). Average = totalScore / totalDarts * 3 (cumulative across matches).
- **Playoffs**: manual player assignment to bracket, automatic winner advancement through rounds. Bracket stored as JSONB in `tournaments.playoffs`.
- **Match Interface**: full dart scoring UI with undo support, leg tracking, bust detection. Match state persisted to localStorage for crash recovery.
- **Tournament flow**: Creation → Registration → Group Stage (round-robin) → Playoffs → Completed.

### Database

Supabase with JSONB columns for complex nested data (`group_settings`, `playoff_settings`, `playoffs`). Snake_case DB columns mapped to camelCase in app. Key tables: `tournaments`, `players`, `tournament_players`, `groups`, `group_players`, `matches`, `match_player_stats`, `legs`, `dart_throws`.

### Routing

React Router v7 with session-based persistence — tournament/match IDs stored in `sessionStorage` to survive refreshes. Route guards check admin/manager roles for creation and management pages.

### Localization

All user-facing strings go through `t()` from `useLanguage()`. Translations live in `src/locales/en.json` and `src/locales/sk.json`. Both files must be updated together.

### Styling

Single monolithic `App.css` (~170KB). BEM-like class naming. CSS custom properties for theming in `index.css`. Mobile breakpoint at 1024px.

## Code Conventions

See `AGENTS.md` for full details. Key points:

- Named exports only (no default exports)
- Import order: React → external libs → contexts → components → services → CSS
- Components: PascalCase `.jsx` | Services: camelCase `.js`
- Event handlers prefixed with `handle`, booleans with `is`/`has`/`can`
- Supabase calls use async/await with try/catch, check `error` on response
- Cypress tests use `cy.login()` custom command and i18n-aware selectors (`/english|slovenský/i`)

## Environment

Requires `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
