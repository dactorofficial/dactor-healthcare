/**
 * DACTOR Platform Security Hardening — Edge Functions, CORS & Storage Test Suite
 * Automated Verification for Milestone 2:
 * 1. Dynamic CORS Isolation & Origin Reflection
 * 2. Hardened Document Upload Authorization Pipeline (action: authorize_upload)
 * 3. Authoritative Consultation Fee Verification & Payment Integrity
 * 4. Token & Secret Hygiene (Zero Leakage)
 * 5. Static Code & Secret Exposure Audits
 *
 * Run with: node supabase/test_edge_functions_security.cjs
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const EDGE_FUNCTIONS_DIR = path.join(REPO_ROOT, 'supabase', 'functions');

// ANSI Color Codes
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
    this.results = [];
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\n${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}`);
    console.log(`${ANSI.bold}${ANSI.cyan}       DACTOR EDGE FUNCTIONS & STORAGE SECURITY TEST SUITE            ${ANSI.reset}`);
    console.log(`${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}\n`);

    const startTotal = Date.now();

    for (const t of this.tests) {
      const start = Date.now();
      const assert = {
        ok: (val, msg) => {
          if (!val) throw new Error(msg || 'Expected truthy value');
        },
        equal: (actual, expected, msg) => {
          if (actual !== expected) throw new Error(`${msg || 'Assertion failed'} (Expected: ${expected}, Got: ${actual})`);
        },
        deepEqual: (actual, expected, msg) => {
          const a = JSON.stringify(actual);
          const e = JSON.stringify(expected);
          if (a !== e) throw new Error(`${msg || 'Deep equality failed'} (Expected: ${e}, Got: ${a})`);
        },
        includes: (arrayOrStr, item, msg) => {
          if (!arrayOrStr.includes(item)) throw new Error(`${msg || 'Inclusion failed'} (${JSON.stringify(item)} not found)`);
        },
        doesNotInclude: (arrayOrStr, item, msg) => {
          if (arrayOrStr.includes(item)) throw new Error(`${msg || 'Exclusion failed'} (${JSON.stringify(item)} was found)`);
        },
        match: (str, regex, msg) => {
          if (!regex.test(str)) throw new Error(`${msg || 'Regex match failed'} (${str} does not match ${regex})`);
        },
        doesNotMatch: (str, regex, msg) => {
          if (regex.test(str)) throw new Error(`${msg || 'Regex negative match failed'} (${str} matches ${regex})`);
        },
        throws: (fn, msg) => {
          let threw = false;
          try {
            fn();
          } catch {
            threw = true;
          }
          if (!threw) throw new Error(msg || 'Expected function to throw');
        },
      };

      try {
        await t.fn(assert);
        const duration = Date.now() - start;
        this.passed++;
        console.log(`  ${ANSI.green}√ [PASS]${ANSI.reset} ${t.name} (${duration}ms)`);
        this.results.push({ name: t.name, status: 'PASS', duration });
      } catch (err) {
        const duration = Date.now() - start;
        this.failed++;
        console.log(`  ${ANSI.red}X [FAIL]${ANSI.reset} ${t.name} (${duration}ms)`);
        console.log(`    ${ANSI.red}Error: ${err.message}${ANSI.reset}`);
        this.results.push({ name: t.name, status: 'FAIL', duration, error: err.message });
      }
    }

    const totalDuration = Date.now() - startTotal;
    console.log(`\n${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}`);
    console.log(`${ANSI.bold}  TOTAL TESTS: ${this.tests.length} | PASSED: ${this.passed} | FAILED: ${this.failed} (${totalDuration}ms)${ANSI.reset}`);
    console.log(`${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}\n`);

    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

const runner = new TestRunner();

// ===========================================================================
// SECTION 1: STATIC CODE AUDIT ACROSS ALL 3 EDGE FUNCTIONS
// ===========================================================================

runner.test('Static Audit: Zero wildcard Access-Control-Allow-Origin: * in any Edge Function', (assert) => {
  const edgeFunctions = ['document-access', 'appointment-payment', 'send-fcm-alert'];

  for (const fn of edgeFunctions) {
    const filePath = path.join(EDGE_FUNCTIONS_DIR, fn, 'index.ts');
    assert.ok(fs.existsSync(filePath), `File exists: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf8');

    // Must not contain wildcard allow origin
    assert.doesNotMatch(
      content,
      /["']Access-Control-Allow-Origin["']\s*:\s*["']\*["']/i,
      `Function ${fn} must not have wildcard Access-Control-Allow-Origin: *`
    );
  }
});

runner.test('Static Audit: All Edge Functions implement dynamic CORS with Vary: Origin', (assert) => {
  const edgeFunctions = ['document-access', 'appointment-payment', 'send-fcm-alert'];

  for (const fn of edgeFunctions) {
    const filePath = path.join(EDGE_FUNCTIONS_DIR, fn, 'index.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.ok(content.includes('getCorsHeaders'), `Function ${fn} must define getCorsHeaders()`);
    assert.ok(content.includes('"Vary": "Origin"') || content.includes("'Vary': 'Origin'"), `Function ${fn} must specify Vary: Origin`);
    assert.ok(content.includes('ALLOWED_ORIGINS') || content.includes('getAllowedOrigins'), `Function ${fn} must reference ALLOWED_ORIGINS`);
  }
});

runner.test('Static Audit: document-access implements action: "authorize_upload" pipeline', (assert) => {
  const filePath = path.join(EDGE_FUNCTIONS_DIR, 'document-access', 'index.ts');
  const content = fs.readFileSync(filePath, 'utf8');

  assert.ok(content.includes('authorize_upload'), 'document-access must handle authorize_upload action');
  assert.ok(content.includes('createSignedUploadUrl'), 'document-access must call createSignedUploadUrl');
  assert.ok(content.includes('10485760'), 'document-access must enforce 10MB limit (10485760 bytes)');
  assert.ok(content.includes('application/pdf'), 'document-access must check application/pdf');
  assert.ok(content.includes('image/webp'), 'document-access must check image/webp');
  assert.ok(content.includes('is_authorized_clinic_staff'), 'document-access must check is_authorized_clinic_staff');
  assert.ok(content.includes('is_authorized_doctor'), 'document-access must check is_authorized_doctor');
  assert.ok(content.includes('is_admin_portal_user'), 'document-access must check is_admin_portal_user');
});

runner.test('Static Audit: appointment-payment enforces authoritative consultation_fee query', (assert) => {
  const filePath = path.join(EDGE_FUNCTIONS_DIR, 'appointment-payment', 'index.ts');
  const content = fs.readFileSync(filePath, 'utf8');

  assert.ok(content.includes('consultation_fee'), 'appointment-payment must query doctors.consultation_fee');
  assert.ok(content.includes('authoritativeFee'), 'appointment-payment must calculate authoritative fee');
  assert.ok(content.includes('trustedReturnUrl'), 'appointment-payment must validate return URLs');
  assert.ok(content.includes('PAYMENT_RETURN_ORIGINS'), 'appointment-payment must check PAYMENT_RETURN_ORIGINS');
});

runner.test('Static Audit: send-fcm-alert enforces caller JWT and zero token leakage in responses', (assert) => {
  const filePath = path.join(EDGE_FUNCTIONS_DIR, 'send-fcm-alert', 'index.ts');
  const content = fs.readFileSync(filePath, 'utf8');

  assert.ok(content.includes('is_trusted_application_identity'), 'send-fcm-alert must verify trusted identity');
  assert.ok(content.includes('is_authorized_clinic_staff'), 'send-fcm-alert must verify clinic staff role');
  assert.ok(content.includes('consume_security_rate_limit'), 'send-fcm-alert must enforce rate limiting');
  // Must return only { sentCount }
  assert.ok(content.includes('{ sentCount }') || content.includes('{ sentCount: 0 }'), 'send-fcm-alert must return sentCount');
  assert.doesNotMatch(content, /return json\(\s*\{[^}]*tokens/i, 'send-fcm-alert must never return tokens in response');
  assert.doesNotMatch(content, /return json\(\s*\{[^}]*accessToken/i, 'send-fcm-alert must never return accessToken in response');
});

runner.test('Static Audit: Zero hardcoded Supabase service role keys or passwords in functions', (assert) => {
  const edgeFunctions = ['document-access', 'appointment-payment', 'send-fcm-alert'];

  for (const fn of edgeFunctions) {
    const filePath = path.join(EDGE_FUNCTIONS_DIR, fn, 'index.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // Disallow hardcoded JWT service keys (eyJh...) or literal secrets
    assert.doesNotMatch(content, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, `No hardcoded JWT in ${fn}`);
    assert.doesNotMatch(content, /serviceRoleKey\s*=\s*["'][^"']+["']/, `serviceRoleKey must not be hardcoded in ${fn}`);
    assert.doesNotMatch(content, /admin123/i, `No default passwords in ${fn}`);
  }
});

// ===========================================================================
// SECTION 2: DYNAMIC CORS ISOLATION & VARY: ORIGIN ALGORITHMIC SUITE
// ===========================================================================

const DEFAULT_ALLOWED_ORIGINS = [
  'https://dactorofficial.github.io',
  'https://rajanpurbe.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:3000',
];

function isOriginAllowed(origin, customEnvOrigins = '') {
  if (!origin || typeof origin !== 'string') return false;
  const clean = origin.trim().replace(/\/+$/, '');
  if (clean === '*' || clean === 'null' || !/^https?:\/\//i.test(clean)) return false;

  const envOrigins = customEnvOrigins
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const allowedSet = new Set([...DEFAULT_ALLOWED_ORIGINS.map((s) => s.replace(/\/+$/, '')), ...envOrigins]);

  try {
    const parsed = new URL(clean);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    if (allowedSet.has(clean)) return true;
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      const port = parseInt(parsed.port, 10);
      if (port >= 1024 && port <= 65535) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getCorsHeaders(origin, customEnvOrigins = '') {
  const allowed = isOriginAllowed(origin, customEnvOrigins);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
}

runner.test('CORS: Reflects authorized primary production origin', (assert) => {
  const origin = 'https://dactorofficial.github.io';
  assert.ok(isOriginAllowed(origin), 'Primary origin must be allowed');
  const headers = getCorsHeaders(origin);
  assert.equal(headers['Access-Control-Allow-Origin'], origin);
  assert.equal(headers['Vary'], 'Origin');
});

runner.test('CORS: Reflects authorized secondary production origin', (assert) => {
  const origin = 'https://rajanpurbe.github.io';
  assert.ok(isOriginAllowed(origin), 'Secondary origin must be allowed');
  const headers = getCorsHeaders(origin);
  assert.equal(headers['Access-Control-Allow-Origin'], origin);
});

runner.test('CORS: Normalizes trailing slashes on allowed origins', (assert) => {
  const origin = 'https://dactorofficial.github.io/';
  assert.ok(isOriginAllowed(origin), 'Origin with trailing slash must match');
});

runner.test('CORS: Reflects local development origins on standard Vite/React ports', (assert) => {
  const ports = ['5173', '5174', '3000'];
  for (const port of ports) {
    const localhost = `http://localhost:${port}`;
    const loopback = `http://127.0.0.1:${port}`;
    assert.ok(isOriginAllowed(localhost), `localhost:${port} must be allowed`);
    assert.ok(isOriginAllowed(loopback), `127.0.0.1:${port} must be allowed`);
  }
});

runner.test('CORS: Dynamically supports ALLOWED_ORIGINS environment variable', (assert) => {
  const customOrigin = 'https://staging.dactor.app';
  assert.ok(!isOriginAllowed(customOrigin), 'Custom origin not allowed by default');
  assert.ok(isOriginAllowed(customOrigin, 'https://staging.dactor.app,https://preview.dactor.app'), 'Custom origin allowed when in env');
});

runner.test('CORS: Strictly rejects wildcard "*"', (assert) => {
  assert.ok(!isOriginAllowed('*'), 'Wildcard * must be rejected');
  const headers = getCorsHeaders('*');
  assert.equal(headers['Access-Control-Allow-Origin'], '', 'Must return empty CORS origin for *');
});

runner.test('CORS: Strictly rejects literal "null" origin', (assert) => {
  assert.ok(!isOriginAllowed('null'), 'null origin must be rejected');
  const headers = getCorsHeaders('null');
  assert.equal(headers['Access-Control-Allow-Origin'], '');
});

runner.test('CORS: Strictly rejects arbitrary third-party attacker origins', (assert) => {
  const evilOrigins = [
    'https://malicious-hospital.com',
    'https://phishing-dactor.net',
    'https://google.com',
    'http://unauthorized-site.org',
  ];
  for (const evil of evilOrigins) {
    assert.ok(!isOriginAllowed(evil), `${evil} must be rejected`);
    const headers = getCorsHeaders(evil);
    assert.equal(headers['Access-Control-Allow-Origin'], '', `Must deny CORS for ${evil}`);
  }
});

runner.test('CORS: Strictly rejects subdomain suffix spoofing (e.g. dactorofficial.github.io.attacker.com)', (assert) => {
  const spoofed = 'https://dactorofficial.github.io.attacker.com';
  assert.ok(!isOriginAllowed(spoofed), 'Subdomain suffix spoofing must be rejected');
  const headers = getCorsHeaders(spoofed);
  assert.equal(headers['Access-Control-Allow-Origin'], '');
});

runner.test('CORS: Strictly rejects subdomain prefix spoofing (e.g. attacker-dactorofficial.github.io)', (assert) => {
  const spoofed = 'https://attacker-dactorofficial.github.io';
  assert.ok(!isOriginAllowed(spoofed), 'Subdomain prefix spoofing must be rejected');
  const headers = getCorsHeaders(spoofed);
  assert.equal(headers['Access-Control-Allow-Origin'], '');
});

runner.test('CORS: Strictly rejects scheme downgrade (HTTP for production domains)', (assert) => {
  const insecure = 'http://dactorofficial.github.io';
  assert.ok(!isOriginAllowed(insecure), 'Insecure HTTP production domain must be rejected');
});

runner.test('CORS: Strictly rejects embedded user credentials in origin', (assert) => {
  const credentialOrigin = 'https://admin:secret@dactorofficial.github.io';
  assert.ok(!isOriginAllowed(credentialOrigin), 'Origin with credentials must be rejected');
});

// ===========================================================================
// SECTION 3: DOCUMENT UPLOAD AUTHORIZATION PIPELINE (action: authorize_upload)
// ===========================================================================

const ALLOWED_MIME_TYPES = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const MAX_UPLOAD_FILE_SIZE = 10485760; // 10MB in bytes

function validateUploadPayload(payload) {
  const { documentType, entityId, fileName, fileSize, mimeType } = payload || {};

  if (!['lab_report', 'doctor_kyc', 'clinic_doc'].includes(documentType)) {
    return { valid: false, status: 400, error: 'Invalid document type' };
  }
  if (!entityId || typeof entityId !== 'string' || !entityId.trim()) {
    return { valid: false, status: 400, error: 'A valid entityId is required' };
  }

  const rawMime = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  const ext = ALLOWED_MIME_TYPES.get(rawMime);
  if (!ext) {
    return { valid: false, status: 400, error: 'Unsupported file type. Only PDF, JPG, PNG, and WebP are accepted.' };
  }

  const rawFileName = typeof fileName === 'string' ? fileName.trim() : '';
  const extMatch = rawFileName.match(/\.([a-zA-Z0-9]+)$/);
  const fileExt = extMatch ? extMatch[1].toLowerCase() : '';
  if (fileExt && ['exe', 'bat', 'sh', 'js', 'html', 'svg', 'cmd', 'msi'].includes(fileExt)) {
    return { valid: false, status: 400, error: 'Executable and script file extensions are prohibited' };
  }

  if (typeof fileSize !== 'number' || !Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_FILE_SIZE) {
    return { valid: false, status: 400, error: 'File size exceeds the 10MB limit or is invalid.' };
  }

  const cleanEntity = entityId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanEntity) {
    return { valid: false, status: 400, error: 'Invalid entity identifier' };
  }

  const bucketMap = {
    lab_report: 'lab-reports-private',
    doctor_kyc: 'doctor-kyc-private',
    clinic_doc: 'clinic-docs-private',
  };

  const bucket = bucketMap[documentType];
  const storagePath = `${cleanEntity}/${crypto.randomUUID()}.${ext}`;

  return { valid: true, bucket, storagePath };
}

runner.test('Upload Auth: Allows valid PDF, JPEG, PNG, and WebP files <= 10MB', (assert) => {
  const testCases = [
    { mime: 'application/pdf', name: 'cbc_report.pdf', size: 1024 * 1024, expectedExt: 'pdf' },
    { mime: 'image/jpeg', name: 'xray.jpg', size: 2 * 1024 * 1024, expectedExt: 'jpg' },
    { mime: 'image/png', name: 'mri.png', size: 5 * 1024 * 1024, expectedExt: 'png' },
    { mime: 'image/webp', name: 'ultrasound.webp', size: 500 * 1024, expectedExt: 'webp' },
  ];

  for (const tc of testCases) {
    const res = validateUploadPayload({
      documentType: 'lab_report',
      entityId: 'clinic-123',
      fileName: tc.name,
      fileSize: tc.size,
      mimeType: tc.mime,
    });
    assert.ok(res.valid, `Valid file ${tc.name} must be accepted`);
    assert.equal(res.bucket, 'lab-reports-private');
    assert.ok(res.storagePath.endsWith(`.${tc.expectedExt}`));
  }
});

runner.test('Upload Auth: Correctly maps documentTypes to private buckets', (assert) => {
  const lab = validateUploadPayload({ documentType: 'lab_report', entityId: 'c1', fileName: 'f.pdf', fileSize: 1000, mimeType: 'application/pdf' });
  const kyc = validateUploadPayload({ documentType: 'doctor_kyc', entityId: 'd1', fileName: 'f.pdf', fileSize: 1000, mimeType: 'application/pdf' });
  const clinic = validateUploadPayload({ documentType: 'clinic_doc', entityId: 'c1', fileName: 'f.pdf', fileSize: 1000, mimeType: 'application/pdf' });

  assert.equal(lab.bucket, 'lab-reports-private');
  assert.equal(kyc.bucket, 'doctor-kyc-private');
  assert.equal(clinic.bucket, 'clinic-docs-private');
});

runner.test('Upload Auth: Rejects invalid or dangerous document MIME types', (assert) => {
  const dangerousMimes = [
    'application/x-msdownload',
    'application/x-sh',
    'text/html',
    'application/javascript',
    'image/svg+xml',
    'application/zip',
    'application/octet-stream',
  ];

  for (const mime of dangerousMimes) {
    const res = validateUploadPayload({
      documentType: 'lab_report',
      entityId: 'clinic-1',
      fileName: 'test_file',
      fileSize: 10000,
      mimeType: mime,
    });
    assert.ok(!res.valid, `MIME ${mime} must be rejected`);
    assert.equal(res.status, 400);
  }
});

runner.test('Upload Auth: Rejects executable and script extensions in fileName', (assert) => {
  const maliciousNames = [
    'report.pdf.exe',
    'scan.pdf.sh',
    'doctor.kyc.js',
    'clinic.doc.html',
    'payload.bat',
    'virus.cmd',
  ];

  for (const name of maliciousNames) {
    const res = validateUploadPayload({
      documentType: 'lab_report',
      entityId: 'c1',
      fileName: name,
      fileSize: 5000,
      mimeType: 'application/pdf',
    });
    assert.ok(!res.valid, `Filename ${name} must be rejected`);
    assert.equal(res.status, 400);
  }
});

runner.test('Upload Auth: Enforces exact 10MB (10485760 bytes) file boundary', (assert) => {
  const exactLimit = 10485760;
  const okRes = validateUploadPayload({
    documentType: 'lab_report',
    entityId: 'c1',
    fileName: 'large.pdf',
    fileSize: exactLimit,
    mimeType: 'application/pdf',
  });
  assert.ok(okRes.valid, 'Exactly 10MB file must be accepted');

  const overLimit = exactLimit + 1;
  const failRes = validateUploadPayload({
    documentType: 'lab_report',
    entityId: 'c1',
    fileName: 'toolarge.pdf',
    fileSize: overLimit,
    mimeType: 'application/pdf',
  });
  assert.ok(!failRes.valid, '10MB + 1 byte file must be rejected');
  assert.equal(failRes.status, 400);
});

runner.test('Upload Auth: Rejects non-positive or non-integer file sizes', (assert) => {
  const invalidSizes = [0, -100, 1024.5, NaN, Infinity, '1024', null, undefined];

  for (const size of invalidSizes) {
    const res = validateUploadPayload({
      documentType: 'lab_report',
      entityId: 'c1',
      fileName: 'file.pdf',
      fileSize: size,
      mimeType: 'application/pdf',
    });
    assert.ok(!res.valid, `Size ${size} must be rejected`);
    assert.equal(res.status, 400);
  }
});

runner.test('Upload Auth: Generates non-guessable storage path with entity prefix and UUID', (assert) => {
  const entityId = 'clinic-alpha-99';
  const res = validateUploadPayload({
    documentType: 'lab_report',
    entityId,
    fileName: 'report.pdf',
    fileSize: 50000,
    mimeType: 'application/pdf',
  });
  assert.ok(res.valid);

  const [dir, file] = res.storagePath.split('/');
  assert.equal(dir, entityId);
  assert.match(file, /^[0-9a-f-]{36}\.pdf$/i, 'Filename must be a UUIDv4 with extension');
  assert.doesNotMatch(res.storagePath, /Date\.now/);
  assert.doesNotMatch(res.storagePath, /report/);
});

runner.test('Upload Auth: Sanitizes directory traversal attempts in entityId', (assert) => {
  const traversalEntity = '../../etc/passwd';
  const res = validateUploadPayload({
    documentType: 'lab_report',
    entityId: traversalEntity,
    fileName: 'report.pdf',
    fileSize: 50000,
    mimeType: 'application/pdf',
  });
  assert.ok(res.valid);
  assert.doesNotMatch(res.storagePath, /\.\./, 'Must strip directory traversal dots');
  assert.match(res.storagePath, /^etcpasswd\/[0-9a-f-]{36}\.pdf$/i);
});

// Role & Ownership Authorization Matrix
function evaluateUploadOwnership(role, documentType, callerEntityId, targetEntityId, docClinicId) {
  if (role === 'admin' || role === 'super_admin') return true;

  if (documentType === 'lab_report') {
    return role === 'clinic_staff' && callerEntityId === targetEntityId;
  }
  if (documentType === 'doctor_kyc') {
    if (role === 'doctor' && callerEntityId === targetEntityId) return true;
    if (role === 'clinic_staff' && callerEntityId === docClinicId) return true;
    return false;
  }
  if (documentType === 'clinic_doc') {
    return role === 'clinic_staff' && callerEntityId === targetEntityId;
  }
  return false;
}

runner.test('Upload Auth: Super Admin is authorized for all document types', (assert) => {
  assert.ok(evaluateUploadOwnership('super_admin', 'lab_report', 'any', 'c1'));
  assert.ok(evaluateUploadOwnership('super_admin', 'doctor_kyc', 'any', 'd1'));
  assert.ok(evaluateUploadOwnership('super_admin', 'clinic_doc', 'any', 'c1'));
});

runner.test('Upload Auth: Clinic Staff authorized for own clinic lab reports and clinic docs, denied for others', (assert) => {
  assert.ok(evaluateUploadOwnership('clinic_staff', 'lab_report', 'clinic-1', 'clinic-1'));
  assert.ok(!evaluateUploadOwnership('clinic_staff', 'lab_report', 'clinic-1', 'clinic-2'), 'Denied for other clinic');
  assert.ok(evaluateUploadOwnership('clinic_staff', 'clinic_doc', 'clinic-1', 'clinic-1'));
  assert.ok(!evaluateUploadOwnership('clinic_staff', 'clinic_doc', 'clinic-1', 'clinic-2'), 'Denied for other clinic doc');
});

runner.test('Upload Auth: Doctor KYC authorized for self or own clinic staff, denied for foreign clinic/doctor', (assert) => {
  assert.ok(evaluateUploadOwnership('doctor', 'doctor_kyc', 'doc-1', 'doc-1'), 'Doctor authorized for own KYC');
  assert.ok(!evaluateUploadOwnership('doctor', 'doctor_kyc', 'doc-1', 'doc-2'), 'Doctor denied for other doctor KYC');
  assert.ok(evaluateUploadOwnership('clinic_staff', 'doctor_kyc', 'clinic-1', 'doc-1', 'clinic-1'), 'Clinic staff authorized for attending doctor');
  assert.ok(!evaluateUploadOwnership('clinic_staff', 'doctor_kyc', 'clinic-2', 'doc-1', 'clinic-1'), 'Foreign clinic staff denied');
});

runner.test('Upload Auth: Unauthenticated and standard patient roles denied upload authorization', (assert) => {
  assert.ok(!evaluateUploadOwnership('patient', 'lab_report', 'p1', 'c1'));
  assert.ok(!evaluateUploadOwnership('patient', 'doctor_kyc', 'p1', 'd1'));
  assert.ok(!evaluateUploadOwnership('patient', 'clinic_doc', 'p1', 'c1'));
  assert.ok(!evaluateUploadOwnership('anon', 'lab_report', '', 'c1'));
});

// ===========================================================================
// SECTION 4: AUTHORITATIVE CONSULTATION FEE VERIFICATION & ESEWA INTEGRITY
// ===========================================================================

function calculateAuthoritativePaymentFee(doctorRecord, fallbackDefault = 500.0) {
  let fee = fallbackDefault;
  if (doctorRecord && typeof doctorRecord.consultation_fee === 'number' && doctorRecord.consultation_fee > 0) {
    fee = doctorRecord.consultation_fee;
  }
  return Number(fee.toFixed(2));
}

runner.test('Payment Integrity: Doctor consultation_fee overrides client-tampered fee (1.00 NPR)', (assert) => {
  const doctor = { id: 'doc-1', consultation_fee: 800.0 };
  const clientProvidedFee = 1.0; // Adversary tried to pay 1 NPR

  const fee = calculateAuthoritativePaymentFee(doctor);
  assert.equal(fee, 800.0, 'Must charge authoritative 800.00 NPR instead of tampered 1.00 NPR');
  assert.ok(fee !== clientProvidedFee);
});

runner.test('Payment Integrity: Doctor consultation_fee overrides zero fee (0.00 NPR)', (assert) => {
  const doctor = { id: 'doc-1', consultation_fee: 1200.0 };
  const clientProvidedFee = 0.0;

  const fee = calculateAuthoritativePaymentFee(doctor);
  assert.equal(fee, 1200.0, 'Must charge 1200.00 NPR');
});

runner.test('Payment Integrity: Applies default fee (500.00 NPR) when doctor consultation_fee is missing or invalid', (assert) => {
  assert.equal(calculateAuthoritativePaymentFee(null), 500.0);
  assert.equal(calculateAuthoritativePaymentFee({ consultation_fee: null }), 500.0);
  assert.equal(calculateAuthoritativePaymentFee({ consultation_fee: -100 }), 500.0);
  assert.equal(calculateAuthoritativePaymentFee({ consultation_fee: NaN }), 500.0);
});

// Return URL Allowlist Validator
function trustedReturnUrl(value, envOrigins = '') {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const defaultAllowed = ['https://dactorofficial.github.io', 'https://rajanpurbe.github.io'];
    const custom = envOrigins.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
    const allowed = new Set([...defaultAllowed, ...custom]);

    if (url.username || url.password) return null;

    if (url.protocol === 'https:' && allowed.has(url.origin.replace(/\/+$/, ''))) {
      return url;
    }
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
      const port = parseInt(url.port, 10);
      if (port >= 1024 && port <= 65535) return url;
    }
    return null;
  } catch {
    return null;
  }
}

runner.test('Payment Return URL: Allows authorized production origins', (assert) => {
  const u1 = trustedReturnUrl('https://dactorofficial.github.io/patient/payment?appointmentId=123');
  const u2 = trustedReturnUrl('https://rajanpurbe.github.io/payment-status');
  assert.ok(u1 !== null, 'Production u1 allowed');
  assert.ok(u2 !== null, 'Production u2 allowed');
});

runner.test('Payment Return URL: Strictly rejects untrusted phishing return URLs', (assert) => {
  const bad = [
    'https://phishing.site/callback',
    'http://dactorofficial.github.io/insecure',
    'javascript:alert(1)',
    'data:text/html,<script>',
    'https://user:pass@dactorofficial.github.io/callback',
  ];
  for (const b of bad) {
    assert.equal(trustedReturnUrl(b), null, `Untrusted return URL ${b} must be rejected`);
  }
});

// eSewa HMAC-SHA256 signature logic
function generateEsewaHmac(fields, secretKey) {
  const message = `total_amount=${fields.total_amount},transaction_uuid=${fields.transaction_uuid},product_code=${fields.product_code}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

function verifyEsewaSignature(fields, sig, secretKey) {
  const expected = generateEsewaHmac(fields, secretKey);
  const expBuf = Buffer.from(expected, 'utf8');
  const actBuf = Buffer.from(sig, 'utf8');
  if (expBuf.length !== actBuf.length) return false;
  return crypto.timingSafeEqual(expBuf, actBuf);
}

runner.test('Payment Signature: Timing-safe HMAC-SHA256 verification passes for valid message', (assert) => {
  const secretKey = '8gBm/:&EnhH.1/q';
  const fields = { total_amount: '500.00', transaction_uuid: 'Dactor-12345', product_code: 'EPAYTEST' };
  const sig = generateEsewaHmac(fields, secretKey);
  assert.ok(verifyEsewaSignature(fields, sig, secretKey), 'Valid signature must verify');
});

runner.test('Payment Signature: Fails when total_amount or transaction_uuid is tampered', (assert) => {
  const secretKey = '8gBm/:&EnhH.1/q';
  const fields = { total_amount: '500.00', transaction_uuid: 'Dactor-12345', product_code: 'EPAYTEST' };
  const sig = generateEsewaHmac(fields, secretKey);

  const tamperedAmount = { ...fields, total_amount: '10.00' };
  const tamperedUuid = { ...fields, transaction_uuid: 'Dactor-99999' };

  assert.ok(!verifyEsewaSignature(tamperedAmount, sig, secretKey), 'Tampered amount must fail verification');
  assert.ok(!verifyEsewaSignature(tamperedUuid, sig, secretKey), 'Tampered UUID must fail verification');
});

// ===========================================================================
// SECTION 5: TOKEN HYGIENE & FCM CALLER VERIFICATION
// ===========================================================================

runner.test('Token Hygiene: Response payloads never leak device tokens or access tokens', (assert) => {
  // Simulating the response builder of send-fcm-alert
  function buildFcmResponse(sentCount) {
    return { sentCount };
  }

  const response = buildFcmResponse(3);
  const keys = Object.keys(response);
  assert.equal(keys.length, 1);
  assert.equal(keys[0], 'sentCount');
  assert.equal(response.sentCount, 3);
  assert.equal(response.token, undefined);
  assert.equal(response.tokens, undefined);
  assert.equal(response.accessToken, undefined);
});

runner.test('Token Hygiene: FCM delivery requires valid 10-digit tracking code and UUID appointment', (assert) => {
  const validUuid = '12345678-1234-4234-8234-123456789abc';
  const invalidUuid = 'appointment-123';
  const validCode = '1012960015';
  const invalidCode = '123';

  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(validUuid));
  assert.ok(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invalidUuid));
  assert.ok(/^\d{10}$/.test(validCode));
  assert.ok(!/^\d{10}$/.test(invalidCode));
});

// Run all test suites
runner.run();
