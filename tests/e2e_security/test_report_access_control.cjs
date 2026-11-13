/**
 * Automated Test Suite: Report Access Control via Google Email Matching & Rate-Limited Phone Confirmation
 * Validates:
 * 1. Direct access without confirmation when Google email matches appointment patient_email.
 * 2. Mobile number confirmation requirement when unauthenticated (guest) or email mismatch.
 * 3. Exact 10-digit mobile number verification.
 * 4. Multi-attempt rate limiting with 5-attempt ceiling and 15-minute sliding lockout.
 * 5. Attempt counter decrement and cooldown expiration.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('======================================================================');
console.log('  REPORT ACCESS CONTROL & RATE-LIMITED CONFIRMATION TEST SUITE');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  √ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  X [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Simulated Models & Engine
// ---------------------------------------------------------------------------

const MAX_REPORT_PHONE_ATTEMPTS = 5;
const REPORT_PHONE_LOCKOUT_MS = 15 * 60 * 1000;

class RateLimitStore {
  constructor() {
    this.store = new Map();
  }

  get(trackingCode, now = Date.now()) {
    const raw = this.store.get(trackingCode);
    if (!raw) {
      return { attempts: 0, remainingAttempts: MAX_REPORT_PHONE_ATTEMPTS, isLocked: false, remainingSeconds: 0 };
    }
    if (raw.lockedUntil && now < raw.lockedUntil) {
      return {
        attempts: raw.attempts,
        remainingAttempts: 0,
        isLocked: true,
        remainingSeconds: Math.ceil((raw.lockedUntil - now) / 1000),
      };
    }
    if (raw.lockedUntil && now >= raw.lockedUntil) {
      this.store.delete(trackingCode);
      return { attempts: 0, remainingAttempts: MAX_REPORT_PHONE_ATTEMPTS, isLocked: false, remainingSeconds: 0 };
    }
    const remaining = Math.max(0, MAX_REPORT_PHONE_ATTEMPTS - raw.attempts);
    return {
      attempts: raw.attempts,
      remainingAttempts: remaining,
      isLocked: remaining <= 0,
      remainingSeconds: 0,
    };
  }

  recordAttempt(trackingCode, success, now = Date.now()) {
    if (success) {
      this.store.delete(trackingCode);
      return { attempts: 0, remainingAttempts: MAX_REPORT_PHONE_ATTEMPTS, isLocked: false, remainingSeconds: 0 };
    }
    const current = this.get(trackingCode, now);
    const newAttempts = current.attempts + 1;
    const isLocked = newAttempts >= MAX_REPORT_PHONE_ATTEMPTS;
    const lockedUntil = isLocked ? now + REPORT_PHONE_LOCKOUT_MS : null;
    this.store.set(trackingCode, { attempts: newAttempts, lockedUntil });
    return {
      attempts: newAttempts,
      remainingAttempts: Math.max(0, MAX_REPORT_PHONE_ATTEMPTS - newAttempts),
      isLocked,
      remainingSeconds: isLocked ? Math.ceil(REPORT_PHONE_LOCKOUT_MS / 1000) : 0,
    };
  }
}

function evaluateReportAccess({
  appointment,
  currentUserGoogleEmail,
  phoneAttempt,
  rateLimiter,
  currentTime = Date.now(),
}) {
  const patientEmail = (appointment.patient_email || '').trim().toLowerCase();
  const userEmail = (currentUserGoogleEmail || '').trim().toLowerCase();

  // 1. Check direct access: Google email match
  if (userEmail && patientEmail && userEmail === patientEmail) {
    return {
      directAccess: true,
      requiresPhoneConfirmation: false,
      authorized: true,
      reason: 'google_email_match',
    };
  }

  // 2. Fallback: Phone confirmation required
  if (!phoneAttempt) {
    const rlState = rateLimiter.get(appointment.tracking_code, currentTime);
    return {
      directAccess: false,
      requiresPhoneConfirmation: true,
      authorized: false,
      isLocked: rlState.isLocked,
      remainingAttempts: rlState.remainingAttempts,
      remainingSeconds: rlState.remainingSeconds,
      reason: 'awaiting_phone_confirmation',
    };
  }

  // Check rate limit before evaluating phone
  const preCheck = rateLimiter.get(appointment.tracking_code, currentTime);
  if (preCheck.isLocked) {
    return {
      directAccess: false,
      requiresPhoneConfirmation: true,
      authorized: false,
      isLocked: true,
      rateLimited: true,
      remainingAttempts: 0,
      remainingSeconds: preCheck.remainingSeconds,
      reason: 'rate_limited',
    };
  }

  const cleanPhone = String(phoneAttempt).replace(/\D/g, '').slice(-10);
  const cleanExpected = String(appointment.patient_mobile).replace(/\D/g, '').slice(-10);

  if (cleanPhone.length === 10 && cleanPhone === cleanExpected) {
    rateLimiter.recordAttempt(appointment.tracking_code, true, currentTime);
    return {
      directAccess: false,
      requiresPhoneConfirmation: true,
      authorized: true,
      reason: 'phone_verified',
    };
  }

  // Failed attempt
  const postFail = rateLimiter.recordAttempt(appointment.tracking_code, false, currentTime);
  return {
    directAccess: false,
    requiresPhoneConfirmation: true,
    authorized: false,
    isLocked: postFail.isLocked,
    rateLimited: postFail.isLocked,
    remainingAttempts: postFail.remainingAttempts,
    remainingSeconds: postFail.remainingSeconds,
    reason: postFail.isLocked ? 'rate_limited' : 'phone_mismatch',
  };
}

// ---------------------------------------------------------------------------
// TEST SUITE CASES
// ---------------------------------------------------------------------------

test('AC1.1: Direct access granted without confirmation when Google email matches patient_email exactly', () => {
  const rl = new RateLimitStore();
  const appt = { tracking_code: '9841234567', patient_email: 'patient.shrestha@gmail.com', patient_mobile: '9841000000' };
  const res = evaluateReportAccess({
    appointment: appt,
    currentUserGoogleEmail: 'patient.shrestha@gmail.com',
    rateLimiter: rl,
  });

  assert.strictEqual(res.authorized, true);
  assert.strictEqual(res.directAccess, true);
  assert.strictEqual(res.requiresPhoneConfirmation, false);
  assert.strictEqual(res.reason, 'google_email_match');
});

test('AC1.2: Direct access is case-insensitive and trims whitespace on emails', () => {
  const rl = new RateLimitStore();
  const appt = { tracking_code: '9841234567', patient_email: 'Patient.Shrestha@Gmail.COM  ', patient_mobile: '9841000000' };
  const res = evaluateReportAccess({
    appointment: appt,
    currentUserGoogleEmail: '  patient.shrestha@gmail.com',
    rateLimiter: rl,
  });

  assert.strictEqual(res.authorized, true);
  assert.strictEqual(res.directAccess, true);
  assert.strictEqual(res.requiresPhoneConfirmation, false);
});

test('AC2.1: Phone confirmation required when user is an unauthenticated guest (no Google login)', () => {
  const rl = new RateLimitStore();
  const appt = { tracking_code: '9841234567', patient_email: 'patient.shrestha@gmail.com', patient_mobile: '9841000000' };
  const res = evaluateReportAccess({
    appointment: appt,
    currentUserGoogleEmail: null,
    rateLimiter: rl,
  });

  assert.strictEqual(res.authorized, false);
  assert.strictEqual(res.directAccess, false);
  assert.strictEqual(res.requiresPhoneConfirmation, true);
  assert.strictEqual(res.remainingAttempts, 5);
  assert.strictEqual(res.isLocked, false);
});

test('AC2.2: Phone confirmation required when logged-in Google email does NOT match appointment patient_email', () => {
  const rl = new RateLimitStore();
  const appt = { tracking_code: '9841234567', patient_email: 'patient.shrestha@gmail.com', patient_mobile: '9841000000' };
  const res = evaluateReportAccess({
    appointment: appt,
    currentUserGoogleEmail: 'family.member@gmail.com',
    rateLimiter: rl,
  });

  assert.strictEqual(res.authorized, false);
  assert.strictEqual(res.directAccess, false);
  assert.strictEqual(res.requiresPhoneConfirmation, true);
});

test('AC2.3: Phone confirmation succeeds when correct 10-digit mobile number is supplied', () => {
  const rl = new RateLimitStore();
  const appt = { tracking_code: '9841234567', patient_email: 'patient.shrestha@gmail.com', patient_mobile: '9841000000' };
  const res = evaluateReportAccess({
    appointment: appt,
    currentUserGoogleEmail: 'family.member@gmail.com',
    phoneAttempt: '9841000000',
    rateLimiter: rl,
  });

  assert.strictEqual(res.authorized, true);
  assert.strictEqual(res.directAccess, false);
  assert.strictEqual(res.reason, 'phone_verified');
});

test('AC3.1: Incorrect phone attempt decrements remaining attempts counter', () => {
  const rl = new RateLimitStore();
  const appt = { tracking_code: '9841234567', patient_email: 'patient.shrestha@gmail.com', patient_mobile: '9841000000' };

  // Attempt 1
  const res1 = evaluateReportAccess({
    appointment: appt,
    currentUserGoogleEmail: null,
    phoneAttempt: '9841111111',
    rateLimiter: rl,
  });
  assert.strictEqual(res1.authorized, false);
  assert.strictEqual(res1.remainingAttempts, 4);
  assert.strictEqual(res1.isLocked, false);

  // Attempt 2
  const res2 = evaluateReportAccess({
    appointment: appt,
    currentUserGoogleEmail: null,
    phoneAttempt: '9841222222',
    rateLimiter: rl,
  });
  assert.strictEqual(res2.authorized, false);
  assert.strictEqual(res2.remainingAttempts, 3);
  assert.strictEqual(res2.isLocked, false);
});

test('AC3.2: 5th consecutive incorrect phone attempt triggers 15-minute lockout', () => {
  const rl = new RateLimitStore();
  const appt = { tracking_code: '9841234567', patient_email: 'patient.shrestha@gmail.com', patient_mobile: '9841000000' };

  for (let i = 1; i <= 4; i++) {
    const res = evaluateReportAccess({
      appointment: appt,
      currentUserGoogleEmail: null,
      phoneAttempt: `984100000${i}`,
      rateLimiter: rl,
    });
    assert.strictEqual(res.isLocked, false);
    assert.strictEqual(res.remainingAttempts, 5 - i);
  }

  // 5th attempt
  const res5 = evaluateReportAccess({
    appointment: appt,
    currentUserGoogleEmail: null,
    phoneAttempt: '9841000099',
    rateLimiter: rl,
  });
  assert.strictEqual(res5.authorized, false);
  assert.strictEqual(res5.isLocked, true);
  assert.strictEqual(res5.rateLimited, true);
  assert.strictEqual(res5.remainingAttempts, 0);
  assert.strictEqual(res5.remainingSeconds, 900); // 15 minutes
});

test('AC3.3: In locked state, even correct phone number is rejected until lockout expires', () => {
  const rl = new RateLimitStore();
  const appt = { tracking_code: '9841234567', patient_email: 'patient.shrestha@gmail.com', patient_mobile: '9841000000' };
  const baseTime = Date.now();

  // Exhaust 5 attempts
  for (let i = 1; i <= 5; i++) {
    evaluateReportAccess({
      appointment: appt,
      currentUserGoogleEmail: null,
      phoneAttempt: `984199999${i}`,
      rateLimiter: rl,
      currentTime: baseTime,
    });
  }

  // Try correct phone 2 minutes later (within 15-minute lock)
  const lockedRes = evaluateReportAccess({
    appointment: appt,
    currentUserGoogleEmail: null,
    phoneAttempt: '9841000000', // Correct phone
    rateLimiter: rl,
    currentTime: baseTime + 2 * 60 * 1000,
  });

  assert.strictEqual(lockedRes.authorized, false, 'Must be locked even with correct phone');
  assert.strictEqual(lockedRes.rateLimited, true);
  assert.strictEqual(lockedRes.isLocked, true);
});

test('AC3.4: After 15 minutes (900s), lockout expires and attempts reset to 5', () => {
  const rl = new RateLimitStore();
  const appt = { tracking_code: '9841234567', patient_email: 'patient.shrestha@gmail.com', patient_mobile: '9841000000' };
  const baseTime = Date.now();

  // Exhaust 5 attempts
  for (let i = 1; i <= 5; i++) {
    evaluateReportAccess({
      appointment: appt,
      currentUserGoogleEmail: null,
      phoneAttempt: `984199999${i}`,
      rateLimiter: rl,
      currentTime: baseTime,
    });
  }

  // 15 minutes + 1 second later
  const afterLockoutTime = baseTime + (15 * 60 + 1) * 1000;
  const expiredRes = evaluateReportAccess({
    appointment: appt,
    currentUserGoogleEmail: null,
    phoneAttempt: null, // Just checking initial state
    rateLimiter: rl,
    currentTime: afterLockoutTime,
  });

  assert.strictEqual(expiredRes.isLocked, false);
  assert.strictEqual(expiredRes.remainingAttempts, 5);

  // Now entering correct phone succeeds
  const unlockRes = evaluateReportAccess({
    appointment: appt,
    currentUserGoogleEmail: null,
    phoneAttempt: '9841000000',
    rateLimiter: rl,
    currentTime: afterLockoutTime,
  });
  assert.strictEqual(unlockRes.authorized, true);
  assert.strictEqual(unlockRes.reason, 'phone_verified');
});

test('AC3.5: Successful phone verification cleans up rate limit state', () => {
  const rl = new RateLimitStore();
  const appt = { tracking_code: '9841234567', patient_email: 'patient.shrestha@gmail.com', patient_mobile: '9841000000' };

  // 2 failed attempts
  evaluateReportAccess({ appointment: appt, currentUserGoogleEmail: null, phoneAttempt: '9841111111', rateLimiter: rl });
  evaluateReportAccess({ appointment: appt, currentUserGoogleEmail: null, phoneAttempt: '9841222222', rateLimiter: rl });
  assert.strictEqual(rl.get(appt.tracking_code).remainingAttempts, 3);

  // Successful attempt
  const successRes = evaluateReportAccess({ appointment: appt, currentUserGoogleEmail: null, phoneAttempt: '9841000000', rateLimiter: rl });
  assert.strictEqual(successRes.authorized, true);

  // State should be completely cleared and reset to 5
  assert.strictEqual(rl.get(appt.tracking_code).remainingAttempts, 5);
  assert.strictEqual(rl.get(appt.tracking_code).attempts, 0);
});

// ---------------------------------------------------------------------------
// REPORT TEST SUMMARY
// ---------------------------------------------------------------------------

console.log('\n======================================================================');
console.log(`  ACCESS CONTROL TESTS SUMMARY: ${passedTests}/${totalTests} Passed (${passedTests === totalTests ? 'ALL PASS' : 'SOME FAILED'})`);
console.log('======================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
