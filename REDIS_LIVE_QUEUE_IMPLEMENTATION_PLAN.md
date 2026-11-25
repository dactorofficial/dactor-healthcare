# Redis Cache for the Live Queue — Step-by-Step Implementation Plan

**Status:** plan only. Nothing has been changed yet.

**Your setup:** Supabase stays as it is (cloud now, later self-hosted on your own server).
Redis and a small **Queue Service** run on **your paid server**. When you move Supabase to that
server later, you only change a few addresses in one `.env` file (Part 9).

**Is it difficult?** No. Every step is ordinary: one SQL migration, one small Node.js service
(~300 lines), Docker, and a few app changes. The careful parts are flagged ⚠️.

---

## Part 0: How it works (one picture)

```
 Clinic app / Doctor portal / Patient app / Website
        │  1. GET /queue/...  (fast, from Redis)
        │  2. WebSocket: "queue changed, version 42"
        ▼
 ┌──────────────────────┐      cache miss      ┌──────────────────────────┐
 │ Queue Service (Node) │ ───────────────────► │ Supabase (same RPCs as   │
 │  on your server      │ ◄─────────────────── │ today: get_*_live_queue) │
 └───────┬──────────────┘                      └────────────┬─────────────┘
         │ read/write cache                                 │ trigger on change
     ┌───▼───┐                                              │ pg_notify('queue_changed')
     │ Redis │ ◄─────────── Queue Service LISTENs ──────────┘
     └───────┘
```

- **Reads** (looking at the queue) come from Redis: very fast, and they don't touch the database.
- **Writes** (call inside, done, reorder, book) still go straight to Supabase, **exactly like today**.
- When the database changes, a trigger tells the Queue Service. It clears the cache for that clinic
  and date and pushes "changed" to open screens over WebSocket.
- If Redis or the Queue Service is down, apps fall back to calling Supabase directly (today's behaviour).

---

## Part 1: Fix first ⚠️ (security problem found in your code)

`get_clinic_live_queue` and `get_doctor_live_queue` (`supabase/migration_lightweight_live_queue_rpc.sql`)
are `SECURITY DEFINER`, **granted to `anon`**, and have **no permission check**. They return
**patient_name, patient_mobile, patient_age, patient_gender** for every patient in any clinic's queue.
Anyone with the public anon key (it's inside the APKs and the website) can read every clinic's patient list.

Today the **patient app** (`patient-app/.../QueueRepository.kt:331`) and the **website**
(`web-app/src/services/db.ts:5144`) call `get_doctor_live_queue` from patients' devices to work out
the queue position. So patients' phones already receive other patients' names and numbers.

**Fix (no app update needed):** keep the functions working for everyone, but **hide personal fields**
unless the caller is staff of that clinic. Add this as a migration file
`supabase/migration_live_queue_privacy_and_cache_notify.sql` (Part 3 adds to the same file):

```sql
-- 1a. Who may see full patient details of a clinic's queue
CREATE OR REPLACE FUNCTION public.can_view_clinic_queue(p_clinic_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
      OR public.is_authorized_clinic_staff(p_clinic_id);   -- already covers owner, staff, doctors, admins
$$;
GRANT EXECUTE ON FUNCTION public.can_view_clinic_queue(UUID) TO anon, authenticated, service_role;

-- 1b. Rename the current function and keep it private
ALTER FUNCTION public.get_doctor_live_queue(UUID, UUID, DATE)
  RENAME TO get_doctor_live_queue_internal;
REVOKE ALL ON FUNCTION public.get_doctor_live_queue_internal(UUID, UUID, DATE)
  FROM PUBLIC, anon, authenticated;

-- 1c. Public wrapper with the SAME name and SAME columns: personal fields hidden for non-staff
CREATE OR REPLACE FUNCTION public.get_doctor_live_queue(
    p_doctor_id UUID, p_clinic_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS SETOF public.<<ROW TYPE — see note>>
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_full BOOLEAN := public.can_view_clinic_queue(p_clinic_id);
BEGIN
  RETURN QUERY
  SELECT q.id, q.appointment_id, q.clinic_id, q.doctor_id, q.queue_position, q.status,
         CASE WHEN v_full THEN q.patient_name   ELSE left(q.patient_name, 1) || '***' END,
         CASE WHEN v_full THEN q.patient_age    ELSE NULL END,
         CASE WHEN v_full THEN q.patient_gender ELSE NULL END,
         CASE WHEN v_full THEN q.patient_mobile ELSE NULL END,
         /* …every other column unchanged, in the same order… */
  FROM public.get_doctor_live_queue_internal(p_doctor_id, p_clinic_id, p_date) q;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_doctor_live_queue(UUID, UUID, DATE) TO anon, authenticated, service_role;
-- get_clinic_live_queue already calls get_doctor_live_queue(NULL, …) → it is covered automatically.
```
**Note:** copy the exact `RETURNS TABLE (...)` column list from
`migration_lightweight_live_queue_rpc.sql` (lines ~21–50) into the wrapper (use
`RETURNS TABLE (...)` instead of `SETOF`), and list every column in the `SELECT` in the same order.
Only the 4 personal columns get the `CASE`.

**Check:** `SELECT * FROM get_clinic_live_queue('<clinic>', CURRENT_DATE);` as the anon key → names are masked and phones are empty.
In the clinic app (logged in as staff) → full names. The patient tracker still shows the correct position.

Later (after the Queue Service is live and the apps use `/queue/public`), stop calling
`get_doctor_live_queue` from patient devices completely.

---

## Part 2: Prepare your server (one time, ~1 hour)

Ubuntu 22.04/24.04, at least 2 vCPU / 4 GB RAM for Redis + the Queue Service.

```bash
# 2.1 System + firewall
sudo apt update && sudo apt upgrade -y
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```
```bash
# 2.2 Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # log out and back in
```
```bash
# 2.3 Project folder
mkdir -p ~/dactor-queue && cd ~/dactor-queue
```

**2.4 DNS:** create an `A` record `queue.dactor.com` → your server's IP. (Any subdomain you like.
It's used below.)

**2.5 Get these values from the Supabase dashboard** (Project Settings):

| Value | Where | Used for |
|---|---|---|
| `SUPABASE_URL` | API → Project URL | calling RPCs |
| `SUPABASE_ANON_KEY` | API → anon public key | public queue lookups |
| `SUPABASE_SERVICE_ROLE_KEY` | API → service_role key ⚠️ secret | building staff caches |
| `DATABASE_URL` | Database → Connection string → **Session pooler** (port 5432) | LISTEN for changes |

⚠️ Use the **Session pooler** string, not the Transaction pooler (port 6543). `LISTEN` doesn't
work through the transaction pooler. The direct `db.<ref>.supabase.co` address also works if your
server has IPv6.

---

## Part 3: Database trigger that announces changes (SQL)

Add to the same migration file. Run it in Supabase → SQL Editor.

```sql
-- 3a. Send a small message whenever something that affects a live queue changes
CREATE OR REPLACE FUNCTION public.notify_queue_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic   UUID;
  v_date     DATE;
  v_old_date DATE;
BEGIN
  IF TG_TABLE_NAME = 'queue_entries' THEN
    v_clinic := COALESCE(NEW.clinic_id, OLD.clinic_id);
    SELECT a.appointment_date INTO v_date
      FROM public.appointments a
     WHERE a.id = COALESCE(NEW.appointment_id, OLD.appointment_id);
  ELSIF TG_TABLE_NAME = 'appointments' THEN
    v_clinic := COALESCE(NEW.clinic_id, OLD.clinic_id);
    v_date   := COALESCE(NEW.appointment_date, OLD.appointment_date);
    IF TG_OP = 'UPDATE' AND OLD.appointment_date IS DISTINCT FROM NEW.appointment_date THEN
      v_old_date := OLD.appointment_date;          -- reschedule: clear the old day too
    END IF;
  ELSIF TG_TABLE_NAME = 'clinics' THEN
    v_clinic := NEW.id;
    v_date   := (now() AT TIME ZONE 'Asia/Kathmandu')::date;
  END IF;

  IF v_clinic IS NOT NULL THEN
    PERFORM pg_notify('queue_changed', json_build_object(
      'clinic_id', v_clinic,
      'date',      COALESCE(v_date, (now() AT TIME ZONE 'Asia/Kathmandu')::date),
      'old_date',  v_old_date)::text);
  END IF;
  RETURN NULL;
END; $$;

-- 3b. Attach it
DROP TRIGGER IF EXISTS trg_queue_changed_qe ON public.queue_entries;
CREATE TRIGGER trg_queue_changed_qe
AFTER INSERT OR UPDATE OR DELETE ON public.queue_entries
FOR EACH ROW EXECUTE FUNCTION public.notify_queue_changed();

DROP TRIGGER IF EXISTS trg_queue_changed_appt ON public.appointments;
CREATE TRIGGER trg_queue_changed_appt
AFTER INSERT OR DELETE OR UPDATE OF status, checkin_status, appointment_date, appointment_time,
      doctor_id, slot_id, payment_status, payment_mode, patient_name, patient_age,
      patient_gender, patient_mobile, selected_lab_tests
ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.notify_queue_changed();

DROP TRIGGER IF EXISTS trg_queue_changed_clinic ON public.clinics;
CREATE TRIGGER trg_queue_changed_clinic
AFTER UPDATE OF is_on_break ON public.clinics
FOR EACH ROW EXECUTE FUNCTION public.notify_queue_changed();
```
- Postgres automatically merges identical messages inside one transaction, so a reorder that
  updates 20 rows sends **one** message.
- If the migration complains that a column doesn't exist, remove it from the `UPDATE OF` list.

**Check:** in SQL Editor run `LISTEN queue_changed;` in one tab, change a queue entry in the app,
and you'll see a notification with the clinic id and date.

---

## Part 4: Redis + Queue Service with Docker

### 4.1 Files on the server (`~/dactor-queue`)

**`.env`** (⚠️ never commit this file)
```env
SUPABASE_URL=https://ojfoofojcpabqegxmsab.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
REDIS_PASSWORD=<long random string: openssl rand -hex 32>
CACHE_TTL_SECONDS=60
PORT=8080
```

**`docker-compose.yml`**
```yaml
services:
  redis:
    image: redis:7.4-alpine
    command: >
      redis-server --requirepass ${REDIS_PASSWORD}
      --maxmemory 512mb --maxmemory-policy allkeys-lru
      --save "" --appendonly no
    restart: unless-stopped
    networks: [internal]            # NOT published to the internet

  queue-service:
    build: ./queue-service
    env_file: .env
    environment:
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
    depends_on: [redis]
    restart: unless-stopped
    networks: [internal, web]

  caddy:
    image: caddy:2.8-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    restart: unless-stopped
    networks: [web]

networks:
  internal: { internal: true }
  web: {}
volumes:
  caddy_data: {}
```

**`Caddyfile`** (automatic HTTPS)
```
queue.dactor.com {
    encode gzip
    reverse_proxy queue-service:8080
}
```

### 4.2 The Queue Service (`~/dactor-queue/queue-service/`)

**`package.json`**
```json
{
  "name": "dactor-queue-service",
  "type": "module",
  "scripts": { "start": "node src/index.js" },
  "dependencies": {
    "fastify": "4.28.1",
    "@fastify/websocket": "10.0.1",
    "@fastify/cors": "9.0.1",
    "ioredis": "5.4.1",
    "pg": "8.12.0"
  }
}
```

**`Dockerfile`**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
USER node
CMD ["npm", "start"]
```

**`src/index.js`**: what it must do (write it in this structure):

```js
// ── setup ───────────────────────────────────────────────────────────────
// fastify + cors + websocket; ioredis client `redis` and a second one `sub` for pub/sub;
// pg Client `listener` on DATABASE_URL.

const K = {
  ver:    (c, d)    => `q:ver:${c}:${d}`,          // version number per clinic+day
  clinic: (c, d)    => `q:clinic:${c}:${d}`,       // full clinic queue JSON (staff)
  doctor: (c, doc, d)=> `q:doc:${c}:${doc}:${d}`,  // doctor queue JSON (staff)
  pub:    (code)    => `q:pub:${code}`,            // public status for one tracking code
  pubIdx: (c, d)    => `q:pubidx:${c}:${d}`,       // set of codes cached for this clinic+day
  auth:   (tok, c)  => `auth:${sha256(tok)}:${c}`, // "this token may view this clinic" (5 min)
  lock:   (key)     => `lock:${key}`,              // stops 100 requests rebuilding at once
};

// ── helper: call a Supabase RPC ────────────────────────────────────────
async function rpc(name, params, bearer /* user JWT, anon or service key */) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${bearer}`,
               'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!r.ok) throw Object.assign(new Error(await r.text()), { status: r.status });
  return r.json();
}

// ── helper: get from cache or build once ───────────────────────────────
async function cached(key, buildFn) {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);
  // only one request rebuilds; others wait briefly and re-read
  const gotLock = await redis.set(K.lock(key), '1', 'PX', 5000, 'NX');
  if (!gotLock) { await sleep(150); const again = await redis.get(key); if (again) return JSON.parse(again); }
  const data = await buildFn();
  await redis.set(key, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
  await redis.del(K.lock(key));
  return data;
}

// ── helper: staff permission (uses the DB's own rule, cached 5 min) ────
async function assertStaff(token, clinicId) {
  if (!token) throw httpError(401);
  if (await redis.get(K.auth(token, clinicId))) return;
  const ok = await rpc('can_view_clinic_queue', { p_clinic_id: clinicId }, token); // runs AS the user
  if (ok !== true) throw httpError(403);
  await redis.set(K.auth(token, clinicId), '1', 'EX', 300);
}

// ── helper: answer with version + 304 when unchanged ───────────────────
async function reply(req, res, clinicId, date, data) {
  const version = (await redis.get(K.ver(clinicId, date))) || '0';
  const etag = `"${clinicId}:${date}:${version}"`;
  if (req.headers['if-none-match'] === etag) return res.code(304).send();
  res.header('ETag', etag).header('Cache-Control', 'no-cache');
  return { version: Number(version), items: data };
}

// ── routes ─────────────────────────────────────────────────────────────
// GET /queue/clinic/:clinicId?date=YYYY-MM-DD          (staff; header Authorization: Bearer <user JWT>)
//   → assertStaff → cached(K.clinic, () => rpc('get_clinic_live_queue', {p_clinic_id, p_date}, SERVICE_ROLE_KEY))
// GET /queue/doctor/:clinicId/:doctorId?date=          (staff)
//   → assertStaff → cached(K.doctor, () => rpc('get_doctor_live_queue', {p_doctor_id, p_clinic_id, p_date}, SERVICE_ROLE_KEY))
// GET /queue/public/:code                               (anyone; NO personal data)
//   → rate limit 60/min per IP (INCR rl:<ip> + EXPIRE 60)
//   → cached(K.pub(code), () => rpc('get_public_queue_status', {p_tracking_code: code}, SUPABASE_ANON_KEY))
//   → after building: SADD K.pubIdx(row.clinic_id, row.appointment_date) code ; EXPIRE … 86400
// GET /health → { redis: 'ok', db_listener: 'ok' }

// ── listen for DB changes ──────────────────────────────────────────────
// listener.query('LISTEN queue_changed'); listener.on('notification', msg => onChange(JSON.parse(msg.payload)))
// onChange({clinic_id, date, old_date}) — debounce 300 ms per clinic+date, then for each date in [date, old_date]:
//   INCR K.ver(c,d)
//   DEL  K.clinic(c,d), every K.doctor(c,*,d) (SCAN MATCH q:doc:c:*:d), every K.pub(code) in SMEMBERS K.pubIdx(c,d), and K.pubIdx(c,d)
//   PUBLISH 'queue:events' {clinic_id: c, date: d, version}
// On listener disconnect: reconnect with backoff; after reconnecting, delete ALL q:* keys
// (changes during the gap were missed) — safe, the cache just rebuilds.

// ── WebSocket ──────────────────────────────────────────────────────────
// GET /queue/ws?clinicId=&date=   (staff; first message must be {token}; checked with assertStaff)
// GET /queue/ws?code=             (patient/website)
// sub.subscribe('queue:events'); on message → send {type:'queue_changed', version}
// to sockets watching that clinic+date (and to code-sockets whose code is in pubIdx(c,d)).
// Send a ping every 25 s so mobile networks don't drop idle sockets.
```

⚠️ **Why staff caches are built with the service key but checked per user:** one cached copy is
shared by all staff of a clinic (efficient), and every request still proves, with the user's own
login, that they belong to that clinic (`can_view_clinic_queue` runs **as the user**).

⚠️ **Side effect to know about:** `get_doctor_live_queue` also *writes* (it removes stale entries and
auto-adds newly approved appointments to today's queue). With the cache it runs less often. That's
fine: approving or booking an appointment changes `appointments` → trigger → cache cleared →
the next read runs the function again and enrols the patient. A new day uses new keys, so it runs then too.

### 4.3 Start it
```bash
cd ~/dactor-queue
docker compose up -d --build
docker compose logs -f queue-service      # should print: listening :8080, LISTEN queue_changed ok
curl https://queue.dactor.com/health
curl https://queue.dactor.com/queue/public/<a real 10-digit code>
```

---

## Part 5: App changes

### 5.1 Clinic app (Android)
Files: `data/repository/QueueRepository.kt`, `ui/queue/DoctorQueueViewModel.kt`,
`ui/queue/DoctorQueueScreen.kt`, `ui/queue/QueueBoardScreen.kt`, `di/AppModule.kt`.

1. **Config:** add `QUEUE_SERVICE_URL = "https://queue.dactor.com"` (BuildConfig field), next to the Supabase URL in `AppModule.kt`.
2. **New `QueueCacheApi`** (Ktor client, already a dependency via `ktor-client-okhttp`):
   - `getDoctorQueue(clinicId, doctorId, date, lastEtag)` → `GET /queue/doctor/...` with
     `Authorization: Bearer <supabase session access token>` and `If-None-Match: lastEtag`.
     Returns `Unchanged` on 304, or `Fresh(version, items)`.
   - `getClinicQueue(...)` likewise.
   - Same JSON fields as the RPC, so the existing `DoctorLiveQueueItemDto` / `toQueueItemUi()` mapping is reused.
3. **`QueueRepository.getFastDoctorLiveQueue`**: try `QueueCacheApi` first (timeout 3 s). On any
   error or timeout, fall back to today's `rpc("get_doctor_live_queue")`. **Writes are unchanged.**
4. **WebSocket:** add `io.ktor:ktor-client-websockets` (same Ktor version). While the queue screen
   is visible (use the existing lifecycle observer in `DoctorQueueScreen.kt`), connect to
   `wss://queue.dactor.com/queue/ws?clinicId=…&date=…`, send `{token}`, and on `queue_changed`
   call `loadDoctorQueue(isDeltaOnly = true)`. Reconnect with backoff (1 s, 2 s, 5 s, 10 s max).
5. **Timers:** in `DoctorQueueScreen.kt` keep the **1 s tick for the on-screen timer only** (no
   network). Change `refreshUpcomingPatientsAndCheckNew()` from every 5 s to **every 60 s** while the
   WebSocket is connected, and back to every 5 s if it's disconnected. Same for `QueueBoardScreen.kt` (10 s → 60 s).
6. Keep Supabase Realtime subscriptions (`observeDoctorQueueRealtime`) for now as a second signal.
   Remove them later once the WebSocket has proven stable.

### 5.2 Patient app (Android)
Files: `data/repository/QueueRepository.kt`, `ui/tracker/QueueStatusScreen.kt`.
1. Tracker reads `GET /queue/public/<code>` (no login needed) instead of `get_public_queue_status`
   / `get_doctor_live_queue`. Fall back to the old RPC calls on failure.
2. WebSocket `wss://queue.dactor.com/queue/ws?code=<code>` while the tracker is open. On
   `queue_changed`, re-fetch.
3. The 10 s refresh loop (`QueueStatusScreen.kt` ~line 700) becomes 60 s while the socket is connected.
4. Stop calling `get_doctor_live_queue` from the patient app (privacy, see Part 1).

### 5.3 Website (`web-app`)
1. `.env`: `VITE_QUEUE_SERVICE_URL=https://queue.dactor.com`.
2. `pages/LiveQueue.tsx` and `components/LiveTrackerModal.tsx`: use `fetch(`${QUEUE}/queue/public/${code}`)`
   with `If-None-Match`, plus `new WebSocket(...)`; fall back to `supabase.rpc('get_public_queue_status')`.
3. `services/db.ts` (staff views at ~5144/5162): use `/queue/clinic` / `/queue/doctor` with the
   logged-in session token (`(await supabase.auth.getSession()).data.session.access_token`).

### 5.4 Release order
1. Part 1 SQL (privacy fix). No app update needed.
2. Parts 2–4 (server + Queue Service). Apps don't use it yet; test with `curl`.
3. Release the website first (instant), then the clinic app, then the patient app.
   Old app versions keep working the old way, so there's no forced update.

---

## Part 6: Testing checklist

| # | Test | Expected |
|---|---|---|
| 1 | `curl /queue/public/<code>` twice | 2nd answer much faster; Redis has `q:pub:<code>` (`docker compose exec redis redis-cli -a $REDIS_PASSWORD keys 'q:*'`) |
| 2 | Call a patient inside in the clinic app | Within ~1 s: `q:ver` +1, the patient tracker and other staff screens update without waiting for a poll |
| 3 | Reschedule a patient to tomorrow | Today's and tomorrow's caches are both cleared |
| 4 | `GET /queue/clinic/<other clinic>` with your staff token | **403** |
| 5 | Same without a token | **401** |
| 6 | Public endpoint response | No names, phones or ages |
| 7 | `docker compose stop redis` | Apps still show the queue (fallback to Supabase); start Redis again → back to cache |
| 8 | `docker compose stop queue-service` | Apps fall back to Supabase; no crash |
| 9 | Restart Supabase/DB connection (or pause network) | Service reconnects, clears `q:*`, then works normally |
| 10 | Load test: `npx autocannon -c 200 -d 30 https://queue.dactor.com/queue/public/<code>` | No errors; Supabase dashboard shows almost no extra DB load |
| 11 | New appointment approved for today | Shows in the live queue (enrolment still happens) |
| 12 | Next morning | Fresh queue for the new date, yesterday's keys expire |

---

## Part 7: Running it day to day
- **Logs:** `docker compose logs -f queue-service`
- **Update service:** `git pull && docker compose up -d --build queue-service` (a few seconds of
  fallback to Supabase, no downtime for users).
- **Monitoring:** add `https://queue.dactor.com/health` to Uptime Kuma (or UptimeRobot) with alerts.
- **Redis memory:** `redis-cli info memory`. 512 MB is plenty (each clinic queue is a few KB).
- **Secrets:** the `.env` holds the service_role key. Keep it readable only by you (`chmod 600 .env`),
  and never copy it into an app.

---

## Part 8: Effort
| Part | Work | Time |
|---|---|---|
| 1 | Privacy fix SQL + check | ½ day |
| 2 | Server prep | 1–2 hours |
| 3 | Trigger SQL + check | 1–2 hours |
| 4 | Queue Service + Docker + Caddy | 2–3 days |
| 5 | App changes (clinic, patient, website) | 3–5 days |
| 6 | Testing + load test | 1 day |

---

## Part 9: Later, when you move Supabase onto your own server

Nothing in the Queue Service code changes. Only the `.env`:

| Setting | Change to |
|---|---|
| `SUPABASE_URL` | Your self-hosted address, e.g. `https://api.dactor.com` |
| `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Keys from your self-hosted Supabase (if you reuse the same JWT secret, they stay the same) |
| `DATABASE_URL` | `postgresql://postgres:<pw>@db:5432/postgres` (direct, same Docker network, no pooler needed) |

Steps:
1. Run the self-hosted Supabase docker-compose on the server (see `DATABASE_MIGRATION_AND_REDIS_PLAN.md`, Phases 0–3).
2. Put the Queue Service + Redis into the **same Docker network** as Supabase (add the Supabase network as `external: true` in this compose file).
3. Update `.env`, then `docker compose up -d`.
4. The migration SQL from Parts 1 and 3 is already in the database dump, so nothing needs to be re-run.
5. Run the Part 6 checklist again.

Optional at that point: Caddy can serve both `api.dactor.com` (Supabase) and `queue.dactor.com`,
or put the queue under `api.dactor.com/queue/*`. Then apps need one domain only.

---

## Decisions needed
1. **Subdomain:** OK to use `queue.dactor.com`? (Or tell me the domain you'll use.)
2. **Masking:** for non-staff, show the first letter + `***` (e.g. `R***`), or hide names completely?
3. Should I go ahead and **build Parts 1 and 3 (the SQL)** and the **Queue Service code** in the repo
   (e.g. a new `queue-service/` folder) when you're ready?
