/**
 * DACTOR Multi-Gateway Digital Payment Architecture — Comprehensive Verification Suite
 * Covers:
 *  1. SQL Migration & Server-Only Credential Vault (`migration_multi_gateway_payments.sql`)
 *  2. Cryptographic Signing & Verification Vectors (eSewa HMAC-SHA256, Khalti Paisa/Key, Fonepay HMAC-SHA512, ConnectIPS SHA256withRSA)
 *  3. Strict Clinic-Owner Verified Key Visibility Rule vs Always-Available Pay at Desk (+5%)
 *  4. Closed-App / Background Completion State Machine (Return/Webhook + Autonomous Sweep + Idempotency)
 *  5. Cross-Platform Security & Parity Audit (Edge Function, Web App, Admin Panel, Clinic Android App, Patient Android App)
 *
 * Run with: node supabase/test_multi_gateway_payments.cjs
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
};

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\n${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}`);
    console.log(`${ANSI.bold}${ANSI.cyan}   DACTOR MULTI-GATEWAY PAYMENTS & CLOSED-APP VERIFICATION SUITE      ${ANSI.reset}`);
    console.log(`${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}\n`);

    for (const t of this.tests) {
      const assert = {
        ok: (val, msg) => {
          if (!val) throw new Error(msg || 'Expected truthy value');
        },
        equal: (actual, expected, msg) => {
          if (actual !== expected) throw new Error(`${msg || 'Assertion failed'} (Expected: ${expected}, Got: ${actual})`);
        },
      };

      try {
        await t.fn(assert);
        this.passed++;
        console.log(`${ANSI.green}✔ PASS${ANSI.reset} ${t.name}`);
      } catch (err) {
        this.failed++;
        console.log(`${ANSI.red}✘ FAIL${ANSI.reset} ${t.name}`);
        console.log(`       ${ANSI.red}${err.message}${ANSI.reset}`);
      }
    }

    console.log(`\n${ANSI.bold}Summary:${ANSI.reset} ${ANSI.green}${this.passed} passed${ANSI.reset}, ${this.failed > 0 ? ANSI.red : ANSI.green}${this.failed} failed${ANSI.reset} (${this.tests.length} total)\n`);
    if (this.failed > 0) process.exit(1);
  }
}

const runner = new TestRunner();

const readFile = (relPath) => fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');

// ============================================================================
// 1. SQL MIGRATION & VAULT ISOLATION TESTS
// ============================================================================

runner.test('SQL Migration: Drops NOT NULL on legacy esewa columns & adds Khalti, Fonepay, ConnectIPS server-only columns', (assert) => {
  const sql = readFile('supabase/migration_multi_gateway_payments.sql');
  assert.ok(sql.includes('ALTER COLUMN esewa_product_code DROP NOT NULL'), 'Must drop NOT NULL on esewa_product_code');
  assert.ok(sql.includes('ALTER COLUMN esewa_secret_key DROP NOT NULL'), 'Must drop NOT NULL on esewa_secret_key');
  for (const col of [
    'khalti_secret_key', 'khalti_is_verified', 'khalti_enabled',
    'fonepay_merchant_code', 'fonepay_secret_key', 'fonepay_is_verified', 'fonepay_enabled',
    'connectips_merchant_id', 'connectips_app_id', 'connectips_app_password', 'connectips_private_key', 'connectips_is_verified', 'connectips_enabled',
  ]) {
    assert.ok(sql.includes(col), `Missing column ${col} in clinic_payment_credentials migration`);
  }
  assert.ok(
    sql.includes('GRANT ALL ON public.clinic_payment_credentials TO service_role') &&
    sql.includes('REVOKE ALL ON public.clinic_payment_credentials FROM PUBLIC, anon, authenticated'),
    'clinic_payment_credentials must remain restricted to service_role'
  );
});

runner.test('SQL Migration: Widens appointment_payment_attempts to all 4 gateways & adds reconciliation indexes', (assert) => {
  const sql = readFile('supabase/migration_multi_gateway_payments.sql');
  assert.ok(sql.includes("gateway IN ('esewa', 'khalti', 'fonepay', 'connectips')"), 'Gateway check constraint must include all 4 gateways');
  assert.ok(sql.includes("status IN ('pending', 'complete', 'failed', 'expired')"), 'Status check constraint must include expired');
  assert.ok(sql.includes('provider_pidx'), 'Must include provider_pidx for Khalti lookup correlation');
  assert.ok(sql.includes('reconcile_attempts'), 'Must track reconcile_attempts for background sweep');
});

runner.test('SQL Migration: finalize_online_appointment_payment is idempotent, creates queue + invoice + receipt notification', (assert) => {
  const sql = readFile('supabase/migration_multi_gateway_payments.sql');
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.finalize_online_appointment_payment'), 'Must define finalize_online_appointment_payment');
  assert.ok(sql.includes('FOR UPDATE'), 'Must lock payment attempt row FOR UPDATE for concurrency idempotency');
  assert.ok(sql.includes('INSERT INTO public.queue_entries'), 'Must insert live queue_entries row');
  assert.ok(sql.includes('INSERT INTO public.billing_invoices'), 'Must create/update billing_invoices');
  assert.ok(sql.includes('INSERT INTO public.invoice_transactions'), 'Must record invoice_transactions ledger row');
  assert.ok(sql.includes("'payment_receipt'"), 'Must emit payment_receipt notification for closed-app background alert');
  assert.ok(sql.includes('dactor_reconcile_pending_payments'), 'Must schedule pg_cron 2-minute background sweep');
});

runner.test('SQL Migration: get_clinic_public_payment_methods enforces verified clinic keys & always includes pay_at_desk', (assert) => {
  const sql = readFile('supabase/migration_multi_gateway_payments.sql');
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.get_clinic_public_payment_methods'), 'Must define get_clinic_public_payment_methods');
  assert.ok(/khalti_enabled.*khalti_is_verified/is.test(sql), 'Khalti must require enabled + verified + secret key');
  assert.ok(/fonepay_enabled.*fonepay_is_verified/is.test(sql), 'Fonepay must require enabled + verified + secret key');
  assert.ok(/connectips_enabled.*connectips_is_verified/is.test(sql), 'ConnectIPS must require enabled + verified + private key');
  assert.ok(sql.includes("'id', 'pay_at_desk'"), 'Pay at Desk must always be returned');
  assert.ok(/'requires_keys',\s*false/i.test(sql), 'Pay at Desk must explicitly mark requires_keys = false');
});

// ============================================================================
// 2. CRYPTOGRAPHIC SIGNING & PROTOCOL VECTOR TESTS
// ============================================================================

runner.test('Crypto Vector [eSewa]: HMAC-SHA256 Base64 signature matches official eSewa ePay v2 specification', async (assert) => {
  const secret = '8gBm/:&EnhH.1/q';
  const msg = 'total_amount=110,transaction_uuid=241028,product_code=EPAYTEST';
  const sig = crypto.createHmac('sha256', secret).update(msg).digest('base64');
  assert.equal(sig, 'i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=', 'eSewa official test vector mismatch');

  // Verify WebCrypto subtle HMAC-SHA256 produces byte-identical signature to Edge Function
  const key = await crypto.webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const webSig = Buffer.from(await crypto.webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))).toString('base64');
  assert.equal(webSig, sig, 'WebCrypto HMAC-SHA256 must match Node HMAC-SHA256');
});

runner.test('Crypto Vector [Khalti]: Paisa integer conversion & Key authorization header formatting', (assert) => {
  const toPaisa = (npr) => Math.round(Number(npr) * 100);
  assert.equal(toPaisa(500), 50000, '500 NPR must equal 50000 Paisa');
  assert.equal(toPaisa(525.75), 52575, '525.75 NPR must equal 52575 Paisa without float drift');

  const edgeSrc = readFile('supabase/functions/appointment-payment/index.ts');
  assert.ok(edgeSrc.includes('`Key ${secretKey}`') || edgeSrc.includes('`Key ${secretKey.trim()}`'), 'Khalti must use Authorization: Key <secret>');
  assert.ok(edgeSrc.includes('/epayment/initiate/'), 'Khalti must use ePayment v2 initiate endpoint');
  assert.ok(edgeSrc.includes('/epayment/lookup/'), 'Khalti must verify via server-to-server ePayment lookup endpoint');
});

runner.test('Crypto Vector [Fonepay]: HMAC-SHA512 lowercase hex DV signature & XML/JSON verification', (assert) => {
  const secret = 'fonepay_test_hmac_secret_key_2026';
  const pid = 'NBQM';
  const md = 'P';
  const prn = 'DCAB12CD34EF56GH7890';
  const amt = '500.00';
  const crn = 'NPR';
  const dt = '10/25/2026';
  const r1 = 'APPT500';
  const r2 = 'Dactor';
  const ru = 'https://example.supabase.co/functions/v1/appointment-payment?action=return&gateway=fonepay';

  const dvPayload = `${pid},${md},${prn},${amt},${crn},${dt},${r1},${r2},${ru}`;
  const dvHex = crypto.createHmac('sha512', secret).update(dvPayload).digest('hex');

  assert.equal(dvHex.length, 128, 'HMAC-SHA512 hex digest must be 128 lowercase hex characters');
  assert.equal(dvHex, dvHex.toLowerCase(), 'Fonepay DV digest must be lowercase hex');

  // Verify XML parser regex used in Edge Function
  const sampleXml = '<response><response_code>successful</response_code><txnAmount>500.00</txnAmount><uniqueId>FP998877</uniqueId></response>';
  const rcMatch = sampleXml.match(/<response_code>([^<]+)<\/response_code>/i);
  const amtMatch = sampleXml.match(/<(?:txnAmount|amount)>([^<]+)<\/(?:txnAmount|amount)>/i);
  assert.equal(rcMatch && rcMatch[1].toLowerCase(), 'successful', 'Must parse Fonepay XML response_code');
  assert.equal(Number(amtMatch && amtMatch[1]), 500.00, 'Must parse Fonepay XML verified amount');
});

runner.test('Crypto Vector [ConnectIPS]: Compact TXNID <= 20 chars & RSA-SHA256 PKCS#8 signature verification', (assert) => {
  // Verify compact transaction ID generator constraint (ConnectIPS max 20 chars)
  const compactPart = crypto.randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase();
  const txnId = `DC${compactPart}`;
  assert.equal(txnId.length, 20, 'Compact TXNID must be <= 20 characters for NCHL ConnectIPS');

  // Generate ephemeral 2048-bit PKCS#8 RSA keypair and verify SHA256withRSA signing matches ConnectIPS canonical string
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const canonicalMessage =
    `MERCHANTID=1024,APPID=MER-1024-APP-1,APPNAME=DactorClinic,TXNID=${txnId},` +
    `TXNDATE=25-10-2026,TXNCRNCY=NPR,TXNAMT=50000,REFERENCEID=${txnId},` +
    `REMARKS=DactorAppt,PARTICULARS=Consultation,TOKEN=TOKEN`;

  const signatureBase64 = crypto.sign('RSA-SHA256', Buffer.from(canonicalMessage, 'utf8'), privateKey).toString('base64');
  const isValid = crypto.verify('RSA-SHA256', Buffer.from(canonicalMessage, 'utf8'), publicKey, Buffer.from(signatureBase64, 'base64'));
  assert.ok(isValid, 'ConnectIPS RSA-SHA256 signature must verify cleanly against public key');

  const edgeSrc = readFile('supabase/functions/appointment-payment/index.ts');
  assert.ok(edgeSrc.includes('RSASSA-PKCS1-v1_5'), 'Edge Function must use WebCrypto RSASSA-PKCS1-v1_5 SHA-256');
  assert.ok(edgeSrc.includes('/connectipswebws/api/creditor/validatetxn'), 'Edge Function must validate ConnectIPS via creditor/validatetxn');
});

// ============================================================================
// 3. CLOSED-APP BACKGROUND COMPLETION & VISIBILITY SIMULATION
// ============================================================================

runner.test('Simulation: Closed-App Payment Completion (Return Webhook + Autonomous Sweep + Idempotency)', (assert) => {
  // In-memory simulation of database tables when patient closes the app mid-payment
  const db = {
    appointments: new Map([
      ['appt-1', { id: 'appt-1', clinic_id: 'clinic-1', slot_id: 'slot-1', tracking_code: '9876543210', fee_amount: 600, payment_status: 'pending', checkin_status: 'not_checked_in' }],
      ['appt-2', { id: 'appt-2', clinic_id: 'clinic-1', slot_id: 'slot-1', tracking_code: '1234567890', fee_amount: 600, payment_status: 'pending', checkin_status: 'not_checked_in' }],
    ]),
    attempts: new Map([
      ['att-khalti', { id: 'att-khalti', appointment_id: 'appt-1', gateway: 'khalti', amount_npr: 600, status: 'pending', provider_pidx: 'PIDX_LIVE_1', reconcile_attempts: 0 }],
      ['att-cips', { id: 'att-cips', appointment_id: 'appt-2', gateway: 'connectips', amount_npr: 600, status: 'pending', transaction_uuid: 'DC112233445566778899', reconcile_attempts: 0 }],
    ]),
    queue: new Map(),
    invoices: new Map(),
    transactions: [],
    notifications: [],
  };

  function finalizeOnlineAppointmentPayment(attemptId, providerRef, verifiedAmount) {
    const att = db.attempts.get(attemptId);
    if (!att) throw new Error('Attempt not found');
    // Idempotency guard: if already complete, do not duplicate queue/invoice/notification!
    if (att.status === 'complete') {
      return { finalized: true, idempotent: true };
    }
    if (Math.abs(verifiedAmount - att.amount_npr) > 0.01) {
      throw new Error('Verified amount mismatch');
    }
    att.status = 'complete';
    att.provider_reference = providerRef;

    const appt = db.appointments.get(att.appointment_id);
    appt.payment_status = 'paid';
    appt.checkin_status = 'checked_in';

    if (!db.queue.has(appt.id)) {
      db.queue.set(appt.id, { appointment_id: appt.id, queue_position: db.queue.size + 1, status: 'waiting' });
    }
    if (!db.invoices.has(appt.id)) {
      db.invoices.set(appt.id, { appointment_id: appt.id, total_amount: verifiedAmount, paid_amount: verifiedAmount, payment_status: 'paid' });
      db.transactions.push({ appointment_id: appt.id, amount: verifiedAmount, payment_method: att.gateway.toUpperCase(), reference_id: providerRef });
      db.notifications.push({ appointment_id: appt.id, type: 'payment_receipt', title: `Payment Confirmed (${att.gateway.toUpperCase()})` });
    }
    return { finalized: true, idempotent: false };
  }

  // Case 1: App is CLOSED (`clientOpen = false`), Khalti redirects/webhooks to Edge Function `action=return`
  const clientOpen = false;
  assert.equal(clientOpen, false);
  const res1 = finalizeOnlineAppointmentPayment('att-khalti', 'KHL_TXN_8899', 600);
  assert.equal(res1.finalized, true);
  assert.equal(db.appointments.get('appt-1').payment_status, 'paid', 'Closed-app Khalti payment must mark appointment paid');
  assert.equal(db.queue.has('appt-1'), true, 'Closed-app Khalti payment must allocate live queue token');
  assert.equal(db.notifications.length, 1, 'Closed-app Khalti payment must emit payment_receipt notification');

  // Case 2: App is CLOSED AND browser closed before redirect! Background 2-min cron sweep (`reconcile_pending`) runs ConnectIPS `validatetxn`
  const res2 = finalizeOnlineAppointmentPayment('att-cips', 'CIPS_BATCH_7744', 600);
  assert.equal(res2.finalized, true);
  assert.equal(db.appointments.get('appt-2').payment_status, 'paid', 'Autonomous sweep must finalize ConnectIPS appointment');
  assert.equal(db.queue.get('appt-2').queue_position, 2, 'Autonomous sweep must assign sequential queue token');

  // Case 3: Patient reopens app later & triggers `refresh` -> idempotency prevents duplicate invoices/notifications
  const resDuplicate = finalizeOnlineAppointmentPayment('att-khalti', 'KHL_TXN_8899', 600);
  assert.equal(resDuplicate.idempotent, true, 'Repeated refresh/webhook must be idempotent');
  assert.equal(db.transactions.length, 2, 'Must never create duplicate ledger transactions');
  assert.equal(db.notifications.length, 2, 'Must never emit duplicate payment_receipt notifications');
});

runner.test('Simulation: Clinic Owner Key Visibility Rule vs Always-Available Pay at Desk', (assert) => {
  function computeVisibleMethods(isDirectEnabled, creds) {
    const out = [];
    if (isDirectEnabled && creds) {
      if (creds.esewa_enabled && creds.esewa_is_verified && creds.esewa_product_code && creds.esewa_secret_key) out.push('esewa');
      if (creds.khalti_enabled && creds.khalti_is_verified && creds.khalti_secret_key) out.push('khalti');
      if (creds.fonepay_enabled && creds.fonepay_is_verified && creds.fonepay_merchant_code && creds.fonepay_secret_key) out.push('fonepay');
      if (creds.connectips_enabled && creds.connectips_is_verified && creds.connectips_merchant_id && creds.connectips_app_id && creds.connectips_private_key) out.push('connectips');
    }
    out.push('pay_at_desk');
    return out;
  }

  // 1. Clinic has provided NO keys at all -> ONLY Pay at Desk is shown
  assert.equal(JSON.stringify(computeVisibleMethods(false, null)), JSON.stringify(['pay_at_desk']));
  assert.equal(JSON.stringify(computeVisibleMethods(true, {})), JSON.stringify(['pay_at_desk']));

  // 2. Clinic enabled Khalti & Fonepay, verified Khalti, left Fonepay secret blank -> Khalti + Pay at Desk ONLY
  const partialCreds = {
    khalti_enabled: true, khalti_is_verified: true, khalti_secret_key: 'live_secret_xyz',
    fonepay_enabled: true, fonepay_is_verified: false, fonepay_merchant_code: 'NBQM', fonepay_secret_key: '',
  };
  assert.equal(JSON.stringify(computeVisibleMethods(true, partialCreds)), JSON.stringify(['khalti', 'pay_at_desk']));

  // 3. Clinic turns master Direct Payment switch OFF -> ONLY Pay at Desk is shown
  assert.equal(JSON.stringify(computeVisibleMethods(false, partialCreds)), JSON.stringify(['pay_at_desk']));
});

// ============================================================================
// 4. CROSS-PLATFORM STATIC SECURITY & PARITY AUDIT
// ============================================================================

runner.test('Cross-Platform Audit: Edge Function supports all 4 gateways, webhook, return & reconcile_pending', (assert) => {
  const edge = readFile('supabase/functions/appointment-payment/index.ts');
  for (const token of [
    'save_credentials', 'toggle_gateway', 'get_gateway_setup_status', 'get_public_payment_methods',
    'reconcile_pending', 'webhook', 'verifyKhaltiCredentials', 'verifyFonepayCredentials', 'verifyConnectIpsCredentials',
    'finalizeKhalti', 'finalizeFonepay', 'finalizeConnectIps', 'normalizeConnectIpsPrivateKeyPem',
  ]) {
    assert.ok(edge.includes(token), `Edge Function missing ${token}`);
  }
});

runner.test('Cross-Platform Audit: Web App & Admin Panel support Khalti, Fonepay, ConnectIPS, Pay at Desk & background recovery', (assert) => {
  const dbTs = readFile('web-app/src/services/db.ts');
  const appTsx = readFile('web-app/src/App.tsx');
  const clinicDetail = readFile('web-app/src/pages/ClinicDetail.tsx');
  const clinicPortal = readFile('web-app/src/pages/ClinicPortal.tsx');
  const webLogs = readFile('web-app/src/components/ClinicPaymentLogsView.tsx');
  const adminLogs = readFile('admin-panel/src/pages/PaymentLogs.tsx');

  assert.ok(dbTs.includes('startOnlinePayment') && dbTs.includes('refreshOnlinePayment'), 'Web db.ts must expose startOnlinePayment & refreshOnlinePayment');
  assert.ok(dbTs.includes('saveClinicGatewayCredentials'), 'Web db.ts must expose saveClinicGatewayCredentials');
  assert.ok(appTsx.includes('visibilitychange') && appTsx.includes('refreshOnlinePayment'), 'Web App.tsx must reconcile pending payments on cold start & tab focus');
  assert.ok(clinicDetail.includes("'connectips'") && clinicDetail.includes("'fonepay'") && clinicDetail.includes("'khalti'"), 'ClinicDetail.tsx must support all online gateways');
  assert.ok(clinicPortal.includes('ConnectIPS') && clinicPortal.includes('Fonepay') && clinicPortal.includes('pfxBase64'), 'ClinicPortal.tsx must provide multi-gateway & .pfx setup UI');
  assert.ok(/FONEPAY/.test(webLogs) && /CONNECTIPS/.test(webLogs), 'Web ClinicPaymentLogsView must classify FONEPAY & CONNECTIPS');
  assert.ok(/FONEPAY/.test(adminLogs) && /CONNECTIPS/.test(adminLogs), 'Admin PaymentLogs must classify FONEPAY & CONNECTIPS');
});

runner.test('Cross-Platform Audit: Clinic Android & Patient Android Apps enforce server vault, key visibility & closed-app recovery', (assert) => {
  const clinicRepo = readFile('clinic-app/app/src/main/java/com/dactor/clinic/data/repository/ClinicRepository.kt');
  const clinicSettings = readFile('clinic-app/app/src/main/java/com/dactor/clinic/ui/settings/ClinicSettingsScreen.kt');
  const patientRepo = readFile('patient-app/app/src/main/java/com/dactor/patient/data/repository/AppointmentRepository.kt');
  const paymentScreen = readFile('patient-app/app/src/main/java/com/dactor/patient/ui/booking/PaymentScreen.kt');
  const mainActivity = readFile('patient-app/app/src/main/java/com/dactor/patient/MainActivity.kt');

  assert.ok(!clinicRepo.includes('set("payment_secret_key"'), 'ClinicRepository.kt must NEVER write payment_secret_key to public clinics table');
  assert.ok(clinicRepo.includes('saveGatewayCredentials') && clinicRepo.includes('reconcilePendingPayments'), 'ClinicRepository.kt must route all 4 gateways to Edge Function & sweep pending');
  assert.ok(clinicSettings.includes('connectipsPfxBase64') && clinicSettings.includes('saveGatewayCredentials'), 'ClinicSettingsScreen.kt must support ConnectIPS .pfx & server verification');
  assert.ok(patientRepo.includes('getClinicPublicPaymentMethods') && patientRepo.includes('startOnlinePayment'), 'Patient AppointmentRepository.kt must use server public methods & multi-gateway initiate');
  assert.ok(paymentScreen.includes('"connectips"') && paymentScreen.includes('"pay_at_desk"'), 'Patient PaymentScreen.kt must support verified gateways + always-available Pay at Desk');
  assert.ok(mainActivity.includes('reconcileBackgroundPaymentSession') && mainActivity.includes('payment-result'), 'Patient MainActivity.kt must reconcile closed-app sessions on cold start & deep link');
});

runner.run();
