/**
 * DACTOR Platform Private Storage & Server-Authorized Signed URLs
 * Interface Contracts & Specifications (Authoritative)
 * Sources: PROJECT.md, ORIGINAL_REQUEST.md
 */

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const CONTRACTS = {
  // F1 & F2: Storage Buckets Architecture
  buckets: {
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
    fileSizeLimit: 52428800, // 50 MB in bytes
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
      'application/javascript'    // .js
    ]
  },

  // Network Endpoints & Oracles
  endpoints: {
    supabaseUrl: 'https://ojfoofojcpabqegxmsab.supabase.co',
    storagePublicBase: 'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public',
    storageSignBase: 'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/sign',
    documentAccessFunctionUrl: 'https://ojfoofojcpabqegxmsab.supabase.co/functions/v1/document-access'
  },

  // F6: Signed URL Specifications
  signedUrl: {
    minExpirySec: 300,      // 5 minutes
    maxExpirySec: 900,      // 15 minutes
    defaultExpirySec: 900,  // 15 minutes
    tokenParam: 'token',
    expiresParam: 'expires_at'
  },

  // F5: Server-Side Authorization RPC Contracts
  rpcs: {
    get_lab_report_signed_url: {
      name: 'get_lab_report_signed_url',
      params: ['p_report_id', 'p_patient_phone', 'p_tracking_code'],
      returnType: 'JSONB'
    },
    get_authorized_document_signed_url: {
      name: 'get_authorized_document_signed_url',
      params: ['p_doc_type', 'p_entity_id', 'p_file_path'],
      returnType: 'JSONB'
    },
    authorize_document_access: {
      name: 'authorize_document_access',
      params: ['p_document_type', 'p_document_id', 'p_patient_phone', 'p_tracking_code'],
      returnType: 'JSONB'
    }
  },

  // Authorization Roles
  roles: {
    SUPER_ADMIN: 'super_admin',
    CLINIC_STAFF: 'clinic_staff',
    DOCTOR: 'doctor',
    LOGGED_IN_PATIENT: 'logged_in_patient',
    WALK_IN_PATIENT: 'verified_walkin_patient'
  },

  // Database Tables Protected by RLS
  tables: {
    lab_reports: 'lab_reports',
    storage_objects: 'storage.objects',
    migration_backup: '_migration_storage_backup'
  },

  // Nepal Phone Number Normalization Standard
  nepalPhone: {
    countryCode: '977',
    standardMobileDigits: 10,
    validMobilePrefixes: ['98', '97']
  }
};

/**
 * Normalizes phone numbers according to the DACTOR Nepal specifications:
 * 1. Strips all non-digit characters.
 * 2. If length >= 10, extracts the last 10 digits (handling +977 or 977 prefixes).
 * 3. Returns null if input is null/undefined, empty, or has fewer than 7 digits.
 */
function normalizePhoneNumber(phone) {
  if (phone === null || phone === undefined) return null;
  if (typeof phone !== 'string' && typeof phone !== 'number') return null;
  const str = String(phone).trim();
  if (str.length === 0) return null;

  const digits = str.replace(/\D/g, '');
  if (digits.length < 7) return null; // Landline minimum or invalid

  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Checks whether an entered phone number matches the registered appointment phone number.
 * Enforces strict non-empty matching: both inputs must be non-empty and resolve to valid digits.
 * Blank or null never matches blank or null.
 */
function isPhoneMatch(inputPhone, dbPhone) {
  const cleanInput = normalizePhoneNumber(inputPhone);
  const cleanDb = normalizePhoneNumber(dbPhone);

  if (!cleanInput || !cleanDb) {
    return false;
  }
  return cleanInput === cleanDb;
}

/**
 * Validates a 10-digit universal tracking code.
 */
function isValidTrackingCode(code) {
  if (typeof code !== 'string') return false;
  const trimmed = code.trim();
  return /^\d{10}$/.test(trimmed);
}

/**
 * Simulates server-side ownership authorization decision matrix (F5 contract).
 */
function simulateAuthorizeDocumentAccess({ caller, documentType, documentData, options = {} }) {
  // 1. Super Admin: full access
  if (caller && (caller.role === 'super_admin' || caller.role === 'service_role' || (caller.email && caller.email.toLowerCase().endsWith('@dactor.com') && caller.email.toLowerCase().startsWith('admin')))) {
    return { authorized: true, role: 'super_admin' };
  }

  // 2. Lab Report Authorization
  if (documentType === 'lab_report') {
    // Clinic Staff check
    if (caller && caller.role === 'clinic_staff' && caller.clinicId && caller.clinicId === documentData.clinic_id) {
      return { authorized: true, role: 'clinic_staff' };
    }

    // Logged-in Patient check
    if (caller && caller.userId && caller.userId === documentData.user_id) {
      return { authorized: true, role: 'logged_in_patient' };
    }

    // Walk-in / Guest Patient verification via phone match
    if (options.patientPhone && documentData.patient_mobile) {
      if (isPhoneMatch(options.patientPhone, documentData.patient_mobile)) {
        // If tracking code is also provided, it must match
        if (options.trackingCode) {
          if (options.trackingCode === documentData.tracking_code_10_digit) {
            return { authorized: true, role: 'verified_walkin_patient' };
          }
        } else {
          return { authorized: true, role: 'verified_walkin_patient' };
        }
      }
    }

    return { authorized: false, error: 'Unauthorized access to lab report' };
  }

  // 3. Doctor KYC Authorization
  if (documentType === 'doctor_kyc') {
    // Doctor owner check
    if (caller && (caller.userId === documentData.user_id || (caller.email && caller.email === documentData.email))) {
      return { authorized: true, role: 'doctor' };
    }

    // Clinic Staff of doctor's primary clinic
    if (caller && caller.role === 'clinic_staff' && caller.clinicId && caller.clinicId === documentData.clinic_id) {
      return { authorized: true, role: 'clinic_staff' };
    }

    return { authorized: false, error: 'Unauthorized access to doctor KYC' };
  }

  // 4. Clinic Legal Document Authorization (PAN / Reg)
  if (documentType === 'clinic_doc') {
    // Clinic Staff of that clinic
    if (caller && caller.role === 'clinic_staff' && caller.clinicId && caller.clinicId === documentData.id) {
      return { authorized: true, role: 'clinic_staff' };
    }

    return { authorized: false, error: 'Unauthorized access to clinic document' };
  }

  return { authorized: false, error: 'Unknown document type' };
}

/**
 * Simulates server-side signed URL generation.
 */
function simulateSignedUrlGeneration(bucket, filePath, expiresInSec = 900) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
  const cleanPath = filePath.replace(/^\/+/, '');
  const dummySignature = `mock_hmac_sig_${Buffer.from(cleanPath + expiresAt).toString('base64url').slice(0, 16)}`;
  const signedUrl = `${CONTRACTS.endpoints.storageSignBase}/${bucket}/${cleanPath}?token=${dummySignature}&expires_at=${expiresAt}`;
  return {
    signedUrl,
    expiresAt,
    expiresInSec
  };
}

/**
 * Validates the structure and freshness of a signed URL.
 */
function verifySignedUrl(urlStr, expectedBucket, expectedPath) {
  try {
    const parsed = new URL(urlStr);
    const pathname = parsed.pathname;
    const token = parsed.searchParams.get('token');
    const rawExp = parsed.searchParams.get('expires_at');
    const parsedExp = parseInt(rawExp || '0', 10);
    const expiresAt = Number.isNaN(parsedExp) ? 0 : parsedExp;

    const isSignEndpoint = pathname.includes('/storage/v1/object/sign/');
    const includesBucket = pathname.includes(`/${expectedBucket}/`);
    const includesPath = expectedPath ? pathname.includes(expectedPath) : true;
    const hasToken = typeof token === 'string' && token.length > 0;
    const nowSec = Math.floor(Date.now() / 1000);
    const isFresh = expiresAt > nowSec;

    return {
      isValidStructure: isSignEndpoint && includesBucket && includesPath && hasToken,
      hasToken,
      expiresAt,
      isFresh,
      isSignEndpoint
    };
  } catch {
    return {
      isValidStructure: false,
      hasToken: false,
      expiresAt: 0,
      isFresh: false,
      isSignEndpoint: false
    };
  }
}

/**
 * Safely fetches network resources with a timeout.
 */
async function safeFetch(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

module.exports = {
  REPO_ROOT,
  CONTRACTS,
  normalizePhoneNumber,
  isPhoneMatch,
  isValidTrackingCode,
  simulateAuthorizeDocumentAccess,
  simulateSignedUrlGeneration,
  verifySignedUrl,
  safeFetch
};
