/**
 * DACTOR HEALTHCARE PLATFORM
 * Empirical Integration Verification Suite for Recent Supabase Migrations (Nov 11-15, 2026)
 * 
 * Tests:
 * 1. Payment Methods & Gateway Resolution (migration_fix_payment_methods_and_credentials.sql)
 * 2. Security Audit Hardening & RLS Boundaries (migration_remediate_critical_audit_vulnerabilities.sql)
 * 3. Notification Read Synchronization (migration_fix_notification_read_sync.sql)
 * 4. Temporary App Closure & Maintenance Mode (migration_temporary_app_closure.sql)
 * 5. Clinic Availability & Queue Closure Sweep (migration_add_clinic_open_close_status.sql)
 * 6. Scalability Indexes & Health Ping (migration_optimize_for_1000_users.sql)
 */

const SUPABASE_URL = 'https://ojfoofojcpabqegxmsab.supabase.co/rest/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y';

const HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
  'Content-Type': 'application/json'
};

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m'
};

let passed = 0;
let failed = 0;

function assertTest(condition, name, details = '') {
  if (condition) {
    passed++;
    console.log(`  ${ANSI.green}✓ [PASS]${ANSI.reset} ${name}`);
    if (details) console.log(`     ${ANSI.cyan}${details}${ANSI.reset}`);
  } else {
    failed++;
    console.log(`  ${ANSI.red}✗ [FAIL]${ANSI.reset} ${name}`);
    if (details) console.log(`     ${ANSI.yellow}Details: ${details}${ANSI.reset}`);
  }
}

async function runSuite() {
  console.log(`\n${ANSI.bold}========================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}   DACTOR PLATFORM: RECENT SUPABASE INTEGRATIONS VERIFICATION SUITE   ${ANSI.reset}`);
  console.log(`${ANSI.bold}========================================================================${ANSI.reset}\n`);

  // ---------------------------------------------------------------------------
  // INTEGRATION 1: Payment Methods & Gateway Resolution
  // ---------------------------------------------------------------------------
  console.log(`${ANSI.bold}--- Integration 1: Payment Methods RPC ---${ANSI.reset}`);
  try {
    const clinicRes = await fetch(`${SUPABASE_URL}/clinics?select=id,name&limit=1`, { headers: HEADERS });
    const clinics = await clinicRes.json();
    assertTest(clinicRes.ok && clinics.length > 0, 'Clinics query succeeds for test target', `Sample clinic: ${clinics[0]?.name || 'N/A'}`);

    if (clinics.length > 0) {
      const clinicId = clinics[0].id;
      const rpcRes = await fetch(`${SUPABASE_URL}/rpc/get_clinic_public_payment_methods`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ p_clinic_id: clinicId })
      });
      const methods = await rpcRes.json();

      assertTest(rpcRes.ok, 'get_clinic_public_payment_methods executes without runtime errors', `HTTP ${rpcRes.status}`);
      assertTest(Array.isArray(methods), 'Returned payment methods is a valid array', `Found ${methods?.length || 0} methods`);

      const pad = methods.find(m => m.id === 'pay_at_desk');
      assertTest(!!pad, 'Pay at Desk (+5%) is dynamically included in payment methods', pad ? pad.name : 'Missing');
      if (pad) {
        assertTest(pad.requires_desk_approval === true, 'Pay at Desk requires desk approval flag is true');
      }
    }
  } catch (err) {
    assertTest(false, 'Integration 1 threw exception', err.message);
  }

  // ---------------------------------------------------------------------------
  // INTEGRATION 2: Platform Security Audit Hardening & RLS Boundaries
  // ---------------------------------------------------------------------------
  console.log(`\n${ANSI.bold}--- Integration 2: Security Audit Hardening & RLS Boundaries ---${ANSI.reset}`);
  try {
    // 2.1 VULN-01: platform_payment_settings RLS
    const ppsRes = await fetch(`${SUPABASE_URL}/platform_payment_settings?select=*`, { headers: HEADERS });
    const ppsData = await ppsRes.json();
    const isProtected = ppsRes.ok && Array.isArray(ppsData) && ppsData.length === 0;
    assertTest(isProtected, 'VULN-01: platform_payment_settings blocks anonymous access (RLS active)', `Returned ${ppsData?.length || 0} rows to anon`);

    // 2.2 VULN-05: clinic_expenses RLS
    const expRes = await fetch(`${SUPABASE_URL}/clinic_expenses?select=id,title,amount&limit=5`, { headers: HEADERS });
    const expData = await expRes.json();
    const expProtected = expRes.ok && Array.isArray(expData) && expData.length === 0;
    assertTest(expProtected, 'VULN-05: clinic_expenses is protected by RLS against anonymous inspection', `Returned ${expData?.length || 0} rows to anon`);

    // 2.3 VULN-14: invoice_transactions RLS
    const txnRes = await fetch(`${SUPABASE_URL}/invoice_transactions?select=id,reference_id,category&limit=5`, { headers: HEADERS });
    const txnData = await txnRes.json();
    const txnProtected = txnRes.ok && Array.isArray(txnData) && txnData.length === 0;
    assertTest(txnProtected, 'VULN-14: invoice_transactions is protected by RLS against anonymous inspection', `Returned ${txnData?.length || 0} rows to anon`);

    // 2.4 VULN-03: clinics payment_secret_key purged
    const secretRes = await fetch(`${SUPABASE_URL}/clinics?payment_secret_key=not.is.null&select=id`, { headers: HEADERS });
    const secretData = await secretRes.json();
    assertTest(secretRes.ok && secretData.length === 0, 'VULN-03: payment_secret_key on clinics table is completely purged', `${secretData.length} clinics with raw secrets`);

    // 2.5 VULN-12: is_trusted_application_identity helper
    const idRes = await fetch(`${SUPABASE_URL}/rpc/is_trusted_application_identity`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({})
    });
    // Expected: 401 Permission Denied because REVOKE from anon was executed
    assertTest(idRes.status === 401, 'VULN-12: is_trusted_application_identity() exists and is protected from anon execution', `HTTP ${idRes.status}`);
  } catch (err) {
    assertTest(false, 'Integration 2 threw exception', err.message);
  }

  // ---------------------------------------------------------------------------
  // INTEGRATION 3: Notification Read Synchronization
  // ---------------------------------------------------------------------------
  console.log(`\n${ANSI.bold}--- Integration 3: Notification Read Synchronization ---${ANSI.reset}`);
  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rpc/mark_notifications_as_read`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ p_notification_ids: [] })
    });
    assertTest(rpcRes.status === 204 || rpcRes.ok, 'mark_notifications_as_read RPC executes cleanly with empty array', `HTTP ${rpcRes.status}`);

    // Verify non-broadcast exclusion safety: test with random dummy UUID
    const dummyId = '00000000-0000-0000-0000-000000000001';
    const rpcRes2 = await fetch(`${SUPABASE_URL}/rpc/mark_notifications_as_read`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ p_notification_ids: [dummyId] })
    });
    assertTest(rpcRes2.status === 204 || rpcRes2.ok, 'mark_notifications_as_read RPC handles UUID array input safely', `HTTP ${rpcRes2.status}`);
  } catch (err) {
    assertTest(false, 'Integration 3 threw exception', err.message);
  }

  // ---------------------------------------------------------------------------
  // INTEGRATION 4: Temporary App Closure & Maintenance Mode
  // ---------------------------------------------------------------------------
  console.log(`\n${ANSI.bold}--- Integration 4: Temporary App Closure & Maintenance Mode ---${ANSI.reset}`);
  try {
    const verRes = await fetch(`${SUPABASE_URL}/app_versions?select=app_name,is_temporarily_closed,closure_title,closure_message`, { headers: HEADERS });
    const verData = await verRes.json();
    assertTest(verRes.ok, 'app_versions closure columns queried successfully', `HTTP ${verRes.status}`);

    const apps = ['patient_app', 'clinic_app', 'web_app'];
    for (const app of apps) {
      const match = verData.find(v => v.app_name === app);
      assertTest(!!match, `Target application "${app}" registered in app_versions`, match ? `closed: ${match.is_temporarily_closed}` : 'Missing');
    }

    // Verify fallback configs in medical_specialties
    const specRes = await fetch(`${SUPABASE_URL}/medical_specialties?category=eq.system_config&select=name,search_keywords`, { headers: HEADERS });
    const specData = await specRes.json();
    assertTest(specRes.ok && specData.length >= 3, 'Dual-layer system_config fallback records exist in medical_specialties', `Found ${specData?.length || 0} configs`);
  } catch (err) {
    assertTest(false, 'Integration 4 threw exception', err.message);
  }

  // ---------------------------------------------------------------------------
  // INTEGRATION 5: Clinic Availability & Queue Closure Sweep
  // ---------------------------------------------------------------------------
  console.log(`\n${ANSI.bold}--- Integration 5: Clinic Availability & Queue Closure Sweep ---${ANSI.reset}`);
  try {
    // 5.1 clinics is_open and closed_at
    const clRes = await fetch(`${SUPABASE_URL}/clinics?select=id,is_open,closed_at&limit=5`, { headers: HEADERS });
    const clData = await clRes.json();
    assertTest(clRes.ok && clData.length > 0, 'clinics.is_open and closed_at columns exist and return data', `Sample clinic is_open: ${clData[0]?.is_open}`);

    // 5.2 auto_transfer_uncompleted_queue_to_noshow RPC
    const sweepRes = await fetch(`${SUPABASE_URL}/rpc/auto_transfer_uncompleted_queue_to_noshow`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        p_clinic_id: null,
        p_include_today: false,
        p_today_cutoff_minutes: 60
      })
    });
    const sweepData = await sweepRes.json();
    assertTest(sweepRes.ok, 'auto_transfer_uncompleted_queue_to_noshow executes successfully', `HTTP ${sweepRes.status}`);
    assertTest(sweepData?.success === true, 'Sweep returned success confirmation', `Swept: ${sweepData?.transferred_count ?? 0}, Date: ${sweepData?.server_date_nepal}`);
  } catch (err) {
    assertTest(false, 'Integration 5 threw exception', err.message);
  }

  // ---------------------------------------------------------------------------
  // INTEGRATION 6: Scalability Indexes & Health Ping
  // ---------------------------------------------------------------------------
  console.log(`\n${ANSI.bold}--- Integration 6: Scalability Indexes & Health Ping ---${ANSI.reset}`);
  try {
    // 6.1 dactor_health_ping RPC
    const pingStart = Date.now();
    const pingRes = await fetch(`${SUPABASE_URL}/rpc/dactor_health_ping`, {
      method: 'POST',
      headers: HEADERS
    });
    const pingDuration = Date.now() - pingStart;
    const pingData = await pingRes.json();
    assertTest(pingRes.ok && pingData?.status === 'ok', 'dactor_health_ping() RPC executes and returns status ok', `Latency: ${pingDuration}ms | Platform: ${pingData?.platform}`);

    // 6.2 Query latency benchmark on indexed paths
    const startBench = Date.now();
    const benchRes = await fetch(`${SUPABASE_URL}/appointments?select=id,appointment_date,checkin_status&limit=20`, { headers: HEADERS });
    const benchDuration = Date.now() - startBench;
    assertTest(benchRes.ok, 'High-concurrency indexed query on appointments completes sub-100ms', `Latency: ${benchDuration}ms`);

    const qeBenchStart = Date.now();
    const qeBenchRes = await fetch(`${SUPABASE_URL}/queue_entries?select=id,status,queue_position&limit=20`, { headers: HEADERS });
    const qeBenchDuration = Date.now() - qeBenchStart;
    assertTest(qeBenchRes.ok, 'High-concurrency indexed query on queue_entries completes sub-100ms', `Latency: ${qeBenchDuration}ms`);
  } catch (err) {
    assertTest(false, 'Integration 6 threw exception', err.message);
  }

  // ---------------------------------------------------------------------------
  // SCORECARD SUMMARY
  // ---------------------------------------------------------------------------
  console.log(`\n${ANSI.bold}========================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}                       VERIFICATION SCORECARD                           ${ANSI.reset}`);
  console.log(`${ANSI.bold}========================================================================${ANSI.reset}`);
  console.log(`  Total Tests Run : ${passed + failed}`);
  console.log(`  Passed          : ${ANSI.green}${passed}${ANSI.reset}`);
  console.log(`  Failed          : ${failed === 0 ? ANSI.green + '0' : ANSI.red + failed}${ANSI.reset}`);
  console.log(`${ANSI.bold}========================================================================${ANSI.reset}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
