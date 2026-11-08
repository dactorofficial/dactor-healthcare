/**
 * Automated Verification Script for Payment Logs, Financial Ledgers & Doctor Analytics
 * File: supabase/test_payment_logs_and_analytics.cjs
 */

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, 'migration_payment_logs_and_analytics.sql');

console.log('======================================================================');
console.log('=== DACTOR PAYMENT LOGS & DOCTOR ANALYTICS MIGRATION VERIFICATION  ===');
console.log('======================================================================');

if (!fs.existsSync(migrationPath)) {
  console.error('FATAL: migration_payment_logs_and_analytics.sql not found at', migrationPath);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error('  ❌ FAIL:', message);
    failCount++;
  } else {
    console.log('  √ PASS:', message);
    passCount++;
  }
}

console.log('\n[1] Table Structure & Column Extensions:');
assert(sql.includes('ALTER TABLE public.invoice_transactions'), 'Extends invoice_transactions table');
assert(sql.includes('ADD COLUMN IF NOT EXISTS reference_id TEXT'), 'Adds reference_id to invoice_transactions');
assert(sql.includes('ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT \'CONSULTATION\''), 'Adds category to invoice_transactions');
assert(sql.includes('CREATE TABLE IF NOT EXISTS public.clinic_subscription_payments'), 'Creates clinic_subscription_payments table');
assert(sql.includes('CREATE TABLE IF NOT EXISTS public.platform_commission_settlements'), 'Creates platform_commission_settlements table');

console.log('\n[2] Indexes for High Performance Filtering:');
assert(sql.includes('idx_invoice_transactions_ref'), 'Creates index on invoice_transactions reference_id');
assert(sql.includes('idx_invoice_transactions_method_time'), 'Creates index on payment_method and transaction_time');
assert(sql.includes('idx_clinic_subscription_payments_clinic'), 'Creates index on subscription payments clinic_id');
assert(sql.includes('idx_platform_commission_settlements_clinic'), 'Creates index on commission settlements clinic_id');

console.log('\n[3] Row Level Security (RLS) Policies:');
assert(sql.includes('ALTER TABLE public.clinic_subscription_payments ENABLE ROW LEVEL SECURITY'), 'Enables RLS on clinic_subscription_payments');
assert(sql.includes('ALTER TABLE public.platform_commission_settlements ENABLE ROW LEVEL SECURITY'), 'Enables RLS on platform_commission_settlements');
assert(sql.includes('clinic_subscription_payments_admin_all'), 'Grants admin full access on subscription payments');
assert(sql.includes('clinic_subscription_payments_clinic_select'), 'Allows clinic staff to view their subscription payments');
assert(sql.includes('platform_commission_settlements_admin_all'), 'Grants admin full access on platform commission settlements');
assert(sql.includes('platform_commission_settlements_clinic_select'), 'Allows clinic staff to view their commission settlements');

console.log('\n[4] eSewa Finalization & Ledger Integration:');
assert(sql.includes('CREATE OR REPLACE FUNCTION finalize_esewa_appointment_payment'), 'Updates finalize_esewa_appointment_payment');
assert(sql.includes('INSERT INTO invoice_transactions'), 'Inserts ledger record on eSewa finalization');
assert(sql.includes('COALESCE(p_provider_reference, attempt.transaction_uuid)'), 'Logs eSewa provider reference in invoice_transactions');

console.log('\n[5] Secure Read RPC for Online Payment Attempts:');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.get_clinic_payment_attempts'), 'Defines get_clinic_payment_attempts RPC');
assert(sql.includes('public.is_admin_portal_user() OR public.is_authorized_clinic_staff(p_clinic_id)'), 'Secures payment attempts RPC with clinic and admin authorization check');

console.log('\n[6] Doctor New-Patient & Revenue Analytics (Family-Phone Safe):');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.get_doctor_patient_revenue_stats'), 'Defines get_doctor_patient_revenue_stats RPC');
assert(sql.includes('RIGHT(REGEXP_REPLACE(COALESCE(a.patient_mobile, \'\'), \'\\D\', \'\', \'g\'), 10) || \'|\' || LOWER(TRIM(a.patient_name))'), 'Implements family-safe unique patient resolution (Phone + Name fallback)');
assert(sql.includes('new_patients_count'), 'Calculates new_patients_count');
assert(sql.includes('followup_patients_count'), 'Calculates followup_patients_count');
assert(sql.includes('consultation_revenue'), 'Calculates consultation_revenue');

console.log('\n[7] Backfills & Schema Reload:');
assert(sql.includes('INSERT INTO public.clinic_subscription_payments'), 'Provides backfill for existing active clinics');
assert(sql.includes('NOTIFY pgrst, \'reload schema\';'), 'Reloads PostgREST schema cache');

console.log('\n======================================================================');
console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed`);
console.log('======================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 All SQL validation tests passed successfully!');
}
