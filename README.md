# DACTOR (डाक्टर) — Clinic Management & Live Queue Tracking Platform

> **A comprehensive clinic management, OPD scheduling, and real-time live queue tracking ecosystem tailored for Nepal.**

---

## 🏛️ System Architecture & Project Organization

The codebase is organized into dedicated directories:

```
dactorsecond/
├── patient-app/           # Native Android Patient App (Kotlin + Jetpack Compose + Hilt)
│   ├── app/
│   │   ├── build.gradle.kts
│   │   └── src/main/java/com/dactor/patient/
│   │       ├── data/model/          # Appointment, Clinic, Doctor, LabReport, etc.
│   │       ├── data/repository/     # Supabase PostgREST & Auth Repositories
│   │       ├── di/                  # Hilt Dependency Injection (SupabaseClient)
│   │       ├── domain/util/         # PrivacyMasker, CurrencyFormatter, TrackingCodeGenerator
│   │       └── ui/
│   │           ├── landing/         # LandingScreen (Instant 10-digit lookup & discovery)
│   │           ├── discovery/       # DiscoveryScreen (Triple search), ClinicDetailScreen
│   │           ├── booking/         # BookingScreen, BookingFormScreen, PaymentScreen (5-min lock)
│   │           ├── tracker/         # QueueStatusScreen (Token, Doctor Presence, PII Masking)
│   │           ├── labreport/       # LabReportScreen (3-stage stepper, Name Verification Gate)
│   │           ├── notifications/   # NotificationsScreen (FCM alert center)
│   │           └── profile/         # ProfileScreen (Saved 10-digit codes, Claim Code)
├── clinic-app/            # Native Android Clinic & Doctor App (Kotlin + Jetpack Compose + Hilt)
│   ├── app/
│   │   ├── build.gradle.kts
│   │   └── src/main/java/com/dactor/clinic/
│   │       ├── data/model/          # Clinic, Doctor, Slot, QueueEntry, CatalogItem, BillingInvoice
│   │       ├── data/repository/     # Queue, Billing, Slot, Doctor, LabReport Repositories
│   │       ├── di/                  # Hilt Dependency Injection (SupabaseClient)
│   │       └── ui/
│   │           ├── auth/            # ClinicRegister (Map pin), DoctorRegister, DoctorKYC (NMC)
│   │           ├── dashboard/       # DashboardScreen (Doctor In-Clinic presence switch)
│   │           ├── queue/           # QueueBoardScreen (Drag/Slide reorder, Push turn alert)
│   │           ├── walkin/          # WalkinBookingScreen (Receptionist desk + overbooking)
│   │           ├── services/        # ServicesScreen (Multi-service catalog & price manager)
│   │           ├── slots/           # SlotManagerScreen (Date/time capacity manager)
│   │           ├── billing/         # BillingScreen (NPR invoice, catalog quick-add), CatalogManager
│   │           ├── lab/             # LabWorkflowScreen (Sample collection -> PDF report upload)
│   │           ├── settings/        # ClinicSettingsScreen (Self-service clinic type switcher)
│   │           └── invitations/     # InvitationManagerScreen (Staff & doctor invites)
├── admin-panel/           # Super Admin Web Console (React 18 + Vite + TypeScript + Tailwind CSS)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx        # KPI metrics & real-time counts
│   │   │   ├── ClinicVerification.tsx # Clinic KYC & type assignment (single/multi/diagnostic)
│   │   │   ├── DoctorKYC.tsx        # NMC license verification & document preview modal
│   │   │   ├── ClinicEditor.tsx     # Clinic master profile & services pricing editor
│   │   │   └── BroadcastNotification.tsx # Targeted push notifications (All Users/Doctors/Clinics)
│   │   └── lib/
│   │       ├── supabase.ts          # Supabase client singleton
│   │       └── types.ts             # Complete TypeScript types matching DB schema
└── supabase/              # PostgreSQL Database Layer
    ├── schema.sql         # 14 tables, custom enums, RLS policies, atomic slot locking functions
    └── seed.sql           # Realistic seed data for clinics, doctors, services, slots & reports
```

---

## ⚡ Core Business Logic & Mandates Implemented

### 1. Dual Backend Boundary (User Mandate)
- **Supabase**: Handles **all** database tables (PostgreSQL), user authentication (Supabase Auth email/password), storage buckets (`kyc-documents`, `lab-reports`), and Realtime WebSocket subscriptions.
- **Firebase**: Strictly dedicated **only** to Push Notifications (Firebase Cloud Messaging - FCM).

### 2. 10-Digit Numeric Tracking Code (Zero Mandatory Login)
- Every booked appointment or receptionist walk-in receives a unique 10-digit numeric tracking code (e.g. `9841203841`).
- Patients can track queue position, doctor presence, and lab test progress with **zero login** via [`TrackingLookupScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/patient-app/app/src/main/java/com/dactor/patient/ui/tracker/TrackingLookupScreen.kt) or [`LandingScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/patient-app/app/src/main/java/com/dactor/patient/ui/landing/LandingScreen.kt).
- Retroactive claiming: Guests can link their code to an account anytime via the 1-tap claim dialog in [`ProfileScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/patient-app/app/src/main/java/com/dactor/patient/ui/profile/ProfileScreen.kt).

### 3. Doctor In-Clinic Physical Presence Indicator
- Real-time physical presence toggle switch managed by clinic staff on [`DashboardScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/clinic-app/app/src/main/java/com/dactor/clinic/ui/dashboard/DashboardScreen.kt).
- Displayed prominently to waiting patients on [`QueueStatusScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/patient-app/app/src/main/java/com/dactor/patient/ui/tracker/QueueStatusScreen.kt) as **"Doctor is Physically Inside Clinic"** (Green) or **"Doctor Has Not Arrived Yet / Away"** (Red).

### 4. PII Privacy Masking on Public Displays
- [`PrivacyMasker.kt`](file:///c:/Users/notan/Downloads/dactorsecond/patient-app/app/src/main/java/com/dactor/patient/domain/util/PrivacyMasker.kt) automatically masks sensitive personal identifiable information:
  - Names: `"Ram Bahadur Shrestha"` $\rightarrow$ `"R**m B*****r"`
  - Mobile Numbers: `"9841203841"` $\rightarrow$ `"9841****41"`
  - Email Addresses: `"ram.bahadur@gmail.com"` $\rightarrow$ `"r***@g***l.com"`

### 5. Compulsory Payment & Multi-Visit Returning Patient Bypass
- **New Patients**: Compulsory payment required across all clinic types (eSewa, Khalti, ConnectIPS, Card).
- **Returning Patients at Multi-Visit Clinics**:
  - Automatically suggested previously saved 10-digit codes in [`BookingFormScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/patient-app/app/src/main/java/com/dactor/patient/ui/booking/BookingFormScreen.kt).
  - Patients can also enter their 10-digit code manually.
  - Follow-up appointment is confirmed instantly with **zero payment required**.

### 6. 5-Minute Atomic Slot Reservation Lock
- PostgreSQL stored procedure `acquire_slot_lock(p_slot_id, p_user_id)` locks the slot atomically for 300 seconds.
- Live Compose countdown timer (`05:00` $\rightarrow$ `00:00`) rendered in [`PaymentScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/patient-app/app/src/main/java/com/dactor/patient/ui/booking/PaymentScreen.kt).
- Automatically triggers `release_slot_lock()` if timer expires before payment confirmation.

### 7. Receptionist Walk-In Desk with Overbooking
- Receptionists can check in walk-in patients on [`WalkinBookingScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/clinic-app/app/src/main/java/com/dactor/clinic/ui/walkin/WalkinBookingScreen.kt).
- Overbooking toggle permits emergency additions beyond the normal max capacity limit.
- Generates a physical 10-digit code token on the spot.

### 8. Diagnostic Lab 3-Stage Pipeline & Name Verification Gate
- Clinic technician advances stage on [`LabWorkflowScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/clinic-app/app/src/main/java/com/dactor/clinic/ui/lab/LabWorkflowScreen.kt):
  1. `Sample Collected`
  2. `Processing`
  3. `Report Prepared` (uploads PDF report)
- Patient views stage on [`LabReportScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/patient-app/app/src/main/java/com/dactor/patient/ui/labreport/LabReportScreen.kt).
- **Name Verification Gate**: The report file remains locked until the patient verifies their identity by typing their exact registered full name. Once verified, the document is unlocked for preview and direct download.

### 9. Nationwide Super Admin Broadcast Push Notifications
- Super Admin can broadcast alerts to targeted audiences:
  - `all_users` (All patients)
  - `all_doctors` (All doctors)
  - `all_clinics` (All clinic staff)
- Handled via [`BroadcastNotification.tsx`](file:///c:/Users/notan/Downloads/dactorsecond/admin-panel/src/pages/BroadcastNotification.tsx) and received in [`NotificationsScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/patient-app/app/src/main/java/com/dactor/patient/ui/notifications/NotificationsScreen.kt).

### 10. Clinic Type Switcher & Multi-Services Catalog Pricing
- Clinics can manage multiple services and pricing in NPR via [`ServicesScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/clinic-app/app/src/main/java/com/dactor/clinic/ui/services/ServicesScreen.kt).
- Clinics can switch their clinic type (`single_visit`, `multi_visit`, `diagnostic_lab`) dynamically via [`ClinicSettingsScreen.kt`](file:///c:/Users/notan/Downloads/dactorsecond/clinic-app/app/src/main/java/com/dactor/clinic/ui/settings/ClinicSettingsScreen.kt).

---

## 🚀 How to Run the Applications

### 1. Database (Supabase)
Credentials already wired into the project:
- **Project URL**: `https://ojfoofojcpabqegxmsab.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y`
- Apply schema and seed data in the Supabase SQL editor using [`supabase/schema.sql`](file:///c:/Users/notan/Downloads/dactorsecond/supabase/schema.sql) and [`supabase/seed.sql`](file:///c:/Users/notan/Downloads/dactorsecond/supabase/seed.sql).

### 2. Super Admin Web Portal (`admin-panel/`)
```bash
cd admin-panel
npm install
npm run dev
# Or run preview:
npm run preview -- --port 3002
```
Access the console locally at `http://localhost:3000/` or view the live production deployment at:
**[https://dactorofficial.github.io/admin-portal/](https://dactorofficial.github.io/admin-portal/)**

### 3. Patient Android App (`patient-app/`)
- Open the `patient-app/` directory in Android Studio.
- Build debug APK via `./gradlew.bat assembleDebug` or run on an Android device (Min SDK 24, Target SDK 34).
- Production-ready APK available in: `APKs/Dactor-PatientApp-debug.apk`.

### 4. Clinic & Doctor Android App (`clinic-app/`)
- Open the `clinic-app/` directory in Android Studio.
- Build debug APK via `./gradlew.bat assembleDebug` or run on an Android device (Min SDK 24, Target SDK 34).
- Production-ready APK available in: `APKs/Dactor-ClinicApp-debug.apk`.

---

## 📚 System Documentation & Handoffs

For complete technical specifications, recent fixes, database schema migrations, and component architectures, refer to the respective handoff files:

- 📋 **[Master System Handoff](file:///G:/My%20Drive/New%20folder/HANDOFF.md)**: Overall platform architecture, storage setup, and cross-cutting fixes.
- 💻 **[Admin Portal Handoff](file:///G:/My%20Drive/New%20folder/admin-panel/HANDOFF.md)**: Web console, GitHub Pages deployment, and verification workflows.
- 🏥 **[Clinic & Doctor App Handoff](file:///G:/My%20Drive/New%20folder/clinic-app/HANDOFF.md)**: Queue management, direct binary uploads to Supabase Storage, and reception desk.
- 👤 **[Patient App Handoff](file:///G:/My%20Drive/New%20folder/patient-app/HANDOFF.md)**: Discovery, atomic slot reservation, and live queue tracking.
- 🗄️ **[Supabase Backend Handoff](file:///G:/My%20Drive/New%20folder/supabase/HANDOFF.md)**: Cloud database tables, storage buckets, RLS policies, and SQL scripts.

---

## 🔒 Official Privacy Policies & Regulatory Compliance

In accordance with Nepal's Individual Privacy Act 2075 (2018), Privacy Rules 2077, Electronic Transactions Act 2063, and Google Play Store Health Apps Policies, Dactor maintains separate, comprehensive privacy policies:

| Audience | Documentation (Markdown) | Official Live Web Page (GitHub Pages) |
| :--- | :--- | :--- |
| **Healthcare Facilities & Attending Doctors** | [`docs/privacy-clinic.md`](docs/privacy-clinic.md) | **[https://dactorofficial.github.io/privacy-clinic.html](https://dactorofficial.github.io/privacy-clinic.html)** |
| **Patients, Families & Guardians** | [`docs/privacy-patient.md`](docs/privacy-patient.md) | **[https://dactorofficial.github.io/privacy-patient.html](https://dactorofficial.github.io/privacy-patient.html)** |

---

## 🇳🇵 Currency & Localization
- All pricing and invoice amounts are formatted in Nepalese Rupees (`Rs. / NPR`) with thousands commas (e.g. `Rs. 1,500`) via `CurrencyFormatter.kt`.
- Coordinates centered around Kathmandu Valley (e.g. Bagbazar `27.7052° N, 85.3193° E`, Patan `27.6710° N, 85.3260° E`).
- Doctor registration validates Nepal Medical Council (NMC) licensing.
