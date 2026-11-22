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
                    ├─► NEEDS_ATTENTION ─┬─► COMPLETE   (staff confirmed into a slot)
                    │                    └─► REFUNDED   (staff refunded, reference recorded)
                    ├─► FAILED                         (gateway says cancelled / not paid, after final check)
                    └─► EXPIRED                        (no payment found after the final check)
```

| From | To | Who | Condition |
|---|---|---|---|
| PENDING | COMPLETE | return / verifier / staff check | gateway `COMPLETE` + merchant, txn id, amount match + appointment confirmable |
| PENDING | NEEDS_ATTENTION | same | gateway `COMPLETE` but appointment **not** confirmable (no-show, cancelled with slot taken, duplicate payment), **or** amount/merchant mismatch, **or** gateway status `AMBIGUOUS` |
| PENDING | FAILED | verifier | gateway definitively `CANCELED` / refunded / not found **after the final check** |
| PENDING | EXPIRED | verifier | still no payment at the final check (72 h) |
| NEEDS_ATTENTION | COMPLETE / REFUNDED | clinic or admin | manual action, with note and reference |

Rules:
- Network errors, timeouts and HTTP 5xx from the gateway **never** change state; they only reschedule.
- `COMPLETE`, `FAILED`, `EXPIRED`, `REFUNDED` are final. A later gateway `COMPLETE` on a `FAILED`/`EXPIRED`
  attempt moves it to `NEEDS_ATTENTION` (money arrived late), never silently ignored.

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
| 24–72 h | 6 h |
| 72 h | final check, then `EXPIRED` / `FAILED` |

`next_check_at` is set from this table after each check; errors add jitter (±20%).

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

| Gateway | Check | Confirm when | Retry when | Fail when |
|---|---|---|---|---|
| eSewa | status API (`product_code`, `total_amount`, `transaction_uuid`) | `COMPLETE` and all three match | `PENDING`, `NOT_FOUND` (first 72 h), HTTP error, timeout | `CANCELED`, `FULL_REFUND` after final check |
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
5. Appointment confirmable (pending, not no-show, slot still held or capacity available) →
   approve, mark paid, recompute slot count, issue queue token, create invoice, attempt `COMPLETE`,
   write events, notify patient (FCM).
6. Otherwise → attempt `NEEDS_ATTENTION` with the exact reason, appointment untouched, alert clinic + admin.
7. Returns a status enum (`confirmed | needs_attention | invalid`), never a bare `FALSE`.

## 9. Slot holding

- `initiate` holds the slot **on the server** for 15 minutes (`hold_expires_at` on the appointment);
  the client timer only displays it and never cancels anything server-side.
- Payment verified while the hold is valid → confirm.
- Payment verified after the hold expired → if capacity is still free, re-take the slot and confirm;
  else `NEEDS_ATTENTION(late_payment)` so staff can offer another slot or refund.
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
- In-app payment screen (WebView) that watches for our own return URL and closes itself; still
  server-verified.

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
| Slot taken while paying | hold / capacity check | confirm or needs attention | — |
| No-show sweep during payment | sweep skips pending payments | confirm | — |
| Clinic changes keys mid-payment | merchant code stored on attempt | verify with original code | — |
| Demo mode left on | admin banner, live-env refusal | blocked | — |
| Payment arrives after expiry | final-check rule | needs attention (late payment) | — |

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

## 18. Decisions needed

1. Slot hold length while paying (proposal: 15 min).
2. Late payment when the slot is gone: auto-move to the next free slot the same day, or always
   needs attention?
3. Who receives alerts (clinic owner, receptionist devices, admin email/phone)?
4. Refund policy and who may mark refunds (clinic staff or admin only)?
5. Final-check window before expiry (proposal: 72 h).
