# Payment reliability plan: a paid appointment is never lost

> **Status 2026-11-22:** not implemented yet, except: the reconcile crash (`.catch` on a query builder,
> which stopped every reconcile run) is fixed in `e8549ed`; in-app (patient app) and in-window (website)
> payment from §11a are done in `1459cba` / `d50de17`. See the status table in `implementation-plan.md`.

Status: proposal. Applies to online gateways (eSewa, Khalti, Fonepay, ConnectIPS).
Pay at Desk is out of scope except where noted.

## 1. Goal and guarantees

The patient's money and the clinic's schedule must always agree, without depending on the
patient's phone or browser.

| # | Guarantee |
|---|---|
| G1 | Every payment the gateway reports as successful ends in exactly one of: **appointment confirmed**, or **needs attention** (visible to the clinic and admin, alert sent) within **2 minutes** of the server learning about it. Never silent. |
| G2 | Nothing is confirmed without a **server-to-server** check with the gateway that matches merchant, transaction id and amount. |
| G3 | Confirmation is **exactly once**: repeated returns, retries and parallel workers cannot double-book, double-queue or double-bill. |
| G4 | Confirmation does **not depend on the patient's device**: closing the browser, losing internet or uninstalling the app changes nothing. |
| G7 | Checking is short and purposeful: every minute while the slot is held, then a few follow-ups; anything still unclear is shown to staff with a "check now" button, never silently dropped. |
| G8 | Patients stay in Dactor wherever the gateway allows it: in-app payment screen in the apps; on the website, a payment window over the booking page (gateways forbid embedding, see §11a). |
| G5 | Every state change is **recorded** (who, when, what the gateway said) and can be audited. |
| G6 | If any part of this machinery stops (job, function, gateway), an **alert fires within 5 minutes**. |

## 2. Where we are today (main, 2026-11-22)

Works well:
- Amount is computed on the server (`appointment-payment` → `initiate`), clients cannot mark paid
  (`prevent_appointment_tampering`).
- eSewa return is signature-checked and then verified server-to-server
  (`finalizeEsewa`: product code + transaction uuid + amount).
- `finalize_online_appointment_payment` locks rows and is idempotent.
- Gateway secrets are readable only by `service_role`.

Gaps that can lose a paid appointment:

| Gap | Where | Effect |
|---|---|---|
| Background check depends on `app.settings.supabase_url` / `service_role_key`; if unset it silently does nothing | `migration_multi_gateway_payments.sql` (`dactor_reconcile_pending_payments`) | Paid, never confirmed unless the patient returns or staff press reconcile |
| Pending attempts expire after 24 h **without a final gateway check** | `expire_stale_online_payment_attempts()` | Money taken, attempt `expired`, appointment unconfirmed |
| Reconcile looks at only the **25 newest** pending attempts per run | `reconcilePendingAttempts` | Older ones can starve on a busy day |
| `finalize` returns `FALSE` when the appointment is no longer confirmable (e.g. `no_show`) | `finalize_online_appointment_payment` | Money taken, nothing recorded, nobody alerted |
| Late payment re-activates a cancelled booking without a capacity check | same | Slot overbooked |
| Patient app does not re-check a pending payment on return | `PaymentScreen.kt` | Relies on the background check |
| Attempt does not record the merchant code used | `appointment_payment_attempts` | If a clinic changes keys, old attempts cannot be verified |
| No health signal or alert | — | Failures are invisible |

## 3. Architecture

```
 Patient taps Pay
        │
        ▼
 [initiate]  server computes amount, holds slot, creates attempt(PENDING, next_check_at=now+60s)
        │
        ▼
 Gateway page (in-app WebView / browser)
        │ success_url / failure_url (always OUR server, never the app)
        ▼
 [return]  verify with gateway ──► confirm()                         ← path 1: instant
        │
        ▼ (if the patient never comes back)
 [verifier job, every minute]  claims due attempts ──► verify ──► confirm()   ← path 2: guaranteed
        │
        ▼
 [staff "check now"]  same verify ──► confirm()                      ← path 3: manual
        │
        ▼
 confirm():  appointment APPROVED + paid + queue token + invoice      (one transaction)
        or   NEEDS_ATTENTION + alert                                   (never silent)

 Apps / website:  only READ the appointment status. They never confirm.
```

All three paths call the same `verify_attempt()` and the same database `confirm` function, so behaviour
is identical whichever path wins; the others become no-ops.

## 4. Payment attempt state machine

```
CREATED ─► PENDING ─┬─► COMPLETE                      (verified + appointment confirmed)
                    ├─► NEEDS_ATTENTION ─┬─► COMPLETE   (staff confirmed)
                    │                    └─► REFUNDED   (staff refunded, reference recorded)
                    ├─► FAILED                         (gateway gave a final "not paid" answer)
                    └─► UNRESOLVED ──► (staff "check now") ──► COMPLETE / FAILED / NEEDS_ATTENTION
```

| From | To | Who | Condition |
|---|---|---|---|
| PENDING | COMPLETE | return / verifier / staff check | gateway `COMPLETE` + merchant, txn id, amount match. Confirmed into the booked slot (no capacity check, no extra handling). |
| PENDING | NEEDS_ATTENTION | same | gateway `COMPLETE` but: duplicate payment for an already-paid appointment, **or** amount/merchant mismatch, **or** gateway status `AMBIGUOUS` / partial refund |
| PENDING | FAILED | verifier | gateway gives a **final** "not paid" answer within the hold (see §7) |
| PENDING | UNRESOLVED | verifier | no final answer when the 15-minute hold ends |
| NEEDS_ATTENTION | COMPLETE / REFUNDED | clinic or admin | manual action, with note and reference |

Rules:
- Network errors, timeouts and HTTP 5xx from the gateway **never** change state; they only reschedule.
- There is no blind expiry: an attempt only becomes `FAILED` on a final gateway answer; without one
  at the end of the 15-minute hold it becomes `UNRESOLVED` (visible to staff, "check now").
- `COMPLETE`, `FAILED`, `REFUNDED` are final. If a gateway later reports `COMPLETE` for a `FAILED`
  attempt (should not happen, but possible after disputes), it is confirmed the same way, never ignored.
- The existing `EXPIRED` status is kept only for old rows; the backfill (§16) re-checks them.

## 5. Data model changes

### 5.1 `appointment_payment_attempts`
| Column | Purpose |
|---|---|
| `status` | add `needs_attention`, `refunded` |
| `merchant_code` | merchant/product code used at initiate (verify even after key rotation) |
| `environment` | `test` / `live` used at initiate |
| `next_check_at` | when the verifier should look next (indexed) |
| `check_count` | number of gateway checks |
| `last_checked_at`, `last_provider_status`, `last_error` | diagnostics |
| `claimed_until` | worker lease (prevents two workers on one attempt) |
| `finalized_at` | when it reached a final state |
| `attention_reason` | `appointment_not_confirmable`, `amount_mismatch`, `merchant_mismatch`, `duplicate_payment`, `ambiguous_provider_status`, `late_payment` |
| `resolved_by`, `resolved_at`, `resolution_note`, `refund_reference` | manual resolution |

Indexes: `(next_check_at) WHERE status = 'pending'`, `(status) WHERE status = 'needs_attention'`,
unique `(appointment_id) WHERE status = 'pending'` (one open attempt per appointment).

### 5.2 `payment_events` (new, append-only)
`id, attempt_id, appointment_id, event, source (return|verifier|staff|initiate), provider_status,
details jsonb, created_at`. Insert-only for `service_role`; no updates or deletes. Every transition writes one row.

### 5.3 Credentials
Move gateway secrets from plain columns to **Supabase Vault**; the table keeps only vault secret ids.

## 6. The verifier (path 2)

### 6.1 Schedule
| When | Checks |
|---|---|
| 0–15 min (slot held) | every 1 min |
| after 15 min | **none** (no later automatic re-checks) |

Checks stop as soon as the gateway gives a final answer (§7). If there is no final answer when the
15-minute hold ends, the attempt becomes **UNRESOLVED**: shown in the clinic's and admin's lists with a
"check now" button (path 3), never closed silently.

### 6.2 Mechanics
- `pg_cron` every minute calls edge function `appointment-payment` with `action=verify_due`,
  authenticated with the service key read from **Vault** (no `app.settings`).
- `verify_due` claims work with one SQL call:
  `UPDATE … SET claimed_until = now()+2 min WHERE id IN (SELECT id … WHERE status='pending'
  AND next_check_at <= now() AND (claimed_until IS NULL OR claimed_until < now())
  ORDER BY next_check_at LIMIT 50 FOR UPDATE SKIP LOCKED) RETURNING …`
  → oldest-due first, no starvation, safe with parallel runs.
- Processes the batch with a 40 s time budget and concurrency 5; unfinished items keep their lease
  expiry and are picked up next minute.
- Writes a heartbeat row (`payment_verifier_runs`: started_at, finished_at, claimed, completed,
  errors) every run.

### 6.3 Return path (path 1)
Unchanged in principle: verify signature, then **always** call `verify_attempt()` (never trust the
redirect data alone), then redirect to the app/site with the resulting state.

### 6.4 Staff "check now" (path 3)
Clinic portal / clinic app button per pending payment → same `verify_attempt()`.

## 7. Gateway verification rules

A **final answer** is any reply that says the payment happened or definitely did not. Anything else
(pending, timeout, HTTP error, malformed reply) means "ask again at the next scheduled check".
Common to all gateways: amount, merchant and our transaction id must match the attempt; a successful
payment with any mismatch → `NEEDS_ATTENTION` (also a fraud signal, admin alerted); verification uses
the `merchant_code` / `environment` stored on the attempt.

### 7.1 eSewa (ePay v2)
| Step | Detail |
|---|---|
| Start | Server builds the signed form: `total_amount`, `transaction_uuid` (our attempt id), `product_code`, `success_url`/`failure_url` (**our server**), `signature` = HMAC-SHA256(`total_amount,transaction_uuid,product_code`, secret) base64. POST to `rc-epay.esewa.com.np` (test) / `epay.esewa.com.np` (live) `/api/epay/main/v2/form`. |
| Where it opens | App: in-app payment screen. Website: payment window (eSewa sends `X-Frame-Options: DENY`, tested 2026-11-22). |
| Return | eSewa redirects to `success_url?data=<base64 JSON>`; server checks the signature in `data`, then always verifies via the status API. |
| Verify | `GET /api/epay/transaction/status/?product_code&total_amount&transaction_uuid` (`rc.esewa.com.np` / `epay.esewa.com.np`). |
| Statuses | `COMPLETE` → confirm. `PENDING` → ask again. `CANCELED`, `FULL_REFUND` → final not paid. `PARTIAL_REFUND`, `AMBIGUOUS` → needs attention. `NOT_FOUND` → ask again while the hold is open; still `NOT_FOUND` at the last check of the hold → final not paid (patient never paid). |
| Test | `EPAYTEST` product code with eSewa's published test key; sandbox checkout tested from the build environment. |

### 7.2 Khalti (ePayment v2)
| Step | Detail |
|---|---|
| Start | Server `POST /api/v2/epayment/initiate/` (`dev.khalti.com` test / `khalti.com` live) with `Authorization: Key <secret>`, amount in **paisa**, `purchase_order_id` (attempt id), `return_url` (**our server**). Reply: `pidx`, `payment_url`, expiry. Store `pidx` on the attempt. |
| Where it opens | App: in-app payment screen. Website: payment window (sandbox sends `X-Frame-Options: SAMEORIGIN`; live allowed it in one check, not relied on). |
| Return | Khalti redirects to `return_url?pidx&status&transaction_id&amount&purchase_order_id`; never trusted on its own. |
| Verify | `POST /api/v2/epayment/lookup/ {pidx}`. |
| Statuses | `Completed` + amount match → confirm. `Pending`, `Initiated` → ask again. `Expired`, `User canceled` → final not paid. `Refunded` → final not paid (or needs attention if we had confirmed). `Partially Refunded` → needs attention. |
| Session | Payment link has its own expiry from the initiate reply; after it, `Expired` is the final answer. |

### 7.3 Fonepay
Two modes; QR is preferred because nothing leaves Dactor at all.

**QR mode (preferred, to build):**
| Step | Detail |
|---|---|
| Start | Server requests a dynamic QR from Fonepay's merchant API (amount, PRN = attempt id, signed with the merchant secret) and returns the QR payload. |
| Where it opens | **QR shown on our own screen** in the app and on the website; the patient scans it with any banking app. No gateway page. |
| Verify | `thirdPartyDynamicQrGetStatus` (`merchantapi.fonepay.com` / `dev-merchantapi…`) by PRN; already used for status checks in the code. |
| Statuses | success + amount match → confirm; pending → ask again; failed/expired QR → final not paid. |
| Needs | Fonepay merchant API username/password (fields already exist) and QR access on the merchant account. |

**Redirect mode (fallback):** form to `clientapi.fonepay.com/api/merchantRequest` (`PID`, `PRN`, `AMT`, `RU` = our server, `DV` = HMAC-SHA512). Page sends `X-Frame-Options: DENY` → payment window on the website, in-app screen in the apps. Verify with `/api/merchantRequest/verificationMerchant`.

### 7.4 ConnectIPS
| Step | Detail |
|---|---|
| Start | Server builds the form (`MERCHANTID`, `APPID`, `TXNID` = attempt id, `TXNAMT` in paisa, `TOKEN` = RSA-SHA256 signature with the merchant private key) and POSTs to `…/connectipswebgw/loginpage` (`uat.connectips.com` / `login.connectips.com`). |
| Where it opens | App: in-app payment screen. Website: payment window (UAT sends `X-Frame-Options: SAMEORIGIN`). |
| Return | Success/failure URLs configured with ConnectIPS → our server. |
| Verify | `POST …/connectipswebws/api/creditor/validatetxn` (basic auth `APPID:password`, signed token). |
| Statuses | `SUCCESS` + amount match → confirm; `FAILED` → final not paid; `ERROR`/other → ask again. |
| Note | Patients log in to their bank inside the page; some banks may push an OTP/app approval — the in-app screen must allow switching to the bank app and back. |

## 8. Confirming the appointment (database)

One function `confirm_paid_attempt(attempt_id, provider_ref, verified_amount)`, one transaction:

1. Lock attempt, then appointment (`FOR UPDATE`), always in that order (no deadlocks).
2. Attempt already `COMPLETE` → return `confirmed` (idempotent).
3. Amount mismatch → `needs_attention(amount_mismatch)`.
4. Appointment already paid by **another** attempt → `needs_attention(duplicate_payment)` (refund).
5. Otherwise confirm into the booked slot, with no capacity check and no extra handling: approve,
   mark paid, re-open it if it had been cancelled or swept to no-show, recompute the slot count,
   issue a queue token, create the invoice, attempt `COMPLETE`, write events, notify patient (FCM).
6. Anything unexpected → attempt `NEEDS_ATTENTION` with the exact reason, alert clinic + admin.
7. Returns a status enum (`confirmed | needs_attention | invalid`), never a bare `FALSE`.

## 9. Slot holding

- `initiate` holds the slot **on the server for 15 minutes**. The hold ends earlier when the gateway
  gives a final answer (paid → confirmed; not paid → released).
- A payment verified after the hold ended is still confirmed into the same slot (§8 step 5).
- The client timer only displays the hold; it never cancels anything server-side.
- The no-show sweep skips appointments with a `pending` payment attempt.

## 10. Needs-attention workflow

- Alert immediately: FCM push to the clinic's devices, row in `notifications`, admin alert.
- Clinic portal and clinic app: "Payments needing attention" list with patient, amount, gateway
  reference, reason, and actions:
  - **Confirm into a slot** (pick slot → runs step 5 of §8 with an override flag, logged),
  - **Mark refunded** (refund done in the gateway merchant dashboard; enter refund reference).
- Escalation: unresolved after 24 h → admin reminder daily.

## 11. Apps and website

- Never call anything that confirms; only `initiate`, then read status.
- After returning from the gateway: show "Payment received, confirming…", read the appointment
  status every 3 s for 1 min, then every 15 s while visible (one small query).
- States shown: Confirming… / Confirmed ✅ / We received your payment and the clinic is reviewing it /
  Payment not completed.
- App killed mid-payment: on next open, any pending attempt shows its current status.
- See §11a: payment always opens **inside** the app or the website.

## 11a. Paying without leaving Dactor

Tested 2026-11-22 from the build environment (response headers of the checkout pages):

| Gateway | Header | Inside our **website** (iframe)? | Inside our **app** (WebView)? |
|---|---|---|---|
| eSewa (real sandbox checkout page) | `X-Frame-Options: DENY` | ❌ blocked by eSewa | ✅ |
| Khalti (sandbox) | `X-Frame-Options: SAMEORIGIN` | ❌ blocked | ✅ |
| Fonepay (payment request page) | `X-Frame-Options: DENY` | ❌ blocked | ✅ |
| ConnectIPS (UAT) | `X-Frame-Options: SAMEORIGIN` | ❌ blocked | ✅ |

`X-Frame-Options` only stops a page being shown **inside another website**. An in-app WebView loads the
gateway page as its own top-level page, so it is not affected.

**Apps (patient app, clinic app): in-app payment screen (WebView) for all four gateways.**
- Opens over the booking flow; loads the server-built checkout (form POST for eSewa/ConnectIPS/Fonepay
  redirect, `payment_url` for Khalti).
- Watches navigation: when it reaches **our** return URL it closes itself and shows the server status (§11).
- Lets `intent://` / app links through so the patient can approve in the eSewa app or a bank app and
  come back to the same screen.
- JavaScript + DOM storage on, file access off, no `addJavascriptInterface`, HTTPS only, only gateway and
  our own hosts allowed to load.
- Fallback if a gateway later blocks WebViews: Chrome Custom Tab (looks in-app, same return flow).
- Gateways also publish native mobile SDKs (eSewa, Khalti); optional later, not needed for this plan.

**Website: the booking page never navigates away.**
- **Fonepay:** QR shown directly on our page (QR mode, §7.3) → no other website at all.
- **eSewa, Khalti, ConnectIPS:** open a **payment window** over our page (opened directly from the
  "Pay" click so browsers do not block it; on phones it opens as a new tab). The form is posted into
  that window; our return page closes it and tells the booking page via `postMessage`; the booking
  page shows the server status (§11).
- If the window is blocked or closed early: show "Continue payment" (re-opens it) and keep polling the
  server status; the verifier (§6) confirms regardless.
- Full-page redirect remains only as a last resort if a browser blocks windows entirely.

## 12. Security

- Amount from the server only (already); clients cannot write `payment_status`, attempts or events.
- `transaction_uuid` unique; return data must match the stored attempt (replay protection).
- Return URLs: server-side allowlist only (already).
- Demo mode: refuse to enable in the live environment (environment flag on the server) and show a
  banner in admin whenever it is on; all demo payments marked `environment=test` and excluded from revenue.
- Rate limits on `initiate` and booking per phone/IP (enable `consume_security_rate_limit`).
- Secrets in Vault (§5.3); rotate the token in VULN-019.
- Free follow-up/reschedule eligibility decided by the server, not the client.
- Edge function errors never echo provider bodies or secrets to clients.

## 13. Monitoring and alerts

View `payment_health`:
- pending attempts older than 10 min,
- `needs_attention` count,
- minutes since the last verifier heartbeat,
- verifier errors in the last hour,
- confirmations in the last 24 h by gateway.

Alerts (job every 5 min → FCM/email to admin):
- verifier heartbeat older than 5 min,
- any pending attempt older than 20 min (hold is 15 min, so the verifier is behind),
- any `needs_attention` older than 2 h,
- gateway error rate > 20% over 15 min.

Admin panel card: green/red health + the numbers above.
Weekly: compare confirmed payments against each gateway's merchant statement (export → match on
reference), report differences.

## 14. Failure modes

| Failure | Detected by | Handling | Max delay to confirm |
|---|---|---|---|
| Patient closes browser after paying | verifier | confirmed by verifier | ~1–2 min |
| Phone dies / no internet after paying | verifier | same | ~1–2 min |
| Gateway status API down | errors, alert | keep retrying with backoff, never fail | until API returns |
| Edge function down / deploy broken | heartbeat alert | fix; backlog drains automatically | outage + minutes |
| pg_cron stopped | heartbeat alert | restart job | outage + minutes |
| Duplicate returns / double click | idempotent confirm | no-op | — |
| Two verifier runs overlap | `SKIP LOCKED` lease | no double work | — |
| Patient pays twice | duplicate check | second → needs attention → refund | — |
| Amount tampered | amount match | needs attention + admin alert | — |
| Slot full by the time payment arrives | — | confirmed into the same slot | — |
| No-show sweep during payment | sweep skips pending payments | confirm | — |
| Clinic changes keys mid-payment | merchant code stored on attempt | verify with original code | — |
| Demo mode left on | admin banner, live-env refusal | blocked | — |
| Payment completes after the hold | patient return (path 1) or staff "check now" (path 3) | confirmed into the same slot | when the patient returns / staff check |
| Gateway gives no final answer within the hold | end of hold | `UNRESOLVED`, shown to staff with "check now" | staff |

## 15. Testing

- SQL tests on a local Postgres (same approach as the scaling migration): every state transition,
  idempotency, duplicate payment, capacity, no-show interaction, concurrent workers.
- Edge function unit tests with a mocked gateway: COMPLETE, PENDING, NOT_FOUND, CANCELED, AMBIGUOUS,
  timeout, HTTP 500, malformed JSON, amount mismatch.
- eSewa sandbox (`EPAYTEST`) end-to-end in a staging project: normal flow, close browser after paying,
  airplane mode, kill app.
- Chaos: block gateway host for 30 min → no state changes, backlog drains after.
- Load: 1,000 pending attempts → verifier drains within schedule, no starvation.

## 16. Rollout

1. Migration: new columns, `payment_events`, `payment_verifier_runs`, `confirm_paid_attempt`,
   Vault secrets, cron jobs, `payment_health` (additive, safe to run on live data).
2. Edge function: `verify_attempt`, `verify_due`, status-enum handling; keep old actions working.
3. **Backfill:** re-verify every `expired`/`failed`/`pending` attempt from the last 30 days with the
   gateway; anything actually paid → confirm or needs attention. This recovers payments that may
   already have been lost.
4. Clinic portal / clinic app: needs-attention list and actions; "check now".
5. Patient app / website: status screen, stop client-triggered reconcile; in-app payment screen.
6. Turn on alerts; watch `payment_health` daily for two weeks.
7. Remove the old `app.settings`-based cron job and the 24 h blind expiry.

## 17. Runbook

- **Is it healthy?** `SELECT * FROM payment_health;` – heartbeat < 2 min, no pending > 30 min.
- **A patient says they paid:** find the attempt by phone/code → "check now" → if needs attention,
  confirm into a slot or refund.
- **Verifier stopped:** check `cron.job_run_details`, edge function logs, Vault secrets.
- **Refund:** do it in the gateway's merchant dashboard, then "Mark refunded" with the reference.

## 18. Decisions

Decided:
1. Slot hold: **15 minutes** (ends earlier on a final gateway answer) (§9).
2. Late payment: confirmed into the same slot, **no extra mechanism** (no capacity check or notices) (§8).
5. Checking: every minute during the 15-minute hold only; then `UNRESOLVED` for staff, no later automatic re-checks (§6).
6. In-app payment screen in the apps for all gateways; on the website a payment window over the booking
   page (gateways forbid embedding), Fonepay as an on-page QR (§11a).

Still open:
3. Who receives alerts (clinic owner, receptionist devices, admin email/phone)?
4. Refund policy and who may mark refunds (clinic staff or admin only)?
7. Fonepay QR mode needs QR access on each clinic's Fonepay merchant account — to confirm with Fonepay.
