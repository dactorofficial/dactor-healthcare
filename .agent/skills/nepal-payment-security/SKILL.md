---
name: nepal-payment-security
description: >-
  End-to-end security, anti-tampering, idempotency, and timeout resilience audit
  skill specialized for Nepal payment gateways (eSewa ePay v2, Khalti ePayment v2 (KPG-2), ConnectIPS (NCHL), Fonepay PG / Dynamic QR, IME Pay Checkout). Enforces
  server-authoritative verification, cryptographic signature checks, exact
  NPR/paisa accounting, and zero-loss reconciliation on network failures.
---

# Nepal End-to-End Payment Security & Resilience Skill

Apply this skill whenever building, reviewing, or modifying payment checkout,
callback, webhook, refund, or reconciliation flows integrating **eSewa ePay v2, Khalti ePayment v2 (KPG-2), ConnectIPS (NCHL), Fonepay PG / Dynamic QR, IME Pay Checkout**
on **Node.js / Express (TypeScript)**.

## Non-Negotiable Security & Reliability Invariants

1. **Server-Authoritative Pricing**: Never accept `amount`, `total_amount`, `TXNAMT`, `P_AMT`, or `R_AMT` from client request bodies or query strings. Always compute order totals from the database on the server and compare against the gateway-verified settled amount.
2. **Strict Secret Isolation**: Never expose merchant secrets, `.pfx`/`.pem` keys, or Khalti `live_secret_key` via `VITE_*`, `NEXT_PUBLIC_*`, `REACT_APP_*`, client bundles, git commits, or application logs. Reject the public eSewa sandbox secret (`8gBm/:&EnhH.1/q`) at startup when `NODE_ENV === "production"`.
3. **Redirect Allowlist**: Build `success_url`, `failure_url`, and `return_url` exclusively from a server-configured `APP_URL` constant—never from user request parameters.
4. **Constant-Time Signature Verification**: Verify all eSewa HMAC-SHA256 (`signed_field_names`), Fonepay HMAC-SHA512 (`DV`), and ConnectIPS RSA-SHA256 signatures using constant-time equality (`timingSafeEqual` / `hmac.compare_digest` / `hash_equals`).
5. **Zero-Trust Callback Rule (Server-to-Server Lookup)**: Never fulfill an order solely from browser redirect parameters (`?data=`, `?status=Completed`, `?PS=true`). Always confirm final settlement via the gateway server status/lookup/validatetxn/recheck API.
6. **Exact Integer Paisa Arithmetic**: For Khalti KPG-2 and ConnectIPS, store integer paisa (`NPR * 100`) or convert via `Math.round(npr * 100)` and assert safe integers. For eSewa and Fonepay, verify `amount + tax + service + delivery === total_amount` and `P_AMT === R_AMT === expectedNpr`.
7. **Explicit Timeouts & Reconciliation Worker**: Attach a 3s connect / 8s total timeout (`AbortController`) to every outbound gateway call. Never mark a payment `FAILED` on network timeout—transition to `VERIFYING_TIMEOUT` and run a scheduled Reconciliation Worker with exponential backoff + jitter against the gateway status/recheck endpoint.
8. **Atomic State Machine & Anti-Replay**: Persist a unique per-attempt payment intent (`UNIQUE(transaction_uuid)` / `UNIQUE(pidx)` / `UNIQUE(txnid)`) before redirect. Execute fulfillment inside a DB transaction with row locking (`SELECT ... FOR UPDATE` or conditional `WHERE status IN (PENDING, VERIFYING)`) so concurrent callbacks/webhooks never double-credit.

## Gateway-Specific Verification Contracts

### eSewa ePay v2
- **Protocol**: Form POST + Base64 JSON Callback + Status API
- **Currency Unit**: NPR (string/decimal)
- **Signing / Auth**: HMAC-SHA256 (Base64) over total_amount,transaction_uuid,product_code
- **Mandatory Server Verification**: `GET /api/epay/transaction/status/?product_code=...&total_amount=...&transaction_uuid=...`
- **Timeout & Recovery Rule**: Poll Status API with exponential backoff until COMPLETE / CANCELED / NOT_FOUND
- **Primary Exploit to Block**: Trusting ?data= callback without verifying HMAC signature and re-checking Status API

### Khalti ePayment v2 (KPG-2)
- **Protocol**: Server POST /initiate/ + Redirect + Server POST /lookup/
- **Currency Unit**: Paisa (integer = NPR * 100)
- **Signing / Auth**: Server-side Authorization: Key <LIVE_SECRET_KEY>
- **Mandatory Server Verification**: `POST /api/v2/epayment/lookup/ with { pidx }`
- **Timeout & Recovery Rule**: Store pidx before redirect; run lookup cron for Pending/Initiated rows
- **Primary Exploit to Block**: Trusting redirect ?status=Completed or sending NPR instead of integer paisa

### ConnectIPS (NCHL)
- **Protocol**: Signed Form POST + Server Basic-Auth validateTxn
- **Currency Unit**: Paisa (integer = NPR * 100)
- **Signing / Auth**: RSA-SHA256 private key (.pem/.pfx) TOKEN over canonical key=value pairs
- **Mandatory Server Verification**: `POST /connectipswebws/api/creditor/validatetxn`
- **Timeout & Recovery Rule**: Query gettxndetail / validatetxn for ambiguous interbank settlement delays
- **Primary Exploit to Block**: Committing .pfx certificate or omitting TXNID + TXNAMT validation on callback

### Fonepay PG / Dynamic QR
- **Protocol**: HMAC-SHA512 Signed Redirect + Server VerificationMerchant
- **Currency Unit**: NPR (decimal string)
- **Signing / Auth**: HMAC-SHA512 hex DV over PID,MD,PRN,AMT,CRN,DT,R1,R2,RU
- **Mandatory Server Verification**: `GET /api/merchantRequest/verificationMerchant`
- **Timeout & Recovery Rule**: Poll verificationMerchant XML endpoint with PRN + BID + UID
- **Primary Exploit to Block**: Not checking P_AMT === expectedAmount and R_AMT === P_AMT (partial payment spoof)

### IME Pay Checkout
- **Protocol**: Server GetToken + Checkout POST + Server Confirm/Recheck
- **Currency Unit**: NPR (decimal string)
- **Signing / Auth**: Basic Auth + Base64 Module header on server endpoints
- **Mandatory Server Verification**: `POST /api/Web/Confirm and fallback POST /api/Web/Recheck`
- **Timeout & Recovery Rule**: Call /api/Web/Recheck when Confirm times out before marking failed
- **Primary Exploit to Block**: Marking order failed on Confirm timeout without calling Recheck first

## End-to-End Transaction State Machine

Every payment attempt MUST follow this strict finite state machine:

```
INITIATED -> PENDING -> VERIFYING -> COMPLETED
                 |          |
                 |          +-> VERIFYING_TIMEOUT -> (Reconciliation Worker) -> COMPLETED | FAILED | EXPIRED
                 +-> CANCELED | EXPIRED
```

- **Never** retry a non-idempotent `initiate` or `debit` call automatically without a persisted idempotency key.
- **Always** retry idempotent status/lookup/recheck queries with bounded exponential backoff (15s, 45s, 2m, 5m, 15m) until terminal state.

## Reference Implementation Patterns (Node.js / Express (TypeScript))

### 1. Constant-Time Signature Check
```
import crypto from 'node:crypto';
const expected = crypto.createHmac('sha256', process.env.ESEWA_SECRET_KEY!).update(canonical).digest('base64');
const ok = expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
```

### 2. Bounded Gateway Timeout
```
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 8000);
try {
  const res = await fetch(verifyUrl, { signal: controller.signal });
  return await res.json();
} finally {
  clearTimeout(timer);
}
```

### 3. Atomic Idempotent Fulfillment
```
await db.$transaction(async (tx) => {
  const res = await tx.paymentIntents.updateMany({
    where: { transactionUuid, status: { in: ['PENDING', 'VERIFYING', 'VERIFYING_TIMEOUT'] } },
    data: { status: 'COMPLETED', gatewayRefId },
  });
  if (res.count === 1) await tx.orders.update({ where: { id: orderId }, data: { status: 'PAID' } });
});
```

## Pre-Production Go-Live Verification Gate

Before deploying any Nepal payment route to production, verify every item below:

- [ ] Production credentials loaded exclusively from server environment secrets (UAT keys blocked in prod)
- [ ] Price tampering test: modifying `total_amount` / `amount` in DevTools is rejected with HTTP 400
- [ ] Callback forgery test: forged Base64 `?data=` or `?status=Completed` is rejected before DB mutation
- [ ] Replay & concurrency test: sending 5 parallel callback requests fulfills/credits the order exactly once
- [ ] Timeout simulation test: killing network during callback leaves intent in `PENDING` / `VERIFYING_TIMEOUT` and reconciliation worker settles it automatically
- [ ] Log redaction audit: zero secrets, private keys, or Authorization headers appear in server logs
