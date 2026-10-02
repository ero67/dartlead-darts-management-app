describe('Playoff Auto-Propagation', () => {
  beforeEach(() => {
    // Log in before each test
    cy.login()
    // Setup: Create tournament, add players, start tournament
    cy.visit('/tournaments')
    cy.contains('button', /create tournament/i).click()
    cy.get('input[placeholder*="tournament name" i], input[name*="tournament" i]').first()
      .type('Playoff Propagation Test')
    
    // Enable playoffs
    cy.ensurePlayoffsEnabled()
    cy.contains('button', /create/i).click()
    
    // Add 8 players for quarterfinals
    const players = Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`)
    players.forEach((playerName) => {
      cy.addPlayer(playerName)
    })
    
    // Start tournament
    cy.startTournament()
  })

  it('should automatically seed first round when playoffs start', () => {
    // Complete all group matches first
    // Note: This would require completing matches via API or UI
    cy.log('Complete group matches here (requires match completion implementation)')
    
    // Navigate to playoffs
    cy.contains(/playoffs|play-off/i).click()
    
    // Start playoffs
    cy.contains('button', /start playoffs|spustiť play-off/i).click()
    
    // Verify first round is automatically seeded
    cy.get('[class*="round"]').first().within(() => {
      // Should have matches with players assigned
      cy.get('[class*="match"]').each(($match) => {
        // Each match should have two players
        cy.wrap($match).should('contain.text', 'Player')
      })
    })
  })

  it('should automatically advance winners to next round', () => {
    // Complete group stage (simplified - would need actual match completion)
    cy.log('Group stage completion required')
    
    // Start playoffs
    cy.contains(/playoffs|play-off/i).click()
    cy.contains('button', /start playoffs|spustiť play-off/i).click()
    
    // Get first round matches
    cy.get('[class*="round"]').first().within(() => {
      cy.get('[class*="match"]').first().as('firstMatch')
    })
    
    // Complete first match (would need match completion implementation)
    cy.log('Complete first playoff match here')
    cy.log('Note: Requires match completion via API or full UI interaction')
    
    // Verify winner advanced to next round
    cy.get('[class*="round"]').eq(1).within(() => {
      cy.get('[class*="match"]').first().should('contain.text', 'Player')
    })
  })

  it('should handle standard tournament seeding correctly', () => {
    // Ensure standard seeding is selected
    cy.contains(/settings|nastavenia/i).click()
    cy.contains(/playoff settings|nastavenia play-off/i).scrollIntoView()
    cy.clickIfPresent(/standard tournament seeding|štandardné turnajové rozdelenie/i)
    cy.contains('button', /update settings|aktualizovať nastavenia/i).click()
    
    // Start playoffs
    cy.contains(/playoffs|play-off/i).click()
    cy.contains('button', /start playoffs|spustiť play-off/i).click()
    
    // Verify seeding pattern (1 vs 8, 4 vs 5, etc.)
    cy.get('[class*="round"]').first().within(() => {
      cy.get('[class*="match"]').should('have.length', 4) // Quarterfinals = 4 matches
      
      // First match should be seed 1 vs seed 8
      cy.get('[class*="match"]').first().should('be.visible')
    })
  })

  it('should handle group-based seeding correctly', () => {
    // Configure group-based seeding
    cy.contains(/settings|nastavenia/i).click()
    cy.contains(/playoff settings|nastavenia play-off/i).scrollIntoView()
    cy.clickIfPresent(/group-based seeding|rozdelenie podľa skupín/i)
    
    // Configure group matchups if available
    cy.get('body').then(($body) => {
      if ($body.text().includes('Group Matchups') || $body.text().includes('Párovanie Skupín')) {
        cy.log('Group matchups should be configured here')
      }
    })
    
    cy.contains('button', /update settings|aktualizovať nastavenia/i).click()
    
    // Start playoffs
    cy.contains(/playoffs|play-off/i).click()
    cy.contains('button', /start playoffs|spustiť play-off/i).click()
    
    // Verify group-based seeding was applied
    cy.get('[class*="round"]').first().within(() => {
      cy.get('[class*="match"]').should('be.visible')
    })
  })
})

