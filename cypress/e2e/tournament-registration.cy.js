describe('Tournament Registration Flow', () => {
  beforeEach(() => {
    // Log in before each test
    cy.login()
    // Create a tournament and navigate to registration
    cy.visit('/tournaments')
    cy.contains('button', /create tournament/i).click()
    cy.get('input[placeholder*="tournament name" i], input[name*="tournament" i]').first()
      .type('Registration Test Tournament')
    cy.contains('button', /create/i).click()
    cy.url().should('include', '/tournament/')
  })

  it('should add players to tournament', () => {
    // Add first player
    cy.get('input[placeholder*="player name" i], input[placeholder*="enter player" i]').first()
      .type('Test Player 1')
    cy.contains('button', /add player/i).click()
    
    // Verify player was added
    cy.contains('Test Player 1').should('be.visible')
    
    // Add more players
    cy.get('input[placeholder*="player name" i], input[placeholder*="enter player" i]').first()
      .clear().type('Test Player 2')
    cy.contains('button', /add player/i).click()
    cy.contains('Test Player 2').should('be.visible')
  })

  it('should add multiple players quickly', () => {
    const players = ['Player 1', 'Player 2', 'Player 3', 'Player 4']
    
    players.forEach((playerName) => {
      cy.get('input[placeholder*="player name" i], input[placeholder*="enter player" i]').first()
        .clear().type(playerName)
      cy.contains('button', /add player/i).click()
      cy.contains(playerName).should('be.visible')
    })
    
    // Verify all players are listed
    cy.contains(/players.*4|hráči.*4/i).should('be.visible')
  })

  it('should remove a player', () => {
    // Add a player first
    cy.addPlayer('Player to Remove')
    
    // Find and click remove button (X button)
    // Player names are profile links, so walk up to the card and target the
    // remove button explicitly rather than "the last button next to the name".
    cy.contains('Player to Remove').closest('.player-card').find('.remove-player-btn').click()
    
    // Confirm removal if confirmation dialog appears
    cy.get('body').then(($body) => {
      if ($body.text().includes('confirm') || $body.text().includes('naozaj')) {
        cy.contains('button', /confirm|ok|áno/i).click()
      }
    })
    
    // Verify player is removed
    cy.contains('Player to Remove').should('not.exist')
  })

  it('should show start tournament button when 2+ players added', () => {
    // Add first player - button should not appear yet
    cy.addPlayer('Player 1')
    cy.contains('button', /start tournament/i).should('not.exist')
    
    // Add second player - button should appear
    cy.addPlayer('Player 2')
    cy.contains('button', /start tournament/i).should('be.visible')
  })

  it('should prevent starting tournament with less than 2 players', () => {
    // Add only one player
    cy.addPlayer('Solo Player')
    
    // Start tournament button should not be visible
    cy.contains('button', /start tournament/i).should('not.exist')
  })

  it('should edit tournament settings', () => {
    // Click edit settings button
    cy.contains('button', /edit settings|upraviť nastavenia/i).click()
    
    // Change legs to win
    cy.get('select').first().select('5')
    
    // Change starting score
    cy.get('select').eq(1).select('701')
    
    // Update settings
    cy.contains('button', /update settings|aktualizovať nastavenia/i).click()
    
    // Verify success message or settings updated
    cy.get('body').should('satisfy', ($body) => {
      const text = $body.text().toLowerCase()
      return text.includes('success') || text.includes('updated') || text.includes('úspešne')
    })
  })
})

