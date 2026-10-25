# Darts Tournament Management Application

A comprehensive web application for managing darts tournaments with group stages, playoffs, live match tracking, and detailed statistics.

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Core Features by File](#core-features-by-file)
- [Database Schema](#database-schema)
- [Key Functionalities](#key-functionalities)

## Overview

This application allows users to create and manage darts tournaments with the following features:
- Tournament creation and configuration
- Player registration
- Group stage management
- Playoff bracket generation
- Live match tracking
- Real-time statistics and standings
- Multi-language support (Slovak/English)

## Project Structure

```
src/
├── components/          # React components
├── contexts/           # React context providers
├── services/           # API and database services
├── locales/           # Translation files
└── lib/               # Utility libraries
```

## Core Features by File

### Components

#### `src/components/TournamentCreation.jsx`
**Purpose**: Initial tournament setup and configuration

**Key Features**:
- Tournament name input
- Basic settings configuration (legs to win, starting score)
- Playoff settings initialization
  - Enable/disable playoffs
  - Players per group for qualification
  - Legs to win per playoff round (Round of 16, Quarter-finals, Semi-finals, Final)
- Group standings criteria order configuration
  - Customizable order: matches won, leg difference, average, head-to-head
  - Drag-and-drop UI for reordering criteria
- Tournament creation and navigation to registration

#### `src/components/TournamentRegistration.jsx`
**Purpose**: Player registration and tournament settings management

**Key Features**:
- Add/remove players from tournament
- Tournament settings editing
  - Legs to win
  - Starting score
  - Group settings (number of groups)
  - Playoff settings (same as creation)
  - Standings criteria order (same as creation)
- Start tournament button (generates groups and matches)
- Player list management

#### `src/components/TournamentManagement.jsx`
**Purpose**: Main tournament management interface

**Key Features**:
- **Tab Navigation**: Groups, Matches, Standings, Playoffs, Settings
- **Groups Tab**:
  - Display all tournament groups
  - Show players per group
  - Match count per group
- **Matches Tab**:
  - List all matches across all groups
  - Match status indicators (pending, in progress, completed, live)
  - Live match detection (this device vs other device)
  - Continue/view match buttons
  - Match result display with averages
- **Standings Tab**:
  - Group standings tables
  - Sorted by customizable criteria order
  - Shows: position, player, matches played, won, lost, leg difference, average, points
  - Real-time updates after match completion
- **Playoffs Tab**:
  - Playoff bracket visualization
  - Start playoffs button (creates empty bracket)
  - Manual player assignment via Edit button
  - Edit playoff match players (admin only)
  - Playoff match status tracking
  - Automatic winner advancement to next round
  - Round-by-round legs to win configuration
- **Settings Tab**:
  - Edit tournament settings
  - Update playoff settings
  - Update standings criteria order
- **Additional Features**:
  - Delete tournament (admin only)
  - Tournament status management
  - Live match indicators

#### `src/components/MatchInterface.jsx`
**Purpose**: Live match gameplay interface

**Key Features**:
- **Match Setup**:
  - "Who should start?" dialog (only for new matches)
  - Match state persistence in localStorage
  - Resume in-progress matches
- **Gameplay**:
  - Score input (number buttons 0-9, backspace, enter)
  - Turn-based scoring
  - Leg completion detection
  - Checkout calculation
  - Dart counting per leg and match
  - Average calculation (per leg and match)
- **Match State Management**:
  - Current leg tracking
  - Current player tracking
  - Score persistence
  - Match completion handling
- **Statistics**:
  - Leg averages
  - Match averages
  - Total darts thrown
  - Checkout tracking
  - Player statistics (totalScore, totalDarts)
- **Match Completion**:
  - Winner determination
  - Result saving to database
  - Statistics calculation for both players (even losers)
  - Playoff match progression handling

### Contexts

#### `src/contexts/TournamentContext.jsx`
**Purpose**: Global tournament state management

**Key Features**:
- Tournament state management (create, select, update, delete)
- Match lifecycle management (start, complete)
- Group standings calculation
  - Customizable criteria order
  - Head-to-head tracking
  - Cumulative average calculation
- Playoff bracket management
  - Round generation
  - Winner advancement
  - Bracket updates
- Tournament settings management
- LocalStorage synchronization
- Supabase integration

**Key Functions**:
- `createTournament()`: Create new tournament
- `selectTournament()`: Select active tournament
- `getTournament()`: Load tournament from database
- `startMatch()`: Start a match
- `completeMatch()`: Complete a match and update standings
- `startPlayoffs()`: Initialize playoff bracket
- `updateTournamentSettings()`: Update tournament configuration
- `updateGroupStandings()`: Recalculate group standings

#### `src/contexts/LiveMatchContext.jsx`
**Purpose**: Live match tracking across devices

**Key Features**:
- Track matches in progress
- Device-specific match tracking
- Live match synchronization
- Match cleanup on completion
- LocalStorage persistence

#### `src/contexts/AdminContext.jsx`
**Purpose**: Admin/Scorer authentication and permissions

**Key Features**:
- Admin authentication
- Permission checking
- Role-based UI access

#### `src/contexts/LanguageContext.jsx`
**Purpose**: Multi-language support

**Key Features**:
- Language switching (Slovak/English)
- Translation management
- UI text localization

### Services

#### `src/services/tournamentService.js`
**Purpose**: Tournament database operations

**Key Features**:
- **Tournament CRUD**:
  - `createTournament()`: Create tournament with players, groups, matches
  - `getTournament()`: Load single tournament with all data
  - `updateTournamentSettings()`: Update tournament configuration
  - `deleteTournament()`: Delete tournament
- **Group Standings**:
  - `calculateGroupStandings()`: Calculate standings with customizable criteria
  - Supports: matches won, leg difference, average, head-to-head
  - Cumulative average calculation across all matches
- **Playoff Management**:
  - `updateTournamentPlayoffs()`: Save playoff bracket to database
  - `startTournament()`: Generate groups and matches
- **Player Management**:
  - `addPlayerToTournament()`: Add player to tournament
- **Data Transformation**:
  - Database to app structure conversion
  - Match player stats loading
  - Group settings parsing (JSONB)

#### `src/services/matchService.js` (within tournamentService.js)
**Purpose**: Match database operations

**Key Features**:
- `startMatch()`: Start a match (create or update)
- `saveMatchResult()`: Save match result and statistics
- `endLiveMatch()`: Clear live match tracking
- Match player stats saving
- Playoff match creation

### Utilities

#### `src/lib/supabase.js`
**Purpose**: Supabase client configuration

**Key Features**:
- Supabase client initialization
- ID generation utilities

## Database Schema

The schema, RLS policies and RPCs come only from `supabase/migrations/`, applied in order. `supabase/tests/` holds SQL self-checks. Do not apply hand-written SQL to production outside a migration.

### Tables

- **tournaments**: Tournament metadata, settings, playoff data
- **players**: Player information
- **tournament_players**: Tournament-player relationships
- **groups**: Tournament groups
- **group_players**: Group-player assignments
- **matches**: Match information (group and playoff)
- **match_player_stats**: Player statistics per match

### Key JSONB Columns

- **tournaments.group_settings**: Contains `standingsCriteriaOrder` array
- **tournaments.playoff_settings**: Contains `legsToWinByRound` object
- **tournaments.playoffs**: Playoff bracket structure

## Key Functionalities

### 1. Tournament Creation Flow
1. `TournamentCreation.jsx` → Configure basic settings
2. `TournamentRegistration.jsx` → Add players, finalize settings
3. Start tournament → Generate groups and matches
4. `TournamentManagement.jsx` → Manage tournament

### 2. Match Playback Flow
1. Select match in `TournamentManagement.jsx`
2. `MatchInterface.jsx` → Play match
3. Match state saved to localStorage
4. On completion → Save to database
5. Update standings in `TournamentContext.jsx`

### 3. Standings Calculation
1. Uses `calculateGroupStandings()` in `tournamentService.js`
2. Criteria order from `tournament.group_settings.standingsCriteriaOrder`
3. Calculates cumulative averages from all matches
4. Sorts by customizable criteria priority

### 4. Playoff Management
1. Start playoffs → Create empty bracket
2. Manually assign players via Edit button
3. Play matches → Winners advance automatically
4. Bracket updates saved to database

### 5. Live Match Tracking
1. `LiveMatchContext.jsx` tracks active matches
2. Device-specific tracking
3. Status indicators in `TournamentManagement.jsx`
4. Cleanup on match completion

## Configuration

### Standings Criteria Order
Configured in tournament settings, stored in `group_settings.standingsCriteriaOrder`:
- `matchesWon`: Number of matches won
- `legDifference`: Difference between legs won and lost
- `average`: Cumulative match average
- `headToHead`: Head-to-head record

### Playoff Settings
Stored in `playoff_settings.legsToWinByRound`:
- `16`: Round of 16
- `8`: Quarter-finals
- `4`: Semi-finals
- `2`: Final

## Localization

Translation files in `src/locales/`:
- `en.json`: English translations
- `sk.json`: Slovak translations

Keys organized by feature area (management, registration, common, etc.)
