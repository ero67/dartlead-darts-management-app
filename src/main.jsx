import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
