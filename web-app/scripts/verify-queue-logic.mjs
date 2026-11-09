// Verification script for Multi-Slot Daily Queue Position & Storage CDN Image Resolution
// Matches QueueTimingEngineTest.kt from Android app

import assert from 'node:assert'

const SUPABASE_STORAGE_PUBLIC_URL = 'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public'

function resolveStorageUrl(pathOrUrl, defaultBucket = 'clinic_logos') {
  if (!pathOrUrl) return undefined
  const raw = pathOrUrl.trim()
  if (!raw) return undefined
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:')
  ) {
    return raw
  }

  const cleanPath = raw.replace(/^\/+/, '')
  const knownBuckets = [
    'clinic_logos',
    'clinic-logos',
    'clinic_photos',
    'clinic-photos',
    'clinic_pictures',
    'clinic-pictures',
    'clinics',
    'doctor_photos',
    'doctor-photos',
    'doctors',
    'avatars',
    'pictures',
    'logos',
    'lab_reports',
    'reports',
  ]

  const hasKnownBucket = knownBuckets.some((b) => cleanPath.startsWith(`${b}/`))
  if (hasKnownBucket) {
    return `${SUPABASE_STORAGE_PUBLIC_URL}/${cleanPath}`
  }

  return `${SUPABASE_STORAGE_PUBLIC_URL}/${defaultBucket}/${cleanPath}`
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 23 * 60 + 59
  try {
    const clean = timeStr.trim().toUpperCase()
    const isPm = clean.includes('PM')
    const isAm = clean.includes('AM')
    const stripped = clean.replace(/AM|PM/g, '').trim()
    const m = stripped.match(/^(\d{1,2})(?:[:.](\d{1,2}))?/)
    if (!m) return 12 * 60
    let hours = parseInt(m[1], 10)
    const minutes = parseInt(m[2] || '0', 10)

    if (isPm && hours < 12) hours += 12
    if (isAm && hours === 12) hours = 0

    if (!isPm && !isAm && hours >= 1 && hours <= 6) hours += 12

    return hours * 60 + minutes
  } catch {
    return 12 * 60
  }
}

function formatMinutesTo12Hour(totalMinutes) {
  let normalized = totalMinutes % (24 * 60)
  if (normalized < 0) normalized += 24 * 60
  let h = Math.floor(normalized / 60)
  const m = normalized % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  const mStr = String(m).padStart(2, '0')
  return `${h}:${mStr} ${ampm}`
}

function computeMultiSlotDailyPosition(params) {
  const {
    targetAppointmentId,
    targetSlotId,
    targetAppointmentTime,
    appointmentDate,
    allSlotsForDate = [],
    allAppointmentsForDate = [],
    doctorId,
    avgConsultationMinutes = 10,
    nowDate = new Date(),
  } = params

  const targetDateStr = (appointmentDate || '').trim().slice(0, 10)

  // Compare calendar days
  const now = new Date(nowDate.getTime())
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const todayStr = `${year}-${month}-${day}`

  const tomorrowObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const tomYear = tomorrowObj.getFullYear()
  const tomMonth = String(tomorrowObj.getMonth() + 1).padStart(2, '0')
  const tomDay = String(tomorrowObj.getDate()).padStart(2, '0')
  const tomorrowStr = `${tomYear}-${tomMonth}-${tomDay}`

  const isToday = targetDateStr === todayStr
  const isTomorrow = targetDateStr === tomorrowStr
  const isFutureDate = targetDateStr > todayStr

  let dateLabel = ''
  if (isToday) {
    dateLabel = 'Today'
  } else if (isTomorrow) {
    dateLabel = 'Tomorrow'
  } else {
    const parts = targetDateStr.split('-')
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10) - 1
      const d = parseInt(parts[2], 10)
      const targetObj = new Date(y, m, d)
      const monthShort = targetObj.toLocaleDateString('en-US', { month: 'short' })
      dateLabel = `${d} ${monthShort}`
    } else {
      dateLabel = targetDateStr || 'Upcoming'
    }
  }

  // Filter relevant published slots and non-cancelled appointments
  const relevantSlots = (allSlotsForDate || []).filter((slot) => {
    const isPub = slot.isPublished !== false
    const matchesDoc = !doctorId || !slot.doctorId || slot.doctorId === doctorId
    return isPub && matchesDoc
  })

  const relevantAppointments = (allAppointmentsForDate || []).filter((appt) => {
    const notCancelled = appt.checkinStatus !== 'cancelled'
    const matchesDoc = !doctorId || !appt.doctorId || appt.doctorId === doctorId
    return notCancelled && matchesDoc
  })

  // Sort slots chronologically
  const sortedSlots = [...relevantSlots].sort((a, b) => {
    const aStart = parseTimeToMinutes(a.startTime)
    const bStart = parseTimeToMinutes(b.startTime)
    if (aStart !== bStart) return aStart - bStart

    const aEnd = parseTimeToMinutes(a.endTime)
    const bEnd = parseTimeToMinutes(b.endTime)
    if (aEnd !== bEnd) return aEnd - bEnd

    return a.id.localeCompare(b.id)
  })

  // Match target slot
  let targetSlot = sortedSlots.find((s) => s.id === targetSlotId)
  if (!targetSlot && targetAppointmentTime) {
    const targetTimeMins = parseTimeToMinutes(targetAppointmentTime)
    targetSlot = sortedSlots.find((slot) => {
      const sMins = parseTimeToMinutes(slot.startTime)
      const eMins = parseTimeToMinutes(slot.endTime)
      return (targetTimeMins >= sMins && targetTimeMins < eMins) || targetTimeMins === sMins
    })
  }

  let priorAppointmentsCount = 0
  let positionInSlot = 1
  let cumulativePos = 1

  if (targetSlot && sortedSlots.length > 0) {
    const targetSlotIndex = sortedSlots.findIndex((s) => s.id === targetSlot.id)
    const priorSlotIds = new Set(
      targetSlotIndex > 0 ? sortedSlots.slice(0, targetSlotIndex).map((s) => s.id) : []
    )
    const targetSlotStartMins = parseTimeToMinutes(targetSlot.startTime)

    const priorAppointments = relevantAppointments.filter((appt) => {
      if (appt.id === targetAppointmentId) return false
      if (appt.slotId && priorSlotIds.has(appt.slotId)) return true
      if (!appt.slotId && appt.appointmentTime) {
        const apptMins = parseTimeToMinutes(appt.appointmentTime)
        return apptMins < targetSlotStartMins
      }
      return false
    })
    priorAppointmentsCount = priorAppointments.length

    const inSlotAppointments = relevantAppointments.filter((appt) => {
      if (appt.slotId === targetSlot.id) return true
      if (!appt.slotId && appt.appointmentTime) {
        return parseTimeToMinutes(appt.appointmentTime) === targetSlotStartMins
      }
      return appt.id === targetAppointmentId
    })

    const uniqueInSlot = Array.from(new Map(inSlotAppointments.map((a) => [a.id, a])).values())
    uniqueInSlot.sort((a, b) => {
      const aMins = parseTimeToMinutes(a.appointmentTime)
      const bMins = parseTimeToMinutes(b.appointmentTime)
      if (aMins !== bMins) return aMins - bMins
      return a.id.localeCompare(b.id)
    })

    const inSlotIndex = uniqueInSlot.findIndex((a) => a.id === targetAppointmentId)
    positionInSlot = inSlotIndex >= 0 ? inSlotIndex + 1 : 1
    cumulativePos = priorAppointmentsCount + positionInSlot
  } else {
    const sortedAppts = [...relevantAppointments].sort((a, b) => {
      const aMins = parseTimeToMinutes(a.appointmentTime)
      const bMins = parseTimeToMinutes(b.appointmentTime)
      if (aMins !== bMins) return aMins - bMins
      return a.id.localeCompare(b.id)
    })
    const myIdx = sortedAppts.findIndex((a) => a.id === targetAppointmentId)
    cumulativePos = myIdx >= 0 ? myIdx + 1 : 1
    priorAppointmentsCount = Math.max(0, cumulativePos - 1)
    positionInSlot = 1
  }

  const effectiveSlotStartStr =
    targetSlot?.startTime?.trim() || targetAppointmentTime?.trim() || '09:00 AM'
  const effectiveSlotEndStr = targetSlot?.endTime?.trim() || ''

  const slotStartMins = parseTimeToMinutes(effectiveSlotStartStr)
  const formattedSlotStart = formatMinutesTo12Hour(slotStartMins)

  const avgMins = Math.max(1, avgConsultationMinutes || 10)
  const staggerMinutes = Math.max(0, positionInSlot - 1) * avgMins
  const approxAppointmentTimeMins = slotStartMins + staggerMinutes
  const approxTimeFormatted = formatMinutesTo12Hour(approxAppointmentTimeMins)

  const approxAppointmentTimeText = `${approxTimeFormatted} (±15 min)`
  const windowStart = formatMinutesTo12Hour(approxAppointmentTimeMins - 15)
  const windowEnd = formatMinutesTo12Hour(approxAppointmentTimeMins + 15)
  const timeWindowText = `${windowStart} – ${windowEnd}`

  return {
    cumulativePosition: cumulativePos,
    patientsAheadInDay: Math.max(0, cumulativePos - 1),
    positionInSlot,
    slotStartTimeText: formattedSlotStart,
    slotEndTimeText: effectiveSlotEndStr,
    approxAppointmentTimeText,
    timeWindowText,
    dateLabel,
    isToday,
    isTomorrow,
    isFutureDate,
  }
}

console.log('--- Starting Web App Multi-Slot Queue & Storage CDN Verification ---')

// TEST 1: First patient in second slot (10 booked in slot 1, target patient is 1st in slot 2)
{
  const slot1 = {
    id: 'slot-1',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    slotDate: '2026-10-18',
    startTime: '09:00 AM',
    endTime: '10:00 AM',
    isPublished: true,
  }
  const slot2 = {
    id: 'slot-2',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    slotDate: '2026-10-18',
    startTime: '10:00 AM',
    endTime: '11:00 AM',
    isPublished: true,
  }

  const priorAppointments = Array.from({ length: 10 }, (_, i) => ({
    id: `appt-slot1-${i + 1}`,
    trackingCode10Digit: `111111111${i + 1}`,
    slotId: 'slot-1',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    appointmentDate: '2026-10-18',
    appointmentTime: '09:00 AM',
    patientName: `Patient ${i + 1}`,
    checkinStatus: 'waiting',
  }))

  const myAppointment = {
    id: 'my-target-appt',
    trackingCode10Digit: '5888368144',
    slotId: 'slot-2',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    appointmentDate: '2026-10-18',
    appointmentTime: '10:00 AM',
    patientName: 'Nishan',
    checkinStatus: 'waiting',
  }

  const result = computeMultiSlotDailyPosition({
    targetAppointmentId: myAppointment.id,
    targetSlotId: myAppointment.slotId,
    targetAppointmentTime: myAppointment.appointmentTime,
    appointmentDate: '2026-10-18',
    allSlotsForDate: [slot1, slot2],
    allAppointmentsForDate: [...priorAppointments, myAppointment],
    doctorId: 'doc-1',
    avgConsultationMinutes: 10,
    nowDate: new Date('2026-10-17T12:00:00Z'), // Tomorrow is 2026-10-18
  })

  assert.strictEqual(result.cumulativePosition, 11, 'Cumulative position must be 11')
  assert.strictEqual(result.patientsAheadInDay, 10, 'Patients ahead in day must be 10')
  assert.strictEqual(result.positionInSlot, 1, 'Position in slot must be 1')
  assert.strictEqual(result.slotStartTimeText, '10:00 AM', 'Slot start time must be 10:00 AM')
  assert.strictEqual(result.approxAppointmentTimeText, '10:00 AM (±15 min)', 'Approx appointment time must be 10:00 AM (±15 min)')
  assert.strictEqual(result.timeWindowText, '9:45 AM – 10:15 AM', 'Window must be 9:45 AM – 10:15 AM')
  assert.strictEqual(result.isTomorrow, true, 'isTomorrow must be true')
  assert.strictEqual(result.isFutureDate, true, 'isFutureDate must be true for tomorrow')
  assert.strictEqual(result.dateLabel, 'Tomorrow', 'dateLabel must be Tomorrow')
  console.log('✅ TEST 1 PASSED: First patient in 2nd slot has cumulative #11, 10 ahead, 10:00 AM (±15 min), Tomorrow')
}

// TEST 2: Second patient in second slot staggered by 10 minutes
{
  const slot1 = {
    id: 'slot-1',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    slotDate: '2026-10-18',
    startTime: '09:00 AM',
    endTime: '10:00 AM',
    isPublished: true,
  }
  const slot2 = {
    id: 'slot-2',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    slotDate: '2026-10-18',
    startTime: '10:00 AM',
    endTime: '11:00 AM',
    isPublished: true,
  }

  const prior10 = Array.from({ length: 10 }, (_, i) => ({
    id: `appt-slot1-${i + 1}`,
    slotId: 'slot-1',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    appointmentDate: '2026-10-18',
    appointmentTime: '09:00 AM',
    checkinStatus: 'waiting',
  }))

  const firstInSlot2 = {
    id: 'appt-slot2-1',
    slotId: 'slot-2',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    appointmentDate: '2026-10-18',
    appointmentTime: '10:00 AM',
    checkinStatus: 'waiting',
  }

  const secondInSlot2 = {
    id: 'appt-slot2-2',
    slotId: 'slot-2',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    appointmentDate: '2026-10-18',
    appointmentTime: '10:00 AM',
    checkinStatus: 'waiting',
  }

  const result = computeMultiSlotDailyPosition({
    targetAppointmentId: secondInSlot2.id,
    targetSlotId: secondInSlot2.slotId,
    targetAppointmentTime: secondInSlot2.appointmentTime,
    appointmentDate: '2026-10-18',
    allSlotsForDate: [slot1, slot2],
    allAppointmentsForDate: [...prior10, firstInSlot2, secondInSlot2],
    doctorId: 'doc-1',
    avgConsultationMinutes: 10,
    nowDate: new Date('2026-10-17T12:00:00Z'),
  })

  assert.strictEqual(result.cumulativePosition, 12, 'Cumulative position must be 12')
  assert.strictEqual(result.patientsAheadInDay, 11, 'Patients ahead in day must be 11')
  assert.strictEqual(result.positionInSlot, 2, 'Position in slot must be 2')
  assert.strictEqual(result.slotStartTimeText, '10:00 AM', 'Slot start time must be 10:00 AM')
  assert.strictEqual(result.approxAppointmentTimeText, '10:10 AM (±15 min)', 'Approx appointment time must be 10:10 AM (±15 min)')
  assert.strictEqual(result.timeWindowText, '9:55 AM – 10:25 AM', 'Window must be 9:55 AM – 10:25 AM')
  console.log('✅ TEST 2 PASSED: 2nd patient in 2nd slot is staggered to 10:10 AM (±15 min) with window 9:55 AM – 10:25 AM')
}

// TEST 3: First patient in first slot today
{
  const slot1 = {
    id: 'slot-1',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    slotDate: '2026-10-18',
    startTime: '09:00 AM',
    endTime: '10:00 AM',
    isPublished: true,
  }

  const myAppointment = {
    id: 'first-appt',
    slotId: 'slot-1',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    appointmentDate: '2026-10-18',
    appointmentTime: '09:00 AM',
    checkinStatus: 'waiting',
  }

  const result = computeMultiSlotDailyPosition({
    targetAppointmentId: myAppointment.id,
    targetSlotId: myAppointment.slotId,
    targetAppointmentTime: myAppointment.appointmentTime,
    appointmentDate: '2026-10-18',
    allSlotsForDate: [slot1],
    allAppointmentsForDate: [myAppointment],
    doctorId: 'doc-1',
    avgConsultationMinutes: 10,
    nowDate: new Date('2026-10-18T08:00:00Z'), // Today is 2026-10-18
  })

  assert.strictEqual(result.cumulativePosition, 1, 'Cumulative position must be 1')
  assert.strictEqual(result.patientsAheadInDay, 0, 'Patients ahead in day must be 0')
  assert.strictEqual(result.positionInSlot, 1, 'Position in slot must be 1')
  assert.strictEqual(result.slotStartTimeText, '9:00 AM', 'Slot start time must be 9:00 AM')
  assert.strictEqual(result.approxAppointmentTimeText, '9:00 AM (±15 min)', 'Approx appointment time must be 9:00 AM (±15 min)')
  assert.strictEqual(result.timeWindowText, '8:45 AM – 9:15 AM', 'Window must be 8:45 AM – 9:15 AM')
  assert.strictEqual(result.isToday, true, 'isToday must be true')
  assert.strictEqual(result.dateLabel, 'Today', 'dateLabel must be Today')
  console.log('✅ TEST 3 PASSED: First patient in 1st slot today has 0 patients ahead, 9:00 AM (±15 min), Today')
}

// TEST 4: Future date beyond tomorrow
{
  const slot = {
    id: 'slot-future',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    slotDate: '2026-10-25',
    startTime: '09:00 AM',
    endTime: '10:00 AM',
    isPublished: true,
  }

  const appt = {
    id: 'appt-future',
    slotId: 'slot-future',
    clinicId: 'clinic-1',
    doctorId: 'doc-1',
    appointmentDate: '2026-10-25',
    appointmentTime: '09:00 AM',
    checkinStatus: 'waiting',
  }

  const result = computeMultiSlotDailyPosition({
    targetAppointmentId: appt.id,
    targetSlotId: appt.slotId,
    targetAppointmentTime: appt.appointmentTime,
    appointmentDate: '2026-10-25',
    allSlotsForDate: [slot],
    allAppointmentsForDate: [appt],
    doctorId: 'doc-1',
    avgConsultationMinutes: 10,
    nowDate: new Date('2026-10-17T12:00:00Z'),
  })

  assert.strictEqual(result.isFutureDate, true, 'isFutureDate must be true')
  assert.strictEqual(result.isTomorrow, false, 'isTomorrow must be false')
  assert.strictEqual(result.isToday, false, 'isToday must be false')
  assert.strictEqual(result.dateLabel, '25 Oct', 'dateLabel must be 25 Oct')
  console.log('✅ TEST 4 PASSED: Future date beyond tomorrow correctly identified as 25 Oct')
}

// TEST 5: Guard against negative values
{
  const result = computeMultiSlotDailyPosition({
    targetAppointmentId: 'empty-test',
    appointmentDate: '2026-10-18',
    allSlotsForDate: [],
    allAppointmentsForDate: [],
    nowDate: new Date('2026-10-17T12:00:00Z'),
  })

  assert.ok(result.patientsAheadInDay >= 0, 'patientsAheadInDay must never be negative')
  assert.ok(result.cumulativePosition >= 1, 'cumulativePosition must be at least 1')
  console.log('✅ TEST 5 PASSED: Empty/uninitialized cases safely guarded against negative values')
}

// TEST 6: Supabase Storage Public CDN Image Resolution
{
  // Relative clinic logo
  const clinicLogo = resolveStorageUrl('clinic_logos/logo1.png', 'clinic_logos')
  assert.strictEqual(
    clinicLogo,
    'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/clinic_logos/logo1.png'
  )

  // Relative clinic picture
  const clinicPic = resolveStorageUrl('clinic_pictures/photo1.jpg', 'clinic_photos')
  assert.strictEqual(
    clinicPic,
    'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/clinic_pictures/photo1.jpg'
  )

  // Absolute external image
  const extPic = resolveStorageUrl('https://external.com/logo.png', 'clinic_logos')
  assert.strictEqual(extPic, 'https://external.com/logo.png')

  // Doctor photo with bucket
  const docPhotoWithBucket = resolveStorageUrl('doctor_photos/avatar.png', 'doctor_photos')
  assert.strictEqual(
    docPhotoWithBucket,
    'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/doctor_photos/avatar.png'
  )

  // Bare avatar filename
  const bareAvatar = resolveStorageUrl('avatar.png', 'doctor_photos')
  assert.strictEqual(
    bareAvatar,
    'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/doctor_photos/avatar.png'
  )

  // Doctors bucket
  const doctorsBucket = resolveStorageUrl('doctors/dr1.jpg', 'doctor_photos')
  assert.strictEqual(
    doctorsBucket,
    'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/doctors/dr1.jpg'
  )

  // Pictures bucket
  const picturesBucket = resolveStorageUrl('pictures/photo.jpg', 'clinic_photos')
  assert.strictEqual(
    picturesBucket,
    'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/pictures/photo.jpg'
  )

  console.log('✅ TEST 6 PASSED: Supabase CDN image URLs resolved correctly across all buckets and bare filenames')
}

// TEST 7: Multi-doctor isolation and slotId matching
{
  const slotDocA1 = {
    id: 'slot-docA-1',
    clinicId: 'clinic-1',
    doctorId: 'doc-A',
    slotDate: '2026-10-19',
    startTime: '09:00 AM',
    endTime: '10:00 AM',
    isPublished: true,
  }
  const slotDocA2 = {
    id: 'slot-docA-2',
    clinicId: 'clinic-1',
    doctorId: 'doc-A',
    slotDate: '2026-10-19',
    startTime: '10:00 AM',
    endTime: '11:00 AM',
    isPublished: true,
  }
  const slotDocB1 = {
    id: 'slot-docB-1',
    clinicId: 'clinic-1',
    doctorId: 'doc-B',
    slotDate: '2026-10-19',
    startTime: '09:00 AM',
    endTime: '10:00 AM',
    isPublished: true,
  }

  // Doctor B has 5 appointments in earlier slot
  const docBAppts = Array.from({ length: 5 }, (_, i) => ({
    id: `appt-docB-${i + 1}`,
    slotId: 'slot-docB-1',
    clinicId: 'clinic-1',
    doctorId: 'doc-B',
    appointmentDate: '2026-10-19',
    appointmentTime: '09:00 AM',
    checkinStatus: 'waiting',
  }))

  // Doctor A has 3 appointments in slot 1
  const docAApptsSlot1 = Array.from({ length: 3 }, (_, i) => ({
    id: `appt-docA-slot1-${i + 1}`,
    slotId: 'slot-docA-1',
    clinicId: 'clinic-1',
    doctorId: 'doc-A',
    appointmentDate: '2026-10-19',
    appointmentTime: '09:00 AM',
    checkinStatus: 'waiting',
  }))

  // Target patient is 1st in Doctor A's slot 2
  const targetPatient = {
    id: 'target-patient-docA',
    slotId: 'slot-docA-2',
    clinicId: 'clinic-1',
    doctorId: 'doc-A',
    appointmentDate: '2026-10-19',
    appointmentTime: '10:00 AM',
    checkinStatus: 'waiting',
  }

  const result = computeMultiSlotDailyPosition({
    targetAppointmentId: targetPatient.id,
    targetSlotId: targetPatient.slotId,
    targetAppointmentTime: targetPatient.appointmentTime,
    appointmentDate: '2026-10-19',
    allSlotsForDate: [slotDocA1, slotDocA2, slotDocB1],
    allAppointmentsForDate: [...docBAppts, ...docAApptsSlot1, targetPatient],
    doctorId: 'doc-A',
    avgConsultationMinutes: 10,
    nowDate: new Date('2026-10-18T12:00:00Z'),
  })

  // Should isolate to Doctor A only: 3 prior patients + 1 = Cumulative #4 (not 8)
  assert.strictEqual(result.cumulativePosition, 4, 'Cumulative position must be 4 (isolating doctor A)')
  assert.strictEqual(result.patientsAheadInDay, 3, 'Patients ahead in day must be 3')
  assert.strictEqual(result.positionInSlot, 1, 'Position in slot must be 1')
  assert.strictEqual(result.isTomorrow, true, 'isTomorrow must be true')
  assert.strictEqual(result.isFutureDate, true, 'isFutureDate must be true')
  console.log('✅ TEST 7 PASSED: Multi-doctor concurrency isolation correctly filters appointments and slots per doctor')
}

console.log('\n🎉 ALL 7 VERIFICATION TEST SUITES PASSED!')
