import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
// Barlow Condensed is only used for numerals and short labels: latin subsets only.
import '@fontsource/barlow-condensed/latin-500.css'
import '@fontsource/barlow-condensed/latin-ext-500.css'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-ext-600.css'
import './tailwind.css'
import App from './App.jsx'
import { initTestAPI } from './utils/testAPI.js'

// Initialize test API for Cypress (development only)
initTestAPI()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
