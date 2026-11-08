# Clinic & Doctor Android App — Component Handoff

> **Project**: `clinic-app/`  
> **Platform**: Native Android (Kotlin + Jetpack Compose + Material 3)  
> **Target SDK**: Android 14 (API 34)  
> **Last Updated**: October 9, 2026  

---

## 1. Overview & Stack

`clinic-app` is the primary native Android operational suite used by clinic administrators, receptionists, and medical practitioners across Nepal.

- **UI Toolkit**: Jetpack Compose (Material 3)
- **Architecture**: MVVM + Clean Architecture + Repository Pattern
- **Dependency Injection**: Hilt (Dagger)
- **Database & Storage SDK**: Supabase Kotlin SDK `2.6.1` (`postgrest-kt`, `storage-kt`, `gotrue-kt`, `realtime-kt`)
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Location & Maps**: OpenStreetMap (OSM) picker + Geocoder integration
- **Media Loading**: Coil Compose

---

## 2. Directory Structure

```
clinic-app/
├── app/
│   ├── build.gradle.kts
│   └── src/main/java/com/dactor/clinic/
│       ├── data/
│       │   ├── local/          # Session manager & registration draft storage
│       │   ├── model/          # Clinic, Doctor, Slot, QueueEntry, CatalogItem, Invoice, etc.
│       │   └── repository/     # ClinicRepository, DoctorRepository, QueueRepository, BillingRepository
│       ├── di/                 # AppModule (SupabaseClient with Storage installed)
│       ├── domain/util/        # TrackingCodeGenerator, CurrencyFormatter, DateTimePickers
│       └── ui/
│           ├── appointments/   # FutureAppointmentsScreen
│           ├── auth/           # ClinicLoginScreen, ClinicRegisterScreen, DoctorKYCScreen
│           ├── billing/        # BillingScreen, CatalogManagerScreen
│           ├── dashboard/      # DashboardScreen, DoctorDashboardScreen
│           ├── invitations/    # InvitationManagerScreen
│           ├── lab/            # LabWorkflowScreen
│           ├── navigation/     # NavRoutes, DactorClinicNavHost
│           ├── queue/          # QueueBoardScreen
│           ├── services/       # ServicesScreen
│           ├── settings/       # ClinicSettingsScreen
│           └── slots/          # SlotManagerScreen
└── build.gradle.kts
```

---

## 3. Key Features & Work Done in This Session

### A. Direct Binary Uploads to Supabase Storage
- **Problem Fixed**:
  - The application was previously stringifying Android `Uri` instances (`it.toString()`), persisting local device file paths like `content://media/...` directly to the `clinics.pictures`, `clinics.registration_doc_url`, and `doctors.profile_picture_url` columns.
- **Implementation**:
  - **`ClinicRepository.kt`**:
    ```kotlin
    suspend fun uploadClinicFile(fileName: String, fileBytes: ByteArray, bucketName: String = "clinic_photos"): String?
    ```
  - **`DoctorRepository.kt`**:
    ```kotlin
    suspend fun uploadProfilePicture(fileName: String, fileBytes: ByteArray): String?
    suspend fun uploadKycFile(fileName: String, fileBytes: ByteArray): String?
    ```
  - **`ClinicLoginScreen.kt`**:
    - During clinic registration, document bytes from `clinicRegDocUri` and gallery images from `clinicPictures` are read using `context.contentResolver.openInputStream(uri)?.use { it.readBytes() }`.
    - Uploaded asynchronously to `clinic_photos` in Supabase Storage with dynamic progress statuses.
    - Public HTTPS URLs are saved to Postgres.
    - During doctor registration, avatar bytes from `doctorPictureUri` are uploaded to `doctor_photos`.
  - **`DoctorDashboardScreen.kt`**:
    - Editing doctor profile picture now reads bytes from the chosen URI, uploads to `doctor_photos`, and updates Supabase with the public URL.
  - **`DoctorKYCScreen.kt`**:
    - Sanitizes document file names (replacing spaces with underscores) before uploading to `doctor-kyc`.

### B. App Icon Branding & Adaptive Assets
- Created customized adaptive launcher icons with circular and squircle mask support across all screen densities (`mipmap-mdpi` through `mipmap-xxxhdpi`).

### C. Multi-Specialty Selection & Dynamic Medical Qualifications
- **Data Models**:
  - `MedicalSpecialty.kt`: Maps `medical_specialties` table (id, name, category, description, search_keywords, icon).
  - `MedicalQualification.kt`: Maps `medical_qualifications` table (id, degree_name, level, field_of_study).
  - `Clinic.kt` & `Doctor.kt`: Added `specialties: List<String> = emptyList()`.
- **Repository Methods**:
  - `ClinicRepository.getSpecialties()`: Fetches active specialties from Supabase `medical_specialties`.
  - `DoctorRepository.getQualifications()`: Fetches master qualifications from Supabase `medical_qualifications`.
- **Clinic Registration (`ClinicLoginScreen.kt`)**:
  - Dynamic multi-select FilterChips for clinical departments. Allows clinics to select multiple specialties (e.g., General Medicine, Dental Care, Ophthalmology, Pediatrics).
- **Doctor Registration & Dashboard Settings (`ClinicLoginScreen.kt`, `DoctorDashboardScreen.kt`)**:
  - Dynamic degree/qualification quick-picks populated from `medical_qualifications`.
  - Dynamic specialization chips populated from `medical_specialties`.
- **Clinic Settings (`ClinicSettingsScreen.kt`)**:
  - Dedicated "Clinical Specialties (Multi-Select)" section allowing clinics to add or update departments anytime, updating `clinics.specialties` in Supabase.

---

## 4. Build Instructions

```powershell
cd clinic-app

# Clean project
./gradlew.bat clean

# Compile debug APK
./gradlew.bat assembleDebug

# Output location:
# clinic-app/app/build/outputs/apk/debug/app-debug.apk
# Stored for distribution in:
# G:\My Drive\New folder\APKs\Dactor-ClinicApp-debug.apk
```
