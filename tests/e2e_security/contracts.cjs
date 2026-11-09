/**
 * DACTOR Platform Security Hardening — Interface Contracts & Crypto Engines
 * Authoritative interface contracts, cryptographic validators, and security utilities.
 * Sources: PROJECT.md, ORIGINAL_REQUEST.md, Supabase migrations, Edge Functions.
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// 1. CONTRACT CONSTANTS & CONFIGURATION
// ---------------------------------------------------------------------------

const CONTRACTS = {
  // R3: Storage Buckets Architecture & Limits
  storage: {
    privateBuckets: [
      'lab-reports-private',
      'doctor-kyc-private',
      'clinic-docs-private'
    ],
    publicBuckets: [
      'clinic_photos',
      'doctor_photos'
    ],
    deprecatedOrRestrictedBuckets: [
      'doctor-kyc',
      'clinic_files'
    ],
    maxFileSizeBytes: 10485760, // Exactly 10MB (10 * 1024 * 1024)
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ],
    disallowedMimeTypes: [
      'application/x-msdownload', // .exe
      'application/x-sh',         // .sh
      'text/html',                // .html
      'application/javascript',   // .js
      'image/svg+xml'             // .svg (can contain script tags)
    ]
  },

  // R6: Edge Function CORS Configuration
  cors: {
    allowedOrigins: [
      'https://dactorofficial.github.io',
      'https://rajanpurbe.github.io',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    ],
    allowedHeaders: 'authorization, x-client-info, apikey, content-type',
    allowedMethods: 'GET, POST, OPTIONS'
  },

  // R7: Payment Return & Gateway Origins
  payment: {
    allowedReturnOrigins: [
      'https://dactorofficial.github.io',
      'https://rajanpurbe.github.io',
      'dactor://payment-result'
    ],
    epayLiveBase: 'https://epay.esewa.com.np/api/epay/transaction/status/',
    epayTestBase: 'https://rc.esewa.com.np/api/epay/transaction/status/',
    amountToleranceNpr: 0.01 // Maximum allowable discrepancy between charged and verified fee
  },

  // R2 & R3: Signed URL Lifetimes
  signedUrl: {
    minExpirySec: 60,       // 1 minute minimum
    defaultExpirySec: 900,  // 15 minutes default
    maxExpirySec: 900       // 15 minutes maximum for sensitive patient data
  },

  // R2: Nepal Phone Number Rules
  nepalPhone: {
    countryCode: '977',
    standardMobileDigits: 10,
    validMobilePrefixes: ['98', '97']
  },

  // R1: Default Fallback Doctor Consultation Fee (NPR)
  defaultConsultationFeeNpr: 500.00
};

// ---------------------------------------------------------------------------
// 2. CRYPTOGRAPHIC & ALGORITHMIC ENGINES
// ---------------------------------------------------------------------------

/**
 * Standard base-10 Luhn check digit computation.
 * Doubles every second digit from the rightmost payload digit, sums digits,
 * and calculates (10 - (sum % 10)) % 10.
 */
function computeLuhnCheckDigit(payloadDigits) {
  const digits = String(payloadDigits).replace(/\D/g, '');
  if (!digits) {
    throw new Error('Payload must contain at least one digit');
  }

  let sum = 0;
  let doubleIt = true; // start doubling from the rightmost payload digit

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (doubleIt) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    doubleIt = !doubleIt;
  }

  return (10 - (sum % 10)) % 10;
}

/**
 * Generates a structured 10-digit tracking code:
 * [Terminal 3 digits][Day of Year 3 digits][Counter 3 digits][Luhn Check Digit 1 digit]
 */
function generateStructuredTrackingCode(terminalId, dayOfYear, counter) {
  const t = String(terminalId % 1000).padStart(3, '0');
  const d = String(dayOfYear % 1000).padStart(3, '0');
  const c = String(counter % 1000).padStart(3, '0');
  const payload = `${t}${d}${c}`;
  const checkDigit = computeLuhnCheckDigit(payload);
  return `${payload}${checkDigit}`;
}

/**
 * Validates whether a tracking code is exactly 10 digits and has a valid Luhn checksum.
 */
function validateLuhnTrackingCode(code) {
  if (typeof code !== 'string') return false;
  const clean = code.trim();
  if (!/^\d{10}$/.test(clean)) return false;

  const payload = clean.slice(0, 9);
  const checkDigit = parseInt(clean.charAt(9), 10);
  const expectedCheckDigit = computeLuhnCheckDigit(payload);

  return checkDigit === expectedCheckDigit;
}

/**
 * Normalizes and validates a Nepal mobile phone number.
 * Returns normalized 10-digit string if valid (e.g. "9841234567"), or null if invalid.
 */
function normalizeNepalMobileNumber(rawPhone) {
  if (typeof rawPhone !== 'string') return null;
  const trimmed = rawPhone.trim();

  // Deny unexpected/illegal characters (allow only digits, +, -, (, ), and spaces)
  if (/[^\d+\-()\s]/.test(trimmed)) {
    return null;
  }

  let digits = trimmed.replace(/\D/g, '');

  // Handle +977 or 977 country code prefix
  if (digits.length === 13 && digits.startsWith('977')) {
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith('97')) {
    // Check if 977 prefix was partially matched
    if (digits.startsWith('977')) {
      digits = digits.slice(3);
    }
  }

  // Must be exactly 10 digits
  if (digits.length !== 10) {
    return null;
  }

  // Must start with valid Nepal mobile prefix (98 or 97)
  const prefix = digits.substring(0, 2);
  if (!CONTRACTS.nepalPhone.validMobilePrefixes.includes(prefix)) {
    return null;
  }

  return digits;
}

/**
 * eSewa HMAC-SHA256 signature generator.
 * Creates signature over ordered comma-separated fields:
 * total_amount,transaction_uuid,product_code
 */
function generateEsewaSignature(fields, secretKey) {
  const message = `total_amount=${fields.total_amount},transaction_uuid=${fields.transaction_uuid},product_code=${fields.product_code}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

/**
 * Verifies eSewa HMAC-SHA256 signature using timing-safe buffer equality.
 */
function verifyEsewaSignature(fields, signature, secretKey) {
  if (!signature || typeof signature !== 'string') return false;
  try {
    const expected = generateEsewaSignature(fields, secretKey);
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

/**
 * Verifies server-to-server eSewa transaction response against payment attempt.
 */
function verifyEsewaTransaction(attempt, providerResponse, expectedProductCode) {
  if (!providerResponse || typeof providerResponse !== 'object') {
    return { verified: false, reason: 'Invalid provider payload' };
  }

  if (providerResponse.status !== 'COMPLETE') {
    return { verified: false, reason: `Status not COMPLETE (got ${providerResponse.status})` };
  }

  if (providerResponse.product_code !== expectedProductCode) {
    return { verified: false, reason: 'Product code mismatch' };
  }

  if (providerResponse.transaction_uuid !== attempt.transaction_uuid) {
    return { verified: false, reason: 'Transaction UUID mismatch' };
  }

  const providerAmount = parseFloat(providerResponse.total_amount);
  const attemptAmount = parseFloat(attempt.amount_npr);

  if (Number.isNaN(providerAmount) || Number.isNaN(attemptAmount)) {
    return { verified: false, reason: 'Invalid amount formatting' };
  }

  const discrepancy = Math.abs(providerAmount - attemptAmount);
  if (discrepancy > CONTRACTS.payment.amountToleranceNpr) {
    return { verified: false, reason: `Amount mismatch (attempt: ${attemptAmount}, provider: ${providerAmount})` };
  }

  return { verified: true, verifiedAmount: providerAmount, refId: providerResponse.ref_id || '' };
}

/**
 * Validates CORS origins dynamically against authorized allowlist.
 */
function isAllowedOrigin(origin, allowedList = CONTRACTS.cors.allowedOrigins) {
  if (!origin || typeof origin !== 'string') return false;
  const clean = origin.trim().replace(/\/+$/, ''); // normalize trailing slashes

  // Disallow wildcards, null literals, and non-http(s)
  if (clean === '*' || clean === 'null' || !/^https?:\/\//i.test(clean)) {
    return false;
  }

  try {
    const parsed = new URL(clean);
    // Disallow userinfo, search params, hash
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return false;
    }

    // Check exact match in allowed list
    for (const allowed of allowedList) {
      const allowedClean = allowed.trim().replace(/\/+$/, '');
      if (clean === allowedClean) {
        return true;
      }
    }

    // Check localhost with variable dev ports (e.g. http://localhost:5174)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      const port = parseInt(parsed.port, 10);
      if (port >= 1024 && port <= 65535) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Returns appropriate CORS headers for an incoming Request Origin.
 */
function getCorsHeaders(origin, allowedList = CONTRACTS.cors.allowedOrigins) {
  const allowed = isAllowedOrigin(origin, allowedList);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Headers': CONTRACTS.cors.allowedHeaders,
    'Access-Control-Allow-Methods': CONTRACTS.cors.allowedMethods,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}

/**
 * Centralized DOM URL Protocol Validator (XSS Defense).
 * Allows ONLY https:, http:, blob:, and data:image/ protocols.
 * Strictly denies javascript:, data:text/html, vbscript:, file:, etc.
 */
function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();

  // Deny control characters, whitespace injection, and ASCII NUL
  if (/[\u0000-\u001f\u007f\s]/.test(trimmed)) {
    return false;
  }

  // Deny dangerous pseudo-protocols even if URL-encoded or mixed-case
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('about:')
  ) {
    return false;
  }

  // Handle data: URIs - allow only safe image MIME types
  if (lower.startsWith('data:')) {
    return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed);
  }

  // Standard web protocols
  try {
    const parsed = new URL(trimmed);
    return ['https:', 'http:', 'blob:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Escapes untrusted strings for safe embedding into HTML.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Authoritative Server Fee Calculator.
 * Client-sent fee amount is completely disregarded.
 */
function calculateAuthoritativeFee(doctor, clinicServices = []) {
  let fee = CONTRACTS.defaultConsultationFeeNpr;

  if (doctor && typeof doctor.consultation_fee === 'number' && !Number.isNaN(doctor.consultation_fee)) {
    fee = Math.max(0, doctor.consultation_fee);
  }

  // Add validated clinic service costs if provided
  let serviceTotal = 0;
  if (Array.isArray(clinicServices)) {
    for (const s of clinicServices) {
      if (s && typeof s.price === 'number' && s.price > 0) {
        serviceTotal += s.price;
      }
    }
  }

  return Number((fee + serviceTotal).toFixed(2));
}

/**
 * Pure projection filter for Public Queue Status.
 * Strips all patient PII, notes, and financial information.
 */
function filterPublicQueueStatus(appointment, doctor, clinic, queueEntry) {
  if (!appointment) return null;

  return {
    tracking_code_10_digit: appointment.tracking_code_10_digit || null,
    clinic_id: clinic?.id || appointment.clinic_id || null,
    clinic_name: clinic?.name || 'Clinic',
    doctor_id: doctor?.id || appointment.doctor_id || null,
    doctor_name: doctor?.name || 'Doctor',
    doctor_specialty: doctor?.specialty || null,
    appointment_date: appointment.appointment_date || null,
    appointment_time: appointment.appointment_time || null,
    checkin_status: appointment.checkin_status || 'not_checked_in',
    queue_status: queueEntry?.status || 'waiting',
    queue_position: queueEntry?.position || null,
    patients_ahead: queueEntry ? Math.max(0, (queueEntry.position || 1) - 1) : null,
    current_queue_position: queueEntry?.current_serving_position || null,
    doctor_is_in_clinic: Boolean(doctor?.is_in_clinic)
  };
}

/**
 * Validates whether an identity identifier is a Firebase alphanumeric UID.
 * Firebase UIDs are typically 28 characters and contain non-UUID characters.
 */
function isFirebaseUid(uid) {
  if (typeof uid !== 'string') return false;
  const clean = uid.trim();
  if (clean.length < 20 || clean.length > 128) return false;

  // Must not match standard UUID format: 8-4-4-4-12 hex characters
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
  if (isUuid) return false;

  // Must be alphanumeric with allowed safe characters
  return /^[A-Za-z0-9_-]+$/.test(clean);
}

/**
 * Simulates non-throwing auth.uid() function.
 * If sub is UUID, returns the UUID string.
 * If sub is an alphanumeric Firebase UID or invalid, returns NULL instead of throwing.
 */
function safeAuthUid(jwtClaimSub) {
  if (!jwtClaimSub || typeof jwtClaimSub !== 'string') return null;
  const clean = jwtClaimSub.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
  return isUuid ? clean.toLowerCase() : null;
}

/**
 * Generates a non-guessable storage path: `${entityId}/${uuidv4()}.${ext}`
 */
function generateSafeStoragePath(entityId, originalFilename) {
  if (!entityId || typeof entityId !== 'string') {
    throw new Error('Valid entityId is required for storage path');
  }

  const cleanEntity = entityId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanEntity) {
    throw new Error('entityId contains only illegal characters');
  }

  const extMatch = (originalFilename || '').match(/\.([a-zA-Z0-9]+)$/);
  let ext = extMatch ? extMatch[1].toLowerCase() : 'pdf';
  if (ext === 'jpeg') ext = 'jpg';

  const randomUuid = crypto.randomUUID();
  return `${cleanEntity}/${randomUuid}.${ext}`;
}

module.exports = {
  REPO_ROOT,
  CONTRACTS,
  computeLuhnCheckDigit,
  generateStructuredTrackingCode,
  validateLuhnTrackingCode,
  normalizeNepalMobileNumber,
  generateEsewaSignature,
  verifyEsewaSignature,
  verifyEsewaTransaction,
  isAllowedOrigin,
  getCorsHeaders,
  isSafeUrl,
  escapeHtml,
  calculateAuthoritativeFee,
  filterPublicQueueStatus,
  isFirebaseUid,
  safeAuthUid,
  generateSafeStoragePath
};
