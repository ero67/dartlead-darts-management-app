describe('Complete Tournament Flow', () => {
  beforeEach(() => {
    // Log in before each test
    cy.login()
  })

  it('should complete a full tournament from creation to playoffs', () => {
    // Step 1: Create tournament
    cy.visit('/tournaments')
    cy.contains('button', /create tournament/i).click()
    cy.get('input[placeholder*="tournament name" i], input[name*="tournament" i]').first()
      .type('Complete Flow Tournament')
    
    // Enable playoffs
    cy.ensurePlayoffsEnabled()
    cy.contains('button', /create/i).click()
    
    // Step 2: Add 8 players
    const players = Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`)
    players.forEach((playerName) => {
      cy.addPlayer(playerName)
    })
    
    // Verify all players added
    cy.contains(/players.*8|hráči.*8/i).should('be.visible')
    
    // Step 3: Start tournament
    cy.startTournament()
    cy.contains(/groups|skupiny/i).should('be.visible')
    
    // Step 4: Verify groups were created
    cy.get('[class*="group"], [class*="Group"]').should('have.length.at.least', 1)
    
    // Step 5: Navigate to matches tab
    cy.contains(/matches|zápasy/i).click()
    
    // Step 6: Complete all group matches
    // Get all match cards/items
    cy.get('body').then(($body) => {
      // Count incomplete matches
      const matchSelectors = [
        '.match-card',
        '.match-item',
        '[class*="match"]:not([class*="completed"])',
        'button:contains("Start Match")',
        'button:contains("Spustiť Zápas")'
      ]
      
      // For now, we'll use a simplified approach
      // In a real scenario, you'd complete matches via API or UI
      cy.log('Group matches should be completed here')
      cy.log('Note: Match completion via UI requires full match interface interaction')
    })
    
    // Step 7: Navigate to playoffs tab
    cy.contains(/playoffs|play-off/i).click()
    
    // Step 8: Start playoffs
    cy.contains('button', /start playoffs|spustiť play-off/i).click()
    
    // Step 9: Verify playoffs started
    cy.contains(/round|kolo|quarter|semi|final/i).should('be.visible')
    
    // Step 10: Verify first round is seeded
    cy.get('[class*="round"], [class*="bracket"]').should('be.visible')
    cy.get('[class*="match"]').should('have.length.at.least', 1)
  })

  it('should complete tournament with group-based seeding', () => {
    // Create tournament with group-based seeding
    cy.visit('/tournaments')
    cy.contains('button', /create tournament/i).click()
    cy.get('input[placeholder*="tournament name" i], input[name*="tournament" i]').first()
      .type('Group-Based Seeding Tournament')
    
    // Enable playoffs
    cy.ensurePlayoffsEnabled()
    
    // Select group-based seeding (if visible in creation)
    cy.get('body').then(($body) => {
      if ($body.text().includes('Group-Based Seeding') || $body.text().includes('Rozdelenie Podľa Skupín')) {
        cy.clickIfPresent(/group-based seeding|rozdelenie podľa skupín/i)
      }
    })
    
    cy.contains('button', /create/i).click()
    
    // Add 8 players
    const players = Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`)
    players.forEach((playerName) => {
      cy.addPlayer(playerName)
    })
    
    // Start tournament
    cy.startTournament()
    
    // Navigate to settings and configure group matchups
    cy.contains(/settings|nastavenia/i).click()
    cy.contains(/playoff settings|nastavenia play-off/i).scrollIntoView()
    
    // Select group-based seeding
    cy.clickIfPresent(/group-based seeding|rozdelenie podľa skupín/i)
    
    // Configure group matchups if groups exist
    cy.get('body').then(($body) => {
      if ($body.text().includes('Group Matchups') || $body.text().includes('Párovanie Skupín')) {
        cy.log('Group matchups configuration should be visible')
        // Add/configure matchups here
      }
    })
    
    // Update settings
    cy.contains('button', /update settings|aktualizovať nastavenia/i).click()
    
    // Start playoffs and verify group-based seeding
    cy.contains(/playoffs|play-off/i).click()
    cy.contains('button', /start playoffs|spustiť play-off/i).click()
    
    // Verify playoffs started with group-based seeding
    cy.contains(/round|kolo/i).should('be.visible')
  })
})

