/**
 * DACTOR Doctor Portal Personalized Live Queue
 * Interface Contracts, Behavioral Oracles & In-Memory Backend Simulator
 * Reference: ORIGINAL_REQUEST.md, PROJECT.md, SCOPE.md, TEST_INFRA.md
 *
 * CRITICAL CONSTRAINT: ZERO map, location, GPS, or geographical mapping features.
 * "Live tracker" refers strictly to token, position, and queue status tracking via QueueStatusScreen.
 */

const crypto = require('crypto');

// =============================================================================
// 1. CONSTANTS, ENUMS & SYSTEM CONFIGURATION
// =============================================================================

const CONTRACTS = {
  queueStatuses: {
    WAITING: 'waiting',
    INSIDE: 'inside',
    DONE: 'done',
    SKIPPED: 'skipped',
    NO_SHOW: 'no_show',
    CANCELLED: 'cancelled'
  },
  actorTypes: {
    DOCTOR: 'doctor',
    RECEPTIONIST: 'receptionist'
  },
  paymentModes: {
    ONLINE: 'ONLINE',
    PAY_AT_DESK: 'PAY_AT_DESK'
  },
  paymentStatuses: {
    PENDING: 'pending',
    PAID: 'paid',
    PARTIALLY_PAID: 'partially_paid',
    FAILED: 'failed'
  },
  approvalStatuses: {
    WAITING_FOR_APPROVAL: 'WAITING_FOR_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED'
  },
  notificationAlertTypes: {
    TURN_CALL: 'turn_call',
    ARRIVE_SOON: 'arrive_soon',
    CLINIC_BREAK: 'clinic_break',
    QUEUE_RESUMED: 'queue_resumed'
  },
  config: {
    defaultSlotCapacity: 12,
    cooldownDurationSeconds: 60,
    rateLimitMaxAlerts: 15,
    rateLimitWindowSeconds: 300,
    optimisticTimeoutMs: 15000,
    unlinkedWalkinLabel: 'Walk-in (No App Account)'
  }
};

// =============================================================================
// 2. IDENTIFIERS & VALIDATORS
// =============================================================================

function isValidUUID(str) {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

function generateUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isValidTrackingCode(code) {
  if (typeof code !== 'string') return false;
  return /^[1-9]\d{9}$/.test(code);
}

function generateTrackingCode() {
  const firstDigit = Math.floor(Math.random() * 9) + 1;
  const remaining = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  return `${firstDigit}${remaining}`;
}

// =============================================================================
// 3. MINIMAL PATIENT DATA PROJECTION & PII SANITIZATION
// =============================================================================

const SENSITIVE_PII_KEYS = [
  'patient_mobile',
  'mobile',
  'phone',
  'home_address',
  'address',
  'national_id_nin',
  'national_id',
  'credit_card_token',
  'credit_card',
  'gateway_transaction_secret',
  'transaction_secret',
  'billing_invoices',
  'diagnosis_history',
  'medical_notes'
];

/**
 * Strips all sensitive personal and financial identifiers from queue records
 * retaining strictly: name, age/gender, token number, position, slot time, and queue status.
 */
function sanitizeQueueEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  return {
    id: entry.id,
    appointment_id: entry.appointment_id || entry.id,
    patient_name: entry.patient_name || (entry.token_number ? `Patient #${entry.token_number}` : 'Patient'),
    patient_age: entry.patient_age !== undefined ? entry.patient_age : null,
    patient_gender: entry.patient_gender || null,
    token_number: entry.token_number,
    queue_position: entry.queue_position,
    status: entry.status,
    slot_time: entry.slot_time || '10:00 AM',
    doctor_id: entry.doctor_id,
    clinic_id: entry.clinic_id,
    appointment_date: entry.appointment_date,
    has_app_account: Boolean(entry.user_id && entry.user_id !== 'null' && entry.user_id.trim() !== ''),
    is_walkin: Boolean(entry.is_walkin),
    payment_mode: entry.payment_mode || CONTRACTS.paymentModes.ONLINE,
    payment_status: entry.payment_status || CONTRACTS.paymentStatuses.PAID,
    inside_at: entry.inside_at || null,
    completed_at: entry.completed_at || null,
    consultation_duration_seconds: entry.consultation_duration_seconds || 0
  };
}

/**
 * Validates that an object or log payload does NOT contain unmasked PII
 */
function assertNoPIIExposed(obj) {
  if (!obj) return;
  const jsonStr = JSON.stringify(obj);

  for (const key of SENSITIVE_PII_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== null && obj[key] !== undefined) {
      throw new Error(`PII Violation: Sensitive key "${key}" is exposed in client object`);
    }
  }

  // Check for raw 10-digit mobile phone numbers in values
  const phonePattern = /(?:\+977|977)?9[78]\d{8}/g;
  const matches = jsonStr.match(phonePattern);
  if (matches && matches.length > 0) {
    throw new Error(`PII Violation: Unmasked mobile number detected in payload: ${matches[0]}`);
  }
}

// =============================================================================
// 4. STRICT ZERO-MAP & ZERO-GPS DEEP LINK VALIDATOR
// =============================================================================

const FORBIDDEN_MAP_KEYWORDS = [
  'map',
  'maps',
  'mapview',
  'googlemap',
  'google.maps',
  'google_maps',
  'maplibre',
  'mapbox',
  'openstreetmap',
  'osm',
  'leaflet',
  'react-leaflet',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'gps',
  'geolocation',
  'geocoding',
  'locationmanager',
  'access_fine_location',
  'access_coarse_location',
  'coordinates',
  'coordinate',
  'location',
  'marker',
  'pin'
];

/**
 * Validates deep link FCM payloads and destination routes
 * enforcing strictly zero map, location, or GPS tracking components.
 * Destination route must match NavRoutes.QueueStatus (QueueStatusScreen)
 * and only token, queue position, and wait time may be tracked.
 */
function assertZeroMapDeepLink(fcmPayload, navigationRoute, componentTree = {}) {
  // Check FCM payload
  if (fcmPayload) {
    const data = fcmPayload.data || fcmPayload;
    if (data.navigate_to !== 'tracker') {
      throw new Error(`Invalid deep link: navigate_to must be "tracker", got "${data.navigate_to}"`);
    }
    if (!data.appointment_id && !data.tracking_code) {
      throw new Error('Invalid deep link: appointment_id or tracking_code is required');
    }

    // Verify absence of map properties in payload
    const payloadStr = JSON.stringify(fcmPayload).toLowerCase();
    for (const kw of FORBIDDEN_MAP_KEYWORDS) {
      const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`[\\b_\\./?\\-&=]${escapedKw}[\\b_\\./?\\-&=]|"${escapedKw}"|'${escapedKw}'|${escapedKw}:|:${escapedKw}`, 'i');
      if (regex.test(payloadStr) || payloadStr.includes(kw)) {
        throw new Error(`CRITICAL MAP VIOLATION: Forbidden keyword "${kw}" found in notification payload!`);
      }
    }
  }

  // Check Route
  if (navigationRoute) {
    const routeLower = navigationRoute.toLowerCase();
    const isValidRoute =
      routeLower.startsWith('queue_status/') ||
      routeLower === 'queuestatus' ||
      routeLower === 'queuestatusscreen' ||
      routeLower === 'navroutes.queuestatus' ||
      routeLower.startsWith('navroutes.queuestatus/');
    if (!isValidRoute) {
      throw new Error(`Invalid tracker route: expected QueueStatus route, got "${navigationRoute}"`);
    }
    for (const kw of FORBIDDEN_MAP_KEYWORDS) {
      const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`[\\b_\\./?\\-&=]${escapedKw}[\\b_\\./?\\-&=]|"${escapedKw}"|'${escapedKw}'|${escapedKw}:|:${escapedKw}`, 'i');
      if (regex.test(routeLower) || routeLower.includes(kw)) {
        throw new Error(`CRITICAL MAP VIOLATION: Forbidden keyword "${kw}" found in route name!`);
      }
    }
  }

  // Check UI component tree
  if (componentTree) {
    const compStr = JSON.stringify(componentTree).toLowerCase();
    for (const kw of FORBIDDEN_MAP_KEYWORDS) {
      const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`[\\b_\\./?\\-&=]${escapedKw}[\\b_\\./?\\-&=]|"${escapedKw}"|'${escapedKw}'|${escapedKw}:|:${escapedKw}`, 'i');
      if (regex.test(compStr) || compStr.includes(kw)) {
        throw new Error(`CRITICAL MAP VIOLATION: Forbidden component/widget "${kw}" found in tracker view!`);
      }
    }
  }

  return true;
}

// =============================================================================
// 5. SLOT CAPACITY & OVERLOAD CALCULATOR
// =============================================================================

function calculateSlotCapacity(bookedCount, maxCapacity = CONTRACTS.config.defaultSlotCapacity) {
  const booked = Math.max(0, parseInt(bookedCount, 10) || 0);
  const cap = Math.max(0, parseInt(maxCapacity, 10) || 0);

  if (cap === 0) {
    return {
      ratio: `${booked}/0`,
      displayText: `Emergency (${booked})`,
      isOverloaded: booked > 0,
      remaining: 0,
      overflowCount: booked
    };
  }

  const isOverloaded = booked > cap;
  const remaining = Math.max(0, cap - booked);
  const overflowCount = Math.max(0, booked - cap);

  return {
    ratio: `${booked}/${cap}`,
    displayText: `${booked}/${cap}`,
    isOverloaded,
    remaining,
    overflowCount
  };
}

// =============================================================================
// 6. DATE STRIP & MIDNIGHT ROLLOVER ORACLE
// =============================================================================

function getNepalDateString(date = new Date()) {
  // Nepal is UTC+5:45
  const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
  const nepalMs = utcMs + (5 * 3600000 + 45 * 60000);
  const nepalDate = new Date(nepalMs);

  const y = nepalDate.getFullYear();
  const m = String(nepalDate.getMonth() + 1).padStart(2, '0');
  const d = String(nepalDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateChip(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return {
    date: dateStr,
    weekday: weekdays[dt.getDay()],
    day: String(d),
    monthYear: `${months[dt.getMonth()]} ${y}`
  };
}

function detectMidnightRollover(previousDateStr, currentDateStr) {
  if (!previousDateStr || !currentDateStr) return false;
  return currentDateStr > previousDateStr;
}

// =============================================================================
// 7. COOLDOWN & ANTI-SPAM RATE LIMITERS
// =============================================================================

class CooldownManager {
  constructor(cooldownSeconds = CONTRACTS.config.cooldownDurationSeconds) {
    this.cooldownMs = cooldownSeconds * 1000;
    this.cooldowns = new Map(); // key -> startTimestamp (monotonic)
  }

  startCooldown(key, currentTimeMs = Date.now()) {
    this.cooldowns.set(key, currentTimeMs);
  }

  isCooldownActive(key, currentTimeMs = Date.now()) {
    const started = this.cooldowns.get(key);
    if (!started) return false;
    const elapsed = currentTimeMs - started;
    if (elapsed >= this.cooldownMs) {
      this.cooldowns.delete(key);
      return false;
    }
    return true;
  }

  getRemainingSeconds(key, currentTimeMs = Date.now()) {
    const started = this.cooldowns.get(key);
    if (!started) return 0;
    const elapsed = currentTimeMs - started;
    if (elapsed >= this.cooldownMs) {
      this.cooldowns.delete(key);
      return 0;
    }
    return Math.ceil((this.cooldownMs - elapsed) / 1000);
  }

  reset(key) {
    if (key) {
      this.cooldowns.delete(key);
    } else {
      this.cooldowns.clear();
    }
  }
}

class SecurityRateLimiter {
  constructor(limit = CONTRACTS.config.rateLimitMaxAlerts, windowSeconds = CONTRACTS.config.rateLimitWindowSeconds) {
    this.limit = limit;
    this.windowMs = windowSeconds * 1000;
    this.accessLog = new Map(); // key -> [timestamp, timestamp, ...]
  }

  consumeRateLimit(key, currentTimeMs = Date.now()) {
    const now = currentTimeMs;
    const windowStart = now - this.windowMs;

    let timestamps = this.accessLog.get(key) || [];
    // prune expired
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= this.limit) {
      this.accessLog.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetInSeconds: Math.ceil((timestamps[0] + this.windowMs - now) / 1000)
      };
    }

    timestamps.push(now);
    this.accessLog.set(key, timestamps);
    return {
      allowed: true,
      remaining: this.limit - timestamps.length,
      resetInSeconds: Math.ceil(this.windowMs / 1000)
    };
  }
}

// =============================================================================
// 8. REALTIME WEBSOCKET CHANNEL SIMULATOR
// =============================================================================

class RealtimeChannelSimulator {
  constructor(channelName) {
    this.channelName = channelName;
    this.subscribers = new Set();
    this.isDisposed = false;
    this.eventLog = [];
  }

  subscribe(listener) {
    if (this.isDisposed) {
      throw new Error(`Cannot subscribe to disposed channel "${this.channelName}"`);
    }
    this.subscribers.add(listener);
    return {
      unsubscribe: () => {
        this.subscribers.delete(listener);
      }
    };
  }

  broadcast(event, payload) {
    if (this.isDisposed) return;
    this.eventLog.push({ event, payload, timestamp: Date.now() });
    for (const listener of this.subscribers) {
      try {
        listener(event, payload);
      } catch (err) {
        // Suppress subscriber exceptions to emulate network isolation
      }
    }
  }

  dispose() {
    this.subscribers.clear();
    this.isDisposed = true;
  }

  get activeSubscriberCount() {
    return this.subscribers.size;
  }
}

// =============================================================================
// 9. IN-MEMORY DATABASE & RPC ORACLE
// =============================================================================

class DoctorLiveQueueBackendSimulator {
  constructor() {
    this.clinics = new Map();
    this.doctors = new Map();
    this.appointments = new Map();
    this.queueEntries = new Map();
    this.fcmTokens = new Map(); // userId -> Set of tokens
    this.notifications = [];
    this.channels = new Map(); // channelName -> RealtimeChannelSimulator

    this.cooldownManager = new CooldownManager();
    this.rateLimiter = new SecurityRateLimiter();
  }

  seedClinic(clinic) {
    this.clinics.set(clinic.id, {
      id: clinic.id,
      name: clinic.name || 'Default Clinic',
      is_open: clinic.is_open !== undefined ? clinic.is_open : true,
      is_on_break: clinic.is_on_break || false
    });
  }

  seedDoctor(doctor) {
    this.doctors.set(doctor.id, {
      id: doctor.id,
      clinic_id: doctor.clinic_id,
      full_name: doctor.full_name || 'Dr. Doctor',
      is_on_break: doctor.is_on_break || false,
      consultation_fee: doctor.consultation_fee || 500
    });
  }

  seedAppointment(appt) {
    const id = appt.id || generateUUID();
    const entry = {
      id,
      clinic_id: appt.clinic_id,
      doctor_id: appt.doctor_id,
      patient_name: appt.patient_name || 'Patient',
      patient_age: appt.patient_age || 30,
      patient_gender: appt.patient_gender || 'M',
      patient_mobile: appt.patient_mobile || null,
      home_address: appt.home_address || null,
      national_id_nin: appt.national_id_nin || null,
      user_id: appt.user_id !== undefined ? appt.user_id : null,
      is_walkin: Boolean(appt.is_walkin),
      payment_mode: appt.payment_mode || CONTRACTS.paymentModes.ONLINE,
      payment_status: appt.payment_status || CONTRACTS.paymentStatuses.PAID,
      status: appt.status || 'confirmed',
      checkin_status: appt.checkin_status || 'checked_in',
      appointment_date: appt.appointment_date || getNepalDateString(),
      slot_time: appt.slot_time || '10:00 AM',
      tracking_code: appt.tracking_code || generateTrackingCode(),
      billing_invoices: appt.billing_invoices || null,
      created_at: appt.created_at || new Date().toISOString()
    };
    this.appointments.set(id, entry);
    return entry;
  }

  seedQueueEntry(entry) {
    const id = entry.id || generateUUID();
    const qEntry = {
      id,
      appointment_id: entry.appointment_id || id,
      clinic_id: entry.clinic_id,
      doctor_id: entry.doctor_id,
      patient_name: entry.patient_name || 'Patient',
      patient_age: entry.patient_age || 30,
      patient_gender: entry.patient_gender || 'M',
      patient_mobile: entry.patient_mobile || null,
      user_id: entry.user_id !== undefined ? entry.user_id : null,
      is_walkin: Boolean(entry.is_walkin),
      token_number: entry.token_number !== undefined ? entry.token_number : 1,
      queue_position: entry.queue_position !== undefined ? entry.queue_position : 1,
      status: entry.status || CONTRACTS.queueStatuses.WAITING,
      slot_time: entry.slot_time || '10:00 AM',
      appointment_date: entry.appointment_date || getNepalDateString(),
      payment_mode: entry.payment_mode || CONTRACTS.paymentModes.ONLINE,
      payment_status: entry.payment_status || CONTRACTS.paymentStatuses.PAID,
      inside_at: entry.inside_at || null,
      completed_at: entry.completed_at || null,
      consultation_duration_seconds: entry.consultation_duration_seconds || 0,
      updated_by_actor_type: entry.updated_by_actor_type || null,
      updated_by_actor_id: entry.updated_by_actor_id || null,
      updated_at: entry.updated_at || new Date().toISOString()
    };
    this.queueEntries.set(id, qEntry);
    return qEntry;
  }

  seedFcmToken(userId, token) {
    if (!this.fcmTokens.has(userId)) {
      this.fcmTokens.set(userId, new Set());
    }
    this.fcmTokens.get(userId).add(token);
  }

  getChannel(channelName) {
    if (!this.channels.has(channelName)) {
      this.channels.set(channelName, new RealtimeChannelSimulator(channelName));
    }
    return this.channels.get(channelName);
  }

  // =========================================================================
  // ATOMIC RPC: transition_queue_entry_status
  // =========================================================================
  transitionQueueEntryStatus({ entryId, expectedStatus, newStatus, actorType, actorId }) {
    if (!isValidUUID(entryId)) {
      return { success: false, error: 'INVALID_ARGUMENT', message: 'Invalid entry UUID format' };
    }

    const entry = this.queueEntries.get(entryId);
    if (!entry) {
      return { success: false, error: 'NOT_FOUND', message: 'Queue entry not found' };
    }

    // Constraint: actorType must be doctor or receptionist
    if (actorType !== CONTRACTS.actorTypes.DOCTOR && actorType !== CONTRACTS.actorTypes.RECEPTIONIST) {
      return { success: false, error: 'CONSTRAINT_VIOLATION', message: 'Invalid actor type. Must be doctor or receptionist' };
    }

    // Constraint: cannot revert terminal status 'done' back to waiting
    if (entry.status === CONTRACTS.queueStatuses.DONE && newStatus === CONTRACTS.queueStatuses.WAITING) {
      return { success: false, error: 'INVALID_TRANSITION', message: 'Cannot revert completed consultation to waiting' };
    }

    // Atomic CAS check
    if (entry.status !== expectedStatus) {
      return {
        success: false,
        error: 'CONFLICT',
        message: 'This entry was just updated',
        current_status: entry.status
      };
    }

    // Execute state transition
    entry.status = newStatus;
    entry.updated_by_actor_type = actorType;
    entry.updated_by_actor_id = actorId;
    entry.updated_at = new Date().toISOString();

    if (newStatus === CONTRACTS.queueStatuses.INSIDE) {
      entry.inside_at = entry.inside_at || new Date().toISOString();
    } else if (newStatus === CONTRACTS.queueStatuses.DONE) {
      entry.completed_at = new Date().toISOString();
      if (entry.inside_at) {
        const start = new Date(entry.inside_at).getTime();
        const end = new Date(entry.completed_at).getTime();
        entry.consultation_duration_seconds = Math.max(1, Math.round((end - start) / 1000));
      } else {
        entry.consultation_duration_seconds = 300; // default 5m
      }
    }

    // Sync corresponding appointment if linked
    if (entry.appointment_id && this.appointments.has(entry.appointment_id)) {
      const appt = this.appointments.get(entry.appointment_id);
      if (newStatus === CONTRACTS.queueStatuses.DONE) {
        appt.status = 'completed';
      } else if (newStatus === CONTRACTS.queueStatuses.NO_SHOW) {
        appt.checkin_status = 'no_show';
      }
    }

    // Broadcast Realtime update
    const channelName = `doctor_live_queue_${entry.doctor_id}_${entry.clinic_id}`;
    if (this.channels.has(channelName)) {
      this.channels.get(channelName).broadcast('UPDATE', {
        table: 'queue_entries',
        record: sanitizeQueueEntry(entry)
      });
    }

    return {
      success: true,
      entry_id: entry.id,
      status: newStatus
    };
  }

  // =========================================================================
  // DOCTOR LIVE QUEUE QUERY & RLS EVALUATION
  // =========================================================================
  getDoctorLiveQueue({ doctorId, clinicId, date, callerRole = 'doctor', callerDoctorId = null }) {
    // RLS Enforcement:
    // If caller is doctor, callerDoctorId must match doctorId
    if (callerRole === 'doctor' && callerDoctorId && callerDoctorId !== doctorId) {
      return []; // RLS strictly filters out foreign doctor records
    }

    const results = [];
    for (const entry of this.queueEntries.values()) {
      if (entry.doctor_id !== doctorId || entry.clinic_id !== clinicId) {
        continue;
      }
      if (date && entry.appointment_date !== date) {
        continue;
      }

      // Check Pay-at-Desk quarantine rule:
      // If linked appointment is Pay-at-desk and not APPROVED, exclude it
      if (entry.appointment_id && this.appointments.has(entry.appointment_id)) {
        const appt = this.appointments.get(entry.appointment_id);
        if (appt.payment_mode === CONTRACTS.paymentModes.PAY_AT_DESK && appt.status === CONTRACTS.approvalStatuses.WAITING_FOR_APPROVAL) {
          continue; // Quarantine pending approval
        }
        if (appt.payment_mode === CONTRACTS.paymentModes.PAY_AT_DESK && appt.status === CONTRACTS.approvalStatuses.REJECTED) {
          continue; // Quarantined forever
        }
      }

      results.push(sanitizeQueueEntry(entry));
    }

    // Sort by queue_position
    results.sort((a, b) => a.queue_position - b.queue_position);
    return results;
  }

  getClinicQueueBoard({ clinicId, date }) {
    const results = [];
    for (const entry of this.queueEntries.values()) {
      if (entry.clinic_id !== clinicId) continue;
      if (date && entry.appointment_date !== date) continue;
      results.push(sanitizeQueueEntry(entry));
    }
    results.sort((a, b) => a.queue_position - b.queue_position);
    return results;
  }

  // =========================================================================
  // COMPACT STAT BOX COMPUTATION
  // =========================================================================
  computeStatBoxes({ doctorId, clinicId, date }) {
    let inConsultation = 0;
    let waitingInLobby = 0;
    let completedToday = 0;

    for (const entry of this.queueEntries.values()) {
      if (entry.doctor_id !== doctorId || entry.clinic_id !== clinicId) continue;
      if (date && entry.appointment_date !== date) continue;

      if (entry.status === CONTRACTS.queueStatuses.INSIDE) {
        inConsultation++;
      } else if (entry.status === CONTRACTS.queueStatuses.WAITING) {
        waitingInLobby++;
      } else if (entry.status === CONTRACTS.queueStatuses.DONE) {
        completedToday++;
      }
    }

    return {
      inConsultation,
      waitingInLobby,
      completedToday
    };
  }

  // =========================================================================
  // BREAK TOGGLE
  // =========================================================================
  toggleBreak({ clinicId, doctorId, isOnBreak }) {
    if (this.clinics.has(clinicId)) {
      this.clinics.get(clinicId).is_on_break = Boolean(isOnBreak);
    }
    if (doctorId && this.doctors.has(doctorId)) {
      this.doctors.get(doctorId).is_on_break = Boolean(isOnBreak);
    }

    // Broadcast to doctor channel
    if (doctorId && clinicId) {
      const channelName = `doctor_live_queue_${doctorId}_${clinicId}`;
      if (this.channels.has(channelName)) {
        this.channels.get(channelName).broadcast('clinic_break_updated', {
          clinic_id: clinicId,
          doctor_id: doctorId,
          is_on_break: Boolean(isOnBreak)
        });
      }
    }

    return {
      clinicId,
      doctorId,
      is_on_break: Boolean(isOnBreak)
    };
  }

  // =========================================================================
  // REORDER QUEUE
  // =========================================================================
  reorderQueue(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    const updated = [];
    entries.forEach((item, index) => {
      const newPos = index + 1;
      const qEntry = this.queueEntries.get(item.id);
      if (qEntry) {
        qEntry.queue_position = newPos;
        updated.push(sanitizeQueueEntry(qEntry));
      }
    });

    return updated;
  }

  // =========================================================================
  // DOCTOR PATIENT NOTIFICATION PIPELINE
  // =========================================================================
  sendDoctorNotification({ appointmentId, doctorId, alertType, currentTimeMs = Date.now() }) {
    if (!this.appointments.has(appointmentId)) {
      throw new Error('Appointment not found');
    }

    const appt = this.appointments.get(appointmentId);

    // Verify doctor ownership
    if (appt.doctor_id !== doctorId) {
      const err = new Error('Permission denied: Doctor does not own this appointment');
      err.code = 'PERMISSION_DENIED';
      err.status = 403;
      throw err;
    }

    // Verify status is valid for notification
    let queueStatus = null;
    for (const qe of this.queueEntries.values()) {
      if (qe.appointment_id === appointmentId) {
        queueStatus = qe.status;
        break;
      }
    }

    if (queueStatus && (queueStatus === CONTRACTS.queueStatuses.DONE || queueStatus === CONTRACTS.queueStatuses.NO_SHOW || queueStatus === CONTRACTS.queueStatuses.CANCELLED)) {
      const err = new Error('Cannot notify patient: status is no longer active');
      err.code = 'INVALID_QUEUE_STATUS';
      throw err;
    }

    // Verify app account exists
    const hasAccount = Boolean(appt.user_id && appt.user_id !== 'null' && appt.user_id.trim() !== '');
    if (!hasAccount) {
      const err = new Error('UNREGISTERED_PATIENT: Cannot send push notification to patient without app account');
      err.code = 'UNREGISTERED_PATIENT';
      throw err;
    }

    // Verify 60s cooldown
    if (this.cooldownManager.isCooldownActive(appointmentId, currentTimeMs)) {
      const remaining = this.cooldownManager.getRemainingSeconds(appointmentId, currentTimeMs);
      const err = new Error(`Cooldown active: Please wait ${remaining}s before sending another alert`);
      err.code = 'COOLDOWN_ACTIVE';
      err.remainingSeconds = remaining;
      throw err;
    }

    // Verify Rate Limiter (15 alerts per 5 min)
    const rateKey = `fcm:${appt.clinic_id}:${doctorId}`;
    const rateCheck = this.rateLimiter.consumeRateLimit(rateKey, currentTimeMs);
    if (!rateCheck.allowed) {
      const err = new Error('Rate limit reached. Please wait before sending more alerts.');
      err.code = 'RATE_LIMIT_EXCEEDED';
      err.status = 429;
      throw err;
    }

    // Start 60s cooldown
    this.cooldownManager.startCooldown(appointmentId, currentTimeMs);

    // Construct Zero-Map FCM Alert Payload
    const title = alertType === CONTRACTS.notificationAlertTypes.TURN_CALL
      ? '🔔 Doctor is Calling You Inside!'
      : '🏥 Doctor Live Queue: Your Turn is Approaching';

    const message = `Please proceed to consultation cabin for Dr. ${appt.patient_name || 'Patient'}.`;

    const fcmPayload = {
      data: {
        type: alertType || CONTRACTS.notificationAlertTypes.TURN_CALL,
        appointment_id: appointmentId,
        tracking_code: appt.tracking_code || '1000000001',
        title: title.slice(0, 100),
        message: message.slice(0, 250),
        navigate_to: 'tracker'
      }
    };

    // Assert strictly zero-map invariant on constructed payload
    assertZeroMapDeepLink(fcmPayload, `queue_status/${appointmentId}`);

    // Check FCM token count
    const tokens = appt.user_id && this.fcmTokens.has(appt.user_id)
      ? Array.from(this.fcmTokens.get(appt.user_id))
      : [];

    const record = {
      id: generateUUID(),
      appointment_id: appointmentId,
      user_id: appt.user_id,
      doctor_id: doctorId,
      clinic_id: appt.clinic_id,
      type: alertType,
      fcm_payload: fcmPayload,
      sent_count: tokens.length,
      created_at: new Date(currentTimeMs).toISOString()
    };

    this.notifications.push(record);

    return {
      success: true,
      notification_id: record.id,
      sent_count: tokens.length,
      fcm_payload: fcmPayload,
      cooldown_seconds: CONTRACTS.config.cooldownDurationSeconds
    };
  }
}

// =============================================================================
// 10. WEB APP PARITY CONTRACT VALIDATOR
// =============================================================================

function camelToSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function snakeToCamel(str) {
  return str.replace(/_([a-z0-9])/g, (_, l) => l.toUpperCase());
}

function normalizeType(val) {
  if (val === null || val === undefined) return 'any';
  if (typeof val === 'string') {
    const s = val.toLowerCase().trim();
    if (['string', 'text', 'uuid', 'date', 'instant', 'char'].includes(s)) return 'string';
    if (['int', 'integer', 'long', 'short', 'byte', 'double', 'float', 'number', 'numeric'].includes(s)) return 'number';
    if (['bool', 'boolean'].includes(s)) return 'boolean';
    if (['list', 'array', 'set'].includes(s)) return 'array';
    if (['map', 'object', 'json', 'jsonb'].includes(s)) return 'object';
    return 'string';
  }
  if (typeof val === 'number') return 'number';
  if (typeof val === 'boolean') return 'boolean';
  if (Array.isArray(val)) return 'array';
  if (typeof val === 'object') return 'object';
  return typeof val;
}

function areTypesCompatible(kVal, wVal) {
  const kType = normalizeType(kVal);
  const wType = normalizeType(wVal);
  if (kType === 'any' || wType === 'any') return true;
  return kType === wType;
}

function parseModelDefinition(model) {
  const map = new Map();
  let isExplicitlyTyped = false;

  if (Array.isArray(model)) {
    for (const item of model) {
      if (typeof item === 'string') {
        map.set(item, null);
      } else if (item && typeof item === 'object' && item.name) {
        map.set(item.name, item.type !== undefined ? item.type : null);
        if (item.type !== undefined) isExplicitlyTyped = true;
      }
    }
  } else if (model && typeof model === 'object') {
    for (const [key, val] of Object.entries(model)) {
      map.set(key, val);
      isExplicitlyTyped = true;
    }
  }

  return { map, isExplicitlyTyped };
}

function validateWebParityContract(kotlinModel = null, webModel = null) {
  const defaultKotlinFields = [
    'id', 'appointmentId', 'patientName', 'tokenNumber', 'queuePosition',
    'status', 'slotTime', 'hasAppAccount', 'isWalkin', 'paymentMode', 'paymentStatus'
  ];

  const defaultTypeScriptFields = [
    'id', 'appointment_id', 'patient_name', 'token_number', 'queue_position',
    'status', 'slot_time', 'has_app_account', 'is_walkin', 'payment_mode', 'payment_status'
  ];

  // Retain backward-compatible default return when called without arguments
  if (kotlinModel === null && webModel === null) {
    return {
      isParityCompliant: true,
      error: null,
      fieldCount: defaultKotlinFields.length,
      parityFieldsMapped: defaultTypeScriptFields.length,
      missingInWeb: [],
      missingInKotlin: [],
      typeMismatches: []
    };
  }

  const kInput = kotlinModel !== null ? kotlinModel : defaultKotlinFields;
  const wInput = webModel !== null ? webModel : defaultTypeScriptFields;

  const kParsed = parseModelDefinition(kInput);
  const wParsed = parseModelDefinition(wInput);

  const missingInWeb = [];
  const missingInKotlin = [];
  const typeMismatches = [];
  let matchedCount = 0;

  // Build lookup maps for web model
  const wKeyMap = new Map();
  for (const [wKey, wVal] of wParsed.map.entries()) {
    wKeyMap.set(wKey, { origKey: wKey, val: wVal });
    wKeyMap.set(wKey.toLowerCase(), { origKey: wKey, val: wVal });
    wKeyMap.set(snakeToCamel(wKey), { origKey: wKey, val: wVal });
    wKeyMap.set(camelToSnake(wKey), { origKey: wKey, val: wVal });
  }

  // Check each Kotlin field against Web
  const matchedWebKeys = new Set();
  for (const [kKey, kVal] of kParsed.map.entries()) {
    const kSnake = camelToSnake(kKey);
    const kLower = kKey.toLowerCase();

    let match = wKeyMap.get(kSnake) || wKeyMap.get(kKey) || wKeyMap.get(kLower);
    if (!match) {
      missingInWeb.push(kKey);
    } else {
      matchedCount++;
      matchedWebKeys.add(match.origKey);

      // Check type compatibility if types are provided
      if ((kParsed.isExplicitlyTyped || wParsed.isExplicitlyTyped) &&
          kVal !== null && kVal !== undefined &&
          match.val !== null && match.val !== undefined) {
        if (!areTypesCompatible(kVal, match.val)) {
          typeMismatches.push({
            kotlinField: kKey,
            webField: match.origKey,
            kotlinType: kVal,
            webType: match.val
          });
        }
      }
    }
  }

  // Check which Web fields are missing in Kotlin
  const kKeyMap = new Map();
  for (const [kKey, kVal] of kParsed.map.entries()) {
    kKeyMap.set(kKey, { origKey: kKey, val: kVal });
    kKeyMap.set(kKey.toLowerCase(), { origKey: kKey, val: kVal });
    kKeyMap.set(camelToSnake(kKey), { origKey: kKey, val: kVal });
    kKeyMap.set(snakeToCamel(kKey), { origKey: kKey, val: kVal });
  }

  for (const [wKey] of wParsed.map.entries()) {
    if (!matchedWebKeys.has(wKey)) {
      const wCamel = snakeToCamel(wKey);
      const wLower = wKey.toLowerCase();
      const match = kKeyMap.get(wCamel) || kKeyMap.get(wKey) || kKeyMap.get(wLower);
      if (!match) {
        missingInKotlin.push(wKey);
      }
    }
  }

  const isParityCompliant = missingInWeb.length === 0 && missingInKotlin.length === 0 && typeMismatches.length === 0;

  let error = null;
  if (!isParityCompliant) {
    const parts = [];
    if (missingInWeb.length > 0) parts.push(`Missing in Web: [${missingInWeb.join(', ')}]`);
    if (missingInKotlin.length > 0) parts.push(`Missing in Kotlin: [${missingInKotlin.join(', ')}]`);
    if (typeMismatches.length > 0) {
      const details = typeMismatches.map(m => `${m.kotlinField}(${m.kotlinType}) <-> ${m.webField}(${m.webType})`);
      parts.push(`Type mismatches: [${details.join(', ')}]`);
    }
    error = `Web Parity Contract Violation: ${parts.join('; ')}`;
  }

  return {
    isParityCompliant,
    error,
    fieldCount: kParsed.map.size,
    parityFieldsMapped: matchedCount,
    missingInWeb,
    missingInKotlin,
    typeMismatches
  };
}

module.exports = {
  CONTRACTS,
  isValidUUID,
  generateUUID,
  isValidTrackingCode,
  generateTrackingCode,
  sanitizeQueueEntry,
  assertNoPIIExposed,
  assertZeroMapDeepLink,
  calculateSlotCapacity,
  getNepalDateString,
  formatDateChip,
  detectMidnightRollover,
  CooldownManager,
  SecurityRateLimiter,
  RealtimeChannelSimulator,
  DoctorLiveQueueBackendSimulator,
  validateWebParityContract
};
