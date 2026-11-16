# Scaling plan: 1,000+ users on Supabase free tier

## Why

Today most server load comes from background loops that run on every installed phone,
24/7, whether or not the user has an appointment:

| Loop | Where | Interval | Queries per run |
|---|---|---|---|
| Patient alarm loop | `patient-app/.../service/NotificationAlarmReceiver.kt` | 30 s, survives reboot | 4-6 (incl. latest 50 notifications) |
| Patient in-app fallback | `patient-app/.../MainActivity.kt` | 12 s while open | 6-12 |
| Clinic alarm loop | `clinic-app/.../service/NotificationAlarmReceiver.kt` | 30 s, survives reboot | 1 (latest 50 notifications) |
| Clinic queue board | `clinic-app/.../ui/queue/QueueBoardScreen.kt` | 2 s while open | downloads every queue entry the clinic ever had |
| Clinic SyncWorker | `clinic-app/.../data/sync/SyncEngine.kt` | 15 min | downloads all invoices + all queue entries ever |
| Web live queue | `web-app/src/pages/LiveQueue.tsx` | 2 s while open | 4-5 |

Estimated: 1-14 million queries/day for 1,000 installs; free-tier egress (~5 GB/month)
gone in hours to days.

## Target design

### Patient app
| Situation | Behaviour | Queries |
|---|---|---|
| App opened | 1 query: "my upcoming appointments"; (re)schedule local reminders; upload FCM token only if changed | ~1 + home screen |
| No upcoming appointment | nothing runs | 0 |
| Upcoming appointment | hourly background check (WorkManager), stops when nothing is upcoming | 24/day |
| Appointment day reminder | local alarm on the phone | 0 |
| 1 hour before slot | local alarm on the phone | 0 |
| Slot - 2 h onward | 90 s loop, 1 small query (`get_public_queue_status`) | ~160/visit |
| Loop stop | 5 min after consultation completed, or cancelled | - |
| Loop hard stop | clinic closing time (midnight if unknown) -> switch to 6-hour check, max 2 days | 4/day |
| Lab: after sample collected | 5 min loop during lab working hours until report `prepared` + 5 min; max 3 days then 6-hour check | ~100-150/day |
| "X patients left" | FCM push from server (clinic's `auto_notify_threshold`) | 0 from phone |

### Clinic app
- Notification alarm loop removed (FCM only).
- Queue board: only today's entries; updates locally after own actions; slower safety refresh.
- SyncWorker: only recent data (today / recent window), not the full history.
- Average consultation time no longer recalculated by downloading history (server does it).

### Server (Supabase)
- Running average per doctor (or per lab) stored as count + average; today and all-time.
  Updated by a trigger when a consultation finishes. Outliers (> 2x average) skipped.
- `get_public_queue_status`: only today's queue counts as "ahead"; overrun-aware estimate
  using the running average; same answer for app, web and alerts.
- Trigger sends one FCM push when a patient reaches the clinic's threshold (never twice).
- `pg_cron` runs the existing no-show sweep every 6 hours.

### Web
- Live queue polling 2 s -> 15 s, paused when the tab is hidden; clinic/doctor rows loaded once.
- Realtime subscriptions filtered to the user's own rows.

## Expected load (1,000 users, ~50 appointments/day, ~20 clinics)

| Source | Queries/day | Egress/month |
|---|---|---|
| Patient appointment-day loops | ~8,000 | ~0.3 GB |
| Hourly checks (upcoming appointments) | ~2,400 | <0.1 GB |
| Lab report loops | ~5,000-9,000 | ~0.3 GB |
| App opens | ~3,000-4,000 | ~1 GB |
| Clinic boards (today-only, slower refresh) | ~2,000-10,000 | ~1-1.5 GB |
| **Total** | **~20,000-35,000** | **~3-4 GB of ~5 GB** |

Other free-tier limits:
- Database (500 MB): grows roughly 5-10 MB/month at this volume -> years.
- File storage (1 GB): lab reports are the limit. At ~20-30 reports/day of 0.5-1 MB,
  storage fills in roughly 1-2 months. Compress uploads and plan for Pro (100 GB).
- Realtime connections (200): only clinic devices keep sockets open -> fine.

Free-tier limits are from Supabase's published plans at the time of writing; verify on
their pricing page.

## Phases
1. Database migration (running average, queue status v2, threshold FCM trigger, no-show cron).
2. Patient app (remove loops, scheduler, reminders, lab loop).
3. Clinic app (remove loop, today-only board and sync).
4. Web (polling and subscription filters).

## Manual steps after deploying the migration
- Enable extensions `pg_net` and `pg_cron` (Database -> Extensions).
- Add Vault secrets `dactor_project_url` (e.g. `https://<ref>.supabase.co`) and
  `dactor_service_role_key`. Without them the threshold push is skipped silently.
