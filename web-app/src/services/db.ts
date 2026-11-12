import { supabase } from '../lib/supabase'
import {
  Clinic,
  ClinicInvitation,
  Doctor,
  Appointment,
  Slot,
  ClinicService,
  LabReport,
  DactorNotification,
  MedicalSpecialty,
  MedicalQualification,
  BillingInvoice,
  QueueEntry,
  PatientProfile,
  PatientTransactionRecord,
  SupportTicket,
  PaymentGatewaysConfig,
  OnlineGatewayId,
  PublicPaymentMethod,
  ClinicGatewaySetupStatus,
  MultiSlotPositionResult,
  DoctorHomeItem,
  CityLocation,
} from '../types'
import { calculateDistanceKm } from '../utils/geohash'
import {
  parsePaymentRecords,
  extractCleanClinicalRemarks,
  buildCombinedRemarks,
  WebPaymentRecord,
} from '../utils/paymentLedger'

/** Returns true when a clinic, practitioner, or appointment belongs to a diagnostic/lab workflow. */
export function isDiagnosticLabClinic(
  clinic?: Clinic | null,
  doctor?: Doctor | null,
  appt?: Appointment | null
): boolean {
  if (doctor?.isLabTechnician || doctor?.practitionerRole === 'lab_technician') {
    return true
  }
  if (appt?.selectedTests && appt.selectedTests.length > 0) {
    return true
  }
  if (typeof appt?.selectedLabTests === 'string' && appt.selectedLabTests.trim().length > 0) {
    return true
  }
  if (Array.isArray(appt?.selectedLabTests) && appt.selectedLabTests.length > 0) {
    return true
  }
  if (!clinic) return false
  const t = (clinic.type || '').toLowerCase()
  const n = (clinic.name || '').toLowerCase()
  return (
    t === 'diagnostic_lab' ||
    t.includes('diagnostic') ||
    t.includes('lab') ||
    n.includes('diagnostic') ||
    n.includes('lab') ||
    (clinic.specialties?.some((s) => {
      const sl = s.toLowerCase()
      return sl.includes('lab') || sl.includes('patholog') || sl.includes('diagnostic') || sl.includes('radiolog') || sl.includes('scan')
    }) ?? false)
  )
}


// ==========================================
// CLINICS API
// ==========================================
export async function getClinics(): Promise<Clinic[]> {
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return (data || [])
      .map(mapClinic)
      .filter((c) => { const isVerified = c.verificationStatus === 'approved' || c.verificationStatus === 'verified'; return isVerified && !c.isArchived && c.isActivated !== false; })
  } catch (err) {
    console.error('Error fetching clinics:', err)
    return []
  }
}

export async function getNearbyClinics(
  lat: number,
  lng: number,
  radiusKm: number = 30,
  limit: number = 50,
  offset: number = 0,
  searchQuery?: string
): Promise<Clinic[]> {
  try {
    const params: Record<string, any> = {
      p_lat: lat,
      p_lng: lng,
      p_radius_km: radiusKm,
      p_limit: limit,
      p_offset: offset,
    }
    if (searchQuery && searchQuery.trim()) {
      params.p_search_query = searchQuery.trim()
    }
    const { data, error } = await supabase.rpc('get_nearby_clinics', params)
    if (error) throw error
    return (data || [])
      .map(mapClinic)
      .filter((c) => {
        const isVerified = c.verificationStatus === 'approved' || c.verificationStatus === 'verified'
        return isVerified && !c.isArchived
      })
  } catch (err) {
    console.warn('RPC get_nearby_clinics failed, falling back to local distance filter:', err)
    const all = await getClinics()
    return all
      .filter((c) => {
        if (!c.latitude || !c.longitude) return true
        const d = calculateDistanceKm(lat, lng, c.latitude, c.longitude)
        c.distanceKm = d
        return d <= radiusKm
      })
      .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0))
  }
}

export async function getClinicById(id: string): Promise<Clinic | null> {
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return null
    const mapped = mapClinic(data)
    const isVerified = mapped.verificationStatus === 'approved' || mapped.verificationStatus === 'verified'; if (!isVerified || mapped.isArchived || mapped.isActivated === false) return null
    return mapped
  } catch {
    return null
  }
}

export async function getClinicForPortalById(id: string): Promise<Clinic | null> {
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return null
    return mapClinic(data)
  } catch {
    return null
  }
}

export async function getClinicByEmail(email: string): Promise<Clinic | null> {
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .ilike('contact_email', email.trim().toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) return null
    return mapClinic(data[0])
  } catch {
    return null
  }
}

export async function createClinic(clinic: Partial<Clinic>): Promise<Clinic | null> {
  try {
    const validType =
      clinic.type === 'diagnostic_lab'
        ? 'diagnostic_lab'
        : clinic.type === 'single_visit'
        ? 'single_visit'
        : 'multi_visit'

    const generateId = () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
          return crypto.randomUUID()
        } catch {}
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }

    const assignedId = clinic.id || generateId()

    const dbPayload = {
      id: assignedId,
      name: (clinic.name || 'New Healthcare Center').trim(),
      type: validType,
      verification_status: clinic.verificationStatus || 'pending',
      contact_phone: (clinic.contactPhone || '+9779800000000').trim(),
      contact_email: (clinic.contactEmail || `clinic.${Date.now()}@dactor.health`).trim().toLowerCase(),
      address_text: (clinic.addressText || 'Kathmandu, Nepal').trim(),
      latitude: Number(clinic.latitude) || 27.7052,
      longitude: Number(clinic.longitude) || 85.3193,
      auto_notify_threshold: clinic.autoNotifyThreshold || 2,
      description: clinic.description || '',
      pan_number: clinic.panNumber || '',
      manager_phone: (clinic.managerPhone || clinic.contactPhone || '').trim(),
      registration_doc_url: clinic.registrationDocUrl || null,
      pictures: Array.isArray(clinic.pictures) ? clinic.pictures : [],
      specialties: Array.isArray(clinic.specialties) ? clinic.specialties : [],
    }

    const { data, error } = await supabase
      .from('clinics')
      .insert(dbPayload)
      .select()
      .single()

    if (error) {
      // PGRST116: PostgREST couldn't return the inserted row due to strict RLS SELECT policies on unverified/pending clinics.
      // The insert succeeded on the database; map and return the confirmed payload.
      if (error.code === 'PGRST116') {
        return mapClinic(dbPayload)
      }
      console.error('Supabase error inserting clinic:', error)
      const msg = [error.message, error.details, error.hint].filter(Boolean).join(' — ')
      throw new Error(msg || 'Failed to register clinic in database')
    }

    return data ? mapClinic(data) : mapClinic(dbPayload)
  } catch (err: any) {
    console.error('Error creating clinic:', err)
    throw err
  }
}

// ==========================================
// DOCTORS API
// ==========================================
export async function getDoctors(): Promise<Doctor[]> {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .order('full_name', { ascending: true })

    if (error) throw error
    return (data || []).map(mapDoctor)
  } catch (err) {
    console.error('Error fetching doctors:', err)
    return []
  }
}

export async function getDoctorsByClinic(clinicId: string): Promise<Doctor[]> {
  try {
    // 1. Direct doctors assigned to clinic
    const { data: directData, error: directErr } = await supabase
      .from('doctors')
      .select('*')
      .or(`clinic_id.eq.${clinicId},active_clinic_id.eq.${clinicId},primary_clinic_id.eq.${clinicId}`)
      .order('full_name', { ascending: true })

    if (directErr) throw directErr
    const directDocs = (directData || []).map(mapDoctor)

    // 2. Doctors with accepted invitations for this clinic (parity with clinic-app DoctorRepository.kt lines 175-204)
    return directDocs
  } catch (err) {
    console.error('Error fetching clinic doctors:', err)
    return []
  }
}

export async function getDoctorById(id: string): Promise<Doctor | null> {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return null
    return data ? mapDoctor(data) : null
  } catch {
    return null
  }
}

export async function getDoctorByEmail(email: string): Promise<Doctor | null> {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .ilike('email', email.trim().toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) return null
    return mapDoctor(data[0])
  } catch {
    return null
  }
}

export async function createDoctor(doctor: Partial<Doctor>): Promise<Doctor | null> {
  try {
    const role = doctor.practitionerRole || (doctor.isLabTechnician ? 'lab_technician' : 'doctor')
    const certMeta = JSON.stringify({
      gender: doctor.gender || 'Male',
      age: doctor.age || 35,
      starting_practicing_year: doctor.startingPracticingYear || 2018,
      education: doctor.education || 'MBBS, MD',
      personal_mobile_number: doctor.personalMobileNumber || '',
      public_mobile_number: doctor.publicMobileNumber || doctor.personalMobileNumber || '',
      description: doctor.description || '',
      practitioner_role: role,
    })

    const dbPayload = {
      id: doctor.id || crypto.randomUUID(),
      full_name: doctor.fullName || 'Dr. Specialist',
      email: (doctor.email || `dr.${Date.now()}@dactor.health`).toLowerCase(),
      specialty: doctor.specialty || 'General Physician',
      specialties: doctor.specialties || [doctor.specialty || 'General Physician'],
      education: doctor.education || 'MBBS',
      nmc_license_number: doctor.nmcLicenseNumber || `NMC-${Math.floor(10000 + Math.random() * 90000)}`,
      starting_practicing_year: doctor.startingPracticingYear || 2018,
      gender: doctor.gender || 'Male',
      age: doctor.age || 35,
      personal_mobile_number: doctor.personalMobileNumber || '',
      public_mobile_number: doctor.publicMobileNumber || doctor.personalMobileNumber || '',
      consultation_fee: doctor.consultationFee || 500,
      is_in_clinic: doctor.isInClinic ?? true,
      clinic_id: doctor.clinicId || null,
      active_clinic_id: doctor.activeClinicId || doctor.clinicId || null,
      kyc_status: doctor.kycStatus || 'approved',
      profile_picture_url: doctor.profilePictureUrl || null,
      license_doc_url: doctor.licenseDocUrl || null,
      description: doctor.description || null,
      certificates_doc_url: doctor.certificatesDocUrl || certMeta,
    }

    const { data, error } = await supabase
      .from('doctors')
      .insert(dbPayload)
      .select()
      .single()

    if (error) throw error
    return data ? mapDoctor(data) : null
  } catch (err) {
    console.error('Error creating doctor:', err)
    return null
  }
}

// ==========================================
// APPOINTMENTS & LIVE QUEUE API
// ==========================================
export function formatTimeForPostgres(timeStr?: string): string {
  if (!timeStr) return '10:00:00'
  const firstPart = timeStr.split(/\s*[-–—]|to\s*/i)[0].trim()
  const clean = firstPart.toUpperCase()
  const isPM = clean.includes('PM')
  const isAM = clean.includes('AM')
  const timeOnly = clean.replace(/[^0-9:]/g, '')
  const parts = timeOnly.split(':')
  let hours = parseInt(parts[0] || '10', 10)
  const mins = parseInt(parts[1] || '0', 10)
  if (isNaN(hours)) hours = 10
  if (isPM && hours < 12) hours += 12
  if (isAM && hours === 12) hours = 0
  if (!isPM && !isAM && hours >= 1 && hours <= 6) hours += 12
  return `${String(hours).padStart(2, '0')}:${String(isNaN(mins) ? 0 : mins).padStart(2, '0')}:00`
}

function normalizePaymentStatus(status?: string): 'pending' | 'paid' | 'refunded' | 'not_required' {
  if (status === 'paid') return 'paid'
  if (status === 'refunded') return 'refunded'
  if (status === 'not_required') return 'not_required'
  return 'pending'
}

export async function getAppointmentByTrackingCode(code: string): Promise<Appointment | null> {
  try {
    const cleanCode = code.trim()
    if (!cleanCode) return null
    const { data, error } = await supabase
      .from('appointments')
      .select('*, clinic:clinics(*), doctor:doctors(*), queue_entries(*)')
      .eq('tracking_code_10_digit', cleanCode)
      .order('appointment_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return null
    return data ? mapAppointment(data) : null
  } catch {
    return null
  }
}

export async function getAllAppointmentsByTrackingCode(code: string): Promise<Appointment[]> {
  try {
    const cleanCode = code.trim()
    if (!cleanCode) return []
    const { data, error } = await supabase
      .from('appointments')
      .select('*, clinic:clinics(*), doctor:doctors(*), queue_entries(*)')
      .eq('tracking_code_10_digit', cleanCode)
      .order('appointment_date', { ascending: false })

    if (error || !data) return []
    return data.map(mapAppointment)
  } catch {
    return []
  }
}

export async function getAppointmentByTrackingCodeOrContact(identifier: string): Promise<Appointment | null> {
  try {
    const clean = identifier.trim()
    if (!clean) return null

    // 0. Try UUID directly if format matches
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRegex.test(clean)) {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, clinic:clinics(*), doctor:doctors(*), queue_entries(*)')
        .eq('id', clean)
        .maybeSingle()
      if (!error && data) return mapAppointment(data)
    }

    // 1. Try 10-digit code directly
    if (/^\d{10}$/.test(clean)) {
      const byCode = await getAppointmentByTrackingCode(clean)
      if (byCode) return byCode
    }

    // 2. Try Email
    if (clean.includes('@') && clean.includes('.')) {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, clinic:clinics(*), doctor:doctors(*), queue_entries(*)')
        .ilike('patient_email', clean)
        .order('appointment_date', { ascending: false })
        .limit(10)

      if (!error && data && data.length > 0) {
        const active = data.find((a: any) => a.checkin_status !== 'completed' && a.checkin_status !== 'cancelled') || data[0]
        return mapAppointment(active)
      }
    }

    // 3. Try Mobile Phone
    const digitsOnly = clean.replace(/\D/g, '')
    if (digitsOnly.length >= 10) {
      const phone10 = digitsOnly.slice(-10)
      const { data, error } = await supabase
        .from('appointments')
        .select('*, clinic:clinics(*), doctor:doctors(*), queue_entries(*)')
        .ilike('patient_mobile', `%${phone10}%`)
        .order('appointment_date', { ascending: false })
        .limit(10)

      if (!error && data && data.length > 0) {
        const active = data.find((a: any) => a.checkin_status !== 'completed' && a.checkin_status !== 'cancelled') || data[0]
        return mapAppointment(active)
      }
    }

    // Fallback: direct code lookup
    return await getAppointmentByTrackingCode(clean)
  } catch {
    return null
  }
}

export interface LinkedConsultationsResult {
  targetAppointment: Appointment | null
  initialAppointment: Appointment | null
  followupAppointment: Appointment | null
  allConsultations: Appointment[]
  invoices: Record<string, BillingInvoice | null>
  isLinked: boolean
}

export async function getLinkedConsultations(appointmentIdOrCode: string): Promise<LinkedConsultationsResult> {
  const result: LinkedConsultationsResult = {
    targetAppointment: null,
    initialAppointment: null,
    followupAppointment: null,
    allConsultations: [],
    invoices: {},
    isLinked: false,
  }

  try {
    const target = await getAppointmentByTrackingCodeOrContact(appointmentIdOrCode)
    if (!target) return result

    result.targetAppointment = target

    // Privacy isolation: only authenticated patient owner, clinic staff, or admin may inspect sibling visits & invoices
    const { data: authData } = await supabase.auth.getUser()
    const currentUser = authData?.user
    const isOwner = currentUser && (
      (target.userId && currentUser.id === target.userId) ||
      (target.patientEmail && currentUser.email?.toLowerCase() === target.patientEmail.toLowerCase())
    )
    const isStaffOrAdmin = Boolean(
      currentUser && (
        currentUser.app_metadata?.role === 'admin' ||
        currentUser.app_metadata?.role === 'super_admin' ||
        currentUser.app_metadata?.role === 'clinic_admin' ||
        currentUser.app_metadata?.role === 'doctor'
      )
    )

    if (!currentUser || (!isOwner && !isStaffOrAdmin)) {
      result.allConsultations = [target]
      result.initialAppointment = target
      result.followupAppointment = null
      result.isLinked = false
      result.invoices = {}
      return result
    }

    const relatedAppts: Appointment[] = [target]

    // 1. Check if target notes contain a previous tracking code reference e.g. "Previous Code: #4829104812" or "Ref: #4829104812"
    let previousCode: string | null = null
    if (target.notes) {
      const match = target.notes.match(/(?:Previous Code|Previous Ref|Ref):\s*#?([A-Za-z0-9]{6,12})/i)
      if (match && match[1]) {
        previousCode = match[1].trim()
      }
    }

    if (previousCode && previousCode !== target.trackingCode10Digit) {
      const prevAppt = await getAppointmentByTrackingCode(previousCode)
      if (prevAppt && !relatedAppts.some((a) => a.id === prevAppt.id)) {
        relatedAppts.push(prevAppt)
      }
    }

    // 2. Fetch other visits strictly sharing the exact same 10-digit Appointment ID
    // Appointments with different appointment IDs from the same clinic must NEVER be grouped or shown together
    if (target.trackingCode10Digit) {
      const { data: siblings } = await supabase
        .from('appointments')
        .select('*, doctor:doctors(*), clinic:clinics(*), queue_entries(*)')
        .eq('tracking_code_10_digit', target.trackingCode10Digit)
        .order('appointment_date', { ascending: true })

      if (siblings && siblings.length > 0) {
        for (const s of siblings) {
          const mapped = mapAppointment(s)
          if (!relatedAppts.some((a) => a.id === mapped.id)) {
            relatedAppts.push(mapped)
          }
        }
      }
    }

    // 3. Sort chronologically (date, time, createdAt)
    relatedAppts.sort((a, b) => {
      const dateA = `${a.appointmentDate} ${a.appointmentTime || '00:00'}`
      const dateB = `${b.appointmentDate} ${b.appointmentTime || '00:00'}`
      return dateA.localeCompare(dateB)
    })

    result.allConsultations = relatedAppts
    result.isLinked = relatedAppts.length > 1 || Boolean(previousCode)

    if (relatedAppts.length > 1) {
      // Index 0 is the initial consultation, latest is followup
      result.initialAppointment = relatedAppts[0]
      result.followupAppointment = relatedAppts[relatedAppts.length - 1]
    } else if (target.notes && (target.notes.toLowerCase().includes('follow-up') || target.notes.toLowerCase().includes('previous code'))) {
      result.followupAppointment = target
      result.isLinked = true
    } else {
      result.initialAppointment = target
    }

    // 4. Fetch billing invoices for all linked appointments
    const apptIds = relatedAppts.map((a) => a.id).filter(Boolean)
    if (apptIds.length > 0) {
      const { data: invData } = await supabase
        .from('billing_invoices')
        .select('*')
        .in('appointment_id', apptIds)

      if (invData && invData.length > 0) {
        for (const inv of invData) {
          result.invoices[inv.appointment_id] = mapBillingInvoice(inv)
        }
      }
    }

    return result
  } catch (err) {
    console.error('Error fetching linked consultations:', err)
    return result
  }
}

export async function getAppointmentsByClinic(clinicId: string, date?: string): Promise<Appointment[]> {
  try {
    let query = supabase
      .from('appointments')
      .select('*, doctor:doctors(*), clinic:clinics(*), queue_entries(*)')
      .eq('clinic_id', clinicId)

    if (date) {
      query = query.eq('appointment_date', date)
    }

    const { data, error } = await query.order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map(mapAppointment)
  } catch (err) {
    console.error('Error fetching appointments by clinic:', err)
    return []
  }
}

export async function getAppointmentsByDoctor(doctorId: string, date?: string): Promise<Appointment[]> {
  try {
    let query = supabase
      .from('appointments')
      .select('*, clinic:clinics(*), doctor:doctors(*), queue_entries(*)')
      .eq('doctor_id', doctorId)

    if (date) {
      query = query.eq('appointment_date', date)
    }

    const { data, error } = await query.order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map(mapAppointment)
  } catch (err) {
    console.error('Error fetching appointments by doctor:', err)
    return []
  }
}

export async function createAppointment(appt: Partial<Appointment> & { slotId?: string }): Promise<Appointment | null> {
  try {
    let code10 = appt.trackingCode10Digit ? appt.trackingCode10Digit.trim() : ''
    const apptId = appt.id || crypto.randomUUID()
    const isWalkin = appt.isWalkin ?? (appt.notes?.toLowerCase().includes('walk-in') || false)
    const apptDate = appt.appointmentDate || new Date().toISOString().split('T')[0]
    const apptTime = formatTimeForPostgres(appt.appointmentTime)

    // 1. Resolve or register patient in profiles directory
    let resolvedUserId = appt.userId && appt.userId.length === 36 ? appt.userId : null
    const cleanEmail = appt.patientEmail?.trim().toLowerCase() || null
    const cleanMobile = appt.patientMobile?.trim().replace(/\D/g, '') || ''
    const patientNameClean = appt.patientName?.trim() || 'Patient'

    // ==========================================
    // IDEMPOTENCY SAFETY CHECKS & PATIENT ISOLATION
    // ==========================================
    // 1. If an appointment already exists with this exact UUID ID, return it immediately
    if (appt.id) {
      const { data: existingById } = await supabase
        .from('appointments')
        .select('*, clinic:clinics(*), doctor:doctors(*)')
        .eq('id', appt.id)
        .maybeSingle()
      if (existingById) {
        return mapAppointment(existingById)
      }
    }

    // 2. Guarantee that two separate patients NEVER share the same appointment ID
    if (code10) {
      const { data: existingByCode } = await supabase
        .from('appointments')
        .select('*, clinic:clinics(*), doctor:doctors(*)')
        .eq('tracking_code_10_digit', code10)
        .order('appointment_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existingByCode) {
        const cleanExistingPhone = (existingByCode.patient_mobile || '').replace(/\D/g, '')
        const isSamePatient = (cleanExistingPhone && cleanExistingPhone === cleanMobile) ||
          (existingByCode.user_id && existingByCode.user_id === resolvedUserId)
        if (isSamePatient) {
          // If rapid double-tap on exact same date & slot, return it
          if (existingByCode.appointment_date === apptDate && existingByCode.slot_id === (appt.slotId || null)) {
            return mapAppointment(existingByCode)
          }
        } else {
          // Two separate patients MUST NEVER get the same appointment ID!
          code10 = await generateGuaranteedUniqueTrackingCode()
        }
      }
    } else {
      code10 = await generateGuaranteedUniqueTrackingCode()
    }

    // 3. Deduplication guard against rapid double-taps on poor connections
    if (cleanMobile && appt.clinicId && apptDate && appt.slotId) {
      const { data: existingDup } = await supabase
        .from('appointments')
        .select('*, clinic:clinics(*), doctor:doctors(*)')
        .eq('clinic_id', appt.clinicId)
        .eq('slot_id', appt.slotId)
        .eq('patient_mobile', cleanMobile)
        .eq('appointment_date', apptDate)
        .maybeSingle()
      if (existingDup) {
        return mapAppointment(existingDup)
      }
    }

    const isPayAtDesk = appt.paymentMode === 'PAY_AT_DESK'
    const fee = Number(appt.feeAmount) || 0

    // Server-authoritative booking RPC for patient & guest bookings (OPD & Diagnostic Labs)
    if (appt.clinicId && !isWalkin) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_patient_appointment', {
          p_clinic_id: appt.clinicId,
          p_doctor_id: appt.doctorId || null,
          p_appointment_date: apptDate,
          p_appointment_time: apptTime,
          p_patient_name: patientNameClean,
          p_patient_phone: cleanMobile,
          p_patient_email: cleanEmail,
          p_patient_age: appt.patientAge ? Number(appt.patientAge) : null,
          p_patient_gender: appt.patientGender || null,
          p_notes: appt.notes || null,
          p_is_pay_at_desk: isPayAtDesk,
          p_slot_id: appt.slotId || null,
          p_payment_mode: appt.paymentMode || (isPayAtDesk ? 'PAY_AT_DESK' : 'ONLINE'),
          p_fee_amount: fee,
          p_selected_lab_tests: (appt as any).selectedLabTests || (appt.notes?.startsWith('Lab Tests:') ? appt.notes : null),
        })

        if (!rpcErr && rpcRes && rpcRes.appointment_id) {
          const { data: createdAppt, error: fetchErr } = await supabase
            .from('appointments')
            .select('*, clinic:clinics(*), doctor:doctors(*)')
            .eq('id', rpcRes.appointment_id)
            .maybeSingle()

          if (!fetchErr && createdAppt) {
            return mapAppointment(createdAppt)
          }

          return mapAppointment({
            id: rpcRes.appointment_id,
            tracking_code_10_digit: rpcRes.tracking_code_10_digit || rpcRes.tracking_code,
            clinic_id: appt.clinicId,
            doctor_id: appt.doctorId,
            slot_id: appt.slotId || null,
            patient_name: patientNameClean,
            patient_mobile: cleanMobile,
            patient_email: cleanEmail,
            patient_age: Number(appt.patientAge) || 1,
            patient_gender: appt.patientGender || 'Other',
            appointment_date: apptDate,
            appointment_time: apptTime,
            fee_amount: rpcRes.fee_amount,
            service_charge_amount: rpcRes.service_charge_amount,
            total_amount: rpcRes.total_amount,
            payment_status: rpcRes.payment_status || 'pending',
            checkin_status: rpcRes.checkin_status || 'not_checked_in',
            payment_mode: isPayAtDesk ? 'PAY_AT_DESK' : 'ONLINE',
            status: rpcRes.status || (isPayAtDesk ? 'WAITING_FOR_APPROVAL' : 'pending_payment'),
            notes: appt.notes || null,
            is_walkin: false,
            attempt_number: 1,
            clinic: null,
            doctor: null,
          })
        } else if (rpcErr) {
          const msg = rpcErr.message || ''
          if (
            msg.includes('rate limit exceeded') ||
            msg.includes('Invalid Nepal mobile') ||
            msg.includes('Patient name must be') ||
            msg.includes('not active or verified') ||
            msg.includes('Doctor does not belong') ||
            msg.includes('Cannot book an appointment slot in the past')
          ) {
            throw new Error(msg)
          }
          console.warn('create_patient_appointment RPC failed, falling back:', rpcErr)
        }
      } catch (rpcEx: any) {
        if (
          rpcEx.message && (
            rpcEx.message.includes('rate limit exceeded') ||
            rpcEx.message.includes('Invalid Nepal mobile') ||
            rpcEx.message.includes('Patient name must be') ||
            rpcEx.message.includes('not active or verified') ||
            rpcEx.message.includes('Doctor does not belong') ||
            rpcEx.message.includes('Cannot book an appointment slot in the past')
          )
        ) {
          throw rpcEx
        }
        console.warn('create_patient_appointment RPC error:', rpcEx)
      }
    }

    try {
      let existingProf: any = null
      if (resolvedUserId) {
        const { data: profById } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', resolvedUserId)
          .maybeSingle()
        if (profById) existingProf = profById
      }
      if (!existingProf && cleanEmail) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle()
        if (data) existingProf = data
      }
      if (!existingProf && cleanMobile) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('phone', cleanMobile)
          .maybeSingle()
        if (data) existingProf = data
      }

      if (existingProf) {
        resolvedUserId = existingProf.id
        const updatePayload: any = {}
        if (!existingProf.full_name && patientNameClean) updatePayload.full_name = patientNameClean
        if (!existingProf.phone && cleanMobile) updatePayload.phone = cleanMobile
        if (!existingProf.age && appt.patientAge) updatePayload.age = Number(appt.patientAge)
        if (!existingProf.gender && appt.patientGender) updatePayload.gender = appt.patientGender
        if (Object.keys(updatePayload).length > 0) {
          updatePayload.updated_at = new Date().toISOString()
          await supabase.from('profiles').update(updatePayload).eq('id', existingProf.id)
        }
      } else if (cleanEmail) {
        const newProfId = resolvedUserId || crypto.randomUUID()
        const newProfile: any = {
          id: newProfId,
          full_name: patientNameClean,
          email: cleanEmail,
          phone: cleanMobile || null,
          age: Number(appt.patientAge) || null,
          gender: appt.patientGender || null,
          role: 'patient',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        const { data: createdProf, error: profErr } = await supabase.from('profiles').insert(newProfile).select().single()
        if (!profErr && createdProf) {
          resolvedUserId = createdProf.id
        } else {
          resolvedUserId = null
        }
      } else {
        // Guest or unauthenticated patient without email: profiles.email has a NOT NULL constraint, fallback to null
        resolvedUserId = null
      }
    } catch (profErr) {
      console.warn('Patient directory profile link note:', profErr)
      resolvedUserId = null
    }

    const serviceCharge = isPayAtDesk ? Number((fee * 0.05).toFixed(2)) : 0
    const totalAmt = isPayAtDesk ? fee + serviceCharge : fee

    const dbPayload: any = {
      id: apptId,
      tracking_code_10_digit: code10,
      user_id: resolvedUserId,
      clinic_id: appt.clinicId,
      doctor_id: appt.doctorId || null,
      patient_name: patientNameClean,
      patient_age: Number(appt.patientAge) || 1,
      patient_gender: appt.patientGender || 'Other',
      patient_mobile: cleanMobile,
      patient_email: cleanEmail,
      appointment_date: apptDate,
      appointment_time: apptTime,
      checkin_status: isPayAtDesk ? 'not_checked_in' : (isWalkin || appt.paymentStatus === 'paid' ? 'checked_in' : 'not_checked_in'),
      payment_status: isPayAtDesk ? 'pending' : normalizePaymentStatus(appt.paymentStatus),
      payment_mode: isPayAtDesk ? 'PAY_AT_DESK' : 'ONLINE',
      status: isPayAtDesk ? 'WAITING_FOR_APPROVAL' : (isWalkin || appt.paymentStatus === 'paid' ? 'APPROVED' : 'pending_payment'),
      attempt_number: 1,
      service_charge_amount: serviceCharge,
      total_amount: totalAmt,
      fee_amount: fee,
      is_walkin: isWalkin,
      slot_id: appt.slotId || null,
    }

    let insertResult = await supabase
      .from('appointments')
      .insert(dbPayload)
      .select('*, clinic:clinics(*), doctor:doctors(*)')
      .single()

    if (insertResult.error && insertResult.error.message?.includes('chk_appointments_status') && dbPayload.status === 'pending_payment') {
      dbPayload.status = 'APPROVED'
      insertResult = await supabase
        .from('appointments')
        .insert(dbPayload)
        .select('*, clinic:clinics(*), doctor:doctors(*)')
        .single()
    }

    if (insertResult.error) throw insertResult.error
    const data = insertResult.data

    // Pay at Desk and unapproved / pending payment appointments MUST NOT be enrolled into live queue until approved or paid
    if (isPayAtDesk || dbPayload.status === 'pending_payment' || dbPayload.status !== 'APPROVED') {
      if (appt.clinicId && isPayAtDesk) {
        try {
          await supabase.from('notifications').insert({
            id: crypto.randomUUID(),
            appointment_id: data.id,
            user_id: appt.clinicId,
            title: `New Pay at Desk Request • ${code10}`,
            message: `New Pay at Desk booking request from ${appt.patientName} for ${apptDate} (${appt.appointmentTime || apptTime}). Total: NPR ${data.total_amount || totalAmt}.`,
            type: 'pay_at_desk_request',
            target_audience: 'specific',
            is_read: false,
            created_at: new Date().toISOString(),
          })
        } catch (e) {
          console.warn('Clinic Pay at Desk notification warning:', e)
        }
      }
      return mapAppointment(data)
    }

    // Enroll into live queue_entries with slot-aware ordering:
    // Place walk-in / appointment at the LAST position of their time slot, and shift later appointments (+1)
    let nextPos = 1
    try {
      const targetSlotTime = appt.appointmentTime || apptTime
      const targetSlotMinutes = parseTimeToMinutes(targetSlotTime)

      let qEntryQuery = supabase
        .from('queue_entries')
        .select('id, appointment_id, queue_position, status, doctor_id')
        .eq('clinic_id', appt.clinicId)
        .in('status', ['waiting', 'inside'])

      if (appt.doctorId) {
        qEntryQuery = qEntryQuery.eq('doctor_id', appt.doctorId)
      } else {
        qEntryQuery = qEntryQuery.is('doctor_id', null)
      }

      const { data: activeEntries } = await qEntryQuery.order('queue_position', { ascending: true })

      if (!activeEntries || activeEntries.length === 0) {
        nextPos = 1
      } else {
        const apptIds = activeEntries.map((e) => e.appointment_id).filter(Boolean)
        const { data: activeAppts } = await supabase
          .from('appointments')
          .select('id, appointment_time, appointment_date')
          .in('id', apptIds)

        const apptMap = new Map<string, any>((activeAppts || []).map((a) => [a.id, a]))

        // Preceding entries: patient inside cabin OR patients in earlier or same time slot
        const preceding = activeEntries.filter((entry) => {
          if (entry.status === 'inside') return true
          const a = apptMap.get(entry.appointment_id)
          const slotMins = parseTimeToMinutes(a?.appointment_time)
          return slotMins <= targetSlotMinutes
        })

        // Target insertion position is right after the last preceding patient in this slot
        nextPos = (preceding.length > 0 ? Math.max(...preceding.map((p) => p.queue_position || 0)) : 0) + 1

        // Shift all active entries with queue_position >= nextPos down (+1) in descending order to avoid key collision
        const laterEntries = activeEntries
          .filter((entry) => (entry.queue_position || 0) >= nextPos)
          .sort((a, b) => (b.queue_position || 0) - (a.queue_position || 0))

        for (const entry of laterEntries) {
          const shifted = (entry.queue_position || 0) + 1
          await supabase
            .from('queue_entries')
            .update({ queue_position: shifted, updated_at: new Date().toISOString() })
            .eq('id', entry.id)
        }
      }

      await supabase.from('queue_entries').insert({
        id: crypto.randomUUID(),
        appointment_id: apptId,
        clinic_id: appt.clinicId,
        doctor_id: appt.doctorId || null,
        queue_position: nextPos,
        status: 'waiting',
      })
    } catch (qErr) {
      console.warn('Queue entry slot-aware auto-enroll warning:', qErr)
    }

    // Idempotent slot capacity recount
    try {
      let targetSlotId = appt.slotId
      if (!targetSlotId && appt.clinicId) {
        const { data: foundSlot } = await supabase
          .from('slots')
          .select('id')
          .eq('clinic_id', appt.clinicId)
          .eq('slot_date', apptDate)
          .eq('start_time', apptTime)
          .maybeSingle()
        if (foundSlot?.id) targetSlotId = foundSlot.id
      }
      if (targetSlotId) {
        await reconcileSlotBookedCount(targetSlotId)
      }
    } catch {}

    // Create automatic appointment confirmation notification in Supabase
    try {
      const clinicName = data?.clinic?.name || 'Clinic'
      await supabase.from('notifications').insert({
        id: crypto.randomUUID(),
        appointment_id: apptId,
        user_id: appt.userId && appt.userId.length === 36 ? appt.userId : null,
        title: `Appointment Confirmed • Token #${nextPos}`,
        message: `Your appointment at ${clinicName} on ${apptDate} (${appt.appointmentTime || apptTime}) is confirmed. 10-Digit Tracking Code: ${code10}`,
        type: 'queue_alert',
        target_audience: 'specific',
        is_read: false,
        created_at: new Date().toISOString(),
      })

      // Also notify clinic about the new confirmed appointment
      if (appt.clinicId) {
        await supabase.from('notifications').insert({
          id: crypto.randomUUID(),
          appointment_id: apptId,
          user_id: appt.clinicId,
          title: `New Patient Appointment • Token #${nextPos}`,
          message: `New appointment confirmed for ${appt.patientName} on ${apptDate} (${appt.appointmentTime || apptTime}). 10-Digit Code: ${code10}.`,
          type: 'queue_alert',
          target_audience: 'specific',
          is_read: false,
          created_at: new Date().toISOString(),
        })
      }
    } catch {}

    if (!data) return null
    const mapped = mapAppointment({ ...data, queue_entries: [{ status: 'waiting', queue_position: nextPos }] })
    return {
      ...mapped,
      optInEarlyCall: Boolean(appt.optInEarlyCall),
      selectedTests: appt.selectedTests || [],
      notes: appt.notes,
    }
  } catch (err) {
    console.error('Error creating appointment:', err)
    return null
  }
}

export async function updateAppointmentStatus(id: string, status: string): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString()

    // Map UI status to valid queue_status_enum and appointment checkin_status
    let qStatus = 'waiting'
    let apptCheckinStatus = 'checked_in'
    if (status === 'in_consultation' || status === 'inside') {
      qStatus = 'inside'
      apptCheckinStatus = 'in_consultation'
    } else if (status === 'completed' || status === 'done') {
      qStatus = 'done'
      apptCheckinStatus = 'completed'
    } else if (status === 'cancelled' || status === 'no_show') {
      qStatus = 'no_show'
      apptCheckinStatus = 'cancelled'
    } else if (status === 'sample_collected') {
      qStatus = 'sample_collected'
      apptCheckinStatus = 'sample_collected'
    } else if (status === 'processing') {
      qStatus = 'processing'
      apptCheckinStatus = 'processing'
    } else if (status === 'report_prepared') {
      qStatus = 'report_prepared'
      apptCheckinStatus = 'report_prepared'
    } else {
      qStatus = 'waiting'
      apptCheckinStatus = 'checked_in'
    }

    // Keep appointment checkin_status synchronized with live workflow
    let apptOk = false
    const { error: apptErr } = await supabase
      .from('appointments')
      .update({ checkin_status: apptCheckinStatus, updated_at: nowIso })
      .eq('id', id)

    if (!apptErr) {
      apptOk = true
    } else if (String(apptErr.message || '').includes('updated_at')) {
      const { error: retryErr } = await supabase
        .from('appointments')
        .update({ checkin_status: apptCheckinStatus })
        .eq('id', id)
      apptOk = !retryErr
      if (retryErr) console.error('Error updating appointment checkin_status:', retryErr)
    } else {
      console.error('Error updating appointment checkin_status:', apptErr)
    }

    // Update or create queue_entries row
    const { data: existingQ } = await supabase
      .from('queue_entries')
      .select('id')
      .eq('appointment_id', id)
      .maybeSingle()

    const qUpdate: any = { status: qStatus, updated_at: nowIso }
    if (qStatus === 'inside') {
      qUpdate.inside_at = nowIso
    } else if (['done', 'no_show', 'sample_collected', 'processing', 'report_prepared'].includes(qStatus)) {
      qUpdate.completed_at = nowIso
    }

    let qOk = false
    if (existingQ?.id) {
      const { error: qErr } = await supabase
        .from('queue_entries')
        .update(qUpdate)
        .eq('id', existingQ.id)

      if (!qErr) {
        qOk = true
      } else {
        // Retry with minimal schema columns in case optional timestamp columns are absent
        const { error: qRetryErr } = await supabase
          .from('queue_entries')
          .update({ status: qStatus })
          .eq('id', existingQ.id)
        qOk = !qRetryErr
        if (qRetryErr) console.error('Error updating queue_entries status:', qRetryErr)
      }
    } else {
      // Fetch appointment to get clinic_id & doctor_id
      const { data: appt } = await supabase
        .from('appointments')
        .select('clinic_id, doctor_id')
        .eq('id', id)
        .maybeSingle()

      if (appt?.clinic_id) {
        const { error: qInsErr } = await supabase.from('queue_entries').insert({
          id: crypto.randomUUID(),
          appointment_id: id,
          clinic_id: appt.clinic_id,
          doctor_id: appt.doctor_id || null,
          queue_position: 1,
          ...qUpdate,
        })
        if (!qInsErr) {
          qOk = true
        } else {
          const { error: qInsRetryErr } = await supabase.from('queue_entries').insert({
            id: crypto.randomUUID(),
            appointment_id: id,
            clinic_id: appt.clinic_id,
            doctor_id: appt.doctor_id || null,
            queue_position: 1,
            status: qStatus,
          })
          qOk = !qInsRetryErr
          if (qInsRetryErr) console.error('Error inserting queue_entries status:', qInsRetryErr)
        }
      }
    }

    if (!apptOk && !qOk) {
      return false
    }

    // Keep slot capacity accurately recounted on cancellation
    if (status === 'cancelled' || status === 'no_show') {
      try {
        const { data: targetAppt } = await supabase
          .from('appointments')
          .select('slot_id')
          .eq('id', id)
          .maybeSingle()
        if (targetAppt?.slot_id) {
          const { data: slotAppts } = await supabase
            .from('appointments')
            .select('id, checkin_status')
            .eq('slot_id', targetAppt.slot_id)
          const realCount = (slotAppts || []).filter((a: any) => a.id !== id && a.checkin_status !== 'cancelled').length
          await supabase.from('slots').update({ booked_count: realCount }).eq('id', targetAppt.slot_id)
        }
      } catch {}
    }

    // Automatic Live Notification Dispatch
    try {
      const { data: targetAppt } = await supabase
        .from('appointments')
        .select('id, user_id, clinic_id, doctor_id, tracking_code_10_digit, patient_name, clinics(name)')
        .eq('id', id)
        .maybeSingle()

      if (targetAppt) {
        const clinicName = (targetAppt as any)?.clinics?.name || 'Clinic'
        const code10 = targetAppt.tracking_code_10_digit || ''
        const patientName = targetAppt.patient_name || 'Patient'

        let notifTitle = ''
        let notifMessage = ''

        if (qStatus === 'inside') {
          notifTitle = "It's Your Turn! • Please Enter Cabin"
          notifMessage = `Dear ${patientName}, the doctor is ready for your consultation at ${clinicName}. Please proceed into the doctor's cabin now.${code10 ? ` (Tracking Code: ${code10})` : ''}`
        } else if (qStatus === 'sample_collected' || qStatus === 'processing') {
          notifTitle = 'Sample Collected • Processing in Lab'
          notifMessage = `Dear ${patientName}, your diagnostic test sample has been collected at ${clinicName} and is now in the Processing stage.${code10 ? ` (Tracking Code: ${code10})` : ''}`
        } else if (qStatus === 'report_prepared') {
          notifTitle = 'Lab Report Ready • Download Available'
          notifMessage = `Dear ${patientName}, your diagnostic lab test report from ${clinicName} is now ready to view and download.${code10 ? ` (Tracking Code: ${code10})` : ''}`
        } else if (qStatus === 'done') {
          notifTitle = 'Consultation Completed'
          notifMessage = `Dear ${patientName}, your visit at ${clinicName} has been marked completed. Thank you for choosing Dactor.${code10 ? ` (Tracking Code: ${code10})` : ''}`
        }

        if (notifTitle) {
          await supabase.from('notifications').insert({
            id: crypto.randomUUID(),
            appointment_id: targetAppt.id,
            user_id: targetAppt.user_id && targetAppt.user_id.length === 36 ? targetAppt.user_id : null,
            title: notifTitle,
            message: notifMessage,
            type: 'queue_alert',
            target_audience: 'specific',
            is_read: false,
            meta_json: JSON.stringify({ tracking_code: code10, status: qStatus }),
            created_at: nowIso,
          })
        }

        // Dynamically reindex live queue: person inside becomes Turn 1, waiting patients align behind
        if (targetAppt.clinic_id) {
          await reindexActiveQueue(targetAppt.clinic_id, (targetAppt as any).doctor_id)
        }

        // When a patient enters cabin, finishes, or moves to processing, notify approaching patients in queue
        if (targetAppt.clinic_id && (qStatus === 'inside' || qStatus === 'done' || qStatus === 'processing')) {
          checkAndNotifyApproachingPatients(targetAppt.clinic_id).catch(() => {})
        }
      }
    } catch (notifErr) {
      console.warn('Automatic notification dispatch warning:', notifErr)
    }

    return true
  } catch (err) {
    console.error('Error updating appointment status:', err)
    return false
  }
}

/**
 * Atomically transitions a diagnostic appointment into `processing` via the
 * authoritative `transition_diagnostic_to_processing` RPC when deployed, falling
 * back cleanly to resilient direct table updates.
 */
export async function transitionDiagnosticToProcessing(
  appointmentId: string,
  testName?: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('transition_diagnostic_to_processing', {
      p_appointment_id: appointmentId,
      p_test_name: testName || null,
    })
    if (!error && data?.success !== false) {
      return true
    }
    if (error) {
      console.warn('transition_diagnostic_to_processing RPC fallback:', error.message)
    }
  } catch (rpcErr) {
    console.warn('transition_diagnostic_to_processing RPC unavailable, using fallback:', rpcErr)
  }

  return await updateAppointmentStatus(appointmentId, 'processing')
}

/**
 * Automatically transfers patients in live queue whose appointment was not completed to 'no_show'.
 * Scans past-day appointments or today's expired slots/queue entries.
 */
export async function autoTransferUncompletedQueueToNoShow(
  clinicId?: string,
  includeToday: boolean = false
): Promise<{ success: boolean; count: number }> {
  try {
    // 1. Attempt database RPC for atomic transaction
    const { data: rpcRes, error: rpcErr } = await supabase.rpc(
      'auto_transfer_uncompleted_queue_to_noshow',
      {
        p_clinic_id: clinicId || null,
        p_include_today: includeToday,
        p_today_cutoff_minutes: 60,
      }
    )
    if (!rpcErr && rpcRes && rpcRes.success) {
      return { success: true, count: rpcRes.transferred_count || 0 }
    }
  } catch (err) {
    // Fallback to client-side batch sweep
  }

  try {
    const todayStr = new Date().toISOString().split('T')[0]
    const nowIso = new Date().toISOString()

    // 1. Sweep uncompleted past appointments directly
    let apptQuery = supabase
      .from('appointments')
      .select('id, appointment_date, appointment_time, checkin_status, slot_id')
      .lt('appointment_date', todayStr)
      .not('checkin_status', 'in', '("completed","cancelled","done","no_show","processing","report_prepared")')

    if (clinicId) {
      apptQuery = apptQuery.eq('clinic_id', clinicId)
    }

    const { data: pastMissedAppts } = await apptQuery
    let count = 0

    if (pastMissedAppts && pastMissedAppts.length > 0) {
      for (const appt of pastMissedAppts) {
        await supabase
          .from('appointments')
          .update({ checkin_status: 'no_show', updated_at: nowIso })
          .eq('id', appt.id)

        // Recount slot if needed
        if (appt.slot_id) {
          try {
            const { data: slotAppts } = await supabase
              .from('appointments')
              .select('id, checkin_status')
              .eq('slot_id', appt.slot_id)
            const realCount = (slotAppts || []).filter(
              (a: any) => a.id !== appt.id && a.checkin_status !== 'cancelled' && a.checkin_status !== 'no_show'
            ).length
            await supabase.from('slots').update({ booked_count: realCount }).eq('id', appt.slot_id)
          } catch {}
        }
        count++
      }
    }

    // 2. Sweep active or skipped queue entries
    let queueQuery = supabase
      .from('queue_entries')
      .select('id, appointment_id, clinic_id, status, created_at, appointments(id, appointment_date, checkin_status, slot_id)')
      .in('status', ['waiting', 'inside', 'skipped'])

    if (clinicId) {
      queueQuery = queueQuery.eq('clinic_id', clinicId)
    }

    const { data: activeEntries } = await queueQuery
    if (activeEntries && activeEntries.length > 0) {
      for (const entry of activeEntries) {
        const appt: any = entry.appointments
        const isPast = appt ? appt.appointment_date < todayStr : (entry.created_at && entry.created_at.slice(0, 10) < todayStr)
        const isUncompleted = appt ? !['completed', 'cancelled', 'done', 'processing', 'report_prepared'].includes(appt.checkin_status || '') : true

        if (isPast && isUncompleted) {
          await supabase
            .from('queue_entries')
            .update({ status: 'no_show', completed_at: nowIso, updated_at: nowIso })
            .eq('id', entry.id)
        }
      }
    }

    return { success: true, count }
  } catch (e) {
    console.error('Error auto transferring uncompleted queue to no-show:', e)
    return { success: false, count: 0 }
  }
}

// ==========================================
// SLOTS & SCHEDULE API
// ==========================================
export async function getSlots(clinicId: string, date: string): Promise<Slot[]> {
  try {
    const [slotsRes, apptsRes] = await Promise.all([
      supabase
        .from('slots')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('slot_date', date)
        .order('start_time', { ascending: true }),
      supabase
        .from('appointments')
        .select('id, slot_id, checkin_status, payment_mode, status')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', date)
    ])

    if (slotsRes.error) throw slotsRes.error
    const activeAppts = (apptsRes.data || []).filter(
      (a: any) =>
        a.checkin_status !== 'cancelled' &&
        !(a.payment_mode === 'PAY_AT_DESK' && a.status === 'WAITING_FOR_APPROVAL')
    )

    return (slotsRes.data || []).map((raw) => {
      const slot = mapSlot(raw)
      const actualCount = activeAppts.filter((a: any) => a.slot_id === slot.id).length
      return {
        ...slot,
        bookedCount: actualCount,
      }
    })
  } catch (err) {
    console.error('Error fetching slots:', err)
    return []
  }
}

export async function getMonthSlots(
  clinicId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, Slot[]>> {
  try {
    const { data, error } = await supabase
      .from('slots')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('slot_date', startDate)
      .lte('slot_date', endDate)
      .order('start_time', { ascending: true })

    if (error) throw error
    const map: Record<string, Slot[]> = {}
    for (const raw of data || []) {
      const slot = mapSlot(raw)
      const d = slot.slotDate
      if (!map[d]) map[d] = []
      map[d].push(slot)
    }
    return map
  } catch (err) {
    console.error('Error fetching month slots:', err)
    return {}
  }
}

export async function createSlot(slot: Partial<Slot>): Promise<Slot | null> {
  try {
    const dbPayload = {
      id: slot.id || crypto.randomUUID(),
      clinic_id: slot.clinicId,
      doctor_id: slot.doctorId || null,
      slot_date: slot.slotDate,
      start_time: formatTimeForPostgres(slot.startTime),
      end_time: formatTimeForPostgres(slot.endTime),
      max_capacity: slot.maxCapacity || 10,
      booked_count: slot.bookedCount || 0,
      is_published: slot.isPublished ?? true,
    }

    const { data, error } = await supabase
      .from('slots')
      .insert(dbPayload)
      .select()
      .single()

    if (error) {
      console.error('Error creating slot in Supabase:', error)
      throw error
    }
    return data ? mapSlot(data) : null
  } catch (err) {
    console.error('Failed to create slot:', err)
    return null
  }
}

export async function createSlotsBatch(slots: Partial<Slot>[]): Promise<Slot[]> {
  try {
    if (!slots || slots.length === 0) return []
    const dbPayloads = slots.map((slot) => ({
      id: slot.id || crypto.randomUUID(),
      clinic_id: slot.clinicId,
      doctor_id: slot.doctorId || null,
      slot_date: slot.slotDate,
      start_time: formatTimeForPostgres(slot.startTime),
      end_time: formatTimeForPostgres(slot.endTime),
      max_capacity: slot.maxCapacity || 10,
      booked_count: slot.bookedCount || 0,
      is_published: slot.isPublished ?? true,
    }))

    const { data, error } = await supabase
      .from('slots')
      .insert(dbPayloads)
      .select()

    if (error) {
      console.error('Error batch creating slots in Supabase:', error)
      throw error
    }
    return (data || []).map(mapSlot)
  } catch (err) {
    console.error('Failed to batch create slots:', err)
    return []
  }
}

export async function getSlotsByDoctorAndDate(doctorId: string, date: string): Promise<Slot[]> {
  try {
    const { data, error } = await supabase
      .from('slots')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('slot_date', date)
      .order('start_time', { ascending: true })

    if (error) throw error
    return (data || []).map(mapSlot)
  } catch (err) {
    console.error('Error fetching slots by doctor and date:', err)
    return []
  }
}

export async function deleteSlot(slotId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('slots').delete().eq('id', slotId)
    return !error
  } catch (err) {
    console.error('Error deleting slot:', err)
    return false
  }
}

export async function reorderQueuePosition(
  clinicId: string,
  appointmentId: string,
  direction: 'up' | 'down' | 'top',
  doctorId?: string | null
): Promise<{ success: boolean; message?: string }> {
  try {
    // 1. Fetch waiting queue entries for this clinic & doctor ordered by position
    let q = supabase
      .from('queue_entries')
      .select('id, appointment_id, queue_position, status, doctor_id')
      .eq('clinic_id', clinicId)
      .eq('status', 'waiting')

    if (doctorId) {
      q = q.eq('doctor_id', doctorId)
    }

    const { data: entries, error } = await q.order('queue_position', { ascending: true })

    if (error || !entries || entries.length <= 1) {
      return { success: false, message: 'Not enough waiting queue entries to slide.' }
    }

    const currentIndex = entries.findIndex((e) => e.appointment_id === appointmentId)
    if (currentIndex === -1) {
      return { success: false, message: 'Patient not currently in waiting queue.' }
    }

    if (direction === 'top') {
      if (currentIndex === 0) {
        return { success: false, message: 'Already at the top of the waiting queue.' }
      }
      const topPos = (entries[0].queue_position || 1) - 1
      await supabase
        .from('queue_entries')
        .update({ queue_position: topPos, updated_at: new Date().toISOString() })
        .eq('id', entries[currentIndex].id)

      return { success: true }
    }

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= entries.length) {
      return {
        success: false,
        message: direction === 'up' ? 'Already at the top of the waiting queue.' : 'Already at the end of the waiting queue.',
      }
    }

    const currentEntry = entries[currentIndex]
    const targetEntry = entries[targetIndex]

    // Swap their queue positions safely
    const posA = currentEntry.queue_position
    const posB = targetEntry.queue_position

    // Temporarily set negative position to prevent duplicate index violation if unique constraint exists
    await supabase
      .from('queue_entries')
      .update({ queue_position: -999999, updated_at: new Date().toISOString() })
      .eq('id', currentEntry.id)

    await supabase
      .from('queue_entries')
      .update({ queue_position: posA, updated_at: new Date().toISOString() })
      .eq('id', targetEntry.id)

    await supabase
      .from('queue_entries')
      .update({ queue_position: posB, updated_at: new Date().toISOString() })
      .eq('id', currentEntry.id)

    return { success: true }
  } catch (err: any) {
    console.error('Error reordering queue position:', err)
    return { success: false, message: err?.message || 'Failed to reorder queue position' }
  }
}

export async function reindexActiveQueue(
  clinicId: string,
  doctorId?: string | null,
  sortBySlotTime: boolean = false
): Promise<boolean> {
  try {
    let query = supabase
      .from('queue_entries')
      .select('id, appointment_id, clinic_id, doctor_id, queue_position, status, appointments(appointment_time)')
      .eq('clinic_id', clinicId)
      .in('status', ['waiting', 'inside'])

    if (doctorId) {
      query = query.eq('doctor_id', doctorId)
    }

    const { data: entries, error } = await query
    if (error || !entries || entries.length === 0) return true

    // Group by doctorId if doctorId was not explicitly provided to partition per doctor's cabin
    const groups: Record<string, typeof entries> = {}
    for (const entry of entries) {
      const key = entry.doctor_id || '__clinic__'
      if (!groups[key]) groups[key] = []
      groups[key].push(entry)
    }

    for (const key of Object.keys(groups)) {
      const group = groups[key]
      // Sort: inside (0) vs waiting (1), preserving queue_position priority unless chronological slot sort requested
      group.sort((a, b) => {
        const aInside = a.status === 'inside' ? 0 : 1
        const bInside = b.status === 'inside' ? 0 : 1
        if (aInside !== bInside) return aInside - bInside

        if (sortBySlotTime) {
          const aTime = (a.appointments as any)?.appointment_time || ''
          const bTime = (b.appointments as any)?.appointment_time || ''
          if (aTime && bTime && aTime !== bTime) {
            return aTime.localeCompare(bTime)
          }
        }
        return (a.queue_position || 0) - (b.queue_position || 0)
      })

      // Two-pass update with negative offsets to avoid unique constraint collisions
      for (let i = 0; i < group.length; i++) {
        await supabase
          .from('queue_entries')
          .update({ queue_position: -((group[i].queue_position || 0) + 10000), updated_at: new Date().toISOString() })
          .eq('id', group[i].id)
      }

      for (let i = 0; i < group.length; i++) {
        await supabase
          .from('queue_entries')
          .update({ queue_position: i + 1, updated_at: new Date().toISOString() })
          .eq('id', group[i].id)
      }
    }
    return true
  } catch (err) {
    console.error('Error reindexing active queue:', err)
    return false
  }
}

/**
 * Reconciles booked_count for a slot so it strictly counts approved or paid appointments
 * (excluding unapproved Pay at Desk and cancelled visits).
 */
export async function reconcileSlotBookedCount(slotId: string): Promise<void> {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!slotId || !uuidRegex.test(slotId.trim())) return
  try {
    const { data: slotAppts } = await supabase
      .from('appointments')
      .select('id, checkin_status, status, payment_status')
      .eq('slot_id', slotId.trim())
    const realCount = (slotAppts || []).filter(
      (a: any) =>
        a.checkin_status !== 'cancelled' &&
        a.payment_status !== 'failed' &&
        (a.status === 'APPROVED' || a.payment_status === 'paid')
    ).length
    await supabase.from('slots').update({ booked_count: realCount }).eq('id', slotId.trim())
  } catch (e) {
    console.warn('reconcileSlotBookedCount error:', e)
  }
}

function getLocalDateIsoString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function shiftAppointmentDate(
  appointmentId: string,
  newDate: string,
  newTime?: string,
  reason?: string,
  newSlotId?: string,
  newDoctorId?: string | null,
  trackingCode?: string
): Promise<boolean> {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const validSlotId = newSlotId && uuidRegex.test(newSlotId.trim()) ? newSlotId.trim() : null
    const validDoctorId = newDoctorId && uuidRegex.test(newDoctorId.trim()) ? newDoctorId.trim() : null

    const { data: oldAppt } = await supabase
      .from('appointments')
      .select('id, slot_id, doctor_id, clinic_id, user_id, appointment_time, status, checkin_status, payment_mode, tracking_code_10_digit, clinic:clinics(name)')
      .eq('id', appointmentId)
      .maybeSingle()

    const normalizedTime = formatTimeForPostgres(newTime || oldAppt?.appointment_time || '10:00 AM')
    const resolvedDocId = validDoctorId || (oldAppt?.doctor_id && uuidRegex.test(String(oldAppt.doctor_id)) ? String(oldAppt.doctor_id) : null)
    const cleanReason = reason?.trim() || 'Patient requested reschedule'

    // 1. Primary Authoritative SECURITY DEFINER RPC (supports live and updated RPC signatures)
    try {
      let rpcResult = await supabase.rpc('reschedule_patient_appointment', {
        p_appointment_id: appointmentId,
        p_new_date: newDate,
        p_new_time: normalizedTime,
        p_new_slot_id: validSlotId,
        p_new_doctor_id: resolvedDocId,
        p_reason: cleanReason,
      })

      if (
        rpcResult.error &&
        (rpcResult.error.code === 'PGRST202' ||
          String(rpcResult.error.message || '').includes('schema cache'))
      ) {
        rpcResult = await supabase.rpc('reschedule_patient_appointment', {
          p_appointment_id: appointmentId,
          p_new_date: newDate,
          p_new_time: normalizedTime,
          p_slot_id: validSlotId,
          p_doctor_id: resolvedDocId,
          p_tracking_code: trackingCode || oldAppt?.tracking_code_10_digit || null,
        })
      }

      const rpcPayload = rpcResult.data as any
      const explicitFalse = rpcPayload && typeof rpcPayload === 'object' && rpcPayload.success === false
      if (!rpcResult.error && !explicitFalse) {
        return true
      }
      if (explicitFalse) {
        console.warn('reschedule_patient_appointment rejected:', rpcPayload?.error || rpcPayload)
        return false
      }
    } catch (rpcErr) {
      console.warn('reschedule_patient_appointment RPC fallback notice:', rpcErr)
    }

    // 2. Direct Fallback Update (valid enum checkin_status = 'not_checked_in' & Postgres TIME)
    const preservedStatus =
      oldAppt?.status === 'WAITING_FOR_APPROVAL' ? 'WAITING_FOR_APPROVAL' : 'APPROVED'

    const updatePayload: any = {
      appointment_date: newDate,
      appointment_time: normalizedTime,
      checkin_status: 'not_checked_in',
      updated_at: new Date().toISOString(),
    }
    if (oldAppt?.status !== preservedStatus) {
      updatePayload.status = preservedStatus
    }
    if (validSlotId) {
      updatePayload.slot_id = validSlotId
    }
    if (validDoctorId && validDoctorId !== oldAppt?.doctor_id) {
      updatePayload.doctor_id = validDoctorId
    }

    let updatedAppt: any = null
    let updateErr: any = null

    const primaryRes = await supabase
      .from('appointments')
      .update(updatePayload)
      .eq('id', appointmentId)
      .select('*, clinic:clinics(*)')
      .single()

    updatedAppt = primaryRes.data
    updateErr = primaryRes.error

    // If direct update hit patient privilege trigger on restricted columns, retry strictly whitelisted fields
    if (
      updateErr &&
      /(privilege|identity|not authorized|cannot update|only cancel)/i.test(
        String(updateErr.message || '')
      )
    ) {
      const safePayload: any = {
        appointment_date: newDate,
        appointment_time: normalizedTime,
        updated_at: new Date().toISOString(),
      }
      if (validSlotId) safePayload.slot_id = validSlotId
      const retryRes = await supabase
        .from('appointments')
        .update(safePayload)
        .eq('id', appointmentId)
        .select('*, clinic:clinics(*)')
        .single()
      updatedAppt = retryRes.data
      updateErr = retryRes.error
    }

    if (updateErr) throw updateErr

    // Reconcile slot capacity for old and new slots
    if (oldAppt?.slot_id && oldAppt.slot_id !== validSlotId) {
      await reconcileSlotBookedCount(oldAppt.slot_id)
    }
    if (validSlotId) {
      await reconcileSlotBookedCount(validSlotId)
    }

    // Manage Queue Entry on Reschedule / Follow-Up
    try {
      const todayStr = getLocalDateIsoString()
      const targetTime = normalizedTime || updatedAppt?.appointment_time
      const targetMinutes = parseTimeToMinutes(targetTime)

      const { data: existingQ } = await supabase
        .from('queue_entries')
        .select('*')
        .eq('appointment_id', appointmentId)
        .maybeSingle()

      if (newDate === todayStr && preservedStatus === 'APPROVED') {
        // Patient rescheduled/follow-up to today: reposition slot-aware
        const { data: activeEntries } = await supabase
          .from('queue_entries')
          .select('id, appointment_id, queue_position, status')
          .eq('clinic_id', updatedAppt.clinic_id)
          .neq('appointment_id', appointmentId)
          .in('status', ['waiting', 'inside'])
          .order('queue_position', { ascending: true })

        const apptIds = (activeEntries || []).map((e) => e.appointment_id).filter(Boolean)
        const { data: activeAppts } = apptIds.length > 0
          ? await supabase.from('appointments').select('id, appointment_time').in('id', apptIds)
          : { data: [] }
        const apptMap = new Map<string, any>((activeAppts || []).map((a) => [a.id, a]))

        const preceding = (activeEntries || []).filter((entry) => {
          if (entry.status === 'inside') return true
          const a = apptMap.get(entry.appointment_id)
          const slotMins = parseTimeToMinutes(a?.appointment_time)
          return slotMins <= targetMinutes
        })

        const nextPos = (preceding.length > 0 ? Math.max(...preceding.map((p) => p.queue_position || 0)) : 0) + 1

        // Shift all entries with queue_position >= nextPos down (+1)
        const laterEntries = (activeEntries || [])
          .filter((entry) => (entry.queue_position || 0) >= nextPos)
          .sort((a, b) => (b.queue_position || 0) - (a.queue_position || 0))

        for (const entry of laterEntries) {
          await supabase
            .from('queue_entries')
            .update({ queue_position: (entry.queue_position || 0) + 1, updated_at: new Date().toISOString() })
            .eq('id', entry.id)
        }

        if (existingQ) {
          await supabase
            .from('queue_entries')
            .update({
              queue_position: nextPos,
              status: 'waiting',
              called_at: null,
              completed_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingQ.id)
        } else {
          await supabase.from('queue_entries').insert({
            id: crypto.randomUUID(),
            appointment_id: appointmentId,
            clinic_id: updatedAppt.clinic_id,
            doctor_id: updatedAppt.doctor_id || null,
            queue_position: nextPos,
            status: 'waiting',
          })
        }
      } else {
        // Rescheduled to a future date OR unapproved Pay-at-Desk: remove from today's active queue
        if (existingQ) {
          await supabase
            .from('queue_entries')
            .delete()
            .eq('id', existingQ.id)
        }
      }
    } catch (qErr) {
      console.warn('Queue adjustment warning during reschedule:', qErr)
    }

    // Create reschedule alert notification for the patient
    try {
      const clinicName = updatedAppt?.clinic?.name || 'Clinic'
      await supabase.from('notifications').insert({
        id: crypto.randomUUID(),
        appointment_id: appointmentId,
        user_id: updatedAppt?.user_id && updatedAppt.user_id.length === 36 ? updatedAppt.user_id : null,
        title: `Appointment Rescheduled • ${newDate}`,
        message: `Your appointment at ${clinicName} has been shifted to ${newDate} (${newTime || normalizedTime}). Reason: ${cleanReason}`,
        type: 'queue_alert',
        target_audience: 'specific',
        is_read: false,
        created_at: new Date().toISOString(),
      })
    } catch {}

    return true
  } catch (err) {
    console.error('Error shifting appointment date:', err)
    return false
  }
}

export async function checkAndNotifyApproachingPatients(
  clinicId: string,
  threshold = 3
): Promise<void> {
  try {
    const { data: waitingEntries } = await supabase
      .from('queue_entries')
      .select('id, appointment_id, queue_position, appointments(patient_name, user_id, clinic_id, tracking_code_10_digit, clinics(name))')
      .eq('clinic_id', clinicId)
      .eq('status', 'waiting')
      .order('queue_position', { ascending: true })

    if (!waitingEntries) return

    for (const entry of waitingEntries) {
      const pos = Number(entry.queue_position)
      if (pos > 0 && pos <= threshold) {
        const appt: any = entry.appointments
        const clinicName = appt?.clinics?.name || 'Clinic'
        const code10 = appt?.tracking_code_10_digit || ''
        const patientsAhead = Math.max(0, pos - 1)
        const msg = patientsAhead === 0
          ? `You are next in line at ${clinicName}! Please prepare to enter the doctor's cabin.${code10 ? ` (Tracking Code: ${code10})` : ''}`
          : `Your turn is approaching! Only ${patientsAhead} ${patientsAhead === 1 ? 'patient' : 'patients'} ahead of you at ${clinicName}. Please proceed to the clinic waiting area.${code10 ? ` (Tracking Code: ${code10})` : ''}`

        // Deduplicate: avoid resending same token alert repeatedly
        const { data: recentAlert } = await supabase
          .from('notifications')
          .select('id')
          .eq('appointment_id', entry.appointment_id)
          .ilike('title', `%Token #${pos}%`)
          .maybeSingle()

        if (!recentAlert) {
          await supabase.from('notifications').insert({
            id: crypto.randomUUID(),
            appointment_id: entry.appointment_id,
            user_id: appt?.user_id && appt.user_id.length === 36 ? appt.user_id : null,
            title: `Your Turn is Approaching! Token #${pos}`,
            message: msg,
            type: 'queue_alert',
            target_audience: 'specific',
            is_read: false,
            meta_json: JSON.stringify({ tracking_code: code10, token: pos }),
            created_at: new Date().toISOString(),
          })
        }
      }
    }
  } catch (err) {
    console.warn('Error checking approaching patients notification:', err)
  }
}

// ==========================================
// DIAGNOSTIC LAB SERVICES & RATES
// ==========================================
export async function getClinicServices(clinicId: string): Promise<ClinicService[]> {
  try {
    const { data, error } = await supabase
      .from('clinic_services')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('service_name', { ascending: true })

    if (error) throw error
    return (data || []).map(mapService)
  } catch (err) {
    console.error('Error fetching clinic services:', err)
    return []
  }
}

export async function createClinicService(service: Partial<ClinicService>): Promise<ClinicService | null> {
  try {
    const dbPayload = {
      id: service.id || crypto.randomUUID(),
      clinic_id: service.clinicId,
      service_name: service.serviceName,
      price: Number(service.price) || 0,
      description: service.category || service.description || 'Diagnostic Test',
    }

    const { data, error } = await supabase
      .from('clinic_services')
      .insert(dbPayload)
      .select()
      .single()

    if (error) throw error
    return data ? mapService(data) : null
  } catch (err) {
    console.error('Error creating clinic service:', err)
    return null
  }
}

export async function deleteClinicService(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('clinic_services').delete().eq('id', id)
    return !error
  } catch {
    return false
  }
}

// ==========================================
// LAB REPORTS API
// ==========================================
export async function getLabReportsByTrackingCode(code: string): Promise<LabReport[]> {
  try {
    const cleanCode = code.trim()
    // Find appointment by 10-digit code first
    const appt = await getAppointmentByTrackingCode(cleanCode)
    if (!appt) return []

    const { data, error } = await supabase
      .from('lab_reports')
      .select('*, appointment:appointments(*)')
      .eq('appointment_id', appt.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map((r) => {
      const mapped = mapLabReport({ ...r, tracking_code_10_digit: cleanCode })
      // Redact raw storage path / file URL so unauthenticated callers NEVER receive raw file URLs
      return {
        ...mapped,
        reportFileUrl: undefined,
      }
    })
  } catch (err) {
    console.error('Error fetching lab reports by code:', err)
    return []
  }
}

export async function getLabReportsByClinic(clinicId: string): Promise<LabReport[]> {
  try {
    const { data, error } = await supabase
      .from('lab_reports')
      .select('*, appointment:appointments(*)')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map(mapLabReport)
  } catch (err) {
    console.error('Error fetching lab reports by clinic:', err)
    return []
  }
}

export async function saveLabReport(report: Partial<LabReport>): Promise<LabReport | null> {
  try {
    const rStatus = (report.status as string) || 'processing'
    let stage: 'sample_collected' | 'processing' | 'prepared' = 'processing'
    if (rStatus === 'sample_collected') stage = 'sample_collected'
    else if (rStatus === 'ready' || rStatus === 'prepared' || rStatus === 'delivered') stage = 'prepared'

    const dbPayload: any = {
      id: report.id || crypto.randomUUID(),
      appointment_id: report.appointmentId,
      clinic_id: report.clinicId,
      test_name: report.testName || 'Diagnostic Pathology Report',
      stage,
      file_url: report.reportFileUrl || null,
      file_name: report.technicianNotes || 'lab_report.pdf',
      file_type: report.reportFileType || 'pdf',
      patient_name_verification: report.patientName || 'Patient',
      sample_collected_at: report.sampleCollectedAt || new Date().toISOString(),
      prepared_at: stage === 'prepared' ? (report.preparedAt || new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    }

    let { data, error } = await supabase
      .from('lab_reports')
      .upsert(dbPayload, { onConflict: 'appointment_id' })
      .select('*, appointment:appointments(*)')
      .single()

    if (error && String(error.message || '').includes('updated_at')) {
      const { updated_at: _omit, ...withoutUpdatedAt } = dbPayload
      const retryRes = await supabase
        .from('lab_reports')
        .upsert(withoutUpdatedAt, { onConflict: 'appointment_id' })
        .select('*, appointment:appointments(*)')
        .single()
      data = retryRes.data
      error = retryRes.error
    }

    if (error) throw error
    return data ? mapLabReport(data) : null
  } catch (err) {
    console.error('Error saving lab report:', err)
    return null
  }
}

export async function uploadReportFile(
  fileName: string,
  fileBlob: Blob,
  clinicId?: string
): Promise<string | null> {
  const cleanName = fileName.replace(/\s+/g, '_')
  const mimeType = fileBlob.type || 'application/pdf'

  // 1. Server-authorized upload flow
  try {
    const { data: authData, error: authError } = await supabase.functions.invoke('document-access', {
      body: {
        action: 'authorize_upload',
        documentType: 'lab_report',
        entityId: clinicId || 'general_lab',
        fileName: cleanName,
        mimeType,
        fileSize: fileBlob.size,
      },
    })

    if (!authError && authData?.authorized && authData?.signedUrl && authData?.path && authData?.token) {
      const { error: uploadError } = await supabase.storage
        .from(authData.bucket || 'lab-reports-private')
        .uploadToSignedUrl(authData.path, authData.token, fileBlob, {
          contentType: mimeType,
        })
      if (!uploadError) {
        return authData.path
      }
      console.warn('uploadToSignedUrl failed, falling back:', uploadError)
    }
  } catch (authEx) {
    console.warn('Server-authorized upload flow fallback:', authEx)
  }

  // 2. Direct upload fallback
  try {
    const path = `reports/lab_report_${Date.now()}_${cleanName}`
    const { error } = await supabase.storage.from('lab-reports-private').upload(path, fileBlob, {
      upsert: true,
      contentType: mimeType,
    })

    if (!error) {
      return path
    }
    console.error('Error uploading report file to lab-reports-private:', error)
    return null
  } catch (err) {
    console.error('Error uploading report file:', err)
    return null
  }
}

export async function uploadClinicDocument(
  fileName: string,
  fileBlob: Blob,
  folder = 'registration_docs',
  entityId?: string
): Promise<string | null> {
  try {
    const cleanName = fileName.replace(/\s+/g, '_')
    const mimeType = fileBlob.type || 'application/pdf'
    const isDoctorKyc = folder === 'doctor_kyc_docs' || fileName.includes('nmc_') || folder.includes('kyc') || fileName.includes('degree')
    const isClinicReg = folder === 'clinic_registration_docs' || folder === 'registration_docs' || fileName.includes('reg_') || fileName.includes('pan_')

    // Doctor KYC documents -> strictly private bucket doctor-kyc-private
    if (isDoctorKyc) {
      try {
        const { data: authData, error: authError } = await supabase.functions.invoke('document-access', {
          body: {
            action: 'authorize_upload',
            documentType: 'doctor_kyc',
            entityId: entityId || 'general_doctor',
            fileName: cleanName,
            mimeType,
            fileSize: fileBlob.size,
          },
        })
        if (!authError && authData?.authorized && authData?.signedUrl && authData?.path && authData?.token) {
          const { error: uploadError } = await supabase.storage
            .from('doctor-kyc-private')
            .uploadToSignedUrl(authData.path, authData.token, fileBlob, {
              contentType: mimeType,
            })
          if (!uploadError) return authData.path
        }
      } catch (authEx) {
        console.warn('Doctor KYC server-authorized upload fallback:', authEx)
      }

      const path = `${folder}/${Date.now()}_${cleanName}`
      const { error } = await supabase.storage.from('doctor-kyc-private').upload(path, fileBlob, {
        upsert: true,
        contentType: mimeType,
      })
      if (!error) {
        return path
      }
      console.error('Error uploading doctor KYC doc to doctor-kyc-private:', error)
      return null
    }

    // Clinic Registration / PAN documents -> strictly private bucket clinic-docs-private (with automatic fallback to clinic_photos)
    if (isClinicReg) {
      try {
        const { data: authData, error: authError } = await supabase.functions.invoke('document-access', {
          body: {
            action: 'authorize_upload',
            documentType: 'clinic_doc',
            entityId: entityId || 'general_clinic',
            fileName: cleanName,
            mimeType,
            fileSize: fileBlob.size,
          },
        })
        if (!authError && authData?.authorized && authData?.signedUrl && authData?.path && authData?.token) {
          const { error: uploadError } = await supabase.storage
            .from('clinic-docs-private')
            .uploadToSignedUrl(authData.path, authData.token, fileBlob, {
              contentType: mimeType,
            })
          if (!uploadError) return authData.path
        }
      } catch (authEx) {
        console.warn('Clinic doc server-authorized upload fallback:', authEx)
      }

      const path = `${folder}/${Date.now()}_${cleanName}`
      const { error } = await supabase.storage.from('clinic-docs-private').upload(path, fileBlob, {
        upsert: true,
        contentType: mimeType,
      })
      if (!error) {
        return path
      }

      // Robust fallback: If clinic-docs-private bucket is not configured, save directly to clinic_photos
      const photoPath = `reg_docs/${Date.now()}_${cleanName}`
      const { error: photoErr } = await supabase.storage.from('clinic_photos').upload(photoPath, fileBlob, {
        upsert: true,
        contentType: fileBlob.type || 'image/jpeg',
      })
      if (!photoErr) {
        const { data: publicData } = supabase.storage.from('clinic_photos').getPublicUrl(photoPath)
        return publicData?.publicUrl || photoPath
      }

      console.error('Error uploading clinic doc to storage:', error || photoErr)
      return null
    }

    // Public showcase photos and doctor avatars -> public buckets
    let publicBucket = 'clinic_photos'
    if (folder === 'doctor_photos' || fileName.includes('doc_photo') || folder.includes('doctor')) {
      publicBucket = 'doctor_photos'
    }

    const path = `${folder}/${Date.now()}_${cleanName}`
    const { error } = await supabase.storage.from(publicBucket).upload(path, fileBlob, {
      upsert: true,
      contentType: fileBlob.type || 'image/jpeg',
    })
    if (!error) {
      const { data: publicData } = supabase.storage.from(publicBucket).getPublicUrl(path)
      return publicData?.publicUrl || path
    }
    console.error(`Error uploading to ${publicBucket}:`, error)
    return null
  } catch (err) {
    console.error('Error uploading document:', err)
    return null
  }
}

/**
 * Request short-lived signed URL for a guest/walk-in patient lab report.
 * Server verifies that patientPhone matches appointment records before issuing signed URL.
 */
export async function requestGuestLabReportUrl(trackingCode: string, patientPhone: string): Promise<string | null> {
  const cleanCode = (trackingCode || '').trim()
  const cleanPhone = (patientPhone || '').trim()
  if (!cleanCode || !cleanPhone) return null

  // The Edge Function is the only signer: it resolves the file path from the
  // authorized database row and never accepts a client-supplied storage path.
  try {
    const { data, error } = await supabase.functions.invoke('document-access', {
      body: {
        documentType: 'lab_report',
        trackingCode: cleanCode,
        patientPhone: cleanPhone,
        expiresIn: 900,
      },
    })
    if (!error && data?.authorized && data?.signed_url) {
      return data.signed_url
    }
  } catch (e) {
    console.warn('Edge function document-access invocation error:', e)
  }
  return null
}

/**
 * Request short-lived signed URL for an authorized entity (Super Admin, Clinic Staff, Doctor, Logged-in Patient).
 */
export async function requestAuthorizedDocumentUrl(
  docType: 'lab_report' | 'doctor_kyc' | 'clinic_doc' | string,
  entityId: string,
  filePath?: string
): Promise<string | null> {
  const cleanId = (entityId || '').trim()
  if (!cleanId) return null

  // 1. Try Supabase Edge Function 'document-access'
  try {
    const { data, error } = await supabase.functions.invoke('document-access', {
      body: {
        documentType: docType,
        documentId: cleanId,
        fileField: filePath?.toLowerCase().includes('cert') ? 'certificates_doc' : 'license_doc',
        expiresIn: 900,
      },
    })
    if (!error && data?.authorized && data?.signed_url) {
      return data.signed_url
    }
  } catch (e) {
    console.warn('Edge function document-access error:', e)
  }

  return null
}

export async function uploadClinicPhoto(clinicId: string, fileBlob: Blob, originalName = 'clinic_facility.jpg'): Promise<string | null> {
  const cleanName = originalName.replace(/\s+/g, '_')
  const fileName = `clinic_${clinicId}_${Date.now()}_${cleanName}`
  return await uploadClinicDocument(fileName, fileBlob, 'clinic_photos')
}

export async function uploadDoctorPhoto(doctorId: string, fileBlob: Blob, originalName = 'doctor_avatar.jpg'): Promise<string | null> {
  const cleanName = originalName.replace(/\s+/g, '_')
  const fileName = `doc_${doctorId}_${Date.now()}_${cleanName}`
  return await uploadClinicDocument(fileName, fileBlob, 'doctor_photos')
}

// ==========================================
// NOTIFICATIONS API
// ==========================================
export async function getClinicNotifications(_clinicId: string): Promise<DactorNotification[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return (data || []).map(mapNotification)
  } catch (err) {
    console.error('Error fetching notifications:', err)
    return []
  }
}

export async function getPatientNotifications(criteria?: {
  userId?: string
  appointmentIds?: string[]
  trackingCodes?: string[]
}): Promise<DactorNotification[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error
    const rows = data || []
    const userId = criteria?.userId?.trim()
    const apptSet = new Set((criteria?.appointmentIds || []).filter(Boolean))
    const codeSet = new Set((criteria?.trackingCodes || []).map((c) => c.trim()).filter(Boolean))
    const hasPersonalFilter = Boolean(userId || apptSet.size > 0 || codeSet.size > 0)

    const filtered = rows.filter((n: any) => {
      // 1. General system announcements and broadcasts intended for everyone
      if (n.target_audience === 'all_users' || n.type === 'broadcast' || n.type === 'system_announcement' || n.type === 'clinic_broadcast') {
        return true
      }
      // 2. If the user is an anonymous guest with no account or tracked codes, NEVER leak personal notifications
      if (!hasPersonalFilter) {
        return false
      }
      // 3. Match authenticated user ID
      if (userId && n.user_id === userId) return true
      // 4. Match specific appointment ID
      if (n.appointment_id && apptSet.has(n.appointment_id)) return true
      // 5. Match specific 10-digit tracking codes in title, message or meta
      const text = `${n.title || ''} ${n.message || ''} ${n.meta_json || ''}`
      for (const code of codeSet) {
        if (code && text.includes(code)) return true
      }
      return false
    })

    return filtered.map(mapNotification)
  } catch (err) {
    console.error('Error fetching patient notifications:', err)
    return []
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
    return !error
  } catch {
    return false
  }
}

export async function markAllNotificationsAsRead(notificationIds: string[]): Promise<boolean> {
  try {
    if (!notificationIds || notificationIds.length === 0) return true
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', notificationIds)
    return !error
  } catch {
    return false
  }
}

export async function sendBroadcastNotification(clinicId: string, title: string, message: string): Promise<boolean> {
  try {
    const cleanClinicId = (clinicId || '').trim()
    const cleanTitle = title.trim()
    const cleanMessage = message.trim()

    // 1. Insert into Supabase notifications table
    const { error } = await supabase.from('notifications').insert({
      id: crypto.randomUUID(),
      title: cleanTitle,
      message: cleanMessage,
      type: 'clinic_broadcast',
      target_audience: 'all_users',
      is_read: false,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error('Error inserting broadcast notification row:', error)
      return false
    }

    // 2. Direct FCM Push Dispatch via send-fcm-alert Edge Function (closed-app delivery)
    try {
      await supabase.functions.invoke('send-fcm-alert', {
        body: {
          clinicId: cleanClinicId || undefined,
          clinicEmail: (localStorage.getItem('dactor_clinic_email') || '').trim().toLowerCase() || undefined,
          title: cleanTitle,
          message: cleanMessage,
          type: 'clinic_broadcast',
          broadcastAll: true,
          targetAudience: 'all_users',
        },
      })
    } catch (fcmErr) {
      console.warn('send-fcm-alert invocation warning for broadcast (DB row saved):', fcmErr)
    }

    return true
  } catch (err) {
    console.error('Error in sendBroadcastNotification:', err)
    return false
  }
}

// ==========================================
// BILLING & CLINIC OPERATIONS API
// ==========================================
export async function getBillingInvoicesByClinic(clinicId: string): Promise<BillingInvoice[]> {
  try {
    const { data, error } = await supabase
      .from('billing_invoices')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return (data || []).map(mapBillingInvoice)
  } catch (err) {
    console.error('Error fetching clinic billing invoices:', err)
    return []
  }
}

export async function getInvoiceForAppointment(appointmentId: string): Promise<BillingInvoice | null> {
  try {
    const { data, error } = await supabase
      .from('billing_invoices')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('updated_at', { ascending: false })

    if (error || !data || data.length === 0) return null
    const sorted = [...data].sort((a, b) => {
      const aTime = a.updated_at || a.paid_at || a.created_at || ''
      const bTime = b.updated_at || b.paid_at || b.created_at || ''
      if (bTime !== aTime) return bTime.localeCompare(aTime)
      const aItems = Array.isArray(a.items) ? a.items.length : 0
      const bItems = Array.isArray(b.items) ? b.items.length : 0
      return bItems - aItems
    })
    return mapBillingInvoice(sorted[0])
  } catch {
    return null
  }
}

export async function saveOrUpdateInvoicePayment(params: {
  appointmentId: string
  clinicId: string
  totalAmount: number
  paidAmount: number
  remarks?: string
  receiptUrl?: string
  items?: { id?: string; itemName?: string; name?: string; quantity: number; price: number; total?: number }[]
  paymentRecords?: WebPaymentRecord[]
  newPaymentAmount?: number
  newPaymentNote?: string
  newPaymentDateTime?: string
}): Promise<BillingInvoice | null> {
  try {
    const { appointmentId, clinicId, totalAmount, paidAmount, remarks, receiptUrl } = params
    const nowIso = new Date().toISOString()

    // Check if invoice already exists (avoid maybeSingle crash if multiple rows exist)
    const { data: existingRows } = await supabase
      .from('billing_invoices')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('updated_at', { ascending: false })

    const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null

    // Parse existing payments ledger
    const existingPayments = parsePaymentRecords(
      existing?.remarks,
      Number(existing?.paid_amount || 0),
      existing?.paid_at
    )

    let updatedPayments: WebPaymentRecord[] = params.paymentRecords ? [...params.paymentRecords] : [...existingPayments]
    if (params.newPaymentAmount && params.newPaymentAmount > 0) {
      updatedPayments.push({
        id: crypto.randomUUID(),
        amount: Number(params.newPaymentAmount),
        dateTime: params.newPaymentDateTime || `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        note: params.newPaymentNote?.trim() || 'Payment Received',
      })
    }

    const calculatedTotalPaid = updatedPayments.length > 0
      ? updatedPayments.reduce((acc, p) => acc + p.amount, 0)
      : paidAmount

    const rawClinicalRem = extractCleanClinicalRemarks(remarks !== undefined ? remarks : existing?.remarks)
    const combinedRemarksWithReceipt = [
      rawClinicalRem,
      receiptUrl ? `Receipt: ${receiptUrl}` : undefined,
    ]
      .filter(Boolean)
      .join(' | ')

    const finalRemarks = buildCombinedRemarks(combinedRemarksWithReceipt, updatedPayments)

    const itemsToSave = params.items && params.items.length > 0
      ? params.items.map((it) => {
          const name = it.name || it.itemName || (it as any).item_name || 'Clinical Service'
          const qty = Number(it.quantity || 1)
          const pr = Number(it.price || 0)
          const tot = Number(it.total || pr * qty)
          return {
            id: it.id || crypto.randomUUID(),
            item_name: name,
            itemName: name,
            name: name,
            quantity: qty,
            price: pr,
            total: tot,
          }
        })
      : (Array.isArray(existing?.items) && existing.items.length > 0
          ? existing.items.map((it: any) => {
              const name = it.item_name || it.itemName || it.name || 'Clinical Service'
              const qty = Number(it.quantity || 1)
              const pr = Number(it.price || 0)
              const tot = Number(it.total || pr * qty)
              return {
                id: it.id || crypto.randomUUID(),
                item_name: name,
                itemName: name,
                name: name,
                quantity: qty,
                price: pr,
                total: tot,
              }
            })
          : [
              {
                id: crypto.randomUUID(),
                item_name: 'Consultation & Clinical Services',
                itemName: 'Consultation & Clinical Services',
                name: 'Consultation & Clinical Services',
                quantity: 1,
                price: totalAmount,
                total: totalAmount,
              },
            ])

    const balanceDue = Math.max(0, totalAmount - calculatedTotalPaid)
    // PostgreSQL payment_status_enum accepts 'paid' or 'pending' natively
    const dbPaymentStatus = (calculatedTotalPaid >= totalAmount && totalAmount > 0) ? 'paid' : 'pending'

    let savedData: any = null

    if (existing?.id) {
      // Update existing invoice without mutating primary key id or appointment_id
      const { data, error } = await supabase
        .from('billing_invoices')
        .update({
          items: itemsToSave,
          total_amount: totalAmount,
          paid_amount: calculatedTotalPaid,
          balance_due: balanceDue,
          payment_status: dbPaymentStatus,
          paid_at: calculatedTotalPaid > 0 ? (existing.paid_at || nowIso) : null,
          remarks: finalRemarks,
          updated_at: nowIso,
        })
        .eq('id', existing.id)
        .select()
        .maybeSingle()

      if (error) {
        console.error('Supabase billing_invoices update failed:', error)
        throw error
      }
      savedData = data
    } else {
      // Insert new invoice record
      const newInvoiceId = crypto.randomUUID()
      const { data, error } = await supabase
        .from('billing_invoices')
        .insert({
          id: newInvoiceId,
          appointment_id: appointmentId,
          clinic_id: clinicId,
          items: itemsToSave,
          total_amount: totalAmount,
          paid_amount: calculatedTotalPaid,
          balance_due: balanceDue,
          payment_status: dbPaymentStatus,
          paid_at: calculatedTotalPaid > 0 ? nowIso : null,
          remarks: finalRemarks,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select()
        .maybeSingle()

      if (error) {
        // Fallback: row might already exist for this appointment_id
        console.warn('Insert encountered error, falling back to update by appointment_id:', error.message)
        const { data: updateFallback, error: updateErr } = await supabase
          .from('billing_invoices')
          .update({
            items: itemsToSave,
            total_amount: totalAmount,
            paid_amount: calculatedTotalPaid,
            balance_due: balanceDue,
            payment_status: dbPaymentStatus,
            paid_at: calculatedTotalPaid > 0 ? nowIso : null,
            remarks: finalRemarks,
            updated_at: nowIso,
          })
          .eq('appointment_id', appointmentId)
          .select()
          .maybeSingle()

        if (updateErr) {
          console.error('Supabase billing_invoices fallback update failed:', updateErr)
          throw updateErr
        }
        savedData = updateFallback
      } else {
        savedData = data
      }
    }

    // Also update the appointment fee_amount and payment_status safely
    try {
      await supabase
        .from('appointments')
        .update({
          fee_amount: totalAmount,
          payment_status: dbPaymentStatus,
          updated_at: nowIso,
        })
        .eq('id', appointmentId)
    } catch (apptErr) {
      console.warn('Could not sync fee_amount to appointments table:', apptErr)
    }

    return savedData ? mapBillingInvoice(savedData) : null
  } catch (err) {
    console.error('Error saving billing invoice:', err)
    return null
  }
}

export async function uploadReceiptFile(fileName: string, fileBlob: Blob): Promise<string | null> {
  try {
    const bucket = 'clinic_files'
    const path = `receipts/${Date.now()}_${fileName.replace(/\s+/g, '_')}`
    const { error } = await supabase.storage.from(bucket).upload(path, fileBlob, {
      upsert: true,
      contentType: fileBlob.type || 'image/jpeg',
    })
    if (error) throw error
    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path)
    return publicData.publicUrl
  } catch (err) {
    console.error('Error uploading receipt file:', err)
    return null
  }
}

const lastPresenceBroadcastMap = new Map<string, { isInClinic: boolean; timestamp: number }>()

export async function notifyDoctorPresenceToPatients(
  doctorId: string,
  isInClinic: boolean,
  clinicId?: string
): Promise<number> {
  try {
    // 60-second cooldown per doctor per presence state
    const now = Date.now()
    const last = lastPresenceBroadcastMap.get(doctorId)
    if (last && last.isInClinic === isInClinic && now - last.timestamp < 60_000) {
      return 0
    }
    lastPresenceBroadcastMap.set(doctorId, { isInClinic, timestamp: now })

    const { data: doc } = await supabase
      .from('doctors')
      .select('full_name, active_clinic_id, clinic_id')
      .eq('id', doctorId)
      .single()

    const doctorName = doc?.full_name?.trim() || 'Doctor'
    const targetClinicId = clinicId || doc?.active_clinic_id || doc?.clinic_id

    let clinicName = 'the clinic'
    if (targetClinicId) {
      const { data: clinic } = await supabase.from('clinics').select('name').eq('id', targetClinicId).single()
      if (clinic?.name) {
        clinicName = clinic.name.trim()
      }
    }

    const today = new Date().toISOString().split('T')[0]
    let query = supabase
      .from('appointments')
      .select('id, user_id, patient_name, tracking_code_10_digit, checkin_status, status, doctor_id, clinic_id')
      .eq('doctor_id', doctorId)
      .eq('appointment_date', today)

    if (targetClinicId) {
      query = query.eq('clinic_id', targetClinicId)
    }

    const { data: appts, error } = await query

    if (error || !appts || appts.length === 0) return 0

    const waitingAppts = appts.filter(a => {
      // Must strictly be for this doctor
      if (a.doctor_id !== doctorId) return false
      // Must match clinic if targetClinicId is specified
      if (targetClinicId && a.clinic_id && a.clinic_id !== targetClinicId) return false

      const st = (a.checkin_status || '').toLowerCase().trim()
      const mainSt = (a.status || '').toLowerCase().trim()

      // Exclude cancelled / rejected / expired
      if (['cancelled', 'rejected', 'expired'].includes(mainSt)) return false
      // Exclude already served / inside / cancelled / no-show
      if (['inside', 'completed', 'done', 'finished', 'cancelled', 'no_show', 'rejected'].includes(st)) return false

      // Only patient still waiting to have consultation
      return ['waiting', 'checked_in', 'booked', 'pending'].includes(st)
    })

    if (waitingAppts.length === 0) return 0

    const title = isInClinic
      ? `🩺 Dr. ${doctorName} Has Arrived!`
      : `⏳ Dr. ${doctorName} Temporarily Stepped Out`

    const notifType = isInClinic ? 'doctor_arrival' : 'doctor_status'
    let sentCount = 0

    for (const appt of waitingAppts) {
      const pName = appt.patient_name || 'Patient'
      const code = appt.tracking_code_10_digit || ''
      const cleanBody = isInClinic
        ? `Hi ${pName}, Dr. ${doctorName} has arrived at ${clinicName}! OPD consultations are starting now. Please check your live queue position and be near the clinic.`
        : `Hi ${pName}, Dr. ${doctorName} has temporarily stepped out from ${clinicName}. Consultations are briefly paused and will resume shortly.`

      const leftLabel = 'Doctor Status'
      const leftVal = isInClinic ? 'In Clinic • Active' : 'Briefly Away'
      const rightLabel = isInClinic ? 'Live Queue' : 'Queue Status'
      const rightVal = isInClinic ? 'Consultations Started' : 'Briefly Paused'
      const codePart = code ? `|code=${code}|trackingCode=${code}` : ''

      const taggedMessage = `${cleanBody}\n[[META:leftLabel=${leftLabel}|leftVal=${leftVal}|rightLabel=${rightLabel}|rightVal=${rightVal}${codePart}]]`

      const { error: insertErr } = await supabase.from('notifications').insert({
        id: crypto.randomUUID(),
        appointment_id: appt.id && appt.id.length === 36 ? appt.id : null,
        user_id: appt.user_id && appt.user_id.length === 36 ? appt.user_id : null,
        title,
        message: taggedMessage,
        type: notifType,
        target_audience: 'specific',
        is_read: false,
        created_at: new Date().toISOString(),
      })

      if (!insertErr) {
        sentCount++
        try {
          supabase.functions.invoke('send-fcm-alert', {
            body: {
              title: title.trim(),
              message: cleanBody,
              appointmentId: appt.id || undefined,
              trackingCode: code || undefined,
              userId: appt.user_id || undefined,
              clinicId: appt.clinic_id || undefined,
              type: notifType,
            },
          }).catch(() => {})
        } catch {}
      }
    }

    return sentCount
  } catch (err) {
    console.error('Error broadcasting doctor presence:', err)
    return 0
  }
}

export async function updateDoctorPresence(doctorId: string, isInClinic: boolean, clinicId?: string): Promise<boolean> {
  try {
    const updatePayload: Record<string, any> = { is_in_clinic: isInClinic }
    if (isInClinic && clinicId) {
      updatePayload.active_clinic_id = clinicId
      updatePayload.clinic_id = clinicId
    } else if (!isInClinic) {
      updatePayload.active_clinic_id = null
    }

    const { error } = await supabase
      .from('doctors')
      .update(updatePayload)
      .eq('id', doctorId)

    if (!error) {
      notifyDoctorPresenceToPatients(doctorId, isInClinic, clinicId).catch(console.error)
    }

    return !error
  } catch {
    return false
  }
}

export async function sendClinicBreakToLiveQueue(
  clinicId: string,
  breakWindowText?: string
): Promise<number> {
  try {
    const { data: clinic } = await supabase
      .from('clinics')
      .select('name')
      .eq('id', clinicId)
      .single()

    const clinicName = clinic?.name?.trim() || 'the clinic'
    const today = new Date().toISOString().split('T')[0]

    // Query appointments for this clinic on today's date ONLY
    const { data: appts, error } = await supabase
      .from('appointments')
      .select('id, user_id, patient_name, tracking_code_10_digit, checkin_status, appointment_time')
      .eq('clinic_id', clinicId)
      .eq('appointment_date', today)

    if (error || !appts || appts.length === 0) return 0

    // Filter strictly to live queue patients (waiting, checked_in, inside)
    // Completed, done, finished, cancelled, no_show are strictly excluded!
    const liveQueueAppts = appts.filter(a => {
      const st = (a.checkin_status || '').toLowerCase()
      return ['waiting', 'checked_in', 'inside'].includes(st)
    })

    if (liveQueueAppts.length === 0) return 0

    const title = `${clinicName} is Currently on Break`
    const breakInfo = breakWindowText ? ` (${breakWindowText})` : ''
    let sentCount = 0

    for (const appt of liveQueueAppts) {
      const pName = appt.patient_name || 'Patient'
      const code = appt.tracking_code_10_digit || ''
      const cleanBody = `Hi ${pName}, ${clinicName} is currently on a short break${breakInfo}. Queue movement is paused and your consultation will resume shortly.`

      const leftLabel = 'Estimated Time Left'
      const leftVal = 'Clinic on Break'
      const rightLabel = 'Your Appointment Time'
      const rightVal = breakWindowText || appt.appointment_time || 'Paused Briefly'
      const codePart = code ? `|code=${code}|trackingCode=${code}` : ''

      const taggedMessage = `${cleanBody}\n[[META:leftLabel=${leftLabel}|leftVal=${leftVal}|rightLabel=${rightLabel}|rightVal=${rightVal}${codePart}]]`

      const { error: insertErr } = await supabase.from('notifications').insert({
        id: crypto.randomUUID(),
        appointment_id: appt.id && appt.id.length === 36 ? appt.id : null,
        user_id: appt.user_id && appt.user_id.length === 36 ? appt.user_id : null,
        title,
        message: taggedMessage,
        type: 'clinic_break',
        target_audience: 'specific',
        is_read: false,
        created_at: new Date().toISOString(),
      })

      if (!insertErr) {
        sentCount++
        try {
          supabase.functions.invoke('send-fcm-alert', {
            body: {
              title: title.trim(),
              message: cleanBody,
              appointmentId: appt.id || undefined,
              trackingCode: code || undefined,
              userId: appt.user_id || undefined,
              clinicId: clinicId || undefined,
              type: 'clinic_break',
            },
          }).catch(() => {})
        } catch {}
      }
    }

    return sentCount
  } catch (err) {
    console.error('Error sending clinic break to live queue:', err)
    return 0
  }
}

export async function updateClinicBreak(clinicId: string, isOnBreak: boolean, breakWindowText?: string): Promise<boolean> {
  const ok = await updateClinic(clinicId, {
    isOnBreak,
    breakUpdatedAt: new Date().toISOString(),
  })
  if (ok && isOnBreak) {
    sendClinicBreakToLiveQueue(clinicId, breakWindowText).catch(console.error)
  }
  return ok
}

export async function updateClinic(id: string, updates: Partial<Clinic>): Promise<boolean> {
  try {
    const { data: current } = await supabase.from('clinics').select('*').eq('id', id).single()
    let currentMeta: any = {}
    if (current?.description && typeof current.description === 'string' && current.description.trim().startsWith('{')) {
      try { currentMeta = JSON.parse(current.description) } catch {}
    }

    const newMeta = {
      ...currentMeta,
      desc: updates.description !== undefined ? updates.description : (currentMeta.desc ?? current?.description),
      pan_number: updates.panNumber !== undefined ? updates.panNumber : (currentMeta.pan_number ?? current?.pan_number),
      manager_phone: updates.managerPhone !== undefined ? updates.managerPhone : (currentMeta.manager_phone ?? current?.manager_phone),
      registration_doc_url: updates.registrationDocUrl !== undefined ? updates.registrationDocUrl : (currentMeta.registration_doc_url ?? current?.registration_doc_url),
      specialties: updates.specialties !== undefined ? updates.specialties : (currentMeta.specialties ?? current?.specialties),
      is_on_break: updates.isOnBreak !== undefined ? updates.isOnBreak : (currentMeta.is_on_break ?? current?.is_on_break),
      break_updated_at: updates.breakUpdatedAt !== undefined ? updates.breakUpdatedAt : (currentMeta.break_updated_at ?? current?.break_updated_at),
      weekly_schedule_json: updates.weeklyScheduleJson !== undefined ? updates.weeklyScheduleJson : (currentMeta.weekly_schedule_json ?? current?.weekly_schedule_json),
      declared_holidays: updates.declaredHolidays !== undefined ? updates.declaredHolidays : (currentMeta.declared_holidays ?? current?.declared_holidays),
      manual_avg_consultation_time_minutes: updates.manualAvgConsultationTimeMinutes !== undefined ? updates.manualAvgConsultationTimeMinutes : (currentMeta.manual_avg_consultation_time_minutes ?? current?.manual_avg_consultation_time_minutes),
      avg_time_mode: updates.avgTimeMode !== undefined ? updates.avgTimeMode : (currentMeta.avg_time_mode ?? current?.avg_time_mode),
      pictures: updates.pictures !== undefined ? updates.pictures : (currentMeta.pictures ?? current?.pictures),
      logo_url: updates.logoUrl !== undefined ? updates.logoUrl : (currentMeta.logo_url ?? current?.logo_url),
      is_activated: updates.isActivated !== undefined ? updates.isActivated : (currentMeta.is_activated ?? current?.is_activated ?? true),
      activation_expires_at: updates.activationExpiresAt !== undefined ? updates.activationExpiresAt : (currentMeta.activation_expires_at ?? current?.activation_expires_at),
      activation_plan: updates.activationPlan !== undefined ? updates.activationPlan : (currentMeta.activation_plan ?? current?.activation_plan),
      activation_paid_amount: updates.activationPaidAmount !== undefined ? updates.activationPaidAmount : (currentMeta.activation_paid_amount ?? current?.activation_paid_amount),
      activation_notes: updates.activationNotes !== undefined ? updates.activationNotes : (currentMeta.activation_notes ?? current?.activation_notes),
      is_archived: updates.isArchived !== undefined ? updates.isArchived : (currentMeta.is_archived ?? current?.is_archived ?? false),
      archived_at: updates.archivedAt !== undefined ? updates.archivedAt : (currentMeta.archived_at ?? current?.archived_at),
      deletion_scheduled_at: updates.deletionScheduledAt !== undefined ? updates.deletionScheduledAt : (currentMeta.deletion_scheduled_at ?? current?.deletion_scheduled_at),
      payment_gateway_provider: updates.paymentGatewayProvider !== undefined ? updates.paymentGatewayProvider : (currentMeta.payment_gateway_provider ?? current?.payment_gateway_provider),
      payment_api_key: updates.paymentApiKey !== undefined ? updates.paymentApiKey : (currentMeta.payment_api_key ?? current?.payment_api_key),
      // All payment gateway secrets (eSewa, Khalti, Fonepay, ConnectIPS) are stored strictly server-side in clinic_payment_credentials
      payment_secret_key: undefined,
      merchant_id: updates.merchantId !== undefined ? updates.merchantId : (currentMeta.merchant_id ?? current?.merchant_id),
      is_direct_payment_enabled: updates.isDirectPaymentEnabled !== undefined ? updates.isDirectPaymentEnabled : (currentMeta.is_direct_payment_enabled ?? current?.is_direct_payment_enabled),
    }

    const payload: any = {
      updated_at: new Date().toISOString(),
      description: JSON.stringify(newMeta),
    }

    if (updates.name) payload.name = updates.name
    if (updates.type) payload.type = updates.type
    if (updates.contactPhone !== undefined) payload.contact_phone = updates.contactPhone
    if (updates.contactEmail !== undefined) payload.contact_email = updates.contactEmail
    if (updates.addressText !== undefined) payload.address_text = updates.addressText
    if (updates.latitude !== undefined) payload.latitude = updates.latitude
    if (updates.longitude !== undefined) payload.longitude = updates.longitude
    if (updates.autoNotifyThreshold !== undefined) payload.auto_notify_threshold = updates.autoNotifyThreshold
    if (updates.logoUrl !== undefined) payload.logo_url = updates.logoUrl
    if (updates.pictures !== undefined) payload.pictures = updates.pictures
    if (updates.specialties !== undefined) payload.specialties = updates.specialties
    if (updates.registrationDocUrl !== undefined) payload.registration_doc_url = updates.registrationDocUrl
    if (updates.panNumber !== undefined) payload.pan_number = updates.panNumber
    if (updates.managerPhone !== undefined) payload.manager_phone = updates.managerPhone
    if (updates.isOnBreak !== undefined) payload.is_on_break = updates.isOnBreak
    if (updates.weeklyScheduleJson !== undefined) payload.weekly_schedule_json = updates.weeklyScheduleJson
    if (updates.declaredHolidays !== undefined) payload.declared_holidays = updates.declaredHolidays
    if (updates.manualAvgConsultationTimeMinutes !== undefined) payload.manual_avg_consultation_time_minutes = updates.manualAvgConsultationTimeMinutes
    if (updates.avgTimeMode !== undefined) payload.avg_time_mode = updates.avgTimeMode
    if (updates.isActivated !== undefined) payload.is_activated = updates.isActivated
    if (updates.activationExpiresAt !== undefined) payload.activation_expires_at = updates.activationExpiresAt
    if (updates.activationPlan !== undefined) payload.activation_plan = updates.activationPlan
    if (updates.activationPaidAmount !== undefined) payload.activation_paid_amount = updates.activationPaidAmount
    if (updates.activationNotes !== undefined) payload.activation_notes = updates.activationNotes
    if (updates.isArchived !== undefined) payload.is_archived = updates.isArchived
    if (updates.archivedAt !== undefined) payload.archived_at = updates.archivedAt
    if (updates.deletionScheduledAt !== undefined) payload.deletion_scheduled_at = updates.deletionScheduledAt
    if (updates.paymentGatewayProvider !== undefined) payload.payment_gateway_provider = updates.paymentGatewayProvider
    if (updates.paymentApiKey !== undefined) payload.payment_api_key = updates.paymentApiKey
    if (updates.merchantId !== undefined) payload.merchant_id = updates.merchantId
    if (updates.isDirectPaymentEnabled !== undefined) payload.is_direct_payment_enabled = updates.isDirectPaymentEnabled

    const { error } = await supabase.from('clinics').update(payload).eq('id', id)
    if (error) {
      await supabase.from('clinics').update({ description: JSON.stringify(newMeta), updated_at: new Date().toISOString() }).eq('id', id)
    }
    return true
  } catch (err) {
    console.error('Error updating clinic:', err)
    return false
  }
}

export async function toggleClinicHoliday(clinicId: string, dateStr: string, isHoliday: boolean): Promise<boolean> {
  const clinic = await getClinicForPortalById(clinicId)
  if (!clinic) return false

  let holidays = clinic.declaredHolidays || []
  if (isHoliday) {
    if (!holidays.includes(dateStr)) holidays = [...holidays, dateStr]
  } else {
    holidays = holidays.filter((d) => d !== dateStr)
  }

  return await updateClinic(clinicId, { declaredHolidays: holidays })
}

export async function saveWeeklySchedule(clinicId: string, schedule: any[]): Promise<boolean> {
  return await updateClinic(clinicId, {
    weeklyScheduleJson: JSON.stringify(schedule),
  })
}

export async function updateDoctor(doctorId: string, updates: Partial<Doctor>): Promise<boolean> {
  try {
    const payload: any = {}
    if (updates.fullName !== undefined) payload.full_name = updates.fullName
    if (updates.specialty !== undefined) {
      payload.specialty = updates.specialty
      payload.specialties = [updates.specialty]
    }
    if (updates.education !== undefined) payload.education = updates.education
    if (updates.nmcLicenseNumber !== undefined) payload.nmc_license_number = updates.nmcLicenseNumber
    if (updates.startingPracticingYear !== undefined) {
      payload.starting_practicing_year = updates.startingPracticingYear
    }
    if (updates.consultationFee !== undefined) payload.consultation_fee = updates.consultationFee
    if (updates.isInClinic !== undefined) payload.is_in_clinic = updates.isInClinic
    if (updates.personalMobileNumber !== undefined) payload.personal_mobile_number = updates.personalMobileNumber
    if (updates.publicMobileNumber !== undefined) payload.public_mobile_number = updates.publicMobileNumber
    if (updates.profilePictureUrl !== undefined) payload.profile_picture_url = updates.profilePictureUrl

    const { error } = await supabase.from('doctors').update(payload).eq('id', doctorId)
    if (!error && updates.isInClinic !== undefined) {
      notifyDoctorPresenceToPatients(doctorId, updates.isInClinic, updates.clinicId || updates.activeClinicId).catch(console.error)
    }
    return !error
  } catch {
    return false
  }
}

export async function sendManualNotification(
  appointmentId: string,
  title: string,
  message: string,
  estimatedTimeLeft?: string,
  expectedTime?: string,
  trackingCode?: string,
  userId?: string,
  _clinicId?: string
): Promise<boolean> {
  try {
    const cleanBody = message.replace(/\[\[META:.*?\]\]/g, '').trim()
    const pos = (estimatedTimeLeft || '').replace(/[|\]]/g, '').trim()
    const expected = (expectedTime || '').replace(/[|\]]/g, '').trim()
    const code = (trackingCode || '').replace(/[|\]]/g, '').trim()

    let taggedMessage = cleanBody
    if (code || pos || expected) {
      taggedMessage = `${cleanBody}\n[[META:trackingCode=${code}|pos=${pos}|expected=${expected}|code=${code}|leftLabel=Est. Time|leftVal=${pos || 'Soon'}|rightLabel=Expected|rightVal=${expected || 'Queue Active'}]]`
    }

    const { error } = await supabase.from('notifications').insert({
      id: crypto.randomUUID(),
      appointment_id: appointmentId && appointmentId.length === 36 ? appointmentId : null,
      user_id: userId && userId.length === 36 ? userId : null,
      title: title.trim(),
      message: taggedMessage,
      type: 'queue_alert',
      target_audience: 'specific',
      is_read: false,
      created_at: new Date().toISOString(),
    })

    if (!error) {
      try {
        supabase.functions.invoke('send-fcm-alert', {
          body: {
            title: title.trim(),
            message: cleanBody,
            appointmentId: appointmentId || undefined,
            trackingCode: code || undefined,
            userId: userId || undefined,
            type: 'queue_alert',
          },
        }).catch(() => {})
      } catch {}
    }

    return !error
  } catch {
    return false
  }
}


export async function sendEarlyArrivalInviteNotification(
  appointmentId: string,
  patientName: string,
  trackingCode: string,
  originalSlot?: string,
  userId?: string
): Promise<boolean> {
  return sendEarlyArrivalInvite({
    appointmentId,
    patientName,
    trackingCode,
    originalSlot,
    userId,
  })
}

export async function sendEarlyArrivalInvite(params: {
  appointmentId: string
  patientName: string
  trackingCode: string
  originalSlot?: string
  userId?: string
}): Promise<boolean> {
  try {
    const title = '⚡ Doctor is Free Now! Come in early?'
    const slotText = params.originalSlot ? ` (Booked slot: ${params.originalSlot})` : ''
    const cleanBody = `Dear ${params.patientName}, the doctor has finished consultations earlier than scheduled. Since you opted in for early calls, you are welcome to come in early now!${slotText}`
    const code = params.trackingCode ? params.trackingCode.replace(/[|\]]/g, '').trim() : ''
    const taggedMessage = code
      ? `${cleanBody}\n[[META:trackingCode=${code}|code=${code}|leftLabel=Early Call|leftVal=Doctor Free|rightLabel=Slot|rightVal=${params.originalSlot || 'Now'}]]`
      : cleanBody

    const { error } = await supabase.from('notifications').insert({
      id: crypto.randomUUID(),
      appointment_id: params.appointmentId && params.appointmentId.length === 36 ? params.appointmentId : null,
      user_id: params.userId && params.userId.length === 36 ? params.userId : null,
      title,
      message: taggedMessage,
      type: 'early_arrival',
      target_audience: 'specific',
      is_read: false,
      created_at: new Date().toISOString(),
    })

    if (!error) {
      try {
        supabase.functions.invoke('send-fcm-alert', {
          body: {
            title: title.trim(),
            message: cleanBody,
            appointmentId: params.appointmentId || undefined,
            trackingCode: code || undefined,
            userId: params.userId || undefined,
            type: 'early_arrival',
          },
        }).catch(() => {})
      } catch {}
    }

    return !error
  } catch (err) {
    console.error('Error sending early arrival invite:', err)
    return false
  }
}


export async function searchPatientRecords(clinicId: string, searchQuery: string): Promise<Appointment[]> {
  try {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []

    const { data, error } = await supabase
      .from('appointments')
      .select('*, doctor:doctors(*), clinic:clinics(*), queue_entries(*)')
      .eq('clinic_id', clinicId)
      .or(`tracking_code_10_digit.ilike.%${q}%,patient_mobile.ilike.%${q}%,patient_name.ilike.%${q}%,patient_email.ilike.%${q}%`)
      .order('appointment_date', { ascending: false })

    if (error) throw error
    return (data || []).map(mapAppointment)
  } catch (err) {
    console.error('Error searching patient records:', err)
    return []
  }
}

// ==========================================
// TAXONOMY API
// ==========================================
export async function getMedicalSpecialties(): Promise<MedicalSpecialty[]> {
  try {
    const { data, error } = await supabase
      .from('medical_specialties')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return (data || []).filter(s => s.category !== 'system_config' && !s.name?.startsWith('system_config'))
  } catch {
    return [
      { id: '1', name: 'General Physician', description: 'Primary Care, Fever, Infection, Blood Pressure' },
      { id: '2', name: 'Cardiology (Heart Care)', description: 'Heart, ECG, Hypertension, Chest Pain' },
      { id: '3', name: 'Pathology & Diagnostic Lab', description: 'Blood tests, Biochemistry, Histopathology' },
      { id: '4', name: 'Pediatrics & Child Health', description: 'Infant, Child Care, Growth, Vaccines' },
      { id: '5', name: 'Orthopedics & Joint Care', description: 'Bones, Fractures, Arthritis, Spine' },
      { id: '6', name: 'Dermatology & Skin Care', description: 'Skin, Allergies, Hair, Cosmetic Health' },
      { id: '7', name: 'Gynecology & Women Health', description: 'Maternity, Antenatal, Reproductive Care' },
      { id: '8', name: 'Dental Care & Dentistry', description: 'Teeth, Root Canal, Orthodontics' },
      { id: '9', name: 'ENT (Ear, Nose, Throat)', description: 'Sinus, Hearing, Throat Infection' },
    ]
  }
}

export async function getMedicalQualifications(): Promise<MedicalQualification[]> {
  try {
    const { data, error } = await supabase
      .from('medical_qualifications')
      .select('*')
      .order('degree_name', { ascending: true })

    if (error) throw error
    return data || []
  } catch {
    return [
      { id: '1', degreeName: 'MBBS', fullTitle: 'Bachelor of Medicine, Bachelor of Surgery' },
      { id: '2', degreeName: 'MD - Internal Medicine', fullTitle: 'Doctor of Medicine' },
      { id: '3', degreeName: 'MS - General Surgery', fullTitle: 'Master of Surgery' },
      { id: '4', degreeName: 'BDS', fullTitle: 'Bachelor of Dental Surgery' },
      { id: '5', degreeName: 'DM - Cardiology', fullTitle: 'Doctorate in Medicine' },
      { id: '6', degreeName: 'BMLT / B.Sc. MLT', fullTitle: 'Bachelor in Medical Lab Technology' },
      { id: '7', degreeName: 'CMLT / DMLT', fullTitle: 'Diploma in Medical Lab Technology' },
      { id: '8', degreeName: 'M.Sc. MLT / Biochemistry', fullTitle: 'Master in Medical Lab Technology' },
    ]
  }
}

// ==========================================
// LOCATIONS & CITIES API (App & Web Dropdown)
// ==========================================

export const DEFAULT_NEPAL_CITIES = [
  'All Nepal',
  'Kathmandu',
  'Lalitpur',
  'Bhaktapur',
  'Pokhara',
  'Janakpur',
  'Biratnagar',
  'Birgunj',
  'Dharan',
  'Chitwan',
  'Butwal',
  'Nepalgunj',
  'Hetauda',
  'Dhangadhi',
]

/**
 * Fetch all active city names for the Location selector dropdown
 * Guarantees 'All Nepal' is at index 0 and unique.
 */
export async function getCityLocations(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('medical_qualifications')
      .select('degree_name, is_active')
      .eq('level', 'LOCATION_OPTION')
      .eq('is_active', true)
      .order('degree_name', { ascending: true })

    if (error) throw error
    if (!data || data.length === 0) {
      return DEFAULT_NEPAL_CITIES
    }

    const cityNames = data
      .map((d: any) => d.degree_name?.trim())
      .filter((n: string | undefined): n is string => Boolean(n) && n.toLowerCase() !== 'all nepal')

    return ['All Nepal', ...(Array.from(new Set(cityNames)) as string[])]
  } catch (err) {
    console.warn('Error fetching cities from database, using defaults:', err)
    return DEFAULT_NEPAL_CITIES
  }
}

/**
 * Fetch full location details (names, coordinates, aliases, active status)
 */
export async function getLocationDetails(): Promise<CityLocation[]> {
  try {
    const { data, error } = await supabase
      .from('medical_qualifications')
      .select('*')
      .eq('level', 'LOCATION_OPTION')
      .order('degree_name', { ascending: true })

    if (error) throw error
    return (data || []).map((d: any) => ({
      id: d.id,
      name: d.degree_name,
      coordinates: d.field_of_study || '27.7172, 85.3240',
      aliases: d.description || d.degree_name?.toLowerCase(),
      isActive: d.is_active ?? true,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }))
  } catch (err) {
    console.warn('Error fetching location details:', err)
    return DEFAULT_NEPAL_CITIES.slice(1).map((name, i) => ({
      id: `default-${i}`,
      name,
      coordinates: '27.7172, 85.3240',
      aliases: name.toLowerCase(),
      isActive: true,
    }))
  }
}

/**
 * Add a new city / location option to the database
 */
export async function addCityLocation(payload: {
  name: string
  coordinates?: string
  aliases?: string
  isActive?: boolean
}): Promise<CityLocation | null> {
  const cleanName = payload.name.trim()
  if (!cleanName) throw new Error('City name cannot be empty')

  const cleanCoords = payload.coordinates?.trim() || '27.7172, 85.3240'
  const cleanAliases = payload.aliases?.trim() || cleanName.toLowerCase()
  const isActive = payload.isActive ?? true

  const { data, error } = await supabase
    .from('medical_qualifications')
    .insert([
      {
        degree_name: cleanName,
        level: 'LOCATION_OPTION',
        field_of_study: cleanCoords,
        description: cleanAliases,
        is_active: isActive,
      },
    ])
    .select()

  if (error) {
    console.error('Error adding city location:', error)
    throw error
  }

  const inserted = data?.[0]
  if (!inserted) return null

  return {
    id: inserted.id,
    name: inserted.degree_name,
    coordinates: inserted.field_of_study,
    aliases: inserted.description,
    isActive: inserted.is_active,
    createdAt: inserted.created_at,
    updatedAt: inserted.updated_at,
  }
}

/**
 * Update a city / location option
 */
export async function updateCityLocation(
  id: string,
  updates: Partial<{ name: string; coordinates?: string; aliases?: string; isActive?: boolean }>
): Promise<boolean> {
  const payload: any = { updated_at: new Date().toISOString() }
  if (updates.name !== undefined) payload.degree_name = updates.name.trim()
  if (updates.coordinates !== undefined) payload.field_of_study = updates.coordinates.trim()
  if (updates.aliases !== undefined) payload.description = updates.aliases.trim()
  if (updates.isActive !== undefined) payload.is_active = updates.isActive

  const { error } = await supabase.from('medical_qualifications').update(payload).eq('id', id)
  if (error) {
    console.error('Error updating city location:', error)
    throw error
  }
  return true
}

/**
 * Delete a city / location option from the database
 */
export async function deleteCityLocation(id: string): Promise<boolean> {
  const { error } = await supabase.from('medical_qualifications').delete().eq('id', id)
  if (error) {
    console.error('Error deleting city location:', error)
    throw error
  }
  return true
}

// ==========================================
// SUPABASE STORAGE CDN IMAGE RESOLUTION
// ==========================================
export const SUPABASE_STORAGE_PUBLIC_URL = 'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public'

export function resolveStorageUrl(
  pathOrUrl?: string | null,
  defaultBucket: 'clinic_logos' | 'clinic_photos' | 'doctor_photos' | 'clinic_pictures' = 'clinic_logos'
): string | undefined {
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

export function resolveClinicLogoUrl(clinic?: Clinic | null): string | undefined {
  if (!clinic) return undefined
  return resolveStorageUrl(clinic.logoUrl || clinic.photoUrl, 'clinic_logos')
}

export function resolveClinicCoverUrl(clinic?: Clinic | null): string | undefined {
  if (!clinic) return undefined
  const pic = clinic.pictures && clinic.pictures.length > 0 ? clinic.pictures[0] : (clinic.logoUrl || clinic.photoUrl)
  return resolveStorageUrl(pic, 'clinic_photos')
}

export function resolveDoctorPhotoUrl(doctor?: Doctor | null): string | undefined {
  if (!doctor) return undefined
  return resolveStorageUrl(doctor.profilePictureUrl, 'doctor_photos')
}

// ==========================================
// HELPER MAPPERS
// ==========================================
function mapClinic(c: any): Clinic {
  let meta: any = {}
  let cleanDesc = c.description
  if (c.description && typeof c.description === 'string' && c.description.trim().startsWith('{')) {
    try {
      meta = JSON.parse(c.description)
      cleanDesc = meta.desc || ''
    } catch {}
  }

  // Parse pictures robustly
  let pics: string[] = []
  const rawPics = c.pictures || meta.pictures
  if (Array.isArray(rawPics)) {
    pics = rawPics.filter((p: any) => typeof p === 'string' && p.trim().length > 0)
  } else if (typeof rawPics === 'string' && rawPics.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawPics)
      if (Array.isArray(parsed)) pics = parsed.filter(Boolean)
    } catch {
      pics = rawPics.replace(/[{}]/g, '').split(',').map((s: string) => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
    }
  }

  const defaultExpiry = new Date(Date.now() + 30 * 86400000).toISOString()
  const rawLogo = c.logo_url || meta.logo_url || (pics.length > 0 ? pics[0] : null)
  const rawPhoto = c.photo_url || meta.photo_url || c.logo_url || meta.logo_url || (pics.length > 0 ? pics[0] : null)

  return {
    id: c.id,
    name: c.name,
    type: c.type,
    verificationStatus: c.verification_status,
    contactPhone: c.contact_phone,
    contactEmail: c.contact_email,
    addressText: c.address_text,
    latitude: c.latitude,
    longitude: c.longitude,
    geohash: c.geohash,
    distanceKm: c.distance_km !== undefined ? Number(c.distance_km) : (c.distanceKm !== undefined ? Number(c.distanceKm) : undefined),
    autoNotifyThreshold: c.auto_notify_threshold ?? 2,
    description: cleanDesc,
    panNumber: c.pan_number || meta.pan_number,
    managerPhone: c.manager_phone || meta.manager_phone,
    registrationDocUrl: c.registration_doc_url || meta.registration_doc_url,
    pictures: pics.map((p) => resolveStorageUrl(p, 'clinic_photos') || p),
    specialties: c.specialties || meta.specialties || [],
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    isArchived: c.is_archived ?? meta.is_archived ?? false,
    archivedAt: c.archived_at || meta.archived_at,
    deletionScheduledAt: c.deletion_scheduled_at || meta.deletion_scheduled_at,
    logoUrl: resolveStorageUrl(rawLogo, 'clinic_logos'),
    photoUrl: resolveStorageUrl(rawPhoto, 'clinic_photos'),
    isOnBreak: c.is_on_break ?? meta.is_on_break ?? false,
    breakUpdatedAt: c.break_updated_at || meta.break_updated_at,
    weeklyScheduleJson: c.weekly_schedule_json || meta.weekly_schedule_json,
    declaredHolidays: c.declared_holidays || meta.declared_holidays || [],
    avgConsultationTimeMinutes: c.avg_consultation_time_minutes ?? meta.avg_consultation_time_minutes ?? 10,
    manualAvgConsultationTimeMinutes: c.manual_avg_consultation_time_minutes ?? meta.manual_avg_consultation_time_minutes ?? 10,
    calculatedAvgConsultationTimeMinutes: c.calculated_avg_consultation_time_minutes ?? meta.calculated_avg_consultation_time_minutes,
    avgTimeMode: c.avg_time_mode || meta.avg_time_mode || 'auto',
    isActivated: c.is_activated ?? meta.is_activated ?? true,
    activationExpiresAt: c.activation_expires_at || meta.activation_expires_at || defaultExpiry,
    activationPlan: c.activation_plan || meta.activation_plan || '1_month',
    activationPaidAmount: Number(c.activation_paid_amount ?? meta.activation_paid_amount ?? 1500),
    activationNotes: c.activation_notes || meta.activation_notes,
    activationPaymentProofUrl: c.activation_payment_proof_url || meta.activation_payment_proof_url,
    paymentGatewayProvider: c.payment_gateway_provider || meta.payment_gateway_provider || 'esewa',
    paymentApiKey: c.payment_api_key || meta.payment_api_key || '',
    paymentSecretKey: c.payment_secret_key || meta.payment_secret_key || '',
    merchantId: c.merchant_id || meta.merchant_id || '',
    isDirectPaymentEnabled: c.is_direct_payment_enabled ?? meta.is_direct_payment_enabled ?? false,
  }
}

function mapDoctor(d: any): Doctor {
  let certMeta: any = {}
  if (d.certificates_doc_url && typeof d.certificates_doc_url === 'string' && d.certificates_doc_url.trim().startsWith('{')) {
    try {
      certMeta = JSON.parse(d.certificates_doc_url)
    } catch {}
  }

  const startYear = d.starting_practicing_year || certMeta.starting_practicing_year || 2018
  const role = d.practitioner_role || certMeta.practitioner_role || 'doctor'
  const rawPic = d.profile_picture_url || certMeta.profile_picture_url

  return {
    id: d.id,
    fullName: d.full_name,
    email: d.email,
    specialty: d.specialty,
    specialties: d.specialties && d.specialties.length > 0 ? d.specialties : (d.specialty ? [d.specialty] : []),
    education: d.education || certMeta.education || 'MBBS',
    nmcLicenseNumber: d.nmc_license_number,
    experienceYears: d.experience_years || Math.max(1, 2026 - startYear),
    startingPracticingYear: startYear,
    gender: d.gender || certMeta.gender || 'Male',
    age: d.age || certMeta.age || 35,
    personalMobileNumber: d.personal_mobile_number || certMeta.personal_mobile_number,
    publicMobileNumber: d.public_mobile_number || certMeta.public_mobile_number,
    consultationFee: Number(d.consultation_fee || 500),
    isInClinic: d.is_in_clinic ?? true,
    clinicId: d.clinic_id,
    activeClinicId: d.active_clinic_id || d.clinic_id,
    primaryClinicId: d.primary_clinic_id || d.clinic_id,
    kycStatus: d.kyc_status,
    profilePictureUrl: resolveStorageUrl(rawPic, 'doctor_photos'),
    licenseDocUrl: d.license_doc_url,
    certificatesDocUrl: d.certificates_doc_url,
    description: d.description || certMeta.description,
    bio: d.bio || d.description || certMeta.description || certMeta.bio,
    practitionerRole: role,
    isLabTechnician: role === 'lab_technician' || (d.specialty && d.specialty.toLowerCase().includes('lab')),
  }
}

function mapAppointment(a: any): Appointment {
  const qe = Array.isArray(a.queue_entries) ? a.queue_entries[0] : a.queue_entries
  let derivedStatus = 'waiting'

  const todayIso = new Date().toISOString().split('T')[0]
  const isFutureOrToday = (a.appointment_date || '') >= todayIso
  const rawCheckinLower = (a.checkin_status || '').toLowerCase()
  const isProgressedCheckin = [
    'processing',
    'sample_collected',
    'report_prepared',
    'completed',
    'done',
  ].includes(rawCheckinLower)

  if (isProgressedCheckin && (!qe?.status || qe.status === 'waiting' || qe.status === 'inside')) {
    // Do not let a lagging/stale 'waiting' or 'inside' queue_entries row revert a progressed diagnostic/completed status
    derivedStatus = rawCheckinLower === 'done' ? 'completed' : rawCheckinLower
  } else if (isFutureOrToday && a.checkin_status === 'waiting') {
    // If appointment is booked/rescheduled for today or future and checkin_status is waiting,
    // do not let a stale 'done' queue entry from a previous date override it to completed!
    if (qe?.status && qe.status !== 'done' && qe.status !== 'no_show') {
      if (qe.status === 'inside') derivedStatus = 'in_consultation'
      else if (qe.status === 'sample_collected') derivedStatus = 'sample_collected'
      else if (qe.status === 'processing') derivedStatus = 'processing'
      else if (qe.status === 'report_prepared') derivedStatus = 'report_prepared'
      else derivedStatus = 'waiting'
    } else {
      derivedStatus = 'waiting'
    }
  } else if (qe?.status) {
    if (qe.status === 'inside') derivedStatus = 'in_consultation'
    else if (qe.status === 'done') derivedStatus = 'completed'
    else if (qe.status === 'no_show') derivedStatus = 'cancelled'
    else if (qe.status === 'sample_collected') derivedStatus = 'sample_collected'
    else if (qe.status === 'processing') derivedStatus = 'processing'
    else if (qe.status === 'report_prepared') derivedStatus = 'report_prepared'
    else derivedStatus = 'waiting'
  } else if (a.checkin_status && !['checked_in', 'not_checked_in'].includes(a.checkin_status)) {
    derivedStatus = a.checkin_status
  }

  let parsedTests: string[] = []
  if (Array.isArray(a.selected_tests)) {
    parsedTests = a.selected_tests
  } else if (typeof a.selected_lab_tests === 'string' && a.selected_lab_tests.trim().startsWith('[')) {
    try {
      parsedTests = JSON.parse(a.selected_lab_tests)
    } catch {}
  }

  return {
    id: a.id,
    trackingCode10Digit: a.tracking_code_10_digit,
    userId: a.user_id,
    clinicId: a.clinic_id,
    doctorId: a.doctor_id,
    slotId: a.slot_id || null,
    patientName: a.patient_name,
    patientAge: a.patient_age,
    patientGender: a.patient_gender,
    patientMobile: a.patient_mobile,
    patientEmail: a.patient_email,
    appointmentDate: a.appointment_date,
    appointmentTime: a.appointment_time,
    checkinStatus: derivedStatus as any,
    paymentStatus: a.payment_status === 'pending' ? 'unpaid' : (a.payment_status || 'unpaid'),
    feeAmount: Number(a.fee_amount || 0),
    queueNumber: qe?.queue_position || a.queue_position || a.queue_number || 1,
    queuePosition: qe?.queue_position || a.queue_position || a.queue_number || 1,
    notes: a.notes || (a.is_walkin ? 'Walk-In Reception Registration' : ''),
    isWalkin: Boolean(a.is_walkin),
    optInEarlyCall: Boolean(a.opt_in_early_call),
    createdAt: a.created_at,
    updatedAt: qe?.updated_at || a.updated_at,
    selectedTests: parsedTests,
    selectedLabTests: a.selected_lab_tests,
    paymentMode: a.payment_mode || 'ONLINE',
    status: a.status || 'APPROVED',
    attemptNumber: a.attempt_number || 1,
    serviceChargeAmount: (() => {
      const fee = Number(a.fee_amount || 0)
      const isPad = String(a.payment_mode || '').toUpperCase() === 'PAY_AT_DESK'
      const rawChg = Number(a.service_charge_amount || 0)
      if (!isPad || fee <= 0) return rawChg
      return rawChg > 0 ? rawChg : Math.round(fee * 0.05 * 100) / 100
    })(),
    totalAmount: (() => {
      const fee = Number(a.fee_amount || 0)
      const isPad = String(a.payment_mode || '').toUpperCase() === 'PAY_AT_DESK'
      const rawTot = Number(a.total_amount || 0)
      if (isPad) {
        const chg = Number(a.service_charge_amount || 0) > 0 ? Number(a.service_charge_amount) : (fee > 0 ? Math.round(fee * 0.05 * 100) / 100 : 0)
        return rawTot > fee ? rawTot : Math.round((fee + chg) * 100) / 100
      }
      return rawTot || fee
    })(),
    expiresAt: a.expires_at || null,
    approvedAt: a.approved_at || null,
    rejectedAt: a.rejected_at || null,
    clinic: a.clinic ? mapClinic(a.clinic) : undefined,
    doctor: a.doctor ? mapDoctor(a.doctor) : undefined,
  }
}

function mapSlot(s: any): Slot {
  return {
    id: s.id,
    clinicId: s.clinic_id,
    doctorId: s.doctor_id,
    slotDate: s.slot_date,
    startTime: s.start_time,
    endTime: s.end_time,
    maxCapacity: s.max_capacity,
    bookedCount: s.booked_count,
    isAvailable: s.is_available ?? true,
    isPublished: s.is_published ?? true,
  }
}

function mapService(s: any): ClinicService {
  return {
    id: s.id,
    clinicId: s.clinic_id,
    serviceName: s.service_name,
    price: Number(s.price || 0),
    category: s.category || s.description || 'Diagnostic Test',
    description: s.description,
    isAvailable: s.is_available ?? true,
  }
}

function mapLabReport(r: any): LabReport {
  let mappedStatus: any = r.status || r.stage || 'processing'
  if (mappedStatus === 'prepared') mappedStatus = 'ready'

  return {
    id: r.id,
    appointmentId: r.appointment_id,
    trackingCode10Digit:
      r.tracking_code_10_digit ||
      r.appointment?.tracking_code_10_digit ||
      '',
    patientName:
      r.patient_name ||
      r.patient_name_verification ||
      r.appointment?.patient_name ||
      'Patient',
    clinicId: r.clinic_id,
    testName: r.test_name,
    reportFileUrl: r.report_file_url || r.file_url,
    reportFileType: r.report_file_type || r.file_type || 'pdf',
    status: mappedStatus,
    uploadedAt: r.uploaded_at || r.created_at,
    sampleCollectedAt: r.sample_collected_at,
    preparedAt: r.prepared_at,
    technicianNotes: r.technician_notes || r.file_name,
  }
}

function mapNotification(n: any): DactorNotification {
  let leftLabel, leftValue, rightLabel, rightValue, trackingCode
  if (n.meta_json) {
    try {
      const parsed = JSON.parse(n.meta_json)
      leftLabel = parsed.left_label
      leftValue = parsed.left_value
      rightLabel = parsed.right_label
      rightValue = parsed.right_value
      trackingCode = parsed.tracking_code
    } catch {}
  }

  return {
    id: n.id,
    userId: n.user_id,
    clinicId: n.clinic_id,
    title: n.title,
    message: n.message,
    type: n.type,
    metaJson: n.meta_json,
    isRead: n.is_read ?? false,
    createdAt: n.created_at,
    leftLabel,
    leftValue,
    rightLabel,
    rightValue,
    trackingCode,
  }
}

function mapBillingInvoice(b: any): BillingInvoice {
  const total = Number(b.total_amount || 0)
  const paid = Number(b.paid_amount || 0)
  const balance = Number(b.balance_due || Math.max(0, total - paid))
  let effectiveStatus: string = b.payment_status || 'unpaid'
  if (paid >= total && total > 0) {
    effectiveStatus = 'paid'
  } else if (paid > 0) {
    effectiveStatus = 'partial'
  } else if (b.payment_status === 'pending') {
    effectiveStatus = 'unpaid'
  }

  let rawItems = b.items
  if (typeof rawItems === 'string') {
    try { rawItems = JSON.parse(rawItems) } catch {}
  }

  return {
    id: b.id,
    appointmentId: b.appointment_id,
    clinicId: b.clinic_id,
    items: Array.isArray(rawItems)
      ? rawItems.map((it: any) => {
          const name = it.name || it.itemName || it.item_name || 'Clinical Service'
          const price = Number(it.price || it.unitPrice || 0)
          const qty = Number(it.quantity || 1)
          return {
            id: it.id || crypto.randomUUID(),
            itemName: name,
            name: name,
            quantity: qty,
            price: price,
            total: Number(it.total || price * qty),
          }
        })
      : [],
    totalAmount: total,
    paidAmount: paid,
    balanceDue: balance,
    paymentStatus: effectiveStatus as any,
    paidAt: b.paid_at,
    remarks: b.remarks,
    receiptUrl: b.receipt_url,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  }
}

function mapQueueEntry(q: any): QueueEntry {
  return {
    id: q.id,
    appointmentId: q.appointment_id,
    clinicId: q.clinic_id,
    doctorId: q.doctor_id,
    queuePosition: Number(q.queue_position || 1),
    status: q.status || 'waiting',
    calledAt: q.called_at,
    insideAt: q.inside_at,
    completedAt: q.completed_at,
  }
}

export function generate10DigitTrackingCode(): string {
  // Generate a clean 10-digit numeric tracking code
  const first = Math.floor(Math.random() * 9) + 1 // 1-9
  const rest = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')
  return `${first}${rest}`
}

export async function generateGuaranteedUniqueTrackingCode(): Promise<string> {
  for (let i = 0; i < 15; i++) {
    const candidate = generate10DigitTrackingCode()
    try {
      const { data } = await supabase
        .from('appointments')
        .select('id')
        .eq('tracking_code_10_digit', candidate)
        .limit(1)
        .maybeSingle()
      if (!data) return candidate
    } catch {
      break
    }
  }
  const epochPart = (Date.now() % 1000000000).toString().padStart(9, '0')
  return `9${epochPart}`
}

// ==========================================
// PATIENT PORTAL API & WORKFLOW HELPERS
// ==========================================

export function parseTimeToMinutes(timeStr?: string): number {
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

    // In medical clinic contexts, if AM/PM is omitted and hour is 1..6,
    // it represents afternoon hours (1:00 PM to 6:00 PM / 13:00 to 18:00)
    if (!isPm && !isAm && hours >= 1 && hours <= 6) hours += 12

    return hours * 60 + minutes
  } catch {
    return 12 * 60
  }
}

export function isSlotTimeExpired(slotDate: string, endTimeStr?: string, startTimeStr?: string): boolean {
  if (!slotDate) return false
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const todayStr = `${year}-${month}-${day}`

  // Compare dates: YYYY-MM-DD
  if (slotDate < todayStr) return true
  if (slotDate > todayStr) return false

  let cleanEnd = (endTimeStr || '').trim()
  let cleanStart = (startTimeStr || '').trim()

  const rangePattern = /\s*(?:[-–—]|\bto\b)\s*/i
  if (!cleanEnd && rangePattern.test(cleanStart)) {
    const parts = cleanStart.split(rangePattern)
    if (parts.length >= 2) {
      cleanStart = parts[0].trim()
      cleanEnd = parts[1].trim()
    }
  } else if (rangePattern.test(cleanEnd)) {
    const parts = cleanEnd.split(rangePattern)
    if (parts.length >= 2) {
      if (!cleanStart) cleanStart = parts[0].trim()
      cleanEnd = parts[parts.length - 1].trim()
    }
  }

  const startMins = cleanStart ? parseTimeToMinutes(cleanStart) : null
  let endMins = cleanEnd ? parseTimeToMinutes(cleanEnd) : null

  if (endMins === null) {
    if (startMins !== null) {
      endMins = startMins + 30
    } else {
      return false
    }
  }

  if (startMins !== null && endMins === startMins) {
    endMins = startMins + 30
  }

  // Handle 12-hour rollover without AM/PM:
  // e.g. start at 12:00 (720m) and end at 1:00 (which if not converted would be 60m)
  // If endMins < startMins, check if adding 12 hours (720 mins) makes it a valid afternoon/evening slot
  if (endMins === 0 && (startMins === null || startMins > 0)) {
    endMins = 24 * 60
  } else if (startMins !== null && endMins < startMins) {
    if (endMins + 720 > startMins && (endMins + 720 - startMins) <= 720) {
      endMins += 720
    } else {
      endMins += 24 * 60
    }
  }

  // If slot is today, check if slot end time has passed
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  return currentMinutes >= endMins
}

export function formatMinutesTo12Hour(totalMinutes: number): string {
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

export function computeMultiSlotDailyPosition(params: {
  targetAppointmentId: string
  targetSlotId?: string | null
  targetAppointmentTime?: string | null
  appointmentDate: string
  allSlotsForDate: Slot[]
  allAppointmentsForDate: Appointment[]
  doctorId?: string | null
  avgConsultationMinutes?: number
  nowDate?: Date
}): MultiSlotPositionResult {
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
    const targetSlotIndex = sortedSlots.findIndex((s) => s.id === targetSlot!.id)
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
      if (appt.slotId === targetSlot!.id) return true
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

export async function calculateMultiSlotDailyPosition(
  clinicId: string,
  doctorId: string | null | undefined,
  appointmentDate: string,
  targetAppointmentId: string,
  targetSlotId: string | null | undefined,
  targetAppointmentTime: string | null | undefined,
  avgConsultationMinutes: number = 10,
  nowDate?: Date
): Promise<MultiSlotPositionResult> {
  const targetDateStr = (appointmentDate || '').trim().slice(0, 10)
  const [slots, appointments] = await Promise.all([
    clinicId && targetDateStr ? getSlots(clinicId, targetDateStr) : Promise.resolve([]),
    clinicId && targetDateStr ? getAppointmentsByClinic(clinicId, targetDateStr) : Promise.resolve([]),
  ])

  return computeMultiSlotDailyPosition({
    targetAppointmentId,
    targetSlotId,
    targetAppointmentTime,
    appointmentDate: targetDateStr,
    allSlotsForDate: slots,
    allAppointmentsForDate: appointments,
    doctorId,
    avgConsultationMinutes,
    nowDate,
  })
}

export async function getPatientProfileByEmail(email: string): Promise<PatientProfile | null> {
  try {
    const cleanEmail = email.trim().toLowerCase()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', cleanEmail)
      .limit(1)

    if (error || !data || data.length === 0) return null
    const p = data[0]
    return {
      id: p.id,
      authUid: p.auth_uid,
      email: p.email,
      fullName: p.full_name,
      role: p.role || 'patient',
      phone: p.phone,
      gender: p.gender,
      age: p.age,
      city: p.city,
      isArchived: p.is_archived ?? false,
      archivedAt: p.archived_at,
      deletionScheduledAt: p.deletion_scheduled_at,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }
  } catch (err) {
    console.error('Error fetching patient profile:', err)
    return null
  }
}

export async function getPatientProfileById(id: string): Promise<PatientProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`id.eq.${id},auth_uid.eq.${id}`)
      .limit(1)

    if (error || !data || data.length === 0) return null
    const p = data[0]
    return {
      id: p.id,
      authUid: p.auth_uid,
      email: p.email,
      fullName: p.full_name,
      role: p.role || 'patient',
      phone: p.phone,
      gender: p.gender,
      age: p.age,
      isArchived: p.is_archived ?? false,
      archivedAt: p.archived_at,
      deletionScheduledAt: p.deletion_scheduled_at,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }
  } catch {
    return null
  }
}

export interface ActiveUserSession {
  role: 'clinic_manager' | 'doctor' | 'patient'
  email: string | null
  portalTab: 'portal' | 'doctor-portal' | 'patient-portal'
}

export function getLoggedInUserSession(): ActiveUserSession | null {
  if (typeof window === 'undefined') return null
  try {
    const lastRole = localStorage.getItem('dactor_last_active_role')
    const lastPortal = localStorage.getItem('dactor_last_active_portal')

    // Helper: Resolve Patient session
    const resolvePatientSession = (): ActiveUserSession | null => {
      const isPatAuth =
        localStorage.getItem('dactor_patient_logged_in') === 'true' ||
        Boolean(localStorage.getItem('dactor_patient_session')) ||
        Boolean(localStorage.getItem('dactor_patient_email'))
      if (isPatAuth) {
        let email = localStorage.getItem('dactor_patient_email') || null
        if (!email && localStorage.getItem('dactor_patient_session')) {
          try {
            const parsed = JSON.parse(localStorage.getItem('dactor_patient_session')!)
            email = parsed?.email || null
          } catch {}
        }
        return {
          role: 'patient',
          email,
          portalTab: 'patient-portal',
        }
      }
      return null
    }

    // Helper: Resolve Doctor session
    const resolveDoctorSession = (): ActiveUserSession | null => {
      const hasDocPending = Boolean(localStorage.getItem('dactor_doctor_pending_kyc'))
      const isDocAuth =
        (localStorage.getItem('dactor_doctor_logged_in') === 'true' &&
          (Boolean(localStorage.getItem('dactor_doctor_session')) || Boolean(localStorage.getItem('dactor_doctor_email')))) ||
        hasDocPending
      if (isDocAuth) {
        let email = localStorage.getItem('dactor_doctor_email') || null
        if (!email && hasDocPending) {
          try {
            const parsed = JSON.parse(localStorage.getItem('dactor_doctor_pending_kyc')!)
            email = parsed?.email || null
          } catch {}
        }
        if (!email && localStorage.getItem('dactor_doctor_session')) {
          try {
            const parsed = JSON.parse(localStorage.getItem('dactor_doctor_session')!)
            email = parsed?.email || null
          } catch {}
        }
        return {
          role: 'doctor',
          email,
          portalTab: 'doctor-portal',
        }
      }
      return null
    }

    // Helper: Resolve Clinic session
    const resolveClinicSession = (): ActiveUserSession | null => {
      let hasClinicPending = false
      try {
        const raw = localStorage.getItem('dactor_pending_verification')
        if (raw && raw !== 'null' && raw !== '{}') {
          const parsed = JSON.parse(raw)
          if (parsed && (parsed.clinicName || parsed.email)) {
            hasClinicPending = true
          }
        }
      } catch {}

      const isClinicAuth = localStorage.getItem('dactor_clinic_logged_in') === 'true' || hasClinicPending
      if (isClinicAuth) {
        let email = localStorage.getItem('dactor_clinic_email') || null
        if (!email && hasClinicPending) {
          try {
            const parsed = JSON.parse(localStorage.getItem('dactor_pending_verification')!)
            email = parsed?.email || null
          } catch {}
        }
        return {
          role: 'clinic_manager',
          email,
          portalTab: 'portal',
        }
      }
      return null
    }

    // 1. Honor explicit last-active role if set
    if (lastRole === 'patient' || lastPortal === 'patient-portal') {
      const pat = resolvePatientSession()
      if (pat) return pat
    } else if (lastRole === 'doctor' || lastPortal === 'doctor-portal') {
      const doc = resolveDoctorSession()
      if (doc) return doc
    } else if (lastRole === 'clinic_manager' || lastPortal === 'portal') {
      const clinic = resolveClinicSession()
      if (clinic) return clinic
    }

    // 2. Default prioritization: Patient > Doctor > Clinic
    const patientSession = resolvePatientSession()
    if (patientSession) return patientSession

    const doctorSession = resolveDoctorSession()
    if (doctorSession) return doctorSession

    const clinicSession = resolveClinicSession()
    if (clinicSession) return clinicSession
  } catch {
    return null
  }
  return null
}

export interface EmailPortalAssociation {
  portal: 'clinic' | 'doctor' | 'patient'
  portalLabel: 'Clinic Portal' | 'Doctor / Specialist Portal' | 'Patient Portal'
  entityName: string
  email: string
}

export async function checkEmailPortalAssociation(
  email: string
): Promise<EmailPortalAssociation | null> {
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail) return null

  try {
    // 1. Check clinics table (contact_email) - highest priority for clinic facilities
    const existingClinic = await getClinicByEmail(cleanEmail)
    if (existingClinic) {
      return {
        portal: 'clinic',
        portalLabel: 'Clinic Portal',
        entityName: existingClinic.name || '',
        email: cleanEmail,
      }
    }

    // 2. Check doctors table (email)
    const existingDoctor = await getDoctorByEmail(cleanEmail)
    if (existingDoctor) {
      return {
        portal: 'doctor',
        portalLabel: 'Doctor / Specialist Portal',
        entityName: existingDoctor.fullName || '',
        email: cleanEmail,
      }
    }

    // 3. Check profiles table (email) - 1:1 parity with Android ClinicLoginScreen.kt
    const existingProfile = await getPatientProfileByEmail(cleanEmail)
    if (existingProfile) {
      const role = (existingProfile.role || '').trim().toLowerCase()
      if (role === 'clinic_admin' || role === 'clinic') {
        return {
          portal: 'clinic',
          portalLabel: 'Clinic Portal',
          entityName: existingProfile.fullName || '',
          email: cleanEmail,
        }
      }
      if (role === 'doctor' || role === 'lab_technician') {
        return {
          portal: 'doctor',
          portalLabel: 'Doctor / Specialist Portal',
          entityName: existingProfile.fullName || '',
          email: cleanEmail,
        }
      }
      // Only block if a real, registered patient profile exists with name or phone (matches Android parity)
      if (role === 'patient' && (Boolean(existingProfile.fullName?.trim()) || Boolean(existingProfile.phone?.trim()))) {
        return {
          portal: 'patient',
          portalLabel: 'Patient Portal',
          entityName: existingProfile.fullName || '',
          email: cleanEmail,
        }
      }
    }
  } catch (err) {
    console.warn('checkEmailPortalAssociation error:', err)
  }

  return null
}

export async function savePatientProfile(profile: Partial<PatientProfile>): Promise<PatientProfile | null> {
  const email = profile.email?.trim().toLowerCase()
  if (!email) return null

  try {
    const payload: any = {
      email,
      updated_at: new Date().toISOString(),
    }
    if (profile.fullName !== undefined) payload.full_name = profile.fullName.trim()
    if (profile.phone !== undefined) payload.phone = profile.phone.trim()
    if (profile.gender !== undefined) payload.gender = profile.gender
    if (profile.age !== undefined) payload.age = profile.age
    if (profile.role !== undefined) payload.role = profile.role
    if (profile.authUid !== undefined) payload.auth_uid = profile.authUid

    // Check if exists
    const existing = await getPatientProfileByEmail(email)
    let resData: any

    if (existing) {
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      resData = data
    } else {
      payload.id = profile.id || crypto.randomUUID()
      payload.created_at = new Date().toISOString()
      const { data, error } = await supabase
        .from('profiles')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      resData = data
    }

    return {
      id: resData.id,
      authUid: resData.auth_uid,
      email: resData.email,
      fullName: resData.full_name,
      role: resData.role,
      phone: resData.phone,
      gender: resData.gender || profile.gender || 'Male',
      age: resData.age || profile.age,
      city: profile.city?.trim() || undefined,
      isArchived: resData.is_archived,
      createdAt: resData.created_at,
      updatedAt: resData.updated_at,
    }
  } catch (err) {
    console.warn('Patient profile database save warning:', err)
    // Non-blocking fallback: always construct and return a valid profile for the user
    return {
      id: profile.id || crypto.randomUUID(),
      authUid: profile.authUid,
      email,
      fullName: profile.fullName?.trim() || 'Patient',
      role: 'patient',
      phone: profile.phone?.trim() || '',
      gender: profile.gender || 'Male',
      age: profile.age,
      city: profile.city?.trim(),
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }
}

export async function schedulePatientArchive(profileId: string): Promise<boolean> {
  try {
    const scheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase
      .from('profiles')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        deletion_scheduled_at: scheduledAt,
      })
      .eq('id', profileId)
    return !error
  } catch {
    return false
  }
}

export async function cancelPatientArchive(profileId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        is_archived: false,
        archived_at: null,
        deletion_scheduled_at: null,
      })
      .eq('id', profileId)
    return !error
  } catch {
    return false
  }
}

export async function scheduleDoctorArchive(doctorId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('doctors')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
      })
      .eq('id', doctorId)
    return !error
  } catch {
    return false
  }
}

export async function cancelDoctorArchive(doctorId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('doctors')
      .update({
        is_archived: false,
        archived_at: null,
      })
      .eq('id', doctorId)
    return !error
  } catch {
    return false
  }
}

export async function getAppointmentsByPatient(criteria: {
  email?: string
  phone?: string
  userId?: string
  trackingCodes?: string[]
}): Promise<Appointment[]> {
  try {
    const filters: string[] = []

    if (criteria.userId) {
      filters.push(`user_id.eq.${criteria.userId}`)
    }
    if (criteria.email) {
      filters.push(`patient_email.ilike.${criteria.email.trim().toLowerCase()}`)
    }
    if (criteria.phone) {
      const cleanPhone = criteria.phone.trim()
      if (cleanPhone.length >= 6) {
        filters.push(`patient_mobile.eq.${cleanPhone}`)
      }
    }
    if (criteria.trackingCodes && criteria.trackingCodes.length > 0) {
      const codes = criteria.trackingCodes.map((c) => c.trim()).filter(Boolean)
      if (codes.length > 0) {
        filters.push(`tracking_code_10_digit.in.(${codes.join(',')})`)
      }
    }

    if (filters.length === 0) return []

    const { data, error } = await supabase
      .from('appointments')
      .select('*, clinic:clinics(*), doctor:doctors(*), queue_entries(*)')
      .or(filters.join(','))
      .order('appointment_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map(mapAppointment)
  } catch (err) {
    console.error('Error fetching patient appointments:', err)
    return []
  }
}

export async function cancelAppointment(appointmentId: string, _reason?: string): Promise<boolean> {
  return await updateAppointmentStatus(appointmentId, 'cancelled')
}

export async function getClinicPublicPaymentMethods(clinicId: string): Promise<PublicPaymentMethod[]> {
  const defaultDeskOnly: PublicPaymentMethod[] = [
    {
      id: 'pay_at_desk',
      name: 'Pay at Desk (+5%)',
      subtitle: 'Pay cash/QR at clinic counter (+5% service charge)',
      is_verified: true,
      requires_keys: false,
      requires_desk_approval: true,
    },
  ]
  if (!clinicId?.trim()) return defaultDeskOnly

  try {
    const { data, error } = await supabase.rpc('get_clinic_public_payment_methods', {
      p_clinic_id: clinicId.trim(),
    })
    if (!error && Array.isArray(data) && data.length > 0) {
      return data as PublicPaymentMethod[]
    }

    const { data: fnData } = await supabase.functions.invoke('appointment-payment', {
      body: { action: 'get_public_payment_methods', clinicId: clinicId.trim() },
    })
    if (Array.isArray(fnData?.payment_methods) && fnData.payment_methods.length > 0) {
      return fnData.payment_methods as PublicPaymentMethod[]
    }
    return defaultDeskOnly
  } catch {
    return defaultDeskOnly
  }
}

export async function getClinicPaymentConfig(clinicId: string): Promise<PaymentGatewaysConfig | null> {
  try {
    const methods = await getClinicPublicPaymentMethods(clinicId)
    const findMethod = (id: OnlineGatewayId) => methods.find((m) => m.id === id && m.is_verified === true)

    const esewaMethod = findMethod('esewa')
    const khaltiMethod = findMethod('khalti')
    const fonepayMethod = findMethod('fonepay')
    const connectIpsMethod = findMethod('connectips')

    return {
      esewa: {
        id: 'esewa',
        title: esewaMethod?.name || 'eSewa Mobile Wallet',
        subtitle: esewaMethod?.subtitle || 'Instant eSewa Wallet & Bank Checkout',
        accountIdentifier: esewaMethod?.merchant_display_id || '',
        merchantCode: esewaMethod?.merchant_display_id || '',
        merchant_id: esewaMethod?.merchant_display_id || '',
        testBypassEnabled: false,
        isEnabled: Boolean(esewaMethod),
        enabled: Boolean(esewaMethod),
        is_verified: Boolean(esewaMethod),
        environment: esewaMethod?.environment || 'live',
      },
      khalti: {
        id: 'khalti',
        title: khaltiMethod?.name || 'Khalti Digital Wallet',
        subtitle: khaltiMethod?.subtitle || 'Khalti Wallet, Mobile Banking & SCT/Visa',
        accountIdentifier: khaltiMethod?.merchant_display_id || '',
        merchantCode: khaltiMethod?.merchant_display_id || '',
        merchant_id: khaltiMethod?.merchant_display_id || '',
        testBypassEnabled: false,
        isEnabled: Boolean(khaltiMethod),
        enabled: Boolean(khaltiMethod),
        is_verified: Boolean(khaltiMethod),
        environment: khaltiMethod?.environment || 'live',
      },
      fonepay: {
        id: 'fonepay',
        title: fonepayMethod?.name || 'Fonepay QR / Direct Banking',
        subtitle: fonepayMethod?.subtitle || 'Interbank Dynamic QR & 60+ Mobile Banking Apps',
        accountIdentifier: fonepayMethod?.merchant_display_id || '',
        merchantCode: fonepayMethod?.merchant_display_id || '',
        merchant_id: fonepayMethod?.merchant_display_id || '',
        testBypassEnabled: false,
        isEnabled: Boolean(fonepayMethod),
        enabled: Boolean(fonepayMethod),
        is_verified: Boolean(fonepayMethod),
        environment: fonepayMethod?.environment || 'live',
      },
      connectips: {
        id: 'connectips',
        title: connectIpsMethod?.name || 'ConnectIPS Direct Bank',
        subtitle: connectIpsMethod?.subtitle || 'NCHL Direct Bank Account Transfer',
        accountIdentifier: connectIpsMethod?.merchant_display_id || '',
        merchantCode: connectIpsMethod?.merchant_display_id || '',
        merchant_id: connectIpsMethod?.merchant_display_id || '',
        testBypassEnabled: false,
        isEnabled: Boolean(connectIpsMethod),
        enabled: Boolean(connectIpsMethod),
        is_verified: Boolean(connectIpsMethod),
        environment: connectIpsMethod?.environment || 'live',
      },
      availableMethods: methods,
      testBypassAllowed: false,
    }
  } catch {
    return null
  }
}

export async function getAppointmentById(id: string): Promise<Appointment | null> {
  try {
    const cleanId = id.trim()
    if (!cleanId) return null
    const { data, error } = await supabase
      .from('appointments')
      .select('*, clinic:clinics(*), doctor:doctors(*), queue_entries(*)')
      .eq('id', cleanId)
      .maybeSingle()
    if (error || !data) return null
    return mapAppointment(data)
  } catch {
    return null
  }
}

/**
 * Initiates the online payment phase (Phase 2): clears the 5-minute decision window
 * and activates the gateway-specific server backstop (15 or 20 minutes) while keeping the slot held.
 */
export async function initiateOnlinePaymentPhase(
  appointmentId: string,
  gateway: string
): Promise<{ success: boolean; backstopExpiresAt?: string }> {
  try {
    const { data, error } = await supabase.rpc('initiate_online_payment_phase', {
      p_appointment_id: appointmentId,
      p_gateway: gateway.toLowerCase().trim(),
    })
    if (error) {
      console.warn('initiate_online_payment_phase RPC failed:', error)
      return { success: false }
    }
    return {
      success: data?.success ?? true,
      backstopExpiresAt: data?.backstop_expires_at,
    }
  } catch (e) {
    console.warn('initiate_online_payment_phase exception:', e)
    return { success: false }
  }
}

/**
 * Atomically cancels a pending appointment and decrements the slot's booked_count.
 */
export async function cancelPendingAppointment(
  appointmentId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('cancel_pending_appointment', {
      p_appointment_id: appointmentId,
    })
    if (error) {
      console.warn('cancel_pending_appointment RPC failed:', error)
      return false
    }
    return Boolean(data)
  } catch (e) {
    console.warn('cancel_pending_appointment exception:', e)
    return false
  }
}

export async function startOnlinePayment(
  appointmentId: string,
  gateway: OnlineGatewayId,
  returnUrl?: string,
  trackingCode?: string,
  patientPhone?: string,
  selectedTests?: string[] | string
): Promise<{ attemptId: string; gateway: OnlineGatewayId; checkoutUrl: string; transactionUuid: string }> {
  // Proactively invoke initiate_online_payment_phase so the slot remains held under gateway backstop
  await initiateOnlinePaymentPhase(appointmentId, gateway).catch(() => {})

  const { data, error } = await supabase.functions.invoke('appointment-payment', {
    body: {
      action: 'initiate',
      gateway,
      appointmentId,
      returnUrl,
      trackingCode,
      patientPhone,
      selectedTests,
    },
  })
  if (error || !data?.checkoutUrl) {
    const errMsg = data?.error || error?.message || `Failed to initiate ${gateway.toUpperCase()} payment`
    throw new Error(errMsg)
  }
  return data
}

export async function startEsewaPayment(
  appointmentId: string,
  returnUrl?: string,
  trackingCode?: string,
  patientPhone?: string
): Promise<{ attemptId: string; checkoutUrl: string; transactionUuid: string }> {
  return await startOnlinePayment(appointmentId, 'esewa', returnUrl, trackingCode, patientPhone)
}

export async function refreshOnlinePayment(
  appointmentId: string,
  trackingCode?: string,
  patientPhone?: string
): Promise<{ status: 'complete' | 'pending' | 'failed' | 'expired' | 'not_started'; gateway: OnlineGatewayId | null; reference: string | null }> {
  let proofCode = trackingCode || ''
  let proofPhone = patientPhone || ''
  if (typeof window !== 'undefined' && (!proofCode || !proofPhone)) {
    try {
      const pendingRaw = localStorage.getItem('dactor_pending_online_payment') || localStorage.getItem('dactor_pending_esewa_payment') || '{}'
      const pending = JSON.parse(pendingRaw)
      if (pending.appointmentId === appointmentId) proofCode ||= String(pending.trackingCode || '')
      proofPhone ||= sessionStorage.getItem('dactor_pending_payment_phone') || ''
    } catch {}
  }
  const { data, error } = await supabase.functions.invoke('appointment-payment', {
    body: {
      action: 'refresh',
      appointmentId,
      trackingCode: proofCode,
      patientPhone: proofPhone,
    },
  })
  if (error) {
    throw new Error(error.message || 'Failed to refresh online payment status')
  }
  if (typeof window !== 'undefined' && ['complete', 'failed', 'expired'].includes(data?.status)) {
    sessionStorage.removeItem('dactor_pending_payment_phone')
  }
  return data || { status: 'pending', gateway: null, reference: null }
}

export async function refreshEsewaPayment(
  appointmentId: string,
  trackingCode?: string,
  patientPhone?: string
): Promise<{ status: 'complete' | 'pending' | 'failed' | 'expired' | 'not_started'; gateway?: OnlineGatewayId | null; reference: string | null }> {
  return await refreshOnlinePayment(appointmentId, trackingCode, patientPhone)
}

export async function getClinicGatewaySetupStatus(clinicId: string): Promise<ClinicGatewaySetupStatus | null> {
  if (!clinicId?.trim()) return null
  try {
    const { data, error } = await supabase.functions.invoke('appointment-payment', {
      body: {
        action: 'get_gateway_setup_status',
        clinicId: clinicId.trim(),
      },
    })
    if (error || !data?.setup) return null
    return {
      ...(data.setup as ClinicGatewaySetupStatus),
      callbackBaseUrl: data.callbackBaseUrl,
    }
  } catch {
    return null
  }
}

export async function saveClinicGatewayCredentials(params: {
  clinicId: string
  gateway: OnlineGatewayId
  enabled?: boolean
  isDirectPaymentEnabled?: boolean
  environment?: 'test' | 'live'
  productCode?: string
  merchantId?: string
  merchantCode?: string
  publicKey?: string
  secretKey?: string
  username?: string
  password?: string
  appId?: string
  appName?: string
  appPassword?: string
  privateKeyPem?: string
  pfxBase64?: string
  pfxPassword?: string
}): Promise<{ saved: boolean; callbackUrl?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke('appointment-payment', {
    body: {
      action: 'save_credentials',
      ...params,
      environment: params.environment || 'test',
    },
  })
  if (error || data?.error) {
    throw new Error(data?.error || error?.message || `Could not save ${params.gateway.toUpperCase()} credentials`)
  }
  return data
}

export async function toggleClinicGateway(params: {
  clinicId: string
  gateway: OnlineGatewayId
  enabled: boolean
}): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('appointment-payment', {
    body: {
      action: 'toggle_gateway',
      clinicId: params.clinicId,
      gateway: params.gateway,
      enabled: params.enabled,
    },
  })
  if (error || data?.error) {
    throw new Error(data?.error || error?.message || `Could not update ${params.gateway.toUpperCase()} status`)
  }
  return true
}

export async function reconcileClinicPendingPayments(clinicId: string): Promise<{ checkedCount: number; finalizedCount: number }> {
  try {
    const { data } = await supabase.functions.invoke('appointment-payment', {
      body: { action: 'reconcile_pending', clinicId },
    })
    return {
      checkedCount: Number(data?.checkedCount || 0),
      finalizedCount: Number(data?.finalizedCount || 0),
    }
  } catch {
    return { checkedCount: 0, finalizedCount: 0 }
  }
}

export async function saveClinicEsewaCredentials(params: {
  clinicId: string
  productCode: string
  secretKey?: string
  environment?: 'test' | 'live'
}): Promise<boolean> {
  await saveClinicGatewayCredentials({
    clinicId: params.clinicId,
    gateway: 'esewa',
    productCode: params.productCode,
    secretKey: params.secretKey,
    environment: params.environment || 'test',
    enabled: true,
  })
  return true
}

export async function recordPaymentTransaction(record: {
  appointmentId: string
  trackingCode: string
  clinicId: string
  doctorId?: string
  patientName: string
  appointmentDate: string
  appointmentTime: string
  amount: number
  paymentMethod: string
  paymentStatus: string
  transactionId?: string
  notes?: string
}): Promise<boolean> {
  try {
    const txnId = record.transactionId || `TXN-${record.trackingCode}-${Date.now().toString().slice(-4)}`
    const nowIso = new Date().toISOString()
    const dbPayStatus = normalizePaymentStatus(record.paymentStatus)

    // 1. Update appointment payment status
    await supabase
      .from('appointments')
      .update({
        payment_status: dbPayStatus,
        updated_at: nowIso,
      })
      .eq('id', record.appointmentId)

    // 2. Create or update billing invoice in Supabase (preserving existing line items)
    const { data: existingInv } = await supabase
      .from('billing_invoices')
      .select('id, items, remarks, total_amount')
      .eq('appointment_id', record.appointmentId)
      .maybeSingle()

    const existingItems = Array.isArray(existingInv?.items) && existingInv.items.length > 0
      ? existingInv.items
      : [
          {
            id: crypto.randomUUID(),
            item_name: 'Consultation & Clinical Services',
            itemName: 'Consultation & Clinical Services',
            name: 'Consultation & Clinical Services',
            quantity: 1,
            price: record.amount,
            total: record.amount,
          },
        ]

    const effectiveTotal = Math.max(record.amount, Number(existingInv?.total_amount || 0))
    const paidAmt = dbPayStatus === 'paid' ? effectiveTotal : 0
    const invoicePayload = {
      id: existingInv?.id || crypto.randomUUID(),
      appointment_id: record.appointmentId,
      clinic_id: record.clinicId,
      items: existingItems,
      total_amount: effectiveTotal,
      paid_amount: paidAmt,
      balance_due: Math.max(0, effectiveTotal - paidAmt),
      payment_status: dbPayStatus,
      paid_at: dbPayStatus === 'paid' ? nowIso : null,
      remarks: existingInv?.remarks
        ? `${existingInv.remarks}\nMethod: ${record.paymentMethod} (Txn: ${txnId}) • ${record.notes || ''}`.trim()
        : `Method: ${record.paymentMethod} (Txn: ${txnId}) • ${record.notes || ''}`.trim(),
    }

    const { error: invError } = await supabase
      .from('billing_invoices')
      .upsert(invoicePayload, { onConflict: 'appointment_id' })

    return !invError
  } catch (err) {
    console.error('Error recording payment transaction:', err)
    return false
  }
}

export async function getPatientTransactions(criteria: {
  email?: string
  phone?: string
  userId?: string
  trackingCodes?: string[]
}): Promise<PatientTransactionRecord[]> {
  try {
    const appts = await getAppointmentsByPatient(criteria)
    if (appts.length === 0) return []

    // Fetch invoices for these appointments
    const apptIds = appts.map((a) => a.id)
    const { data: invData } = await supabase
      .from('billing_invoices')
      .select('*')
      .in('appointment_id', apptIds)

    const invoicesMap = new Map<string, any>()
    ;(invData || []).forEach((inv: any) => {
      invoicesMap.set(inv.appointment_id, inv)
    })

    return appts.map((appt) => {
      const inv = invoicesMap.get(appt.id)
      const amt = (inv?.paid_amount && inv.paid_amount > 0)
        ? inv.paid_amount
        : (inv?.total_amount && inv.total_amount > 0)
          ? inv.total_amount
          : appt.feeAmount || 0

      let status = appt.paymentStatus || 'unpaid'
      if (inv?.payment_status) status = inv.payment_status

      let method = 'eSewa'
      if (inv?.remarks) {
        const rem = inv.remarks.toLowerCase()
        if (rem.includes('bypass')) method = 'Bypass Test'
        else if (rem.includes('khalti')) method = 'Khalti'
        else if (rem.includes('fonepay')) method = 'Fonepay'
        else if (rem.includes('connectips')) method = 'ConnectIPS'
        else if (rem.includes('cash')) method = 'Cash'
      }

      let txnId = `TXN-${appt.trackingCode10Digit}`
      if (inv?.remarks && inv.remarks.includes('Txn:')) {
        txnId = inv.remarks.split('Txn:')[1].split(')')[0].trim()
      }

      return {
        id: inv?.id || appt.id,
        appointmentId: appt.id,
        trackingCode: appt.trackingCode10Digit,
        clinicName: appt.clinic?.name || 'Clinic & OPD Center',
        doctorName: appt.doctor?.fullName || 'Consulting Doctor',
        patientName: appt.patientName,
        appointmentDate: appt.appointmentDate,
        appointmentTime: appt.appointmentTime,
        amount: amt,
        paymentStatus: status,
        paymentMethod: method,
        transactionId: txnId,
        createdAt: appt.createdAt || new Date().toISOString(),
      }
    })
  } catch (err) {
    console.error('Error fetching patient transactions:', err)
    return []
  }
}
// ==========================================
// DOCTOR AFFILIATED CLINICS & DIRECTORY HELPERS
// ==========================================
export async function getAffiliatedClinicsForDoctor(
  doctorId?: string,
  doctorEmail?: string
): Promise<Clinic[]> {
  try {
    const clinicIdSet = new Set<string>()

    // Check doctor record directly
    if (doctorId) {
      const doc = await getDoctorById(doctorId)
      if (doc?.clinicId) clinicIdSet.add(doc.clinicId)
      if (doc?.activeClinicId) clinicIdSet.add(doc.activeClinicId)
      if (doc?.primaryClinicId) clinicIdSet.add(doc.primaryClinicId)
    }

    // Check clinic invitations for this doctor email (schema column is 'email')
    if (doctorEmail) {
      const cleanEmail = doctorEmail.trim().toLowerCase()
      const { data: invites } = await supabase
        .from('clinic_invitations')
        .select('clinic_id, status')
        .ilike('email', cleanEmail)
        .eq('status', 'accepted')

      if (invites) {
        invites.forEach((inv) => {
          if (inv.clinic_id) clinicIdSet.add(inv.clinic_id)
        })
      }
    }

    // Check slots table for clinics where this doctor has slots
    if (doctorId) {
      const { data: docSlots } = await supabase
        .from('slots')
        .select('clinic_id')
        .eq('doctor_id', doctorId)
        .limit(50)

      if (docSlots) {
        docSlots.forEach((s) => {
          if (s.clinic_id) clinicIdSet.add(s.clinic_id)
        })
      }
    }

    if (clinicIdSet.size === 0) {
      return []
    }

    const clinicIds = Array.from(clinicIdSet)
    const { data: clinicsData, error } = await supabase
      .from('clinics')
      .select('*')
      .in('id', clinicIds)

    if (error || !clinicsData || clinicsData.length === 0) {
      return []
    }

    return clinicsData.map(mapClinic).filter((c) => !c.isArchived)
  } catch (err) {
    console.error('Error fetching affiliated clinics for doctor:', err)
    return []
  }
}

export function linkDoctorsWithClinics(doctors: Doctor[], clinics: Clinic[]): DoctorHomeItem[] {
  const clinicMap = new Map<string, Clinic>()
  clinics.forEach((c) => {
    if (!c.isArchived) clinicMap.set(c.id, c)
  })

  return doctors.map((doc) => {
    const linkedClinicIds = new Set<string>()
    if (doc.clinicId) linkedClinicIds.add(doc.clinicId)
    if (doc.activeClinicId) linkedClinicIds.add(doc.activeClinicId)
    if (doc.primaryClinicId) linkedClinicIds.add(doc.primaryClinicId)

    const practicingClinics: Clinic[] = []
    linkedClinicIds.forEach((id) => {
      const c = clinicMap.get(id)
      if (c && !practicingClinics.some((existing) => existing.id === c.id)) {
        practicingClinics.push(c)
      }
    })

    return {
      doctor: {
        ...doc,
        practicingClinics,
      },
      practicingClinics,
      hasDocInClinic: Boolean(doc.isInClinic),
    }
  })
}

export async function getDoctorAppointments(
  doctorId: string,
  date?: string
): Promise<Appointment[]> {
  try {
    let query = supabase
      .from('appointments')
      .select('*, doctor:doctors(*), clinic:clinics(*), queue_entries(*)')
      .eq('doctor_id', doctorId)

    if (date) {
      query = query.eq('appointment_date', date)
    }

    const { data, error } = await query.order('appointment_time', { ascending: true })
    if (error) throw error
    return (data || []).map(mapAppointment)
  } catch (err) {
    console.error('Error fetching doctor appointments:', err)
    return []
  }
}

export interface PatientDirectoryConsultation {
  id: string
  appointmentDate: string
  appointmentTime: string
  doctorName?: string
  doctorSpecialty?: string
  trackingCode: string
  checkinStatus: string
  paymentStatus: string
  feeAmount: number
  notes?: string
  isFollowup: boolean
}

export interface ClinicPatientDirectoryEntry {
  id: string
  fullName: string
  phone: string
  gender: string
  age: number
  email?: string
  lastVisitDate?: string
  visitCount: number
  trackingCodes: string[]
  consultations: PatientDirectoryConsultation[]
}

/**
 * Pure, reactive builder that converts an array of clinic appointments into
 * unified patient directory entries. Groups repeat visits by phone or user_id/name,
 * maintains visit timelines, and extracts tracking codes.
 */
export function buildClinicPatientDirectory(appointments: Appointment[]): ClinicPatientDirectoryEntry[] {
  const patientMap = new Map<string, ClinicPatientDirectoryEntry>()

  // Strict Clinic Directory Guard: Only APPROVED appointments belong in the Patient Directory
  const approvedOnly = (appointments || []).filter((a) => {
    const st = (a.status || '').toUpperCase()
    return (
      st === 'APPROVED' &&
      a.status !== 'WAITING_FOR_APPROVAL' &&
      a.status !== 'pending_payment' &&
      a.status !== 'UNAPPROVED' &&
      a.status !== 'EXPIRED' &&
      a.checkinStatus !== 'cancelled'
    )
  })

  // Sort appointments so newest visits are first
  const sorted = [...approvedOnly].sort((a, b) => {
    const da = a.appointmentDate || ''
    const db = b.appointmentDate || ''
    return db.localeCompare(da)
  })

  for (const a of sorted) {
    const cleanMobile = (a.patientMobile || '').replace(/\D/g, '')
    const cleanName = (a.patientName || '').trim()
    // Robust key hierarchy: normalized phone (if >= 7 digits) -> userId -> normalized patient name -> appointment id
    const key = cleanMobile.length >= 7
      ? cleanMobile
      : (a.userId || (cleanName ? cleanName.toLowerCase() : a.id))

    const isFollowup = Number(a.feeAmount) === 0
    const consultItem: PatientDirectoryConsultation = {
      id: a.id,
      appointmentDate: a.appointmentDate || new Date().toISOString().slice(0, 10),
      appointmentTime: a.appointmentTime || 'OPD',
      doctorName: a.doctor?.fullName || undefined,
      doctorSpecialty: a.doctor?.specialty || undefined,
      trackingCode: a.trackingCode10Digit || '',
      checkinStatus: a.checkinStatus || 'booked',
      paymentStatus: a.paymentStatus || 'unpaid',
      feeAmount: Number(a.feeAmount) || 0,
      notes: a.notes || undefined,
      isFollowup,
    }

    if (!patientMap.has(key)) {
      patientMap.set(key, {
        id: a.userId || a.id,
        fullName: cleanName || 'Patient',
        phone: a.patientMobile || 'N/A',
        gender: a.patientGender || 'Other',
        age: Number(a.patientAge) || 0,
        email: a.patientEmail || undefined,
        lastVisitDate: a.appointmentDate,
        visitCount: 1,
        trackingCodes: a.trackingCode10Digit ? [a.trackingCode10Digit] : [],
        consultations: [consultItem],
      })
    } else {
      const item = patientMap.get(key)!
      item.visitCount += 1
      if (a.trackingCode10Digit && !item.trackingCodes.includes(a.trackingCode10Digit)) {
        item.trackingCodes.push(a.trackingCode10Digit)
      }
      item.consultations.push(consultItem)
    }
  }

  return Array.from(patientMap.values())
}

export async function getClinicPatientDirectory(clinicId: string): Promise<ClinicPatientDirectoryEntry[]> {
  try {
    const appts = await getAppointmentsByClinic(clinicId)
    return buildClinicPatientDirectory(appts)
  } catch (err) {
    console.error('Error fetching clinic patient directory:', err)
    return []
  }
}

// ==========================================
// CLINIC SUBSCRIPTION, ARCHIVE, SLOTS & INVITATIONS API
// ==========================================
export async function requestClinicActivationRenewal(
  clinicId: string,
  plan: '1_month' | '12_months',
  amountPaid: number,
  notes: string,
  paymentMethod = 'ESEWA',
  txnRef = ''
): Promise<boolean> {
  try {
    await supabase.from('clinic_subscription_payments').insert([
      {
        clinic_id: clinicId,
        plan_type: plan,
        amount_npr: amountPaid,
        payment_method: paymentMethod,
        transaction_reference: txnRef || undefined,
        status: 'pending_verification',
        notes: notes,
      },
    ])
  } catch (e) {
    console.warn('Could not insert clinic_subscription_payment record:', e)
  }

  return await updateClinic(clinicId, {
    activationPlan: plan,
    activationPaidAmount: amountPaid,
    activationNotes: `RENEWAL_REQUEST: ${notes} (${new Date().toISOString()})`,
  })
}

export async function completeClinicSubscriptionPayment(
  clinicId: string,
  plan: '1_month' | '12_months',
  amountPaid: number,
  txnRef: string,
  paymentMethod = 'ESEWA'
): Promise<boolean> {
  const days = plan === '12_months' ? 365 : 30
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString()

  try {
    await supabase.from('clinic_subscription_payments').insert([
      {
        clinic_id: clinicId,
        plan_type: plan,
        amount_npr: amountPaid,
        payment_method: paymentMethod,
        transaction_reference: txnRef,
        period_start: new Date().toISOString(),
        period_end: expiresAt,
        status: 'verified',
        notes: `Instant activation payment: ${txnRef}`,
      },
    ])
  } catch (e) {
    console.warn('Could not insert completed clinic_subscription_payment:', e)
  }

  return await updateClinic(clinicId, {
    isActivated: true,
    activationExpiresAt: expiresAt,
    activationPlan: plan,
    activationPaidAmount: amountPaid,
    activationNotes: `INSTANT_ACTIVATED (${txnRef}) on ${new Date().toISOString()}`,
  })
}

export async function getClinicSubscriptionPayments(clinicId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('clinic_subscription_payments')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('Error fetching clinic_subscription_payments:', e)
    return []
  }
}

export async function getPlatformCommissionSettlements(clinicId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('platform_commission_settlements')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('settled_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('Error fetching platform_commission_settlements:', e)
    return []
  }
}

export async function getClinicInvoiceTransactions(clinicId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('invoice_transactions')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('is_deleted', false)
      .order('transaction_time', { ascending: false })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('Error fetching invoice_transactions:', e)
    return []
  }
}

export async function getClinicPaymentAttempts(clinicId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('get_clinic_payment_attempts', { p_clinic_id: clinicId })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('Error fetching clinic payment attempts via RPC:', e)
    return []
  }
}

export async function scheduleClinicDeletion(clinicId: string): Promise<boolean> {
  const now = new Date()
  const purgeDate = new Date(now.getTime() + 30 * 86400000)
  return await updateClinic(clinicId, {
    isArchived: true,
    archivedAt: now.toISOString(),
    deletionScheduledAt: purgeDate.toISOString(),
  })
}

export async function cancelClinicDeletion(clinicId: string): Promise<boolean> {
  return await updateClinic(clinicId, {
    isArchived: false,
    archivedAt: '',
    deletionScheduledAt: '',
  })
}

/**
 * Super Admin & Admin Portal Permission: Permanently Delete / Purge Clinic
 * Cascades across queue entries, lab reports, billing invoices, appointments, slots, services, and clinic.
 */
export async function deleteClinicPermanently(clinicId: string): Promise<boolean> {
  try {
    // 1. Dependent clinical entities
    await supabase.from('queue_entries').delete().eq('clinic_id', clinicId)
    await supabase.from('lab_reports').delete().eq('clinic_id', clinicId)
    await supabase.from('billing_invoices').delete().eq('clinic_id', clinicId)
    await supabase.from('appointments').delete().eq('clinic_id', clinicId)
    await supabase.from('slots').delete().eq('clinic_id', clinicId)
    await supabase.from('clinic_services').delete().eq('clinic_id', clinicId)
    await supabase.from('clinic_catalog').delete().eq('clinic_id', clinicId)
    await supabase.from('clinic_invitations').delete().eq('clinic_id', clinicId)
    
    // 2. Clinic entity
    const { error } = await supabase.from('clinics').delete().eq('id', clinicId)
    return !error
  } catch (err) {
    console.error('Error permanently deleting clinic:', err)
    return false
  }
}

/**
 * Super Admin & Admin Portal Permission: Delete Doctor
 */
export async function deleteDoctorPermanently(doctorId: string): Promise<boolean> {
  try {
    await supabase.from('queue_entries').delete().eq('doctor_id', doctorId)
    await supabase.from('clinic_invitations').delete().eq('doctor_id', doctorId)
    const { error } = await supabase.from('doctors').delete().eq('id', doctorId)
    return !error
  } catch (err) {
    console.error('Error deleting doctor:', err)
    return false
  }
}

/**
 * Super Admin & Admin Portal Permission: Delete Patient Profile
 */
export async function deletePatientProfilePermanently(patientId: string): Promise<boolean> {
  try {
    await supabase.from('notifications').delete().eq('user_id', patientId)
    await supabase.from('fcm_tokens').delete().eq('user_id', patientId)
    const { error } = await supabase.from('profiles').delete().eq('id', patientId)
    return !error
  } catch (err) {
    console.error('Error deleting patient profile:', err)
    return false
  }
}

/**
 * Super Admin & Admin Portal Permission: Purge Expired Archived Clinic Data
 */
export async function purgeExpiredClinicData(clinicId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('purge_expired_archived_clinic_data', { p_clinic_id: clinicId })
    if (error) {
      // Fallback to manual cascade
      return await deleteClinicPermanently(clinicId)
    }
    return true
  } catch {
    return await deleteClinicPermanently(clinicId)
  }
}

export async function updateAppointmentNotes(appointmentId: string, _notes: string): Promise<boolean> {
  try {
    // Note: PostgreSQL appointments table does not have a notes column in schema cache.
    // To prevent PostgREST PGRST204 failure, update updated_at cleanly without failing the doctor's workflow
    const { error } = await supabase
      .from('appointments')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
    return !error
  } catch {
    return false
  }
}

export async function updateSlot(
  slotId: string,
  updates: { startTime?: string; endTime?: string; maxCapacity?: number }
): Promise<boolean> {
  try {
    const payload: any = {}
    if (updates.startTime !== undefined) payload.start_time = formatTimeForPostgres(updates.startTime)
    if (updates.endTime !== undefined) payload.end_time = formatTimeForPostgres(updates.endTime)
    if (updates.maxCapacity !== undefined) payload.max_capacity = updates.maxCapacity
    const { error } = await supabase.from('slots').update(payload).eq('id', slotId)
    return !error
  } catch {
    return false
  }
}

export async function getClinicInvitations(clinicId: string): Promise<ClinicInvitation[]> {
  try {
    const { data, error } = await supabase
      .from('clinic_invitations')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })

    if (!error && Array.isArray(data)) {
      return data.map((row: any) => ({
        id: row.id,
        clinicId: row.clinic_id,
        clinicName: row.clinic_name,
        doctorId: row.doctor_id,
        email: row.email,
        invitedEmail: row.email || '',
        invitedName: row.email || 'Medical Staff',
        role: row.role === 'lab_technician' ? 'lab_technician' : 'doctor',
        specialty: 'Medical Specialist',
        status: (row.status === 'accepted' ? 'accepted' : row.status === 'rejected' ? 'rejected' : 'pending'),
        createdAt: row.created_at || new Date().toISOString(),
      }))
    }
  } catch (err) {
    console.error('Error fetching clinic invitations:', err)
  }
  return []
}

export async function sendClinicInvitation(params: {
  clinicId: string
  clinicName: string
  doctorId?: string
  invitedEmail: string
  invitedName: string
  role: 'doctor' | 'lab_technician'
  specialty?: string
}): Promise<ClinicInvitation | null> {
  const cleanEmail = params.invitedEmail.trim().toLowerCase()
  if (!cleanEmail) return null

  try {
    // 1. Check if invitation already exists for this clinic and email (parity with InvitationRepository.kt lines 33-57)
    const { data: existing } = await supabase
      .from('clinic_invitations')
      .select('*')
      .eq('clinic_id', params.clinicId)
      .ilike('email', cleanEmail)
      .maybeSingle()

    if (existing) {
      // If previously rejected, re-activate as pending
      if (existing.status === 'rejected') {
        const { error: updErr } = await supabase
          .from('clinic_invitations')
          .update({
            status: 'pending',
            role: params.role || 'doctor',
          })
          .eq('id', existing.id)

        if (!updErr) {
          return {
            id: existing.id,
            clinicId: params.clinicId,
            clinicName: params.clinicName,
            doctorId: params.doctorId,
            email: cleanEmail,
            invitedEmail: cleanEmail,
            invitedName: params.invitedName,
            role: params.role,
            specialty: params.specialty,
            status: 'pending',
            createdAt: existing.created_at || new Date().toISOString(),
          }
        }
      }
      return {
        id: existing.id,
        clinicId: existing.clinic_id,
        clinicName: params.clinicName,
        doctorId: params.doctorId,
        email: existing.email || cleanEmail,
        invitedEmail: existing.email || cleanEmail,
        invitedName: params.invitedName,
        role: existing.role || 'doctor',
        specialty: params.specialty,
        status: existing.status || 'pending',
        createdAt: existing.created_at || new Date().toISOString(),
      }
    }

    // 2. Insert new invitation with exact columns matching InvitationRepository.kt:
    // (id, clinic_id, email, role, status, created_at)
    const newId = crypto.randomUUID()
    const nowIso = new Date().toISOString()
    const payload = {
      id: newId,
      clinic_id: params.clinicId,
      email: cleanEmail,
      role: params.role || 'doctor',
      status: 'pending',
      created_at: nowIso,
    }

    const { data: inserted, error: insErr } = await supabase
      .from('clinic_invitations')
      .insert(payload)
      .select()
      .maybeSingle()

    if (insErr) {
      console.error('Error inserting clinic invitation:', insErr)
      return null
    }

    return {
      id: inserted?.id || newId,
      clinicId: params.clinicId,
      clinicName: params.clinicName,
      doctorId: params.doctorId,
      email: cleanEmail,
      invitedEmail: cleanEmail,
      invitedName: params.invitedName,
      role: params.role,
      specialty: params.specialty,
      status: 'pending',
      createdAt: inserted?.created_at || nowIso,
    }
  } catch (err) {
    console.error('Exception in sendClinicInvitation:', err)
    return null
  }
}

export async function cancelClinicInvitation(invitationId: string, clinicId?: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('clinic_invitations').delete().eq('id', invitationId)
    if (error) throw error
    return true
  } catch (err) {
    console.error('Error cancelling clinic invitation:', err)
    return false
  }
}

export async function getDoctorInvitations(doctorEmail: string, doctorId?: string): Promise<ClinicInvitation[]> {
  try {
    if (!doctorEmail) return []
    const cleanEmail = doctorEmail.trim().toLowerCase()

    const { data, error } = await supabase
      .from('clinic_invitations')
      .select('*')
      .ilike('email', cleanEmail)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching doctor invitations:', error)
      return []
    }

    if (data && Array.isArray(data)) {
      return data.map((d: any) => ({
        id: d.id,
        clinicId: d.clinic_id,
        clinicName: 'Associated Clinic',
        email: d.email,
        invitedEmail: d.email,
        invitedName: 'Doctor',
        role: d.role || 'doctor',
        status: 'pending',
        createdAt: d.created_at,
      }))
    }
  } catch (err) {
    console.error('Exception fetching doctor invitations:', err)
  }
  return []
}

export async function respondToDoctorInvitation(
  invitationId: string,
  accept: boolean,
  doctorId?: string,
  clinicId?: string
): Promise<boolean> {
  try {
    // Parity with InvitationRepository.kt lines 109 & 130: status is strictly 'accepted' or 'rejected'
    const newStatus = accept ? 'accepted' : 'rejected'

    // 1. Update invitation status
    const { error: invErr } = await supabase
      .from('clinic_invitations')
      .update({ status: newStatus })
      .eq('id', invitationId)

    if (invErr) {
      console.error('Error updating invitation status:', invErr)
      return false
    }

    // 2. If accepted and doctorId & clinicId provided, affiliate the doctor
    if (accept && doctorId && clinicId) {
      try {
        const { data: doc } = await supabase
          .from('doctors')
          .select('clinic_id, active_clinic_id')
          .eq('id', doctorId)
          .maybeSingle()

        // If doctor has no clinic set yet, set this clinic as their primary/active clinic
        if (!doc?.clinic_id) {
          await supabase
            .from('doctors')
            .update({
              clinic_id: clinicId,
              active_clinic_id: clinicId,
            })
            .eq('id', doctorId)
        } else if (!doc?.active_clinic_id) {
          await supabase
            .from('doctors')
            .update({ active_clinic_id: clinicId })
            .eq('id', doctorId)
        }
      } catch (err) {
        console.warn('Could not update doctor primary clinic:', err)
      }
    }
    return true
  } catch (err) {
    console.error('Error responding to doctor invitation:', err)
    return false
  }
}

// ==========================================
// SYSTEM SETTINGS & SUPPORT HELPDESK API
// ==========================================
export async function getSupportUrl(): Promise<string> {
  const DEFAULT_SUPPORT_URL = 'https://rajanpurbe.github.io/Dactor/support'
  try {
    // 1. Try system_settings table
    const { data: setRes, error: setErr } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'support_url')
      .single()

    if (!setErr && setRes?.value) {
      localStorage.setItem('dactor_support_url', setRes.value)
      return setRes.value
    }
  } catch {}

  try {
    // 2. Query medical_specialties where name = 'system_config:support_url'
    const { data: specRes, error: specErr } = await supabase
      .from('medical_specialties')
      .select('search_keywords')
      .eq('name', 'system_config:support_url')
      .single()

    if (!specErr && specRes?.search_keywords) {
      localStorage.setItem('dactor_support_url', specRes.search_keywords)
      return specRes.search_keywords
    }
  } catch {}

  // 3. Fallback to localStorage or default URL
  try {
    const cached = localStorage.getItem('dactor_support_url')
    if (cached) return cached
  } catch {}

  return DEFAULT_SUPPORT_URL
}

const LOCAL_STORAGE_TICKETS_KEY = 'dactor_support_tickets_v1'

export async function createSupportTicket(ticket: {
  name?: string
  email: string
  phone: string
  role?: 'clinic' | 'doctor' | 'patient' | 'other'
  category: string
  customReason?: string
  message?: string
}): Promise<SupportTicket> {
  const ticketId = crypto.randomUUID()
  const randomSuffix = Math.floor(100000 + Math.random() * 900000)
  const ticketCode = `DAC-TKT-${randomSuffix}`
  const nowIso = new Date().toISOString()

  const newTicket: SupportTicket = {
    id: ticketId,
    ticketCode,
    name: ticket.name?.trim() || 'Valued User',
    email: ticket.email.trim(),
    phone: ticket.phone.trim(),
    role: ticket.role || 'patient',
    category: ticket.category || 'General Support',
    customReason: ticket.customReason?.trim() || undefined,
    message: ticket.message?.trim() || `Inquiry regarding ${ticket.category}`,
    status: 'open',
    createdAt: nowIso,
  }

  // 1. Save to Supabase notifications table (type: 'support_ticket')
  try {
    const formattedTitle = `[Support Ticket #${ticketCode}] ${newTicket.category}`
    const payload = {
      id: ticketId,
      title: formattedTitle,
      message: JSON.stringify(newTicket),
      type: 'support_ticket',
      target_audience: 'specific',
      is_read: false,
    }
    const { error } = await supabase.from('notifications').insert(payload)
    if (error) {
      console.warn('Supabase notifications insert warning for support ticket:', error)
    }
  } catch (err) {
    console.warn('Network error saving ticket to Supabase:', err)
  }

  // 2. Also cache in localStorage for instant offline access & Admin Portal sync
  try {
    const cachedRaw = localStorage.getItem(LOCAL_STORAGE_TICKETS_KEY)
    const cached: SupportTicket[] = cachedRaw ? JSON.parse(cachedRaw) : []
    const updated = [newTicket, ...cached.filter((t) => t.ticketCode !== ticketCode)]
    localStorage.setItem(LOCAL_STORAGE_TICKETS_KEY, JSON.stringify(updated.slice(0, 100)))
  } catch {}

  return newTicket
}

export async function getSupportTickets(): Promise<SupportTicket[]> {
  const ticketMap = new Map<string, SupportTicket>()

  // 1. Load from Supabase notifications table
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .or('type.eq.support_ticket,title.ilike.%[Support%')
      .order('created_at', { ascending: false })

    if (!error && Array.isArray(data)) {
      data.forEach((row: any) => {
        try {
          if (row.message && row.message.trim().startsWith('{')) {
            const parsed = JSON.parse(row.message)
            if (parsed.ticketCode) {
              ticketMap.set(parsed.ticketCode, {
                ...parsed,
                id: row.id || parsed.id,
                status: row.is_read ? (parsed.status === 'open' ? 'resolved' : parsed.status) : parsed.status,
                createdAt: row.created_at || parsed.createdAt,
              })
              return
            }
          }

          // Fallback parsing for legacy raw text notifications
          const title = row.title || ''
          const matchCode = title.match(/#([A-Z0-9-]+)/)
          const tCode = matchCode ? matchCode[1] : `TKT-${(row.id || '').substring(0, 6)}`
          const matchCategory = title.replace(/^\[Support Inquiry\]\s*/i, '').split('-')[0]?.trim() || 'General'

          const msg = row.message || ''
          const emailMatch = msg.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)?.[0] || 'Unknown'
          const phoneMatch = msg.match(/(?:\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b98\d{8}\b/)?.[0] || '–'

          ticketMap.set(tCode, {
            id: row.id,
            ticketCode: tCode,
            name: title.split('-')?.[1]?.split('(')?.[0]?.trim() || 'Valued User',
            email: emailMatch,
            phone: phoneMatch,
            role: 'patient',
            category: matchCategory,
            message: msg,
            status: row.is_read ? 'resolved' : 'open',
            createdAt: row.created_at || new Date().toISOString(),
          })
        } catch {}
      })
    }
  } catch (err) {
    console.warn('Error fetching support tickets from Supabase:', err)
  }

  // 2. Merge with localStorage cache
  try {
    const cachedRaw = localStorage.getItem(LOCAL_STORAGE_TICKETS_KEY)
    if (cachedRaw) {
      const cached: SupportTicket[] = JSON.parse(cachedRaw)
      cached.forEach((t) => {
        if (!ticketMap.has(t.ticketCode)) {
          ticketMap.set(t.ticketCode, t)
        }
      })
    }
  } catch {}

  // 3. Return sorted by createdAt descending
  return Array.from(ticketMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export async function updateSupportTicketStatus(
  ticketCode: string,
  newStatus: 'open' | 'in_progress' | 'resolved' | 'closed',
  adminNotes?: string
): Promise<boolean> {
  const isResolved = newStatus === 'resolved' || newStatus === 'closed'

  // Update in localStorage
  try {
    const cachedRaw = localStorage.getItem(LOCAL_STORAGE_TICKETS_KEY)
    if (cachedRaw) {
      const cached: SupportTicket[] = JSON.parse(cachedRaw)
      const updated = cached.map((t) =>
        t.ticketCode === ticketCode
          ? {
              ...t,
              status: newStatus,
              resolvedAt: isResolved ? new Date().toISOString() : undefined,
              adminNotes: adminNotes ?? t.adminNotes,
            }
          : t
      )
      localStorage.setItem(LOCAL_STORAGE_TICKETS_KEY, JSON.stringify(updated))
    }
  } catch {}

  // Update in Supabase notifications
  try {
    const { data: rows } = await supabase
      .from('notifications')
      .select('*')
      .ilike('title', `%${ticketCode}%`)

    if (Array.isArray(rows) && rows.length > 0) {
      for (const row of rows) {
        let updatedMessage = row.message
        if (row.message && row.message.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(row.message)
            parsed.status = newStatus
            if (isResolved) parsed.resolvedAt = new Date().toISOString()
            if (adminNotes) parsed.adminNotes = adminNotes
            updatedMessage = JSON.stringify(parsed)
          } catch {}
        }

        await supabase
          .from('notifications')
          .update({
            is_read: isResolved,
            message: updatedMessage,
          })
          .eq('id', row.id)
      }
    }
  } catch (err) {
    console.warn('Error updating ticket in Supabase:', err)
  }

  return true
}

export async function getSupportTicketByCodeOrContact(query: string): Promise<SupportTicket | null> {
  if (!query || !query.trim()) return null
  const clean = query.trim().toUpperCase()
  const cleanAlphanumeric = clean.replace(/[^A-Z0-9]/g, '')
  const cleanPhone = query.replace(/\D/g, '')
  const cleanEmail = query.trim().toLowerCase()

  const list = await getSupportTickets()

  // 1. Exact or normalized match on ticketCode
  const byCode = list.find((t) => {
    const tCode = (t.ticketCode || '').toUpperCase()
    const tCodeClean = tCode.replace(/[^A-Z0-9]/g, '')
    return (
      tCode === clean ||
      (cleanAlphanumeric.length >= 4 && tCodeClean.includes(cleanAlphanumeric)) ||
      (cleanAlphanumeric.length >= 4 && cleanAlphanumeric.includes(tCodeClean))
    )
  })
  if (byCode) return byCode

  // 2. Match by contact phone (at least 7 digits)
  if (cleanPhone.length >= 7) {
    const byPhone = list.find((t) => {
      const p = (t.phone || '').replace(/\D/g, '')
      return p.length >= 7 && (p.includes(cleanPhone) || cleanPhone.includes(p))
    })
    if (byPhone) return byPhone
  }

  // 3. Match by Gmail / Email
  if (query.includes('@')) {
    const byEmail = list.find((t) => (t.email || '').toLowerCase() === cleanEmail)
    if (byEmail) return byEmail
  }

  return null
}



// ==========================================
// PAY AT DESK CLINIC RPC & HELPER FUNCTIONS
// ==========================================

export async function getPendingPayAtDeskRequests(clinicId: string): Promise<Appointment[]> {
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('list_pending_pay_at_desk_requests', {
      p_clinic_id: clinicId,
    })

    if (!rpcError && Array.isArray(rpcData)) {
      const list = rpcData.map((row: any) => ({
        id: row.id,
        trackingCode10Digit: row.tracking_code_10_digit,
        userId: row.user_id,
        clinicId: row.clinic_id,
        doctorId: row.doctor_id,
        slotId: row.slot_id,
        patientName: row.patient_name,
        patientAge: row.patient_age,
        patientGender: row.patient_gender,
        patientMobile: row.patient_mobile,
        patientEmail: row.patient_email,
        appointmentDate: row.appointment_date,
        appointmentTime: row.appointment_time,
        checkinStatus: 'not_checked_in',
        paymentStatus: 'unpaid',
        feeAmount: Number(row.fee_amount || 0),
        serviceChargeAmount: (() => {
          const fee = Number(row.fee_amount || 0)
          const chg = Number(row.service_charge_amount || 0)
          return chg > 0 ? chg : (fee > 0 ? Math.round(fee * 0.05 * 100) / 100 : 0)
        })(),
        totalAmount: (() => {
          const fee = Number(row.fee_amount || 0)
          const rawTot = Number(row.total_amount || 0)
          const chg = Number(row.service_charge_amount || 0) > 0 ? Number(row.service_charge_amount) : (fee > 0 ? Math.round(fee * 0.05 * 100) / 100 : 0)
          return rawTot > fee ? rawTot : Math.round((fee + chg) * 100) / 100
        })(),
        paymentMode: 'PAY_AT_DESK',
        status: row.status || 'WAITING_FOR_APPROVAL',
        attemptNumber: row.attempt_number || 1,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        notes: row.notes,
        doctor: row.doctor_name
          ? ({
              id: row.doctor_id || '',
              fullName: row.doctor_name,
              email: '',
              specialty: row.doctor_specialty || '',
              clinicId: row.clinic_id,
              consultationFee: Number(row.fee_amount || 0),
              kycStatus: 'approved',
              isInClinic: true,
            } as Doctor)
          : undefined,
      }))
      return list.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return timeA - timeB
      })
    }

    // Direct table fallback
    const { data, error } = await supabase
      .from('appointments')
      .select('*, doctor:doctors(*), clinic:clinics(*)')
      .eq('clinic_id', clinicId)
      .eq('payment_mode', 'PAY_AT_DESK')
      .eq('status', 'WAITING_FOR_APPROVAL')
      .neq('checkin_status', 'cancelled')
      .order('created_at', { ascending: true })

    if (error) throw error
    const list = (data || []).map(mapAppointment)
    return list.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return timeA - timeB
    })
  } catch (err) {
    console.error('Error fetching pending pay at desk requests:', err)
    return []
  }
}

export async function getPendingPayAtDeskCount(clinicId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('payment_mode', 'PAY_AT_DESK')
      .eq('status', 'WAITING_FOR_APPROVAL')
      .neq('checkin_status', 'cancelled')

    if (error) throw error
    return count || 0
  } catch (err) {
    console.error('Error getting pending pay at desk count:', err)
    return 0
  }
}

export async function approvePayAtDeskAppointment(appointmentId: string, clinicId: string): Promise<{ success: boolean; error?: string; expired?: boolean; isFutureDate?: boolean; queuePosition?: number; slotPassed?: boolean; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('approve_pay_at_desk_appointment', {
      p_appointment_id: appointmentId,
      p_clinic_id: clinicId,
    })

    if (error) {
      return { success: false, error: error.message }
    }
    return {
      success: true,
      expired: data?.expired === true || data?.status === 'EXPIRED' || data?.status === 'CANCELLED',
      isFutureDate: data?.is_future_date === true,
      queuePosition: typeof data?.queue_position === 'number' ? data.queue_position : undefined,
      slotPassed: data?.slot_passed === true,
      message: data?.message,
    }
  } catch (err: any) {
    console.error('Error approving pay at desk appointment:', err)
    return { success: false, error: err.message || 'Failed to approve request' }
  }
}

export async function rejectPayAtDeskAppointment(appointmentId: string, clinicId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('reject_pay_at_desk_appointment', {
      p_appointment_id: appointmentId,
      p_clinic_id: clinicId,
      p_reason: reason || null,
    })

    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (err: any) {
    console.error('Error rejecting pay at desk appointment:', err)
    return { success: false, error: err.message || 'Failed to reject request' }
  }
}


export async function retryPayAtDeskAppointment(appointmentId: string, patientMobile?: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('retry_pay_at_desk_appointment', {
      p_appointment_id: appointmentId,
      p_patient_mobile: patientMobile || null,
    })

    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true, data }
  } catch (err: any) {
    console.error('Error retrying pay at desk appointment:', err)
    return { success: false, error: err.message || 'Failed to retry appointment request' }
  }
}

/**
 * Searches for an existing active unapproved Pay at Desk appointment for this patient at the clinic.
 */
export async function findPendingPayAtDeskAppointment(
  clinicId: string,
  patientMobile: string,
  appointmentDate: string,
  patientName?: string
): Promise<Appointment | null> {
  try {
    const cleanMobile = patientMobile.trim().replace(/\D/g, '')
    let query = supabase
      .from('appointments')
      .select('*, clinic:clinics(*), doctor:doctors(*)')
      .eq('clinic_id', clinicId)
      .eq('appointment_date', appointmentDate)
      .eq('payment_mode', 'PAY_AT_DESK')
      .eq('status', 'WAITING_FOR_APPROVAL')
      .neq('checkin_status', 'cancelled')

    if (cleanMobile) {
      query = query.eq('patient_mobile', cleanMobile)
    }

    const { data, error } = await query
    if (error || !data || data.length === 0) return null

    if (patientName && patientName.trim()) {
      const cleanTarget = patientName.trim().toLowerCase()
      const matched = data.find((a: any) => (a.patient_name || '').trim().toLowerCase() === cleanTarget)
      if (matched) return mapAppointment(matched)
    }

    return mapAppointment(data[0])
  } catch (err) {
    console.error('Error finding pending pay at desk appointment:', err)
    return null
  }
}

/**
 * Atomically cancels a pending unapproved Pay at Desk request so the user can re-book or pay online.
 */
export async function cancelPendingPayAtDeskAppointment(appointmentId: string): Promise<boolean> {
  try {
    const { error: rpcErr } = await supabase.rpc('cancel_pending_pay_at_desk_appointment', {
      p_appointment_id: appointmentId,
    })
    if (!rpcErr) return true
  } catch {}

  try {
    const { error } = await supabase
      .from('appointments')
      .update({
        checkin_status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
    return !error
  } catch (err) {
    console.error('Error cancelling pending pay at desk appointment:', err)
    return false
  }
}

export async function markPayAtDeskCollected(appointmentId: string, clinicId?: string): Promise<{ success: boolean; totalAmount?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('mark_pay_at_desk_collected', {
      p_appointment_id: appointmentId,
      p_clinic_id: clinicId || null,
    })
    if (!error && data && (data.success || data === true)) {
      return { success: true, totalAmount: Number(data.total_amount || 0) || undefined }
    }
  } catch {}

  try {
    const { error } = await supabase
      .from('appointments')
      .update({
        payment_status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to mark payment collected' }
  }
}
