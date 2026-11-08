# DACTOR — Final Work Plan

## Complete Implementation Blueprint for Nepal's Clinic Management & Live Queue Platform

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [The Three Applications](#2-the-three-applications)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Database Schema Design](#5-database-schema-design)
6. [Feature Specifications — Patient Android App](#6-feature-specifications--patient-android-app)
7. [Feature Specifications — Clinic & Doctor Android App](#7-feature-specifications--clinic--doctor-android-app)
8. [Feature Specifications — Admin Web Portal](#8-feature-specifications--admin-web-portal)
9. [Security & Authentication Architecture](#9-security--authentication-architecture)
10. [Phased Execution Roadmap](#10-phased-execution-roadmap)
11. [Approval Protocol](#11-approval-protocol)

---

## 1. Project Overview

**Dactor** is a clinic management platform designed for Nepal that enables:

- Patients to discover doctors, clinics, and services, book offline (in-person) appointments online, and track their live queue position in real-time
- Clinics to manage their daily operations — services catalog, scheduling, queue control, billing, lab reports, and staff coordination
- A super admin to verify clinics and doctors, categorize clinic types, broadcast notifications platform-wide, and maintain platform integrity

The system is built around a **10-digit tracking code** that serves as the universal appointment identifier — usable by anyone, anywhere, with or without an account.

---

## 2. The Three Applications

| Application | Platform | Technology | Folder | Purpose |
|---|---|---|---|---|
| **Patient App** | **Android** | Kotlin + Jetpack Compose | `patient-app/` | Browse clinics/doctors/services, book appointments, track queue status, download lab reports |
| **Clinic & Doctor App** | **Android** | Kotlin + Jetpack Compose | `clinic-app/` | Manage services, slots, queues, billing, staff, lab results, walk-ins |
| **Admin Panel** | **Web** | React + Vite + TypeScript | `admin-panel/` | Verify clinics/doctors, categorize clinic types, broadcast notifications, edit any clinic data |

---

## 3. Technology Stack

### Android Apps (Patient App + Clinic & Doctor App)

| Layer | Technology |
|---|---|
| **Language** | Kotlin |
| **UI Framework** | Jetpack Compose (Material 3) |
| **Architecture** | MVVM + Clean Architecture |
| **Navigation** | Jetpack Navigation Compose |
| **Dependency Injection** | Hilt (Dagger) |
| **Database / Backend** | Supabase Kotlin SDK (`io.github.jan-tennert.supabase`) |
| **Authentication** | Supabase Auth (Email + Password with email verification link) |
| **Push Notifications** | Firebase Cloud Messaging (FCM) for Android |
| **Image Loading** | Coil (Compose) |
| **Maps / Location Picker** | Google Maps SDK for Android / OpenStreetMap |
| **PDF Viewer** | Android PDF Viewer library |
| **File Downloads** | Android DownloadManager |
| **Min SDK** | API 24 (Android 7.0) |
| **Target SDK** | API 35 (Android 15) |

### Admin Web Portal

| Layer | Technology |
|---|---|
| **Framework** | React + Vite + TypeScript |
| **Styling** | Tailwind CSS |
| **State Management** | React hooks + context |
| **Database Client** | Supabase JS SDK (`@supabase/supabase-js`) |
| **Authentication** | Supabase Auth (Email + Password) |

### Backend & Data (Shared Across All 3 Apps)

| Service | Role |
|---|---|
| **Supabase Auth** | Email + Password authentication with email verification link. Used by ALL three apps for login and registration. |
| **Supabase PostgreSQL** | ALL data — user profiles, clinic info, services, doctor records, KYC metadata, appointments, 10-digit codes, queue states, billing, catalogs, lab report records, slot locks, notifications. |
| **Supabase Storage** | ALL files — doctor NMC licenses, medical certificates, lab reports (PDFs, images/JPEGs), clinic assets. |
| **Supabase Realtime** | Live queue updates pushed to Android clients via WebSocket subscriptions. |
| **Firebase Cloud Messaging (FCM)** | Push notifications ONLY — patient queue alerts, lab report ready, doctor arrived, admin broadcast messages to all users/doctors/clinics. |

### What Goes Where — Final Split

```
SUPABASE (Everything):
  ├── Authentication (Email + Password + Verification Link)
  ├── PostgreSQL Database (ALL data without exception)
  ├── Storage (ALL files — PDFs, images, JPEGs, licenses)
  └── Realtime (Live queue WebSocket subscriptions)

FIREBASE (Push Notifications ONLY):
  └── Cloud Messaging (FCM) — sending alerts to Android devices
```

---

## 4. Project Structure

```
dactorsecond/
│
├── patient-app/                            # FOLDER 1: Android — Patient App
│   ├── app/
│   │   └── src/main/
│   │       ├── java/com/dactor/patient/
│   │       │   ├── di/                     # Hilt dependency injection modules
│   │       │   ├── data/
│   │       │   │   ├── model/              # Data classes (Clinic, Doctor, Service, Appointment, etc.)
│   │       │   │   ├── repository/         # Supabase data access repositories
│   │       │   │   └── remote/             # Supabase client & FCM service
│   │       │   ├── domain/
│   │       │   │   ├── usecase/            # Business logic use cases
│   │       │   │   └── util/               # 10-digit code generator, PII maskers, NPR formatter
│   │       │   └── ui/
│   │       │       ├── landing/            # Landing / description screen
│   │       │       ├── auth/               # Login / Register (Supabase Auth)
│   │       │       ├── discovery/          # Search by service / clinic / doctor + map
│   │       │       ├── booking/            # Appointment booking flow + 5-min lock + payment
│   │       │       ├── tracker/            # 10-digit code queue status lookup
│   │       │       ├── profile/            # User profile & saved appointments / 10-digit codes
│   │       │       ├── labreport/          # Lab report viewer (name verification gate)
│   │       │       ├── notifications/      # In-app notification center
│   │       │       └── components/         # Shared composables (masked text, status badges, etc.)
│   │       ├── res/
│   │       └── AndroidManifest.xml
│   ├── build.gradle.kts
│   └── google-services.json               # Firebase config (FCM only)
│
├── clinic-app/                             # FOLDER 2: Android — Clinic & Doctor App
│   ├── app/
│   │   └── src/main/
│   │       ├── java/com/dactor/clinic/
│   │       │   ├── di/
│   │       │   ├── data/
│   │       │   │   ├── model/              # Shared data models
│   │       │   │   ├── repository/         # Supabase repositories
│   │       │   │   └── remote/             # Supabase client & FCM service
│   │       │   ├── domain/
│   │       │   │   └── usecase/
│   │       │   └── ui/
│   │       │       ├── auth/               # Clinic login/register + Doctor login/register/KYC
│   │       │       ├── dashboard/          # Clinic home dashboard
│   │       │       ├── services/           # Services & pricing catalog management
│   │       │       ├── slots/              # Slot scheduling & publishing
│   │       │       ├── queue/              # Live queue board (drag/reorder, status updates)
│   │       │       ├── billing/            # Invoice generation from catalog
│   │       │       ├── patients/           # Patient directory (past & upcoming)
│   │       │       ├── appointments/       # Future appointments calendar + rescheduling
│   │       │       ├── walkin/             # Walk-in appointment creation
│   │       │       ├── lab/                # Diagnostic lab workflow (sample → processing → upload)
│   │       │       ├── invitations/        # Doctor & staff invitation management
│   │       │       ├── settings/           # Clinic info editor, type editor, auto-notify threshold
│   │       │       └── components/         # Shared composables
│   │       ├── res/
│   │       └── AndroidManifest.xml
│   ├── build.gradle.kts
│   └── google-services.json
│
├── admin-panel/                            # FOLDER 3: Web — Admin Console (React + Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ClinicVerification.tsx
│   │   │   ├── DoctorKYC.tsx
│   │   │   ├── ClinicEditor.tsx
│   │   │   └── BroadcastNotification.tsx
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── supabase.ts
│   │   │   └── types.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── supabase/
│   ├── schema.sql                          # Complete PostgreSQL schema
│   └── seed.sql                            # Nepal test data
│
├── WORK_PLAN.md
└── user_prompts.txt
```

---

## 5. Database Schema Design

### Core Tables (Supabase PostgreSQL — shared by all 3 apps)

| Table | Purpose |
|---|---|
| `profiles` | User accounts (linked to Supabase Auth UID). Stores email, role, phone. No name required at signup. |
| `clinics` | Clinic registration data: name, contact, location coordinates (lat/lng), type (editable by clinic), verification status, auto-notify threshold |
| `clinic_services` | **Every service the clinic offers with its price.** A clinic can offer multiple services. Patients can search by service. |
| `doctors` | Doctor profiles: name, email, specialty, NMC license number, KYC document URLs, approval status, in-clinic presence flag |
| `clinic_invitations` | Pending/accepted/rejected invitations for doctors and lab technicians to join a clinic |
| `slots` | Timed appointment slots: clinic, doctor, date, start/end time, max capacity, current booked count |
| `slot_locks` | 5-minute temporary reservation holds during payment (prevents double-booking race conditions) |
| `appointments` | Every appointment: unique 10-digit tracking code, patient info (name/age/gender/mobile), payment status, check-in status, linked user (nullable for guests) |
| `queue_entries` | Live queue state: position number, status (waiting/inside/done/no_show/processing/report_prepared), timestamps |
| `clinic_catalog` | Clinic's pre-defined billing line items for quick invoicing (linked to clinic_services) |
| `billing_invoices` | Per-appointment billing: line items (JSONB), totals, paid/unpaid, payment date, clinical remarks |
| `lab_reports` | Diagnostic test records: stage (sample_collected/processing/prepared), uploaded file URL, patient name for verification gate |
| `notifications` | In-app notification log: title, message, read/unread status, target audience (all_users/all_doctors/all_clinics/specific_user) |
| `fcm_tokens` | FCM device tokens mapped to user profiles for push notification delivery |

### Key Database Functions

| Function | Purpose |
|---|---|
| `acquire_slot_lock()` | Atomically locks a slot for 5 minutes during payment; checks capacity including active locks |
| `release_slot_lock()` | Immediately frees a lock on payment cancellation |
| `sync_user_appointments()` | When a new user registers, retroactively links all past appointments matching their email or phone |

---

## 6. Feature Specifications — Patient Android App

### 6.1 Landing Screen

- App opens to a welcoming screen with Dactor's description, mission, and value proposition for Nepal
- Option to login as a patient
- Quick-access field to check queue status using a 10-digit code (no login needed)

### 6.2 Authentication (Supabase Auth)

- **Login**: Email + Password
- **Register**: Email + Password only. A verification link is sent to the email via Supabase Auth. **No name, age, or personal data is collected during registration** — the account is purely for login purposes.
- Registration and login are triggered contextually (see 6.3 below)

### 6.3 Booking Interceptor (State Preservation)

- Users can browse clinics, view doctor profiles, search services, and select appointment slots **without logging in**
- When they tap **"Book"** on an available doctor/slot:
  - If not logged in → login/register screen activates
  - The app **remembers the exact position** (selected clinic, doctor, slot, date, any form inputs) using Android SavedStateHandle / ViewModel persistence
  - After login/registration completes → user is returned to the exact same booking step with all selections intact

### 6.4 Search & Discovery (Three Search Dimensions)

Users can search by any of the following:
- **By Service**: e.g., "ECG", "Blood Test", "Dental Cleaning" → shows clinics offering that service with prices
- **By Clinic**: e.g., "Kathmandu Health Hub" → shows clinic profile, services, doctors, and available slots
- **By Doctor**: e.g., "Dr. Aarav Sharma" or "Cardiologist" → shows doctor profile, associated clinics, and available slots
- Each clinic displays its **exact pinned location on a map** (Google Maps SDK) with directions

### 6.5 Appointment Booking

- Patient inputs collected **per appointment** (not on the profile):
  - Full Name
  - Age
  - Gender
  - Mobile Number (+977 Nepal format)
- **Payment is compulsory for ALL clinic types** (see 6.7 for multi-visit exception for returning patients)
- This design allows one account to book for different people (self, family, friends)

### 6.6 The 10-Digit Tracking Code

- Generated immediately upon successful appointment confirmation (after payment)
- Automatically saved to the logged-in user's profile/history
- **Public lookup**: Anyone can enter the code on the landing screen to check status without any account
- **Cross-account saving**: If a user checks a code while logged into a different account, the app offers: *"Save this appointment to your profile?"*

### 6.7 Clinic-Type Specific Booking Rules

| Clinic Type | New Patient | Returning Patient (Has 10-Digit Code) |
|---|---|---|
| **Single-Visit** | Payment required → book → get 10-digit code. Can reschedule date/slot before check-in. | N/A (one-time visit) |
| **Multi-Visit** | Payment required → book → get 10-digit code. Can reschedule date/slot before check-in. | **No payment required.** If user has saved 10-digit codes, app auto-suggests matching codes to select. User can also input code manually. Books directly. Can reschedule before check-in. |
| **Diagnostic Lab** | Payment required → book → get 10-digit code. | Per clinic policy. |

**Multi-Visit Returning Patient Flow (Detail):**
1. User selects a multi-visit clinic and taps "Book"
2. App detects saved 10-digit codes linked to this clinic in user's profile
3. **Option A**: Auto-displayed list of saved codes with patient name previews → tap to select → book follow-up directly (no payment)
4. **Option B**: Manual input field to type any 10-digit code → validates → book follow-up directly (no payment)
5. **Option C**: "New Patient" button → standard payment booking flow

### 6.8 5-Minute Slot Reservation Lock

- When patient proceeds to payment, the slot is **atomically locked** for 5 minutes via Supabase RPC
- A live countdown timer is displayed on screen
- Outcomes:
  - **Payment succeeds** → slot permanently booked, 10-digit code generated
  - **User cancels** → lock released immediately, slot returns to pool
  - **5 minutes elapse** → lock auto-expires, slot freed

### 6.9 Live Queue Status Display

When checking status (via 10-digit code or from profile), the display shows:

- **Clinic name**
- **Queue position**: Token number, how many patients are ahead
- **Doctor presence indicator**: Whether the doctor is physically in the clinic or not (set by clinic side)
- **Privacy masking on all patient data**:
  - Name: `R*****h S****a`
  - Phone: `9841****23`
  - Email: `r***@***.com`
- **Real-time updates** via Supabase Realtime subscriptions (queue position updates live without refreshing)

### 6.10 Diagnostic Lab Report Access

- If the appointment is at a diagnostic/test clinic:
  - Status shows: `Sample Collected` → `Processing` → `Report Prepared`
  - When report is prepared and uploaded by clinic:
    - Status screen shows **"Report Prepared"**
    - To **view or download** the file (PDF or image), the user must **verify the patient's name** (type it in, must match)
    - Can view in-app (PDF viewer / image viewer) or download directly to device

### 6.11 Push Notifications (Firebase FCM — Android)

- Native Android push notifications fire when:
  - Patient's turn is approaching (based on clinic's auto-notify threshold)
  - Lab report is ready/prepared
  - Appointment is rescheduled
  - Doctor arrives at clinic
  - **Admin broadcasts a message to all users**
- Also displayed in an in-app notification center screen

### 6.12 Clinic Location & Map

- When viewing a clinic or booking an appointment, the clinic's **exact pinned location** is shown on a map (Google Maps SDK)
- Tap for directions / navigation intent

---

## 7. Feature Specifications — Clinic & Doctor Android App

### 7.1 Clinic Registration & Onboarding

- **Registration inputs**: Clinic name, contact phone, contact email, and **location**
- **Location picker**: Interactive Google Maps view where the clinic admin can tap and pin their exact coordinates
- Upon registration, clinic status = `Pending Verification` (must be approved by super admin)

### 7.2 Clinic Type Self-Management

- **Clinic can edit their own type** at any time from settings:
  - `single_visit` — One-time consultation
  - `multi_visit` — Ongoing treatment / follow-ups
  - `diagnostic_lab` — Pathology and diagnostic lab
- Changing type adjusts which features and booking rules apply

### 7.3 Services & Pricing Catalog

- **Clinic can add every service they offer and its price**
- A clinic can offer **multiple services** (e.g., "General Consultation - Rs. 500", "ECG - Rs. 750", "Blood Test - Rs. 650", "Dental Cleaning - Rs. 1200")
- Services are searchable by patients in the Patient App
- Services link to billing — 1-tap add to patient invoice
- Clinic can add, edit, or remove services at any time

### 7.4 Doctor Registration & Strict KYC

- Doctor registers with Email + Password (Supabase Auth)
- Must provide all basic profile data: full name, email, specialty, consultation fee
- **KYC step**: Doctor uploads from device:
  - Medical certificates (image/PDF)
  - **NMC (Nepal Medical Council) license** (primary verification document — image/PDF)
  - Files uploaded to Supabase Storage
- Doctor profile remains **locked and unlisted** until the super admin manually reviews and approves the license via Admin Web Portal
- Only after admin authorization can the doctor be listed, invited by clinics, or appear in search

### 7.5 Doctor & Staff Invitations

- Clinic can invite existing doctor/lab technician accounts by email
- Invited person receives in-app notification; can accept or reject
- Upon acceptance, they are connected to the clinic's roster
- A clinic can have multiple doctors

### 7.6 Doctor Physical Presence Toggle

- Clinic admin (or doctor themselves) can toggle: **"Doctor is in Clinic"** vs **"Doctor has not arrived / Away"**
- This status is pushed live to patient apps via Supabase Realtime

### 7.7 Timed Slot Management

- Clinic selects a doctor → picks a date → sets time window (e.g., 9:00 AM - 9:15 AM) → sets max patient capacity
- **Publishes** the slot → immediately visible and bookable on the Patient App
- Can create any time windows they want (flexible, not fixed intervals)

### 7.8 Real-Time Queue Board

- Displays all patients in the queue with:
  - Token/rank position
  - Patient name
  - Current status
- **Tap on a patient** → expands to show full info: name, age, gender, mobile, email, appointment details
- **Drag / Slide up and down**: Clinic staff can reorder patients to change queue ranking dynamically (long-press drag in Compose LazyColumn)
- **Status progression** (updated manually by clinic):
  - `Waiting` → `Inside (In Consultation)` → `Done (Completed)` or `No Show`
  - When the next patient goes inside, tapping them updates to `Inside`

### 7.9 Notification Controls

- **Manual push notification**: Button to send an immediate FCM alert to a specific patient
- **Auto-notify threshold**: Clinic defines a number (e.g., 2). When a patient is that many positions away from being called, the system automatically sends them a push notification to come to the clinic

### 7.10 Patient Directory & Clinical Remarks

- View all patients:
  - Those who have already been seen (completed)
  - Those still waiting or upcoming
- Tap any patient → see their billing info and history
- **Remarks**: Clinic/doctor can write clinical notes, prescriptions, or advice attached to the appointment

### 7.11 Fast Billing System

- **Linked to Services Catalog**: Pre-defined list of services with prices
  - Tap a service → it's instantly added to the patient's bill
  - Clinic can also input custom manual line items
- **Bill details tracked**: Item name, cost, quantity, total amount, amount paid, balance due, payment date
- Clinic can edit their catalog at any time

### 7.12 Future Appointments & Rescheduling

- Calendar view to inspect any future date
- See which patients are scheduled for that date
- Can alter everything: change queue order, modify appointment details, shift appointments to a different date/slot

### 7.13 Walk-In / Reception Desk Booking

- Clinic can create appointments on the spot (default = today, can also set future dates)
- Inputs: Name, Age, Gender, Mobile Number, Email (optional)
- **Can overbook**: Clinic can make appointments even if the slot is full
- **Retroactive account linking**:
  - If a user already has an account with the provided email/phone → appointment auto-links to their profile
  - If no account exists yet → data is stored and **automatically connected** when they create an account in the future with that email/phone

### 7.14 Diagnostic Lab Workflow (for Test Clinics)

- **Stage progression** (updated by clinic staff):
  1. `Sample Collected` — sample taken from patient
  2. `Processing` — lab work in progress (patient sees "Processing" when checking status)
  3. `Prepared` — results ready
- **Report upload**: Clinic uploads PDF or image file from device to Supabase Storage
- **Notification**: If the appointment is linked to a user account, they receive a FCM push notification that the report is ready
- Patient must verify their name to view/download the report

### 7.15 Clinic Information Editor

- Option to edit clinic details (specific fields to be defined later per user's direction)
- Option to edit clinic type (single_visit / multi_visit / diagnostic_lab)

---

## 8. Feature Specifications — Admin Web Portal

### 8.1 Admin Authentication

- Admin logs in with **Admin ID and Password** (secure credentials via Supabase Auth)

### 8.2 Clinic Verification & Categorization

- Review all incoming clinic registration applications
- **Approve** or **Reject** clinic registrations
- **Categorize** each clinic into its operational type:
  - `single_visit` — One-time consultation clinics (patient comes once)
  - `multi_visit` — Ongoing treatment clinics (patient comes multiple times)
  - `diagnostic_lab` — Pathology and diagnostic test laboratories
- The assigned category determines what features and booking rules are activated for that clinic
- Note: Clinics can also self-edit their type later from their own app

### 8.3 Doctor KYC & NMC License Verification

- Review submitted doctor profiles
- Inspect uploaded **NMC license** documents and medical certificates (view PDFs/images from Supabase Storage)
- **Manually approve or reject** each doctor
- Only approved doctors can be listed publicly and invited by clinics

### 8.4 Master Editor

- Admin has **complete edit authority** over every piece of information about any clinic in the system
- Can modify clinic details, contact info, services, operational parameters, and associated records

### 8.5 Broadcast Push Notifications

- Admin can send push notifications to:
  - **All users (patients)**
  - **All doctors**
  - **All clinics**
  - **Any combination of the above**
- Used for platform announcements, maintenance alerts, policy updates, or any broadcast communication
- Delivered via Firebase Cloud Messaging (FCM)

### 8.6 Platform Analytics Dashboard

- Overview metrics: total clinics, verified doctors, active daily queues, pending verifications

---

## 9. Security & Authentication Architecture

### Authentication Flow (ALL via Supabase Auth)

```
Patient Android App:
  Register → Email + Password → Verification link sent via Supabase Auth → Account created
  Login → Email + Password via Supabase Auth
  No personal data collected at signup (lean registration)

Clinic & Doctor Android App:
  Clinic Register → Clinic basic info (name, contact, location) → Pending admin verification
  Clinic Login → Email + Password via Supabase Auth
  Doctor Register → Email + Password + Full profile data → KYC upload (NMC license + certificates to Supabase Storage)
  Doctor profile locked until admin manually verifies NMC license
  Doctor Login → Email + Password via Supabase Auth

Admin Web Portal:
  Login → Admin ID + Password via Supabase Auth
```

### Data Residency — Final Split

```
SUPABASE (Everything):
  ├── Authentication (Email + Password + Email Verification Link)
  ├── PostgreSQL Database (ALL data — profiles, clinics, services, doctors, KYC,
  │   appointments, 10-digit codes, queues, billing, catalogs, lab reports,
  │   slot locks, notifications, FCM tokens)
  ├── Storage (ALL files — NMC licenses, certificates, lab reports PDF/image/JPEG, clinic assets)
  └── Realtime (Live queue WebSocket subscriptions)

FIREBASE (Push Notifications ONLY):
  └── Cloud Messaging (FCM) — sending alerts to Android devices
      (patient queue alerts, lab report ready, doctor arrived, admin broadcasts)
```

### Slot Booking Concurrency

- 5-minute atomic lock prevents double-booking during payment
- Lock is database-level (PostgreSQL row lock + expiry timestamp via Supabase RPC)
- Expired locks are cleaned up automatically

### Privacy

- All patient PII is masked on public-facing queue displays
- Lab reports require name verification before access
- Cross-account appointment saving is opt-in only

---

## 10. Phased Execution Roadmap

### Phase 1: Foundation & Infrastructure — ✅ COMPLETED & VERIFIED
### Phase 2: Super Admin Web Portal — ✅ COMPLETED & VERIFIED
### Phase 3: Clinic & Doctor Android App — Registration, Services & Scheduling — ✅ COMPLETED & VERIFIED
### Phase 4: Clinic & Doctor Android App — Queue, Billing & Lab Workflows — ✅ COMPLETED & VERIFIED
### Phase 5: Patient Android App — Discovery, Booking & Slot Lock — ✅ COMPLETED & VERIFIED
### Phase 6: Patient Android App — Queue Tracker, Privacy & Lab Reports — ✅ COMPLETED & VERIFIED
### Phase 7: End-to-End Integration & Final Delivery — ✅ COMPLETED & VERIFIED

**System Verification Summary:**
- **admin-panel**: Production build verified with Vite + TypeScript compiler (`✓ built in 21.40s`, 0 errors). Live preview server active on port `3002`.
- **clinic-app**: Full Native Android app (Kotlin + Jetpack Compose + Hilt) with registration, map pinning, services catalog, doctor KYC, slot scheduling, receptionist walk-in desk with overbooking, reorderable live queue board, fast billing, and diagnostic lab workflow.
- **patient-app**: Full Native Android app (Kotlin + Jetpack Compose + Hilt) with triple search (service/clinic/doctor), 5-minute atomic slot reservation lock with live countdown timer, compulsory payment for new patients, zero-payment returning patient bypass with 10-digit codes, public live queue tracker, doctor presence indicator, PII privacy masking, 3-stage lab report viewer with confidential Name Verification Gate, and FCM push notifications center.
- **supabase**: Complete PostgreSQL schema (`schema.sql` - 14 tables, custom enums, RLS policies, atomic slot reservation functions `acquire_slot_lock`/`release_slot_lock`, retroactive account linking) and realistic seed data (`seed.sql`).
- **Comprehensive Documentation**: Complete architecture, setup guide, and verification matrix provided in `README.md`.

---

## 11. Approval Protocol

The following rules govern this entire project:

1. **No execution without explicit user approval.** I will not write code, run commands, or modify any files until you say "approved" or "go ahead" (or equivalent) for the current phase.
2. **Phase-by-phase progression.** Work proceeds strictly in order: Phase 1 → Phase 2 → ... → Phase 7. No skipping.
3. **Gate presentation.** At the end of each phase, I will present what was built, demonstrate it works, and wait for your sign-off.
4. **User-directed additions.** If you want to add features, change requirements, or redirect priorities at any point, those take precedence over the existing plan.
5. **No assumptions.** If anything is ambiguous or undefined (e.g., "clinic info to be defined later"), I will ask you rather than guess.

---

## Changes Applied in This Final Version

| # | Change | Impact |
|---|---|---|
| 1 | **Firebase Auth → Supabase Auth** | All authentication (login, register, email verification link) now handled by Supabase. Firebase is for push notifications ONLY. |
| 2 | **Payment compulsory for ALL clinic types** | Every new patient must pay regardless of clinic type. |
| 3 | **Multi-visit returning patient flow** | Old patients with a 10-digit code can book without payment. App auto-suggests saved codes or allows manual input. |
| 4 | **Clinic services catalog** | Clinics can add every service they offer with pricing. One clinic can have multiple services. |
| 5 | **Search by service / clinic / doctor** | Patient app supports triple-dimension search and discovery. |
| 6 | **Clinic can edit their own type** | Clinics can change their type (single_visit/multi_visit/diagnostic_lab) from settings. |
| 7 | **Admin broadcast notifications** | Admin can push notifications to all users, all doctors, all clinics, or any combination. |
| 8 | **Separate project folders** | `patient-app/`, `clinic-app/`, `admin-panel/` — each app in its own folder. |
| 9 | **Supabase Storage Buckets & Binary Uploads** | Created `clinic_photos`, `doctor_photos`, and `doctor-kyc` public buckets. Native Android app reads file byte streams and uploads directly to Supabase Storage. |
| 10 | **Clinic Activation System & Schema Migration** | Added license expiry calculation, plan tier extension (`1_month` / `12_months`), and live status indicators on the admin console. |
| 11 | **Admin Portal GitHub Pages Deployment** | Auto-deploying Vite React app to GitHub Pages (`dactorofficial.github.io/admin-portal/`). |

---

## 12. Component Handoff Documentation

Detailed handoff documents for each platform layer are available:
- **[Master System Handoff](file:///G:/My%20Drive/New%20folder/HANDOFF.md)**
- **[Admin Portal Handoff](file:///G:/My%20Drive/New%20folder/admin-panel/HANDOFF.md)**
- **[Clinic & Doctor App Handoff](file:///G:/My%20Drive/New%20folder/clinic-app/HANDOFF.md)**
- **[Patient App Handoff](file:///G:/My%20Drive/New%20folder/patient-app/HANDOFF.md)**
- **[Supabase Backend Handoff](file:///G:/My%20Drive/New%20folder/supabase/HANDOFF.md)**

---

*This is the final work plan. All 10 original prompts plus all corrections and recent system upgrades are incorporated.*
