# How Statistics Work in the Tournament App

## Overview
Statistics are calculated from completed matches in the current tournament. The data flows from the database through the tournament service to the statistics view.

## Database Tables and Columns Used

### 1. Primary Query: `getTournament(tournamentId)`

**Table: `tournaments`**
- `id` - Tournament ID (filtered by this)
- `deleted` - Must be `false` (filtered)
- `status` - Tournament status

**Nested Query: `groups` (via tournament_id foreign key)**
- `id` - Group ID
- `tournament_id` - Links to tournaments table
- `name` - Group name (e.g., "Group A")

**Nested Query: `matches` (via group_id foreign key)**
- `id` - Match ID
- `group_id` - Links to groups table (NULL for playoff matches)
- `status` - Match status (must be 'completed' for statistics)
- `winner_id` - Winner player ID
- `player1_id` - Player 1 ID
- `player2_id` - Player 2 ID
- `player1_legs` - Player 1 legs won
- `player2_legs` - Player 2 legs won
- **`result`** - **JSONB column containing match statistics** ⭐ KEY COLUMN

**Joined Table: `players`**
- `id` - Player ID
- `name` - Player name
- Joined via `player1_id` and `player2_id` foreign keys

### 2. Secondary Query: `match_player_stats` table

**Table: `match_player_stats`**
- `match_id` - Links to matches table
- `player_id` - Links to players table
- `total_score` - Total score for the match
- `total_darts` - Total darts thrown
- `average` - Match average
- `highest_checkout` - Highest checkout value
- `legs_won` - Legs won
- `legs_lost` - Legs lost

**Note:** This table is queried separately and used as a fallback if `matches.result` JSONB doesn't have complete data.

### 3. Playoff Matches Query

**Table: `matches`** (separate query)
- `is_playoff` - Must be `true`
- `result` - JSONB column (same structure as group matches)
- `playoff_round` - Playoff round number
- `playoff_match_number` - Match number in round

## The `matches.result` JSONB Column Structure

This is the **PRIMARY SOURCE** for statistics. It contains:

```json
{
  "winner": "player_id",
  "player1Legs": 3,
  "player2Legs": 1,
  "player1Stats": {
    "totalScore": 1503,
    "totalDarts": 45,
    "average": 100.2,
    "checkouts": [
      {
        "checkout": 170,
        "leg": 1,
        "totalDarts": 15,
        "darts": 15
      }
    ],
    "legs": [
      {
        "leg": 1,
        "isWin": true,
        "darts": 15,
        "checkout": 170
      }
    ],
    "legAverages": [100.2, 95.5, 105.0]
  },
  "player2Stats": {
    "totalScore": 1503,
    "totalDarts": 48,
    "average": 93.9,
    "checkouts": [...],
    "legs": [...],
    "legAverages": [...]
  }
}
```

## Statistics Collection Flow

### Step 1: Data Fetching (`tournamentService.getTournament()`)

1. **Query tournaments table** with tournament ID
2. **Nested query groups** - automatically filtered by `tournament_id` foreign key
3. **Nested query matches** - automatically filtered by `group_id` foreign key
4. **Separate query match_player_stats** - filtered by `match_id` (used as fallback)
5. **Separate query playoff matches** - filtered by `is_playoff = true`

### Step 2: Data Transformation

For each match in each group:
- If `match.winner_id` exists, create `match.result` object
- **Primary source:** `match.result` JSONB column (if exists)
- **Fallback source:** Build from `match_player_stats` table + basic match columns

### Step 3: Statistics Processing (`renderStatistics()`)

The statistics view processes matches from:
- `tournament.groups[].matches[]` - Group matches
- `tournament.playoffMatches[]` - Playoff matches

**Filter:** Only processes matches where:
- `match.status === 'completed'`
- `match.result` exists
- `match.result.player1Stats` or `match.result.player2Stats` exists

**Statistics Extracted:**

1. **Best Averages** (`allAverages`)
   - From: `match.result.player1Stats.average`
   - From: `match.result.player2Stats.average`

2. **Best Checkouts** (`allCheckouts`)
   - From: `match.result.player1Stats.checkouts[]`
   - From: `match.result.player2Stats.checkouts[]`
   - Each checkout has: `checkout` (value), `leg`, `totalDarts`/`darts`

3. **Fewest Darts** (`allLegs`)
   - From: `match.result.player1Stats.legs[]`
   - From: `match.result.player2Stats.legs[]`
   - Each leg has: `darts`, `leg`, `checkout`, `isWin`

## Key Points

1. **Tournament Filtering:** Matches are automatically filtered by tournament because:
   - Groups are filtered by `tournament_id`
   - Matches are filtered by `group_id` (which belongs to a tournament)

2. **Primary Data Source:** `matches.result` JSONB column
   - This is where match statistics are stored when a match is completed
   - Contains all player stats, checkouts, and leg details

3. **Fallback Data Source:** `match_player_stats` table
   - Used if `matches.result` doesn't exist or is incomplete
   - Only provides basic stats (average, total score, total darts)

4. **Statistics Only Show:**
   - Matches with `status = 'completed'`
   - Matches with `result` JSONB containing player stats
   - Only from the current tournament's groups

## Potential Issues

1. **Missing `result` JSONB:** If a match is completed but `result` is NULL, statistics won't show
2. **Incomplete `result` structure:** If `player1Stats` or `player2Stats` are missing, that player's stats won't appear
3. **Orphaned matches:** Matches with NULL `group_id` or invalid `group_id` might appear in wrong tournaments (now filtered out)

## Playoff Matches in Statistics

**Current Implementation:**
Playoff matches are included in statistics by filtering matches where:
- `matches.is_playoff = true`
- `matches.tournament_id` matches the current tournament ID

**How it works:**
1. Query playoff matches directly filtered by `tournament_id`
2. Process these matches the same way as group matches

**Database Schema:**
- `matches.tournament_id` - Direct foreign key to `tournaments.id`
- For group matches: `tournament_id` is set from `groups.tournament_id`
- For playoff matches: `tournament_id` is set when the match is created (looked up from players if not provided)

**Migration:**
Run `add-tournament-id-to-matches.sql` to add the `tournament_id` column to existing databases.

## How to Check if Statistics Should Appear

For a completed match to show statistics:

1. ✅ `matches.status = 'completed'`
2. ✅ `matches.winner_id` is set (or match has result)
3. ✅ `matches.result` JSONB exists and contains:
   - `player1Stats.average` (for averages)
   - `player1Stats.checkouts[]` (for checkouts)
   - `player1Stats.legs[]` (for fewest darts)
   - Same for `player2Stats`

**For playoff matches:**
4. ✅ Both players must be in the tournament's player list

## SQL Query to Check Match Statistics

```sql
SELECT 
    m.id,
    m.status,
    m.winner_id,
    m.result IS NOT NULL as has_result,
    CASE 
        WHEN m.result::jsonb->'player1Stats'->>'average' IS NOT NULL THEN true
        ELSE false
    END as has_player1_stats,
    CASE 
        WHEN m.result::jsonb->'player2Stats'->>'average' IS NOT NULL THEN true
        ELSE false
    END as has_player2_stats,
    g.tournament_id,
    t.name as tournament_name
FROM matches m
LEFT JOIN groups g ON m.group_id = g.id
LEFT JOIN tournaments t ON g.tournament_id = t.id
WHERE m.status = 'completed'
ORDER BY t.created_at DESC, m.id;
```

