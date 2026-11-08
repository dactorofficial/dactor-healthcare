# Super Admin Web Console — Component Handoff

> **Project**: `admin-panel/`  
> **Repository**: [github.com/dactorofficial/admin-portal](https://github.com/dactorofficial/admin-portal)  
> **Live Site**: [dactorofficial.github.io/admin-portal](https://dactorofficial.github.io/admin-portal/)  
> **Last Updated**: October 9, 2026  

---

## 1. Overview & Stack

The Super Admin Console is a single-page web application designed for the Dactor platform super administrator. It allows platform administrators to verify clinics, review doctor medical credentials, manage clinic licensing periods, configure payment gateway credentials, and broadcast urgent alerts.

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + Lucide React Icons
- **Backend**: Supabase JS Client v2 (`@supabase/supabase-js`)
- **Hosting**: GitHub Pages via automated GitHub Actions workflow

---

## 2. Directory Structure

```
admin-panel/
├── .github/workflows/
│   └── static.yml              # GitHub Actions Vite build & Pages deployment
├── dist/                       # Compiled production bundle
├── src/
│   ├── components/             # Reusable UI widgets, badges, confirmation modals
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client singleton
│   │   └── types.ts            # TypeScript interfaces (Clinic, Doctor, Profile, etc.)
│   ├── pages/
│   │   ├── Dashboard.tsx       # Live operational metrics & platform counts
│   │   ├── ClinicActivation.tsx # License activation, validity extension, expiry metrics
│   │   ├── ClinicVerification.tsx # Clinic KYC, photo previews, registration docs, approval
│   │   ├── DoctorKYC.tsx       # Doctor medical credentials, NMC license & degree inspection
│   │   ├── ClinicEditor.tsx    # Master clinic editor, PAN, manager phone, pricing catalog
│   │   ├── BroadcastNotification.tsx # System-wide push notification dispatcher
│   │   └── Login.tsx           # Admin authentication gate
│   ├── App.tsx                 # Routing and navigation shell
│   └── main.tsx                # Entrypoint
├── package.json
└── vite.config.ts              # Base path set to '/admin-portal/' for GitHub Pages
```

---

## 3. Key Features & Work Done in This Session

### A. Clinic Activation & Subscription Management (`ClinicActivation.tsx`)
- **Accurate Validity Calculations**:
  - Top metric cards properly categorize active licenses, expiring soon, and expired states based on the database column `activation_expires_at` and `is_activated`.
  - Added support for 1-month (`1_month`) and 12-month (`12_months`) plans, updating both expiration date and paid amount in Supabase.
  - Added filter tabs: All Clinics, Active, Expiring Soon, Expired, and 30-Day Archive.

### B. Supabase Storage Integration & Image Resolution (`DoctorKYC.tsx` & `ClinicVerification.tsx`)
- **Resolved Supabase v2 API syntax**:
  - Replaced outdated v1 calls (`{ publicURL: url }`) with official Supabase v2 syntax:
    ```typescript
    const { data } = supabase.storage.from(bucket).getPublicUrl(cleanPath);
    const publicUrl = data?.publicUrl;
    ```
- **DoctorKYC Document Preview**:
  - Resolves doctor avatars from `doctor_photos` and documents (NMC license PDF, Degree certificate) from `doctor-kyc`.
  - Added image `onError` fallback handling so legacy submissions or missing photos do not show broken browser icons.
- **ClinicVerification Gallery**:
  - Resolves clinic gallery photos from `clinic_photos`.
  - Gracefully handles older submissions that contain device-local `content://` URIs with a dedicated warning indicator rather than failing to render.

### C. Medical Taxonomy Management (`MedicalTaxonomy.tsx`)
- **Clinic Specialties Tab**:
  - Full CRUD operations over `medical_specialties` table.
  - Form attributes: Department Name, Category, Lucide Icon, Description, and Comma-Separated Search Keywords.
  - Allows adding and editing specialty entries dynamically.
- **Doctor Qualifications & Degrees Tab**:
  - Full CRUD operations over `medical_qualifications` table.
  - Form attributes: Degree Name (e.g. MBBS, MD, MS, DM, MCh, BDS), Qualification Level, Field of Study, Description.
  - Controls the options available to doctors during registration and settings.
- **Interactive Symptom Simulator**:
  - Embedded live testing sandbox allowing administrators to test patient search queries (e.g. "eye", "teeth", "skin", "chest pain") and preview real-time matched specialties and keywords.
- **Clinic Editor Integration (`ClinicEditor.tsx`)**:
  - Added dynamic multi-select specialty chips under the Clinic Information section, enabling administrators to assign or edit multiple departments per clinic.

---

## 4. Build & Deployment Commands

```bash
# Install dependencies
npm install

# Run local development server
npm run dev

# Run TypeScript type check
npx tsc --noEmit

# Production build
npm run build

# Push to GitHub (Triggers automatic GitHub Actions build & deploy to Pages)
git add .
git commit -m "Update admin portal"
git push origin main
```
