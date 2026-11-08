# Patient Android App — Component Handoff

> **Project**: `patient-app/`  
> **Platform**: Native Android (Kotlin + Jetpack Compose + Material 3)  
> **Target SDK**: Android 14 (API 34)  
> **Last Updated**: October 9, 2026  

---

## 1. Overview & Stack

`patient-app` is the public-facing patient application that enables individuals in Nepal to discover healthcare facilities and doctors, book appointments with atomic reservation locks, track live queue positions, and inspect diagnostic laboratory reports.

- **UI Toolkit**: Jetpack Compose (Material 3)
- **Architecture**: MVVM + Clean Architecture + Repository Pattern
- **Dependency Injection**: Hilt (Dagger)
- **Database & Realtime**: Supabase Kotlin SDK `2.6.1`
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Image Loading**: Coil Compose

---

## 2. Directory Structure

```
patient-app/
├── app/
│   ├── build.gradle.kts
│   └── src/main/java/com/dactor/patient/
│       ├── data/
│       │   ├── model/          # Appointment, Clinic, Doctor, LabReport, Slot, etc.
│       │   └── repository/     # AppointmentRepository, DoctorRepository, NotificationRepository
│       ├── di/                 # AppModule (SupabaseClient configuration)
│       ├── domain/util/        # PrivacyMasker, CurrencyFormatter, TrackingCodeGenerator
│       └── ui/
│           ├── auth/           # LoginScreen, RegisterScreen
│           ├── booking/        # BookingScreen, BookingFormScreen, PaymentScreen
│           ├── discovery/      # DiscoveryScreen (triple search), ClinicDetailScreen
│           ├── labreport/      # LabReportScreen, NameVerificationDialog
│           ├── landing/        # LandingScreen (instant 10-digit code lookup)
│           ├── navigation/     # NavRoutes, DactorPatientNavHost
│           ├── notifications/  # NotificationCenterScreen
│           ├── profile/        # ProfileScreen (retroactive code claiming)
│           └── tracker/        # QueueStatusScreen (Token, Doctor In-Clinic state, PII masking)
└── build.gradle.kts
```

---

## 3. Key Core Mechanisms

1. **Zero Mandatory Login Lookup**:
   - Patients can enter their 10-digit tracking code into `LandingScreen` or `TrackingLookupScreen` to view live queue position without creating an account.
2. **5-Minute Atomic Slot Lock**:
   - When proceeding to checkout, the app calls the Supabase RPC function `acquire_slot_lock`. If payment completes, the slot is confirmed; if abandoned or expired, the lock automatically releases.
3. **Doctor In-Clinic Presence**:
   - Real-time indicator reflects whether the consulting physician is physically inside the clinic.
4. **PII Masking**:
   - Masks names and telephone numbers on public queue dashboards to protect patient privacy.
5. **Confidential Lab Report Name Gate**:
   - Downloading or previewing diagnostic lab reports requires verifying the patient's full name matching the laboratory requisition.
6. **Smart Symptom & Natural Language Matching**:
   - Matches patient natural language searches (e.g., "eye", "vision", "tooth", "teeth", "skin", "acne", "heart", "chest pain", "fever") against dynamic `medical_specialties.search_keywords`.
   - Displays real-time "🎯 Matched Condition / Specialty" banner.
   - Filters both clinics (by departments and roster) and doctors (by qualifications, specialties, and names).
7. **Bidirectional Booking Navigation**:
   - **Clinic-First Flow**: Clicking a clinic navigates to `BookingScreen(clinicId)` where patient chooses doctor -> chooses slot -> books.
   - **Doctor-First Flow**: Clicking a doctor opens the "Select Practicing Clinic" modal resolving all affiliated clinics via `doctorRepository.getClinicsForDoctor(doctor)`. When patient selects a clinic, navigates to `BookingScreen(clinicId, doctorId)` where that doctor is automatically pre-selected and their slots are displayed directly.

---

## 4. Build Instructions

```powershell
cd patient-app

# Clean project
./gradlew.bat clean

# Compile debug APK
./gradlew.bat assembleDebug

# Output location:
# patient-app/app/build/outputs/apk/debug/app-debug.apk
# Stored for distribution in:
# G:\My Drive\New folder\APKs\Dactor-PatientApp-debug.apk
```
