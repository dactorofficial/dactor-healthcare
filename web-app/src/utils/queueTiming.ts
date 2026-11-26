/**
 * Queue Timing Utilities for Dactor Platform
 * Strictly synchronized with Nepal Time (UTC+05:45) and Android QueueRepository logic.
 *
 * Invariant 1 (Future Slot Floor):
 * If a patient booked 9:00 AM - 10:00 AM and now is 8:30 AM (no patients ahead, not opted into early call),
 * the expected time stays anchored at >= 9:00 AM (never pulled earlier to 8:30 AM / 8:32 AM).
 *
 * Invariant 2 (Active/Overdue Slot Forward Clamp):
 * Once now >= slot_start (e.g. at 7:00 PM for a 6:00 PM - 7:00 PM slot):
 * Expected time must never show a past time (e.g. 6:00 PM) or a static frozen string.
 * It dynamically advances:
 * - When doctor is free: max(now + 2m, dynamicQueueTime) -> "Expected at 7:02 PM"
 * - When doctor is away: max(now + 5m, dynamicQueueTime) -> "Expected at 7:05 PM"
 * - When patient inside: max(insideEnd, dynamicQueueTime) -> "Expected at 7:08 PM"
 */

export interface QueueTimingInput {
  now?: Date
  appointmentTime?: string | null
  appointmentDate?: string | null
  patientsAhead: number
  avgConsultMinutes: number
  isDoctorInClinic: boolean
  isDoctorFree?: boolean
  inConsultationSince?: string | null
  isAnyoneInside?: boolean
  isOnBreak?: boolean
  breakEnd?: string | null
  optInEarlyCall?: boolean
  clinicOpenTime?: string | null
}

export interface QueueTimingResult {
  effectiveExpectedTime: Date
  expectedExactTimeText: string
  estimatedTimeLeftText: string
  displayWaitText: string
  timeWindowText: string
  approxTimeText: string
  suggestedArrivalText: string
  slotNoticeText: string
  isArriveSoon: boolean
}

/**
 * Parses time string (e.g. "06:00 PM", "6:00PM", "18:00") into { hours, minutes }
 */
export function parseTimeString(timeStr?: string | null): { hours: number; minutes: number } | null {
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

/**
 * Parses slot start time from range e.g. "06:00 - 07:00 PM" -> 18:00
 * Properly propagates AM/PM from the second part if the first part lacks it!
 */
export function parseSlotStartTime(slotStr?: string | null, baseDate: Date = new Date()): Date | null {
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

/**
 * Parses slot end time from range e.g. "06:00 - 07:00 PM" -> 19:00
 */
export function parseSlotEndTime(slotStr?: string | null, baseDate: Date = new Date()): Date | null {
  if (!slotStr || !slotStr.trim()) return null
  const parts = slotStr.split(/[-–—]|to/)
  if (parts.length < 2) return null
  const clean = parts[1].trim().toUpperCase()
  const parsed = parseTimeString(clean)
  if (!parsed) return null

  const d = new Date(baseDate)
  d.setHours(parsed.hours, parsed.minutes, 0, 0)
  return d
}

export function formatTime12H(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function formatTimeWindow(d: Date, spreadMinutes: number = 15): string {
  const start = new Date(d.getTime() - 5 * 60000)
  const end = new Date(d.getTime() + Math.max(5, spreadMinutes - 5) * 60000)
  return `${formatTime12H(start)} – ${formatTime12H(end)}`
}

/**
 * Calculates live dynamic expected time and wait text with full parity to Android QueueRepository.
 */
export function calculateLiveQueueTimingEstimate(input: QueueTimingInput): QueueTimingResult {
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

  // Determine doctor availability
  const isAnyoneInside = !!input.isAnyoneInside || !!input.inConsultationSince
  const isDoctorFree = input.isDoctorInClinic && !isAnyoneInside && !input.isOnBreak
  const canOfferEarly = isDoctorFree && isSlotInFuture && !!input.optInEarlyCall && isFirstPosition

  // Break handling
  if (input.isOnBreak) {
    let breakEndDate: Date
    if (input.breakEnd) {
      const parsed = parseTimeString(input.breakEnd)
      if (parsed) {
        breakEndDate = new Date(now)
        breakEndDate.setHours(parsed.hours, parsed.minutes, 0, 0)
      } else {
        breakEndDate = new Date(now.getTime() + Math.max(15, avgMins) * 60000)
      }
    } else {
      breakEndDate = new Date(now.getTime() + Math.max(15, avgMins) * 60000)
    }

    // If break end already passed, forward clamp to now + 5m
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
      timeWindowText: formatTimeWindow(effectiveExpectedTime),
      approxTimeText: `around ${exactStr}`,
      suggestedArrivalText: suggestedArrivalStr,
      slotNoticeText: notice,
      isArriveSoon: false,
    }
  }

  // Calculate dynamic baseline queue time
  let dynamicExpectedTime: Date
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
    // Doctor not in clinic yet
    let openDate: Date | null = null
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
    // Doctor in clinic and free
    const leadMs = isFirstPosition ? 2 * 60000 : 0
    dynamicExpectedTime = new Date(now.getTime() + leadMs + totalPeopleAhead * avgMins * 60000)
  }

  // Apply Slot-Aware Invariants
  let effectiveExpectedTime: Date
  let effectiveTimeLeftText: string
  let effectiveExactTimeText: string

  if (isFirstPosition) {
    if (isSlotInFuture && !canOfferEarly) {
      // Rule A: Future slot floor. E.g. booked 9:00 AM, now is 8:30 AM.
      // Must stay >= 9:00 AM unless prior queue pushed dynamicExpectedTime > 9:00 AM.
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
      // Rule B: Active or overdue slot (now >= slot_start), or early arrival opted-in.
      // Never show a past time! Forward clamp >= now + buffer:
      // - Doctor free: +2m preparation buffer
      // - Doctor away: +5m buffer
      // - Someone inside: dynamicExpectedTime
      let minForwardTime: Date
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
      effectiveTimeLeftText = diffMins <= 2 ? `Up Next (~${diffMins} min)` : `~ ${diffMins} min`
      effectiveExactTimeText = formatTime12H(effectiveExpectedTime)
    }
  } else {
    // Subsequent positions (patientsAhead > 0)
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
      // Overdue or active slot: strictly forward clamp >= now
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

  // Slot Notice Text
  let slotNoticeText = ''
  if (slotStartDate && isFirstPosition) {
    if (isSlotInFuture) {
      slotNoticeText = `No one ahead of you. Your slot starts at ${slotStartStr}. ${arrivalAdvice}`.trim()
    } else {
      slotNoticeText = 'No one ahead of you. You are up next!'
    }
  } else if (slotStartDate && totalPeopleAhead > 0) {
    const personWord = totalPeopleAhead === 1 ? 'person' : 'people'
    if (isSlotInFuture) {
      slotNoticeText = `${totalPeopleAhead} ${personWord} ahead. Your slot starts at ${slotStartStr}. ${arrivalAdvice}`.trim()
    } else {
      slotNoticeText = `${totalPeopleAhead} ${personWord} ahead in line. Active consultation underway.`
    }
  } else if (isFirstPosition) {
    slotNoticeText = 'No one ahead of you. You are up next!'
  } else {
    const personWord = totalPeopleAhead === 1 ? 'person' : 'people'
    slotNoticeText = `${totalPeopleAhead} ${personWord} ahead in line.`
  }

  return {
    effectiveExpectedTime,
    expectedExactTimeText: effectiveExactTimeText,
    estimatedTimeLeftText: effectiveTimeLeftText,
    displayWaitText: effectiveTimeLeftText,
    timeWindowText: formatTimeWindow(effectiveExpectedTime),
    approxTimeText: `around ${effectiveExactTimeText}`,
    suggestedArrivalText: suggestedArrivalStr,
    slotNoticeText,
    isArriveSoon: isFirstPosition && (!isSlotInFuture || canOfferEarly),
  }
}
