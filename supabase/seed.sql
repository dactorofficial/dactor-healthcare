-- Dactor Seed Data

-- 1. Create a default verified clinic in Kathmandu
INSERT INTO clinics (
  id,
  name,
  type,
  verification_status,
  contact_phone,
  contact_email,
  address_text,
  latitude,
  longitude,
  auto_notify_threshold,
  description
) VALUES (
  'c1111111-1111-1111-1111-111111111111',
  'Kathmandu Health Hub & Polyclinic',
  'multi_visit',
  'approved',
  '01-4221100',
  'admin@dactor.com.np',
  'Bagbazar Chowk, Kathmandu, Nepal',
  27.7052,
  85.3193,
  2,
  'Premier healthcare center providing Cardiology, General Medicine, and Diagnostic pathology services.'
) ON CONFLICT (id) DO NOTHING;

-- 2. Create services for this clinic
INSERT INTO clinic_services (clinic_id, service_name, description, price)
VALUES 
  ('c1111111-1111-1111-1111-111111111111', 'General OPD Consultation', 'Standard 15 min physician checkup', 500.00),
  ('c1111111-1111-1111-1111-111111111111', 'Cardiology Specialist OPD', 'Senior cardiologist consultation & ECG evaluation', 1000.00),
  ('c1111111-1111-1111-1111-111111111111', 'Follow-up Visit', 'Follow-up within 7 calendar days', 300.00),
  ('c1111111-1111-1111-1111-111111111111', 'CBC Blood Test (Complete Blood Count)', 'Automated hematology analyzer lab report', 650.00),
  ('c1111111-1111-1111-1111-111111111111', 'Lipid Profile & Glucose Fasting', 'Comprehensive metabolic panel', 1200.00)
ON CONFLICT DO NOTHING;

-- 3. Create a registered doctor attached to this clinic
INSERT INTO doctors (
  id,
  clinic_id,
  full_name,
  email,
  specialty,
  nmc_license_number,
  kyc_status,
  is_in_clinic,
  consultation_fee
) VALUES (
  'd1111111-1111-1111-1111-111111111111',
  'c1111111-1111-1111-1111-111111111111',
  'Dr. Aarav Sharma',
  'doctor@dactor.com.np',
  'Senior Cardiologist',
  'NMC-18294',
  'approved',
  true,
  1000.00
) ON CONFLICT (id) DO NOTHING;
