import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initializeApiKeys } from './utils/initApiKeys'

console.log('🚀 React main.tsx loading...')

// Initialize API keys on app start
initializeApiKeys().catch(console.error)

const rootElement = document.getElementById('root')
if (!rootElement) {
  console.error('❌ CRITICAL: root element not found!')
  throw new Error('Root element not found')
}

console.log('✅ Root element found, mounting React...')

try {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
  console.log('✅ React app mounted successfully!')
} catch (error) {
  console.error('❌ CRITICAL ERROR mounting React:', error)
  rootElement.innerHTML = `
    <div style="padding: 20px; color: red; font-family: monospace;">
      <h1>React Mount Error</h1>
      <pre>${error instanceof Error ? error.stack : String(error)}</pre>
    </div>
  `
}

