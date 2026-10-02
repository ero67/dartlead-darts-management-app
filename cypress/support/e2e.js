// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'
import './match-helpers'

// The app defaults to Slovak; the English-only specs need the English UI.
// Cypress clears storage between tests, so set it before every page load.
Cypress.on('window:before:load', (win) => {
  win.localStorage.setItem('language', 'en')
})

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Hide fetch/XHR requests from command log
Cypress.on('uncaught:exception', (err, runnable) => {
  // returning false here prevents Cypress from
  // failing the test on uncaught exceptions
  // (useful for React error boundaries)
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false
  }
  return true
})

