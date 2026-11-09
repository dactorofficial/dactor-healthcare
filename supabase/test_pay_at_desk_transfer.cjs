const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, 'migration_fix_pay_at_desk_queue_transfer.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

console.log('--- RUNNING PAY AT DESK QUEUE TRANSFER STATIC AUDIT ---');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

// 1. Check RPC existence
assert(
  sql.includes('CREATE OR REPLACE FUNCTION public.confirm_pay_at_desk_booking('),
  '1. confirm_pay_at_desk_booking RPC is created'
);

// 2. Check SECURITY DEFINER and search_path
assert(
  sql.includes('SECURITY DEFINER') && sql.includes('SET search_path = pg_catalog, public'),
  '2. Functions have SECURITY DEFINER and strict search_path'
);

// 3. Check Authoritative context
assert(
  sql.includes("PERFORM set_config('dactor.authoritative_context', 'true', true);"),
  '3. Authoritative context bypass is set for triggers'
);

// 4. Check Status Transition to APPROVED
assert(
  sql.includes("status = 'APPROVED'") && sql.includes("payment_mode = 'PAY_AT_DESK'"),
  '4. Updates appointment to APPROVED with payment_mode PAY_AT_DESK'
);

// 5. Check Live Queue Insertion
assert(
  sql.includes('INSERT INTO public.queue_entries (') &&
  sql.includes('ON CONFLICT (appointment_id) DO UPDATE') &&
  sql.includes("status = 'waiting'"),
  '5. Atomically enqueues into public.queue_entries with status waiting'
);

// 6. Check Safe Notifications (Protected by exception handler)
assert(
  sql.includes('EXCEPTION WHEN OTHERS THEN') &&
  sql.includes('Notification logging never rolls back the transaction'),
  '6. Notification inserts are protected by EXCEPTION handler to prevent FK aborts'
);

// 7. Check Grants
assert(
  sql.includes('GRANT EXECUTE ON FUNCTION public.confirm_pay_at_desk_booking(UUID, NUMERIC) TO anon, authenticated, service_role;'),
  '7. Execution granted to anon, authenticated, and service_role'
);

// 8. Check Edge Function alignment
const edgePath = path.join(__dirname, 'functions', 'appointment-payment', 'index.ts');
const edge = fs.readFileSync(edgePath, 'utf8');

assert(
  edge.includes('status: "APPROVED"') &&
  edge.includes('payment_mode: "PAY_AT_DESK"') &&
  edge.includes('await service.from("queue_entries").upsert('),
  '8. Edge Function aligns with atomic queue entry placement and status APPROVED'
);

assert(
  !edge.includes('await service.from("queue_entries").delete().eq("appointment_id", appointmentId);'),
  '9. Edge function no longer deletes Pay at Desk from queue'
);

console.log('--- ALL STATIC AUDIT CHECKS PASSED SUCCESSFULLY ---');
