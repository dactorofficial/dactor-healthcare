/**
 * Clinic Data Aggregator Engine
 * Extracts and partitions 10 relational clinic datasets from Supabase PostgREST or offline fixtures.
 * Standardizes ISO 8601 UTC timestamps and preserves soft-deletes.
 */

import { redactSecrets } from './redactor.mjs';

export const DEFAULT_SUPABASE_URL = 'https://ojfoofojcpabqegxmsab.supabase.co';
export const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y';

/**
 * List of known timestamp fields across the 10 clinic datasets
 */
const TIMESTAMP_FIELDS = new Set([
  'created_at',
  'updated_at',
  'deleted_at',
  'called_at',
  'inside_at',
  'completed_at',
  'paid_at',
  'sample_collected_at',
  'prepared_at',
  'expires_at',
  'approved_at',
  'rejected_at',
  'archived_at',
  'deletion_scheduled_at',
  'activation_expires_at',
  'transaction_time'
]);

/**
 * Normalizes all timestamps in a record or structure to standard ISO 8601 UTC strings.
 * Preserves soft-delete tombstones (is_deleted, deleted_at).
 * 
 * @param {any} record - Record or nested object
 * @returns {any} Record with normalized ISO 8601 UTC timestamps
 */
export function normalizeTimestamps(record, visited = new WeakSet()) {
  if (record === null || record === undefined) {
    return record;
  }

  if (record instanceof Date) {
    return !isNaN(record.getTime()) ? record.toISOString() : record;
  }

  if (typeof record !== 'object') {
    return record;
  }

  // Cycle detection to prevent RangeError: Maximum call stack size exceeded
  if (!(visited instanceof WeakSet)) {
    visited = new WeakSet();
  }
  if (visited.has(record)) {
    return record;
  }
  visited.add(record);

  if (Array.isArray(record)) {
    return record.map(item => normalizeTimestamps(item, visited));
  }

  const normalized = {};
  for (const [key, val] of Object.entries(record)) {
    if (val === null || val === undefined) {
      normalized[key] = val;
      continue;
    }

    if (val instanceof Date) {
      normalized[key] = !isNaN(val.getTime()) ? val.toISOString() : val;
      continue;
    }

    // Check if field is a known timestamp field or matches timestamp patterns
    const isKnownTimestamp = TIMESTAMP_FIELDS.has(key) || key.endsWith('_at') || key.endsWith('_time');
    
    if (isKnownTimestamp && (typeof val === 'string' || typeof val === 'number')) {
      const parsedDate = new Date(val);
      if (!isNaN(parsedDate.getTime())) {
        normalized[key] = parsedDate.toISOString();
        continue;
      }
    }

    // Recurse into nested objects/arrays (e.g. items in billing_invoices)
    if (typeof val === 'object' && val !== null) {
      normalized[key] = normalizeTimestamps(val, visited);
    } else {
      normalized[key] = val;
    }
  }

  return normalized;
}

/**
 * Generates rich, realistic offline mock fixtures for any clinic ID.
 * Includes complete datasets for all 10 relational tables, soft-deleted records, and credentials.
 * 
 * @param {string} [clinicId='c1111111-1111-1111-1111-111111111111']
 * @returns {object} Full clinic dataset bundle
 */
export function createMockClinicBundle(clinicId = 'c1111111-1111-1111-1111-111111111111') {
  const baseTime = '2026-10-22T08:00:00.000Z';
  const doctorId = 'd1111111-1111-1111-1111-111111111111';
  const appointment1Id = 'a1111111-1111-1111-1111-111111111111';
  const appointment2Id = 'a2222222-2222-2222-2222-222222222222';
  const slotId = 's1111111-1111-1111-1111-111111111111';
  const invoice1Id = 'i1111111-1111-1111-1111-111111111111';
  const invoice2Id = 'i2222222-2222-2222-2222-222222222222';

  const clinic = {
    id: clinicId,
    name: 'Kathmandu Health Hub & Polyclinic',
    type: 'polyclinic',
    verification_status: 'approved',
    contact_phone: '+977-1-4412345',
    contact_email: 'contact@ktmhealthhub.com.np',
    address_text: 'Thamel Marg, Kathmandu 44600, Nepal',
    latitude: 27.7172,
    longitude: 85.3240,
    geohash: 'tuve0k6z',
    auto_notify_threshold: 2,
    description: JSON.stringify({
      notes: 'Leading polyclinic in Kathmandu',
      payment_gateways_json: {
        esewa: {
          merchant_id: 'EPAYTEST',
          secret_key: 'mock_esewa_secret_in_description_xyz789',
          environment: 'test'
        }
      }
    }),
    logo_url: 'clinic_photos/c1111111-1111-1111-1111-111111111111/logo.png',
    registration_doc_url: 'clinic-docs-private/c1111111-1111-1111-1111-111111111111/reg_doc.pdf',
    pan_number: '601234567',
    manager_phone: '+977-9851000000',
    pictures: [
      'clinic_photos/c1111111-1111-1111-1111-111111111111/facade.jpg',
      'clinic_photos/c1111111-1111-1111-1111-111111111111/reception.jpg'
    ],
    specialties: ['General Medicine', 'Cardiology', 'Pediatrics', 'Pathology'],
    is_archived: false,
    archived_at: null,
    deletion_scheduled_at: null,
    payment_gateway_provider: 'esewa',
    payment_api_key: 'mock_payment_api_key_abc123',
    payment_secret_key: 'mock_payment_secret_key_super_secret_999',
    merchant_id: 'EPAYTEST',
    is_direct_payment_enabled: true,
    is_activated: true,
    activation_expires_at: '2026-11-22T08:00:00.000Z',
    activation_plan: '1_year',
    activation_paid_amount: 12000.00,
    activation_notes: 'Annual license active',
    activation_payment_proof_url: 'clinic-docs-private/c1111111-1111-1111-1111-111111111111/payment_proof.pdf',
    avg_consultation_time_minutes: 15,
    manual_avg_consultation_time_minutes: 15,
    calculated_avg_consultation_time_minutes: 14,
    avg_time_mode: 'manual',
    is_deleted: false,
    deleted_at: null,
    created_at: baseTime,
    updated_at: baseTime
  };

  const services = [
    {
      id: 'cs111111-1111-1111-1111-111111111111',
      clinic_id: clinicId,
      service_name: 'General Consultation',
      description: 'Standard outpatient general health checkup',
      price: 500.00,
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime
    },
    {
      id: 'cs222222-2222-2222-2222-222222222222',
      clinic_id: clinicId,
      service_name: 'Comprehensive Lipid Profile',
      description: 'Diagnostic cholesterol and triglyceride panel',
      price: 1200.00,
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime
    }
  ];

  const catalog = [
    {
      id: 'cat11111-1111-1111-1111-111111111111',
      clinic_id: clinicId,
      item_name: 'OPD Ticket & Registration',
      category: 'General',
      price: 100.00,
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime
    },
    {
      id: 'cat22222-2222-2222-2222-222222222222',
      clinic_id: clinicId,
      item_name: 'Discontinued Rapid COVID Antigen',
      category: 'Diagnostic',
      price: 800.00,
      is_deleted: true,
      deleted_at: '2026-09-01T10:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  ];

  const doctors = [
    {
      id: doctorId,
      clinic_id: clinicId,
      primary_clinic_id: clinicId,
      user_id: 'u1111111-1111-1111-1111-111111111111',
      full_name: 'Dr. Aarav Sharma',
      email: 'aarav.sharma@ktmhealthhub.com.np',
      gender: 'Male',
      age: 42,
      starting_practicing_year: 2010,
      profile_picture_url: 'doctor_photos/d1111111-1111-1111-1111-111111111111/avatar.jpg',
      specialty: 'Internal Medicine',
      specialties: ['Internal Medicine', 'Cardiology'],
      education: 'MBBS, MD - Tribhuvan University (IOM)',
      nmc_license_number: 'NMC-8842',
      personal_mobile_number: '+977-9841112233',
      public_mobile_number: '+977-9841112233',
      description: 'Senior Consultant Physician with 16 years clinical experience.',
      license_doc_url: 'doctor-kyc-private/d1111111-1111-1111-1111-111111111111/nmc_license.pdf',
      certificates_doc_url: 'doctor-kyc-private/d1111111-1111-1111-1111-111111111111/degree_md.pdf',
      kyc_status: 'approved',
      is_in_clinic: true,
      consultation_fee: 700.00,
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime,
      updated_at: baseTime
    }
  ];

  const slots = [
    {
      id: slotId,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_date: '2026-10-22',
      start_time: '09:00:00',
      end_time: '12:00:00',
      max_capacity: 15,
      booked_count: 2,
      is_published: true,
      created_at: baseTime,
      updated_at: baseTime
    }
  ];

  const appointments = [
    {
      id: appointment1Id,
      clinic_id: clinicId,
      slot_id: slotId,
      doctor_id: doctorId,
      user_id: 'u2222222-2222-2222-2222-222222222222',
      tracking_code_10_digit: '1012950014',
      patient_name: 'Bikash Adhikari',
      patient_age: 34,
      patient_gender: 'Male',
      patient_mobile: '+977-9812345678',
      patient_email: 'bikash.adhikari@example.com',
      payment_status: 'paid',
      checkin_status: 'checked_in',
      appointment_date: '2026-10-22',
      appointment_time: '09:30:00',
      fee_amount: 700.00,
      is_walkin: false,
      selected_lab_tests: 'Lipid Profile',
      payment_mode: 'ONLINE',
      status: 'APPROVED',
      attempt_number: 1,
      service_charge_amount: 15.00,
      total_amount: 715.00,
      expires_at: '2026-10-22T10:00:00.000Z',
      approved_at: '2026-10-22T08:15:00.000Z',
      rejected_at: null,
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime,
      updated_at: baseTime
    },
    {
      id: appointment2Id,
      clinic_id: clinicId,
      slot_id: slotId,
      doctor_id: doctorId,
      user_id: null,
      tracking_code_10_digit: '1012950022',
      patient_name: 'Sunita Maharjan',
      patient_age: 28,
      patient_gender: 'Female',
      patient_mobile: '+977-9801234567',
      patient_email: null,
      payment_status: 'paid',
      checkin_status: 'checked_in',
      appointment_date: '2026-10-22',
      appointment_time: '10:00:00',
      fee_amount: 700.00,
      is_walkin: true,
      selected_lab_tests: null,
      payment_mode: 'PAY_AT_DESK',
      status: 'APPROVED',
      attempt_number: 1,
      service_charge_amount: 0.00,
      total_amount: 700.00,
      expires_at: null,
      approved_at: '2026-10-22T08:30:00.000Z',
      rejected_at: null,
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime,
      updated_at: baseTime
    }
  ];

  const queueEntries = [
    {
      id: 'q1111111-1111-1111-1111-111111111111',
      appointment_id: appointment1Id,
      clinic_id: clinicId,
      doctor_id: doctorId,
      queue_position: 1,
      status: 'inside',
      called_at: '2026-10-22T09:30:00.000Z',
      inside_at: '2026-10-22T09:32:00.000Z',
      completed_at: null,
      consultation_duration_seconds: null,
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime,
      updated_at: baseTime
    },
    {
      id: 'q2222222-2222-2222-2222-222222222222',
      appointment_id: appointment2Id,
      clinic_id: clinicId,
      doctor_id: doctorId,
      queue_position: 2,
      status: 'waiting',
      called_at: null,
      inside_at: null,
      completed_at: null,
      consultation_duration_seconds: null,
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime,
      updated_at: baseTime
    }
  ];

  const billingInvoices = [
    {
      id: invoice1Id,
      appointment_id: appointment1Id,
      clinic_id: clinicId,
      items: [
        { item_name: 'Doctor Consultation Fee', quantity: 1, unit_price: 700.00, total: 700.00 },
        { item_name: 'Lipid Profile Blood Test', quantity: 1, unit_price: 1200.00, total: 1200.00 }
      ],
      total_amount: 1900.00,
      paid_amount: 1900.00,
      balance_due: 0.00,
      payment_status: 'paid',
      paid_at: '2026-10-22T09:15:00.000Z',
      remarks: 'Paid via eSewa digital wallet',
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime,
      updated_at: baseTime
    },
    {
      id: invoice2Id,
      appointment_id: appointment2Id,
      clinic_id: clinicId,
      items: [
        { item_name: 'Walk-in Consultation Fee', quantity: 1, unit_price: 700.00, total: 700.00 }
      ],
      total_amount: 700.00,
      paid_amount: 700.00,
      balance_due: 0.00,
      payment_status: 'paid',
      paid_at: '2026-10-22T08:35:00.000Z',
      remarks: 'Paid at desk counter (Cash)',
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime,
      updated_at: baseTime
    }
  ];

  const invoiceTransactions = [
    {
      id: 'tx111111-1111-1111-1111-111111111111',
      invoice_id: invoice1Id,
      clinic_id: clinicId,
      appointment_id: appointment1Id,
      created_by: 'u1111111-1111-1111-1111-111111111111',
      transaction_type: 'PAYMENT',
      amount: 1900.00,
      payment_method: 'ESEWA',
      device_id: 'TAB-RECEPTION-01',
      transaction_time: '2026-10-22T09:15:00.000Z',
      notes: 'Initial eSewa payment verified',
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime,
      updated_at: baseTime
    },
    {
      id: 'tx222222-2222-2222-2222-222222222222',
      invoice_id: invoice2Id,
      clinic_id: clinicId,
      appointment_id: appointment2Id,
      created_by: 'u1111111-1111-1111-1111-111111111111',
      transaction_type: 'PAYMENT',
      amount: 700.00,
      payment_method: 'CASH',
      device_id: 'TAB-RECEPTION-01',
      transaction_time: '2026-10-22T08:35:00.000Z',
      notes: 'Cash receipt at reception',
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime,
      updated_at: baseTime
    }
  ];

  const labReports = [
    {
      id: 'lr111111-1111-1111-1111-111111111111',
      appointment_id: appointment1Id,
      clinic_id: clinicId,
      test_name: 'Lipid Profile',
      stage: 'completed',
      file_url: 'lab-reports-private/c1111111-1111-1111-1111-111111111111/lipid_profile_report.pdf',
      file_name: 'lipid_profile_report.pdf',
      file_type: 'application/pdf',
      patient_name_verification: 'Bikash Adhikari',
      sample_collected_at: '2026-10-22T09:00:00.000Z',
      prepared_at: '2026-10-22T11:30:00.000Z',
      is_deleted: false,
      deleted_at: null,
      created_at: baseTime,
      updated_at: baseTime
    }
  ];

  return {
    clinic,
    services,
    catalog,
    doctors,
    slots,
    appointments,
    queueEntries,
    billingInvoices,
    invoiceTransactions,
    labReports
  };
}

/**
 * Executes a native fetch query against Supabase PostgREST with abort timeout.
 * 
 * @param {string} endpointUrl 
 * @param {string} apiKey 
 * @param {number} timeoutMs 
 * @returns {Promise<Array<object>>}
 */
async function fetchPostgrest(endpointUrl, apiKey, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpointUrl, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Prefer': 'count=exact'
      },
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${errText}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Data Aggregator Engine
 */
export class DataAggregator {
  constructor(options = {}) {
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    this.apiKey =
      options.apiKey ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      DEFAULT_ANON_KEY;
    this.timeoutMs = options.timeoutMs || 8000;
    this.offline = options.offline === true;
    this.fallbackToFixtures = options.fallbackToFixtures !== false;
  }

  /**
   * Fetches all registered clinics from Supabase or returns mock list.
   * @param {object} [options] 
   * @returns {Promise<Array<object>>}
   */
  async listClinics(options = {}) {
    const offline = options.offline ?? this.offline;
    if (offline) {
      const bundle = createMockClinicBundle();
      return [bundle.clinic];
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/clinics?select=*`;
      const data = await fetchPostgrest(url, this.apiKey, this.timeoutMs);
      if (Array.isArray(data) && data.length > 0) {
        return data.map(item => normalizeTimestamps(item));
      }
      if (this.fallbackToFixtures) {
        if (options.verbose) {
          console.warn('[Aggregator] listClinics empty response; falling back to offline fixtures');
        }
        const bundle = createMockClinicBundle();
        return [bundle.clinic];
      }
      return [];
    } catch (err) {
      if (this.fallbackToFixtures) {
        if (options.verbose) {
          console.warn(`[Aggregator] listClinics falling back to offline fixtures: ${err.message}`);
        }
        const bundle = createMockClinicBundle();
        return [bundle.clinic];
      }
      throw err;
    }
  }

  /**
   * Extracts and partitions 10 relational datasets for a specific clinic ID.
   * Applies timestamp normalization, soft-delete preservation, and in-memory credential redaction.
   * 
   * @param {string} clinicId - UUID of the clinic
   * @param {object} [options] - Options: offline, redact, verbose, mockData
   * @returns {Promise<object>} Partitions of the 10 clinic datasets
   */
  async extractClinicData(clinicId, options = {}) {
    if (!clinicId) {
      throw new Error('clinicId is required for extractClinicData()');
    }

    const offline = options.offline ?? this.offline;
    const shouldRedact = options.redact !== false;

    let rawBundle = null;

    if (options.mockData) {
      rawBundle = options.mockData;
    } else if (offline) {
      rawBundle = createMockClinicBundle(clinicId);
    } else {
      try {
        rawBundle = await this._fetchFromPostgrest(clinicId);
      } catch (err) {
        if (this.fallbackToFixtures) {
          if (options.verbose) {
            console.warn(`[Aggregator] Supabase fetch failed (${err.message}), falling back to offline fixture for clinic ${clinicId}`);
          }
          rawBundle = createMockClinicBundle(clinicId);
        } else {
          throw err;
        }
      }
    }

    // 1. Normalize timestamps across all 10 datasets to ISO 8601 UTC
    const normalizedBundle = {
      clinic: normalizeTimestamps(rawBundle.clinic),
      services: (rawBundle.services || []).map(r => normalizeTimestamps(r)),
      catalog: (rawBundle.catalog || []).map(r => normalizeTimestamps(r)),
      doctors: (rawBundle.doctors || []).map(r => normalizeTimestamps(r)),
      slots: (rawBundle.slots || []).map(r => normalizeTimestamps(r)),
      appointments: (rawBundle.appointments || []).map(r => normalizeTimestamps(r)),
      queueEntries: (rawBundle.queueEntries || rawBundle.queue_entries || []).map(r => normalizeTimestamps(r)),
      billingInvoices: (rawBundle.billingInvoices || rawBundle.billing_invoices || []).map(r => normalizeTimestamps(r)),
      invoiceTransactions: (rawBundle.invoiceTransactions || rawBundle.invoice_transactions || []).map(r => normalizeTimestamps(r)),
      labReports: (rawBundle.labReports || rawBundle.lab_reports || []).map(r => normalizeTimestamps(r))
    };

    // 2. In-memory deep recursive redaction if enabled
    if (shouldRedact) {
      return redactSecrets(normalizedBundle);
    }

    return normalizedBundle;
  }

  /**
   * Internal PostgREST query handler for the 10 clinic tables.
   * @private
   */
  async _fetchFromPostgrest(clinicId) {
    const encodedId = encodeURIComponent(clinicId);
    const rest = `${this.supabaseUrl}/rest/v1`;

    const [
      clinicsRes,
      servicesRes,
      catalogRes,
      doctorsRes,
      slotsRes,
      appointmentsRes,
      queueRes,
      invoicesRes,
      transactionsRes,
      labReportsRes
    ] = await Promise.all([
      fetchPostgrest(`${rest}/clinics?id=eq.${encodedId}&select=*`, this.apiKey, this.timeoutMs),
      fetchPostgrest(`${rest}/clinic_services?clinic_id=eq.${encodedId}&select=*`, this.apiKey, this.timeoutMs),
      fetchPostgrest(`${rest}/clinic_catalog?clinic_id=eq.${encodedId}&select=*`, this.apiKey, this.timeoutMs),
      fetchPostgrest(`${rest}/doctors?clinic_id=eq.${encodedId}&select=*`, this.apiKey, this.timeoutMs),
      fetchPostgrest(`${rest}/slots?clinic_id=eq.${encodedId}&select=*`, this.apiKey, this.timeoutMs),
      fetchPostgrest(`${rest}/appointments?clinic_id=eq.${encodedId}&select=*`, this.apiKey, this.timeoutMs),
      fetchPostgrest(`${rest}/queue_entries?clinic_id=eq.${encodedId}&select=*`, this.apiKey, this.timeoutMs),
      fetchPostgrest(`${rest}/billing_invoices?clinic_id=eq.${encodedId}&select=*`, this.apiKey, this.timeoutMs),
      fetchPostgrest(`${rest}/invoice_transactions?clinic_id=eq.${encodedId}&select=*`, this.apiKey, this.timeoutMs),
      fetchPostgrest(`${rest}/lab_reports?clinic_id=eq.${encodedId}&select=*`, this.apiKey, this.timeoutMs)
    ]);

    const clinic = clinicsRes && clinicsRes.length > 0 ? clinicsRes[0] : null;

    return {
      clinic,
      services: servicesRes || [],
      catalog: catalogRes || [],
      doctors: doctorsRes || [],
      slots: slotsRes || [],
      appointments: appointmentsRes || [],
      queueEntries: queueRes || [],
      billingInvoices: invoicesRes || [],
      invoiceTransactions: transactionsRes || [],
      labReports: labReportsRes || []
    };
  }
}

/**
 * Extracts storage download targets from an aggregated clinic dataset.
 * Adheres to PROJECT.md § Interface Contracts (Data Aggregator <-> Storage Mirror).
 * 
 * @param {object} clinicBundle 
 * @returns {Array<object>} MediaDownloadTarget descriptors
 */
export function extractMediaTargets(clinicBundle) {
  const targets = [];
  if (!clinicBundle) return targets;

  const { clinic, doctors = [], labReports = [] } = clinicBundle;

  if (clinic) {
    if (clinic.logo_url) {
      targets.push({
        category: 'clinic_photos',
        rawUrlOrPath: clinic.logo_url,
        entityId: clinic.id,
        defaultFilename: 'logo.png',
        destinationSubdir: 'clinic_photos'
      });
    }

    if (Array.isArray(clinic.pictures)) {
      clinic.pictures.forEach((pic, idx) => {
        if (pic) {
          targets.push({
            category: 'clinic_photos',
            rawUrlOrPath: pic,
            entityId: clinic.id,
            defaultFilename: `picture_${idx + 1}.jpg`,
            destinationSubdir: 'clinic_photos'
          });
        }
      });
    }

    if (clinic.registration_doc_url) {
      targets.push({
        category: 'clinic_docs',
        rawUrlOrPath: clinic.registration_doc_url,
        entityId: clinic.id,
        defaultFilename: 'registration_doc.pdf',
        destinationSubdir: 'clinic_docs'
      });
    }

    if (clinic.activation_payment_proof_url) {
      targets.push({
        category: 'clinic_docs',
        rawUrlOrPath: clinic.activation_payment_proof_url,
        entityId: clinic.id,
        defaultFilename: 'activation_payment_proof.pdf',
        destinationSubdir: 'clinic_docs'
      });
    }
  }

  for (const doc of doctors) {
    if (doc.profile_picture_url) {
      targets.push({
        category: 'doctor_photos',
        rawUrlOrPath: doc.profile_picture_url,
        entityId: doc.id,
        defaultFilename: `${doc.id}_avatar.jpg`,
        destinationSubdir: 'doctor_photos'
      });
    }
    if (doc.license_doc_url) {
      targets.push({
        category: 'doctor_kyc',
        rawUrlOrPath: doc.license_doc_url,
        entityId: doc.id,
        defaultFilename: `${doc.id}_nmc_license.pdf`,
        destinationSubdir: 'doctor_kyc'
      });
    }
    if (doc.certificates_doc_url) {
      targets.push({
        category: 'doctor_kyc',
        rawUrlOrPath: doc.certificates_doc_url,
        entityId: doc.id,
        defaultFilename: `${doc.id}_degree_certificates.pdf`,
        destinationSubdir: 'doctor_kyc'
      });
    }
  }

  for (const report of labReports) {
    if (report.file_url) {
      targets.push({
        category: 'lab_reports',
        rawUrlOrPath: report.file_url,
        entityId: report.id,
        defaultFilename: report.file_name || `${report.id}_report.pdf`,
        destinationSubdir: 'lab_reports'
      });
    }
  }

  return targets;
}

const defaultAggregator = new DataAggregator();

export async function listClinics(options = {}) {
  return defaultAggregator.listClinics(options);
}

export async function extractClinicData(clinicId, options = {}) {
  return defaultAggregator.extractClinicData(clinicId, options);
}

export default {
  DataAggregator,
  listClinics,
  extractClinicData,
  normalizeTimestamps,
  createMockClinicBundle,
  extractMediaTargets,
  DEFAULT_SUPABASE_URL,
  DEFAULT_ANON_KEY
};
