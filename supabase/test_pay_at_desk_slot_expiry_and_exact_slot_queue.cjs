/**
 * Verification Test Suite: Pay at Desk Confirm - Past Date Auto-Expiry & Exact Slot Queue Placement
 * Target: supabase/migration_pay_at_desk_slot_expiry_and_exact_slot_queue.sql
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const MIGRATION_PATH = path.join(__dirname, 'migration_pay_at_desk_slot_expiry_and_exact_slot_queue.sql');

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
};

class TestSuite {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    this.failed = 0;
  }

  assert(condition, desc, reason = '') {
    if (condition) {
      this.passed++;
      console.log(`  ${ANSI.green}✓ [PASS]${ANSI.reset} ${desc}`);
    } else {
      this.failed++;
      console.log(`  ${ANSI.red}✗ [FAIL]${ANSI.reset} ${desc}`);
      if (reason) console.log(`     ${ANSI.yellow}Reason: ${reason}${ANSI.reset}`);
    }
  }

  summary() {
    console.log(`\n${ANSI.bold}=== ${this.name} Results ===${ANSI.reset}`);
    console.log(`Passed: ${ANSI.green}${this.passed}${ANSI.reset} | Failed: ${this.failed > 0 ? ANSI.red : ANSI.green}${this.failed}${ANSI.reset}\n`);
    if (this.failed > 0) process.exit(1);
  }
}

function runTests() {
  const suite = new TestSuite('Pay at Desk Confirm - Date Expiry & Exact Slot Queue');

  console.log(`${ANSI.cyan}1. Verifying SQL Migration Structure & Safety Guardrails${ANSI.reset}`);
  assert.ok(fs.existsSync(MIGRATION_PATH), 'Migration SQL file exists');
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  suite.assert(sql.includes('CREATE OR REPLACE FUNCTION public.approve_pay_at_desk_appointment('), 'Defines approve_pay_at_desk_appointment RPC');
  suite.assert(sql.includes("NOW() AT TIME ZONE 'Asia/Kathmandu'"), 'Uses Nepal timezone (Asia/Kathmandu)');
  suite.assert(sql.includes('IF v_effective_date < v_today_ktm THEN'), 'Rule 1 checks effective slot/appointment date < today');
  suite.assert(sql.includes("status = 'EXPIRED'") && sql.includes("checkin_status = 'cancelled'"), 'Rule 1 expires and cancels past-date request');
  suite.assert(sql.includes('DELETE FROM public.queue_entries WHERE appointment_id = v_appt.id;'), 'Rule 1 purges any stray queue entry');
  suite.assert(sql.includes("'expired', true"), 'Rule 1 returns expired: true');
  suite.assert(sql.includes('IF v_effective_date > v_today_ktm THEN'), 'Handles future-date appointments without polluting today queue');
  suite.assert(sql.includes('v_slot_passed := (v_target_end_time < v_time_ktm);'), 'Evaluates slot end_time < current Nepal time');
  suite.assert(sql.includes('v_next_position := v_inside_count + 1;'), 'Rule 2 puts passed-slot patient at top of waiting queue (after inside)');
  suite.assert(sql.includes('v_next_position := v_last_match_idx + 1;'), 'Rule 3 puts non-passed slot patient at exact end of same slot');
  suite.assert(sql.includes('SET queue_position = -(100000 + v_idx)'), 'Uses collision-safe two-pass negative offset reindexing');
  suite.assert(sql.includes("GRANT EXECUTE ON FUNCTION public.approve_pay_at_desk_appointment(UUID, UUID) TO anon, authenticated, service_role;"), 'Grants execute permission to mobile and web roles');

  console.log(`\n${ANSI.cyan}2. Algorithmic Simulation of All 4 Edge Scenarios${ANSI.reset}`);

  function simulateRpc(state, appt, nowDate, nowTime) {
    const slot = appt.slot_id ? state.slots[appt.slot_id] : null;
    const effectiveDate = slot ? slot.slot_date : appt.appointment_date;
    const targetStartTime = slot ? slot.start_time : appt.appointment_time;
    const targetEndTime = slot ? slot.end_time : appt.appointment_time;

    // Rule 1: Date passed
    if (effectiveDate < nowDate) {
      appt.status = 'EXPIRED';
      appt.checkin_status = 'cancelled';
      state.queue = state.queue.filter(q => q.appointment_id !== appt.id);
      return { success: true, expired: true, status: 'EXPIRED' };
    }

    appt.status = 'APPROVED';
    appt.checkin_status = 'checked_in';
    if (slot) {
      slot.booked_count += 1; // Overbooking allowed
    }

    // Future date
    if (effectiveDate > nowDate) {
      return { success: true, expired: false, is_future_date: true, status: 'APPROVED', queue_position: 1 };
    }

    const slotPassed = targetEndTime < nowTime;
    const activeToday = state.queue
      .filter(q => q.date === nowDate && ['waiting', 'inside'].includes(q.status) && q.appointment_id !== appt.id)
      .sort((a, b) => {
        const aIn = a.status === 'inside' ? 0 : 1;
        const bIn = b.status === 'inside' ? 0 : 1;
        if (aIn !== bIn) return aIn - bIn;
        return a.queue_position - b.queue_position;
      });

    let insideCount = 0;
    let lastMatchIdx = 0;

    activeToday.forEach((row, index) => {
      const idx = index + 1;
      if (row.status === 'inside') {
        insideCount++;
        lastMatchIdx = idx;
      } else if (!slotPassed) {
        const rowSlot = row.slot_id ? state.slots[row.slot_id] : null;
        const rowStart = rowSlot ? rowSlot.start_time : row.appointment_time;
        if ((appt.slot_id && row.slot_id === appt.slot_id) || rowStart <= targetStartTime) {
          lastMatchIdx = idx;
        }
      }
    });

    const nextPosition = slotPassed ? (insideCount + 1) : (lastMatchIdx + 1);

    activeToday.forEach((row, index) => {
      const idx = index + 1;
      row.queue_position = idx < nextPosition ? idx : idx + 1;
    });

    state.queue.push({
      appointment_id: appt.id,
      slot_id: appt.slot_id,
      appointment_time: targetStartTime,
      date: nowDate,
      queue_position: nextPosition,
      status: 'waiting',
    });

    return { success: true, expired: false, is_future_date: false, status: 'APPROVED', queue_position: nextPosition, slot_passed: slotPassed };
  }

  // Case 1: Past date -> expired/cancelled
  const s1 = {
    slots: { 's-past': { slot_date: '2026-11-10', start_time: '10:00:00', end_time: '11:00:00', booked_count: 1, max_capacity: 5 } },
    queue: [],
  };
  const aPast = { id: 'a-past', slot_id: 's-past', appointment_date: '2026-11-10', appointment_time: '10:00:00' };
  const r1 = simulateRpc(s1, aPast, '2026-11-11', '10:30:00');
  suite.assert(r1.expired === true && aPast.status === 'EXPIRED' && aPast.checkin_status === 'cancelled', 'Scenario 1: Past slot date automatically expires & cancels request');
  suite.assert(s1.slots['s-past'].booked_count === 1 && s1.queue.length === 0, 'Scenario 1: Does not increment booked_count or enqueue expired request');

  // Case 2: Today & slot passed -> top of queue (respecting active inside patient)
  const s2 = {
    slots: {
      's-09': { slot_date: '2026-11-11', start_time: '09:00:00', end_time: '10:00:00', booked_count: 1, max_capacity: 5 },
      's-10': { slot_date: '2026-11-11', start_time: '10:00:00', end_time: '11:00:00', booked_count: 2, max_capacity: 5 },
    },
    queue: [
      { appointment_id: 'q-inside', slot_id: 's-09', date: '2026-11-11', queue_position: 1, status: 'inside' },
      { appointment_id: 'q-wait1', slot_id: 's-10', date: '2026-11-11', queue_position: 2, status: 'waiting' },
      { appointment_id: 'q-wait2', slot_id: 's-10', date: '2026-11-11', queue_position: 3, status: 'waiting' },
    ],
  };
  const aLate = { id: 'a-late', slot_id: 's-09', appointment_date: '2026-11-11', appointment_time: '09:00:00' };
  const r2 = simulateRpc(s2, aLate, '2026-11-11', '10:30:00');
  suite.assert(r2.slot_passed === true && r2.queue_position === 2, 'Scenario 2: Passed slot placed at top of waiting queue (pos #2 behind inside #1)');
  suite.assert(s2.queue.find(q => q.appointment_id === 'q-wait1').queue_position === 3, 'Scenario 2: Existing waiting patients shifted down properly');

  // Case 2b: Passed slot with no one inside -> Position 1
  const s2b = {
    slots: { 's-09': { slot_date: '2026-11-11', start_time: '09:00:00', end_time: '10:00:00', booked_count: 0, max_capacity: 5 }, 's-10': { slot_date: '2026-11-11', start_time: '10:00:00', end_time: '11:00:00', booked_count: 1, max_capacity: 5 } },
    queue: [{ appointment_id: 'q-w1', slot_id: 's-10', date: '2026-11-11', queue_position: 1, status: 'waiting' }],
  };
  const r2b = simulateRpc(s2b, { id: 'a-late-2', slot_id: 's-09', appointment_date: '2026-11-11' }, '2026-11-11', '10:30:00');
  suite.assert(r2b.queue_position === 1 && s2b.queue.find(q => q.appointment_id === 'q-w1').queue_position === 2, 'Scenario 2b: Passed slot takes Pos #1 when nobody is inside');

  // Case 3: Active slot not passed -> exact end of same slot (with overbooking allowed)
  const s3 = {
    slots: {
      's-10': { slot_date: '2026-11-11', start_time: '10:00:00', end_time: '11:00:00', booked_count: 2, max_capacity: 2 },
      's-11': { slot_date: '2026-11-11', start_time: '11:00:00', end_time: '12:00:00', booked_count: 1, max_capacity: 5 },
    },
    queue: [
      { appointment_id: 'q-10a', slot_id: 's-10', date: '2026-11-11', queue_position: 1, status: 'inside' },
      { appointment_id: 'q-10b', slot_id: 's-10', date: '2026-11-11', queue_position: 2, status: 'waiting' },
      { appointment_id: 'q-11a', slot_id: 's-11', date: '2026-11-11', queue_position: 3, status: 'waiting' },
    ],
  };
  const aSame = { id: 'a-same', slot_id: 's-10', appointment_date: '2026-11-11', appointment_time: '10:00:00' };
  const r3 = simulateRpc(s3, aSame, '2026-11-11', '10:30:00');
  suite.assert(r3.slot_passed === false && r3.queue_position === 3, 'Scenario 3: Non-passed slot placed at exact end of same slot (pos #3)');
  suite.assert(s3.queue.find(q => q.appointment_id === 'q-11a').queue_position === 4, 'Scenario 3: Later 11:00 slot shifted down from #3 to #4');
  suite.assert(s3.slots['s-10'].booked_count === 3, 'Scenario 3: Overbooking allowed (booked_count 3 > max_capacity 2)');

  // Case 4: Future date -> approved, slot incremented, NOT inserted into today queue
  const s4 = {
    slots: { 's-tmrw': { slot_date: '2026-11-12', start_time: '10:00:00', end_time: '11:00:00', booked_count: 0, max_capacity: 5 } },
    queue: [],
  };
  const r4 = simulateRpc(s4, { id: 'a-tmrw', slot_id: 's-tmrw', appointment_date: '2026-11-12' }, '2026-11-11', '10:30:00');
  suite.assert(r4.is_future_date === true && s4.slots['s-tmrw'].booked_count === 1 && s4.queue.length === 0, 'Scenario 4: Future date approved & capacity updated without polluting today live queue');

  suite.summary();
}

runTests();
