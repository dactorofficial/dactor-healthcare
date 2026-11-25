# Plan: Payment Logs Screen — Format & UI

**Status:** plan only. No code has been changed.
**Screen:** clinic app → `ui/billing/PaymentLogsScreen.kt` (+ `domain/util/PaymentLedgerHelper.kt`)
**Related plans:** `FOLLOWUP_RESCHEDULE_BILLING_PLAN.md` (one bill per visit, `visit_type`, payments
in `invoice_transactions`) and `DIAGNOSTIC_LAB_DOCTOR_CLEANUP_PLAN.md` (labs: no doctor, Income per Test).

---

## 1. Problems with the current screen

| # | Today | Effect |
|---|---|---|
| 1 | Everything (date bar, 4 KPI cards, visit chips, method chips, search, doctor chips, tabs) is stacked above the list. | On a phone the first log row is almost off-screen. |
| 2 | Tabs (Ledger / Expenses / Doctors / 5% & Subscriptions) sit **below** the filters, and the filters apply to some tabs but not others. | Confusing: it's not clear what each filter changes. |
| 3 | "NEW / FOLLOW-UP" is guessed from `fee == 0`. | Follow-ups with extra items show as NEW. Labs show NEW/FOLLOW-UP, which means nothing there. |
| 4 | Payment method chips are hard-coded: `CASH, FONEPAY, ESEWA, KHALTI`. | Pay-at-Desk, Online, Free and Partial payments can't be filtered. |
| 5 | Each row shows `Dr. <name>` even for labs, with fallback `"Doctor"`. | Wrong for labs (see the lab plan). |
| 6 | Pending / partly paid bills aren't separated from collected money. | "Gross Collections" mixes expected money with received money. |
| 7 | KPIs use the words "Patients Consulted / +N New / free follow-ups" for every clinic type. | Wrong for labs, unclear for multi-visit. |
| 8 | One row per bill, not per payment. | A bill paid in 2 parts on 2 days shows on one day only. |

---

## 2. The rules the new screen follows

1. **A row = one payment** (one `invoice_transactions` record). A bill paid in 2 parts shows as 2
   rows on the days the money came in. Free visits (Rs. 0) show as a row with amount Rs. 0 and the
   badge `FREE`.
2. **Collected ≠ Pending.** "Collected" = sum of payment rows in the period. "Pending" = unpaid
   balance of bills for visits in the period. They're never added together.
3. **Visit type comes from the data** (`visit_type`: `new` / `follow_up`), never from the fee.
4. **Clinic type decides the wording and the tabs:**

| | `single_visit` / `multi_visit` | `diagnostic_lab` |
|---|---|---|
| Tabs | Payments · Pending · Doctors · Expenses · Fees | Payments · Pending · Tests · Expenses · Fees |
| Row subtitle | `#Code · Dr. Name` | `#Code · CBC, Lipid Profile` |
| Visit badge | `NEW` / `FOLLOW-UP` / `FREE` | none (only `FREE` if amount is 0) |
| Breakdown tab | Income per doctor | Income per test |

5. **Money format:** `Rs. 1,250` (Nepali grouping via `CurrencyFormatter.formatNPR`, no decimals unless
   non-zero paisa). Negative (refund) = `− Rs. 500` in red.
6. **Date/time format:** list headers `Today`, `Yesterday`, else `Mon, 24 Nov 2026`. Row time `10:42 AM`.

---

## 3. Screen layout (phone, top to bottom)

```
┌─────────────────────────────────────────────┐
│ ←  Payment Logs                    ⤓   ＋   │  1. Top bar
├─────────────────────────────────────────────┤
│ [ Day ][ Month ][ Year ][ Custom ]          │  2. Period selector
│   ‹   Today, Mon 24 Nov 2026   ›            │
├─────────────────────────────────────────────┤
│ ┌───────────────┐ ┌───────────────┐         │  3. Summary cards
│ │ Collected     │ │ Pending       │         │     (2 × 2 grid)
│ │ Rs. 18,400    │ │ Rs. 2,100     │         │
│ │ 23 payments   │ │ 3 bills       │         │
│ └───────────────┘ └───────────────┘         │
│ ┌───────────────┐ ┌───────────────┐         │
│ │ Expenses      │ │ Net           │         │
│ │ Rs. 3,200     │ │ Rs. 14,280    │         │
│ │ 4 entries     │ │ after fees    │         │
│ └───────────────┘ └───────────────┘         │
├─────────────────────────────────────────────┤
│ Payments | Pending | Doctors | Expenses | Fees │  4. Tabs (sticky)
├─────────────────────────────────────────────┤
│ 🔍 Search name, phone, code      [Filters ▾2]│  5. Search + filter button (sticky)
│ (Cash ×) (Follow-up ×)                       │     active filter chips
├─────────────────────────────────────────────┤
│ TODAY                      Rs. 18,400 · 23  │  6. List: day header
│ ┌─────────────────────────────────────────┐ │
│ │ Ram Sharma               Rs. 500        │ │     payment row
│ │ #4821930176 · Dr. Anil   CASH   10:42 AM│ │
│ │ [NEW]                                   │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ Sita KC                  Rs. 0          │ │
│ │ #1029384756 · Dr. Anil   FREE   10:15 AM│ │
│ │ [FOLLOW-UP]                             │ │
│ └─────────────────────────────────────────┘ │
│ YESTERDAY                  Rs. 9,800 · 12   │
│ ...                                         │
└─────────────────────────────────────────────┘
```

Sections 1–3 scroll away; **4 (tabs) and 5 (search/filters) stick** to the top while the list scrolls
(`LazyColumn` + `stickyHeader`).

---

## 4. Component specs

Colors use the existing palette in the app (teal `#0D9488`, slate text `#0F172A` / `#64748B`,
borders `#E2E8F0`, card bg `#FFFFFF`, screen bg `#F8FAFC`). Spacing: 16dp side padding, 12dp
between blocks, 8dp between rows.

### 4.1 Top bar
- Title `Payment Logs` (18sp, Bold). **Remove** the subtitle "Live revenue audit • Doctor tracker • Payouts".
- Actions:
  - `⤓` Export (icon `FileDownload`) → bottom sheet "Export CSV / Share PDF summary" for the selected period.
  - `＋` Add expense (icon `AddCircleOutline`) → existing `AddEditExpenseDialog`. Shown on every tab.

### 4.2 Period selector
- Segmented button row (Material3 `SingleChoiceSegmentedButtonRow`): `Day | Month | Year | Custom`. Height 36dp.
- Stepper row under it: `‹` (IconButton 40dp) · label (15sp SemiBold, centred, tap = date picker) · `›`.
  - Day label: `Today, Mon 24 Nov 2026` / `Yesterday, …` / `Mon, 24 Nov 2026`.
  - Month: `November 2026`. Year: `2026`. Custom: `24 Nov – 30 Nov 2026` (tap opens `DateRangePicker`).
  - `›` disabled when the next period is in the future.
- Replaces today's `scope_selector_pills` + `date_stepper_bar` (same state: `periodScope`, `selectedDate`, …).

### 4.3 Summary cards (2 × 2 grid)
Each card: `Card` 12dp corners, 1dp border `#E2E8F0`, white, padding 12dp, min height 84dp.
Line 1 label 12sp Medium `#64748B` · Line 2 value 20sp Bold · Line 3 hint 11sp `#64748B`.

| Card | Value | Hint | Value color | Tap |
|---|---|---|---|---|
| **Collected** | Sum of payment rows in period | `23 payments` | `#047857` green | opens Payments tab |
| **Pending** | Sum of unpaid balance of bills for visits in period | `3 bills` | `#B45309` amber | opens Pending tab |
| **Expenses** | Sum of expenses in period | `4 entries` | `#BE123C` red | opens Expenses tab |
| **Net** | Collected − Expenses − platform fees (5% Pay-at-Desk + subscription due in period) | `after fees & expenses` | `#5B21B6` purple; red if < 0 | opens Fees tab |

Removed: the "Patients Consulted / +N New" card (moved into the Doctors/Tests tab header).

### 4.4 Tabs (sticky)
- `ScrollableTabRow`, edge padding 16dp, labels 13sp SemiBold, each with a count:
  `Payments (23)` · `Pending (3)` · `Doctors (4)` or `Tests (9)` · `Expenses (4)` · `Fees`.
- Default tab: Payments. Remember the last tab per session (`rememberSaveable`).
- All tabs use the **same period** from 4.2. Search/filters (4.5) only apply to Payments and Pending.

### 4.5 Search + Filters (sticky, Payments & Pending tabs only)
- Search field: `OutlinedTextField`, height 48dp, 12dp corners, leading `Search` icon,
  placeholder `Search name, phone, code`, trailing ✕ when not empty. Matches patient name, phone,
  10-digit code, doctor name (OPD) or test name (lab).
- `Filters` button (`FilledTonalButton`, icon `Tune`) with a badge = number of active filters.
  Opens a **bottom sheet**:

```
Filters                                   Reset
─────────────────────────────────────────
Payment method
 (All) (Cash) (Fonepay) (eSewa) (Khalti)
 (Pay at Desk) (Online) (Free)
Visit type            ← OPD only
 (All) (New) (Follow-up)
Doctor                ← OPD only; Tests for labs
 (All doctors) (Dr. Anil) (Dr. Rita) …
Status                ← Pending tab only
 (All) (Unpaid) (Partly paid)
─────────────────────────────────────────
[            Show 18 results            ]
```
  - Method chips are **built from the data** (distinct `payment_method` values in the period) plus
    the fixed ones above, so no method is ever missing.
  - "Show N results" updates live.
- Under the search row: active filters as `InputChip`s with ✕ (e.g. `Cash ×`, `Dr. Anil ×`).
  Hidden when there are none.
- Replaces today's `payment_method_visit_chips` and `search_box_and_doctor_filter` blocks.

### 4.6 Payments tab — list
**Day header** (sticky within the list): left `TODAY` / `YESTERDAY` / `MON, 24 NOV` (12sp Bold,
letter-spaced, `#64748B`); right `Rs. 18,400 · 23` (12sp SemiBold). Background `#F8FAFC`, height 32dp.
In Day mode there's one header; in Month/Year/Custom one per day.

**Payment row** (`Card`, 12dp corners, border `#E2E8F0`, padding 12dp, min height 72dp, tap → detail sheet):

```
┌───────────────────────────────────────────────┐
│ Patient Name (15sp SemiBold)      Rs. 500 (15sp Bold) │
│ #4821930176 · Dr. Anil (12sp #64748B)  CASH  10:42 AM │
│ [NEW] [PART 1/2]                                │
└───────────────────────────────────────────────┘
```
- Line 1: patient name (1 line, ellipsis) · amount right-aligned. Amount color: green `#047857`;
  `Rs. 0` in `#2563EB` with text `Free`; refunds red with `−`.
- Line 2: `#code · Dr. Name` for OPD, `#code · Test A, Test B` for labs (max 1 line, ellipsis);
  method pill (10sp Bold, 6dp corners, colors below) and time (12sp) right-aligned.
- Line 3 badges (only those that apply, 10sp Bold, 4dp corners, 2×6dp padding):

| Badge | When | Bg / Text |
|---|---|---|
| `NEW` | OPD, `visit_type = new` | `#D1FAE5` / `#065F46` |
| `FOLLOW-UP` | OPD, `visit_type = follow_up` | `#DBEAFE` / `#1E40AF` |
| `FREE` | amount is 0 | `#EFF6FF` / `#2563EB` |
| `PART 1/2` | bill paid in several payments | `#FEF3C7` / `#92400E` |
| `PAY AT DESK +5%` | payment mode PAY_AT_DESK | `#EDE9FE` / `#5B21B6` |
| `REFUND` | negative transaction | `#FFE4E6` / `#9F1239` |

Method pill colors: Cash `#ECFDF5/#047857`, Fonepay `#FEF2F2/#B91C1C`, eSewa `#F0FDF4/#15803D`,
Khalti `#F5F3FF/#6D28D9`, Pay at Desk `#EDE9FE/#5B21B6`, Online `#EFF6FF/#1D4ED8`, Free `#F1F5F9/#475569`.

**Empty state:** icon `ReceiptLong` 48dp `#CBD5E1`, text `No payments for Today` + secondary
`Payments you collect will appear here.` If filters are active: `No payments match your filters` +
`Clear filters` text button.

**Loading:** 6 shimmer rows (existing `Shimmer` component), not a spinner.

### 4.7 Payment detail (bottom sheet, replaces the current dialog)
```
Ram Sharma                              ✕
#4821930176 · NEW · Mon 24 Nov, 10:42 AM
──────────────────────────────────────────
Bill
  OPD Consultation              Rs. 500
  CBC                           Rs. 400
  ─────────────────────────────────────
  Total                         Rs. 900
  Paid                          Rs. 500
  Balance due                   Rs. 400  (amber)
Payments
  24 Nov 10:42 AM  Cash         Rs. 500
Visit
  Doctor  Dr. Anil Thapa        (OPD only)
  Tests   CBC, Lipid Profile    (lab only)
  Follow-up of  #1029384756 ›   (if follow-up; opens that visit)
Remarks
  Patient advised rest…
──────────────────────────────────────────
[ Collect balance ] [ View bill PDF ] [ Call ]
```
- `Collect balance` only when balance > 0 → existing quick-payment flow (`pushQuickPayment`).
- `View bill PDF` → `BillPdfDownloader`. `Call` → dialer with the patient's phone.

### 4.8 Pending tab
- Same list style, **one row per unpaid/partly-paid bill** (not per payment), grouped by visit date.
- Row line 1: name · **balance** in amber `Rs. 400 due`. Line 2: `#code · Dr. Name` / tests · `of Rs. 900`.
- Line 3 badge: `UNPAID` (`#FEF3C7/#92400E`) or `PARTLY PAID` (`#FFEDD5/#9A3412`); `PAY AT DESK` if that mode.
- Swipe or trailing button `Collect` (TextButton, teal) → quick payment.
- Sorted oldest first (money waiting longest on top).

### 4.9 Doctors tab (single_visit / multi_visit)
Header strip (2 small stats): `Visits 42 · New 30 · Follow-ups 12`.
One card per doctor, sorted by collected amount (highest first):
```
┌──────────────────────────────────────────┐
│ Dr. Anil Thapa          Rs. 12,500       │  15sp SemiBold / 15sp Bold green
│ General Physician · Fee Rs. 500          │  12sp #64748B
│ 25 visits   18 new   7 follow-ups        │  12sp, numbers Bold
│ ████████████████░░░░  68% of income      │  LinearProgressIndicator, teal
└──────────────────────────────────────────┘
```
- Tap → filters the Payments tab to that doctor (switches tab, adds the `Dr. Anil ×` chip).
- No expand/collapse daily tables (current `doctorTrackerListItems`). The period selector already does that.

### 4.10 Tests tab (diagnostic_lab) — "Income per Test"
Header strip: `Tests done 58 · Bills 31`.
One card per test, sorted by income:
```
┌──────────────────────────────────────────┐
│ Lipid Profile           Rs. 14,400       │
│ 12 tests · Rs. 1,200 each                │
│ ████████████░░░░░░░░  41% of income      │
└──────────────────────────────────────────┘
```
- Income per test = paid amount of each bill split across its tests in proportion to test prices
  (so discounts are shared fairly and the tab total = Collected).
- Footer row: `Total Rs. 35,100` must equal the Collected card (shown as a check in debug builds).
- Tap → Payments tab filtered to that test.

### 4.11 Expenses tab
- Keep the current expense rows, but in the same row style as 4.6: line 1 title · `− Rs. 1,200` (red);
  line 2 category pill (existing category colors) · method · time; line 3 voucher no. if any.
- Day headers show the day's expense total.
- Long-press or trailing ⋮ → Edit / Delete (existing delete confirm).
- FAB-free: adding uses the top bar `＋` (4.1).

### 4.12 Fees tab
Two sections with the same card style:
1. **Platform fee (5% on Pay-at-Desk)**: `Due Rs. 450` (amber) · `Settled Rs. 1,200` (green) ·
   list of settlements (date · amount · reference).
2. **Subscription**: current plan, next due date, list of payments (date · amount · status pill).

---

## 5. Data / logic changes behind the UI (`PaymentLedgerHelper.kt`)

| Function | Change |
|---|---|
| `buildUnifiedPaymentLogs` | Build **one entry per transaction** (plus a Rs. 0 entry for free visits that have no transaction). Fill `visitType` from `appointments.visit_type`, `testNames` for labs, `paymentPart` (k of n). Drop the `"Doctor"` fallback name. |
| New `buildPendingBills(period)` | Bills for visits in the period with `balance_due > 0`. |
| `computeDoctorDailyAndMonthlyStats` | Simplify to one total per doctor for the selected period (visits, new, follow-ups, collected, share %). |
| New `computeTestStats(period)` | Income per test (see 4.10). Labs only. |
| New `computeSummary(period)` | `collected`, `pendingTotal`, `pendingCount`, `expenses`, `platformFees`, `net`. All cards and tab counts read from this one result, so the numbers always agree. |
| `UnifiedPaymentLogEntry` | Replace `isNewPatientForDoctor` with `visitType: String`; add `testNames: List<String>`, `paymentPart: Pair<Int,Int>?`, `isRefund: Boolean`. |

Until `visit_type` exists in the database (follow-up plan, Phase 1), fall back to the current
guess for old rows only, and show no badge rather than a wrong one when unsure.

---

## 6. Build order
| Step | Work |
|---|---|
| 1 | `computeSummary` + new entry fields in `PaymentLedgerHelper` (with unit tests: totals add up, part-payments split per day, refunds negative). |
| 2 | New layout skeleton: top bar, period selector, summary grid, sticky tabs + search. |
| 3 | Payments tab rows + day headers + detail bottom sheet. |
| 4 | Filters bottom sheet + active chips. |
| 5 | Pending tab with Collect action. |
| 6 | Doctors tab (OPD) and Tests tab (lab). |
| 7 | Expenses and Fees tabs restyled. |
| 8 | Export (CSV / PDF summary). |
| 9 | Testing (below). |

## 7. Testing checklist
1. A bill paid Rs. 500 today and Rs. 400 tomorrow → two rows (`PART 1/2`, `PART 2/2`) on two days;
   Collected for each day matches.
2. Collected card = sum of rows = Doctors/Tests tab total, for Day, Month, Year and Custom.
3. A follow-up with extra items shows `FOLLOW-UP`, not `NEW`.
4. Lab clinic: no doctor text anywhere, Tests tab instead of Doctors, no NEW/FOLLOW-UP badges.
5. Pay-at-Desk unpaid booking appears in Pending, not in Collected, until collected.
6. Every payment method in the data appears in the Filters sheet.
7. Small phone (360dp wide): first payment row visible without scrolling once the summary scrolls away; long names ellipsize; amounts never wrap.
8. Dark mode: all colors above have readable dark equivalents (use `MaterialTheme.colorScheme` tokens for bg/text, keep badge hues).

## 8. Decisions needed
1. Should **Export** (CSV / PDF summary) be included now or later?
2. Should **refunds** be supported (negative payment rows), or is there no refund flow today?
3. Is **Net** shown to all clinic staff, or only to the clinic owner/admin role?
