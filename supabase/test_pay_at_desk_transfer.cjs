const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, 'migration_fix_pay_at_desk_queue_transfer.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

console.log('--- RUNNING PAY AT DESK QUEUE TRANSFER & APPROVAL STATIC AUDIT ---');

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
assert(
  sql.includes('CREATE OR REPLACE FUNCTION public.approve_pay_at_desk_appointment('),
  '1b. approve_pay_at_desk_appointment RPC is created'
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

// 4. Check Status Transition to WAITING_FOR_APPROVAL upon patient request
assert(
  sql.includes("status = 'WAITING_FOR_APPROVAL'") && sql.includes("payment_mode = 'PAY_AT_DESK'"),
  '4. confirm_pay_at_desk_booking updates appointment to WAITING_FOR_APPROVAL with payment_mode PAY_AT_DESK'
);

// 5. Check Live Queue Isolation upon patient request
assert(
  sql.includes('DELETE FROM public.queue_entries WHERE appointment_id = v_appt.id;'),
  '5. confirm_pay_at_desk_booking isolates appointment from public.queue_entries until approved'
);

// 6. Check Clinic Approval transfers to Live Queue
assert(
  sql.includes("status = 'APPROVED'") &&
  sql.includes('INSERT INTO public.queue_entries (') &&
  sql.includes('ON CONFLICT (appointment_id) DO UPDATE') &&
  sql.includes("status = 'waiting'"),
  '6. approve_pay_at_desk_appointment atomically sets APPROVED and transfers into public.queue_entries with status waiting'
);

// 7. Check Slot Overload on Approval
assert(
  sql.includes('SELECT * INTO v_slot FROM public.slots WHERE id = v_appt.slot_id FOR UPDATE;') &&
  sql.includes('SET booked_count = v_count'),
  '7. approve_pay_at_desk_appointment reconciles slot capacity with overload support'
);

// 8. Check Safe Notifications (Protected by exception handler)
assert(
  sql.includes('EXCEPTION WHEN OTHERS THEN') &&
  sql.includes('Notification logging never rolls back the transaction'),
  '8. Notification inserts are protected by EXCEPTION handler to prevent FK aborts'
);

// 9. Check Grants
assert(
  sql.includes('GRANT EXECUTE ON FUNCTION public.confirm_pay_at_desk_booking(UUID, NUMERIC) TO anon, authenticated, service_role;'),
  '9. Execution granted to anon, authenticated, and service_role'
);

// 10. Check Edge Function alignment
const edgePath = path.join(__dirname, 'functions', 'appointment-payment', 'index.ts');
const edge = fs.readFileSync(edgePath, 'utf8');

assert(
  edge.includes('status: "WAITING_FOR_APPROVAL"') &&
  edge.includes('payment_mode: "PAY_AT_DESK"') &&
  edge.includes('await service.from("queue_entries").delete().eq("appointment_id", appointmentId);'),
  '10. Edge Function aligns with status WAITING_FOR_APPROVAL and queue quarantine on request'
);

// 11. Check Patient Repository alignment
const patientRepoPath = path.join(__dirname, '..', 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'data', 'repository', 'AppointmentRepository.kt');
const patientRepo = fs.readFileSync(patientRepoPath, 'utf8');

assert(
  patientRepo.includes('set("status", "WAITING_FOR_APPROVAL")') &&
  patientRepo.includes('supabaseClient.postgrest["queue_entries"].delete {'),
  '11. Patient App AppointmentRepository fallback sets WAITING_FOR_APPROVAL and deletes from queue'
);

// 12. Check Clinic Queue Board alignment
const queueBoardPath = path.join(__dirname, '..', 'clinic-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'clinic', 'ui', 'queue', 'QueueBoardScreen.kt');
const queueBoard = fs.readFileSync(queueBoardPath, 'utf8');

assert(
  queueBoard.includes('appt.status.equals("APPROVED", ignoreCase = true) &&') &&
  !queueBoard.includes('(appt.paymentMode == "PAY_AT_DESK" && appt.status != "CANCELLED" && appt.status != "UNAPPROVED" && appt.status != "EXPIRED")'),
  '12. Clinic QueueBoardScreen strictly requires status APPROVED for live queue items'
);

console.log('--- ALL STATIC AUDIT CHECKS PASSED SUCCESSFULLY ---');
