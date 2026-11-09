/**
 * DACTOR Platform: Pay at Desk Formal Interface Contracts & Behavioral Oracles
 * Reference: docs/pay-at-desk-spec.md, ORIGINAL_REQUEST.md (2026-10-25T10:54:51Z),
 * supabase/migration_pay_at_desk.sql, orchestrator_10/plan.md.
 */

const crypto = require('crypto');

// =============================================================================
// 1. SYSTEM CONSTANTS & STATUS ENUMS
// =============================================================================
const CONTRACTS = {
  statuses: {
    WAITING_FOR_APPROVAL: 'WAITING_FOR_APPROVAL',
    APPROVED: 'APPROVED',
    UNAPPROVED: 'UNAPPROVED',
    EXPIRED: 'EXPIRED'
  },
  paymentModes: {
    ONLINE: 'ONLINE',
    PAY_AT_DESK: 'PAY_AT_DESK'
  },
  paymentStatuses: {
    PENDING: 'pending',
    PAID: 'paid',
    FAILED: 'failed'
  },
  checkinStatuses: {
    NOT_CHECKED_IN: 'not_checked_in',
    CHECKED_IN: 'checked_in',
    CANCELLED: 'cancelled'
  },
  queueStatuses: {
    WAITING: 'waiting',
    INSIDE: 'inside',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },
  config: {
    defaultServiceChargePercent: 5.0,
    maxRetryAttempts: 3,
    attempt3ExpiryDays: 2,
    rateLimitMaxPerHour: 5,
    maxActivePendingPerClinic: 3
  }
};

// =============================================================================
// 2. MATHEMATICAL & FINANCIAL ORACLES
// =============================================================================

/**
 * Calculates 5% platform service charge strictly rounded to 2 decimal places
 * PostgreSQL: round(v_fee * (v_pct / 100.0), 2)
 */
function calculateServiceCharge(fee, percent = CONTRACTS.config.defaultServiceChargePercent) {
  if (typeof fee !== 'number' || Number.isNaN(fee) || fee <= 0) {
    return 0.00;
  }
  const pct = typeof percent === 'number' && percent >= 0 ? percent : CONTRACTS.config.defaultServiceChargePercent;
  const charge = fee * (pct / 100.0);
  return Math.round((charge + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates total amount due at desk (consultation fee + service charge)
 */
function calculateTotalAmount(fee, serviceCharge) {
  const f = typeof fee === 'number' && fee >= 0 ? fee : 0.00;
  const sc = typeof serviceCharge === 'number' && serviceCharge >= 0 ? serviceCharge : 0.00;
  return Math.round((f + sc + Number.EPSILON) * 100) / 100;
}

/**
 * Formats monetary amounts strictly to two decimal places string (e.g. "1050.00")
 */
function formatMoney(amount) {
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  return num.toFixed(2);
}

// =============================================================================
// 3. CODE & IDENTIFIER GENERATORS & VALIDATORS
// =============================================================================

/**
 * Generates a valid unique 10-digit tracking code (starts with 1-9)
 */
function generateTrackingCode10() {
  const firstDigit = Math.floor(Math.random() * 9) + 1; // 1-9
  const remaining = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  return `${firstDigit}${remaining}`;
}

/**
 * Validates a 10-digit tracking code
 */
function isValidTrackingCode10(code) {
  if (typeof code !== 'string') return false;
  return /^[1-9]\d{9}$/.test(code);
}

/**
 * Validates standard UUID v4 format
 */
function isValidUUID(id) {
  if (typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Sanitizes and validates Nepal mobile number (10 digits starting with 9)
 */
function sanitizeNepalMobile(phone) {
  if (typeof phone !== 'string') return null;
  const cleaned = phone.replace(/\D/g, '');
  if (/^9\d{9}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

// =============================================================================
// 4. OVERLOAD RULE & QUEUE CAPACITY ORACLE (RULE 7)
// =============================================================================

/**
 * Evaluates slot capacity overload rule
 * Approval ALWAYS adds patient to exact requested slot even if full (12/12 -> 13/12).
 * UI displays slot as Full without crashing or emitting negative availability.
 */
function evaluateSlotCapacity(maxCapacity, currentBooked, isApproval = false) {
  let newBooked = currentBooked;
  if (isApproval) {
    newBooked = currentBooked + 1;
  }
  const isFull = newBooked >= maxCapacity;
  const remaining = Math.max(0, maxCapacity - newBooked); // Never negative!
  const displayRatio = `${newBooked}/${maxCapacity}`;
  const uiLabel = isFull ? 'FULL' : `${remaining} slots left`;

  return {
    maxCapacity,
    bookedCount: newBooked,
    remainingCount: remaining,
    isFull,
    displayRatio,
    uiLabel,
    isOverloaded: newBooked > maxCapacity
  };
}

// =============================================================================
// 5. STATE TRANSITION MACHINE & LIFECYCLE INVARIANTS
// =============================================================================

const ALLOWED_TRANSITIONS = {
  [CONTRACTS.statuses.WAITING_FOR_APPROVAL]: [
    CONTRACTS.statuses.APPROVED,
    CONTRACTS.statuses.UNAPPROVED,
    CONTRACTS.statuses.EXPIRED
  ],
  [CONTRACTS.statuses.UNAPPROVED]: [
    CONTRACTS.statuses.WAITING_FOR_APPROVAL // Allowed only when attempt_number < 3
  ],
  [CONTRACTS.statuses.APPROVED]: [], // Terminal active state
  [CONTRACTS.statuses.EXPIRED]: []   // Terminal closed state
};

function canTransition(currentStatus, targetStatus, currentAttempt = 1) {
  if (!ALLOWED_TRANSITIONS[currentStatus]) return false;
  if (!ALLOWED_TRANSITIONS[currentStatus].includes(targetStatus)) return false;

  // Unapproved -> Waiting For Approval requires attempt < 3
  if (currentStatus === CONTRACTS.statuses.UNAPPROVED && targetStatus === CONTRACTS.statuses.WAITING_FOR_APPROVAL) {
    if (currentAttempt >= CONTRACTS.config.maxRetryAttempts) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// 6. IN-MEMORY APPOINTMENT LIFECYCLE ORACLE (BACKEND EMULATOR)
// =============================================================================

class PayAtDeskBackendSimulator {
  constructor() {
    this.appointments = new Map();
    this.queueEntries = new Map();
    this.slots = new Map();
    this.doctors = new Map();
    this.clinics = new Map();
    this.notifications = [];
  }

  seedClinic(clinic) {
    this.clinics.set(clinic.id, {
      id: clinic.id,
      name: clinic.name || 'Test Clinic',
      contact_email: clinic.contact_email || 'clinic@dactor.com',
      verification_status: clinic.verification_status || 'approved',
      is_archived: false
    });
  }

  seedDoctor(doctor) {
    this.doctors.set(doctor.id, {
      id: doctor.id,
      clinic_id: doctor.clinic_id,
      full_name: doctor.full_name || 'Dr. Specialist',
      email: doctor.email || 'doctor@dactor.com',
      specialty: doctor.specialty || 'General',
      consultation_fee: typeof doctor.consultation_fee === 'number' ? doctor.consultation_fee : 500.00,
      kyc_status: 'approved'
    });
  }

  seedSlot(slot) {
    this.slots.set(slot.id, {
      id: slot.id,
      clinic_id: slot.clinic_id,
      doctor_id: slot.doctor_id,
      slot_date: slot.slot_date || new Date().toISOString().slice(0, 10),
      start_time: slot.start_time || '10:00:00',
      end_time: slot.end_time || '11:00:00',
      max_capacity: slot.max_capacity || 12,
      booked_count: slot.booked_count || 0
    });
  }

  seedAppointment(appt) {
    this.appointments.set(appt.id, { ...appt });
  }

  /**
   * Simulates confirm_pay_at_desk_booking RPC
   */
  confirmPayAtDeskBooking(appointmentId, clientSuppliedFee = null, callerRole = 'anon') {
    if (!isValidUUID(appointmentId)) {
      throw new Error(`Invalid appointment UUID: ${appointmentId}`);
    }

    const appt = this.appointments.get(appointmentId);
    if (!appt) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    if (appt.payment_status === CONTRACTS.paymentStatuses.PAID) {
      throw new Error(`Appointment ${appointmentId} is already paid`);
    }

    if (appt.checkin_status === CONTRACTS.checkinStatuses.CANCELLED) {
      throw new Error(`Appointment ${appointmentId} is cancelled`);
    }

    // Authoritative fee retrieval (prevents client tampering)
    const doctor = this.doctors.get(appt.doctor_id);
    const authoritativeFee = doctor ? doctor.consultation_fee : (appt.fee_amount || 500.00);

    const serviceCharge = calculateServiceCharge(authoritativeFee);
    const totalAmount = calculateTotalAmount(authoritativeFee, serviceCharge);

    // Atomic update
    appt.payment_mode = CONTRACTS.paymentModes.PAY_AT_DESK;
    appt.status = CONTRACTS.statuses.WAITING_FOR_APPROVAL;
    appt.payment_status = CONTRACTS.paymentStatuses.PENDING;
    appt.checkin_status = CONTRACTS.checkinStatuses.NOT_CHECKED_IN;
    appt.attempt_number = 1;
    appt.expires_at = null;
    appt.fee_amount = authoritativeFee;
    appt.service_charge_amount = serviceCharge;
    appt.total_amount = totalAmount;
    appt.updated_at = new Date().toISOString();

    // Ensure not in queue
    this.queueEntries.delete(appointmentId);

    return {
      success: true,
      appointment_id: appt.id,
      tracking_code: appt.tracking_code_10_digit,
      tracking_code_10_digit: appt.tracking_code_10_digit,
      status: appt.status,
      payment_mode: appt.payment_mode,
      payment_status: appt.payment_status,
      checkin_status: appt.checkin_status,
      attempt_number: appt.attempt_number,
      fee_amount: appt.fee_amount,
      service_charge_amount: appt.service_charge_amount,
      total_amount: appt.total_amount
    };
  }

  /**
   * Simulates list_pending_pay_at_desk_requests RPC
   */
  listPendingPayAtDeskRequests(clinicId, callerEmail, callerRole) {
    if (!isValidUUID(clinicId)) {
      throw new Error(`Invalid clinic UUID: ${clinicId}`);
    }

    const clinic = this.clinics.get(clinicId);
    if (!clinic) {
      throw new Error(`Clinic ${clinicId} not found`);
    }

    // Role check: Only clinic staff or super admin
    const isSuperAdmin = callerRole === 'super_admin';
    const isClinicStaff = callerEmail && clinic.contact_email && (callerEmail.toLowerCase() === clinic.contact_email.toLowerCase());

    if (!isSuperAdmin && !isClinicStaff) {
      throw new Error(`Access denied: Caller is not authorized to view pending requests for clinic ${clinicId}`);
    }

    const results = [];
    for (const appt of this.appointments.values()) {
      if (appt.clinic_id === clinicId &&
          appt.payment_mode === CONTRACTS.paymentModes.PAY_AT_DESK &&
          appt.status === CONTRACTS.statuses.WAITING_FOR_APPROVAL) {
        const doctor = this.doctors.get(appt.doctor_id) || {};
        results.push({
          id: appt.id,
          tracking_code_10_digit: appt.tracking_code_10_digit,
          clinic_id: appt.clinic_id,
          doctor_id: appt.doctor_id,
          doctor_name: doctor.full_name || 'General Doctor',
          doctor_specialty: doctor.specialty || 'Consultation',
          patient_name: appt.patient_name,
          patient_mobile: appt.patient_mobile,
          appointment_date: appt.appointment_date,
          appointment_time: appt.appointment_time,
          fee_amount: appt.fee_amount,
          service_charge_amount: appt.service_charge_amount,
          total_amount: appt.total_amount,
          attempt_number: appt.attempt_number,
          status: appt.status,
          payment_mode: appt.payment_mode,
          expires_at: appt.expires_at,
          created_at: appt.created_at
        });
      }
    }

    // Sort chronologically (FIFO)
    return results.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  /**
   * Simulates approve_pay_at_desk_appointment RPC
   */
  approvePayAtDeskAppointment(appointmentId, callerClinicId, callerEmail, callerRole) {
    if (!isValidUUID(appointmentId)) {
      throw new Error(`Invalid appointment UUID: ${appointmentId}`);
    }

    const appt = this.appointments.get(appointmentId);
    if (!appt) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    const clinic = this.clinics.get(appt.clinic_id);
    const isSuperAdmin = callerRole === 'super_admin';
    const isClinicStaff = callerEmail && clinic && (callerEmail.toLowerCase() === clinic.contact_email.toLowerCase());

    if (!isSuperAdmin && !isClinicStaff) {
      throw new Error(`Access denied: Caller is not authorized to approve appointments for clinic ${appt.clinic_id}`);
    }

    if (callerClinicId && callerClinicId !== appt.clinic_id) {
      throw new Error(`Mismatched clinic ID: Appointment does not belong to clinic ${callerClinicId}`);
    }

    if (appt.status !== CONTRACTS.statuses.WAITING_FOR_APPROVAL) {
      throw new Error(`Cannot approve appointment with status ${appt.status}: must be WAITING_FOR_APPROVAL`);
    }

    // Check slot expiry / past time
    const slotDateTime = new Date(`${appt.appointment_date}T${appt.appointment_time}`);
    if (slotDateTime.getTime() < Date.now() - 300000) { // 5-minute grace
      appt.status = CONTRACTS.statuses.EXPIRED;
      appt.updated_at = new Date().toISOString();
      throw new Error('Cannot approve: Appointment slot time has passed. Marked as EXPIRED');
    }

    if (appt.expires_at && new Date(appt.expires_at).getTime() < Date.now()) {
      appt.status = CONTRACTS.statuses.EXPIRED;
      appt.updated_at = new Date().toISOString();
      throw new Error('Cannot approve: Request has expired. Marked as EXPIRED');
    }

    // Transition to APPROVED
    appt.status = CONTRACTS.statuses.APPROVED;
    appt.approved_at = new Date().toISOString();
    appt.checkin_status = CONTRACTS.checkinStatuses.CHECKED_IN;
    appt.updated_at = new Date().toISOString();

    // Overload Rule: slot booked count increments
    if (appt.slot_id && this.slots.has(appt.slot_id)) {
      const slot = this.slots.get(appt.slot_id);
      slot.booked_count += 1;
    }

    // Add to live queue
    const existingPositions = Array.from(this.queueEntries.values())
      .filter(q => q.clinic_id === appt.clinic_id && (q.status === 'waiting' || q.status === 'inside'))
      .map(q => q.queue_position);
    const nextPosition = existingPositions.length > 0 ? Math.max(...existingPositions) + 1 : 1;

    this.queueEntries.set(appt.id, {
      appointment_id: appt.id,
      clinic_id: appt.clinic_id,
      doctor_id: appt.doctor_id,
      queue_position: nextPosition,
      status: 'waiting',
      created_at: new Date().toISOString()
    });

    return {
      success: true,
      appointment: { ...appt },
      queue_position: nextPosition
    };
  }

  /**
   * Simulates reject_pay_at_desk_appointment RPC
   */
  rejectPayAtDeskAppointment(appointmentId, callerClinicId, callerEmail, callerRole, reason = null) {
    if (!isValidUUID(appointmentId)) {
      throw new Error(`Invalid appointment UUID: ${appointmentId}`);
    }

    const appt = this.appointments.get(appointmentId);
    if (!appt) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    const clinic = this.clinics.get(appt.clinic_id);
    const isSuperAdmin = callerRole === 'super_admin';
    const isClinicStaff = callerEmail && clinic && (callerEmail.toLowerCase() === clinic.contact_email.toLowerCase());

    if (!isSuperAdmin && !isClinicStaff) {
      throw new Error(`Access denied: Caller is not authorized to reject appointments for clinic ${appt.clinic_id}`);
    }

    if (callerClinicId && callerClinicId !== appt.clinic_id) {
      throw new Error(`Mismatched clinic ID: Appointment does not belong to clinic ${callerClinicId}`);
    }

    if (appt.status !== CONTRACTS.statuses.WAITING_FOR_APPROVAL) {
      throw new Error(`Cannot reject appointment with status ${appt.status}: must be WAITING_FOR_APPROVAL`);
    }

    appt.status = CONTRACTS.statuses.UNAPPROVED;
    appt.rejected_at = new Date().toISOString();
    appt.checkin_status = CONTRACTS.checkinStatuses.CANCELLED;
    appt.updated_at = new Date().toISOString();

    return {
      success: true,
      appointment: { ...appt },
      reason
    };
  }

  /**
   * Simulates retry_pay_at_desk_appointment RPC
   */
  retryPayAtDeskAppointment(appointmentId, patientMobile = null, callerEmail = null, callerRole = null) {
    if (!isValidUUID(appointmentId)) {
      throw new Error(`Invalid appointment UUID: ${appointmentId}`);
    }

    const appt = this.appointments.get(appointmentId);
    if (!appt) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    const clinic = this.clinics.get(appt.clinic_id);
    const isSuperAdmin = callerRole === 'super_admin';
    const isClinicStaff = callerEmail && clinic && (callerEmail.toLowerCase() === clinic.contact_email.toLowerCase());
    const isMatchingPhone = patientMobile && sanitizeNepalMobile(patientMobile) === sanitizeNepalMobile(appt.patient_mobile);
    const isMatchingEmail = callerEmail && appt.patient_email && (callerEmail.toLowerCase() === appt.patient_email.toLowerCase());

    if (!isSuperAdmin && !isClinicStaff && !isMatchingPhone && !isMatchingEmail) {
      throw new Error(`Access denied: Caller is not authorized to retry appointment ${appointmentId}`);
    }

    if (appt.status !== CONTRACTS.statuses.UNAPPROVED) {
      throw new Error(`Cannot retry appointment with status ${appt.status}: must be UNAPPROVED`);
    }

    if (appt.attempt_number >= CONTRACTS.config.maxRetryAttempts) {
      throw new Error(`Cannot retry: Maximum of 3 attempts exceeded for appointment ${appointmentId}`);
    }

    const newAttempt = appt.attempt_number + 1;
    let expiresAt = null;

    // Rule 6: On the 3rd attempt, set expires_at = now + 2 days
    if (newAttempt === CONTRACTS.config.maxRetryAttempts) {
      const d = new Date();
      d.setDate(d.getDate() + CONTRACTS.config.attempt3ExpiryDays);
      expiresAt = d.toISOString();
    }

    appt.status = CONTRACTS.statuses.WAITING_FOR_APPROVAL;
    appt.attempt_number = newAttempt;
    appt.expires_at = expiresAt;
    appt.checkin_status = CONTRACTS.checkinStatuses.NOT_CHECKED_IN;
    appt.rejected_at = null;
    appt.updated_at = new Date().toISOString();

    return {
      success: true,
      appointment: { ...appt }
    };
  }

  /**
   * Simulates expire_pay_at_desk_appointments RPC
   */
  expirePayAtDeskAppointments(callerRole = 'anon') {
    if (callerRole !== 'service_role' && callerRole !== 'super_admin') {
      throw new Error('Access denied: Global expiry is strictly restricted to scheduled service_role tasks or platform administrators');
    }

    let count = 0;
    const now = Date.now();

    for (const appt of this.appointments.values()) {
      if (appt.payment_mode === CONTRACTS.paymentModes.PAY_AT_DESK &&
          appt.status === CONTRACTS.statuses.WAITING_FOR_APPROVAL) {
        let shouldExpire = false;

        // Condition 1: 3rd attempt 2-day timer passed
        if (appt.expires_at && new Date(appt.expires_at).getTime() < now) {
          shouldExpire = true;
        }

        // Condition 2: Slot date + time has passed
        const slotDateTime = new Date(`${appt.appointment_date}T${appt.appointment_time}`);
        if (slotDateTime.getTime() < now) {
          shouldExpire = true;
        }

        if (shouldExpire) {
          appt.status = CONTRACTS.statuses.EXPIRED;
          appt.checkin_status = CONTRACTS.checkinStatuses.CANCELLED;
          appt.updated_at = new Date().toISOString();
          count++;
        }
      }
    }

    return count;
  }
}

module.exports = {
  CONTRACTS,
  calculateServiceCharge,
  calculateTotalAmount,
  formatMoney,
  generateTrackingCode10,
  isValidTrackingCode10,
  isValidUUID,
  sanitizeNepalMobile,
  evaluateSlotCapacity,
  canTransition,
  PayAtDeskBackendSimulator
};
