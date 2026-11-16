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
| Loop hard stop | midnight -> switch to 6-hour check, max 2 days | 4/day |
| Lab: after sample collected | 5 min loop during lab working hours until report `prepared` + 5 min; max 3 days then 6-hour check | ~100-150/day |
| "X patients left" | FCM push from server (clinic's `auto_notify_threshold`) | 0 from phone |

A lab collection visit uses the same 90 s rule as a doctor visit until the sample is
collected; the 5 min report loop takes over from there.

### Clinic app
- Notification alarm loop removed (FCM only).
- Queue board: refresh every 10 s (was 2 s), downloading only rows changed since the
  last fetch; full refresh every 5 minutes. Own actions already show instantly.
- Average consultation time read from the server's running stats instead of
  downloading every completed consultation after each one.
- SyncWorker / SyncEngine: not scheduled or called anywhere today, so left unchanged.

### Server (Supabase)
- Running average per doctor (or per lab) stored as count + average; today and all-time.
  Updated by a trigger when a consultation finishes. Outliers (> 2x average) skipped.
- `get_public_queue_status`: only today's queue counts as "ahead"; overrun-aware estimate
  using the running average; same answer for app, web and alerts.
- Trigger sends one FCM push when a patient reaches the clinic's threshold (never twice).
- `pg_cron` runs the existing no-show sweep every 6 hours.

### Web
- Live queue polling 2 s -> 15 s, paused while the tab is hidden.
- Realtime subscriptions left as they are: row-level security limits what each
  client receives, and only `notifications` is published for realtime.

## Expected load (1,000 users, ~50 appointments/day, ~20 clinics)

| Source | Queries/day | Egress/month |
|---|---|---|
| Patient appointment-day loops | ~8,000 | ~0.3 GB |
| Hourly checks (upcoming appointments) | ~2,400 | <0.1 GB |
| Lab report loops | ~5,000-9,000 | ~0.3 GB |
| App opens | ~3,000-4,000 | ~1 GB |
| Clinic boards (changed rows only, 10 s) | ~60,000 (mostly empty replies) | ~0.5-1 GB |
| **Total** | **~80,000-90,000** | **~2.5-3.5 GB of ~5 GB** |

Other free-tier limits:
- Database (500 MB): grows roughly 5-10 MB/month at this volume -> years.
- File storage (1 GB): lab reports are the limit. At ~20-30 reports/day of 0.5-1 MB,
  storage fills in roughly 1-2 months. Compress uploads and plan for Pro (100 GB).
- Realtime connections (200): only clinic devices keep sockets open -> fine.

Free-tier limits are from Supabase's published plans at the time of writing; verify on
their pricing page.

## Phases (all done on branch `scaling-free-tier-plan`)
1. Database migration `supabase/migration_scaling_queue_estimates_and_alerts.sql`
   (running average, queue status v2, threshold FCM trigger, no-show cron,
   updated_at triggers, clinic stats RPC). Tested on local Postgres 16.
2. Patient app: `service/AppointmentAlarmPlanner.kt` + receiver/worker/MainActivity
   changes. Compiles; scheduling rules covered by `AppointmentAlarmPlannerTest`.
3. Clinic app: loop removed, incremental board refresh, server-side average. Compiles.
4. Web: live queue polling. Type-checks and builds.

Not verified here: behaviour on real devices and against the live Supabase project.

## Manual steps after deploying the migration
- Enable extensions `pg_net` and `pg_cron` (Database -> Extensions).
- Add Vault secrets `dactor_project_url` (e.g. `https://<ref>.supabase.co`) and
  `dactor_service_role_key`. Without them the threshold push is skipped silently.
