// Online payment in a window over the booking page, so patients never leave Dactor's site.
//
// Gateway checkout pages forbid being embedded in other sites (X-Frame-Options: DENY / SAMEORIGIN,
// tested 2026-11-22), so an iframe is not possible. Instead:
//   1. openPaymentWindow() is called synchronously on the Pay click (browsers block windows opened later).
//   2. sendToCheckout() points that window at the server-built checkout once it is ready
//      (falls back to the old full-page redirect if the browser blocked the window).
//   3. The gateway returns to our own page inside that window; handOffPaymentReturnToOpener() (run at
//      startup) sends the return URL to the booking page and closes the window.
//   4. The booking page loads that return URL, so its existing return handling asks the server for the
//      real payment status. Nothing on the page itself is trusted.

const WINDOW_NAME = 'dactor_payment'
const MESSAGE_TYPE = 'dactor:payment-return'

export function openPaymentWindow(): Window | null {
  try {
    const win = window.open('', WINDOW_NAME, 'popup,width=480,height=760')
    if (win) {
      win.document.title = 'Secure payment'
      win.document.body.innerHTML =
        '<p style="font-family:system-ui,sans-serif;padding:24px;color:#334155">Opening secure payment…</p>'
    }
    return win
  } catch {
    return null
  }
}

/** Point the payment window at checkout; returns false if it fell back to a full-page redirect. */
export function sendToCheckout(win: Window | null, checkoutUrl: string): boolean {
  if (win && !win.closed) {
    win.location.href = checkoutUrl
    try {
      win.focus()
    } catch {}
    return true
  }
  window.location.href = checkoutUrl
  return false
}

export function closePaymentWindow(win: Window | null): void {
  try {
    if (win && !win.closed) win.close()
  } catch {}
}

/** In the payment window: hand the gateway return back to the booking page. Returns true if handled. */
export function handOffPaymentReturnToOpener(): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    if (window.name !== WINDOW_NAME || !params.get('payment_result')) return false
    const opener = window.opener as Window | null
    if (!opener || opener.closed) return false
    opener.postMessage({ type: MESSAGE_TYPE, url: window.location.href }, window.location.origin)
    window.close()
    return true
  } catch {
    return false
  }
}

/** On every page: when the payment window reports back, load its return URL here (same site only). */
export function installPaymentReturnListener(): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    const data = event.data as { type?: string; url?: string } | null
    if (!data || data.type !== MESSAGE_TYPE || typeof data.url !== 'string') return
    try {
      const target = new URL(data.url)
      if (target.origin !== window.location.origin) return
      window.location.assign(target.toString())
    } catch {}
  })
}
