# AGENTS.md

Coding agent guidelines for the DartLead darts tournament management application.

## Project Overview

React 19 + Vite application with Supabase backend for managing darts tournaments, leagues, and match scoring. Uses Cypress for E2E testing.

## Build/Lint/Test Commands

```bash
npm run dev          # Start development server (localhost:5173)
npm run build        # Production build
npm run lint         # Run ESLint
npm run preview      # Preview production build

# E2E Tests (Cypress)
npm run test:e2e              # Run all E2E tests headless
npm run test:e2e:open         # Open Cypress UI
npm run test:e2e:headed       # Run tests in headed mode

# Run a single test file
npx cypress run --spec "cypress/e2e/tournament-creation.cy.js"
npx cypress run --spec "cypress/e2e/match-completion.cy.js"
```

## Code Style Guidelines

### Imports

Group imports in this order, separated by blank lines:
1. React imports
2. External libraries (react-router-dom, lucide-react, etc.)
3. Internal contexts
4. Internal components
5. Internal services/utils
6. CSS imports

```javascript
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useTournament } from './contexts/TournamentContext';
import { Navigation } from './components/Navigation';
import { tournamentService } from './services/tournamentService';
import './App.css';
```

### File Naming

- **Components**: PascalCase with `.jsx` extension (e.g., `TournamentCreation.jsx`)
- **Contexts**: PascalCase with `.jsx` extension (e.g., `AuthContext.jsx`)
- **Services**: camelCase with `.js` extension (e.g., `tournamentService.js`)
- **Utils**: camelCase with `.js` extension (e.g., `testAPI.js`)
- **CSS**: PascalCase matching component name (e.g., `BracketVisualization.css`)

### Component Structure

Export named functions, not default exports. Use useState for local state, useContext for context access.

### Context Pattern

```javascript
const ContextName = createContext();

export function ContextProvider({ children }) {
  const [state, setState] = useState(initialState);
  const value = { state, action };
  return <ContextName.Provider value={value}>{children}</ContextName.Provider>;
}

export function useContextName() {
  const context = useContext(ContextName);
  if (!context) throw new Error('useContextName must be used within a ContextProvider');
  return context;
}
```

### Service Pattern

Export an object with methods. Always use async/await with try/catch:

```javascript
export const serviceName = {
  async methodOne(params) {
    try {
      const { data, error } = await supabase.from('table').select();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error description:', error);
      throw error;
    }
  }
};
```

### Naming Conventions

- **Components**: PascalCase (`TournamentManagement`, `MatchInterface`)
- **Functions/Methods**: camelCase (`handleMatchStart`, `calculateGroupStandings`)
- **Constants**: UPPER_SNAKE_CASE for action types (`ACTIONS.CREATE_TOURNAMENT`)
- **CSS classes**: kebab-case (`tournament-card`, `status-badge`)
- **Event handlers**: Prefix with `handle` (`handleClick`, `handleSubmit`)
- **Boolean variables**: Prefix with `is`, `has`, `can` (`isLoading`, `hasPlayoffs`, `canCreateTournaments`)

### Error Handling

Use try/catch with descriptive console.error messages. Return error objects for user-facing operations:

```javascript
const signUp = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};
```

### State Management

- Use React Context with useReducer for complex state (tournaments, auth)
- Use useState for local component state
- Store session data in sessionStorage for persistence across refreshes

### Database (Supabase)

- Use snake_case for database columns (`player1_id`, `legs_to_win`)
- Transform to camelCase when mapping to app state (`player1Id`, `legsToWin`)
- Handle JSONB fields that may be strings from Supabase

### Testing (Cypress)

- Use `beforeEach()` for login and navigation setup
- Use `cy.login()` custom command (defined in support)
- Use i18n-aware selectors: `/create tournament|vytvoriť turnaj/i`
- Place tests in `cypress/e2e/` with descriptive filenames

### Localization

- Use `useLanguage()` hook to access `t()` function
- Add translations to both `src/locales/en.json` and `src/locales/sk.json`
- Translation keys use dot notation: `t('dashboard.title')`

### Environment Variables

Required in `.env.local`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### CSS/Styling

- Use CSS files, not CSS-in-JS
- Follow BEM-like naming: `.component-name`, `.component-name__element`, `.component-name--modifier`
- Use CSS custom properties for theming (defined in `index.css`)

### Code Comments

Minimize comments. Code should be self-documenting through clear naming. Add comments only for complex algorithms, non-obvious business logic, or workarounds for external limitations.
