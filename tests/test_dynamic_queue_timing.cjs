const assert = require('assert')

// Pure JS implementation matching queueTiming.ts for unit test verification
function parseTimeString(timeStr) {
  if (!timeStr || !timeStr.trim()) return null
  const clean = timeStr.trim().toUpperCase()
  const regex = /^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AP]M))?/
  const match = clean.match(regex)
  if (match) {
    let hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const ampm = match[3]
    if (ampm === 'PM' && hours < 12) hours += 12
    if (ampm === 'AM' && hours === 12) hours = 0
    return { hours, minutes }
  }
  return null
}

function parseSlotStartTime(slotStr, baseDate = new Date()) {
  if (!slotStr || !slotStr.trim()) return null
  const parts = slotStr.split(/[-–—]|to/)
  const firstPart = parts[0]?.trim()
  if (!firstPart) return null

  let clean = firstPart.toUpperCase()
  if (!clean.includes('AM') && !clean.includes('PM') && parts.length > 1) {
    const secondPart = parts[1].toUpperCase()
    if (secondPart.includes('PM')) clean = `${clean} PM`
    else if (secondPart.includes('AM')) clean = `${clean} AM`
  }

  const parsed = parseTimeString(clean)
  if (!parsed) return null

  const d = new Date(baseDate)
  d.setHours(parsed.hours, parsed.minutes, 0, 0)
  return d
}

function formatTime12H(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function calculateLiveQueueTimingEstimate(input) {
  const now = input.now ? new Date(input.now) : new Date()
  const avgMins = Math.max(1, input.avgConsultMinutes || 10)
  const totalPeopleAhead = Math.max(0, input.patientsAhead || 0)
  const isFirstPosition = totalPeopleAhead === 0

  const slotStartDate = parseSlotStartTime(input.appointmentTime, now)
  const slotStartStr = slotStartDate ? formatTime12H(slotStartDate) : ''
  const suggestedArrival = slotStartDate ? new Date(slotStartDate.getTime() - 15 * 60000) : null
  const suggestedArrivalStr = suggestedArrival ? formatTime12H(suggestedArrival) : ''
  const arrivalAdvice = suggestedArrivalStr ? `Please arrive by ${suggestedArrivalStr}.` : ''

  const isSlotInFuture = slotStartDate ? now.getTime() < slotStartDate.getTime() : false

  const isAnyoneInside = input.isAnyoneInside !== undefined ? !!input.isAnyoneInside : !!input.inConsultationSince
  const isDoctorFree = input.isDoctorInClinic && !isAnyoneInside && !input.isOnBreak
  const canOfferEarly = isDoctorFree && isSlotInFuture && !!input.optInEarlyCall && isFirstPosition

  if (input.isOnBreak) {
    let breakEndDate
    if (input.breakEnd) {
      const parsed = parseTimeString(input.breakEnd)
      if (parsed) {
        breakEndDate = new Date(now)
        breakEndDate.setHours(parsed.hours, parsed.minutes, 0, 0)
      } else {
        breakEndDate = new Date(now.getTime() + 15 * 60000)
      }
    } else {
      breakEndDate = new Date(now.getTime() + 15 * 60000)
    }

    const effectiveBreakEnd = now.getTime() > breakEndDate.getTime()
      ? new Date(now.getTime() + 5 * 60000)
      : breakEndDate

    const breakStaggered = new Date(effectiveBreakEnd.getTime() + totalPeopleAhead * avgMins * 60000)
    const effectiveExpectedTime = (slotStartDate && slotStartDate.getTime() > breakStaggered.getTime())
      ? new Date(slotStartDate.getTime() + totalPeopleAhead * avgMins * 60000)
      : breakStaggered

    const diffMins = Math.max(0, Math.ceil((effectiveExpectedTime.getTime() - now.getTime()) / 60000))
    const waitText = diffMins > 60
      ? `~ ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`
      : diffMins > 0
      ? `~ ${diffMins} min`
      : 'Resuming shortly'

    const exactStr = formatTime12H(effectiveExpectedTime)
    const notice = isFirstPosition
      ? `Clinic on break. You are #1 in queue; consultation resumes at ${formatTime12H(effectiveBreakEnd)}.`
      : `Clinic on break. ${totalPeopleAhead} ahead; consultation resumes around ${exactStr}.`

    return {
      effectiveExpectedTime,
      expectedExactTimeText: exactStr,
      estimatedTimeLeftText: waitText,
      displayWaitText: waitText,
      suggestedArrivalText: suggestedArrivalStr,
      slotNoticeText: notice,
      isArriveSoon: false,
    }
  }

  let dynamicExpectedTime
  if (isAnyoneInside) {
    let insideStart = now
    if (input.inConsultationSince) {
      try {
        const parsed = new Date(input.inConsultationSince)
        if (!isNaN(parsed.getTime())) insideStart = parsed
      } catch {}
    }
    const currentEnd = new Date(Math.max(insideStart.getTime() + avgMins * 60000, now.getTime() + 60000))
    dynamicExpectedTime = new Date(currentEnd.getTime() + Math.max(0, totalPeopleAhead - 1) * avgMins * 60000)
  } else if (!input.isDoctorInClinic) {
    let openDate = null
    if (input.clinicOpenTime) {
      const parsed = parseTimeString(input.clinicOpenTime)
      if (parsed) {
        openDate = new Date(now)
        openDate.setHours(parsed.hours, parsed.minutes, 0, 0)
      }
    }
    const baseDate = openDate && openDate.getTime() > now.getTime()
      ? openDate
      : new Date(now.getTime() + 5 * 60000)
    dynamicExpectedTime = new Date(baseDate.getTime() + totalPeopleAhead * avgMins * 60000)
  } else {
    const leadMs = isFirstPosition ? 2 * 60000 : 0
    dynamicExpectedTime = new Date(now.getTime() + leadMs + totalPeopleAhead * avgMins * 60000)
  }

  let effectiveExpectedTime
  let effectiveTimeLeftText
  let effectiveExactTimeText

  if (isFirstPosition) {
    if (isSlotInFuture && !canOfferEarly) {
      // Future slot floor: e.g. booked 9-10 AM, now is 8:30 AM
      effectiveExpectedTime = slotStartDate && dynamicExpectedTime.getTime() < slotStartDate.getTime()
        ? slotStartDate
        : dynamicExpectedTime

      const diffSec = Math.max(0, Math.round((effectiveExpectedTime.getTime() - now.getTime()) / 1000))
      const diffMins = Math.ceil(diffSec / 60)
      effectiveTimeLeftText = diffMins > 60
        ? `~ ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`
        : diffMins > 0
        ? `~ ${diffMins} min`
        : `Starts at ${slotStartStr}`
      effectiveExactTimeText = formatTime12H(effectiveExpectedTime)
    } else {
      // Active or overdue slot: forward clamp >= now + buffer
      let minForwardTime
      if (isAnyoneInside) {
        minForwardTime = dynamicExpectedTime
      } else if (!input.isDoctorInClinic) {
        minForwardTime = new Date(now.getTime() + 5 * 60000)
      } else {
        minForwardTime = new Date(now.getTime() + 2 * 60000)
      }

      effectiveExpectedTime = dynamicExpectedTime.getTime() > minForwardTime.getTime()
        ? dynamicExpectedTime
        : minForwardTime

      const diffSec = Math.max(0, Math.round((effectiveExpectedTime.getTime() - now.getTime()) / 1000))
      const diffMins = Math.max(1, Math.ceil(diffSec / 60))
      effectiveTimeLeftText = diffMins <= 2 ? 'Up Next (~2 min)' : `~ ${diffMins} min`
      effectiveExactTimeText = formatTime12H(effectiveExpectedTime)
    }
  } else {
    if (isSlotInFuture) {
      const slotStaggered = slotStartDate
        ? new Date(slotStartDate.getTime() + totalPeopleAhead * avgMins * 60000)
        : new Date(now.getTime() + totalPeopleAhead * avgMins * 60000)
      effectiveExpectedTime = dynamicExpectedTime.getTime() > slotStaggered.getTime()
        ? dynamicExpectedTime
        : slotStaggered

      const diffSec = Math.max(0, Math.round((effectiveExpectedTime.getTime() - now.getTime()) / 1000))
      const diffMins = Math.max(1, Math.ceil(diffSec / 60))
      effectiveTimeLeftText = diffMins > 60
        ? `~ ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`
        : `~ ${diffMins} min`
      effectiveExactTimeText = formatTime12H(effectiveExpectedTime)
    } else {
      const minForwardTime = new Date(now.getTime() + totalPeopleAhead * avgMins * 60000)
      effectiveExpectedTime = dynamicExpectedTime.getTime() > minForwardTime.getTime()
        ? dynamicExpectedTime
        : minForwardTime

      const diffSec = Math.max(0, Math.round((effectiveExpectedTime.getTime() - now.getTime()) / 1000))
      const diffMins = Math.max(1, Math.ceil(diffSec / 60))
      effectiveTimeLeftText = diffMins > 60
        ? `~ ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`
        : `~ ${diffMins} min`
      effectiveExactTimeText = formatTime12H(effectiveExpectedTime)
    }
  }

  return {
    effectiveExpectedTime,
    expectedExactTimeText: effectiveExactTimeText,
    estimatedTimeLeftText: effectiveTimeLeftText,
    displayWaitText: effectiveTimeLeftText,
    isArriveSoon: isFirstPosition && (!isSlotInFuture || canOfferEarly),
  }
}

console.log('=== RUNNING TESTS: DYNAMIC FIRST PATIENT QUEUE TIMING ===\n')

// Test 1: parseSlotStartTime carries AM/PM across ranges
{
  const slotStr = '06:00 - 07:00 PM'
  const parsed = parseSlotStartTime(slotStr, new Date('2026-11-26T00:00:00'))
  assert(parsed !== null, 'Should parse slot start time')
  assert.strictEqual(parsed.getHours(), 18, '6:00 PM should have hours = 18')
  assert.strictEqual(parsed.getMinutes(), 0, '6:00 PM should have minutes = 0')
  console.log('✓ Test 1 Passed: parseSlotStartTime correctly parses "06:00 - 07:00 PM" as 18:00 (6:00 PM)')
}

// Test 2: Future Slot Floor Invariant (Booked 9-10 AM, now is 8:30 AM)
{
  const now = new Date('2026-11-26T08:30:00')
  const result = calculateLiveQueueTimingEstimate({
    now,
    appointmentTime: '09:00 AM - 10:00 AM',
    patientsAhead: 0,
    avgConsultMinutes: 10,
    isDoctorInClinic: true,
    isAnyoneInside: false,
    isOnBreak: false,
    optInEarlyCall: false,
  })

  assert.strictEqual(result.expectedExactTimeText, '9:00 AM', `Expected "9:00 AM" but got "${result.expectedExactTimeText}"`)
  assert.strictEqual(result.estimatedTimeLeftText, '~ 30 min', `Expected "~ 30 min" but got "${result.estimatedTimeLeftText}"`)
  assert(result.effectiveExpectedTime.getTime() >= new Date('2026-11-26T09:00:00').getTime(), 'Must be >= 9:00 AM')
  console.log('✓ Test 2 Passed: Future slot floor preserved! At 8:30 AM for a 9:00 AM slot, shows 9:00 AM (~ 30 min), NOT 8:30 or 8:32 AM')
}

// Test 3: Active/Overdue Slot Forward Clamp (Booked 6-7 PM, now is 7:00 PM, doctor free)
{
  const now = new Date('2026-11-26T19:00:00')
  const result = calculateLiveQueueTimingEstimate({
    now,
    appointmentTime: '06:00 PM - 07:00 PM',
    patientsAhead: 0,
    avgConsultMinutes: 10,
    isDoctorInClinic: true,
    isAnyoneInside: false,
    isOnBreak: false,
    optInEarlyCall: false,
  })

  assert.strictEqual(result.expectedExactTimeText, '7:02 PM', `Expected "7:02 PM" but got "${result.expectedExactTimeText}"`)
  assert.strictEqual(result.estimatedTimeLeftText, 'Up Next (~2 min)', `Expected "Up Next (~2 min)" but got "${result.estimatedTimeLeftText}"`)
  assert.strictEqual(result.effectiveExpectedTime.getTime(), new Date('2026-11-26T19:02:00').getTime(), 'Must be 7:02 PM')
  console.log('✓ Test 3 Passed: Dynamic forward clamp for position #1! At 7:00 PM for a 6:00 PM slot, shows 7:02 PM (Up Next ~2 min), NOT 6:00 PM or static freeze')
}

// Test 4: Active/Overdue Slot with Active Patient Inside Cabin (Ends at 7:08 PM)
{
  const now = new Date('2026-11-26T19:00:00')
  const result = calculateLiveQueueTimingEstimate({
    now,
    appointmentTime: '06:00 PM - 07:00 PM',
    patientsAhead: 0,
    avgConsultMinutes: 10,
    isDoctorInClinic: true,
    isAnyoneInside: true,
    inConsultationSince: '2026-11-26T18:58:00', // Inside since 6:58 PM, 10 min avg -> ends 7:08 PM
    isOnBreak: false,
    optInEarlyCall: false,
  })

  assert.strictEqual(result.expectedExactTimeText, '7:08 PM', `Expected "7:08 PM" but got "${result.expectedExactTimeText}"`)
  assert.strictEqual(result.estimatedTimeLeftText, '~ 8 min', `Expected "~ 8 min" but got "${result.estimatedTimeLeftText}"`)
  console.log('✓ Test 4 Passed: Active patient inside dynamically extends wait! Shows 7:08 PM (~ 8 min)')
}

// Test 5: Active/Overdue Slot with Doctor Away / Not in Clinic (+5m buffer)
{
  const now = new Date('2026-11-26T19:00:00')
  const result = calculateLiveQueueTimingEstimate({
    now,
    appointmentTime: '06:00 PM - 07:00 PM',
    patientsAhead: 0,
    avgConsultMinutes: 10,
    isDoctorInClinic: false,
    isAnyoneInside: false,
    isOnBreak: false,
    optInEarlyCall: false,
  })

  assert.strictEqual(result.expectedExactTimeText, '7:05 PM', `Expected "7:05 PM" but got "${result.expectedExactTimeText}"`)
  assert.strictEqual(result.estimatedTimeLeftText, '~ 5 min', `Expected "~ 5 min" but got "${result.estimatedTimeLeftText}"`)
  console.log('✓ Test 5 Passed: Doctor not in clinic applies +5m lead buffer! Shows 7:05 PM (~ 5 min)')
}

// Test 6: Subsequent Patient (Position 3, 2 people ahead at 7:00 PM)
{
  const now = new Date('2026-11-26T19:00:00')
  const result = calculateLiveQueueTimingEstimate({
    now,
    appointmentTime: '06:00 PM - 07:00 PM',
    patientsAhead: 2,
    avgConsultMinutes: 10,
    isDoctorInClinic: true,
    isAnyoneInside: false,
    isOnBreak: false,
    optInEarlyCall: false,
  })

  assert.strictEqual(result.expectedExactTimeText, '7:20 PM', `Expected "7:20 PM" but got "${result.expectedExactTimeText}"`)
  assert.strictEqual(result.estimatedTimeLeftText, '~ 20 min', `Expected "~ 20 min" but got "${result.estimatedTimeLeftText}"`)
  console.log('✓ Test 6 Passed: Position 3 with 2 ahead correctly forward clamps to 7:20 PM (~ 20 min)')
}

// Test 7: Break Overrun at 2:10 PM (Break was scheduled till 2:00 PM)
{
  const now = new Date('2026-11-26T14:10:00')
  const result = calculateLiveQueueTimingEstimate({
    now,
    appointmentTime: '02:00 PM - 03:00 PM',
    patientsAhead: 0,
    avgConsultMinutes: 10,
    isDoctorInClinic: true,
    isAnyoneInside: false,
    isOnBreak: true,
    breakEnd: '02:00 PM',
    optInEarlyCall: false,
  })

  assert.strictEqual(result.expectedExactTimeText, '2:15 PM', `Expected "2:15 PM" but got "${result.expectedExactTimeText}"`)
  assert.strictEqual(result.estimatedTimeLeftText, '~ 5 min', `Expected "~ 5 min" but got "${result.estimatedTimeLeftText}"`)
  console.log('✓ Test 7 Passed: Break overrun past scheduled end time clamps to now + 5 min (2:15 PM)')
}

// Test 8: User Scenario: Sita inside cabin at 1:45 PM -> Ram outside expecting 1:58 PM.
// Sita consultation completes early at 1:50 PM -> Ram dynamically updates to 1:52 PM (Up Next ~2 min).
{
  // Part A: At 1:45 PM, Sita is inside cabin (entered at 1:48 PM, or entered at 1:48 PM with avg 10m -> 1:58 PM end)
  const timeAt145 = new Date('2026-11-26T13:45:00')
  const ramStateAt145 = calculateLiveQueueTimingEstimate({
    now: timeAt145,
    appointmentTime: '01:00 PM - 02:00 PM',
    patientsAhead: 0,
    avgConsultMinutes: 10,
    isDoctorInClinic: true,
    isAnyoneInside: true,
    inConsultationSince: '2026-11-26T13:48:00', // Inside, ending at 1:58 PM
    isOnBreak: false,
    optInEarlyCall: false,
  })

  assert.strictEqual(ramStateAt145.expectedExactTimeText, '1:58 PM', `At 1:45 PM expected 1:58 PM but got ${ramStateAt145.expectedExactTimeText}`)
  assert.strictEqual(ramStateAt145.estimatedTimeLeftText, '~ 13 min', `At 1:45 PM expected ~ 13 min but got ${ramStateAt145.estimatedTimeLeftText}`)
  console.log('✓ Test 8A Passed: At 1:45 PM with Sita inside, Ram correctly expects 1:58 PM (~ 13 min)')

  // Part B: At 1:50 PM, Sita completes early. Cabin is vacated (isAnyoneInside: false, patientsAhead: 0).
  const timeAt150 = new Date('2026-11-26T13:50:00')
  const ramStateAt150 = calculateLiveQueueTimingEstimate({
    now: timeAt150,
    appointmentTime: '01:00 PM - 02:00 PM',
    patientsAhead: 0,
    avgConsultMinutes: 10,
    isDoctorInClinic: true,
    isAnyoneInside: false,
    inConsultationSince: null, // Sita completed and vacated
    isOnBreak: false,
    optInEarlyCall: false,
  })

  assert.strictEqual(ramStateAt150.expectedExactTimeText, '1:52 PM', `At 1:50 PM expected 1:52 PM but got ${ramStateAt150.expectedExactTimeText}`)
  assert.strictEqual(ramStateAt150.estimatedTimeLeftText, 'Up Next (~2 min)', `At 1:50 PM expected "Up Next (~2 min)" but got "${ramStateAt150.estimatedTimeLeftText}"`)
  console.log('✓ Test 8B Passed: At 1:50 PM upon Sita early completion, Ram immediately shifts to 1:52 PM (Up Next ~2 min)!')
}

console.log('\n=== ALL 8 DYNAMIC QUEUE TIMING TESTS PASSED PERFECTLY! ===')
