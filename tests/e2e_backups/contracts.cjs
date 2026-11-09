/**
 * Interface Contracts, Schemas, Reference Oracles & Utility Validators
 * For Clinic Data Backup & Synchronization Pipeline E2E Testing.
 * Authoritative sources: PROJECT.md, ORIGINAL_REQUEST.md, TEST_INFRA.md
 */

const path = require('path');
const crypto = require('crypto');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKUP_ROOT = path.join(REPO_ROOT, 'backups', 'clinics');
const SCRATCH_STAGING_DIR = path.join(
  process.env.LOCALAPPDATA || os.tmpdir(),
  'Temp',
  'dactor_backup_staging'
);

// Standard Exit Codes
const EXIT_CODES = {
  SUCCESS: 0,
  NETWORK_OR_FATAL: 1,
  BAD_ARGS: 2,
  NOT_FOUND: 3,
  INTEGRITY_FAIL: 4
};

// 10 Clinic-Centric Relational Tables
const RELATIONAL_TABLES = [
  'clinics',
  'clinic_services',
  'clinic_catalog',
  'doctors',
  'slots',
  'appointments',
  'queue_entries',
  'billing_invoices',
  'invoice_transactions',
  'lab_reports'
];

// Storage Buckets & Categories
const STORAGE_BUCKETS = {
  clinic_photos: {
    primary: 'clinic_photos',
    fallback: 'clinic_photos',
    isPrivate: false,
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp']
  },
  clinic_docs: {
    primary: 'clinic-docs-private',
    fallback: 'clinic_docs',
    isPrivate: true,
    allowedExts: ['.pdf', '.jpg', '.jpeg', '.png']
  },
  doctor_photos: {
    primary: 'doctor_photos',
    fallback: 'doctor_photos',
    isPrivate: false,
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp']
  },
  doctor_kyc: {
    primary: 'doctor-kyc-private',
    fallback: 'doctor_kyc',
    isPrivate: true,
    allowedExts: ['.pdf', '.jpg', '.jpeg', '.png']
  },
  lab_reports: {
    primary: 'lab-reports-private',
    fallback: 'lab_reports',
    isPrivate: true,
    allowedExts: ['.pdf', '.jpg', '.png', '.dcm']
  }
};

// Secret keys targeted for redaction
const SENSITIVE_KEYS = [
  'payment_secret_key',
  'payment_api_key',
  'payment_api_secret',
  'merchant_secret',
  'secret_key',
  'private_key',
  'jwt',
  'auth_token',
  'password'
];

// Windows Reserved Device Names
const WINDOWS_RESERVED_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
];

/**
 * Normalizes date/time string, Date, or epoch number to strict ISO 8601 UTC string.
 */
function normalizeISOTimestamp(val) {
  if (val === null || val === undefined || val === '') {
    return null;
  }
  let date;
  if (val instanceof Date) {
    date = val;
  } else if (typeof val === 'number') {
    // If seconds epoch (10 digits), convert to ms
    date = val < 1e11 ? new Date(val * 1000) : new Date(val);
  } else if (typeof val === 'string') {
    date = new Date(val);
  } else {
    throw new Error(`Unsupported date type: ${typeof val}`);
  }
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${val}`);
  }
  return date.toISOString();
}

/**
 * Computes streaming or in-memory SHA-256 hash formatted as 64-char lowercase hex string.
 */
function computeSHA256(data) {
  const hash = crypto.createHash('sha256');
  if (typeof data === 'string') {
    hash.update(data, 'utf8');
  } else if (Buffer.isBuffer(data)) {
    hash.update(data);
  } else {
    hash.update(JSON.stringify(data), 'utf8');
  }
  return hash.digest('hex');
}

/**
 * Sanitizes filename for Windows filesystem and Google Drive compatibility.
 * Strips/replaces <>:"/\|?* and control characters.
 * Fixes reserved device names (CON, PRN, etc.) and trailing dots/spaces.
 */
function sanitizeFilename(name, replacement = '_') {
  if (typeof name !== 'string' || name.length === 0) {
    return 'unnamed_file';
  }

  // Remove query string only if full URL passed
  let clean = name;
  if (/^https?:\/\//i.test(clean)) {
    clean = clean.split('?')[0].split('#')[0];
  }

  // If path segments included, extract basename
  clean = path.basename(clean.replace(/\\/g, '/'));

  // Replace Windows illegal characters: < > : " / \ | ? * and ASCII 0-31
  clean = clean.replace(/[<>:"/\\|?*\x00-\x1F]/g, replacement);

  // Strip trailing spaces and dots
  clean = clean.replace(/[. ]+$/, '');

  if (clean.length === 0) {
    clean = 'unnamed_file';
  }

  // Check reserved Windows names
  const ext = path.extname(clean);
  const baseWithoutExt = path.basename(clean, ext).toUpperCase();
  if (WINDOWS_RESERVED_NAMES.includes(baseWithoutExt)) {
    clean = `${baseWithoutExt}_safe${ext}`;
  }

  // Limit max length to 255 chars
  if (clean.length > 255) {
    const extLen = ext.length;
    clean = clean.slice(0, 255 - extLen) + ext;
  }

  return clean;
}

/**
 * Cleans relative storage object paths from full Supabase URLs or signed URLs.
 */
function cleanStoragePath(rawUrlOrPath) {
  if (typeof rawUrlOrPath !== 'string' || rawUrlOrPath.trim() === '') {
    return '';
  }

  let cleaned = rawUrlOrPath.trim();

  // Strip query strings and hash anchors
  cleaned = cleaned.split('?')[0].split('#')[0];

  // Decode URI encoding if present
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Keep as is if decode fails
  }

  // Normalize slashes and eliminate multiple consecutive slashes
  cleaned = cleaned.replace(/\\/g, '/').replace(/\/+/g, '/');

  // Remove full domain and storage prefixes
  // e.g. https://xyz.supabase.co/storage/v1/object/public/<bucket>/<path>
  // e.g. /storage/v1/object/sign/<bucket>/<path>
  const storageRegex = /(?:https?:\/\/[^/]+)?(?:\/storage\/v1\/object\/(?:public|sign|authenticated)\/)([^/]+)\/(.+)$/i;
  const match = cleaned.match(storageRegex);
  if (match) {
    const bucket = match[1];
    const objectPath = match[2];
    return {
      bucket,
      relativePath: objectPath.replace(/^\/+/, '')
    };
  }

  // If format is "<bucket>/<path>"
  const parts = cleaned.replace(/^\/+/, '').split('/');
  if (parts.length > 1 && (STORAGE_BUCKETS[parts[0]] || parts[0].includes('-private'))) {
    return {
      bucket: parts[0],
      relativePath: parts.slice(1).join('/')
    };
  }

  return {
    bucket: 'unknown',
    relativePath: parts.join('/')
  };
}

/**
 * Recursively redacts sensitive keys from an object or array in-place or returning a deep clone.
 */
function redactSecrets(data, customKeys = []) {
  if (data === null || data === undefined) {
    return data;
  }

  const keysToRedact = new Set([...SENSITIVE_KEYS, ...customKeys].map((k) => k.toLowerCase()));

  function recurse(val) {
    if (val === null || val === undefined) {
      return val;
    }

    if (Array.isArray(val)) {
      return val.map((item) => recurse(item));
    }

    if (typeof val === 'object' && !(val instanceof Date)) {
      const cloned = {};
      for (const [key, value] of Object.entries(val)) {
        if (keysToRedact.has(key.toLowerCase())) {
          cloned[key] = '[REDACTED]';
        } else if (typeof value === 'string') {
          cloned[key] = redactNestedJson(value, keysToRedact);
        } else {
          cloned[key] = recurse(value);
        }
      }
      return cloned;
    }

    if (typeof val === 'string') {
      return redactNestedJson(val, keysToRedact);
    }

    return val;
  }

  return recurse(data);
}

/**
 * Redacts secrets nested inside string values (such as JSON strings, descriptions, or query strings).
 */
function redactNestedJson(strVal, keysSet = null) {
  if (typeof strVal !== 'string') {
    return strVal;
  }

  const keysToRedact = keysSet || new Set(SENSITIVE_KEYS.map((k) => k.toLowerCase()));

  // 1. Check if string contains JSON object or array
  const trimmed = strVal.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const redacted = redactSecrets(parsed, Array.from(keysToRedact));
      return JSON.stringify(redacted);
    } catch {
      // Not valid JSON, proceed to regex string replacement
    }
  }

  // 2. Check for URL query params like ?payment_secret_key=xyz or &payment_secret_key=xyz
  let result = strVal;
  for (const k of keysToRedact) {
    const queryRegex = new RegExp(`([?&]${k}=)([^&\\s"']+)`, 'gi');
    result = result.replace(queryRegex, '$1[REDACTED]');

    // Check JSON key-value pattern inside raw text e.g. "payment_secret_key": "xyz"
    const jsonKeyRegex = new RegExp(`("${k}"\\s*:\\s*)"([^"]+)"`, 'gi');
    result = result.replace(jsonKeyRegex, '$1"[REDACTED]"');
  }

  return result;
}

/**
 * Formats an array of records to RFC 4180 compliant CSV string.
 */
function toRFC4180CSV(records, headers = null) {
  if (!records) return '';
  const list = Array.isArray(records) ? records : [records];
  if (list.length === 0 || !list[0]) {
    if (headers && headers.length > 0) {
      return headers.map((h) => escapeCSVField(h)).join(',') + '\r\n';
    }
    return '';
  }

  const effectiveHeaders = headers || Object.keys(list[0]);

  const lines = [];
  // Header line
  lines.push(effectiveHeaders.map((h) => escapeCSVField(h)).join(','));

  // Data rows
  for (const record of list) {
    const row = effectiveHeaders.map((h) => {
      const val = record ? record[h] : '';
      return escapeCSVField(val);
    });
    lines.push(row.join(','));
  }

  return lines.join('\r\n') + '\r\n';
}

function escapeCSVField(val) {
  if (val === null || val === undefined) {
    return '';
  }
  let str;
  if (typeof val === 'object') {
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }

  // RFC 4180: If field contains comma, CRLF, double quote, or starts/ends with whitespace, enclose in double quotes
  const needsQuotes = str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"') || /^\s|\s$/.test(str);
  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Compliant RFC 4180 CSV parser.
 */
function parseRFC4180CSV(csvText) {
  if (typeof csvText !== 'string' || csvText.trim() === '') {
    return [];
  }

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;
  const len = csvText.length;

  while (i < len) {
    const ch = csvText[i];

    if (insideQuotes) {
      if (ch === '"') {
        if (i + 1 < len && csvText[i + 1] === '"') {
          // Escaped double quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (ch === '\r') {
        if (i + 1 < len && csvText[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else if (ch === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += ch;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];

  const headers = rows[0];
  const data = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0] === '') continue; // ignore trailing empty row
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = c < row.length ? row[c] : '';
    }
    data.push(obj);
  }

  return data;
}

/**
 * Validates a backup manifest object against specification.
 */
function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be a non-null object'] };
  }

  // Required top-level fields
  const requiredFields = ['backup_id', 'clinic_id', 'timestamp', 'generator_version', 'stats', 'files', 'checksum_algorithm'];
  for (const req of requiredFields) {
    if (!(req in manifest)) {
      errors.push(`Missing required field: ${req}`);
    }
  }

  if (manifest.checksum_algorithm !== 'SHA-256') {
    errors.push(`Invalid checksum_algorithm: expected 'SHA-256', got '${manifest.checksum_algorithm}'`);
  }

  if (!manifest.stats || typeof manifest.stats !== 'object') {
    errors.push('Manifest stats must be an object');
  } else {
    if (typeof manifest.stats.total_files !== 'number' || manifest.stats.total_files < 0) {
      errors.push('stats.total_files must be a non-negative number');
    }
    if (typeof manifest.stats.total_bytes !== 'number' || manifest.stats.total_bytes < 0) {
      errors.push('stats.total_bytes must be a non-negative number');
    }
  }

  if (!Array.isArray(manifest.files)) {
    errors.push('manifest.files must be an array');
  } else {
    for (let idx = 0; idx < manifest.files.length; idx++) {
      const f = manifest.files[idx];
      if (!f.relative_path || typeof f.relative_path !== 'string') {
        errors.push(`files[${idx}] missing relative_path`);
      }
      if (typeof f.byte_size !== 'number' || f.byte_size < 0) {
        errors.push(`files[${idx}] invalid byte_size`);
      }
      if (!f.sha256 || !/^[a-f0-9]{64}$/i.test(f.sha256)) {
        errors.push(`files[${idx}] invalid sha256 checksum`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Deterministic Mock Generator for Clinic Backup Testing.
 * Produces complete relational sets across all 10 tables.
 */
function createMockClinicBundle(clinicId = 'c1000000-0000-0000-0000-000000000001', options = {}) {
  const includeTombstones = options.includeTombstones !== false;
  const includeSecrets = options.includeSecrets !== false;
  const now = new Date('2026-10-22T12:00:00.000Z');

  const clinic = {
    id: clinicId,
    name: 'Kathmandu Central Polyclinic & Diagnostic',
    type: 'polyclinic',
    contact_phone: '+977-1-4221100',
    contact_email: 'admin@kathmandupoly.np',
    address_text: 'Bagbazar Marg 12, Kathmandu, Nepal',
    latitude: 27.7052,
    longitude: 85.3193,
    description: includeSecrets
      ? '{"notes": "Top tier clinic", "payment_secret_key": "sec_live_99998888"}'
      : '{"notes": "Top tier clinic"}',
    logo_url: `https://mock.supabase.co/storage/v1/object/public/clinic_photos/${clinicId}/logo.png`,
    pictures: [
      `https://mock.supabase.co/storage/v1/object/public/clinic_photos/${clinicId}/facade.jpg`,
      `https://mock.supabase.co/storage/v1/object/public/clinic_photos/${clinicId}/reception.jpg`
    ],
    registration_doc_url: `https://mock.supabase.co/storage/v1/object/authenticated/clinic-docs-private/${clinicId}/reg_certificate.pdf`,
    pan_number: 'PAN-10928374',
    is_activated: true,
    payment_secret_key: includeSecrets ? 'sec_secret_live_alpha_01' : '[REDACTED]',
    payment_api_key: includeSecrets ? 'pk_live_alpha_01' : '[REDACTED]',
    merchant_id: 'MERCHANT_NEPAL_01',
    created_at: '2026-01-10T08:00:00.000Z',
    updated_at: now.toISOString(),
    is_deleted: false,
    deleted_at: null
  };

  const services = [
    {
      id: 'srv-01',
      clinic_id: clinicId,
      name: 'General OPD Consultation',
      price: 500,
      is_deleted: false,
      deleted_at: null
    },
    {
      id: 'srv-02',
      clinic_id: clinicId,
      name: 'Cardiology Specialist OPD',
      price: 1000,
      is_deleted: false,
      deleted_at: null
    }
  ];

  const catalog = [
    {
      id: 'cat-01',
      clinic_id: clinicId,
      item_name: 'CBC (Complete Blood Count)',
      category: 'pathology',
      price: 450,
      is_deleted: false,
      deleted_at: null
    }
  ];

  const doctors = [
    {
      id: 'doc-01',
      clinic_id: clinicId,
      name: 'Dr. Aarav Sharma',
      nmc_number: 'NMC-18273',
      specialty: 'Cardiology',
      avatar_url: `https://mock.supabase.co/storage/v1/object/public/doctor_photos/doc-01/avatar.jpg`,
      kyc_doc_url: `https://mock.supabase.co/storage/v1/object/authenticated/doctor-kyc-private/doc-01/license.pdf`,
      is_deleted: false,
      deleted_at: null
    },
    {
      id: 'doc-02',
      clinic_id: clinicId,
      name: 'Dr. Sunita Koirala',
      nmc_number: 'NMC-29384',
      specialty: 'General Medicine',
      avatar_url: `https://mock.supabase.co/storage/v1/object/public/doctor_photos/doc-02/avatar.jpg`,
      kyc_doc_url: `https://mock.supabase.co/storage/v1/object/authenticated/doctor-kyc-private/doc-02/license.pdf`,
      is_deleted: includeTombstones,
      deleted_at: includeTombstones ? '2026-09-01T10:00:00.000Z' : null
    }
  ];

  const slots = [
    {
      id: 'slot-01',
      clinic_id: clinicId,
      doctor_id: 'doc-01',
      start_time: '2026-10-23T09:00:00.000Z',
      end_time: '2026-10-23T09:30:00.000Z',
      is_available: false,
      is_deleted: false,
      deleted_at: null
    }
  ];

  const appointments = [
    {
      id: 'apt-01',
      clinic_id: clinicId,
      doctor_id: 'doc-01',
      patient_name: 'Ramesh Adhikari',
      patient_phone: '+977-9841000001',
      tracking_code: '1012950014',
      appointment_time: '2026-10-23T09:00:00.000Z',
      status: 'confirmed',
      is_deleted: false,
      deleted_at: null
    }
  ];

  const queueEntries = [
    {
      id: 'qe-01',
      clinic_id: clinicId,
      appointment_id: 'apt-01',
      token_number: 'T-A01-001',
      status: 'waiting',
      called_at: null,
      is_deleted: false,
      deleted_at: null
    }
  ];

  const billingInvoices = [
    {
      id: 'inv-01',
      clinic_id: clinicId,
      appointment_id: 'apt-01',
      invoice_number: 'B-A01-20261022-0001',
      total_amount: 1450,
      paid_amount: 1450,
      payment_status: 'paid',
      is_deleted: false,
      deleted_at: null
    }
  ];

  const invoiceTransactions = [
    {
      id: 'tx-01',
      invoice_id: 'inv-01',
      clinic_id: clinicId,
      amount: 1450,
      payment_method: 'esewa',
      transaction_ref: 'ESEWA-REF-998822',
      created_at: '2026-10-22T10:30:00.000Z',
      is_deleted: false,
      deleted_at: null
    }
  ];

  const labReports = [
    {
      id: 'rep-01',
      clinic_id: clinicId,
      appointment_id: 'apt-01',
      patient_name: 'Ramesh Adhikari',
      test_name: 'Complete Blood Count (CBC)',
      report_file_url: `https://mock.supabase.co/storage/v1/object/authenticated/lab-reports-private/rep-01/cbc_report.pdf`,
      created_at: '2026-10-22T11:45:00.000Z',
      is_deleted: false,
      deleted_at: null
    }
  ];

  return {
    clinic,
    clinics: [clinic],
    clinic_services: services,
    clinic_catalog: catalog,
    doctors,
    slots,
    appointments,
    queue_entries: queueEntries,
    billing_invoices: billingInvoices,
    invoice_transactions: invoiceTransactions,
    lab_reports: labReports
  };
}

module.exports = {
  REPO_ROOT,
  BACKUP_ROOT,
  SCRATCH_STAGING_DIR,
  EXIT_CODES,
  RELATIONAL_TABLES,
  STORAGE_BUCKETS,
  SENSITIVE_KEYS,
  WINDOWS_RESERVED_NAMES,
  normalizeISOTimestamp,
  computeSHA256,
  sanitizeFilename,
  cleanStoragePath,
  redactSecrets,
  redactNestedJson,
  toRFC4180CSV,
  parseRFC4180CSV,
  escapeCSVField,
  validateManifest,
  createMockClinicBundle
};
