describe('Tournament Creation Flow', () => {
  beforeEach(() => {
    // Log in before each test
    cy.login()
    // Visit the tournaments page
    cy.visit('/tournaments')
  })

  it('should create a new tournament', () => {
    // Click create tournament button
    cy.contains('button', /create tournament/i).click()
    
    // Fill in tournament name
    cy.get('input[placeholder*="tournament name" i], input[name*="tournament" i]').first()
      .type('Cypress Test Tournament')
    
    // Click create button
    cy.contains('button', /create/i).click()
    
    // Should navigate to tournament registration page
    cy.url().should('include', '/tournament/')
    cy.contains('Cypress Test Tournament').should('be.visible')
    cy.contains(/open for registration|otvorené pre registráciu/i).should('be.visible')
  })

  it('should create tournament with custom settings', () => {
    cy.contains('button', /create tournament/i).click()
    
    // Fill tournament name
    cy.get('input[placeholder*="tournament name" i], input[name*="tournament" i]').first()
      .type('Custom Settings Tournament')
    
    // Change legs to win
    cy.selectOption(0, /\b5\b/)
    
    // Change starting score
    cy.selectOption(1, /701/)
    
    // Enable playoffs
    cy.ensurePlayoffsEnabled()
    
    // Select group-based seeding
    cy.clickIfPresent(/group-based seeding|rozdelenie podľa skupín/i)
    
    // Create tournament
    cy.contains('button', /create/i).click()
    
    // Verify navigation
    cy.url().should('include', '/tournament/')
    cy.contains('Custom Settings Tournament').should('be.visible')
  })
})

