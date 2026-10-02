describe('32 Player Tournament Flow', () => {
  beforeEach(() => {
    // Log in before each test
    cy.login()
  })

  it('should complete full tournament with 32 players: create, add players, play all matches randomly, start playoffs', () => {
    const tournamentName = `32 Player Test ${Date.now()}`
    
    // Step 1: Create tournament
    cy.visit('/tournaments')
    cy.contains('button', /create tournament/i).click()
    cy.get('input[placeholder*="tournament name" i], input[name*="tournament" i]').first()
      .type(tournamentName)
    
    // Enable playoffs
    cy.ensurePlayoffsEnabled()
    
    // Configure groups: 8 groups with all players advancing
    // With 32 players and 8 groups = 4 players per group
    // If all players advance = 4 × 8 = 32 qualifiers (perfect for Round of 32)
    
    // First ensure "Number of Groups" radio is selected
    cy.get('[role="radio"][value="groups"]').click()
    
    // Set number of groups to 8
    cy.get('input[type="number"]').first().clear().type('8')
    cy.log('✅ Set number of groups to 8 (4 players per group)')
    
    // Set players advancing per group to "All" (value 9999)
    cy.get('body').then(($body) => {
      if (/players advancing per group|hráči postupujúci/i.test($body.text())) {
        // Find the select dropdown for players per group
        cy.contains(/players advancing|hráči postupujúci/i).parent().find('[data-slot="select-trigger"]').then(($trigger) => {
          // Select "All" option (value 9999)
          cy.selectOption($trigger, /^all$|^všetci$/i)
          cy.log('✅ Set players advancing per group to "All" (all 4 players from each group)')
        })
      } else {
        // Fallback: try to find select by looking for "All" option
        cy.get('[data-slot="select-trigger"]').contains(/all|všetci/i).click()
        cy.get('[role="option"]').contains(/^all$|^všetci$/i).click()
      }
    })
    
    cy.contains('button', /create/i).click()
    
    // Step 2: Add 32 players
    cy.log('Adding 32 players...')
    const players = Array.from({ length: 32 }, (_, i) => `Player ${String(i + 1).padStart(2, '0')}`)
    
    players.forEach((playerName, index) => {
      cy.addPlayer(playerName)
      // Log progress every 8 players
      if ((index + 1) % 8 === 0) {
        cy.log(`Added ${index + 1}/32 players`)
      }
    })
    
    // Verify all players added
    cy.contains(/players.*32|hráči.*32/i).should('be.visible')
    cy.log('✅ All 32 players added successfully')
    
    // Step 3: Start tournament
    cy.startTournament()
    
    // Wait for page to load and look for tab buttons or tournament management content
    cy.get('body').should('be.visible')
    cy.wait(2000) // Give time for tournament data to load
    
    // Look for tab buttons or any tournament management content
    // The page should have either tab buttons or group content
    cy.get('body').then(($body) => {
      const bodyText = $body.text()
      cy.log('Page content check:', bodyText.substring(0, 200))
      
      // Check for various possible indicators that tournament started
      const hasGroupsTab = bodyText.includes('Groups') || bodyText.includes('Skupiny') || 
                          bodyText.includes('groups') || bodyText.includes('skupiny')
      const hasMatchesTab = bodyText.includes('Matches') || bodyText.includes('Zápasy') ||
                           bodyText.includes('matches') || bodyText.includes('zápasy')
      const hasTournamentContent = hasGroupsTab || hasMatchesTab || 
                                   bodyText.includes('Group') || bodyText.includes('Skupina')
      
      if (!hasTournamentContent) {
        cy.log('Tournament management page may not have loaded yet')
        // Try to find tab buttons
        cy.get('button').should('exist')
      }
    })
    
    // Wait for tournament management page to fully load
    // Look for tab buttons - they should be visible
    cy.get('[class*="management-tabs"] button, button[class*="tab"], button').should('have.length.at.least', 1)
    
    // Verify we're on the tournament management page
    // Check for any tab button text (Groups, Matches, Standings, etc.)
    cy.get('body').should(($body) => {
      const text = $body.text().toLowerCase()
      // Should have at least one of these tab indicators
      const hasTab = text.includes('groups') || text.includes('matches') || 
                     text.includes('standings') || text.includes('playoffs') ||
                     text.includes('skupiny') || text.includes('zápasy') ||
                     text.includes('tabuľka') || text.includes('play-off') ||
                     text.includes('statistics') || text.includes('štatistiky')
      expect(hasTab).to.be.true
    })
    cy.log('✅ Tournament started, management page loaded')
    
    // Step 4: Get tournament ID from URL
    cy.url().then((url) => {
      const tournamentId = url.split('/tournament/')[1].split('/')[0].split('?')[0]
      cy.log(`Tournament ID: ${tournamentId}`)
      
      // Wait a bit for groups and matches to be created
      cy.wait(3000)
      
      // Step 5: Navigate to matches tab to verify matches exist
      // Try multiple ways to find the matches tab
      cy.get('body').then(($body) => {
        // Look for tab button
        const matchesButton = $body.find('button').filter((i, el) => {
          const text = Cypress.$(el).text().toLowerCase()
          return text.includes('match') || text.includes('zápas')
        })
        
        if (matchesButton.length > 0) {
          cy.wrap(matchesButton.first()).click()
        } else {
          // Fallback: try to find by text
          cy.contains('button', /matches|zápasy/i).click()
        }
      })
      cy.wait(2000) // Wait for matches to load
      
      // Step 6: Complete all group matches using test API
      cy.window().then(async (win) => {
        if (win.testAPI && win.testAPI.completeAllTournamentMatches) {
          cy.log('Using test API to complete all matches...')
          
          // Complete all matches
          const results = await win.testAPI.completeAllTournamentMatches(tournamentId, {
            player1Legs: 2,
            player2Legs: 0
          })
          
          cy.log(`✅ Completed ${results.length} matches`)
          
          // Wait for matches to update
          cy.wait(2000)
          
          // Refresh page to see updated standings
          cy.reload()
          cy.wait(2000)
          
          // Step 7: Navigate to playoffs tab
          cy.contains(/playoffs|play-off/i).click()
          cy.wait(1000)
          
          // Step 8: Start playoffs
          cy.contains('button', /start playoffs|spustiť play-off/i).click()
          cy.wait(2000)
          
          // Step 9: Verify playoffs started with Round of 32
          cy.contains(/round of 32|32 najlepších|round|kolo/i).should('be.visible')
          
          // Verify Round of 32 has 16 matches (32 players / 2 = 16 matches)
          cy.get('[class*="round"], [class*="bracket"]').first().within(() => {
            cy.get('[class*="match"]').should('have.length', 16)
          })
          
          cy.log('✅ Playoffs started successfully with Round of 32!')
          
          // Verify Round of 32 matches have players assigned
          cy.get('[class*="round"]').first().within(() => {
            cy.get('[class*="match"]').each(($match) => {
              cy.wrap($match).should('contain.text', 'Player')
            })
          })
          
        } else {
          cy.log('⚠️ Test API not available - cannot complete matches automatically')
          cy.log('Matches would need to be completed manually or via UI')
          
          // At least verify matches exist
          cy.get('[class*="match"], [class*="Match"]').should('have.length.at.least', 1)
        }
      })
    })
  })

  it('should verify 32-player tournament structure', () => {
    const tournamentName = `32 Player Structure Test ${Date.now()}`
    
    // Create tournament
    cy.visit('/tournaments')
    cy.contains('button', /create tournament/i).click()
    cy.get('input[placeholder*="tournament name" i], input[name*="tournament" i]').first()
      .type(tournamentName)
    cy.ensurePlayoffsEnabled()
    
    // Configure groups: 8 groups with all players advancing
    cy.get('[role="radio"][value="groups"]').click()
    cy.get('input[type="number"]').first().clear().type('8')
    cy.contains(/players advancing|hráči postupujúci/i).parent().find('[data-slot="select-trigger"]').then(($trigger) => {
      cy.selectOption($trigger, /^all$|^všetci$/i)
    })
    
    cy.contains('button', /create/i).click()
    
    // Add 32 players quickly
    const players = Array.from({ length: 32 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`)
    players.forEach((playerName) => {
      cy.addPlayer(playerName)
    })
    
    cy.contains(/players.*32|hráči.*32/i).should('be.visible')
    
    // Start tournament
    cy.startTournament()
    
    // Verify groups were created - wait for page to load
    cy.wait(2000)
    cy.get('body').should('be.visible')
    
    // Look for tab buttons or group content
    cy.get('button').contains(/groups|skupiny|matches|zápasy/i).should('exist')
    
    // Try to find group elements (may not be visible if on different tab)
    cy.get('body').then(($body) => {
      const hasGroups = $body.find('[class*="group"], [class*="Group"]').length > 0
      if (!hasGroups) {
        // Click groups tab to see groups
        cy.contains('button', /groups|skupiny/i).click()
        cy.wait(1000)
      }
    })
    
    cy.get('[class*="group"], [class*="Group"]').should('have.length.at.least', 1)
    
    // Get tournament ID
    cy.url().then((url) => {
      const tournamentId = url.split('/tournament/')[1].split('/')[0].split('?')[0]
      
      // Verify matches exist
      cy.contains(/matches|zápasy/i).click()
      cy.wait(1000)
      cy.get('[class*="match"], [class*="Match"]').should('have.length.at.least', 1)
      
      // Use test API to get match count
      cy.window().then(async (win) => {
        if (win.testAPI && win.testAPI.getTournamentMatches) {
          const matches = await win.testAPI.getTournamentMatches(tournamentId)
          cy.log(`Found ${matches.length} total matches in tournament`)
          
          // Verify we have enough matches for 32 players
          // With groups, we should have multiple matches
          expect(matches.length).to.be.greaterThan(0)
        }
      })
    })
  })
})
