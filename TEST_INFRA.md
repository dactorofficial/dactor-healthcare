# DACTOR Platform Pay at Desk Test Infrastructure Specification (TEST_INFRA.md)

## 1. Test Philosophy & Dual-Track E2E Architecture

The Pay at Desk testing infrastructure provides comprehensive, opaque-box end-to-end verification of the offline checkout and clinic counter approval lifecycle across all DACTOR platforms (Patient Android App, Clinic Android App, Clinic Web Portal, and Supabase Backend).

### Core Principles

1. **Zero Client Trust (Authoritative Server Computing)**:
   - Clients (mobile apps, web browsers) are inherently untrusted execution environments. Clients must never be allowed to directly update appointment statuses to `APPROVED` or arbitrarily specify payment amounts (`fee_amount`, `service_charge_amount`, `total_amount`).
   - All state transitions and financial calculations are executed server-side via `SECURITY DEFINER` PostgreSQL RPCs (`confirm_pay_at_desk_booking`, `create_pay_at_desk_appointment`, `approve_pay_at_desk_appointment`, `reject_pay_at_desk_appointment`, `retry_pay_at_desk_appointment`, `expire_pay_at_desk_appointments`) and hardened Supabase Edge Functions (`appointment-payment`).
2. **Dual-Track Testing Methodology**:
   - **Track 1: Client Observable Interface Contracts**: Validates request schemas, error handling, session management, dynamic fee breakdowns, payment timer cancellation, 10-digit tracking codes, and patient/clinic UX behaviors specified in `docs/pay-at-desk-spec.md`.
   - **Track 2: Backend State Machine & Security Invariants**: Validates transactional isolation (`FOR UPDATE` row locks), anti-tampering triggers (`dactor.authoritative_context`), RLS policies, role permission enforcement (anon, authenticated, clinic staff, super_admin, service_role), live queue exclusion, and capacity overload invariants (Rule 7).
3. **Opaque-Box Verification**:
   - The test harness interacts with components strictly through external observable interfaces, public RPC signatures, HTTP payloads, and database constraints. No facade mocks or bypass stubs are used; real calculations, cryptographic random 10-digit codes, and state machines are evaluated.

---

## 2. Multi-Tier Test Suite Architecture

The test suite is organized into four hierarchically tiered modules in `tests/pay_at_desk/`:

```
tests/pay_at_desk/
├── test_runner.cjs               # Zero-dependency asynchronous test harness & reporter
├── contracts.cjs                 # Formal interface contracts, state machines, math oracles
├── tier1_feature_coverage.test.cjs # Tier 1: Feature Coverage (F1 - F5, >=35 tests)
├── tier2_boundary_corner.test.cjs  # Tier 2: Boundary & Corner Cases (B1 - B10, >=30 tests)
├── tier3_cross_feature.test.cjs   # Tier 3: Cross-Feature State Combinations (C1 - C6, >=18 tests)
├── tier4_real_world.test.cjs      # Tier 4: Real-World Scenarios (S1 - S6, >=16 tests)
├── test_pay_at_desk_e2e.cjs       # Master CLI runner & executive report generator
└── run_tests.ps1                  # Windows PowerShell execution wrapper
```

### Tier Breakdown & Minimum Thresholds

| Tier | Name | Target Scope | Minimum Tests | Focus |
|---|---|---|---|---|
| **Tier 1** | **Feature Coverage** | F1 through F5 specifications | >= 35 (>=5 per feature) | Core functionality: RPC confirmation, 5% fee math, WAITING_FOR_APPROVAL state, clinic pending requests listing, queue exclusion |
| **Tier 2** | **Boundary & Corner Cases** | Edge cases & malformed inputs (B1-B10) | >= 30 | Malformed UUIDs, non-existent records, already paid appointments, cancelled appointments, past slots, zero/negative fees, 3-attempt lifecycle boundary |
| **Tier 3** | **Cross-Feature Interactions** | Multi-step state machine flows (C1-C6) | >= 18 | Booking -> counter approval -> Rule 7 slot overload [13/12] -> live queue entry; Rejection -> retry counter -> 2-day expiry; Edge Function fallback |
| **Tier 4** | **Real-World Scenarios** | End-to-end multi-party journeys (S1-S6) | >= 16 | Patient mobile checkout, clinic receptionist desk management, overloaded clinic sessions, push notifications, anti-tampering adversarial attacks |

---

## 3. Feature Inventory Matrix

| ID | Feature | Specification Reference | Description & Invariants |
|---|---|---|---|
| **F1** | Confirmation RPC & Backend Handler | `ORIGINAL_REQUEST.md` R1, `plan.md` #1 | `confirm_pay_at_desk_booking`: Validates appointment exists, resolves doctor fee, sets `payment_mode = 'PAY_AT_DESK'`, `status = 'WAITING_FOR_APPROVAL'`, `payment_status = 'pending'`, `attempt_number = 1`, `checkin_status = 'not_checked_in'`. Emits staff notification. Edge Function fallback in `appointment-payment`. |
| **F2** | 5% Platform Service Charge Computation | `docs/pay-at-desk-spec.md` Rule 1 | Exact formula: `service_charge = round(fee * 0.05, 2)` and `total = fee + service_charge`. Configurable constant stored in `app_settings` (`pay_at_desk_fee_percent`, default 5.0). Client fee tampering overridden by authoritative catalog fee. Strict 2-decimal precision. |
| **F3** | WAITING_FOR_APPROVAL State & Tracking | `docs/pay-at-desk-spec.md` Rules 2 & 4 | Unique 10-digit tracking code generation. Initial status `WAITING_FOR_APPROVAL`. Patient UI displays "Waiting for approval from clinic" and Call Clinic action. Direct client updates to `APPROVED` blocked by RLS / trigger. |
| **F4** | Clinic Pending Requests Listing | `docs/pay-at-desk-spec.md` Rule 5 | `list_pending_pay_at_desk_requests(p_clinic_id)`: Restricted to verified clinic staff or Super Admin. Cross-clinic isolation enforced (Clinic B cannot view Clinic A). Returns patient details, attempt number ("Attempt X of 3"), and fee breakdown sorted chronologically. |
| **F5** | Live Queue Exclusion While Pending | `docs/pay-at-desk-spec.md` Rule 3 | Appointments in `WAITING_FOR_APPROVAL` do NOT exist in `queue_entries` and do not increment queue positions. Live queue status queries return pending status rather than token numbers. |
| **B1** | UUID Format Validation | Defensive Engineering | Malformed, non-hex, truncated, null, or empty UUID strings rejected cleanly with structured error responses. |
| **B2** | Non-existent Record Handling | Defensive Engineering | Querying or confirming non-existent appointment ID returns explicit 404 / 'Appointment not found' error. |
| **B3** | Already Paid Appointment Gate | State Invariants | Appointments with `payment_status = 'paid'` or `payment_mode = 'ONLINE'` cannot be converted to Pay at Desk. |
| **B4** | Cancelled Appointment Gate | State Invariants | Cancelled appointments (`checkin_status = 'cancelled'`) cannot be confirmed or approved. |
| **B5** | Past Slot Expiry Gate | `docs/pay-at-desk-spec.md` Rule 6 | Appointments whose slot date/time has passed cannot be booked or approved; marked as `EXPIRED`. |
| **B6** | Consultation Fee Clamping | Financial Integrity | Zero or negative consultation fees handled safely (minimum floor enforced or zero service charge calculated without negative balance). |
| **B7** | 3-Attempt Lifecycle Boundary | `docs/pay-at-desk-spec.md` Rule 6 | Initial attempt = 1. Retry 1 -> Attempt 2. Retry 2 -> Attempt 3 (sets `expires_at = now + 2 days`). Retry 3 (Attempt 4) -> strictly rejected. Retry only permitted when status is `UNAPPROVED`. |
| **B8** | Past Date/Time Booking Gate | Temporal Validation | Booking with slot or date in the past rejected. |
| **B9** | Nepal Mobile Number Validation | Identity & Anti-Spam | Patient mobile must be exactly 10 digits starting with 9. Rate limit: max 5 bookings per hour per mobile. |
| **B10**| Patient Age Validation | Input Validation | Age must be between 0 and 120. |
| **C1** | End-to-End Approval & Overload Lifecycle | `docs/pay-at-desk-spec.md` Rules 3, 5, 7 | Booking -> Excluded from queue -> Receptionist approves -> Status `APPROVED` -> Slot capacity overload (12/12 -> 13/12 safely) -> Live queue entry created with sequential token -> Patient tracker displays live queue position. |
| **C2** | Rejection & Retry Attempt Escalation | `docs/pay-at-desk-spec.md` Rules 4 & 6 | Rejection -> `UNAPPROVED` -> Patient retries -> Attempt 2 -> Rejection -> Patient retries -> Attempt 3 (`expires_at` set to +2 days) -> 4th retry blocked. |
| **C3** | Global Expiry Engine | `docs/pay-at-desk-spec.md` Rule 6 | Expiry engine transitions 3rd attempt requests older than 2 days to `EXPIRED`. Expiry engine strictly restricted to `service_role` and Super Admin. |
| **C4** | Slot Expiry Enforcement | `docs/pay-at-desk-spec.md` Rule 6 | Pending request expires when scheduled slot time passes. |
| **C5** | Cross-Clinic Spoofing Prevention | Security & Isolation | Clinic B staff attempting to approve or reject Clinic A appointment is rejected with Access Denied. |
| **C6** | Edge Function Fallback Resilience | Architecture Resilience | Edge function `confirm_pay_at_desk` executes RPC via service role and handles network/client retries gracefully. |
| **S1** | Patient Mobile Checkout Journey | Real-World Workflow | Select Pay at Desk, dynamic 5% breakdown display, session timer clearance, tracking code persistence, navigation to confirmation screen. |
| **S2** | Clinic Reception Desk Workflow | Real-World Workflow | View pending requests badge, review patient details and attempt counter, one-click counter approval. |
| **S3** | Overloaded Clinic Session Handling | Real-World Workflow | Slot at 12/12 approved to 14/12. UI shows full without crashing or negative capacity. Sequential tokens assigned. |
| **S4** | Patient Rejection & Retry Journey | Real-World Workflow | Receptionist rejection, patient in-app notification, Retry button active, re-submission to reception desk. |
| **S5** | Malicious Privilege & Fee Tampering | Security Hardening | Adversary attempting to forge fee = 0 or status = APPROVED via direct SQL / API rejected by RLS & anti-tampering triggers. |
| **S6** | Expired Request Tracking Experience | Real-World Workflow | Patient tracking expired request sees "Request expired", no retry button, dialer link to call clinic. |

---

## 4. Test Execution & Coverage Thresholds

### Execution Commands

```powershell
# Run the complete Pay at Desk Dual-Track E2E Test Suite:
node tests/pay_at_desk/test_pay_at_desk_e2e.cjs

# Run individual tiers independently:
node tests/pay_at_desk/test_pay_at_desk_e2e.cjs 1   # Tier 1: Feature Coverage
node tests/pay_at_desk/test_pay_at_desk_e2e.cjs 2   # Tier 2: Boundary & Corner Cases
node tests/pay_at_desk/test_pay_at_desk_e2e.cjs 3   # Tier 3: Cross-Feature Combinations
node tests/pay_at_desk/test_pay_at_desk_e2e.cjs 4   # Tier 4: Real-World Scenarios
```

### Coverage Thresholds & Quality Gates

| Gate Metric | Threshold Requirement | Enforcement |
|---|---|---|
| **Tier 1 Pass Rate** | 100% (>= 35 tests, >= 5 per feature) | Strict: Exit code 1 on any failure |
| **Tier 2 Pass Rate** | 100% (>= 30 tests) | Strict: Exit code 1 on any failure |
| **Tier 3 Pass Rate** | 100% (>= 18 tests) | Strict: Exit code 1 on any failure |
| **Tier 4 Pass Rate** | 100% (>= 16 tests) | Strict: Exit code 1 on any failure |
| **Overall Test Suite** | 100% Pass (>= 100 tests total) | Strict: Exit code 0 required |
| **Regression Safety** | Zero regressions on existing Security (120) & Maps (108) suites | Verification run before release |
