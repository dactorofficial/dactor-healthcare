import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import { installAccountRestoreHook } from './utils/cacheCleaner'
import { handOffPaymentReturnToOpener, installPaymentReturnListener } from './utils/paymentWindow'

// Bring back an account's hidden data when it signs in again (see signOutKeepingData)
installAccountRestoreHook()

// Inside the payment window: give the gateway return back to the booking page and close.
const isPaymentWindowReturn = handOffPaymentReturnToOpener()
if (!isPaymentWindowReturn) installPaymentReturnListener()

const rootEl = document.getElementById('root')
if (rootEl && isPaymentWindowReturn) {
  // Shown only if the browser refused to close the window
  rootEl.innerHTML =
    '<p style="font-family:system-ui,sans-serif;padding:24px;color:#334155">Payment finished. You can close this window.</p>'
} else if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}

