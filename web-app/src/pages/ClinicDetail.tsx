import React, { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Phone,
  Clock,
  Calendar,
  CheckCircle2,
  Stethoscope,
  FlaskConical,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  CreditCard,
  Download,
  RefreshCw,
  Building2,
  ExternalLink,
  UserCheck,
  History,
  Info,
  Check,
  Share2,
  Layers,
  Lock,
  QrCode,
  Store,
} from 'lucide-react'
import { Clinic, Doctor, ClinicService, Slot, Appointment, PaymentGatewaysConfig, OnlineGatewayId, PAY_AT_DESK_SERVICE_CHARGE_PERCENT } from '../types'
import {
  getClinicById,
  getDoctorsByClinic,
  getClinicServices,
  getSlots,
  getMonthSlots,
  createAppointment,
  generate10DigitTrackingCode,
  isSlotTimeExpired,
  getClinicPaymentConfig,
  recordPaymentTransaction,
  getPatientProfileByEmail,
  getAppointmentByTrackingCode,
  getAppointmentByTrackingCodeOrContact,
  shiftAppointmentDate,
  getAppointmentById,
  startOnlinePayment,
  refreshOnlinePayment,
  initiateOnlinePaymentPhase,
  cancelPendingAppointment,
  findPendingPayAtDeskAppointment,
  cancelPendingPayAtDeskAppointment,
  isDiagnosticLabClinic,
} from '../services/db'
import { supabase } from '../lib/supabase'
import { updatePageSEO } from '../utils/seo'
import { escapeHtml } from '../utils/html'
import { MapLibreLocationViewer } from '../components/MapLibreLocationViewer'

interface ClinicDetailProps {
  clinicId: string
  initialDoctorId?: string
  autoOpenBooking?: boolean
  initialTrackingCode?: string
  isReschedule?: boolean
  onBack: () => void
  onOpenLiveQueue: (trackingCode: string) => void
  onNavigate?: (tab: string, params?: any) => void
}

export const ClinicDetail: React.FC<ClinicDetailProps> = ({
  clinicId,
  initialDoctorId,
  autoOpenBooking,
  initialTrackingCode,
  isReschedule,
  onBack,
  onOpenLiveQueue,
  onNavigate,
}) => {
  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [services, setServices] = useState<ClinicService[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [paymentConfig, setPaymentConfig] = useState<PaymentGatewaysConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMapModal, setShowMapModal] = useState<boolean>(false)

  // Active view tab: 'opd' or 'lab'
  const [activeTab, setActiveTab] = useState<'opd' | 'lab'>('opd')

  // Photo Carousel State (Parity with Mobile App ClinicDetailScreen)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)

  // Auto-advance photo carousel every 3.5 seconds if multiple photos exist
  useEffect(() => {
    if (clinic?.pictures && clinic.pictures.length > 1) {
      const interval = setInterval(() => {
        setSelectedPhotoIndex((prev) => (prev + 1) % clinic.pictures.length)
      }, 3500)
      return () => clearInterval(interval)
    }
  }, [clinic?.pictures])

  // OPD Selection
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [selectedSlotTime, setSelectedSlotTime] = useState<string>('')
  const [selectedSlotId, setSelectedSlotId] = useState<string | undefined>(undefined)

  // Follow-Up (Multi-Visit Polyclinic) & Reschedule
  const [isReturningPatient, setIsReturningPatient] = useState(() => Boolean(isReschedule && initialTrackingCode))
  const [followupCodeInput, setFollowupCodeInput] = useState(() => (isReschedule && initialTrackingCode ? initialTrackingCode : ''))
  const [retainedAppointment, setRetainedAppointment] = useState<Appointment | null>(null)
  const [isLookingUpCode, setIsLookingUpCode] = useState(false)
  const [followupLookupError, setFollowupLookupError] = useState<string | null>(null)

  // Stable Idempotency Key per booking attempt session
  const [bookingDraftId, setBookingDraftId] = useState<string>(() => crypto.randomUUID())

  // Diagnostic Lab Selection
  const [selectedTests, setSelectedTests] = useState<{ [serviceId: string]: boolean }>({})

  // Doctor in-clinic presence validator for this specific clinic
  const isDoctorInThisClinic = (doc?: Doctor | null): boolean => {
    if (!doc) return false
    if (doc.isInClinic === false) return false
    if (doc.activeClinicId && clinic?.id && doc.activeClinicId !== clinic.id) return false
    return true
  }

  // Booking Modal & Step ('details' | 'payment')
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [bookingStep, setBookingStep] = useState<'details' | 'payment'>('details')
  const [patientName, setPatientName] = useState('')
  const [patientAge, setPatientAge] = useState('')
  const [patientGender, setPatientGender] = useState('Male')
  const [patientMobile, setPatientMobile] = useState('')
  const [patientEmail, setPatientEmail] = useState('')
  const [patientUserId, setPatientUserId] = useState<string | undefined>(undefined)
  const [patientNotes, setPatientNotes] = useState('')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    OnlineGatewayId | 'bypass' | 'pay_at_clinic' | 'pay_at_desk'
  >('pay_at_desk')
  const [paymentCountdown, setPaymentCountdown] = useState(300)
  const [paymentInitiated, setPaymentInitiated] = useState(false)
  const [createdPendingApptId, setCreatedPendingApptId] = useState<string | null>(null)
  const [pendingPayAtDeskAppt, setPendingPayAtDeskAppt] = useState<Appointment | null>(null)
  const [showPendingPayAtDeskModal, setShowPendingPayAtDeskModal] = useState(false)
  const [isCancellingPendingDesk, setIsCancellingPendingDesk] = useState(false)
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({})
  const [submitting, setSubmitting] = useState(false)

  // Saved profile option (only used if patient explicitly clicks "Use Saved Profile")
  const [savedProfile, setSavedProfile] = useState<{
    id?: string
    fullName: string
    age: number
    gender: string
    phone: string
    email: string
  } | null>(null)

  // Booking Success
  const [confirmedAppt, setConfirmedAppt] = useState<Appointment | null>(null)
  const [confirmedTxnId, setConfirmedTxnId] = useState<string>('')
  const [confirmedPayMethod, setConfirmedPayMethod] = useState<string>('')

  // Share Clinic Profile
  const [copiedShareLink, setCopiedShareLink] = useState(false)

  const handleShareClinic = async () => {
    const targetClinicId = clinic?.id || clinicId
    const origin = typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://dactorofficial.github.io'
    let pathname = typeof window !== 'undefined' ? window.location.pathname : '/dactor/'
    if (!pathname.endsWith('/')) {
      pathname = pathname + '/'
    }
    const clinicUrl = `${origin}${pathname}?clinic=${targetClinicId}`
    const clinicTitle = clinic?.name ? `${clinic.name} - Dactor Nepal` : 'Dactor Nepal Clinic Profile'
    const locationPart = clinic?.addressText ? ` (${clinic.addressText})` : ''
    const clinicText = `Check out ${clinic?.name || 'this clinic'}${locationPart} on Dactor Nepal. Book doctor appointments and track realtime OPD queue live:`

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: clinicTitle,
          text: clinicText,
          url: clinicUrl,
        })
        return
      } catch (err: any) {
        if (err.name === 'AbortError') return
      }
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(clinicUrl)
        setCopiedShareLink(true)
        setTimeout(() => setCopiedShareLink(false), 2500)
      } else {
        window.prompt('Copy clinic profile link:', clinicUrl)
      }
    } catch {
      window.prompt('Copy clinic profile link:', clinicUrl)
    }
  }

  // Load clinic, doctors, lab services, and payment config from Supabase
  const loadClinicData = async () => {
    try {
      const [cData, dData, sData, payCfg] = await Promise.all([
        getClinicById(clinicId),
        getDoctorsByClinic(clinicId),
        getClinicServices(clinicId),
        getClinicPaymentConfig(clinicId),
      ])

      setClinic(cData)
      setDoctors(dData)
      // Strictly use real services from Supabase — NO demo tests
      setServices(sData)
      setPaymentConfig(payCfg)
      if (payCfg?.availableMethods && payCfg.availableMethods.length > 0) {
        const firstVerified = payCfg.availableMethods.find((m) => m.is_verified)?.id
        if (firstVerified) setSelectedPaymentMethod(firstVerified)
      }

      const isLab =
        cData?.type === 'diagnostic_lab' ||
        cData?.type?.toLowerCase().includes('lab') ||
        cData?.name.toLowerCase().includes('lab') ||
        (cData?.specialties?.some(
          (s) => s.toLowerCase().includes('lab') || s.toLowerCase().includes('patholog')
        ) ?? false)

      if (isLab) {
        setActiveTab('lab')
      } else {
        setActiveTab('opd')
      }

      if (initialDoctorId) {
        const found = dData.find(
          (d) =>
            d.id === initialDoctorId ||
            d.fullName.toLowerCase().includes(initialDoctorId.toLowerCase())
        )
        if (found) {
          setSelectedDoctor(found)
        } else if (dData.length > 0 && !selectedDoctor && !isLab) {
          setSelectedDoctor(dData[0])
        }
      } else if (dData.length > 0 && !selectedDoctor && !isLab) {
        setSelectedDoctor(dData[0])
      }

      // Restore pending booking redirect if returning from login
      try {
        const pendingRaw = localStorage.getItem('dactor_pending_booking_redirect')
        if (pendingRaw) {
          const parsed = JSON.parse(pendingRaw)
          if (parsed.clinicId === clinicId) {
            if (parsed.bookingDate) setSelectedDate(parsed.bookingDate)
            if (parsed.selectedSlotTime) setSelectedSlotTime(parsed.selectedSlotTime)
            if (parsed.selectedSlotId) setSelectedSlotId(parsed.selectedSlotId)
            if (parsed.bookingMode) setActiveTab(parsed.bookingMode)
            if (parsed.doctorId && dData.length > 0) {
              const matchedDoc = dData.find((d: any) => d.id === parsed.doctorId)
              if (matchedDoc) setSelectedDoctor(matchedDoc)
            }
            if (parsed.selectedLabTestIds && Array.isArray(parsed.selectedLabTestIds)) {
              const testMap: Record<string, boolean> = {}
              parsed.selectedLabTestIds.forEach((id: string) => {
                testMap[id] = true
              })
              setSelectedTests(testMap)
            }
            localStorage.removeItem('dactor_pending_booking_redirect')
            localStorage.removeItem('dactor_booking_login_notice')
          }
        }
      } catch {}

      if (autoOpenBooking) {
        if (isReschedule || initialDoctorId || !selectedSlotId) {
          setTimeout(() => {
            const el = document.getElementById('booking-schedule')
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 300)
          return
        }
        const isUserLoggedIn = Boolean(
          localStorage.getItem('dactor_patient_session') ||
            localStorage.getItem('dactor_patient_logged_in') === 'true'
        )
        if (!isUserLoggedIn) {
          const pendingData = {
            clinicId,
            doctorId: selectedDoctor?.id || initialDoctorId,
            selectedSlotId,
            selectedSlotTime,
            bookingDate: selectedDate,
            bookingMode: activeTab === 'lab' ? 'lab' : 'opd',
            selectedLabTestIds: selectedTestList.map((t) => t.id),
            isReturningPatient,
            followupCodeInput,
            isReschedule,
            retainedAppointment,
            returnRoute: 'clinic-detail',
          }
          try {
            localStorage.setItem('dactor_pending_booking_redirect', JSON.stringify(pendingData))
            localStorage.setItem('dactor_booking_login_notice', 'Please sign in with Google to book an appointment')
          } catch {}

          if (onNavigate) {
            onNavigate('login')
          } else {
            window.location.hash = '#login'
          }
          return
        }
        setShowBookingModal(true)
      }
    } catch (err) {
      console.error('Failed to load clinic details:', err)
    } finally {
      setLoading(false)
    }
  }

  // Synchronize Google & AI Search SEO with active Clinic & Doctor
  useEffect(() => {
    if (!clinic) return

    const pageTitle = selectedDoctor
      ? `Book Dr. ${selectedDoctor.fullName} (${selectedDoctor.specialty || 'Specialist'}) at ${clinic.name} | Dactor Nepal`
      : `Book Appointment - ${clinic.name} | Live OPD Queue & Doctors - Dactor`

    const pageDesc = selectedDoctor
      ? `Book online appointment with Dr. ${selectedDoctor.fullName} (${selectedDoctor.specialty || 'Doctor'}) at ${clinic.name}, ${clinic.city || 'Nepal'}. Track live queue token numbers and estimated wait times on Dactor.`
      : `Book doctor appointments, OPD tokens, and diagnostic tests at ${clinic.name}, ${clinic.city || 'Nepal'}. Real-time patient token tracker and wait time estimation on Dactor.`

    updatePageSEO({
      title: pageTitle,
      description: pageDesc,
      canonicalUrl: `https://dactorofficial.github.io/dactor/?clinic=${clinic.id}${selectedDoctor ? `&doctor=${selectedDoctor.id}` : ''}`,
      clinic,
      doctor: selectedDoctor,
      allDoctors: doctors,
    })

    return () => {
      updatePageSEO({
        title: "Dactor - Nepal's Realtime Healthcare OPD Queue, Clinic Portal & Lab Ecosystem",
        description: "Dactor connects patients, clinics, polyclinics, and diagnostic pathology labs across Nepal. Track live OPD token queue numbers, calculate estimated wait times, book doctor appointments, order diagnostic tests, and download certified medical reports.",
        canonicalUrl: 'https://dactorofficial.github.io/dactor/',
      })
    }
  }, [clinic, selectedDoctor, doctors])

  // 3 Clinic Types Classification
  const isLabClinic = useMemo(() => isDiagnosticLabClinic(clinic), [clinic])

  const isSingleDoctorClinic = useMemo(() => {
    if (isLabClinic) return false
    return (
      clinic?.type === 'single_visit' ||
      clinic?.type === 'single_doctor' ||
      doctors.length === 1
    )
  }, [isLabClinic, clinic?.type, doctors.length])

  const isPolyclinic = useMemo(() => {
    return !isLabClinic && !isSingleDoctorClinic
  }, [isLabClinic, isSingleDoctorClinic])

  // Auto-bind single doctor if Single Doctor clinic
  useEffect(() => {
    if (isSingleDoctorClinic && doctors.length > 0) {
      setSelectedDoctor(doctors[0])
    }
  }, [isSingleDoctorClinic, doctors])

  // Lock patient details when booking follow-up or rescheduling with a retained appointment
  const isLockedDetails = useMemo(() => {
    return Boolean((isReturningPatient && retainedAppointment) || (isReschedule && retainedAppointment))
  }, [isReturningPatient, retainedAppointment, isReschedule])

  // Sync initialTrackingCode prop changes - only auto-activate if explicitly in reschedule mode
  useEffect(() => {
    if (initialTrackingCode && isReschedule) {
      setIsReturningPatient(true)
      setFollowupCodeInput(initialTrackingCode)
    }
  }, [initialTrackingCode, isReschedule])

  // Lookup 10-digit Appointment ID or UUID for Follow-up or Reschedule
  useEffect(() => {
    let active = true
    const clean = followupCodeInput.trim()
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isCodeValid = /^\d{10}$/.test(clean) || uuidRegex.test(clean)
    if ((isReturningPatient || isReschedule) && isCodeValid) {
      setIsLookingUpCode(true)
      setFollowupLookupError(null)
      getAppointmentByTrackingCodeOrContact(clean)
        .then((found) => {
          if (!active) return
          setIsLookingUpCode(false)
          if (found) {
            setRetainedAppointment(found)
            setPatientName(found.patientName)
            setPatientAge(String(found.patientAge || ''))
            setPatientGender(found.patientGender || '')
            setPatientMobile(found.patientMobile || '')
            if (found.patientEmail) setPatientEmail(found.patientEmail)
            setFormErrors({})
            // Auto-select doctor from existing appointment if present
            if (found.doctorId && doctors.length > 0) {
              const matchedDoc = doctors.find((d) => d.id === found.doctorId)
              if (matchedDoc) setSelectedDoctor(matchedDoc)
            }
          } else {
            setRetainedAppointment(null)
            setFollowupLookupError(`No appointment record found for code #${clean}.`)
          }
        })
        .catch(() => {
          if (!active) return
          setIsLookingUpCode(false)
          setRetainedAppointment(null)
          setFollowupLookupError('Failed to lookup appointment tracking code.')
        })
    } else {
      setRetainedAppointment(null)
      if (clean.length > 0 && !isCodeValid) {
        setFollowupLookupError('Code must be a 10-digit number or valid appointment ID.')
      } else {
        setFollowupLookupError(null)
      }
    }
    return () => {
      active = false
    }
  }, [isReturningPatient, isReschedule, followupCodeInput])

  // Auto-match doctor from retained appointment once doctors list loads
  useEffect(() => {
    if (retainedAppointment?.doctorId && doctors.length > 0) {
      const matchedDoc = doctors.find((d) => d.id === retainedAppointment.doctorId)
      if (matchedDoc) {
        setSelectedDoctor(matchedDoc)
      }
    }
  }, [retainedAppointment, doctors])

  useEffect(() => {
    if (isReschedule && !loading) {
      const timer = setTimeout(() => {
        const el = document.getElementById('booking-schedule')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [isReschedule, loading])

  useEffect(() => {
    setLoading(true)
    loadClinicData()

    // Check if logged-in patient has a verified profile in Supabase (to offer as a 1-tap chip, never auto-filled from Google)
    try {
      const sessionRaw = localStorage.getItem('dactor_patient_session')
      if (sessionRaw) {
        const parsed = JSON.parse(sessionRaw)
        if (parsed?.email) {
          getPatientProfileByEmail(parsed.email).then((prof) => {
            if (prof && prof.fullName && prof.phone && prof.age && prof.gender) {
              setSavedProfile({
                id: prof.id,
                fullName: prof.fullName,
                age: Number(prof.age),
                gender: prof.gender,
                phone: prof.phone,
                email: prof.email,
              })
              setPatientUserId(prof.id)
              setPatientName((prev) => prev || prof.fullName)
              setPatientAge((prev) => prev || String(prof.age))
              setPatientGender((prev) => prev || prof.gender)
              setPatientMobile((prev) => prev || prof.phone)
              setPatientEmail((prev) => prev || prof.email || '')
            }
          })
        }
      }
    } catch {}

    const channel = supabase
      .channel(`clinic-detail-${clinicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clinics', filter: `id=eq.${clinicId}` }, () => loadClinicData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doctors' }, () => loadClinicData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clinic_services', filter: `clinic_id=eq.${clinicId}` }, () => loadClinicData())
      .subscribe()

    // Restore or check for returning / background-completed online payment (eSewa, Khalti, Fonepay, ConnectIPS)
    async function checkOnlinePaymentReturn() {
      try {
        const urlParams = new URLSearchParams(window.location.search)
        const apptIdFromUrl = urlParams.get('appointmentId') || urlParams.get('appointment_id')
        const paymentResult = urlParams.get('payment_result') || urlParams.get('status')
        const gatewayFromUrl = urlParams.get('gateway')

        let apptIdToVerify = apptIdFromUrl
        let pendingGateway = gatewayFromUrl || ''
        if (!apptIdToVerify) {
          try {
            const pendingRaw =
              localStorage.getItem('dactor_pending_online_payment') ||
              localStorage.getItem('dactor_pending_esewa_payment')
            if (pendingRaw) {
              const parsed = JSON.parse(pendingRaw)
              if (parsed.appointmentId && (Date.now() - (parsed.createdAt || 0)) < 86400000) {
                apptIdToVerify = parsed.appointmentId
                pendingGateway = parsed.gateway || pendingGateway
              }
            }
          } catch {}
        }

        if (!apptIdToVerify) return

        const refreshRes = await refreshOnlinePayment(apptIdToVerify)
        const appt = await getAppointmentById(apptIdToVerify)
        const resolvedGw = (refreshRes.gateway || pendingGateway || 'esewa').toLowerCase()
        const gwLabel =
          resolvedGw === 'khalti'
            ? 'Khalti Digital Wallet'
            : resolvedGw === 'fonepay'
            ? 'Fonepay QR / Direct Banking'
            : resolvedGw === 'connectips'
            ? 'ConnectIPS Direct Bank'
            : 'eSewa Mobile Wallet'

        if (appt && (appt.paymentStatus === 'paid' || refreshRes.status === 'complete')) {
          setConfirmedAppt(appt)
          setConfirmedTxnId(refreshRes.reference || `${resolvedGw.toUpperCase()}-${appt.trackingCode10Digit}`)
          setConfirmedPayMethod(`${gwLabel} (Verified)`)
          setShowBookingModal(false)
          localStorage.removeItem('dactor_pending_online_payment')
          localStorage.removeItem('dactor_pending_esewa_payment')

          try {
            const url = new URL(window.location.href)
            url.searchParams.delete('payment_result')
            url.searchParams.delete('status')
            url.searchParams.delete('gateway')
            url.searchParams.delete('appointmentId')
            url.searchParams.delete('appointment_id')
            window.history.replaceState({}, '', url.toString())
          } catch {}
        } else if (refreshRes.status === 'failed' || paymentResult === 'failed') {
          alert(`${gwLabel} transaction was cancelled or could not be verified.`)
          localStorage.removeItem('dactor_pending_online_payment')
          localStorage.removeItem('dactor_pending_esewa_payment')
        }
      } catch (e) {
        console.error('Error checking online payment return in ClinicDetail:', e)
      }
    }
    checkOnlinePaymentReturn()

    const onVisibilityFocus = () => {
      if (document.visibilityState === 'visible') checkOnlinePaymentReturn()
    }
    window.addEventListener('focus', onVisibilityFocus)
    document.addEventListener('visibilitychange', onVisibilityFocus)

    return () => {
      window.removeEventListener('focus', onVisibilityFocus)
      document.removeEventListener('visibilitychange', onVisibilityFocus)
      supabase.removeChannel(channel)
    }
  }, [clinicId])

  // Load real slots from Supabase whenever clinicId or selectedDate changes
  useEffect(() => {
    let active = true
    async function fetchSlotsForDate() {
      setSlotsLoading(true)
      try {
        const dbSlots = await getSlots(clinicId, selectedDate)
        if (!active) return
        setSlots(dbSlots)
      } catch (err) {
        console.error('Error loading slots:', err)
      } finally {
        if (active) setSlotsLoading(false)
      }
    }
    fetchSlotsForDate()
    return () => {
      active = false
    }
  }, [clinicId, selectedDate])

  // Month Calendar View State matching mobile app Workflow
  const todayIso = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [])
  const currentYearMonth = useMemo(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  }, [])
  const [viewedYearMonth, setViewedYearMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [monthSlotsMap, setMonthSlotsMap] = useState<Record<string, Slot[]>>({})
  const [monthSlotsLoading, setMonthSlotsLoading] = useState(false)

  // Load slots for the whole visible month in one call, and refetch when month or doctor changes
  useEffect(() => {
    let active = true
    async function fetchMonth() {
      if (!clinicId) return
      setMonthSlotsLoading(true)
      const yr = viewedYearMonth.year
      const mo = viewedYearMonth.month + 1
      const startStr = `${yr}-${String(mo).padStart(2, '0')}-01`
      const lastDay = new Date(yr, mo, 0).getDate()
      const endStr = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      try {
        const slotsMap = await getMonthSlots(clinicId, startStr, endStr)
        if (!active) return
        setMonthSlotsMap((prev) => ({ ...prev, ...slotsMap }))
      } catch (err) {
        console.error('Error loading month slots:', err)
      } finally {
        if (active) setMonthSlotsLoading(false)
      }
    }
    fetchMonth()
    return () => {
      active = false
    }
  }, [clinicId, viewedYearMonth.year, viewedYearMonth.month, selectedDoctor?.id])

  // Helper to compute calendar date state (1. Available, 2. Fully booked, 3. Closed, 4. Past)
  const computeCalendarDateState = (dateStr: string): 'available' | 'fully_booked' | 'closed' | 'past' => {
    if (dateStr < todayIso) return 'past'

    if (clinic?.declaredHolidays && clinic.declaredHolidays.includes(dateStr)) {
      return 'closed'
    }

    if (clinic?.weeklyScheduleJson) {
      try {
        const parsed = JSON.parse(clinic.weeklyScheduleJson)
        if (Array.isArray(parsed)) {
          const dObj = new Date(dateStr + 'T00:00:00')
          const dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
          const match = parsed.find((p: any) =>
            String(p.day || '').toLowerCase().startsWith(dayName)
          )
          if (match && match.isOpen === false) {
            return 'closed'
          }
        }
      } catch {}
    }

    const isLabMode = activeTab === 'lab' || isLabClinic

    const rawSlots = (monthSlotsMap[dateStr] || []).filter((s) => s.isAvailable !== false)
    const relevantSlots = isLabMode
      ? rawSlots
      : selectedDoctor
      ? rawSlots.filter((s) => !s.doctorId || s.doctorId === selectedDoctor.id)
      : rawSlots

    const activeSlots =
      dateStr === todayIso
        ? relevantSlots.filter((s) => !isSlotTimeExpired(dateStr, s.endTime || s.startTime, s.startTime))
        : relevantSlots

    if (activeSlots.length === 0) {
      return 'closed'
    }

    const hasCapacity = activeSlots.some(
      (s) => Math.max(0, (s.maxCapacity || 10) - (s.bookedCount || 0)) > 0
    )

    return hasCapacity ? 'available' : 'fully_booked'
  }

  // Find next available date across next 60 days
  const nextAvailableDate = useMemo(() => {
    const now = new Date()
    for (let i = 0; i < 60; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() + i)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const iso = `${y}-${m}-${day}`
      if (computeCalendarDateState(iso) === 'available') {
        return iso
      }
    }
    return null
  }, [todayIso, clinic, selectedDoctor, monthSlotsMap])

  // Auto-select: preserve current available date; fallback to today or next available date when unavailable
  useEffect(() => {
    if (Object.keys(monthSlotsMap).length === 0) return
    if (computeCalendarDateState(selectedDate) === 'available') return
    const todayState = computeCalendarDateState(todayIso)
    if (todayState === 'available') {
      setSelectedDate(todayIso)
    } else if (nextAvailableDate) {
      const targetD = new Date(nextAvailableDate + 'T00:00:00')
      setViewedYearMonth({ year: targetD.getFullYear(), month: targetD.getMonth() })
      setSelectedDate(nextAvailableDate)
    }
  }, [monthSlotsMap, todayIso, nextAvailableDate, selectedDate])

  // 5-minute countdown timer when on payment step
  useEffect(() => {
    if (!showBookingModal || bookingStep !== 'payment') return
    const timer = setInterval(() => {
      setPaymentCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [showBookingModal, bookingStep])

  // Parse clinic weekly schedule JSON from Supabase
  const parsedSchedule = useMemo(() => {
    if (!clinic?.weeklyScheduleJson) return []
    try {
      const parsed = JSON.parse(clinic.weeklyScheduleJson)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [clinic?.weeklyScheduleJson])

  const scheduleSummary = useMemo(() => {
    if (parsedSchedule.length === 0) {
      return {
        workingHours: '09:00 AM – 05:00 PM',
        workingDaysNote: 'Standard OPD & Diagnostic Hours',
        breakHours: clinic?.isOnBreak ? 'Currently on Active Break' : '01:00 PM – 02:00 PM',
        breakNote: clinic?.isOnBreak ? 'Queue temporarily paused by clinic' : 'Scheduled Lunch & Sanitization Break',
        weekendHours: `Avg ~${clinic?.avgConsultationTimeMinutes || 10} min / patient`,
        weekendNote:
          clinic?.declaredHolidays && clinic.declaredHolidays.length > 0
            ? `Declared Holidays: ${clinic.declaredHolidays.join(', ')}`
            : 'Real-time Queue & Walk-In Enabled',
      }
    }

    const openDays = parsedSchedule.filter((d: any) => d.isOpen !== false)
    const firstOpen = openDays[0] || parsedSchedule[0]
    const weekendDay = parsedSchedule.find((d: any) =>
      String(d.day || '').toLowerCase().startsWith('sun') ||
      String(d.day || '').toLowerCase().startsWith('sat')
    )

    return {
      workingHours: firstOpen
        ? `${firstOpen.openTime || '09:00 AM'} – ${firstOpen.closeTime || '05:00 PM'}`
        : '09:00 AM – 05:00 PM',
      workingDaysNote:
        openDays.length > 0
          ? `Open ${openDays.map((d: any) => String(d.day || '').slice(0, 3)).join(', ')}`
          : 'Configured by Clinic',
      breakHours:
        firstOpen?.breakStart && firstOpen?.breakEnd
          ? `${firstOpen.breakStart} – ${firstOpen.breakEnd}`
          : clinic?.isOnBreak
          ? 'Currently on Active Break'
          : 'No Fixed Break Configured',
      breakNote: clinic?.isOnBreak
        ? 'Clinic is currently on break right now'
        : 'Official Clinic Break Window',
      weekendHours:
        weekendDay
          ? weekendDay.isOpen === false
            ? `${weekendDay.day}: Closed`
            : `${weekendDay.day}: ${weekendDay.openTime || '09:00 AM'} – ${weekendDay.closeTime || '02:00 PM'}`
          : `Avg ~${clinic?.avgConsultationTimeMinutes || 10} min / patient`,
      weekendNote:
        clinic?.declaredHolidays && clinic.declaredHolidays.length > 0
          ? `Upcoming Holidays: ${clinic.declaredHolidays.slice(0, 3).join(', ')}`
          : `Avg Consultation: ~${clinic?.avgConsultationTimeMinutes || 10} mins`,
    }
  }, [parsedSchedule, clinic])

  const isSelectedDateHoliday = useMemo(() => {
    return Boolean(clinic?.declaredHolidays && clinic.declaredHolidays.includes(selectedDate))
  }, [clinic?.declaredHolidays, selectedDate])

  // Build available time slots (strictly using clinic-published Supabase slots; NEVER synthesize fake or fallback slots)
  const displaySlots = useMemo(() => {
    if (isSelectedDateHoliday) return []

    const isLabMode = isLabClinic || activeTab === 'lab'
    const filteredDbSlots = slots.filter(
      (s) => isLabMode || !selectedDoctor || !s.doctorId || s.doctorId === selectedDoctor.id
    )

    if (filteredDbSlots.length > 0) {
      return filteredDbSlots
        .filter((s) => !isSlotTimeExpired(selectedDate, s.endTime || s.startTime, s.startTime))
        .map((s) => {
          const label = s.endTime ? `${s.startTime.slice(0, 5)} - ${s.endTime.slice(0, 5)}` : s.startTime
          const full = (s.bookedCount || 0) >= (s.maxCapacity || 10)
          return {
            id: s.id,
            timeLabel: label,
            rawStart: s.startTime,
            remaining: Math.max(0, (s.maxCapacity || 10) - (s.bookedCount || 0)),
            disabled: full || s.isAvailable === false,
            reason: full ? 'Full' : '',
          }
        })
    }

    // Strictly rely on clinic-published slots from Supabase (NEVER generate fake/fallback slots)
    return []
  }, [slots, selectedDoctor, selectedDate, isSelectedDateHoliday, isLabClinic, activeTab])

  // Auto-select first available non-disabled slot while preserving user's explicit selection
  useEffect(() => {
    setSelectedSlotId((prevId) => {
      if (prevId) {
        const matched = displaySlots.find((s) => !s.disabled && s.id === prevId)
        if (matched) {
          setSelectedSlotTime(matched.timeLabel)
          return matched.id
        }
      }
      const firstAvailable = displaySlots.find((s) => !s.disabled)
      if (firstAvailable) {
        setSelectedSlotTime(firstAvailable.timeLabel)
        return firstAvailable.id
      }
      setSelectedSlotTime('')
      return undefined
    })
  }, [displaySlots])

  // Toggle selected test
  const toggleTest = (id: string) => {
    setSelectedTests((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Calculate total lab tests fee
  const selectedTestList = services.filter((s) => selectedTests[s.id])
  const calculatedLabFee = selectedTestList.reduce((acc, curr) => acc + curr.price, 0)
  const totalBookingFee = useMemo(() => {
    if (activeTab === 'lab') {
      return calculatedLabFee
    }
    if (isReschedule) {
      return 0
    }
    if (isReturningPatient && retainedAppointment) {
      return 0
    }
    return selectedDoctor?.consultationFee || 500
  }, [activeTab, calculatedLabFee, isReschedule, isReturningPatient, retainedAppointment, selectedDoctor?.consultationFee])

  // Live criteria validation helpers
  const isNameValid = (val: string) => val.trim().length >= 2
  const isAgeValid = (val: string) => {
    const n = Number(val)
    return val.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 120
  }
  const normalizeGender = (g?: string): 'Male' | 'Female' | 'Other' => {
    if (!g) return 'Male'
    const l = g.trim().toLowerCase()
    if (l === 'female') return 'Female'
    if (l === 'other') return 'Other'
    return 'Male'
  }
  const isGenderValid = (val: string) => ['Male', 'Female', 'Other'].includes(normalizeGender(val))
  const isMobileValid = (val: string) => /^9\d{9}$/.test(val.replace(/\D/g, ''))

  // Validate form and scroll/focus first missing/invalid field
  const validateDetailsForm = () => {
    const errors: { [key: string]: string } = {}
    let firstInvalidId: string | null = null

    if (!isNameValid(patientName)) {
      errors.name = 'Full name is required (minimum 2 characters).'
      if (!firstInvalidId) firstInvalidId = 'field-patient-name'
    }
    if (!isAgeValid(patientAge)) {
      errors.age = 'Enter a valid whole number age between 1 and 120.'
      if (!firstInvalidId) firstInvalidId = 'field-patient-age'
    }
    if (!isGenderValid(patientGender)) {
      errors.gender = 'Please select gender.'
      if (!firstInvalidId) firstInvalidId = 'field-patient-gender'
    }
    if (!isMobileValid(patientMobile)) {
      errors.mobile = 'Enter a valid 10-digit mobile number starting with 9 (e.g. 98XXXXXXXX).'
      if (!firstInvalidId) firstInvalidId = 'field-patient-mobile'
    }

    setFormErrors(errors)

    if (firstInvalidId) {
      const el = document.getElementById(firstInvalidId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        ;(el as HTMLElement).focus?.()
      }
      return false
    }
    return true
  }

  const handleProceedToPaymentStep = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLookingUpCode) return
    if (!isReschedule && !validateDetailsForm()) return
    // Directly book for free follow-up or reschedule without any payment step
    if (totalBookingFee === 0 || isLockedDetails || isReschedule) {
      handleConfirmBookingAndPayment()
      return
    }
    setPaymentCountdown(300)
    setBookingStep('payment')
  }

  // Handle final appointment + payment submission to Supabase
  const handleConfirmBookingAndPayment = async (forceProceed = false) => {
    if (isLookingUpCode) return
    if (!isReschedule && !validateDetailsForm()) {
      setBookingStep('details')
      return
    }

    setSubmitting(true)
    try {
      if (activeTab === 'opd' && selectedSlotTime && isSlotTimeExpired(selectedDate, selectedSlotTime)) {
        alert('This time slot has already passed. Please select an upcoming slot.')
        setSubmitting(false)
        return
      }

      // 1. Reschedule & Follow-Up handling
      if ((isReschedule || isReturningPatient) && retainedAppointment) {
        const isRetainedCompleted = ['done', 'completed'].includes((retainedAppointment.checkinStatus || '').toLowerCase())

        if (isRetainedCompleted) {
          // COMPLETED VISIT -> Issue a NEW follow-up appointment record, preserving past medical history!
          const newFollowUpAppt = await createAppointment({
            clinicId,
            doctorId: activeTab === 'opd' ? (selectedDoctor?.id || retainedAppointment.doctorId) : undefined,
            userId: retainedAppointment.userId || patientUserId,
            slotId: selectedSlotId,
            trackingCode10Digit: retainedAppointment.trackingCode10Digit,
            patientName: retainedAppointment.patientName,
            patientAge: retainedAppointment.patientAge || Number(patientAge),
            patientGender: retainedAppointment.patientGender || 'Male',
            patientMobile: retainedAppointment.patientMobile,
            patientEmail: retainedAppointment.patientEmail,
            appointmentDate: selectedDate,
            appointmentTime: selectedSlotTime || '10:00 AM',
            feeAmount: 0,
            paymentStatus: 'paid',
            paymentMode: 'ONLINE',
            status: 'APPROVED',
            checkinStatus: 'not_checked_in',
            notes: `Free Follow-Up Consultation (Ref: #${retainedAppointment.trackingCode10Digit})`
          })

          if (newFollowUpAppt) {
            setConfirmedAppt(newFollowUpAppt)
            setConfirmedTxnId(`FOLLOWUP-${newFollowUpAppt.trackingCode10Digit}`)
            setConfirmedPayMethod('Free Follow-Up (Retained 10-Digit ID)')
            setShowBookingModal(false)
            setSubmitting(false)
            return
          } else {
            alert('Could not schedule follow-up appointment for this slot. Please select another slot.')
            setSubmitting(false)
            return
          }
        } else {
          // ACTIVE / UPCOMING VISIT -> Reschedule existing appointment in-place
          const ok = await shiftAppointmentDate(
            retainedAppointment.id,
            selectedDate,
            selectedSlotTime || '10:00 AM',
            'Patient rescheduled via clinic booking portal',
            selectedSlotId,
            activeTab === 'opd' ? (selectedDoctor?.id || retainedAppointment.doctorId) : null,
            retainedAppointment.trackingCode10Digit
          )
          if (ok) {
            const preservedStatus =
              retainedAppointment.status === 'WAITING_FOR_APPROVAL'
                ? 'WAITING_FOR_APPROVAL'
                : 'APPROVED'
            const updatedAppt: Appointment = {
              ...retainedAppointment,
              appointmentDate: selectedDate,
              appointmentTime: selectedSlotTime || '10:00 AM',
              slotId: selectedSlotId,
              status: preservedStatus,
              checkinStatus: 'not_checked_in',
            }
            setConfirmedAppt(updatedAppt)
            setConfirmedTxnId(`RESCHEDULED-${retainedAppointment.trackingCode10Digit}`)
            setConfirmedPayMethod('Rescheduled Appointment (Retained Fee)')
            setShowBookingModal(false)
            setSubmitting(false)
            return
          } else {
            alert('Could not reschedule appointment for this slot. Please try another slot or contact reception.')
            setSubmitting(false)
            return
          }
        }
      }

      // 2. New Booking / Free Follow-Up with Idempotent Session Key
      const code10 = generate10DigitTrackingCode()
      const testsSelectedNames = activeTab === 'lab' ? selectedTestList.map((t) => t.serviceName) : []
      const cleanMobile = patientMobile.replace(/\D/g, '')
      const isFreeBooking = totalBookingFee === 0 || isLockedDetails
      const isPaidNow = isFreeBooking || selectedPaymentMethod !== 'pay_at_clinic'
      const payStatus = isFreeBooking ? 'paid' : isPaidNow ? 'paid' : 'unpaid'

      // Strictly lock patient details to verified retained appointment when in follow-up/reschedule mode
      const finalPatientName = isLockedDetails && retainedAppointment ? retainedAppointment.patientName : patientName.trim()
      const finalPatientAge = isLockedDetails && retainedAppointment ? (retainedAppointment.patientAge || Number(patientAge)) : Number(patientAge)
      const finalPatientGender = isLockedDetails && retainedAppointment ? (retainedAppointment.patientGender || patientGender || 'Male') : (patientGender || 'Male')
      const finalPatientMobile = isLockedDetails && retainedAppointment ? (retainedAppointment.patientMobile || cleanMobile) : cleanMobile
      const finalPatientEmail = isLockedDetails && retainedAppointment ? (retainedAppointment.patientEmail || undefined) : (patientEmail.trim() || undefined)

      // Detect unapproved Pay at Desk appointment for this exact patient
      if (!isReschedule && !isReturningPatient && !forceProceed) {
        const pendingDesk = await findPendingPayAtDeskAppointment(
          clinicId,
          cleanMobile,
          selectedDate,
          finalPatientName
        )
        if (pendingDesk) {
          setPendingPayAtDeskAppt(pendingDesk)
          setShowPendingPayAtDeskModal(true)
          setSubmitting(false)
          return
        }
      }

      const isOnlineGateway = (['esewa', 'khalti', 'fonepay', 'connectips'] as const).includes(selectedPaymentMethod as any)
      if (isOnlineGateway && totalBookingFee > 0 && !isFreeBooking) {
        const gateway = selectedPaymentMethod as OnlineGatewayId
        const created = await createAppointment({
          id: bookingDraftId,
          clinicId,
          doctorId: activeTab === 'opd' ? selectedDoctor?.id : undefined,
          userId: patientUserId,
          slotId: selectedSlotId,
          trackingCode10Digit: code10,
          patientName: finalPatientName,
          patientAge: finalPatientAge,
          patientGender: finalPatientGender,
          patientMobile: finalPatientMobile,
          patientEmail: finalPatientEmail,
          appointmentDate: selectedDate,
          appointmentTime: selectedSlotTime || '10:00 AM',
          checkinStatus: 'not_checked_in',
          paymentStatus: 'pending',
          feeAmount: totalBookingFee,
          selectedTests: testsSelectedNames,
          notes:
            activeTab === 'lab'
              ? `Lab Tests: ${testsSelectedNames.join(', ')}`
              : patientNotes.trim() || undefined,
        })

        if (!created) {
          alert('Could not initialize appointment. Please check your internet connection.')
          setSubmitting(false)
          return
        }

        try {
          const existingCodes = JSON.parse(localStorage.getItem('dactor_patient_tracking_codes') || '[]')
          if (!existingCodes.includes(code10)) {
            localStorage.setItem('dactor_patient_tracking_codes', JSON.stringify([code10, ...existingCodes]))
          }
          const sessionPayload = JSON.stringify({
            appointmentId: created.id,
            trackingCode: code10,
            clinicId,
            gateway,
            amount: totalBookingFee,
            returnRoute: 'clinic-detail',
            createdAt: Date.now(),
          })
          localStorage.setItem('dactor_pending_online_payment', sessionPayload)
          localStorage.setItem('dactor_pending_esewa_payment', sessionPayload)
          sessionStorage.setItem('dactor_pending_payment_phone', finalPatientMobile.trim())
        } catch {}

        const returnUrl = `${window.location.origin}${window.location.pathname}?clinic=${clinicId}&payment_result=checking&gateway=${gateway}&appointmentId=${created.id}`
        const checkout = await startOnlinePayment(
          created.id,
          gateway,
          returnUrl,
          code10,
          finalPatientMobile,
          activeTab === 'lab' ? testsSelectedNames : undefined
        )
        window.location.href = checkout.checkoutUrl
        return
      }

      const isPayAtDesk = selectedPaymentMethod === 'pay_at_desk'
      const created = await createAppointment({
        id: bookingDraftId,
        clinicId,
        doctorId: activeTab === 'opd' ? selectedDoctor?.id : undefined,
        userId: patientUserId,
        slotId: selectedSlotId,
        trackingCode10Digit: code10,
        patientName: finalPatientName,
        patientAge: finalPatientAge,
        patientGender: finalPatientGender,
        patientMobile: finalPatientMobile,
        patientEmail: finalPatientEmail,
        appointmentDate: selectedDate,
        appointmentTime: selectedSlotTime || '10:00 AM',
        checkinStatus: isPayAtDesk ? 'not_checked_in' : 'waiting',
        paymentStatus: isFreeBooking ? 'paid' : 'pending',
        paymentMode: isPayAtDesk ? 'PAY_AT_DESK' : 'ONLINE',
        feeAmount: totalBookingFee,
        selectedTests: testsSelectedNames,
        notes:
          activeTab === 'lab'
            ? `Lab Tests: ${testsSelectedNames.join(', ')}`
            : isReturningPatient && retainedAppointment
            ? `Follow-Up Consultation (Previous Ref: ${retainedAppointment.trackingCode10Digit})`
            : patientNotes.trim() || undefined,
      })

      if (created) {
        const txnId = `TXN-${code10}-${Date.now().toString().slice(-4)}`
        const methodLabel = isFreeBooking
          ? 'Free Follow-Up (Retained 10-Digit ID)'
          : isPayAtDesk
          ? 'Pay at Desk (+5%)'
          : selectedPaymentMethod === 'pay_at_clinic'
          ? 'Pay at Clinic Counter'
          : selectedPaymentMethod.toUpperCase()
        const padServiceCharge =
          isPayAtDesk && !isFreeBooking && totalBookingFee > 0
            ? Math.round(totalBookingFee * 0.05 * 100) / 100
            : 0
        const txnTotalAmount = isFreeBooking
          ? 0
          : Math.round((totalBookingFee + padServiceCharge) * 100) / 100

        await recordPaymentTransaction({
          appointmentId: created.id,
          trackingCode: code10,
          clinicId,
          doctorId: selectedDoctor?.id,
          patientName: patientName.trim(),
          appointmentDate: selectedDate,
          appointmentTime: selectedSlotTime || '10:00 AM',
          amount: txnTotalAmount,
          paymentMethod: methodLabel,
          paymentStatus: isFreeBooking ? 'paid' : 'pending',
          transactionId: txnId,
          notes: testsSelectedNames.length > 0 ? `Lab Tests: ${testsSelectedNames.join(', ')}` : 'OPD Consultation',
        })

        // Save 10-digit code to localStorage so Patient Portal & Notifications track it automatically
        try {
          const existingCodes = JSON.parse(localStorage.getItem('dactor_patient_tracking_codes') || '[]')
          if (!existingCodes.includes(code10)) {
            localStorage.setItem('dactor_patient_tracking_codes', JSON.stringify([code10, ...existingCodes]))
          }
        } catch {}

        setConfirmedTxnId(txnId)
        setConfirmedPayMethod(methodLabel)
        setConfirmedAppt({ ...created, paymentStatus: payStatus })
        setShowBookingModal(false)
      } else {
        alert('Could not create appointment. Please check your internet connection.')
      }
    } catch (err) {
      console.error('Error creating booking:', err)
      alert('An error occurred during booking.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelPendingDeskAndProceed = async () => {
    if (!pendingPayAtDeskAppt) return
    setIsCancellingPendingDesk(true)
    try {
      const ok = await cancelPendingPayAtDeskAppointment(pendingPayAtDeskAppt.id)
      if (ok) {
        setShowPendingPayAtDeskModal(false)
        setPendingPayAtDeskAppt(null)
        await handleConfirmBookingAndPayment(true)
      } else {
        alert('Failed to cancel previous request. Please try again.')
      }
    } catch (e: any) {
      alert(`Error: ${e.message || 'Could not cancel request'}`)
    } finally {
      setIsCancellingPendingDesk(false)
    }
  }

  const handleDownloadInvoice = () => {
    if (!confirmedAppt || !clinic) return
    const win = window.open('', '_blank', 'width=800,height=700')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Dactor Invoice - ${escapeHtml(confirmedAppt.trackingCode10Digit)}</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 36px; color: #0f172a; }
            .box { max-width: 680px; margin: 0 auto; border: 2px solid #0284c7; border-radius: 16px; padding: 28px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
            .badge { background: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 999px; font-weight: 800; font-size: 12px; }
            .code { font-family: monospace; font-size: 28px; font-weight: 900; letter-spacing: 3px; color: #0284c7; margin: 12px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { padding: 10px 8px; text-align: left; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
            th { color: #64748b; text-transform: uppercase; font-size: 11px; }
            .total { font-size: 18px; font-weight: 900; color: #0f172a; }
          </style>
        </head>
        <body>
          <div class="box">
            <div class="header">
              <div>
                <h2 style="margin:0;font-size:22px;">${escapeHtml(clinic.name)}</h2>
                <p style="margin:4px 0 0;font-size:12px;color:#64748b;">${escapeHtml(clinic.addressText || 'Nepal')} • ${escapeHtml(clinic.contactPhone || '')}</p>
              </div>
              <span class="badge">${isReschedule ? 'RESCHEDULED CONFIRMATION' : confirmedAppt.paymentStatus === 'paid' ? 'PAID RECEIPT' : 'PAY AT CLINIC'}</span>
            </div>
            <div>
              <div style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:700;">10-Digit Universal Queue & Report Tracking Code</div>
              <div class="code">${escapeHtml(confirmedAppt.trackingCode10Digit)}</div>
            </div>
            <table>
              <tr><th>Patient Name</th><td><strong>${escapeHtml(confirmedAppt.patientName)}</strong> (${escapeHtml(confirmedAppt.patientAge)} yrs, ${escapeHtml(confirmedAppt.patientGender)})</td></tr>
              <tr><th>Contact Mobile</th><td>${escapeHtml(confirmedAppt.patientMobile)}</td></tr>
              <tr><th>Queue Token Number</th><td><strong>Token #${escapeHtml(confirmedAppt.queueNumber || 1)}</strong></td></tr>
              <tr><th>Date & Slot</th><td>${escapeHtml(confirmedAppt.appointmentDate)} • ${escapeHtml(confirmedAppt.appointmentTime)}</td></tr>
              <tr><th>Service / Doctor</th><td>${
                confirmedAppt.selectedTests && confirmedAppt.selectedTests.length > 0
                  ? `Diagnostic Lab: ${escapeHtml(confirmedAppt.selectedTests.join(', '))}`
                  : escapeHtml(selectedDoctor?.fullName || 'OPD Doctor Consultation')
              }</td></tr>
              ${!isReschedule ? `
              <tr><th>Payment Method & Txn ID</th><td>${escapeHtml(confirmedPayMethod || 'Direct')} (${escapeHtml(confirmedTxnId || 'N/A')})</td></tr>
              <tr><th>Total Amount</th><td class="total">Rs. ${escapeHtml(confirmedAppt.feeAmount)}</td></tr>
              ` : ''}
            </table>
            <p style="margin-top:24px;font-size:11px;color:#64748b;text-align:center;">
              Generated by Dactor Healthcare Platform • Present this 10-digit code at reception or track your live queue online.
            </p>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `)
    win.document.close()
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-600 font-bold">Loading live clinic profile...</p>
      </div>
    )
  }

  if (!clinic) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-800">Clinic Not Found</h2>
        <button
          onClick={onBack}
          className="mt-4 px-6 py-2.5 bg-brand-600 text-white font-bold rounded-xl"
        >
          Return to Clinics
        </button>
      </div>
    )
  }

  // Confirmation Success View
  if (confirmedAppt) {
    return (
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-12">
        <div className="liquid-glass-elevated rounded-3xl p-5 sm:p-10 text-center space-y-4 sm:space-y-6 animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto border border-teal-500/20 shadow-glass-sm">
            <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 stroke-[2.5]" />
          </div>

          <div>
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              {isReschedule
                ? 'Appointment Rescheduled'
                : confirmedAppt.paymentMode === 'PAY_AT_DESK'
                ? 'Pay at Desk Request Submitted'
                : 'Booking & Queue Token Confirmed'}
            </span>
            <h2 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
              {isReschedule
                ? `Visit Shifted to ${confirmedAppt.appointmentDate}!`
                : confirmedAppt.paymentMode === 'PAY_AT_DESK'
                ? 'Request Waiting for Approval!'
                : `Token #${confirmedAppt.queueNumber || 1} Generated!`}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              {isReschedule
                ? `Your appointment at ${clinic.name} is updated to ${confirmedAppt.appointmentTime}.`
                : confirmedAppt.paymentMode === 'PAY_AT_DESK'
                ? `Your Pay at Desk request has been sent to ${clinic.name}. No online payment was taken. You will enter the live queue once the clinic approves.`
                : `Your appointment is registered in live queue at ${clinic.name}.`}
            </p>
          </div>

          {/* 10-Digit Code Showcase Box */}
          <div className="p-4 sm:p-6 liquid-glass-card rounded-2xl text-center space-y-1.5 sm:space-y-2 border-teal-500/30">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Your 10-Digit Live Tracking Code
            </span>
            <div className="text-2xl sm:text-4xl font-black tracking-wider sm:tracking-widest text-teal-700 dark:text-teal-300 font-mono break-all">
              {confirmedAppt.trackingCode10Digit}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 font-medium pt-1">
              Use this code to check your live queue position or unlock name-verified lab reports.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 p-3.5 sm:p-4 liquid-glass-subtle rounded-2xl text-left text-xs">
            <div>
              <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px]">Patient</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                {confirmedAppt.patientName} ({confirmedAppt.patientAge}y, {confirmedAppt.patientGender})
              </p>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px]">Date & Time</span>
              <p className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                {confirmedAppt.appointmentDate} • {confirmedAppt.appointmentTime}
              </p>
            </div>
            {!isReschedule && (
              <>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px]">Payment Status</span>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm uppercase">
                    {confirmedAppt.paymentMode === 'PAY_AT_DESK'
                      ? 'WAITING FOR APPROVAL (PAY AT DESK)'
                      : `${confirmedAppt.paymentStatus} (${confirmedPayMethod})`}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px]">
                    {confirmedAppt.paymentMode === 'PAY_AT_DESK' ? 'Total Payable at Desk' : 'Total Fee'}
                  </span>
                  <p className="font-bold text-teal-600 dark:text-teal-400 text-xs sm:text-sm">
                    Rs. {confirmedAppt.paymentMode === 'PAY_AT_DESK'
                      ? (confirmedAppt.totalAmount || (confirmedAppt.feeAmount + Number((confirmedAppt.feeAmount * (PAY_AT_DESK_SERVICE_CHARGE_PERCENT / 100)).toFixed(2))))
                      : confirmedAppt.feeAmount}
                    {confirmedAppt.paymentMode === 'PAY_AT_DESK' && (
                      <span className="text-[10px] block text-amber-600 dark:text-amber-400 font-normal">
                        (Fee Rs. {confirmedAppt.feeAmount} + {PAY_AT_DESK_SERVICE_CHARGE_PERCENT}% charge)
                      </span>
                    )}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 pt-2">
            <button
              onClick={() => onOpenLiveQueue(confirmedAppt.trackingCode10Digit)}
              className="w-full sm:flex-1 py-3 sm:py-3.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-bold rounded-2xl shadow-glass-base active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer text-xs sm:text-sm border-t border-white/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>Track Live Queue Now</span>
            </button>
            <button
              onClick={handleDownloadInvoice}
              className="w-full sm:w-auto py-3 sm:py-3.5 px-4 sm:px-5 liquid-glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 text-emerald-700 dark:text-emerald-300 font-bold rounded-2xl transition-colors text-xs flex items-center justify-center space-x-1.5 cursor-pointer active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              <span>Download Invoice</span>
            </button>
            <button
              onClick={onBack}
              className="w-full sm:w-auto py-3 sm:py-3.5 px-5 sm:px-6 liquid-glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-colors text-xs sm:text-sm cursor-pointer active:scale-[0.98]"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Back Button & Share Top Bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors py-1 cursor-pointer active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Clinics Directory</span>
        </button>

        <button
          type="button"
          onClick={handleShareClinic}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-teal-600 dark:hover:text-teal-400 border border-slate-200/60 dark:border-white/10 text-xs font-bold transition shadow-glass-sm cursor-pointer active:scale-95"
          title="Share Clinic Profile Link"
        >
          {copiedShareLink ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-emerald-600 font-bold">Link Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Share Clinic</span>
            </>
          )}
        </button>
      </div>

      {/* Reschedule Banner */}
      {isReschedule && (
        <div className="p-4 sm:p-5 rounded-3xl bg-cyan-500/10 border border-cyan-500/25 shadow-glass-sm backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 flex items-center justify-center shrink-0 border border-cyan-500/30">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                  Rescheduling Consultation
                </span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-cyan-600 text-white">
                  Fee Retained
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Appointment ID #{retainedAppointment?.trackingCode10Digit || followupCodeInput || initialTrackingCode}
                {retainedAppointment ? ` • Patient: ${retainedAppointment.patientName}` : ''}
                {selectedDoctor ? ` • Specialist: Dr. ${selectedDoctor.fullName}` : ''}
              </p>
            </div>
          </div>
          <a
            href="#booking-schedule"
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition shadow-glass-sm cursor-pointer whitespace-nowrap active:scale-95 flex items-center gap-1.5"
          >
            <span>Pick Date & Slot Below</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Free Follow-Up Banner */}
      {!isReschedule && isReturningPatient && retainedAppointment && (
        <div className="p-4 sm:p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/25 shadow-glass-sm backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                  Free Follow-Up Consultation
                </span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                  NPR 0
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Linked to Previous Token #{retainedAppointment?.trackingCode10Digit || followupCodeInput || initialTrackingCode}
                {retainedAppointment ? ` • Patient: ${retainedAppointment.patientName}` : ''}
              </p>
            </div>
          </div>
          <a
            href="#booking-schedule"
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-glass-sm cursor-pointer whitespace-nowrap active:scale-95 flex items-center gap-1.5"
          >
            <span>Pick Date & Slot Below</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. CLINIC HERO PHOTO CAROUSEL (Real Supabase Pictures)   */}
      {/* ========================================================= */}
      {(() => {
        const photos =
          clinic.pictures && clinic.pictures.length > 0
            ? clinic.pictures
            : clinic.logoUrl
            ? [clinic.logoUrl]
            : []
        const activePhoto = photos[selectedPhotoIndex] || photos[0]

        return (
          <div className="relative w-full h-52 sm:h-80 md:h-96 rounded-3xl overflow-hidden bg-slate-900 border border-white/20 shadow-glass-elevated">
            {activePhoto ? (
              <img
                src={activePhoto}
                alt={clinic.name}
                className="w-full h-full object-cover transition-all duration-500"
                onError={(e) => {
                  ;(e.target as HTMLElement).style.display = 'none'
                }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-teal-800 via-teal-700 to-cyan-700 flex items-center justify-center text-white">
                <div className="text-center space-y-2 p-4 sm:p-6">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mx-auto border border-white/20">
                    <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black">{clinic.name}</h2>
                  <p className="text-[11px] sm:text-xs text-white/80 font-medium">Dactor Certified Healthcare Center • Nepal</p>
                </div>
              </div>
            )}

            {/* Gradient Overlay for Legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-black/25 to-black/35 pointer-events-none" />

            {/* Top Overlay Badges */}
            <div className="absolute top-2.5 sm:top-4 left-2.5 sm:left-4 right-2.5 sm:right-4 flex flex-wrap items-center justify-between gap-1.5 pointer-events-auto">
              <span className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider bg-white/85 text-slate-900 backdrop-blur-md border border-white/30 shadow-glass-sm">
                {clinic.type === 'diagnostic_lab' ? 'Diagnostic Pathology Lab' : clinic.type === 'single_visit' ? 'Single-Visit OPD' : 'Multi-Visit Polyclinic'}
              </span>

              <div className="flex items-center space-x-1.5 sm:space-x-2">
                {clinic.isOnBreak && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-amber-500/90 text-white shadow-glass-sm border border-white/20 backdrop-blur-md">
                    Currently on Break
                  </span>
                )}
                <span className="inline-flex items-center px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-500/90 text-white shadow-glass-sm border border-white/20 backdrop-blur-md">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  Verified Clinic
                </span>
              </div>
            </div>

            {/* Bottom Caption & Interactive Photo Navigation Dots */}
            <div className="absolute bottom-2.5 sm:bottom-4 left-2.5 sm:left-4 right-2.5 sm:right-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2 sm:gap-3 pointer-events-auto">
              <div className="text-white drop-shadow-md">
                <h2 className="text-lg sm:text-2xl font-black">{clinic.name}</h2>
                <p className="text-[11px] sm:text-xs text-slate-200 flex items-center space-x-1.5 mt-0.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{clinic.addressText || 'Nepal'}</span>
                </p>
              </div>

              {photos.length > 1 && (
                <div className="flex items-center space-x-1.5 sm:space-x-2 bg-black/60 backdrop-blur-md p-1 sm:p-1.5 rounded-2xl border border-white/20 self-start sm:self-auto">
                  {photos.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedPhotoIndex(idx)}
                      className={`h-2 sm:h-2.5 rounded-full transition-all cursor-pointer ${
                        idx === selectedPhotoIndex ? 'w-5 sm:w-7 bg-teal-400' : 'w-2 sm:w-2.5 bg-white/50 hover:bg-white'
                      }`}
                      title={`Photo ${idx + 1}`}
                    />
                  ))}
                  <span className="text-[9px] sm:text-[10px] font-bold text-white/90 px-1">
                    {selectedPhotoIndex + 1}/{photos.length}
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ========================================================= */}
      {/* 2. CLINIC IDENTITY & WORKING/BREAK HOURS (Real Supabase)  */}
      {/* ========================================================= */}
      <div className="liquid-glass-elevated rounded-3xl p-4 sm:p-8 space-y-4 sm:space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 pb-4 sm:pb-6 border-b border-slate-200/50 dark:border-white/10">
          <div className="flex flex-col sm:flex-row items-start space-y-3.5 sm:space-y-0 sm:space-x-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-gradient-to-tr from-teal-600 to-cyan-500 text-white flex items-center justify-center font-black text-2xl sm:text-3xl shadow-glass-base shrink-0 overflow-hidden border border-white/30">
              {clinic.logoUrl || (clinic.pictures && clinic.pictures.length > 0) ? (
                <img
                  src={clinic.logoUrl || clinic.pictures![0]}
                  alt={clinic.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLElement).style.display = 'none'
                  }}
                />
              ) : clinic.type === 'diagnostic_lab' ? (
                <FlaskConical className="w-10 h-10" />
              ) : (
                clinic.name.charAt(0)
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white">{clinic.name}</h1>
                <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold bg-teal-500/10 text-teal-800 dark:text-teal-300 border border-teal-500/20 backdrop-blur-sm">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-teal-600 dark:text-teal-400" />
                  Verified Clinic
                </span>
                {clinic.isOnBreak && (
                  <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 backdrop-blur-sm">
                    Currently on Break
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs text-slate-600 dark:text-slate-300 font-medium pt-0.5">
                <span className="flex items-center space-x-1.5 liquid-glass-subtle px-2.5 sm:px-3 py-1 rounded-xl">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="font-semibold truncate max-w-[200px] sm:max-w-none">{clinic.addressText || 'Nepal'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowMapModal(true)}
                  className="inline-flex items-center space-x-1 px-2.5 sm:px-3 py-1 rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 font-bold border border-teal-500/20 transition text-[11px] backdrop-blur-sm cursor-pointer active:scale-95"
                  title="View on Interactive Map"
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>View on Map</span>
                </button>
                <a
                  href={
                    clinic.latitude && clinic.longitude
                      ? `https://www.google.com/maps/dir/?api=1&destination=${clinic.latitude},${clinic.longitude}`
                      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                          `${clinic.name} ${clinic.addressText || ''}`.trim()
                        )}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 px-2.5 sm:px-3 py-1 rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 font-bold border border-blue-500/20 transition text-[11px] backdrop-blur-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span>Google Maps Directions</span>
                </a>
                <button
                  type="button"
                  onClick={handleShareClinic}
                  className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 font-bold border border-teal-500/20 transition text-[11px] backdrop-blur-sm cursor-pointer active:scale-95"
                  title="Share Clinic Profile Link"
                >
                  {copiedShareLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-emerald-600 font-bold">Link Copied!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Share Clinic</span>
                    </>
                  )}
                </button>
                {clinic.contactPhone && (
                  <a
                    href={`tel:${clinic.contactPhone}`}
                    className="flex items-center space-x-1 liquid-glass-subtle px-2.5 sm:px-3 py-1 rounded-xl hover:bg-white/70 dark:hover:bg-slate-800/70 transition"
                  >
                    <Phone className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span>{clinic.contactPhone}</span>
                  </a>
                )}
                {clinic.managerPhone && (
                  <span className="flex items-center space-x-1 liquid-glass-subtle px-2.5 sm:px-3 py-1 rounded-xl">
                    <Phone className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span>Desk: {clinic.managerPhone}</span>
                  </span>
                )}
                <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold liquid-glass-subtle text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <Layers className="w-3 h-3 mr-1" />
                  {isLabClinic
                    ? 'Diagnostic Pathology Lab'
                    : isSingleDoctorClinic
                    ? 'Single-Visit OPD Clinic'
                    : 'Multi-Specialty Polyclinic'}
                </span>
              </div>
              {clinic.description && (
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl pt-1 leading-relaxed">{clinic.description}</p>
              )}
            </div>
          </div>

          {/* Quick Action Pills (Full width grid on mobile) */}
          <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-center gap-2">
            {!isLabClinic && (
              <button
                disabled={isReschedule}
                onClick={() => !isReschedule && setActiveTab('opd')}
                className={`w-full sm:w-auto justify-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  isReschedule ? 'cursor-not-allowed opacity-90' : 'cursor-pointer active:scale-95'
                } ${
                  activeTab === 'opd'
                    ? 'bg-slate-900 text-white shadow-glass-base dark:bg-white dark:text-slate-950 border border-slate-700/50 dark:border-white'
                    : 'liquid-glass-subtle text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <Stethoscope className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {isSingleDoctorClinic
                    ? 'Attending Doctor'
                    : `Specialists (${doctors.length})`}
                </span>
                {isReschedule && <Lock className="w-3 h-3 text-amber-400 ml-1" />}
              </button>
            )}
            <button
              disabled={isReschedule}
              onClick={() => !isReschedule && setActiveTab('lab')}
              className={`w-full sm:w-auto justify-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                isReschedule ? 'cursor-not-allowed opacity-40' : 'cursor-pointer active:scale-95'
              } ${
                activeTab === 'lab'
                  ? 'bg-teal-600 text-white shadow-glass-base border border-teal-500/50'
                  : 'liquid-glass-subtle text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <FlaskConical className="w-4 h-4 shrink-0" />
              <span className="truncate">Tests ({services.length})</span>
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* WORKING HOURS & BREAK HOURS STRIP (From Clinic Schedule)  */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {/* Working Hours */}
          <div className="p-4 liquid-glass-subtle rounded-2xl flex items-start space-x-3.5 border-teal-500/20">
            <div className="p-2 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-xl shrink-0 mt-0.5 border border-teal-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wider block">
                Working Hours
              </span>
              <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                {scheduleSummary.workingHours}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{scheduleSummary.workingDaysNote}</p>
            </div>
          </div>

          {/* Break Hours */}
          <div className="p-4 liquid-glass-subtle rounded-2xl flex items-start space-x-3.5 border-amber-500/20">
            <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl shrink-0 mt-0.5 border border-amber-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                Break Hours & Status
              </span>
              <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                {scheduleSummary.breakHours}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{scheduleSummary.breakNote}</p>
            </div>
          </div>

          {/* Average Consultation Time & Holidays */}
          <div className="p-4 liquid-glass-subtle rounded-2xl flex items-start space-x-3.5">
            <div className="p-2 liquid-glass-subtle text-slate-700 dark:text-slate-300 rounded-xl shrink-0 mt-0.5">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                Weekend & Queue Pace
              </span>
              <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                {scheduleSummary.weekendHours}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{scheduleSummary.weekendNote}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Clinic Map Location Viewer */}
      <div className="p-4 sm:p-5 rounded-3xl liquid-glass border border-white/60 dark:border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-teal-600 text-white shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Interactive Clinic Location & Directions
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Interactive Map • Verified GPS coordinates
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowMapModal(true)}
            className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition cursor-pointer"
          >
            Expand Map ↗
          </button>
        </div>

        <MapLibreLocationViewer
          mode="inline"
          lat={clinic.latitude || 27.7052}
          lng={clinic.longitude || 85.3193}
          clinicName={clinic.name}
          addressText={clinic.addressText || 'Nepal'}
          height="280px"
        />
      </div>

      {/* ========================================================= */}
      {/* MAIN CONTENT: OPD CONSULTATION VS DIAGNOSTIC LAB TESTS    */}
      {/* ========================================================= */}
      {activeTab === 'opd' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Doctor Selection & Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Visit Type Toggle: New Consultation vs Free Follow-Up OR Reschedule Active (Applies to all clinics) */}
            <div className="p-5 rounded-3xl liquid-glass-elevated space-y-4">
              {isReschedule ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-cyan-900 dark:text-cyan-300 font-black text-sm">
                      <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                      <span>Reschedule Mode Active</span>
                    </div>
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-cyan-600 text-white">
                      FEE RETAINED
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Shifting appointment time for Token ID <strong className="font-mono font-bold">#{retainedAppointment?.trackingCode10Digit || followupCodeInput || initialTrackingCode}</strong>.
                  </p>
                  {retainedAppointment && (
                    <div className="p-3.5 rounded-2xl liquid-glass-subtle text-xs flex items-center justify-between border-cyan-500/30">
                      <div>
                        <span className="font-bold text-sm block text-cyan-900 dark:text-cyan-300">
                          ✓ Patient: {retainedAppointment.patientName}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                          {retainedAppointment.patientAge} yrs • {retainedAppointment.patientGender} • {retainedAppointment.patientMobile}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-cyan-500/10 text-cyan-800 dark:text-cyan-300 border border-cyan-500/20">
                        Verified
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Consultation Type
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Choose New Consultation or claim a 100% Free Follow-Up with your 10-digit Appointment ID.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsReturningPatient(false)
                        setFollowupLookupError(null)
                      }}
                      className={`p-3.5 rounded-2xl border text-left transition cursor-pointer active:scale-95 ${
                        !isReturningPatient
                          ? 'border-teal-500 bg-teal-500/10 ring-2 ring-teal-500/20 shadow-glass-sm'
                          : 'liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900 dark:text-white">New Patient</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-600 text-white">
                          Rs. {selectedDoctor?.consultationFee || 500}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Standard initial consultation</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsReturningPatient(true)
                        setFollowupLookupError(null)
                      }}
                      className={`p-3.5 rounded-2xl border text-left transition cursor-pointer active:scale-95 ${
                        isReturningPatient
                          ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20 shadow-glass-sm'
                          : 'liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900 dark:text-white">Follow-Up Visit</span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white uppercase tracking-wider">
                          FREE
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Free with 10-digit Appointment ID</p>
                    </button>
                  </div>

                  {/* Follow-Up 10-digit Input and Retained Box */}
                  {isReturningPatient && (
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-3 animate-in fade-in duration-150 backdrop-blur-sm">
                      <div>
                        <label className="text-xs font-bold text-emerald-900 dark:text-emerald-300 block mb-1">
                          Enter 10-Digit Appointment ID for Follow-Up *
                        </label>
                        <input
                          type="text"
                          maxLength={10}
                          value={followupCodeInput}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                            setFollowupCodeInput(val)
                          }}
                          placeholder="e.g. 8492049182 (10 digits)"
                          className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono font-bold liquid-glass-input text-slate-900 dark:text-white"
                        />
                      </div>

                      {isLookingUpCode && (
                        <div className="flex items-center space-x-2 text-xs text-emerald-700 dark:text-emerald-400">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Looking up previous appointment details...</span>
                        </div>
                      )}

                      {retainedAppointment && (
                        <div className="p-3 rounded-xl liquid-glass-subtle text-xs flex items-center justify-between border-emerald-500/30">
                          <div>
                            <span className="font-bold text-sm block text-emerald-900 dark:text-emerald-300">
                              ✓ Patient Retained: {retainedAppointment.patientName}
                            </span>
                            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                              {retainedAppointment.patientAge} yrs • {retainedAppointment.patientGender} • {retainedAppointment.patientMobile}
                            </span>
                          </div>
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
                            Verified
                          </span>
                        </div>
                      )}

                      {followupLookupError && (
                        <p className="text-xs text-rose-600 font-bold">{followupLookupError}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 1. SINGLE-VISIT CLINIC BANNER & DEDICATED DOCTOR CARD */}
            {isSingleDoctorClinic ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start space-x-3">
                  <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                      Single-Visit Consultation Clinic
                    </h4>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Each booking generates a dedicated single-use OPD token with our certified attending specialist. Published slots below are dedicated to this doctor.
                    </p>
                  </div>
                </div>

                {selectedDoctor ? (
                  <div className="p-6 rounded-3xl liquid-glass-card space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 flex items-center justify-center font-bold text-2xl shrink-0">
                          {selectedDoctor.profilePictureUrl ? (
                            <img
                              src={selectedDoctor.profilePictureUrl}
                              alt={selectedDoctor.fullName}
                              className="w-full h-full object-cover rounded-2xl"
                            />
                          ) : (
                            selectedDoctor.fullName.charAt(0)
                          )}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white">{selectedDoctor.fullName}</h3>
                            {isReschedule ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 gap-1">
                                <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                Doctor Locked
                              </span>
                            ) : isDoctorInThisClinic(selectedDoctor) ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-ping" />
                                In Clinic Now
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold liquid-glass-subtle text-slate-600 dark:text-slate-300">
                                Away
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-teal-700 dark:text-teal-300">
                            {selectedDoctor.specialty || 'General Practitioner'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {selectedDoctor.education || 'MBBS'} •{' '}
                            {selectedDoctor.startingPracticingYear
                              ? `Practicing since ${selectedDoctor.startingPracticingYear}`
                              : `${selectedDoctor.experienceYears || 1}+ Years Exp`}
                            {selectedDoctor.nmcLicenseNumber ? ` • NMC: ${selectedDoctor.nmcLicenseNumber}` : ''}
                          </p>
                        </div>
                      </div>

                      {!isReschedule ? (
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Consultation Fee</span>
                          <span className="text-lg font-black text-slate-900 dark:text-white">
                            Rs. {selectedDoctor.consultationFee || 500}
                          </span>
                        </div>
                      ) : (
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Fee Status</span>
                          <span className="text-xs font-black text-cyan-600 dark:text-cyan-400 uppercase px-2 py-1 rounded-md bg-cyan-50 dark:bg-cyan-900/40">
                            Fee Retained
                          </span>
                        </div>
                      )}
                    </div>

                    {selectedDoctor.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 border-t border-slate-200/50 dark:border-white/10 pt-3">
                        {selectedDoctor.description}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-8 liquid-glass-card rounded-3xl text-center text-slate-500 dark:text-slate-400">
                    <Stethoscope className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-bold text-slate-800 dark:text-slate-200">No doctor profile available for this clinic.</p>
                  </div>
                )}
              </div>
            ) : (
              /* 2. MULTI-VISIT POLYCLINIC: SPECIALISTS ROSTER */
              <div className="space-y-6">
                {/* Specialists Roster Header */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Specialist Doctors on Roster</h3>
                    {isReschedule && (
                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        Doctor Change Blocked
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10 border border-teal-500/20 px-3 py-1 rounded-full">
                    {doctors.length} Doctors
                  </span>
                </div>

                {doctors.length === 0 ? (
                  <div className="p-8 liquid-glass-card rounded-3xl text-center text-slate-500 dark:text-slate-400 space-y-2">
                    <Stethoscope className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-bold text-slate-800 dark:text-slate-200">No doctors registered under this polyclinic yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {doctors.map((doc) => {
                      const isSelected = selectedDoctor?.id === doc.id

                      return (
                        <div
                          key={doc.id}
                          onClick={isReschedule ? undefined : () => setSelectedDoctor(doc)}
                          className={`p-5 rounded-3xl transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                            isSelected
                              ? 'liquid-glass-elevated border-teal-500/50 shadow-glass-base ring-2 ring-teal-500/30'
                              : isReschedule
                              ? 'liquid-glass-card opacity-40 cursor-not-allowed'
                              : 'liquid-glass-card hover:-translate-y-0.5 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center space-x-4">
                            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 flex items-center justify-center font-bold text-xl shrink-0">
                              {doc.profilePictureUrl ? (
                                <img
                                  src={doc.profilePictureUrl}
                                  alt={doc.fullName}
                                  className="w-full h-full object-cover rounded-2xl"
                                />
                              ) : (
                                doc.fullName.charAt(0)
                              )}
                            </div>

                            <div>
                              <div className="flex items-center space-x-2">
                                <h3 className="text-base font-black text-slate-900 dark:text-white">{doc.fullName}</h3>
                                {isDoctorInThisClinic(doc) ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-ping" />
                                    In Clinic Now
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold liquid-glass-subtle text-slate-600 dark:text-slate-300">
                                    Away
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-bold text-teal-700 dark:text-teal-300">
                                {doc.specialty || 'Specialist Consultant'}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {doc.education || 'MBBS'} •{' '}
                                {doc.startingPracticingYear
                                  ? `Practicing since ${doc.startingPracticingYear}`
                                  : `${doc.experienceYears || 1}+ Years Exp`}
                                {doc.nmcLicenseNumber ? ` • NMC: ${doc.nmcLicenseNumber}` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center sm:flex-col items-end justify-between w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-slate-200/50 dark:border-white/10">
                            {!isReschedule && (
                              <div className="text-left sm:text-right">
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Consultation Fee</span>
                                <span className="text-base font-black text-slate-900 dark:text-white">
                                  Rs. {doc.consultationFee || 500}
                                </span>
                              </div>
                            )}
                            <span
                              className={`mt-1 text-xs font-bold px-3 py-1 rounded-xl transition-all ${
                                isSelected
                                  ? isReschedule
                                    ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1 shadow-glass-sm'
                                    : 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-glass-sm'
                                  : isReschedule
                                  ? 'liquid-glass-subtle text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                  : 'liquid-glass-subtle text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {isSelected ? (isReschedule ? 'Doctor Locked' : 'Selected') : isReschedule ? 'Locked' : 'Select'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Slot Selection & Appointment Trigger */}
          <div className="space-y-6">
            <div id="booking-schedule" className="liquid-glass-elevated p-6 rounded-3xl space-y-6 sticky top-28">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {isReschedule
                  ? 'Reschedule OPD Consultation'
                  : isReturningPatient && retainedAppointment
                  ? 'Book Free Follow-Up'
                  : 'Book OPD Consultation'}
              </h3>

              {/* Reschedule Patient Details & Locked Status Banner */}
              {isReschedule && (
                <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-cyan-900 dark:text-cyan-300 font-black text-xs">
                      <Lock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>Patient Details Locked</span>
                    </div>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-cyan-600 text-white">
                      Fee Retained
                    </span>
                  </div>

                  <div className="liquid-glass-subtle p-3.5 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Patient:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {retainedAppointment?.patientName || patientName || 'Verified Patient'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Contact:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {retainedAppointment?.patientMobile || patientMobile || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Age & Gender:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {retainedAppointment?.patientAge || patientAge || 'N/A'} yrs • {retainedAppointment?.patientGender || patientGender || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Token ID:</span>
                      <span className="font-mono font-bold text-cyan-700 dark:text-cyan-400">
                        #{retainedAppointment?.trackingCode10Digit || followupCodeInput || initialTrackingCode}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-200/50 dark:border-white/10">
                      <span className="text-slate-500 font-medium">Attending Doctor:</span>
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-500" />
                        Dr. {selectedDoctor?.fullName || 'Assigned Specialist'}
                      </span>
                    </div>
                    {retainedAppointment?.appointmentDate && (
                      <div className="flex justify-between items-center text-[11px] text-slate-500">
                        <span>Original Slot:</span>
                        <span>{retainedAppointment.appointmentDate} at {retainedAppointment.appointmentTime || '10:00 AM'}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-cyan-800 dark:text-cyan-300 leading-snug">
                    Doctor and patient details are retained. Only new date and time slot can be chosen below.
                  </p>
                </div>
              )}

              {/* Date Selection: Interactive Month Calendar with 4 states */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 block flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    <span>Select Date (Month View)</span>
                  </label>
                  {monthSlotsLoading && (
                    <span className="text-[10px] text-teal-600 font-semibold animate-pulse flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Checking slots...</span>
                    </span>
                  )}
                </div>

                {/* Month Navigator */}
                <div className="p-3.5 rounded-2xl liquid-glass-subtle border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <button
                      type="button"
                      disabled={
                        viewedYearMonth.year === currentYearMonth.year &&
                        viewedYearMonth.month === currentYearMonth.month
                      }
                      onClick={() => {
                        const isPrevAllowed =
                          viewedYearMonth.year > currentYearMonth.year ||
                          (viewedYearMonth.year === currentYearMonth.year &&
                            viewedYearMonth.month > currentYearMonth.month)
                        if (isPrevAllowed) {
                          setViewedYearMonth((prev) => {
                            const m = prev.month === 0 ? 11 : prev.month - 1
                            const y = prev.month === 0 ? prev.year - 1 : prev.year
                            return { year: y, month: m }
                          })
                        }
                      }}
                      className={`p-1.5 rounded-xl transition ${
                        viewedYearMonth.year > currentYearMonth.year ||
                        (viewedYearMonth.year === currentYearMonth.year &&
                          viewedYearMonth.month > currentYearMonth.month)
                          ? 'hover:bg-slate-200/70 text-slate-800 cursor-pointer active:scale-95'
                          : 'opacity-25 cursor-not-allowed text-slate-400'
                      }`}
                      title="Previous month"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <span className="text-xs font-black text-slate-900 tracking-wide">
                      {new Date(viewedYearMonth.year, viewedYearMonth.month, 1).toLocaleDateString(
                        'en-US',
                        { month: 'long', year: 'numeric' }
                      )}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setViewedYearMonth((prev) => {
                          const m = prev.month === 11 ? 0 : prev.month + 1
                          const y = prev.month === 11 ? prev.year + 1 : prev.year
                          return { year: y, month: m }
                        })
                      }}
                      className="p-1.5 rounded-xl hover:bg-slate-200/70 text-slate-800 cursor-pointer active:scale-95 transition"
                      title="Next month"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Days of week header */}
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <span key={d} className="text-[10px] font-bold text-slate-500 uppercase">
                        {d}
                      </span>
                    ))}
                  </div>

                  {/* Month Grid with 4 States and Status Dots */}
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {Array.from({
                      length: new Date(viewedYearMonth.year, viewedYearMonth.month, 1).getDay(),
                    }).map((_, i) => (
                      <div key={`empty-${i}`} className="h-8" />
                    ))}
                    {Array.from({
                      length: new Date(viewedYearMonth.year, viewedYearMonth.month + 1, 0).getDate(),
                    }).map((_, i) => {
                      const dayNum = i + 1
                      const dateStr = `${viewedYearMonth.year}-${String(
                        viewedYearMonth.month + 1
                      ).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                      const dateState = computeCalendarDateState(dateStr)
                      const isHoliday = Boolean(clinic?.declaredHolidays && clinic.declaredHolidays.includes(dateStr))
                      let isWeeklyOff = false
                      if (clinic?.weeklyScheduleJson) {
                        try {
                          const parsed = JSON.parse(clinic.weeklyScheduleJson)
                          if (Array.isArray(parsed)) {
                            const dObj = new Date(dateStr + 'T00:00:00')
                            const dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
                            const match = parsed.find((p: any) => String(p.day || '').toLowerCase().startsWith(dayName))
                            if (match && match.isOpen === false) isWeeklyOff = true
                          }
                        } catch {}
                      }
                      const isSelectable = dateState === 'available'
                      const isSelected = selectedDate === dateStr

                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={!isSelectable}
                          onClick={() => setSelectedDate(dateStr)}
                          className={`h-8 sm:h-9 rounded-xl flex flex-col items-center justify-center relative transition-all ${
                            isSelected
                              ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-black shadow-sm ring-2 ring-teal-500/30'
                              : isSelectable
                              ? 'hover:bg-teal-50 text-slate-900 font-bold cursor-pointer active:scale-95'
                              : dateState === 'past'
                              ? 'text-slate-300 cursor-not-allowed'
                              : dateState === 'fully_booked'
                              ? 'text-slate-600 bg-amber-50/50 cursor-not-allowed'
                              : 'text-slate-400 bg-slate-100/50 cursor-not-allowed'
                          }`}
                        >
                          <span className="text-[11px] leading-none">{dayNum}</span>
                          {/* Status Dot */}
                          {dateState !== 'past' && (
                            <span
                              className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                                isSelected
                                  ? 'bg-white'
                                  : dateState === 'available'
                                  ? 'bg-emerald-500'
                                  : dateState === 'fully_booked'
                                  ? 'bg-amber-500'
                                  : 'bg-slate-400'
                              }`}
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Calendar Legend */}
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-around text-[10px] text-slate-600 font-semibold">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>Available</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                      <span>Fully booked</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                      <span>Closed</span>
                    </div>
                  </div>
                </div>

                {/* Next available date alert / quick jump */}
                {nextAvailableDate && nextAvailableDate !== selectedDate && (
                  <div className="p-2.5 rounded-xl bg-teal-50/90 border border-teal-200/90 flex items-center justify-between text-xs text-teal-900 font-semibold animate-in fade-in">
                    <div className="flex items-center gap-1.5 truncate">
                      <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span className="truncate">
                        Next Open: {new Date(nextAvailableDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const targetD = new Date(nextAvailableDate + 'T00:00:00')
                        setViewedYearMonth({ year: targetD.getFullYear(), month: targetD.getMonth() })
                        setSelectedDate(nextAvailableDate)
                      }}
                      className="text-[11px] font-bold text-teal-700 underline hover:text-teal-900 cursor-pointer shrink-0 ml-2"
                    >
                      Book for this date
                    </button>
                  </div>
                )}
              </div>

              {/* Slot Time Picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    Available Slots ({new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})
                  </label>
                  {slotsLoading && <RefreshCw className="w-3.5 h-3.5 text-teal-600 animate-spin" />}
                </div>

                {isSelectedDateHoliday ? (
                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs font-bold text-rose-700">
                    This clinic has declared {selectedDate} as an official holiday. Please pick another date.
                  </div>
                ) : displaySlots.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 space-y-1">
                    <div className="font-bold flex items-center space-x-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>No Slots Available on {selectedDate}</span>
                    </div>
                    <p className="text-[11px] text-amber-700">
                      {nextAvailableDate
                        ? `The center has no open slots on this date. Next availability is on ${new Date(nextAvailableDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}.`
                        : 'No open OPD consultation slots available for this date. Please pick another date above.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {displaySlots.map((slotItem) => {
                      const isSelected =
                        !slotItem.disabled &&
                        (selectedSlotId
                          ? selectedSlotId === slotItem.id
                          : selectedSlotTime === slotItem.timeLabel)
                      return (
                        <button
                          key={slotItem.id || slotItem.timeLabel}
                          type="button"
                          disabled={slotItem.disabled}
                          onClick={() => {
                            setSelectedSlotTime(slotItem.timeLabel)
                            setSelectedSlotId(slotItem.id)
                          }}
                          className={`p-2.5 rounded-xl border font-bold transition-all text-center ${
                            slotItem.disabled
                              ? 'liquid-glass-subtle opacity-40 cursor-not-allowed line-through'
                              : isSelected
                              ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white border-teal-500 shadow-glass-base cursor-pointer'
                              : 'liquid-glass-subtle text-slate-700 hover:bg-white/70 cursor-pointer active:scale-95'
                          }`}
                        >
                          <span className="block">{slotItem.timeLabel}</span>
                          {slotItem.reason && (
                            <span className="text-[9px] uppercase font-semibold opacity-75">
                              {slotItem.reason}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="p-4 liquid-glass-subtle rounded-2xl text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Specialist:</span>
                  <span className="font-bold text-slate-900">
                    {selectedDoctor?.fullName || 'Clinic OPD Doctor'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Slot:</span>
                  <span className="font-bold text-slate-900">
                    {selectedDate} {selectedSlotTime ? `at ${selectedSlotTime}` : ''}
                  </span>
                </div>
                {!isReschedule && (
                  <div className="flex justify-between pt-1 border-t border-slate-200/50 font-bold">
                    <span className="text-slate-700">Total Fee:</span>
                    <span className={isReturningPatient && retainedAppointment ? 'text-emerald-600 font-black text-sm' : 'text-teal-700 text-sm'}>
                      {isReturningPatient && retainedAppointment
                        ? 'Rs. 0 (Free Follow-Up)'
                        : `Rs. ${selectedDoctor?.consultationFee || 500}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Button: Book for selected date or switch to next available date */}
              <button
                type="button"
                disabled={
                  (isReschedule || (isReturningPatient && retainedAppointment))
                    ? (!selectedSlotTime || isSelectedDateHoliday || submitting || isLookingUpCode)
                    : ((!selectedSlotTime || isSelectedDateHoliday) && !nextAvailableDate)
                }
                onClick={() => {
                  if (isLookingUpCode) return

                  if (isReschedule || (isReturningPatient && retainedAppointment)) {
                    if (isLookingUpCode) return
                    if (!retainedAppointment) {
                      alert('Could not verify existing appointment details. Please check your tracking code.')
                      return
                    }
                    if (!selectedSlotTime) {
                      alert('Please select an available time slot.')
                      return
                    }
                    handleConfirmBookingAndPayment()
                    return
                  }

                  if (!selectedSlotTime && nextAvailableDate) {
                    const targetD = new Date(nextAvailableDate + 'T00:00:00')
                    setViewedYearMonth({ year: targetD.getFullYear(), month: targetD.getMonth() })
                    setSelectedDate(nextAvailableDate)
                    return
                  }

                  const isUserLoggedIn = Boolean(
                    localStorage.getItem('dactor_patient_session') ||
                      localStorage.getItem('dactor_patient_logged_in') === 'true'
                  )

                  if (!isUserLoggedIn) {
                    const pendingData = {
                      clinicId,
                      doctorId: selectedDoctor?.id,
                      serviceId: undefined,
                      selectedSlotId,
                      selectedSlotTime,
                      bookingDate: selectedDate,
                      bookingMode: 'opd',
                      selectedLabTestIds: [],
                      isReturningPatient,
                      followupCodeInput,
                      isReschedule,
                      retainedAppointment,
                      returnRoute: 'clinic-detail',
                    }
                    try {
                      localStorage.setItem('dactor_pending_booking_redirect', JSON.stringify(pendingData))
                      localStorage.setItem('dactor_booking_login_notice', 'Please sign in with Google to book an appointment')
                    } catch {}

                    if (onNavigate) {
                      onNavigate('login')
                    } else {
                      window.location.hash = '#login'
                    }
                    return
                  }

                  setBookingStep('details')
                  setShowBookingModal(true)
                }}
                className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-2xl shadow-glass-base active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer border-t border-white/20"
              >
                <span>
                  {submitting
                    ? 'Shifting Appointment...'
                    : isLookingUpCode
                    ? 'Verifying Appointment...'
                    : selectedSlotTime
                    ? isReschedule
                      ? `Confirm Reschedule to ${selectedDate} (${selectedSlotTime})`
                      : isReturningPatient && retainedAppointment
                      ? 'Confirm Follow-Up'
                      : 'Book Appointment'
                    : isReschedule
                    ? 'Select a Published Slot to Reschedule'
                    : nextAvailableDate
                    ? 'Book Next Available Date'
                    : 'Select a Published Slot to Book'}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================= */
        /* TAB B: DIAGNOSTIC LAB TESTS SELECTION (Strictly Supabase) */
        /* ========================================================= */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Lab Diagnostic Notice Banner */}
            <div className="p-4 rounded-2xl liquid-glass-subtle border-teal-500/30 flex items-start space-x-3">
              <FlaskConical className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-teal-900 dark:text-teal-300 uppercase tracking-wider">
                  Diagnostic Pathology Lab Booking
                </h4>
                <p className="text-xs text-teal-800 dark:text-teal-300/80 mt-0.5">
                  Select required diagnostic tests and choose a sample collection time slot. Once tests are processed, verified digital reports will be issued online.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">Select Diagnostic Tests</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Check individual tests to assemble your test profile. All prices are synced live.
                </p>
              </div>
              <span className="text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10 border border-teal-500/20 px-3 py-1 rounded-full">
                {selectedTestList.length} Selected
              </span>
            </div>

            {services.length === 0 ? (
              <div className="p-10 liquid-glass-card rounded-3xl text-center space-y-2">
                <FlaskConical className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  No diagnostic tests published by this clinic yet
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  When this clinic adds pathology or diagnostic test rates in the Clinic Portal, they will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {services.map((srv) => {
                  const isChecked = !!selectedTests[srv.id]

                  return (
                    <div
                      key={srv.id}
                      onClick={() => toggleTest(srv.id)}
                      className={`p-4 rounded-2xl transition-all cursor-pointer flex items-center justify-between active:scale-[0.98] ${
                        isChecked
                          ? 'liquid-glass-elevated border-teal-500/50 shadow-glass-sm ring-2 ring-teal-500/30'
                          : 'liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                            isChecked
                              ? 'bg-teal-600 border-teal-600 text-white'
                              : 'border-slate-300 dark:border-white/20 bg-white/50 dark:bg-slate-800/50'
                          }`}
                        >
                          {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-900 dark:text-white leading-tight">
                            {srv.serviceName}
                          </h4>
                          <span className="text-[10px] text-slate-400 dark:text-slate-400 font-medium">
                            {srv.category || 'Diagnostic'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-teal-700 dark:text-teal-300">Rs. {srv.price}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right Column: Lab Checkout Summary */}
          <div className="space-y-6">
            <div id="booking-schedule" className="liquid-glass-elevated p-6 rounded-3xl space-y-6 sticky top-28">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {isReschedule ? 'Reschedule Lab Collection' : 'Lab Booking Summary'}
              </h3>

              {isReschedule && (
                <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-cyan-900 dark:text-cyan-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>Booking Details Locked</span>
                    </span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-cyan-600 text-white">
                      Fee Retained
                    </span>
                  </div>
                  <p className="text-[11px] text-cyan-800 dark:text-cyan-300">
                    Token #{retainedAppointment?.trackingCode10Digit || followupCodeInput || initialTrackingCode}
                    {retainedAppointment?.patientName ? ` • ${retainedAppointment.patientName}` : ''}
                  </p>
                  {followupLookupError && (
                    <p className="text-[11px] text-rose-600 font-bold">{followupLookupError}</p>
                  )}
                </div>
              )}

              {/* Selected Tests List */}
              {!isReschedule && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedTestList.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                      No tests selected yet. Please select at least one test from the left.
                    </p>
                  ) : (
                    selectedTestList.map((t) => (
                      <div key={t.id} className="flex justify-between text-xs py-1 border-b border-slate-200/50 dark:border-white/10">
                        <span className="text-slate-700 dark:text-slate-300 truncate max-w-[160px]">{t.serviceName}</span>
                        <span className="font-bold text-slate-900 dark:text-white">Rs. {t.price}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Date selection for Lab */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Sample Collection Date</label>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {[0, 1, 2].map((offset) => {
                    const d = new Date()
                    d.setDate(d.getDate() + offset)
                    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                    const label =
                      offset === 0
                        ? 'Today'
                        : offset === 1
                        ? 'Tomorrow'
                        : d.toLocaleDateString([], { weekday: 'short' })
                    const isSelected = selectedDate === iso

                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setSelectedDate(iso)}
                        className={`p-2 rounded-xl border font-bold transition-all cursor-pointer active:scale-95 ${
                          isSelected
                            ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white border-teal-500 shadow-glass-base'
                            : 'liquid-glass-subtle text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <span className="block text-[10px] opacity-80 uppercase">{label}</span>
                        <span className="text-xs font-black">
                          {d.getDate()} {d.toLocaleDateString([], { month: 'short' })}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="pt-1 flex items-center gap-2">
                  <input
                    type="date"
                    min={todayIso}
                    value={selectedDate}
                    onChange={(e) => {
                      if (e.target.value) setSelectedDate(e.target.value)
                    }}
                    className="flex-1 px-3 py-2 rounded-xl liquid-glass-input text-xs font-bold text-slate-900 dark:text-white outline-none"
                    aria-label="Pick custom sample collection date"
                  />
                  {nextAvailableDate && nextAvailableDate !== selectedDate && (
                    <button
                      type="button"
                      onClick={() => setSelectedDate(nextAvailableDate)}
                      className="px-2.5 py-2 rounded-xl bg-teal-500/10 border border-teal-500/30 text-[11px] font-bold text-teal-700 dark:text-teal-300 whitespace-nowrap cursor-pointer"
                    >
                      Next Open
                    </button>
                  )}
                </div>
              </div>

              {/* Sample Collection Time Slot Picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Sample Collection Slot *
                  </label>
                  {slotsLoading && <RefreshCw className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 animate-spin" />}
                </div>

                {isSelectedDateHoliday ? (
                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs font-bold text-rose-700 dark:text-rose-300">
                    This lab has declared {selectedDate} as an official holiday. Please pick another date.
                  </div>
                ) : displaySlots.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                    <div className="font-bold flex items-center space-x-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>No Collection Slots Published</span>
                    </div>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      The diagnostic laboratory has not published sample collection slots for {selectedDate}. Please choose another date or contact the lab directly.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {displaySlots.map((slotItem) => {
                      const isSelected =
                        !slotItem.disabled &&
                        (selectedSlotId
                          ? selectedSlotId === slotItem.id
                          : selectedSlotTime === slotItem.timeLabel)
                      return (
                        <button
                          key={slotItem.id || slotItem.timeLabel}
                          type="button"
                          disabled={slotItem.disabled}
                          onClick={() => {
                            setSelectedSlotTime(slotItem.timeLabel)
                            setSelectedSlotId(slotItem.id)
                          }}
                          className={`p-2 rounded-xl border font-bold transition-all text-center ${
                            slotItem.disabled
                              ? 'liquid-glass-subtle opacity-40 cursor-not-allowed line-through'
                              : isSelected
                              ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white border-teal-500 shadow-glass-base cursor-pointer'
                              : 'liquid-glass-subtle text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800/70 cursor-pointer active:scale-95'
                          }`}
                        >
                          <span className="block">{slotItem.timeLabel}</span>
                          {slotItem.reason && (
                            <span className="text-[9px] uppercase font-semibold opacity-75">
                              {slotItem.reason}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Total Calculation */}
              <div className="p-4 liquid-glass-subtle rounded-2xl text-xs space-y-1.5 border-teal-500/30">
                {!isReschedule && (
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Selected Tests ({selectedTestList.length}):</span>
                    <span>Rs. {calculatedLabFee}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Collection Slot:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedDate} {selectedSlotTime ? `• ${selectedSlotTime}` : '(Select a slot)'}
                  </span>
                </div>
                {!isReschedule ? (
                  <div className="flex justify-between pt-2 border-t border-slate-200/50 dark:border-white/10 font-black text-sm text-teal-800 dark:text-teal-300">
                    <span>Total Payable:</span>
                    <span>Rs. {calculatedLabFee}</span>
                  </div>
                ) : (
                  <div className="flex justify-between pt-2 border-t border-slate-200/50 dark:border-white/10 font-black text-sm text-cyan-800 dark:text-cyan-300">
                    <span>Reschedule Charge:</span>
                    <span>Rs. 0 (Fee Retained)</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={
                  isReschedule
                    ? (!selectedSlotTime || isSelectedDateHoliday || submitting || isLookingUpCode)
                    : (selectedTestList.length === 0 || !selectedSlotTime || isSelectedDateHoliday)
                }
                onClick={() => {
                  if (isLookingUpCode) return
                  if (isReschedule || (isReturningPatient && retainedAppointment)) {
                    if (!retainedAppointment) {
                      alert('Could not verify existing appointment details. Please check your tracking code.')
                      return
                    }
                    if (!selectedSlotTime) {
                      alert('Please select an available sample collection slot.')
                      return
                    }
                    handleConfirmBookingAndPayment()
                    return
                  }

                  const isUserLoggedIn = Boolean(
                    localStorage.getItem('dactor_patient_session') ||
                      localStorage.getItem('dactor_patient_logged_in') === 'true'
                  )

                  if (!isUserLoggedIn) {
                    const pendingData = {
                      clinicId,
                      doctorId: undefined,
                      serviceId: undefined,
                      selectedSlotId,
                      selectedSlotTime,
                      bookingDate: selectedDate,
                      bookingMode: 'lab',
                      selectedLabTestIds: selectedTestList.map((t) => t.id),
                      isReturningPatient,
                      followupCodeInput,
                      isReschedule,
                      retainedAppointment,
                      returnRoute: 'clinic-detail',
                    }
                    try {
                      localStorage.setItem('dactor_pending_booking_redirect', JSON.stringify(pendingData))
                      localStorage.setItem('dactor_booking_login_notice', 'Please sign in with Google to book an appointment')
                    } catch {}

                    if (onNavigate) {
                      onNavigate('login')
                    } else {
                      window.location.hash = '#login'
                    }
                    return
                  }

                  setBookingStep('details')
                  setShowBookingModal(true)
                }}
                className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-2xl shadow-glass-base active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer border-t border-white/20"
              >
                <span>
                  {submitting
                    ? 'Shifting Appointment...'
                    : isLookingUpCode
                    ? 'Verifying Appointment...'
                    : isReschedule
                    ? selectedSlotTime
                      ? `Confirm Reschedule to ${selectedDate} (${selectedSlotTime})`
                      : 'Select a Published Slot to Reschedule'
                    : 'Proceed to Patient Details'}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PATIENT BOOKING & PAYMENT MODAL (Strict Criteria Checks)  */}
      {/* ========================================================= */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-4 sm:p-8 relative max-h-[92vh] overflow-y-auto">
            {bookingStep === 'details' ? (
              <>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-1">
                  Enter Verified Patient Details
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  All fields marked with <span className="text-rose-500 font-bold">*</span> are strictly required. Red indicators clear automatically once valid criteria are met.
                </p>

                {/* Optional 1-Tap Fill from Verified Supabase Patient Profile */}
                {savedProfile && !isLockedDetails && (
                  <div className="mb-4 p-3 rounded-2xl liquid-glass-subtle border-teal-500/30 flex items-center justify-between">
                    <div className="text-xs">
                      <span className="font-bold text-teal-900 dark:text-teal-300 block">
                        Saved Profile: {savedProfile.fullName}
                      </span>
                      <span className="text-teal-700 dark:text-teal-400 text-[11px]">
                        {savedProfile.age} yrs • {savedProfile.gender} • {savedProfile.phone}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPatientUserId(savedProfile.id)
                        setPatientName(savedProfile.fullName)
                        setPatientAge(String(savedProfile.age))
                        setPatientGender(normalizeGender(savedProfile.gender))
                        setPatientMobile(savedProfile.phone)
                        setPatientEmail(savedProfile.email || '')
                        setFormErrors({})
                      }}
                      className="px-3 py-1.5 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl text-[11px] font-bold cursor-pointer active:scale-95 shadow-glass-sm"
                    >
                      Use Profile
                    </button>
                  </div>
                )}

                {/* Patient Details Locked Banner for Follow-Up or Reschedule */}
                {isLockedDetails && retainedAppointment && (
                  <div className="mb-4 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start space-x-3 text-xs backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center shrink-0 text-emerald-700 dark:text-emerald-300">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                        <span>Patient Details Verified & Locked</span>
                        <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                          {isReschedule ? 'Reschedule' : 'Free Follow-Up'}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-300/90 mt-0.5">
                        Verified from previous Appointment #{retainedAppointment.trackingCode10Digit}. Patient name, age, gender, and contact details cannot be altered for a free follow-up consultation.
                      </p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleProceedToPaymentStep} className="space-y-4" noValidate>
                  {/* Patient Full Name */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center justify-between">
                      <span>Patient Full Name <span className="text-rose-500">*</span></span>
                      {isLockedDetails && (
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Locked for Follow-Up
                        </span>
                      )}
                    </label>
                    <input
                      id="field-patient-name"
                      type="text"
                      readOnly={isLockedDetails}
                      disabled={isLockedDetails}
                      tabIndex={isLockedDetails ? -1 : 0}
                      value={patientName}
                      onChange={(e) => {
                        if (isLockedDetails) return
                        const val = e.target.value
                        setPatientName(val)
                        if (isNameValid(val) && formErrors.name) {
                          setFormErrors((prev) => ({ ...prev, name: '' }))
                        }
                      }}
                      placeholder="Enter patient's full legal name"
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                        isLockedDetails
                          ? 'bg-slate-100/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 cursor-not-allowed border-slate-300 dark:border-slate-700 select-none'
                          : formErrors.name && !isNameValid(patientName)
                          ? 'border-rose-500 bg-rose-50/60 ring-2 ring-rose-500/20'
                          : 'liquid-glass-input text-slate-900 dark:text-white'
                      } focus:outline-none focus:ring-2 focus:ring-teal-500`}
                    />
                    {formErrors.name && !isNameValid(patientName) && !isLockedDetails && (
                      <p className="text-[11px] text-rose-600 font-bold mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{formErrors.name}</span>
                      </p>
                    )}
                  </div>

                  {/* Age and Gender Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center justify-between">
                        <span>Age (1–120) <span className="text-rose-500">*</span></span>
                        {isLockedDetails && <Lock className="w-3 h-3 text-emerald-600" />}
                      </label>
                      <input
                        id="field-patient-age"
                        type="number"
                        readOnly={isLockedDetails}
                        disabled={isLockedDetails}
                        tabIndex={isLockedDetails ? -1 : 0}
                        value={patientAge}
                        onChange={(e) => {
                          if (isLockedDetails) return
                          const val = e.target.value
                          setPatientAge(val)
                          if (isAgeValid(val) && formErrors.age) {
                            setFormErrors((prev) => ({ ...prev, age: '' }))
                          }
                        }}
                        placeholder="Years"
                        min="1"
                        max="120"
                        className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                          isLockedDetails
                            ? 'bg-slate-100/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 cursor-not-allowed border-slate-300 dark:border-slate-700 select-none'
                            : formErrors.age && !isAgeValid(patientAge)
                            ? 'border-rose-500 bg-rose-50/60 ring-2 ring-rose-500/20'
                            : 'liquid-glass-input text-slate-900 dark:text-white'
                        } focus:outline-none focus:ring-2 focus:ring-teal-500`}
                      />
                      {formErrors.age && !isAgeValid(patientAge) && !isLockedDetails && (
                        <p className="text-[11px] text-rose-600 font-bold mt-1">{formErrors.age}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center justify-between">
                        <span>Gender <span className="text-rose-500">*</span></span>
                        {isLockedDetails && <Lock className="w-3 h-3 text-emerald-600" />}
                      </label>
                      <div className="grid grid-cols-3 gap-2" id="field-patient-gender">
                        {(['Male', 'Female', 'Other'] as const).map((g) => {
                          const isSelected = normalizeGender(patientGender) === g
                          return (
                            <button
                              key={g}
                              type="button"
                              disabled={isLockedDetails}
                              onClick={() => {
                                if (isLockedDetails) return
                                setPatientGender(g)
                                if (formErrors.gender) {
                                  setFormErrors((prev) => ({ ...prev, gender: '' }))
                                }
                              }}
                              className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                                isLockedDetails
                                  ? isSelected
                                    ? 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border-transparent cursor-not-allowed'
                                    : 'opacity-40 cursor-not-allowed border-transparent text-slate-400'
                                  : isSelected
                                  ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white border-transparent shadow-md shadow-teal-500/20 cursor-pointer'
                                  : 'liquid-glass-card text-slate-700 dark:text-slate-300 border-white/60 dark:border-white/10 hover:bg-white/70 cursor-pointer'
                              }`}
                            >
                              {g}
                            </button>
                          )
                        })}
                      </div>
                      {formErrors.gender && !patientGender && !isLockedDetails && (
                        <p className="text-[11px] text-rose-600 font-bold mt-1">{formErrors.gender}</p>
                      )}
                    </div>
                  </div>

                  {/* Mobile Phone (Strict 10-digit criteria) */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center justify-between">
                      <span>10-Digit Mobile Number <span className="text-rose-500">*</span></span>
                      {isLockedDetails && (
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Locked for Follow-Up
                        </span>
                      )}
                    </label>
                    <input
                      id="field-patient-mobile"
                      type="tel"
                      maxLength={10}
                      readOnly={isLockedDetails}
                      disabled={isLockedDetails}
                      tabIndex={isLockedDetails ? -1 : 0}
                      value={patientMobile}
                      onChange={(e) => {
                        if (isLockedDetails) return
                        const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10)
                        setPatientMobile(digitsOnly)
                        if (isMobileValid(digitsOnly) && formErrors.mobile) {
                          setFormErrors((prev) => ({ ...prev, mobile: '' }))
                        }
                      }}
                      placeholder="98XXXXXXXX (10 digits)"
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                        isLockedDetails
                          ? 'bg-slate-100/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 cursor-not-allowed border-slate-300 dark:border-slate-700 select-none'
                          : formErrors.mobile && !isMobileValid(patientMobile)
                          ? 'border-rose-500 bg-rose-50/60 ring-2 ring-rose-500/20'
                          : 'liquid-glass-input text-slate-900 dark:text-white'
                      } focus:outline-none focus:ring-2 focus:ring-teal-500`}
                    />
                    {formErrors.mobile && !isMobileValid(patientMobile) && !isLockedDetails && (
                      <p className="text-[11px] text-rose-600 font-bold mt-1">{formErrors.mobile}</p>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Medical Notes / Symptoms (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={patientNotes}
                      onChange={(e) => setPatientNotes(e.target.value)}
                      placeholder="Describe any symptoms or recent medical history..."
                      className="w-full px-3.5 py-2 rounded-xl text-xs font-medium liquid-glass-input text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>


                  {/* Action Buttons */}
                  <div className="flex items-center space-x-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowBookingModal(false)}
                      className="flex-1 py-3 liquid-glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className={`flex-1 py-3 text-white font-black rounded-xl text-xs transition-all shadow-glass-base cursor-pointer active:scale-95 border-t border-white/20 flex items-center justify-center space-x-1.5 disabled:opacity-50 ${
                        totalBookingFee === 0 || isLockedDetails || isReschedule
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                          : 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700'
                      }`}
                    >
                      {submitting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{isReschedule ? 'Shifting Appointment...' : 'Directly Confirming Follow-Up...'}</span>
                        </>
                      ) : isReschedule ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Directly Confirm Reschedule (Free)</span>
                        </>
                      ) : totalBookingFee === 0 || isLockedDetails ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Directly Book Free Follow-Up (Rs. 0)</span>
                        </>
                      ) : (
                        <span>Continue to Payment (Rs. {totalBookingFee})</span>
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* STEP 2: PAYMENT GATEWAY & INVOICE CONFIRMATION */
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">
                      {isReschedule
                        ? 'Confirm Rescheduled Appointment'
                        : totalBookingFee === 0
                        ? 'Confirm Free Follow-Up'
                        : 'Complete Payment'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isReschedule
                        ? 'Fee retained under existing 10-digit Appointment ID'
                        : totalBookingFee === 0
                        ? 'Zero-cost consultation linked to verified 10-digit Appointment ID'
                        : 'Select payment gateway to issue your live queue token'}
                    </p>
                  </div>
                  {totalBookingFee > 0 && (
                    <div className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-mono font-bold backdrop-blur-sm">
                      {Math.floor(paymentCountdown / 60)}:
                      {String(paymentCountdown % 60).padStart(2, '0')}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-2xl liquid-glass-subtle text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Patient:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {patientName} ({patientAge}y, {patientGender})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Mobile:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{patientMobile}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Date & Slot:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedDate} at {selectedSlotTime}
                    </span>
                  </div>
                  {activeTab === 'lab' && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Diagnostic Tests:</span>
                      <span className="font-bold text-teal-700 dark:text-teal-300 truncate max-w-[200px]">
                        {selectedTestList.map((t) => t.serviceName).join(', ')}
                      </span>
                    </div>
                  )}
                  {!isReschedule && (
                    <div className="flex justify-between pt-1.5 border-t border-slate-200/50 dark:border-white/10 text-sm font-black">
                      <span className="text-slate-800 dark:text-white">Amount Payable:</span>
                      <span className={totalBookingFee === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-teal-700 dark:text-teal-300'}>
                        {totalBookingFee === 0
                          ? 'FREE (Follow-Up)'
                          : `Rs. ${totalBookingFee}`}
                      </span>
                    </div>
                  )}
                </div>

                {totalBookingFee === 0 ? (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-2xl border text-xs space-y-1.5 backdrop-blur-sm ${
                      isReschedule ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-emerald-500/10 border-emerald-500/20'
                    }`}>
                      <div className={`flex items-center space-x-2 font-black text-sm ${
                        isReschedule ? 'text-cyan-900 dark:text-cyan-300' : 'text-emerald-900 dark:text-emerald-300'
                      }`}>
                        <CheckCircle2 className={`w-4 h-4 shrink-0 ${isReschedule ? 'text-cyan-600 dark:text-cyan-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
                        <span>{isReschedule ? 'Reschedule Appointment' : '100% Free Follow-Up Visit'}</span>
                      </div>
                      <p className={`leading-relaxed ${isReschedule ? 'text-cyan-800 dark:text-cyan-300/90' : 'text-emerald-700 dark:text-emerald-400/90'}`}>
                        {isReschedule
                          ? `Your consultation with Dr. ${selectedDoctor?.fullName || 'the specialist'} is shifted to ${selectedDate} at ${selectedSlotTime} under existing Token #${retainedAppointment?.trackingCode10Digit || followupCodeInput || initialTrackingCode}. No payment is charged.`
                          : `This follow-up consultation is retained under previous Appointment ID #${retainedAppointment?.trackingCode10Digit || followupCodeInput}. No payment is charged.`}
                      </p>
                    </div>

                    <div className="flex items-center space-x-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setBookingStep('details')}
                        className="py-3 px-4 liquid-glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer active:scale-95"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={submitting || isLookingUpCode}
                        onClick={() => handleConfirmBookingAndPayment()}
                        className={`flex-1 py-3 text-white font-black rounded-xl text-xs transition-all shadow-glass-base cursor-pointer active:scale-95 border-t border-white/20 disabled:opacity-50 ${
                          isReschedule
                            ? 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700'
                            : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                        }`}
                      >
                        {submitting
                          ? isReschedule
                            ? 'Shifting Appointment...'
                            : 'Issuing Free Follow-Up Token...'
                          : isReschedule
                          ? 'Confirm Rescheduled Appointment'
                          : 'Confirm Free Follow-Up Booking'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                        Choose Payment Method
                      </label>

                      {(() => {
                        const isDirect = clinic?.isDirectPaymentEnabled ?? false
                        const esewaUsable = isDirect && Boolean(paymentConfig?.esewa?.enabled && paymentConfig?.esewa?.is_verified)
                        const khaltiUsable = isDirect && Boolean(paymentConfig?.khalti?.enabled && paymentConfig?.khalti?.is_verified)
                        const fonepayUsable = isDirect && Boolean(paymentConfig?.fonepay?.enabled && paymentConfig?.fonepay?.is_verified)
                        const connectIpsUsable = isDirect && Boolean(paymentConfig?.connectips?.enabled && paymentConfig?.connectips?.is_verified)

                        const opts = [
                          ...(esewaUsable
                            ? [{
                                id: 'esewa',
                                title: paymentConfig?.esewa?.title || 'eSewa Mobile Wallet',
                                sub: paymentConfig?.esewa?.subtitle || 'Digital Wallet & NetBanking',
                                merchantId: paymentConfig?.esewa?.merchant_id || '',
                              }]
                            : []),
                          ...(khaltiUsable
                            ? [{
                                id: 'khalti',
                                title: paymentConfig?.khalti?.title || 'Khalti Digital Wallet',
                                sub: paymentConfig?.khalti?.subtitle || 'Instant Wallet & Mobile Banking',
                                merchantId: paymentConfig?.khalti?.merchant_id || '',
                              }]
                            : []),
                          ...(fonepayUsable
                            ? [{
                                id: 'fonepay',
                                title: paymentConfig?.fonepay?.title || 'Fonepay QR / Direct Banking',
                                sub: paymentConfig?.fonepay?.subtitle || 'Nepal Interbank QR Payment',
                                merchantId: paymentConfig?.fonepay?.merchant_id || '',
                              }]
                            : []),
                          ...(connectIpsUsable
                            ? [{
                                id: 'connectips',
                                title: paymentConfig?.connectips?.title || 'ConnectIPS Direct Bank',
                                sub: paymentConfig?.connectips?.subtitle || 'NCHL Direct Bank Account Transfer',
                                merchantId: paymentConfig?.connectips?.merchant_id || '',
                              }]
                            : []),
                          {
                            id: 'pay_at_desk',
                            title: 'Pay at Desk',
                            sub: 'Pay at clinic counter (+5% service charge applies)',
                            merchantId: '',
                          },
                        ]

                        return opts
                      })().map((opt) => (
                        <div
                          key={opt.id}
                          onClick={() => setSelectedPaymentMethod(opt.id as any)}
                          className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all active:scale-[0.98] ${
                            selectedPaymentMethod === opt.id
                              ? 'liquid-glass-elevated border-teal-500/50 ring-2 ring-teal-500/30 shadow-glass-sm'
                              : 'liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70'
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            {opt.id === 'esewa' ? (
                              <div className="w-10 h-10 rounded-xl bg-[#60BB46] shrink-0 flex items-center justify-center shadow-xs">
                                <span className="text-white font-black text-xl italic select-none" style={{ fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}>e</span>
                              </div>
                            ) : opt.id === 'khalti' ? (
                              <div className="w-10 h-10 rounded-xl bg-[#5D2E8E] shrink-0 flex items-center justify-center shadow-xs">
                                <span className="text-white font-black text-lg select-none" style={{ fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}>K</span>
                              </div>
                            ) : opt.id === 'fonepay' ? (
                              <div className="w-10 h-10 rounded-xl bg-[#C8102E] shrink-0 flex items-center justify-center shadow-xs text-white">
                                <QrCode className="w-5 h-5 stroke-[2.2]" />
                              </div>
                            ) : opt.id === 'connectips' ? (
                              <div className="w-10 h-10 rounded-xl bg-[#0B3B60] shrink-0 flex items-center justify-center shadow-xs text-white relative overflow-hidden">
                                <Building2 className="w-5 h-5 stroke-[2.2]" />
                                <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-[#E31B23]"></span>
                              </div>
                            ) : opt.id === 'pay_at_desk' ? (
                              <div className="w-10 h-10 rounded-xl bg-amber-500 shrink-0 flex items-center justify-center shadow-xs text-white">
                                <Store className="w-5 h-5 stroke-[2.2]" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-teal-500/10 shrink-0 flex items-center justify-center shadow-xs text-teal-600 dark:text-teal-400">
                                <CreditCard className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-1.5 flex-wrap">
                                <p className="text-xs font-black text-slate-900 dark:text-white truncate">{opt.title}</p>
                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                  opt.id === 'pay_at_desk'
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                }`}>
                                  {opt.id === 'pay_at_desk' ? '+5% Charge' : '0% Fee'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{opt.sub}</p>
                              {opt.merchantId && selectedPaymentMethod === opt.id && (
                                <p className="text-[10px] font-mono text-teal-700 dark:text-teal-300 mt-0.5">
                                  Verified Merchant: {opt.merchantId}
                                </p>
                              )}
                            </div>
                          </div>
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              selectedPaymentMethod === opt.id
                                ? 'border-teal-600 bg-teal-600'
                                : 'border-slate-300 dark:border-white/30'
                            }`}
                          >
                            {selectedPaymentMethod === opt.id && (
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedPaymentMethod === 'pay_at_desk' && (
                      <div className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 space-y-2.5 text-xs animate-in fade-in duration-200">
                        <div className="flex items-start space-x-2 text-amber-900 dark:text-amber-200 font-bold">
                          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <span>A {PAY_AT_DESK_SERVICE_CHARGE_PERCENT}% service charge will be added to your bill when paying at the desk</span>
                        </div>
                        <div className="p-3 liquid-glass-subtle rounded-xl space-y-1.5 border border-amber-500/20 text-xs">
                          <div className="flex justify-between text-slate-600 dark:text-slate-300">
                            <span>Consultation Fee:</span>
                            <span className="font-semibold">Rs. {totalBookingFee}</span>
                          </div>
                          <div className="flex justify-between text-slate-600 dark:text-slate-300">
                            <span>{PAY_AT_DESK_SERVICE_CHARGE_PERCENT}% Service Charge:</span>
                            <span className="font-semibold">Rs. {Number((totalBookingFee * (PAY_AT_DESK_SERVICE_CHARGE_PERCENT / 100)).toFixed(2))}</span>
                          </div>
                          <div className="border-t border-amber-500/20 pt-1.5 flex justify-between font-black text-slate-900 dark:text-white">
                            <span>Total at Desk:</span>
                            <span className="text-teal-700 dark:text-teal-300">Rs. {totalBookingFee + Number((totalBookingFee * (PAY_AT_DESK_SERVICE_CHARGE_PERCENT / 100)).toFixed(2))}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300">
                          Your request will be submitted with status WAITING_FOR_APPROVAL. No online payment is taken now.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center space-x-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Cancelling will stop this transaction and release your reserved slot. You will be redirected back to slot selection. Are you sure?')) {
                            setShowBookingModal(false)
                            setBookingStep('details')
                          }
                        }}
                        className="py-3 px-4 border border-rose-300 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 font-bold rounded-xl text-xs transition-colors cursor-pointer active:scale-95"
                      >
                        Cancel Transaction
                      </button>
                      <button
                        type="button"
                        disabled={submitting || paymentCountdown === 0}
                        onClick={() => handleConfirmBookingAndPayment()}
                        className="flex-1 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow-glass-base cursor-pointer active:scale-95 border-t border-white/20 flex items-center justify-center space-x-1.5"
                      >
                        <ShieldCheck className="w-4 h-4 mr-1 text-teal-200" />
                        <span>
                          {submitting
                            ? 'Processing...'
                            : totalBookingFee === 0
                            ? 'Confirm Free Follow-Up'
                            : selectedPaymentMethod === 'pay_at_desk'
                            ? `Confirm Pay at Desk (Rs. ${totalBookingFee + Number((totalBookingFee * (PAY_AT_DESK_SERVICE_CHARGE_PERCENT / 100)).toFixed(2))})`
                            : 'Confirm & Complete Payment'}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unapproved Pay at Desk Re-Booking Detection Modal */}
      {showPendingPayAtDeskModal && pendingPayAtDeskAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center space-x-3 text-amber-600 dark:text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Unapproved Pay at Desk Request
                </h3>
                <p className="text-xs text-slate-500">
                  Waiting for clinic counter approval
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-100/70 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 text-xs space-y-1.5">
              <p className="font-bold text-slate-800 dark:text-slate-100">
                Patient: {pendingPayAtDeskAppt.patientName}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Date: {pendingPayAtDeskAppt.appointmentDate} ({pendingPayAtDeskAppt.appointmentTime})
              </p>
              <p className="font-mono font-bold text-teal-600 dark:text-teal-400">
                Tracking Code: #{pendingPayAtDeskAppt.trackingCode10Digit}
              </p>
              <p className="text-amber-600 dark:text-amber-400 font-semibold">
                Status: Waiting for Counter Approval
              </p>
            </div>

            <p className="text-xs text-blue-800 dark:text-blue-300 bg-blue-50/80 dark:bg-blue-950/40 p-3 rounded-xl border border-blue-200 dark:border-blue-900/50">
              Pay at Desk does not hold your slot until approved by clinic counter staff. To book fresh or pay online (eSewa) to secure your spot, you can cancel this pending request.
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                disabled={isCancellingPendingDesk}
                onClick={handleCancelPendingDeskAndProceed}
                className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer active:scale-98 flex items-center justify-center space-x-2 shadow-xs"
              >
                {isCancellingPendingDesk ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Cancelling & Continuing...</span>
                  </>
                ) : (
                  <span>Cancel Request & Continue</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowPendingPayAtDeskModal(false)
                  window.location.href = `/?clinic=${clinicId}&trackingCode=${pendingPayAtDeskAppt.trackingCode10Digit}#live-tracker`
                }}
                className="w-full py-2.5 bg-teal-50 dark:bg-teal-950/30 border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-100 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Track Current Request
              </button>

              <button
                type="button"
                onClick={() => setShowPendingPayAtDeskModal(false)}
                className="w-full py-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium text-xs transition-colors cursor-pointer"
              >
                Keep Request & Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Fullscreen Interactive Map Viewer Modal */}
      {clinic && (
        <MapLibreLocationViewer
          mode="modal"
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          lat={clinic.latitude || 27.7052}
          lng={clinic.longitude || 85.3193}
          clinicName={clinic.name}
          addressText={clinic.addressText || 'Nepal'}
        />
      )}
    </div>
  )
}
