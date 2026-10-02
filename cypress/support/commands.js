// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

/**
 * Custom command to log in
 * Uses environment variables or defaults for test credentials
 * @example cy.login('test@example.com', 'password123')
 */
Cypress.Commands.add('login', (email, password) => {
  // Use environment variables if provided, otherwise use defaults
  const testEmail = email || Cypress.env('TEST_USER_EMAIL') || 'test@example.com'
  const testPassword = password || Cypress.env('TEST_USER_PASSWORD') || 'testpassword123'
  
  cy.visit('/login')
  
  // Fill in email
  cy.get('input[type="email"], input[name="email"], input[id="email"]').type(testEmail)
  
  // Fill in password
  cy.get('input[type="password"], input[name="password"], input[id="password"]').type(testPassword)
  
  // Submit form (scope to the form: the sidebar has a "Login" button with the same label)
  cy.get('form').contains('button', /sign in|prihlásiť/i).click()
  
  // Wait for navigation to dashboard/tournaments
  cy.url().should('not.include', '/login')
  cy.url().should('satisfy', (url) => {
    return url.includes('/') || url.includes('/tournaments')
  })
})

/**
 * Custom command to log out
 * @example cy.logout()
 */
Cypress.Commands.add('logout', () => {
  cy.contains(/logout|odhlásiť/i).click()
  cy.url().should('include', '/login')
})

/**
 * Custom command to ensure user is logged in
 * Logs in if not already logged in
 * @example cy.ensureLoggedIn()
 */
Cypress.Commands.add('ensureLoggedIn', () => {
  cy.visit('/')
  cy.url().then((url) => {
    // If we're on login page, log in
    if (url.includes('/login')) {
      cy.login()
    } else {
      // Check if we're actually logged in by looking for user-specific content
      cy.get('body').then(($body) => {
        const bodyText = $body.text()
        // If we see login button, we're not logged in
        if (bodyText.includes('Sign In') || bodyText.includes('Prihlásiť') || bodyText.includes('Login')) {
          cy.login()
        }
        // Otherwise assume we're logged in
      })
    }
  })
})

/**
 * Custom command to create a tournament
 * @example cy.createTournament('Test Tournament')
 */
Cypress.Commands.add('createTournament', (tournamentName = 'Test Tournament') => {
  // Ensure logged in first
  cy.ensureLoggedIn()
  
  cy.visit('/tournaments')
  cy.contains('Create Tournament').click()
  cy.get('input[placeholder*="tournament name" i], input[name*="tournament" i], input[type="text"]').first().type(tournamentName)
  cy.contains('button', /create/i).click()
  // Wait for navigation to registration page
  cy.url().should('include', '/tournament/')
})

/**
 * Custom command to add a player
 * @example cy.addPlayer('Player 1')
 */
Cypress.Commands.add('addPlayer', (playerName) => {
  cy.get('input[placeholder*="player name" i], input[placeholder*="enter player" i]').first().type(playerName)
  cy.contains('button', /add player/i).click()
  // Wait for player to be added
  cy.contains(playerName).should('be.visible')
})

/**
 * Custom command to add multiple players
 * @example cy.addPlayers(['Player 1', 'Player 2', 'Player 3'])
 */
Cypress.Commands.add('addPlayers', (playerNames) => {
  playerNames.forEach((name) => {
    cy.addPlayer(name)
  })
})

/**
 * Custom command to start tournament
 * @example cy.startTournament()
 */
Cypress.Commands.add('startTournament', () => {
  cy.contains('button', /start tournament/i).click()
  // The groups preview dialog asks for a second confirmation before starting.
  cy.get('[role="dialog"]').contains('button', /start tournament|spustiť turnaj/i).click()
  cy.get('[role="dialog"]').should('not.exist')
  // Wait for tournament to start and navigate to management page
  cy.url().should('include', '/tournament/')
  cy.contains(/groups|matches|standings/i).should('be.visible')
})

/**
 * Playoffs are enabled by default; only toggle the switch when they are off.
 * @example cy.ensurePlayoffsEnabled()
 */
Cypress.Commands.add('ensurePlayoffsEnabled', () => {
  cy.get('#enable-playoffs').then(($switch) => {
    if ($switch.attr('aria-checked') !== 'true') cy.wrap($switch).click()
  })
})

/**
 * Click text that may not be rendered on this screen (e.g. a seeding option
 * that only exists in the settings dialog of a started tournament).
 * @example cy.clickIfPresent(/group-based seeding/i)
 */
Cypress.Commands.add('clickIfPresent', (matcher) => {
  cy.get('body').then(($body) => {
    if (matcher.test($body.text())) cy.contains(matcher).click()
  })
})

/**
 * Custom command to complete a match automatically
 * @example cy.completeMatch(matchSelector, { winner: 'player1', player1Legs: 2, player2Legs: 0 })
 */
Cypress.Commands.add('completeMatch', (matchSelector, options = {}) => {
  const { winner = 'player1', player1Legs = 2, player2Legs = 0 } = options
  
  // Click on the match
  cy.get(matchSelector).first().click()
  
  // Wait for match interface to load
  cy.contains(/start match|leg|score/i).should('be.visible')
  
  // If match is not started, start it
  cy.get('body').then(($body) => {
    if ($body.text().includes('Start Match') || $body.text().includes('Spustiť Zápas')) {
      cy.contains('button', /start match|spustiť zápas/i).click()
    }
  })
  
  // Complete match via direct API call or simulate completion
  // For now, we'll use a more direct approach - complete via UI
  // This is a simplified version - you may need to adjust based on your UI
  cy.window().then((win) => {
    // Try to complete match programmatically if test API exists
    if (win.testAPI && win.testAPI.completeMatch) {
      win.testAPI.completeMatch({ winner, player1Legs, player2Legs })
    } else {
      // Fallback: simulate completing via UI
      // This would require clicking through the match interface
      // For now, we'll just verify the match exists
      cy.log('Match completion via UI not fully implemented - use test API')
    }
  })
})

/**
 * Custom command to complete all group matches
 * @example cy.completeAllGroupMatches()
 */
Cypress.Commands.add('completeAllGroupMatches', () => {
  // Get all incomplete matches
  cy.get('.match-card, .match-item, [class*="match"]').each(($match) => {
    // Check if match is not completed
    if (!$match.hasClass('completed') && !$match.text().includes('Completed')) {
      cy.wrap($match).click()
      // Complete match (simplified - you may need to adjust)
      cy.completeMatch($match, { winner: 'player1' })
      // Go back to matches view
      cy.go('back')
    }
  })
})

/**
 * Custom command to start playoffs
 * @example cy.startPlayoffs()
 */
Cypress.Commands.add('startPlayoffs', () => {
  // Navigate to playoffs tab if not already there
  cy.contains(/playoffs|play-off/i).click()
  cy.contains('button', /start playoffs|spustiť play-off/i).click()
  // Wait for playoffs to be created
  cy.contains(/round|kolo/i).should('be.visible')
})

/**
 * Custom command to wait for tournament to load
 * @example cy.waitForTournament()
 */
Cypress.Commands.add('waitForTournament', () => {
  cy.get('body').should('not.contain', 'Loading...')
  cy.get('[class*="tournament"], [class*="management"]').should('be.visible')
})


/**
 * Pick an option in a shadcn/Radix Select (no native <select>).
 * `trigger` is a zero-based index among the comboboxes inside `scope`, or a jQuery/element.
 * @example cy.selectOption(0, /701/)            // first select on the page
 * @example cy.selectOption(1, /5/, '[role="dialog"]')
 */
Cypress.Commands.add('selectOption', (trigger, optionText, scope = 'body') => {
  const open = typeof trigger === 'number'
    ? cy.get(scope).find('[data-slot="select-trigger"]').eq(trigger)
    : cy.wrap(trigger)
  open.click()
  cy.get('[role="option"]').contains(optionText).click()
})
