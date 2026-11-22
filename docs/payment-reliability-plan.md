# Payment reliability plan: a paid appointment is never lost

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
| G7 | A payment is never given up on by a timer: the server keeps checking until the **gateway gives a final answer**. |
| G8 | Patients **never leave Dactor** to pay: payment opens inside the app and inside the website. |
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
                    └─► FAILED                         (gateway gave a final "not paid" answer)
```

| From | To | Who | Condition |
|---|---|---|---|
| PENDING | COMPLETE | return / verifier / staff check | gateway `COMPLETE` + merchant, txn id, amount match. Confirmed **into the booked slot even if it is now full** (overload allowed). |
| PENDING | NEEDS_ATTENTION | same | gateway `COMPLETE` but: duplicate payment for an already-paid appointment, **or** amount/merchant mismatch, **or** gateway status `AMBIGUOUS` / partial refund |
| PENDING | FAILED | verifier | gateway gives a **final** "not paid" answer (see §7: cancelled, failed, refunded, or "no such payment" after the session has closed) |
| NEEDS_ATTENTION | COMPLETE / REFUNDED | clinic or admin | manual action, with note and reference |

Rules:
- Network errors, timeouts and HTTP 5xx from the gateway **never** change state; they only reschedule.
- There is **no time-based expiry**. An attempt stays `PENDING` until the gateway gives a final answer.
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
| Age of attempt | Check every |
|---|---|
| 0–10 min | 1 min |
| 10–60 min | 5 min |
| 1–24 h | 30 min |
| after 24 h | once a day, **until the gateway gives a final answer** |

`next_check_at` is set from this table after each check; errors add jitter (±20%).
Checks stop only on a final answer (§7). Attempts still unanswered after 30 days appear in the admin
health view as "long-pending" so someone can look, but they are **not** closed automatically.

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
(pending, timeout, HTTP error, malformed reply) means "ask again later".

| Gateway | Check | Confirm when | Ask again when | Final "not paid" when |
|---|---|---|---|---|
| eSewa | status API (`product_code`, `total_amount`, `transaction_uuid`) | `COMPLETE` and all three match | `PENDING`, HTTP error, timeout; `NOT_FOUND` while the session may still be open | `CANCELED`, `FULL_REFUND`; `NOT_FOUND` once the checkout session has closed (session lifetime to be confirmed with eSewa; until then treat `NOT_FOUND` as final after 24 h) |
| Khalti | lookup by `pidx` | `Completed` and amount (paisa) matches | `Pending`, `Initiated`, errors | `Expired`, `User canceled`, `Refunded` |
| Fonepay | verification API (PRN, amount, merchant) | success + matches | pending, errors | failed |
| ConnectIPS | validate txn API | `SUCCESS` + amount | pending, errors | `FAILED` |

- Mismatch of amount or merchant on a successful payment → `NEEDS_ATTENTION` (`amount_mismatch` /
  `merchant_mismatch`); this is also a fraud signal and alerts the admin.
- `AMBIGUOUS` or `PARTIAL_REFUND` → `NEEDS_ATTENTION`.
- Verification uses `merchant_code` / `environment` stored on the attempt, not the clinic's current settings.

## 8. Confirming the appointment (database)

One function `confirm_paid_attempt(attempt_id, provider_ref, verified_amount)`, one transaction:

1. Lock attempt, then appointment (`FOR UPDATE`), always in that order (no deadlocks).
2. Attempt already `COMPLETE` → return `confirmed` (idempotent).
3. Amount mismatch → `needs_attention(amount_mismatch)`.
4. Appointment already paid by **another** attempt → `needs_attention(duplicate_payment)` (refund).
5. Otherwise confirm **into the same slot, even if it is full** (overload allowed): approve, mark paid,
   re-open it if it had been cancelled or swept to no-show, recompute the slot count, issue a queue
   token, create the invoice, attempt `COMPLETE`, write events, notify patient (FCM). If the slot is
   now over capacity, also notify the clinic ("1 extra patient in 10:00–10:30").
6. Anything unexpected → attempt `NEEDS_ATTENTION` with the exact reason, alert clinic + admin.
7. Returns a status enum (`confirmed | needs_attention | invalid`), never a bare `FALSE`.

## 9. Slot holding

- `initiate` holds the slot **on the server** while the payment is open. The hold ends when the
  gateway gives a final answer (paid → confirmed; not paid → released), with a safety limit of
  **30 minutes** so an abandoned checkout cannot block a slot all day.
- Releasing the hold never costs a paying patient their booking: a payment confirmed later still goes
  into **the same slot, even if it is full** (§8 step 5).
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

**Apps (patient app, clinic app):** the gateway page opens in an in-app payment screen (WebView)
over the booking flow. The screen watches for our own return URL, closes itself, and shows the
server's status (§11). If the gateway page asks to open the gateway's own app (e.g. the eSewa app),
the app is opened and the patient comes straight back to the same screen. Works for all four gateways.

**Website:** the gateway page opens in a payment panel **on our page**, in this order of preference:
1. **Inside the page (embedded frame)** for gateways that allow it.
2. **Fonepay:** show the dynamic QR **directly on our page**; the patient scans it with any banking
   app; no gateway page at all.
3. For gateways that forbid embedding (payment sites often do, to prevent clickjacking): a **payment
   window on top of our page** (popup) that closes itself on return; the booking page never navigates
   away and updates from the server status.

To verify per gateway before building (could not be checked from the build environment):
whether eSewa, Khalti and ConnectIPS checkout pages allow embedding (`X-Frame-Options` /
`Content-Security-Policy: frame-ancestors`), and whether each offers an official embedded or
popup checkout. If a gateway forbids both embedding and popups, it falls back to the current
full-page redirect for that gateway only, still server-verified.

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
- any pending attempt older than 30 min,
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
| Slot full by the time payment arrives | overload rule | confirm into the same slot, notify clinic | — |
| No-show sweep during payment | sweep skips pending payments | confirm | — |
| Clinic changes keys mid-payment | merchant code stored on attempt | verify with original code | — |
| Demo mode left on | admin banner, live-env refusal | blocked | — |
| Payment arrives hours/days later | no time-based expiry | confirmed into the same slot | next check |
| Gateway never answers (abandoned checkout) | daily check, 30-day "long-pending" list | slot hold released after 30 min; stays visible to admin | — |

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
1. Slot hold: until the gateway gives a final answer, safety limit 30 minutes (§9).
2. Late payment: always into the **same slot, overload allowed** (§8).
5. Checking: **until the gateway gives a final answer**; no time-based expiry (§6, §7).
6. Payment opens **inside** the app and website; no forwarding to another website (§11a).

Still open:
3. Who receives alerts (clinic owner, receptionist devices, admin email/phone)?
4. Refund policy and who may mark refunds (clinic staff or admin only)?
7. eSewa checkout session lifetime (when `NOT_FOUND` becomes final), and each gateway's embedding /
   popup support (§11a) — to confirm with the gateways.
