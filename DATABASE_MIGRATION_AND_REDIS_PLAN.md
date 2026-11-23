# Plan: Move from Supabase Cloud to Your Own Server + Redis Cache for Live Queue

**Status:** plan only. Nothing has been changed or moved.

---

## 1. What Dactor uses from Supabase today

Found by searching the repo. These all have to keep working after the move.

| Supabase feature | How Dactor uses it | Size |
|---|---|---|
| **Postgres database** | All data: appointments, queue_entries, clinics, doctors, billing, lab_reports, … | 67 SQL migration files in `supabase/` |
| **Row Level Security (RLS)** | Who can see/change which rows | ~227 policies; they call `auth.jwt()` ~343 times and `auth.uid()` ~49 times |
| **Database functions (RPC)** | `get_doctor_live_queue`, `get_clinic_live_queue`, `get_public_queue_status`, `reschedule_patient_appointment`, `transition_queue_entry_status`, expenses, stats, … | ~110 functions |
| **Auth (login)** | Email + password sign-in/sign-up in the clinic app, patient app, web app and admin panel | `auth.users` table, password hashes, JWT tokens |
| **Storage (files)** | Buckets: `clinic-docs-private`, `clinic_photos`, `doctor-kyc-private`, `doctor-kyc`, `doctor_photos`, `lab-reports-private` | Lab reports, KYC docs, photos |
| **Realtime** | Live updates on `queue_entries`, `appointments`, `notifications`, `clinics`, `doctors`, `lab_reports`, `billing_invoices`, `clinic_services` | Apps + web app |
| **Edge Functions** | `appointment-payment`, `document-access`, `send-fcm-alert` (push notifications) | 3 functions in `supabase/functions/` |
| **Clients** | `clinic-app` and `patient-app` (Android, supabase-kt), `web-app` and `admin-panel` (React, supabase-js) | All hold the Supabase URL + anon key |

**Main finding:** the database logic is built on Supabase's login system (`auth.jwt()` in
hundreds of rules), and every app talks to Supabase's APIs directly. Swapping in plain Postgres would
mean rewriting all the security rules, all ~110 functions' auth checks, and every app's data layer.

---

## 2. Recommended approach

### Option A (recommended): run Supabase yourself on your own server
Supabase is open source and can be self-hosted with Docker (Postgres + Auth + REST API + Realtime +
Storage + Edge Functions). You own the server and the data, but **the apps barely change**: only the
server address (and keys) change. All RLS rules, RPCs, login and file paths keep working.

### Option B (not now): plain Postgres + your own backend
Write your own API (e.g. Node/Kotlin), replace Supabase login, rewrite 227 security rules and all app
data code. Months of work and high risk. Only worth it later, if you outgrow Option A.

**This plan follows Option A**, and adds Redis plus a small **Queue Service** in front for the live queue.

---

## 3. Target setup

```
                Apps / Website / Admin
                         │  HTTPS (api.dactor.com)
                ┌────────▼─────────┐
                │  Caddy / Nginx   │  TLS, gzip, rate limits
                └──┬──────────┬────┘
      /queue/*     │          │   everything else
   ┌───────────────▼──┐   ┌───▼─────────────────────────────┐
   │  Queue Service   │   │  Self-hosted Supabase (Docker)  │
   │  (Node/Fastify)  │   │  Kong · GoTrue (auth) ·          │
   │  reads cache,    │   │  PostgREST · Realtime · Storage │
   │  WebSocket push  │   │  · Edge Functions runtime        │
   └──┬────────────┬──┘   └───────────────┬─────────────────┘
      │            │                      │
 ┌────▼────┐  LISTEN/NOTIFY        ┌──────▼──────┐
 │  Redis  │◄──────────────────────│  Postgres   │
 └─────────┘                       └──────┬──────┘
                                          │ WAL + daily backups
                                   ┌──────▼──────┐
                                   │ Object store│  (S3 / MinIO / Backblaze)
                                   └─────────────┘
```

### Servers (starting size)
| Server | Runs | Starting size |
|---|---|---|
| **App server** | Caddy, Supabase services (except DB), Queue Service, Redis | 4 vCPU, 8 GB RAM, 80 GB SSD |
| **Database server** | Postgres 15 only (same major version as Supabase's) | 4 vCPU, 16 GB RAM, 160 GB NVMe |
| **Object storage** | File buckets + database backups | S3-compatible (Backblaze B2 / Wasabi / DigitalOcean Spaces, or MinIO on its own disk) |

One server for everything works for a start, but a separate database server makes backups,
upgrades and scaling much safer.

**Location:** pick a region close to Nepal (e.g. Mumbai / Singapore) for speed. Since this is
**health data**, check any Nepal data-protection rules on where patient data may be stored before choosing.

---

## 4. Redis for the live queue

### 4.1 The problem today
- The clinic app reloads the live queue every **5 s** (`DoctorQueueScreen` tick → `refreshUpcomingPatientsAndCheckNew`),
  the queue board every **10 s**, and the patient tracker every **10 s** (`QueueStatusScreen`).
  Each reload runs database functions such as `get_doctor_live_queue` / `get_clinic_live_queue` / `get_public_queue_status`.
- Every patient watching their position and every screen open in the clinic hits Postgres again,
  even when nothing changed.

### 4.2 The design
**Queue Service**: a small Node (Fastify) service with 4 jobs:

1. **Serve cached queues** from Redis:

| Endpoint | Who | Redis key | Contents |
|---|---|---|---|
| `GET /queue/public/:trackingCode` | Patient app, website | `q:pub:{code}` | Position, people ahead, estimated time, status. **No patient names/phones.** |
| `GET /queue/clinic/:clinicId?date=` | Clinic staff | `q:clinic:{clinicId}:{date}` | Same JSON as `get_clinic_live_queue` |
| `GET /queue/doctor/:clinicId/:doctorId?date=` | Doctor portal | `q:doc:{clinicId}:{doctorId}:{date}` | Same JSON as `get_doctor_live_queue` |
| (all) | | `q:ver:{clinicId}:{date}` | Version number, +1 on every change |

   - On a cache miss, it calls the **same database function** as today, stores the result
     (time limit 60 s as a safety net), and returns it.
   - Clients send the version they have (`If-None-Match: <version>`). If nothing changed, the answer is
     `304 Not Modified` with no body, which is very cheap.

2. **Clear the cache when the queue changes.** A database trigger on `queue_entries` and `appointments`
   (and `clinics.is_on_break`) runs `pg_notify('queue_changed', '{clinic_id, date}')`. The Queue Service
   `LISTEN`s, bumps `q:ver:…`, deletes the clinic/doctor/public keys for that clinic and date, and rebuilds
   the hot ones straight away.

3. **Push changes over WebSocket.** `wss://api.dactor.com/queue/ws?clinic=…` (staff) or `?code=…`
   (patient). On a change it sends `{type:"queue_changed", version}`. The app then fetches the new
   version. With that in place, polling can drop from every 5–10 s to a **60 s safety check**.

4. **Checking who's allowed.** Staff and doctor endpoints check the user's Supabase JWT (same secret) and
   that the user belongs to the clinic, using the same rule as the database (`is_authorized_clinic_staff`),
   cached in Redis for 5 min (`auth:staff:{userId}:{clinicId}`). The public endpoint returns no personal
   data. It is rate-limited per IP (Redis counter: 60 requests/min).

### 4.3 Other good uses of Redis (after the queue)
| Use | Key | Time limit |
|---|---|---|
| Clinic discovery / search lists (patient app, website) | `disc:{area}:{filters}` | 5 min, cleared when a clinic changes |
| Published slots + free spots per clinic/date | `slots:{clinicId}:{date}` | Cleared on booking/slot change |
| Login and booking rate limits (stop abuse) | `rl:{ip}:{route}` | 1 min |
| Clinic average consultation time | `avg:{clinicId}:{doctorId}` | Cleared when a consultation finishes |

### 4.4 Rules for safety
- Redis only ever holds **copies**. Postgres stays the source of truth; if Redis is down, the Queue
  Service falls back to the database (slower but correct).
- Writes (call inside, mark done, reorder, book) still go to the database functions as today. Only
  reads are cached.
- Redis isn't exposed to the internet (private network/localhost only), has a password, and keeps no backups (it's just a cache).

### 4.5 App changes for the queue
| App | Change |
|---|---|
| Clinic app (`QueueRepository`, `DoctorQueueViewModel`, `QueueBoardScreen`) | Read the live queue from `/queue/clinic` / `/queue/doctor` with version checks. Open the WebSocket while the screen is visible. Change the 5 s/10 s timers to 60 s. Keep the database calls as a fallback. |
| Patient app (`QueueStatusScreen`, `QueueRepository`) | Tracker reads `/queue/public/:code` plus a WebSocket. 60 s fallback poll. |
| Web app | Public tracker uses `/queue/public/:code`. |

---

## 5. Migration steps

### Phase 0: Prepare (no downtime)
1. **Put a custom domain in the apps first.** Release new app versions that use `https://api.dactor.com`
   (and `wss://`), not the `*.supabase.co` address. At first, `api.dactor.com` simply forwards to the
   current Supabase project. Later, switching servers is a DNS change and **old apps aren't broken**.
   - Use the existing `AppUpdateEnforcer` (both apps) to set a minimum version once most users have updated.
   - Web app and admin panel: change the env variable and redeploy.
2. Write down everything set up in the Supabase dashboard that isn't in the repo: auth settings
   (email templates, redirect URLs, password rules), storage bucket settings, edge function secrets
   (FCM key, payment keys), database extensions, cron jobs, network rules.
3. Put all 67 SQL files in order and check they rebuild the current schema on an empty database.
   Compare with `pg_dump --schema-only` from production and record any differences.

### Phase 1: Build the new server (no downtime)
1. Create the servers, firewall (only ports 80/443 public; SSH by key only), automatic security updates.
2. Install Docker. Deploy the **official self-hosted Supabase docker-compose**, with Postgres on the database server.
3. Use the **same JWT secret** as the current project. Then existing anon/service keys and logged-in users'
   tokens stay valid, so nobody has to log in again.
4. Caddy with HTTPS for `api.dactor.com` (staging name first, e.g. `api-new.dactor.com`).
5. Storage backed by S3-compatible object storage. Create the same 6 buckets with the same public/private settings.
6. Edge functions: deploy the 3 functions to the self-hosted edge runtime and set their secrets.
7. Redis 7 + Queue Service (Phase 2 can come after the move; see the order in §7).
8. **Backups:** WAL-G (or pgBackRest) with continuous WAL archiving to object storage. Full backup
   daily, keep 30 days, point-in-time restore. **Do a test restore** to a scratch server.
9. Monitoring: Uptime Kuma (uptime + alerts), Prometheus + Grafana or Netdata (CPU, RAM, disk, DB
   connections, Redis memory), Postgres slow-query log. Alert on: disk > 80%, failed backup, site down.

### Phase 2: Rehearsal (no downtime)
1. `pg_dump` production (schemas `public`, `auth`, `storage`, plus any custom ones) → restore on the new server.
2. Copy all storage files with `rclone` (Supabase storage S3 endpoint → new storage). Compare file counts and sizes.
3. Point staging builds of both apps, web and admin at `api-new.dactor.com` and run the full checklist (§6).
4. Time the dump + restore. That's the expected downtime for the real move.
5. Fix anything found, then repeat until the checklist passes clean.

### Phase 3: The real move (short maintenance window)
1. Announce maintenance (in-app banner + notification). Pick the quietest time (e.g. 1–3 AM Nepal time).
2. Lower the DNS TTL for `api.dactor.com` to 60 s, one day before.
3. Turn on maintenance mode: Caddy returns a friendly "Back in a few minutes" (HTTP 503) for writes.
4. Final `pg_dump` → restore. Final `rclone sync` of new files.
5. Check row counts per table (old vs new) and the newest appointment IDs match.
6. Switch DNS `api.dactor.com` → new server. Turn off maintenance mode.
7. Watch errors, slow queries and the live queue closely for 2 hours.
8. Keep the Supabase project **paused but not deleted** for 30 days as a fallback.

**Expected downtime:** about the time measured in the rehearsal (for a database of a few GB, usually
under 30 min). If zero downtime is required, use Postgres **logical replication** from Supabase
to the new server, then switch over (more setup, same checklist).

**Rollback:** if a serious problem appears within the first hours, switch DNS back to Supabase.
Any data written on the new server in that time must be copied back (keep a list of
appointment/invoice IDs created after the switch).

### Phase 4: After the move
1. Turn on the Queue Service in the apps (version checks + WebSocket), and lower the polling.
2. Weekly: check backups restored fine (automated test restore), review disk and slow queries.
3. Monthly: OS and Docker image updates, Supabase self-hosted version updates (test on staging first).
4. After 30 days stable: delete the Supabase project and rotate any secrets that were stored there.

---

## 6. Test checklist (rehearsal and after the move)
1. Login: clinic staff, doctor, patient, admin, all with their **existing passwords**; sign-up; password reset email.
2. Clinic app: live queue (call inside, timer, done, reorder), walk-in, follow-up, reschedule, billing + PDF, payment logs, expenses, slot publishing.
3. Patient app: discovery, booking (online + pay at desk), tracker updates live, notifications arrive (FCM function), lab report download (private bucket signed URL).
4. Doctor portal: live queue per clinic, clinic switch.
5. Admin panel: approvals, KYC documents open.
6. Realtime: change in clinic app shows on patient tracker within ~2 s (WebSocket) / ~60 s (fallback).
7. Security: RLS still blocks cross-clinic reads (run `supabase/test_security_policies.sql` and the e2e suites in `tests/`).
8. Load: 500 simulated patients polling `/queue/public` + 50 staff screens → Postgres CPU stays low and the Redis hit rate is above 95%.
9. Redis turned off on purpose → queue still loads from the database.
10. Restore last night's backup to a scratch server successfully.

---

## 7. Order and rough effort
| Step | Work | Effort |
|---|---|---|
| 1 | Phase 0: custom domain in all apps + release + wait for updates | 1–2 weeks (mostly waiting for users to update) |
| 2 | Phase 1: build servers, self-hosted Supabase, backups, monitoring | 3–5 days |
| 3 | Phase 2: rehearsal(s) + fixes | 2–4 days |
| 4 | Phase 3: the move | 1 night |
| 5 | Queue Service + Redis + DB triggers | 4–6 days |
| 6 | App changes for cached queue + WebSocket (clinic, patient, web) | 4–6 days |
| 7 | Load test + tuning | 1–2 days |

Doing the move first and Redis second keeps each step small and easy to undo. If the live queue
load is the urgent problem, Redis can also go in **before** the move: run the Queue Service on
a small server pointed at the current Supabase database.

## 8. Costs to expect (rough, monthly)
- App server ~$24–48, DB server ~$48–96, object storage ~$5–15, backups storage ~$5. Compare with
  the current Supabase plan. The main extra cost is **your time to look after the servers**
  (updates, backups, monitoring), or a DevOps person.

## 9. Decisions needed
1. **Hosting provider and region** (e.g. DigitalOcean / Hetzner / AWS / a Nepal data centre)? Any legal requirement to keep patient data in Nepal?
2. **Downtime:** is a ~30 min night maintenance window OK, or must it be zero downtime (logical replication)?
3. **Order:** move first then Redis (recommended), or Redis first on the current Supabase?
4. **Who maintains the server** after the move (you, a team member, or a hired DevOps service)?
5. Rough **database size** today (Supabase dashboard → Database → size), plus the total size of storage files. This sets the server sizes and downtime.
