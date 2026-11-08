# Supabase Backend & Database — Component Handoff

> **Project**: `supabase/`  
> **Supabase Project URL**: `https://ojfoofojcpabqegxmsab.supabase.co`  
> **Last Updated**: October 9, 2026  

---

## 1. Overview & Cloud Configuration

Supabase provides the core database, authentication, storage, and WebSocket realtime subscription layer for the entire Dactor system.

- **PostgreSQL Version**: 15+
- **Supabase JS Client**: `@supabase/supabase-js` v2
- **Supabase Kotlin SDK**: `io.github.jan-tennert.supabase` v2.6.1

---

## 2. Storage Buckets & Policies

Three public storage buckets are provisioned and active:

| Bucket ID | Public Access | Allowed File Types | Purpose |
|---|---|---|---|
| `clinic_photos` | `true` | All (Images, PDFs) | Clinic gallery photos (up to 4) & PAN/Registration document |
| `doctor_photos` | `true` | Images (JPG, PNG, WebP) | Doctor profile avatar photos |
| `doctor-kyc` | `true` | Images, PDFs | Official NMC License document & Medical Degree certificates |

### RLS Policies on `storage.objects`:
- **Read**: Publicly readable without authentication (`SELECT true`).
- **Upload**: Insert allowed for anon and authenticated clients for files under these buckets.
- **Update**: Allowed for upsert operations.

---

## 3. Database Schema Extensions & Added Columns

In addition to the original 14 tables in `schema.sql`, the following columns were added and verified:

```sql
-- Profiles Table Extensions
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

-- Clinics Table Extensions
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS pan_number VARCHAR(20);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS manager_phone VARCHAR(50);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS registration_doc_url TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS pictures TEXT[] DEFAULT '{}';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS payment_gateway_provider VARCHAR(50) DEFAULT 'esewa';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS payment_api_key TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS payment_secret_key TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS merchant_id VARCHAR(100);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS is_direct_payment_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS is_activated BOOLEAN DEFAULT TRUE;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS activation_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS activation_plan VARCHAR(50) DEFAULT '1_month';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS activation_paid_amount DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS activation_notes TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS activation_payment_proof_url TEXT;

-- Doctors Table Extensions
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS age INT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS starting_practicing_year INT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS education VARCHAR(255);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS personal_mobile_number VARCHAR(50);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS public_mobile_number VARCHAR(50);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS description TEXT;

-- Medical Taxonomy & Multi-Specialties (October 9, 2026)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}';
```

---

## 4. Medical Taxonomy & Dynamic Symptom Matching Tables

Two master tables manage the healthcare taxonomy across Nepal:

### 1. `medical_specialties` (Clinic Departments & Symptom Keywords)
Stores medical departments with comma-separated symptom keywords used by the smart search engine to match natural language patient queries (e.g., "eye", "teeth", "skin", "chest pain"):
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `name`: `VARCHAR(100) UNIQUE NOT NULL` (e.g., "Ophthalmology (Eye Care)", "Dental Care & Dentistry")
- `category`: `VARCHAR(50)` (e.g., "Specialized Care", "Surgical Care", "Primary Care")
- `description`: `TEXT`
- `search_keywords`: `TEXT` (e.g., "eye, vision, cataract, glasses, retina, cornea, glaucoma, blurry")
- `icon`: `VARCHAR(50) DEFAULT 'stethoscope'`
- `is_active`: `BOOLEAN DEFAULT TRUE`
- `created_at`: `TIMESTAMPTZ DEFAULT NOW()`

### 2. `medical_qualifications` (Doctor Medical Degrees)
Dynamic list of all recognized medical qualifications that doctors select during registration and in settings:
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `degree_name`: `VARCHAR(100) UNIQUE NOT NULL` (e.g., "MBBS", "MD - Internal Medicine", "DM - Cardiology")
- `level`: `VARCHAR(50)` (Undergraduate, Postgraduate, Super-Specialty / Doctoral, Fellowship, Diploma)
- `field_of_study`: `VARCHAR(100)` (Medicine, Surgery, Pediatrics, Cardiology, etc.)
- `description`: `TEXT`
- `is_active`: `BOOLEAN DEFAULT TRUE`
- `created_at`: `TIMESTAMPTZ DEFAULT NOW()`

---

## 5. SQL Files in Repository

- `schema.sql`: Full baseline schema with 14 tables, custom enums, atomic slot locking functions (`acquire_slot_lock`, `release_slot_lock`), and retroactive account linking trigger.
- `seed.sql`: Realistic seed data representing Nepal medical centers, doctors, and sample appointments.
- `migration_add_columns.sql`: Cumulative column migrations applied to production Supabase database.
- `migration_medical_taxonomy.sql`: Script defining `medical_specialties`, `medical_qualifications`, and initial 20 specialties with symptom keywords and 34 medical degrees.

- `appointment_payments_esewa.sql`: eSewa payment credentials, attempts tracking, and atomic finalization procedure.
- `migration_pay_at_desk.sql`: Pay at Desk schema columns, 5% configurable constant, 10-digit tracking code generator, atomic Postgres RPC functions (`create_pay_at_desk_appointment`, `list_pending_pay_at_desk_requests`, `approve_pay_at_desk_appointment`, `reject_pay_at_desk_appointment`, `retry_pay_at_desk_appointment`, `expire_pay_at_desk_appointments`), RLS policies, and scheduled job hooks.
- `test_pay_at_desk.sql`: Automated SQL test harness validating status transitions, max 3 retries, 2-day/past-slot expiry, queue isolation prior to approval, and slot overload (12/12 becoming 13).
