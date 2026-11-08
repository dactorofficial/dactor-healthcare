import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Purge legacy client-side admin session and password storage on startup
try {
  localStorage.removeItem('dactor_admin_session')
  localStorage.removeItem('dactor_admin_passwords')
} catch {
  // Ignore localStorage access errors
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
