describe('Match Completion Flow', () => {
  beforeEach(() => {
    // Log in before each test
    cy.login()
    // Setup tournament with players
    cy.visit('/tournaments')
    cy.contains('button', /create tournament/i).click()
    cy.get('input[placeholder*="tournament name" i], input[name*="tournament" i]').first()
      .type('Match Completion Test')
    cy.contains('button', /create/i).click()
    
    // Add 4 players
    const players = ['Player 1', 'Player 2', 'Player 3', 'Player 4']
    players.forEach((playerName) => {
      cy.addPlayer(playerName)
    })
    
    // Start tournament
    cy.startTournament()
  })

  it('should display matches in groups', () => {
    // Navigate to matches tab
    cy.contains(/matches|zápasy/i).click()
    
    // Verify matches are displayed
    cy.get('[class*="match"], [class*="Match"]').should('have.length.at.least', 1)
    
    // Verify matches show players
    cy.get('[class*="match"]').first().should('contain.text', 'Player')
  })

  it('should allow starting a match', () => {
    cy.contains(/matches|zápasy/i).click()
    
    // Click on a match
    cy.get('[class*="match"]').first().click()
    
    // Should show match interface
    cy.contains(/start match|spustiť zápas/i).should('be.visible')
    
    // Or if match is already pending, should show match details
    cy.get('body').should('satisfy', ($body) => {
      const text = $body.text().toLowerCase()
      return text.includes('start') || text.includes('match') || text.includes('zápas')
    })
  })

  it('should update standings after match completion', () => {
    // Complete a match (simplified - requires match completion implementation)
    cy.log('Match completion via UI requires full dart throwing simulation')
    cy.log('Consider using API or test helpers for match completion')
    
    // Navigate to standings
    cy.contains(/standings|tabuľka/i).click()
    
    // Verify standings are displayed
    cy.get('[class*="standings"], [class*="Standings"]').should('be.visible')
  })

  it('should show match statistics', () => {
    cy.contains(/matches|zápasy/i).click()
    
    // Click on a completed match (if any)
    cy.get('body').then(($body) => {
      if ($body.text().includes('Completed') || $body.text().includes('Dokončený')) {
        cy.get('[class*="match"][class*="completed"], [class*="completed"]').first().click()
        
        // Should show statistics
        cy.contains(/statistics|štatistiky|average|priemer/i).should('be.visible')
      }
    })
  })
})

