# Pay at Desk: Spec

Surfaces: patient Android app, patient website, clinic app/portal. All share the same Supabase backend, so behavior must be identical everywhere.

Statuses: WAITING_FOR_APPROVAL, APPROVED, UNAPPROVED, EXPIRED (plus existing statuses).
payment_mode: ONLINE (existing, unchanged) or PAY_AT_DESK.

Rules:
1. Pay at Desk is a new payment option. It shows: "A 5% service charge will be added to your bill when paying at the desk", with a breakdown (consultation fee, 5% charge, total at desk). The 5% is ONE configurable constant.
2. Booking generates the usual 10-digit appointment ID with status WAITING_FOR_APPROVAL. No online payment is taken.
3. A WAITING_FOR_APPROVAL appointment is NOT in the live queue and does not count toward queue position. It enters the live queue only when the clinic approves.
4. Tracking by appointment ID:
   - WAITING_FOR_APPROVAL: "Waiting for approval from clinic" + Call Clinic button (opens dialer)
   - APPROVED: behaves exactly like existing confirmed appointments
   - UNAPPROVED: shows "Unapproved" + Retry button if attempts < 3
   - EXPIRED: shows "Request expired", no retry
5. Clinic side: a separate "View Requests" button (with pending count badge). It shows full patient and appointment details, attempt number (e.g. "Attempt 2 of 3"), and Approve / Cancel.
6. Retry: max 3 sends per appointment ID (initial = attempt 1). Retry is allowed only when UNAPPROVED and attempts < 3, and it returns the status to WAITING_FOR_APPROVAL. On the 3rd attempt, set expires_at = now + 2 days; if not approved by then, mark EXPIRED. Also expire pending requests whose appointment slot time has passed.
7. Overload rule: approval ALWAYS adds the patient to the exact requested slot even if the slot is full (e.g. max 12, already 12, approval makes it 13). Never reject or move the patient. Normal bookings still respect capacity. Slots at 13/12 must display safely as full (no negative availability, no crash).
8. All transitions are validated on the backend (not only in UI), done atomically, and only the owning clinic can approve/reject.
9. Existing appointments and the online payment flow must remain unchanged.
