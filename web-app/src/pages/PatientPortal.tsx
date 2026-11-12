import React, { useState, useEffect, useMemo } from 'react'
import {
  User,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  CreditCard,
  Bell,
  Search,
  LogIn,
  LogOut,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Send,
  Eye,
  RefreshCw,
  Phone,
  UserCheck,
  X,
  Copy,
  Check,
  Activity,
  Stethoscope,
  Building2,
  Trash2,
  Users,
  Sparkles,
  MapPin,
  ExternalLink,
  ChevronDown,
  Download,
  Receipt,
  Printer,
  ArrowRight,
  ArrowLeft,
  Timer,
  AlertTriangle,
  Info,
  Lock,
  Unlock,
  KeyRound,
  CalendarRange,
  FlaskConical,
  Layers,
  History,
  CheckSquare,
  Square,
  Tag,
  Headphones,
  HelpCircle,
  LifeBuoy,
  MessageSquare,
  QrCode,
  Store,
} from 'lucide-react'
function triggerConfettiBurst() {
  try {
    const canvas = document.createElement('canvas')
    canvas.style.position = 'fixed'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100vw'
    canvas.style.height = '100vh'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '99999'
    document.body.appendChild(canvas)

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: any[] = []
    const colors = ['#10B981', '#06B6D4', '#3B82F6', '#F59E0B', '#EC4899']

    for (let i = 0; i < 70; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height * 0.5,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.8) * 16,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
        opacity: 1,
      })
    }

    let animationFrame: number
    const start = performance.now()

    function animate(now: number) {
      if (now - start > 2500) {
        cancelAnimationFrame(animationFrame)
        canvas.remove()
        return
      }
      ctx!.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.35
        p.rotation += p.vr
        p.opacity = Math.max(0, 1 - (now - start) / 2500)

        ctx!.save()
        ctx!.translate(p.x, p.y)
        ctx!.rotate((p.rotation * Math.PI) / 180)
        ctx!.globalAlpha = p.opacity
        ctx!.fillStyle = p.color
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        ctx!.restore()
      })
      animationFrame = requestAnimationFrame(animate)
    }
    animationFrame = requestAnimationFrame(animate)
  } catch {}
}
import {
  Clinic,
  Doctor,
  Appointment,
  Slot,
  ClinicService,
  LabReport,
  DactorNotification,
  PatientProfile,
  PatientTransactionRecord,
  PaymentGatewaysConfig,
  OnlineGatewayId,
  PAY_AT_DESK_SERVICE_CHARGE_PERCENT,
  SupportTicket,
  BillingInvoice,
  getEffectiveAppointmentTotal,
  getEffectiveServiceCharge,
} from '../types'
import {
  getClinics,
  getClinicById,
  getDoctors,
  getDoctorsByClinic,
  getClinicServices,
  getSlots,
  getMonthSlots,
  createAppointment,
  generate10DigitTrackingCode,
  getInvoiceForAppointment,
  getPatientProfileByEmail,
  savePatientProfile,
  getAppointmentsByPatient,
  getPatientTransactions,
  cancelAppointment,
  retryPayAtDeskAppointment,
  shiftAppointmentDate,
  getAppointmentByTrackingCode,
  getAllAppointmentsByTrackingCode,
  getAppointmentByTrackingCodeOrContact,
  getClinicPaymentConfig,
  isSlotTimeExpired,
  recordPaymentTransaction,
  getLabReportsByTrackingCode,
  requestGuestLabReportUrl,
  requestAuthorizedDocumentUrl,
  getPatientNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  checkEmailPortalAssociation,
  schedulePatientArchive,
  cancelPatientArchive,
  deletePatientProfilePermanently,
  getSupportUrl,
  getSupportTickets,
  getSupportTicketByCodeOrContact,
  getAppointmentById,
  startOnlinePayment,
  refreshOnlinePayment,
  initiateOnlinePaymentPhase,
  cancelPendingAppointment,
} from '../services/db'
import {
  firebaseSignOut,
  signInWithFirebaseGoogle,
  checkRedirectGoogleUser,
  onFirebaseAuthStateChanged,
  deleteFirebaseUserAccount,
} from '../lib/firebase'
import { supabase } from '../lib/supabase'
import {
  matchClinic,
  QUICK_SPECIALTY_SUGGESTIONS,
  getRecentSearches,
  saveRecentSearch,
} from '../utils/searchEngine'
import {
  parsePaymentRecords,
  extractCleanClinicalRemarks,
  WebPaymentRecord,
} from '../utils/paymentLedger'
import { escapeHtml } from '../utils/html'

// ==========================================
// CLINIC & DOCTOR PROFILE CARD SUBCOMPONENTS
// (1:1 Android App Parity with Graceful Fallbacks)
// ==========================================
const ClinicImageBanner: React.FC<{ clinic: Clinic; isLab?: boolean }> = ({ clinic, isLab }) => {
  const [imgError, setImgError] = useState(false)
  const firstPic =
    clinic.pictures && clinic.pictures.length > 0
      ? clinic.pictures[0]
      : clinic.logoUrl || (clinic as any).logo_url || null

  const hasValidImage = Boolean(firstPic) && !imgError

  return (
    <div className="h-36 sm:h-40 w-full relative overflow-hidden bg-[#E6F4F1] dark:bg-slate-800 flex items-center justify-center">
      {hasValidImage ? (
        <img
          src={firstPic!}
          alt={clinic.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-sky-50 to-teal-50 dark:from-slate-800 dark:to-slate-900">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/15 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-inner">
            <Building2 className="w-7 h-7" />
          </div>
        </div>
      )}

      {/* Verified Clinic Pill Badge (Top Right) */}
      <span className="absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100/90 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700 backdrop-blur-xs flex items-center space-x-1 shadow-xs">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
        <span>Verified Clinic</span>
      </span>

      {/* Diagnostic Lab Pill Badge if applicable */}
      {isLab && (
        <span className="absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full bg-purple-100/90 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-300/80 dark:border-purple-700 backdrop-blur-xs flex items-center space-x-1 shadow-xs">
          <FlaskConical className="w-3 h-3 text-purple-600 dark:text-purple-400" />
          <span>Diagnostic Lab</span>
        </span>
      )}
    </div>
  )
}

const DoctorAvatarBanner: React.FC<{ doctor: Doctor; hasClinics: boolean }> = ({ doctor, hasClinics }) => {
  const [imgError, setImgError] = useState(false)
  const avatarUrl =
    (doctor as any).resolvedProfilePictureUrl ||
    doctor.profilePictureUrl ||
    (doctor as any).photoUrl ||
    null
  const hasValidImg = Boolean(avatarUrl) && !imgError

  const initials = useMemo(() => {
    const parts = (doctor.fullName || '').split(' ').filter(Boolean)
    if (parts.length === 0) return 'DR'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }, [doctor.fullName])

  return (
    <div className="h-28 sm:h-32 w-full p-4 relative flex items-center bg-gradient-to-r from-blue-100 via-sky-100 to-teal-100 dark:from-slate-800 dark:via-blue-950 dark:to-slate-900">
      <div className="flex items-center space-x-3.5">
        <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-white dark:bg-slate-800 border-2 border-teal-600 dark:border-teal-400 shadow-sm flex items-center justify-center overflow-hidden shrink-0">
          {hasValidImg ? (
            <img
              src={avatarUrl!}
              alt={doctor.fullName}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <span className="font-extrabold text-teal-700 dark:text-teal-300 text-lg sm:text-xl">
              {initials}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h4 className="font-black text-slate-900 dark:text-white text-base sm:text-lg leading-tight truncate">
            Dr. {doctor.fullName.replace(/^dr\.?\s*/i, '')}
          </h4>
          <p className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate">
            {doctor.specialty || 'Medical Specialist'}
          </p>
          {(doctor as any).qualifications || (doctor as any).education ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {(doctor as any).qualifications || (doctor as any).education}
            </p>
          ) : (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Nepal Medical Council Verified</p>
          )}
        </div>
      </div>

      {/* Doctor Status Badge */}
      <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-2xs backdrop-blur-xs bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700">
        {(doctor as any).isInClinic ? '● In Clinic' : hasClinics ? 'Verified Doctor' : 'Not affiliated'}
      </span>
    </div>
  )
}

interface PatientPortalProps {
  initialTab?: 'appointments' | 'records' | 'account' | 'book' | 'transactions' | 'reports' | 'notifications'
  onNavigateHome?: () => void
  onOpenLiveQueue?: (trackingCode: string) => void
  onOpenReportModal?: (trackingCode: string) => void
  onNavigate?: (tab: string, params?: any) => void
}

export const PatientPortal: React.FC<PatientPortalProps> = ({
  initialTab,
  onNavigateHome,
  onOpenLiveQueue,
  onOpenReportModal,
  onNavigate,
}) => {
  // ==========================================
  // AUTHENTICATION & PATIENT PROFILE STATE
  // ==========================================
  const [patientUser, setPatientUser] = useState<PatientProfile | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)

  // Auth Modals & Inputs (Strictly Google Sign-In Only)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authSubmitting, setAuthSubmitting] = useState(false)

  // Edit Profile Modal
  const [showEditProfileModal, setShowEditProfileModal] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editAge, setEditAge] = useState('')
  const [editGender, setEditGender] = useState('Male')
  const [editCity, setEditCity] = useState('')
  const [editTermsAccepted, setEditTermsAccepted] = useState(false)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [supportUrl, setSupportUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('dactor_support_url') || 'https://rajanpurbe.github.io/Dactor/support'
    } catch {
      return 'https://rajanpurbe.github.io/Dactor/support'
    }
  })

  useEffect(() => {
    getSupportUrl().then((url) => {
      if (url) setSupportUrl(url)
    })
  }, [])

  // Account Deletion State
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [isDeletingPermanently, setIsDeletingPermanently] = useState(false)

  // Active Tab matching Android App Navigation (Defaults to 'book')
  const [activeTab, setActiveTab] = useState<
    'appointments' | 'records' | 'account' | 'book' | 'transactions' | 'reports' | 'notifications'
  >(initialTab || 'book')

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  // Records Tab Sub-Filter & Search
  const [recordsFilter, setRecordsFilter] = useState<'all' | 'visits' | 'reports' | 'bills'>('all')
  const [recordsSearchQuery, setRecordsSearchQuery] = useState('')

  // Account Tab Sub-Section
  const [accountSection, setAccountSection] = useState<'consultations' | 'transactions' | 'notifications' | 'support' | 'privacy'>('consultations')

  useEffect(() => {
    if (activeTab === 'notifications') setAccountSection('notifications')
    if (activeTab === 'transactions') setAccountSection('transactions')
    if (activeTab === 'reports') setRecordsFilter('reports')
  }, [activeTab])

  // Support / Help Requests State
  const [patientTickets, setPatientTickets] = useState<SupportTicket[]>([])
  const [loadingPatientTickets, setLoadingPatientTickets] = useState(false)
  const [ticketSearchInput, setTicketSearchInput] = useState('')
  const [ticketLookupResult, setTicketLookupResult] = useState<SupportTicket | null>(null)
  const [isSearchingTicket, setIsSearchingTicket] = useState(false)
  const [ticketSearchError, setTicketSearchError] = useState<string | null>(null)

  // Copied code feedback
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // ==========================================
  // APPOINTMENTS & LIVE QUEUE STATE
  // ==========================================
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([])
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false)
  const [appointmentFilter, setAppointmentFilter] = useState<'active' | 'past'>('active')
  const [cancellingApptId, setCancellingApptId] = useState<string | null>(null)
  const [retryingApptId, setRetryingApptId] = useState<string | null>(null)

  const handleRetryPayAtDesk = async (appt: Appointment) => {
    if (retryingApptId) return
    setRetryingApptId(appt.id)
    try {
      const res = await retryPayAtDeskAppointment(appt.id, appt.patientMobile || undefined)
      if (res.success) {
        await loadAppointments()
      } else {
        alert(res.error || 'Failed to retry appointment request')
      }
    } catch (e: any) {
      alert(e.message || 'Error retrying appointment')
    } finally {
      setRetryingApptId(null)
    }
  }

  // ==========================================
  // BOOKING WIZARD STATE
  // ==========================================
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [clinicSearchQuery, setClinicSearchQuery] = useState('')
  const [selectedEntityFilter, setSelectedEntityFilter] = useState<'all' | 'doctors' | 'clinics' | 'labs'>('all')
  const [selectedDoctorForClinicPicker, setSelectedDoctorForClinicPicker] = useState<Doctor | null>(null)
  const [clinicCategoryFilter, setClinicCategoryFilter] = useState<
    'all' | 'single_doctor' | 'polyclinic' | 'diagnostic_lab'
  >('all')
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)
  const [clinicDoctors, setClinicDoctors] = useState<Doctor[]>([])
  const [clinicServices, setClinicServices] = useState<ClinicService[]>([])
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [selectedService, setSelectedService] = useState<ClinicService | null>(null)
  const [selectedLabTests, setSelectedLabTests] = useState<ClinicService[]>([])
  const [bookingMode, setBookingMode] = useState<'opd' | 'lab'>('opd')
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([])
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('all')
  const [viewingBillAppt, setViewingBillAppt] = useState<Appointment | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<BillingInvoice | null>(null)
  const [viewingPrescriptionAppt, setViewingPrescriptionAppt] = useState<Appointment | null>(null)
  const [cancellingAppt, setCancellingAppt] = useState<Appointment | null>(null)
  const [cancellationReason, setCancellationReason] = useState<string>('Schedule conflict')
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false)

  // Consultation & Record Details Modal State (1:1 Android Parity)
  const [viewingConsultationDetailsAppt, setViewingConsultationDetailsAppt] = useState<Appointment | null>(null)
  const [associatedVisitsForDetail, setAssociatedVisitsForDetail] = useState<Appointment[]>([])
  const [isLoadingVisitsForDetail, setIsLoadingVisitsForDetail] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState<BillingInvoice | null>(null)
  const [detailLabReports, setDetailLabReports] = useState<LabReport[]>([])

  // Record Removal & Reschedule Confirmation Modals
  const [apptToRemoveConfirm, setApptToRemoveConfirm] = useState<Appointment | null>(null)
  const [apptToRescheduleConfirm, setApptToRescheduleConfirm] = useState<Appointment | null>(null)

  useEffect(() => {
    if (viewingBillAppt) {
      getInvoiceForAppointment(viewingBillAppt.id)
        .then((inv) => setViewingInvoice(inv))
        .catch(() => setViewingInvoice(null))
    } else {
      setViewingInvoice(null)
    }
  }, [viewingBillAppt])

  useEffect(() => {
    const target = viewingConsultationDetailsAppt
    if (!target) {
      setAssociatedVisitsForDetail([])
      setDetailInvoice(null)
      setDetailLabReports([])
      return
    }
    setIsLoadingVisitsForDetail(true)

    // 1. Fetch Invoice for target appointment
    getInvoiceForAppointment(target.id)
      .then((inv) => setDetailInvoice(inv))
      .catch(() => setDetailInvoice(null))

    // 2. Fetch Lab Reports for target appointment tracking code
    getLabReportsByTrackingCode(target.trackingCode10Digit)
      .then((reps) => setDetailLabReports(reps || []))
      .catch(() => setDetailLabReports([]))

    // 3. Collect associated visits from Supabase & local state
    ;(async () => {
      try {
        const targetCode = target.trackingCode10Digit
        const fetchedVisits = targetCode ? await getAllAppointmentsByTrackingCode(targetCode) : []
        const codeMatches = myAppointments.filter((a) => a.trackingCode10Digit === targetCode)
        const hiddenCodes = getHiddenRecordCodes()
        const combined = [...fetchedVisits, ...codeMatches, target]
          .filter((a, idx, self) => self.findIndex((s) => s.id === a.id) === idx)
          .filter((a) => !hiddenCodes.includes(a.trackingCode10Digit) && !hiddenCodes.includes(a.id))
          .sort((a, b) => {
            const dateComp = (b.appointmentDate || '').localeCompare(a.appointmentDate || '')
            if (dateComp !== 0) return dateComp
            return (b.appointmentTime || '').localeCompare(a.appointmentTime || '')
          })
        setAssociatedVisitsForDetail(combined.length > 0 ? combined : [target])
      } catch {
        setAssociatedVisitsForDetail([target])
      } finally {
        setIsLoadingVisitsForDetail(false)
      }
    })()
  }, [viewingConsultationDetailsAppt, myAppointments])

  const clinicDoctorsMap = useMemo(() => {
    const map: Record<string, Doctor[]> = {}
    for (const doc of allDoctors) {
      if (doc.clinicId) {
        if (!map[doc.clinicId]) map[doc.clinicId] = []
        map[doc.clinicId].push(doc)
      }
    }
    return map
  }, [allDoctors])

  const availableCities = useMemo(() => {
    const set = new Set<string>()
    for (const c of clinics) {
      if (c.city && c.city.trim()) set.add(c.city.trim())
      else if (c.addressText) {
        const parts = c.addressText.split(',')
        const last = parts[parts.length - 1]?.trim()
        if (last && last.length < 25) set.add(last)
      }
    }
    return Array.from(set)
  }, [clinics])

  // Polyclinic Follow-Up Visit State
  const [isReturningPatient, setIsReturningPatient] = useState(false)
  const [isRescheduleMode, setIsRescheduleMode] = useState(false)
  const [followupCodeInput, setFollowupCodeInput] = useState('')
  const [retainedAppointment, setRetainedAppointment] = useState<Appointment | null>(null)
  const [isLookingUpCode, setIsLookingUpCode] = useState(false)
  const [followupLookupError, setFollowupLookupError] = useState<string | null>(null)

  // 3 Clinic Types Classification for active clinic
  const isLabClinic = useMemo(() => {
    if (!selectedClinic) return false
    const t = (selectedClinic.type || '').toLowerCase()
    const n = (selectedClinic.name || '').toLowerCase()
    return (
      t === 'diagnostic_lab' ||
      t.includes('lab') ||
      n.includes('lab') ||
      (selectedClinic.specialties?.some(
        (s) => s.toLowerCase().includes('lab') || s.toLowerCase().includes('patholog')
      ) ?? false)
    )
  }, [selectedClinic])

  const isSingleDoctorClinic = useMemo(() => {
    if (isLabClinic) return false
    return (
      selectedClinic?.type === 'single_visit' ||
      selectedClinic?.type === 'single_doctor' ||
      clinicDoctors.length === 1
    )
  }, [isLabClinic, selectedClinic?.type, clinicDoctors.length])

  const isPolyclinic = useMemo(() => {
    return !isLabClinic && !isSingleDoctorClinic
  }, [isLabClinic, isSingleDoctorClinic])

  // Auto-bind single doctor if Single Doctor Clinic
  useEffect(() => {
    if (isSingleDoctorClinic && clinicDoctors.length > 0) {
      setSelectedDoctor(clinicDoctors[0])
    }
  }, [isSingleDoctorClinic, clinicDoctors])

  // Local Time ISO Date Anchor (Prevents UTC timezone rollover bugs)
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

  // Date & Slot Selection
  const [bookingDate, setBookingDate] = useState<string>(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)

  // Follow-Up 10-Digit Code Realtime Lookup
  useEffect(() => {
    let active = true
    const clean = followupCodeInput.trim()
    if (isRescheduleMode && retainedAppointment && retainedAppointment.trackingCode10Digit === clean) {
      return
    }
    if (isReturningPatient && clean.length === 10 && /^\d{10}$/.test(clean)) {
      setIsLookingUpCode(true)
      setFollowupLookupError(null)
      getAppointmentByTrackingCode(clean)
        .then((found) => {
          if (!active) return
          setIsLookingUpCode(false)
          if (found) {
            setRetainedAppointment(found)
            setBookPatientName(found.patientName)
            setBookPatientAge(String(found.patientAge || ''))
            setBookPatientGender(found.patientGender || 'Male')
            setBookPatientPhone(found.patientMobile || '')
            if (found.doctorId && clinicDoctors.length > 0) {
              const matchedDoc = clinicDoctors.find((d) => d.id === found.doctorId)
              if (matchedDoc) setSelectedDoctor(matchedDoc)
            }
          } else {
            setRetainedAppointment(null)
            setFollowupLookupError(`No appointment record found for 10-digit code #${clean}.`)
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
      if (clean.length > 0 && clean.length !== 10) {
        setFollowupLookupError('Code must be exactly 10 digits.')
      } else {
        setFollowupLookupError(null)
      }
    }
    return () => {
      active = false
    }
  }, [isReturningPatient, followupCodeInput, clinicDoctors])

  // Patient Details for Booking
  const [bookPatientName, setBookPatientName] = useState('')
  const [bookPatientPhone, setBookPatientPhone] = useState('')
  const [bookPatientAge, setBookPatientAge] = useState('')
  const [bookPatientGender, setBookPatientGender] = useState('Male')
  const [bookPatientNotes, setBookPatientNotes] = useState('')

  // Wizard Step (1: Clinic & Doctor, 2: Slot & Date, 3: Details, 4: Payment, 5: Confirmed)
  const [bookingStep, setBookingStep] = useState<number>(1)
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false)
  const [confirmedBooking, setConfirmedBooking] = useState<Appointment | null>(null)

  // Payment State
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    OnlineGatewayId | 'pay_at_desk' | 'cash'
  >('pay_at_desk')
  const [clinicPaymentConfig, setClinicPaymentConfig] = useState<PaymentGatewaysConfig | null>(null)
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false)
  const [isVerifyingEsewa, setIsVerifyingEsewa] = useState(false)
  const [esewaVerifyMessage, setEsewaVerifyMessage] = useState<string | null>(null)
  const [transactionFailedNotice, setTransactionFailedNotice] = useState<string | null>(null)

  // Persistent 5-Minute (300 seconds) Countdown Timer
  const [paymentTimeRemaining, setPaymentTimeRemaining] = useState<number>(300)

  // ==========================================
  // TRANSACTIONS STATE
  // ==========================================
  const [transactions, setTransactions] = useState<PatientTransactionRecord[]>([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)

  // ==========================================
  // LAB REPORTS STATE
  // ==========================================
  const [patientLabReports, setPatientLabReports] = useState<LabReport[]>([])
  const [isLoadingReports, setIsLoadingReports] = useState(false)

  // ==========================================
  // NOTIFICATIONS STATE
  // ==========================================
  const [notifications, setNotifications] = useState<DactorNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [guestCodesVersion, setGuestCodesVersion] = useState(0)

  // Memoized records lists for Directory & Records Tab (All Active & Completed Records)
  const filteredCompletedAppointments = useMemo(() => {
    const hidden = getHiddenRecordCodes()
    return myAppointments.filter((appt) => {
      if (hidden.includes(appt.trackingCode10Digit) || hidden.includes(appt.id)) return false
      if (!recordsSearchQuery.trim()) return true
      const q = recordsSearchQuery.toLowerCase()
      const dName = appt.doctor?.fullName?.toLowerCase() || ''
      const cName = appt.clinic?.name?.toLowerCase() || ''
      const pName = appt.patientName?.toLowerCase() || ''
      const token = appt.trackingCode10Digit?.toLowerCase() || ''
      const notes = (appt.notes || '').toLowerCase()
      return (
        dName.includes(q) ||
        cName.includes(q) ||
        pName.includes(q) ||
        token.includes(q) ||
        notes.includes(q)
      )
    })
  }, [myAppointments, recordsSearchQuery])

  const filteredLabReports = useMemo(() => {
    return patientLabReports.filter((rep) => {
      if (!recordsSearchQuery.trim()) return true
      const q = recordsSearchQuery.toLowerCase()
      const tName = rep.testName?.toLowerCase() || ''
      const pName = rep.patientName?.toLowerCase() || ''
      const token = rep.trackingCode10Digit?.toLowerCase() || ''
      return tName.includes(q) || pName.includes(q) || token.includes(q)
    })
  }, [patientLabReports, recordsSearchQuery])

  const filteredTransactionBills = useMemo(() => {
    return transactions.filter((tx) => {
      if (!recordsSearchQuery.trim()) return true
      const q = recordsSearchQuery.toLowerCase()
      const dName = tx.doctorName?.toLowerCase() || ''
      const cName = tx.clinicName?.toLowerCase() || ''
      const txId = tx.transactionId?.toLowerCase() || ''
      const token = tx.trackingCode?.toLowerCase() || ''
      return dName.includes(q) || cName.includes(q) || txId.includes(q) || token.includes(q)
    })
  }, [transactions, recordsSearchQuery])

  // ==========================================
  // PENDING BOOKING REDIRECT & TOAST STATE
  // ==========================================
  const [pendingBookingRedirectNotice, setPendingBookingRedirectNotice] = useState(false)
  const [bookingRestoredToast, setBookingRestoredToast] = useState<string | null>(null)

  // ==========================================
  // CLAIM APPOINTMENT WITH 10-DIGIT CODE STATE
  // ==========================================
  const [showClaimModal, setShowClaimModal] = useState(false)
  const [claimCodeInput, setClaimCodeInput] = useState('')
  const [claimCodeError, setClaimCodeError] = useState<string | null>(null)
  const [isClaimingCode, setIsClaimingCode] = useState(false)

  // ==========================================
  // RESCHEDULE APPOINTMENT STATE
  // ==========================================
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null)
  const [newRescheduleDate, setNewRescheduleDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [newRescheduleTime, setNewRescheduleTime] = useState<string>('10:00 AM - 11:00 AM')
  const [newRescheduleSlotId, setNewRescheduleSlotId] = useState<string | undefined>(undefined)
  const [rescheduleReason, setRescheduleReason] = useState<string>('')
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [rescheduleAvailableSlots, setRescheduleAvailableSlots] = useState<Slot[]>([])
  const [isLoadingRescheduleSlots, setIsLoadingRescheduleSlots] = useState(false)

  // Dynamically load published timed slots when rescheduling
  useEffect(() => {
    if (rescheduleAppt && rescheduleAppt.clinicId && newRescheduleDate) {
      setIsLoadingRescheduleSlots(true)
      getSlots(rescheduleAppt.clinicId, newRescheduleDate)
        .then((slots) => {
          const avail = (slots || []).filter(
            (s) =>
              s.isAvailable !== false &&
              (s.bookedCount || 0) < (s.maxCapacity || 10) &&
              !isSlotTimeExpired(newRescheduleDate, s.endTime || s.startTime, s.startTime) &&
              (!rescheduleAppt.doctorId || !s.doctorId || s.doctorId === rescheduleAppt.doctorId)
          )
          setRescheduleAvailableSlots(avail)
          if (avail.length > 0) {
            setNewRescheduleTime(`${avail[0].startTime} - ${avail[0].endTime}`)
            setNewRescheduleSlotId(avail[0].id)
          } else {
            setNewRescheduleSlotId(undefined)
          }
        })
        .catch(() => {
          setRescheduleAvailableSlots([])
          setNewRescheduleSlotId(undefined)
        })
        .finally(() => setIsLoadingRescheduleSlots(false))
    } else {
      setRescheduleAvailableSlots([])
      setNewRescheduleSlotId(undefined)
    }
  }, [rescheduleAppt, newRescheduleDate])

  // ==========================================
  // LAB REPORTS PRIVACY VERIFICATION & SEARCH
  // ==========================================
  const [reportSearchCode, setReportSearchCode] = useState('')
  const [isSearchingReport, setIsSearchingReport] = useState(false)
  const [reportSearchError, setReportSearchError] = useState<string | null>(null)
  const [unlockedReportIds, setUnlockedReportIds] = useState<string[]>([])
  const [unlockedReportUrls, setUnlockedReportUrls] = useState<Record<string, string>>({})
  const [verifyingReport, setVerifyingReport] = useState<LabReport | null>(null)
  const [verifyMethod, setVerifyMethod] = useState<'name' | 'phone'>('phone')
  const [verificationInput, setVerificationInput] = useState('')
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const [isVerifyingReport, setIsVerifyingReport] = useState(false)

  // ==========================================
  // INITIALIZATION & SESSION RESTORE
  // ==========================================
  useEffect(() => {
    async function restoreSession() {
      setIsAuthLoading(true)
      try {
        const redirectedUser = await checkRedirectGoogleUser()
        const storedEmail =
          redirectedUser?.email ||
          localStorage.getItem('dactor_patient_email')
        if (storedEmail) {
          const rawCached = localStorage.getItem('dactor_patient_session')
          let cachedProf: PatientProfile | null = null
          if (rawCached) {
            try {
              cachedProf = JSON.parse(rawCached)
            } catch {}
          }

          const profile = await getPatientProfileByEmail(storedEmail)
          if (profile && profile.fullName) {
            const photo = redirectedUser?.photoURL || profile.photoUrl || cachedProf?.photoUrl
            const fullProfile = { ...profile, photoUrl: photo }
            setPatientUser(fullProfile)
            initProfileFields(fullProfile)
            try {
              localStorage.setItem('dactor_patient_session', JSON.stringify(fullProfile))
            } catch {}
          } else if (cachedProf && cachedProf.fullName) {
            const photo = redirectedUser?.photoURL || cachedProf.photoUrl
            const fullProfile = { ...cachedProf, photoUrl: photo }
            setPatientUser(fullProfile)
            initProfileFields(fullProfile)
          } else {
            // New user without full profile: prompt for details
            const partial: PatientProfile = {
              id: crypto.randomUUID(),
              email: storedEmail,
              fullName: '',
              photoUrl: redirectedUser?.photoURL,
              gender: 'Male',
              role: 'patient',
            }
            setPatientUser(partial)
            initProfileFields(partial)
            setShowEditProfileModal(true)
          }
        }
        // Load clinics and doctors for booking
        const [cList, docList] = await Promise.all([getClinics(), getDoctors()])
        const activeClinics = cList.filter((c) => !c.isArchived)
        setClinics(activeClinics)
        setAllDoctors(docList)

        // Restore pending booking redirect if exists
        const pendingRaw = localStorage.getItem('dactor_pending_booking_redirect')
        if (pendingRaw) {
          try {
            const parsed = JSON.parse(pendingRaw)
            if (parsed.clinicId) {
              const clinicMatch = activeClinics.find((c) => c.id === parsed.clinicId)
              if (clinicMatch) {
                setSelectedClinic(clinicMatch)
                const [docs, servs, pCfg] = await Promise.all([
                  getDoctorsByClinic(clinicMatch.id),
                  getClinicServices(clinicMatch.id),
                  getClinicPaymentConfig(clinicMatch.id),
                ])
                setClinicDoctors(docs)
                setClinicServices(servs.filter((s) => s.isAvailable))
                setClinicPaymentConfig(pCfg)

                if (parsed.doctorId) {
                  const docMatch = docs.find((d) => d.id === parsed.doctorId)
                  if (docMatch) setSelectedDoctor(docMatch)
                }
                if (parsed.serviceId) {
                  const servMatch = servs.find((s) => s.id === parsed.serviceId)
                  if (servMatch) setSelectedService(servMatch)
                }
                if (parsed.bookingMode) setBookingMode(parsed.bookingMode)
                if (parsed.bookingDate) setBookingDate(parsed.bookingDate)

                if (parsed.selectedSlotId) {
                  const rawSlots = await getSlots(clinicMatch.id, parsed.bookingDate)
                  const validSlots = rawSlots.filter((slot) => {
                    const isExpired = isSlotTimeExpired(parsed.bookingDate, slot.endTime, slot.startTime)
                    const hasCapacity = slot.bookedCount < slot.maxCapacity
                    return !isExpired && hasCapacity && slot.isAvailable !== false
                  })
                  setAvailableSlots(validSlots)
                  const slotMatch = validSlots.find((s) => s.id === parsed.selectedSlotId)
                  if (slotMatch) setSelectedSlot(slotMatch)
                }

                if (storedEmail) {
                  setActiveTab('book')
                  setBookingStep(3)
                  localStorage.removeItem('dactor_pending_booking_redirect')
                  setPendingBookingRedirectNotice(false)
                  setBookingRestoredToast('Booking selection restored! Resuming right where you left off.')
                  setTimeout(() => setBookingRestoredToast(null), 4000)
                } else {
                  setPendingBookingRedirectNotice(true)
                }
              }
            }
          } catch (e) {
            console.warn('Pending booking restore notice:', e)
          }
        }
      } catch (err) {
        console.error('Session restore error:', err)
      } finally {
        setIsAuthLoading(false)
      }
    }
    restoreSession()
  }, [])

  // Listen for Firebase Auth state changes (popup completion, cached token hydration)
  useEffect(() => {
    let isMounted = true
    const unsub = onFirebaseAuthStateChanged(async (u) => {
      if (!isMounted || !u || !u.email) return

      // If user is already loaded with the same email, don't re-fetch
      if (patientUser && patientUser.email.toLowerCase() === u.email.toLowerCase()) return

      try {
        const assoc = await checkEmailPortalAssociation(u.email)
        if (assoc && assoc.portal !== 'patient') return

        const profile = await getPatientProfileByEmail(u.email)
        const photo = u.photoURL || profile?.photoUrl
        if (profile && profile.fullName) {
          const fullProfile = { ...profile, photoUrl: photo }
          if (isMounted) {
            setPatientUser(fullProfile)
            initProfileFields(fullProfile)
            localStorage.setItem('dactor_patient_email', profile.email)
            localStorage.setItem('dactor_patient_session', JSON.stringify(fullProfile))
            localStorage.setItem('dactor_patient_logged_in', 'true')
            window.dispatchEvent(new Event('storage'))
          }
        }
      } catch (err) {
        console.warn('onFirebaseAuthStateChanged restore notice:', err)
      }
    })

    return () => {
      isMounted = false
      if (typeof unsub === 'function') unsub()
    }
  }, [patientUser])

  const archiveDaysLeft = React.useMemo(() => {
    if (!patientUser?.deletionScheduledAt) return 30
    try {
      const scheduled = new Date(patientUser.deletionScheduledAt).getTime()
      const diff = Math.ceil((scheduled - Date.now()) / (1000 * 60 * 60 * 24))
      return Math.max(1, Math.min(30, diff))
    } catch {
      return 30
    }
  }, [patientUser?.deletionScheduledAt])

  const handleCancelPatientArchive = async () => {
    if (!patientUser) return
    const ok = await cancelPatientArchive(patientUser.id)
    if (ok) {
      const updated = { ...patientUser, isArchived: false, deletionScheduledAt: undefined }
      setPatientUser(updated)
      localStorage.setItem('dactor_patient_session', JSON.stringify(updated))
    } else {
      alert('Could not cancel deletion. Please try again.')
    }
  }

  const handleSchedulePatientArchive = async () => {
    if (!patientUser) return
    const ok = await schedulePatientArchive(patientUser.id)
    if (ok) {
      const updated = {
        ...patientUser,
        isArchived: true,
        deletionScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }
      setPatientUser(updated)
      localStorage.setItem('dactor_patient_session', JSON.stringify(updated))
      setShowDeleteConfirmModal(false)
      setShowEditProfileModal(false)
    } else {
      alert('Could not schedule account deletion. Please try again.')
    }
  }

  const handlePermanentDeletePatient = async () => {
    if (!patientUser) return
    const confirmName = window.prompt(
      `⚠️ PERMANENT ACCOUNT DELETION:\nThis will permanently delete your patient profile and authentication credentials.\n\nType "${patientUser.fullName}" to confirm:`
    )
    if (confirmName !== patientUser.fullName) {
      if (confirmName !== null) alert('Name did not match. Account deletion aborted.')
      return
    }

    setIsDeletingPermanently(true)
    try {
      await deletePatientProfilePermanently(patientUser.id)
      await deleteFirebaseUserAccount()
      localStorage.removeItem('dactor_patient_session')
      setPatientUser(null)
      setShowDeleteConfirmModal(false)
      setShowEditProfileModal(false)
      alert('Your patient account and authentication details have been permanently deleted.')
    } catch (e: any) {
      alert(`Error during deletion: ${e?.message || e}`)
    } finally {
      setIsDeletingPermanently(false)
    }
  }

  function initProfileFields(profile: PatientProfile) {
    setEditName(profile.fullName || '')
    setEditPhone(profile.phone || '')
    setEditAge(profile.age ? profile.age.toString() : '')
    setEditGender(profile.gender || 'Male')
    setEditCity(profile.city || '')
    setEditTermsAccepted(!!profile.fullName)

    setBookPatientName(profile.fullName || '')
    setBookPatientPhone(profile.phone || '')
    setBookPatientAge(profile.age ? profile.age.toString() : '')
    setBookPatientGender(profile.gender || 'Male')
  }

  // Load patient data on mount and whenever patientUser changes
  useEffect(() => {
    loadAppointments()
    loadTransactions()
    loadNotifications()
    loadMySupportTickets()
  }, [patientUser])


  // ==========================================
  // DATA LOADERS
  // ==========================================
  async function loadAppointments() {
    setIsLoadingAppointments(true)
    try {
      const storedCodes = getStoredTrackingCodes()
      if (!patientUser && storedCodes.length === 0) {
        setMyAppointments([])
        setPatientLabReports([])
        return
      }
      const appts = await getAppointmentsByPatient({
        userId: patientUser?.id,
        email: patientUser?.email,
        phone: patientUser?.phone,
        trackingCodes: storedCodes,
      })
      const hidden = getHiddenRecordCodes()
      const filtered = appts.filter(
        (a) => !hidden.includes(a.trackingCode10Digit) && !hidden.includes(a.id)
      )
      setMyAppointments(filtered)

      // Also fetch lab reports for all appointments
      const allReports: LabReport[] = []
      for (const a of filtered.slice(0, 15)) {
        const repList = await getLabReportsByTrackingCode(a.trackingCode10Digit)
        allReports.push(...repList)
      }
      setPatientLabReports(allReports)
    } catch (err) {
      console.error('Failed to load appointments:', err)
    } finally {
      setIsLoadingAppointments(false)
    }
  }

  async function loadTransactions() {
    setIsLoadingTransactions(true)
    try {
      const storedCodes = getStoredTrackingCodes()
      if (!patientUser && storedCodes.length === 0) {
        setTransactions([])
        return
      }
      const txns = await getPatientTransactions({
        userId: patientUser?.id,
        email: patientUser?.email,
        phone: patientUser?.phone,
        trackingCodes: storedCodes,
      })
      const hidden = getHiddenRecordCodes()
      const filteredTx = txns.filter(
        (tx) => !hidden.includes(tx.trackingCode) && !hidden.includes(tx.appointmentId || '')
      )
      setTransactions(filteredTx)
    } catch (err) {
      console.error('Failed to load transactions:', err)
    } finally {
      setIsLoadingTransactions(false)
    }
  }

  async function loadNotifications() {
    try {
      const storedCodes = getStoredTrackingCodes()
      const notifs = await getPatientNotifications({
        userId: patientUser?.id,
        trackingCodes: storedCodes,
      })
      setNotifications(notifs)
      setUnreadCount(notifs.filter((n) => !n.isRead).length)
    } catch {}
  }

  function getHiddenRecordCodes(): string[] {
    try {
      const raw = localStorage.getItem('dactor_patient_hidden_records')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  function getRawStoredTrackingCodes(): string[] {
    try {
      const raw = localStorage.getItem('dactor_patient_tracking_codes')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  function hideRecordLocally(codeOrId: string) {
    try {
      const trimmed = codeOrId.trim()
      if (!trimmed) return
      const existingHidden = getHiddenRecordCodes()
      if (!existingHidden.includes(trimmed)) {
        const updated = [...existingHidden, trimmed]
        localStorage.setItem('dactor_patient_hidden_records', JSON.stringify(updated))
        setGuestCodesVersion((v) => v + 1)
      }
    } catch {}
  }

  function unhideRecordLocally(codeOrId: string) {
    try {
      const trimmed = codeOrId.trim()
      if (!trimmed) return
      const existingHidden = getHiddenRecordCodes()
      if (existingHidden.includes(trimmed)) {
        const updated = existingHidden.filter((c) => c !== trimmed)
        localStorage.setItem('dactor_patient_hidden_records', JSON.stringify(updated))
        setGuestCodesVersion((v) => v + 1)
      }
    } catch {}
  }

  function getStoredTrackingCodes(): string[] {
    try {
      const all = getRawStoredTrackingCodes()
      const hidden = getHiddenRecordCodes()
      return all.filter((c) => !hidden.includes(c))
    } catch {
      return []
    }
  }

  function saveTrackingCodeLocally(code: string, explicitUnhide = false) {
    try {
      const trimmed = code.trim()
      if (!trimmed) return
      if (explicitUnhide) {
        unhideRecordLocally(trimmed)
      }
      const rawStored = getRawStoredTrackingCodes()
      if (!rawStored.includes(trimmed)) {
        const updated = [trimmed, ...rawStored]
        localStorage.setItem('dactor_patient_tracking_codes', JSON.stringify(updated))
        setGuestCodesVersion((v) => v + 1)
      }
    } catch {}
  }

  async function loadMySupportTickets() {
    setLoadingPatientTickets(true)
    try {
      const all = await getSupportTickets()
      const pEmail = patientUser?.email?.trim().toLowerCase()
      const pPhone = (patientUser?.phone || '').replace(/\D/g, '')

      let deviceTicketCodes: string[] = []
      try {
        const raw = localStorage.getItem('dactor_recent_tickets')
        if (raw) deviceTicketCodes = JSON.parse(raw)
      } catch {}

      const filtered = all.filter((t) => {
        if (deviceTicketCodes.includes(t.ticketCode)) return true
        const tEmail = t.email?.trim().toLowerCase()
        const tPhone = (t.phone || '').replace(/\D/g, '')
        if (pEmail && tEmail && tEmail === pEmail) return true
        if (pPhone && pPhone.length >= 7 && tPhone && tPhone.includes(pPhone)) return true
        return false
      })
      setPatientTickets(filtered)
    } catch {} finally {
      setLoadingPatientTickets(false)
    }
  }

  const handleSearchPatientTicket = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const q = ticketSearchInput.trim()
    if (!q) {
      setTicketSearchError('Please enter a Ticket ID, phone number, or email.')
      return
    }
    setIsSearchingTicket(true)
    setTicketSearchError(null)
    setTicketLookupResult(null)
    try {
      const res = await getSupportTicketByCodeOrContact(q)
      if (res) {
        setTicketLookupResult(res)
      } else {
        setTicketSearchError('No support ticket found matching this code or contact info.')
      }
    } catch {
      setTicketSearchError('Unable to check ticket status. Please try again.')
    } finally {
      setIsSearchingTicket(false)
    }
  }

  // ==========================================
  // ESEWA SERVER-VERIFIED PAYMENT RESTORE & RETURN HANDLER
  // ==========================================
  // Ensure selectedPaymentMethod always stays aligned with clinic's verified gateways (or defaults to pay_at_desk)
  useEffect(() => {
    const isDirect = selectedClinic?.isDirectPaymentEnabled === true
    const usableIds: Array<OnlineGatewayId | 'pay_at_desk'> = [
      ...(isDirect && clinicPaymentConfig?.esewa?.enabled && clinicPaymentConfig?.esewa?.is_verified ? (['esewa'] as const) : []),
      ...(isDirect && clinicPaymentConfig?.khalti?.enabled && clinicPaymentConfig?.khalti?.is_verified ? (['khalti'] as const) : []),
      ...(isDirect && clinicPaymentConfig?.fonepay?.enabled && clinicPaymentConfig?.fonepay?.is_verified ? (['fonepay'] as const) : []),
      ...(isDirect && clinicPaymentConfig?.connectips?.enabled && clinicPaymentConfig?.connectips?.is_verified ? (['connectips'] as const) : []),
      'pay_at_desk',
    ]
    if (!usableIds.includes(selectedPaymentMethod as any)) {
      setSelectedPaymentMethod(usableIds[0] || 'pay_at_desk')
    }
  }, [selectedClinic?.id, selectedClinic?.isDirectPaymentEnabled, clinicPaymentConfig])

  const verifyEsewaPaymentOnReturn = async (overrideApptId?: string) => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const apptIdFromUrl = urlParams.get('appointmentId') || urlParams.get('appointment_id')
      const paymentResult = urlParams.get('payment_result') || urlParams.get('status')
      const gatewayFromUrl = urlParams.get('gateway')

      let apptIdToVerify = overrideApptId || apptIdFromUrl
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

      setIsVerifyingEsewa(true)
      setEsewaVerifyMessage('Verifying online payment status with server...')

      // Query server edge function to independently verify gateway status and finalize if COMPLETE
      const refreshResult = await refreshOnlinePayment(apptIdToVerify)
      const appt = await getAppointmentById(apptIdToVerify)
      const gwLabel = (refreshResult.gateway || pendingGateway || 'online').toUpperCase()

      if (appt && (appt.paymentStatus === 'paid' || refreshResult.status === 'complete')) {
        setConfirmedBooking(appt)
        setActiveTab('book')
        setBookingStep(5)
        triggerConfettiBurst()
        localStorage.removeItem('dactor_pending_online_payment')
        localStorage.removeItem('dactor_pending_esewa_payment')
        localStorage.removeItem('dactor_patient_payment_session')
        if (appt.trackingCode10Digit) {
          saveTrackingCodeLocally(appt.trackingCode10Digit, true)
        }
        await loadAppointments()
        await loadTransactions()

        try {
          const url = new URL(window.location.href)
          url.searchParams.delete('payment_result')
          url.searchParams.delete('status')
          url.searchParams.delete('gateway')
          url.searchParams.delete('appointmentId')
          url.searchParams.delete('appointment_id')
          window.history.replaceState({}, '', url.toString())
        } catch {}
      } else if (refreshResult.status === 'failed' || paymentResult === 'failed') {
        setTransactionFailedNotice(`${gwLabel} transaction was cancelled or failed server verification. Your appointment fee was not charged.`)
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
      } else {
        setEsewaVerifyMessage('Payment verification in progress on server. You can click Refresh to check status.')
      }
    } catch (err: any) {
      console.error('Error verifying online payment:', err)
      setEsewaVerifyMessage(null)
    } finally {
      setIsVerifyingEsewa(false)
    }
  }

  useEffect(() => {
    verifyEsewaPaymentOnReturn()
  }, [])

  // ==========================================
  // REAL-TIME SUPABASE SUBSCRIPTION (Users & Guest Tracking Codes)
  // ==========================================
  useEffect(() => {
    const storedCodes = getStoredTrackingCodes()
    // Allow both registered patients and guest tracking code holders to subscribe
    if (!patientUser && storedCodes.length === 0) return

    const channelTopic = patientUser?.id
      ? `patient_portal_${patientUser.id}`
      : `patient_portal_guest_${storedCodes.slice(0, 3).join('_')}`

    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          loadAppointments()
          loadTransactions()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lab_reports' },
        () => {
          loadAppointments()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          loadNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [patientUser, guestCodesVersion])

  // ==========================================
  // PERSISTENT 5-MINUTE PAYMENT TIMER LOGIC
  // ==========================================
  useEffect(() => {
    if (bookingStep !== 4) return

    // Check or initialize stored expiration epoch ms
    const sessionKey = 'dactor_patient_payment_session'
    let targetEpoch: number
    const savedSession = localStorage.getItem(sessionKey)

    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession)
        if (parsed.expiresAt && parsed.expiresAt > Date.now()) {
          targetEpoch = parsed.expiresAt
        } else {
          // expired or invalid, reset 5 min
          targetEpoch = Date.now() + 300_000
          localStorage.setItem(sessionKey, JSON.stringify({ expiresAt: targetEpoch }))
        }
      } catch {
        targetEpoch = Date.now() + 300_000
        localStorage.setItem(sessionKey, JSON.stringify({ expiresAt: targetEpoch }))
      }
    } else {
      targetEpoch = Date.now() + 300_000
      localStorage.setItem(sessionKey, JSON.stringify({ expiresAt: targetEpoch }))
    }

    const interval = setInterval(() => {
      const remainingSeconds = Math.max(0, Math.floor((targetEpoch - Date.now()) / 1000))
      setPaymentTimeRemaining(remainingSeconds)

      if (remainingSeconds <= 0) {
        clearInterval(interval)
        localStorage.removeItem(sessionKey)
        handleCancelPaymentSession('Payment timer expired (5 minutes). Slot reservation returned.')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [bookingStep])

  // ==========================================
  // BOOKING WIZARD HANDLERS
  // ==========================================
  // When Clinic is selected, load its doctors, services, and payment config
  const handleSelectClinic = async (clinic: Clinic, preselectedDoctor?: Doctor) => {
    setSelectedClinic(clinic)
    setSelectedDoctor(preselectedDoctor || null)
    setSelectedService(null)
    setSelectedLabTests([])
    setSelectedSlot(null)
    setIsReturningPatient(false)
    setIsRescheduleMode(false)
    setFollowupCodeInput('')
    setRetainedAppointment(null)
    setFollowupLookupError(null)

    try {
      const [docs, servs, pCfg] = await Promise.all([
        getDoctorsByClinic(clinic.id),
        getClinicServices(clinic.id),
        getClinicPaymentConfig(clinic.id),
      ])
      setClinicDoctors(docs)
      const availServs = servs.filter((s) => s.isAvailable !== false)
      setClinicServices(availServs)
      setClinicPaymentConfig(pCfg)

      const isLab =
        clinic.type === 'diagnostic_lab' ||
        clinic.type?.toLowerCase().includes('lab') ||
        clinic.name.toLowerCase().includes('lab') ||
        (clinic.specialties?.some(
          (s) => s.toLowerCase().includes('lab') || s.toLowerCase().includes('patholog')
        ) ?? false)

      if (isLab) {
        setBookingMode('lab')
        if (availServs.length > 0) {
          setSelectedLabTests([availServs[0]])
        } else {
          setSelectedLabTests([])
        }
      } else {
        setBookingMode('opd')
        if (preselectedDoctor) {
          const matched = docs.find((d) => d.id === preselectedDoctor.id) || preselectedDoctor
          setSelectedDoctor(matched)
        } else if (docs.length > 0) {
          setSelectedDoctor(docs[0])
        }
      }

      setBookingStep(2)
    } catch (err) {
      console.error('Failed to load clinic details:', err)
    }
  }

  // Open booking flow (directs to Select Clinic unless specific clinic passed)
  const handleOpenBookingCalendar = (clinic?: Clinic) => {
    setActiveTab('book')
    if (clinic) {
      handleSelectClinic(clinic)
    } else {
      setSelectedClinic(null)
      setSelectedDoctor(null)
      setBookingStep(1)
    }
  }

  // Select Doctor Booking Algorithm (1:1 Android App Parity)
  const handleSelectDoctorFromCard = (doc: Doctor) => {
    const linkedClinics = clinics.filter((c) => {
      return (
        c.id === doc.clinicId ||
        c.id === (doc as any).activeClinicId ||
        c.id === (doc as any).primaryClinicId ||
        (clinicDoctorsMap[c.id] && clinicDoctorsMap[c.id].some((d) => d.id === doc.id))
      )
    })

    if (linkedClinics.length === 0) {
      alert(`Dr. ${doc.fullName} is currently not affiliated with an active clinic.`)
      return
    }

    if (linkedClinics.length === 1) {
      handleSelectClinic(linkedClinics[0], doc)
      return
    }

    // Multiple clinics: open clinic picker modal (Matching Android app PatientMainScreen.kt:2392-2602)
    setSelectedDoctorForClinicPicker(doc)
  }

  const doctorClinicsForPicker = useMemo(() => {
    if (!selectedDoctorForClinicPicker) return []
    const doc = selectedDoctorForClinicPicker
    return clinics.filter((c) => {
      return (
        c.id === doc.clinicId ||
        c.id === (doc as any).activeClinicId ||
        c.id === (doc as any).primaryClinicId ||
        (clinicDoctorsMap[c.id] && clinicDoctorsMap[c.id].some((d) => d.id === doc.id))
      )
    })
  }, [selectedDoctorForClinicPicker, clinics, clinicDoctorsMap])

  // Load available slots for selected clinic & date
  useEffect(() => {
    if (!selectedClinic || bookingStep !== 2) return

    async function loadSlotsForDate() {
      setIsLoadingSlots(true)
      try {
        const rawSlots = await getSlots(selectedClinic!.id, bookingDate)

        // FILTER: Remove slots whose end time has already expired!
        const validSlots = rawSlots.filter((slot) => {
          if (selectedDoctor && slot.doctorId && slot.doctorId !== selectedDoctor.id) {
            return false
          }
          const isExpired = isSlotTimeExpired(bookingDate, slot.endTime, slot.startTime)
          const hasCapacity = slot.bookedCount < slot.maxCapacity
          return !isExpired && hasCapacity && slot.isAvailable !== false
        })

        setAvailableSlots(validSlots)
        setSelectedSlot(prev => {
          if (prev) {
            const matched = validSlots.find(s =>
              s.id && prev.id ? s.id === prev.id : s.timeLabel === prev.timeLabel
            )
            if (matched) return matched
          }
          return validSlots[0] || null
        })
      } catch (err) {
        console.error('Failed to load slots:', err)
      } finally {
        setIsLoadingSlots(false)
      }
    }

    loadSlotsForDate()
  }, [selectedClinic, selectedDoctor, bookingDate, bookingStep, isLabClinic])

  // Prefetch slots across viewed month and upcoming 60-day availability window
  useEffect(() => {
    if (!selectedClinic?.id || bookingStep !== 2) return
    let active = true

    async function loadMonthSlots() {
      setMonthSlotsLoading(true)
      const yr = viewedYearMonth.year
      const mo = viewedYearMonth.month + 1
      const startStr = `${yr}-${String(mo).padStart(2, '0')}-01`

      // Query through end of next month to guarantee 60-day availability coverage
      const nextMo = mo === 12 ? 1 : mo + 1
      const nextYr = mo === 12 ? yr + 1 : yr
      const lastDayNextMo = new Date(nextYr, nextMo, 0).getDate()
      const endStr = `${nextYr}-${String(nextMo).padStart(2, '0')}-${String(lastDayNextMo).padStart(2, '0')}`

      try {
        const slotsMap = await getMonthSlots(selectedClinic!.id, startStr, endStr)
        if (!active) return
        setMonthSlotsMap((prev) => ({ ...prev, ...slotsMap }))
      } catch (err) {
        console.error('Failed to prefetch month slots:', err)
      } finally {
        if (active) setMonthSlotsLoading(false)
      }
    }

    loadMonthSlots()
    return () => {
      active = false
    }
  }, [selectedClinic?.id, viewedYearMonth.year, viewedYearMonth.month, selectedDoctor?.id, bookingStep])

  const computeCalendarDateState = (dateStr: string): 'available' | 'fully_booked' | 'closed' | 'past' => {
    if (dateStr < todayIso) return 'past'

    // 1. Declared Holidays
    if (selectedClinic?.declaredHolidays && selectedClinic.declaredHolidays.includes(dateStr)) {
      return 'closed'
    }

    // 2. Weekly Closed Days
    if (selectedClinic?.weeklyScheduleJson) {
      try {
        const parsed = JSON.parse(selectedClinic.weeklyScheduleJson)
        if (Array.isArray(parsed)) {
          const dObj = new Date(dateStr + 'T00:00:00')
          const dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
          const match = parsed.find((p: any) => String(p.day || '').toLowerCase().startsWith(dayName))
          if (match && match.isOpen === false) return 'closed'
        }
      } catch {}
    }

    // 3. Check Published Slots (slots only exist when published by clinic/lab)
    const rawSlots = (monthSlotsMap[dateStr] || []).filter((s) => s.isAvailable !== false)
    const relevantSlots = isLabClinic
      ? rawSlots
      : selectedDoctor
      ? rawSlots.filter((s) => !s.doctorId || s.doctorId === selectedDoctor.id)
      : rawSlots

    const activeSlots = dateStr === todayIso
      ? relevantSlots.filter((s) => !isSlotTimeExpired(dateStr, s.endTime || s.startTime, s.startTime))
      : relevantSlots

    if (activeSlots.length > 0) {
      const hasCapacity = activeSlots.some((s) => Math.max(0, (s.maxCapacity || 10) - (s.bookedCount || 0)) > 0)
      return hasCapacity ? 'available' : 'fully_booked'
    }

    return 'closed'
  }

  // 60-Day Auto-Scanner
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
  }, [todayIso, selectedClinic, selectedDoctor, monthSlotsMap, isLabClinic])

  // Auto-select open date
  useEffect(() => {
    if (bookingDate && computeCalendarDateState(bookingDate) === 'available') {
      return
    }
    const todayState = computeCalendarDateState(todayIso)
    if (todayState === 'available') {
      setBookingDate(todayIso)
    } else if (nextAvailableDate) {
      const targetD = new Date(nextAvailableDate + 'T00:00:00')
      setViewedYearMonth({ year: targetD.getFullYear(), month: targetD.getMonth() })
      setBookingDate(nextAvailableDate)
    }
  }, [monthSlotsMap, todayIso, nextAvailableDate, selectedClinic?.id, selectedDoctor?.id])

  // Calculate Fee strictly matching rules for all 3 clinic types
  const calculatedFee = useMemo(() => {
    if (isRescheduleMode && retainedAppointment) {
      return 0
    }
    if (isLabClinic) {
      return selectedLabTests.reduce((acc, t) => acc + (t.price || 0), 0)
    }
    if (isReturningPatient && retainedAppointment) {
      return 0 // 100% Free Follow-up
    }
    return selectedDoctor?.consultationFee || 500
  }, [isRescheduleMode, isLabClinic, selectedLabTests, isReturningPatient, retainedAppointment, selectedDoctor])

  // Confirm booking & launch payment
  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault()

    if (!bookPatientName.trim()) {
      alert('Please enter patient full name')
      return
    }
    if (!bookPatientPhone.trim() || bookPatientPhone.length < 8) {
      alert('Please enter a valid 10-digit mobile number')
      return
    }

    // Direct booking for free follow-up (no payment needed)
    if (calculatedFee === 0 || (isReturningPatient && retainedAppointment)) {
      handleExecutePayment(true)
      return
    }

    // Set new payment timer session
    const expiresAt = Date.now() + 300_000
    localStorage.setItem('dactor_patient_payment_session', JSON.stringify({ expiresAt }))
    setPaymentTimeRemaining(300)
    setBookingStep(4)
  }

  // Cancel payment session & show 2-second failed notice
  const handleCancelPaymentSession = (reason: string = 'Transaction cancelled') => {
    localStorage.removeItem('dactor_patient_payment_session')
    setBookingStep(2) // Back to slot booking
    setTransactionFailedNotice(`Transaction Cancelled: ${reason}`)
    setTimeout(() => {
      setTransactionFailedNotice(null)
    }, 2000)
  }

  // Complete Payment (either Testing Bypass, Free Follow-up, or Gateway Confirmation)
  const handleExecutePayment = async (isBypass: boolean = false) => {
    if (isPaymentProcessing) return // Prevent double clicking!
    setIsPaymentProcessing(true)

    try {
      const slotTimeStr = selectedSlot
        ? `${selectedSlot.startTime} - ${selectedSlot.endTime}`
        : '10:00 AM'

      const isFreeFollowup = Boolean(
        retainedAppointment && (isRescheduleMode || (isReturningPatient && calculatedFee === 0))
      )
      const targetPatientName = isFreeFollowup && retainedAppointment ? retainedAppointment.patientName : bookPatientName.trim()
      const targetPatientAge = isFreeFollowup && retainedAppointment ? (retainedAppointment.patientAge || parseInt(bookPatientAge) || 28) : (parseInt(bookPatientAge) || 28)
      const targetPatientGender = isFreeFollowup && retainedAppointment ? (retainedAppointment.patientGender || bookPatientGender) : bookPatientGender
      const targetPatientMobile = isFreeFollowup && retainedAppointment ? (retainedAppointment.patientMobile || bookPatientPhone.trim()) : bookPatientPhone.trim()

      let finalAppt: Appointment
      let code10: string

      // 1. Reschedule / Follow-Up: Update/Shift existing appointment in-place without generating a new ID or token
      if (isFreeFollowup && retainedAppointment) {
        code10 = retainedAppointment.trackingCode10Digit
        const targetDoctorId = selectedDoctor?.id || retainedAppointment.doctorId
        const shiftReason = isRescheduleMode
          ? `Rescheduled by patient via Patient Portal (Ref: #${retainedAppointment.trackingCode10Digit})`
          : `Follow-Up Consultation (Ref: ${retainedAppointment.trackingCode10Digit})`
        const ok = await shiftAppointmentDate(
          retainedAppointment.id,
          bookingDate,
          slotTimeStr,
          shiftReason,
          selectedSlot?.id,
          targetDoctorId,
          retainedAppointment.trackingCode10Digit
        )
        if (!ok) {
          throw new Error('Could not reschedule appointment for this slot. Please try another slot.')
        }
        const preservedStatus =
          retainedAppointment.status?.toUpperCase() === 'WAITING_FOR_APPROVAL'
            ? 'WAITING_FOR_APPROVAL'
            : 'APPROVED'
        finalAppt = {
          ...retainedAppointment,
          appointmentDate: bookingDate,
          appointmentTime: slotTimeStr,
          slotId: selectedSlot?.id,
          doctorId: targetDoctorId,
          doctor: selectedDoctor || retainedAppointment.doctor,
          status: preservedStatus,
          checkinStatus: 'not_checked_in',
        }
      } else if (
        (['esewa', 'khalti', 'fonepay', 'connectips'] as const).includes(selectedPaymentMethod as any) &&
        calculatedFee > 0 &&
        !isBypass
      ) {
        // Server-verified online payment flow (eSewa, Khalti, Fonepay, ConnectIPS): create pending appointment and redirect to server checkout
        const gateway = selectedPaymentMethod as OnlineGatewayId
        code10 = generate10DigitTrackingCode()
        const newAppt = await createAppointment({
          trackingCode10Digit: code10,
          userId: patientUser?.id,
          clinicId: selectedClinic!.id,
          doctorId: isLabClinic ? undefined : selectedDoctor?.id,
          slotId: selectedSlot?.id,
          patientName: targetPatientName,
          patientAge: targetPatientAge,
          patientGender: targetPatientGender,
          patientMobile: targetPatientMobile,
          patientEmail: patientUser?.email,
          appointmentDate: bookingDate,
          appointmentTime: slotTimeStr,
          checkinStatus: 'not_checked_in',
          paymentStatus: 'pending',
          feeAmount: calculatedFee,
          notes: isLabClinic ? 'Diagnostic Lab Sample Collection' : (bookPatientNotes.trim() || undefined),
          selectedTests: isLabClinic ? selectedLabTests.map((t) => t.serviceName) : [],
        })

        if (!newAppt) {
          throw new Error('Failed to create appointment for payment processing')
        }

        saveTrackingCodeLocally(code10)
        try {
          const pendingSession = JSON.stringify({
            appointmentId: newAppt.id,
            trackingCode: code10,
            clinicId: selectedClinic!.id,
            doctorId: isLabClinic ? undefined : selectedDoctor?.id,
            gateway,
            amount: calculatedFee,
            createdAt: Date.now(),
          })
          localStorage.setItem('dactor_pending_online_payment', pendingSession)
          localStorage.setItem('dactor_pending_esewa_payment', pendingSession)
          sessionStorage.setItem('dactor_pending_payment_phone', targetPatientMobile.trim())
        } catch {}

        await initiateOnlinePaymentPhase(newAppt.id, gateway).catch(() => {})
        const returnUrl = `${window.location.origin}${window.location.pathname}?tab=patient-portal&payment_result=checking&gateway=${gateway}&appointmentId=${newAppt.id}`
        const checkout = await startOnlinePayment(newAppt.id, gateway, returnUrl, code10, targetPatientMobile)

        window.location.href = checkout.checkoutUrl
        return
      } else {
        code10 = generate10DigitTrackingCode()
        const isPayAtDesk = selectedPaymentMethod === 'pay_at_desk' || selectedPaymentMethod === 'cash'
        const initialPaymentStatus = isPayAtDesk ? 'pending' : 'paid'

        const newAppt = await createAppointment({
          trackingCode10Digit: code10,
          userId: patientUser?.id,
          clinicId: selectedClinic!.id,
          doctorId: isLabClinic ? undefined : selectedDoctor?.id,
          slotId: selectedSlot?.id,
          patientName: targetPatientName,
          patientAge: targetPatientAge,
          patientGender: targetPatientGender,
          patientMobile: targetPatientMobile,
          patientEmail: patientUser?.email,
          appointmentDate: bookingDate,
          appointmentTime: slotTimeStr,
          checkinStatus: isPayAtDesk ? 'not_checked_in' : 'waiting',
          paymentStatus: initialPaymentStatus,
          paymentMode: isPayAtDesk ? 'PAY_AT_DESK' : 'ONLINE',
          feeAmount: calculatedFee,
          notes: isLabClinic ? 'Diagnostic Lab Sample Collection' : (bookPatientNotes.trim() || undefined),
          selectedTests: isLabClinic ? selectedLabTests.map((t) => t.serviceName) : [],
        })

        if (!newAppt) {
          throw new Error('Failed to create appointment in database')
        }
        finalAppt = newAppt
      }

      // 2. Record Transaction & Billing Invoice in Supabase
      const isCash = selectedPaymentMethod === 'pay_at_desk' || selectedPaymentMethod === 'cash'
      const methodLabel = isRescheduleMode
        ? 'RESCHEDULE (NO EXTRA FEE)'
        : isFreeFollowup
        ? 'FREE FOLLOW-UP'
        : isBypass
        ? 'Bypass Test'
        : isCash
        ? 'Pay at Desk'
        : selectedPaymentMethod.toUpperCase()

      await recordPaymentTransaction({
        appointmentId: finalAppt.id,
        trackingCode: code10,
        clinicId: selectedClinic!.id,
        doctorId: isLabClinic ? undefined : selectedDoctor?.id,
        patientName: targetPatientName,
        appointmentDate: bookingDate,
        appointmentTime: slotTimeStr,
        amount: calculatedFee,
        paymentMethod: methodLabel,
        paymentStatus: isFreeFollowup ? 'paid' : (isCash ? 'pending' : 'paid'),
        notes: isRescheduleMode
          ? `Appointment Rescheduled to ${bookingDate} ${slotTimeStr} (Token #${retainedAppointment?.trackingCode10Digit || code10})`
          : isFreeFollowup
          ? `Free Follow-Up (Previous ID: #${retainedAppointment?.trackingCode10Digit || code10})`
          : isBypass
          ? 'Confirmed via Testing Bypass button'
          : isCash
          ? 'Cash settlement at clinic reception'
          : `Digital Wallet (${methodLabel})`,
      })

      // 3. Save tracking code locally
      saveTrackingCodeLocally(code10)

      // 4. Clear payment session
      localStorage.removeItem('dactor_patient_payment_session')

      // 5. Trigger Confetti & Success View
      setConfirmedBooking(finalAppt)
      setBookingStep(5)
      triggerConfettiBurst()

      // Reload appointments & transactions
      loadAppointments()
      loadTransactions()
    } catch (err: any) {
      alert(`Booking failed: ${err.message || 'Unknown network error'}`)
    } finally {
      setIsPaymentProcessing(false)
    }
  }

  // Modal-based Appointment Cancellation
  const handleOpenCancelModal = (appt: Appointment) => {
    setCancellingAppt(appt)
    setCancellationReason('Schedule conflict')
  }

  const handleConfirmCancelAppointment = async () => {
    if (!cancellingAppt) return
    setIsConfirmingCancel(true)
    try {
      const ok = await cancelAppointment(cancellingAppt.id)
      if (ok) {
        setCancellingAppt(null)
        setCancellationReason('')
        await loadAppointments()
        await loadTransactions()
        setBookingRestoredToast('Appointment has been successfully cancelled and slot released.')
      } else {
        alert('Could not cancel appointment. Please try again.')
      }
    } catch (err: any) {
      alert(`Cancellation failed: ${err?.message || 'Unknown error'}`)
    } finally {
      setIsConfirmingCancel(false)
    }
  }

  // Backwards compatibility alias
  const handleCancelAppointment = async (apptId: string) => {
    const target = myAppointments.find((a) => a.id === apptId)
    if (target) {
      handleOpenCancelModal(target)
    } else {
      if (!window.confirm('Are you sure you want to cancel this appointment?')) return
      setCancellingApptId(apptId)
      try {
        const ok = await cancelAppointment(apptId)
        if (ok) {
          await loadAppointments()
          await loadTransactions()
        }
      } finally {
        setCancellingApptId(null)
      }
    }
  }

  // Print Official Prescription Document
  const handlePrintPrescription = (appt: Appointment) => {
    const win = window.open('', '_blank')
    if (!win) return

    let parsedRx: {
      diagnosis?: string
      medicines?: Array<{ name: string; dosage?: string; frequency?: string; duration?: string; instructions?: string }>
      advice?: string
    } | null = null

    try {
      if (appt.notes && (appt.notes.trim().startsWith('{') || appt.notes.trim().startsWith('['))) {
        parsedRx = JSON.parse(appt.notes)
      }
    } catch {}

    const diagnosisText = parsedRx?.diagnosis || appt.notes || 'Routine Clinical Consultation'
    const adviceText = parsedRx?.advice || ''
    const medicines = parsedRx?.medicines || []

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>℞ Prescription - #${escapeHtml(appt.trackingCode10Digit)}</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; padding: 28px; color: #0f172a; background: #fff; }
            .box { max-width: 680px; margin: 0 auto; border: 2px solid #2563eb; border-radius: 16px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eff6ff; padding-bottom: 14px; margin-bottom: 14px; }
            .rx-title { color: #2563eb; font-size: 24px; font-weight: 900; margin: 0; }
            .tag { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 4px 10px; border-radius: 999px; font-weight: 800; font-size: 11px; }
            .token-bar { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 8px 12px; margin: 12px 0; display: flex; justify-content: space-between; font-size: 12px; }
            .section { margin-top: 16px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 12px; }
            .section-title { font-weight: 800; color: #1e293b; margin-bottom: 6px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
            th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            th { font-size: 10px; text-transform: uppercase; color: #64748b; background: #f1f5f9; }
            .footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; color: #64748b; }
            .signature { border-top: 1px solid #94a3b8; width: 140px; text-align: center; padding-top: 4px; font-weight: 700; color: #0f172a; }
          </style>
        </head>
        <body>
          <div class="box">
            <div class="header">
              <div>
                <h1 class="rx-title">℞ PRESCRIPTION</h1>
                <p style="margin: 3px 0 0; font-size: 12px; color: #64748b; font-weight: 600;">Dactor Medical Network Record</p>
              </div>
              <span class="tag">OFFICIAL DIGITAL RX</span>
            </div>

            <div class="token-bar">
              <span><strong>Token:</strong> #${escapeHtml(appt.trackingCode10Digit)}</span>
              <span><strong>Date:</strong> ${escapeHtml(appt.appointmentDate)} (${escapeHtml(appt.appointmentTime || 'OPD')})</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; margin-bottom: 12px;">
              <div style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #f1f5f9;">
                <span style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; display: block;">Attending Doctor</span>
                <strong style="color: #0f172a;">${escapeHtml(appt.doctor?.fullName || 'OPD Specialist')}</strong>
                <span style="display: block; color: #2563eb; font-size: 11px;">${escapeHtml(appt.doctor?.specialty || 'General Medicine')}</span>
              </div>
              <div style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #f1f5f9;">
                <span style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; display: block;">Patient Details</span>
                <strong style="color: #0f172a;">${escapeHtml(appt.patientName)}</strong>
                <span style="display: block; color: #64748b; font-size: 11px;">${escapeHtml(appt.patientAge || '-')} Yrs • ${escapeHtml(appt.patientGender || '-')} • ${escapeHtml(appt.patientMobile || '')}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Clinical Diagnosis / Impression</div>
              <div style="font-weight: 600; color: #0f172a;">${escapeHtml(diagnosisText)}</div>
            </div>

            ${
              medicines.length > 0
                ? `
                <div class="section" style="padding: 6px 12px;">
                  <div class="section-title" style="margin-top: 6px;">Prescribed Medicines (Rx)</div>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Medicine</th>
                        <th>Dosage</th>
                        <th>Frequency</th>
                        <th>Duration</th>
                        <th>Instructions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${medicines
                        .map(
                          (m, i) => `
                        <tr>
                          <td>${i + 1}</td>
                          <td style="font-weight: 700; color: #0f172a;">${escapeHtml(m.name)}</td>
                          <td>${escapeHtml(m.dosage || '-')}</td>
                          <td>${escapeHtml(m.frequency || '-')}</td>
                          <td>${escapeHtml(m.duration || '-')}</td>
                          <td style="color: #2563eb;">${escapeHtml(m.instructions || '-')}</td>
                        </tr>
                      `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
                : ''
            }

            ${
              adviceText
                ? `
              <div class="section">
                <div class="section-title">Doctor's Clinical Advice & Follow-Up</div>
                <div style="color: #334155; white-space: pre-wrap;">${escapeHtml(adviceText)}</div>
              </div>
            `
                : ''
            }

            <div class="footer">
              <div>
                <span>Digitally signed via Dactor Platform</span><br/>
                <span style="font-size: 9px; color: #94a3b8;">Ref ID: ${escapeHtml(appt.id)}</span>
              </div>
              <div class="signature">
                Doctor Signature / Seal
              </div>
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `)
    win.document.close()
  }

  // Copy tracking code helper
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  // ==========================================
  // PENDING BOOKING RESTORE & ADVANCE HANDLERS
  // ==========================================
  const handleProceedFromSlotStep = () => {
    if (!isRescheduleMode && isLabClinic && selectedLabTests.length === 0) {
      alert('Please select at least one diagnostic test or pathology package to continue.')
      return
    }
    if (!selectedSlot && availableSlots.length > 0) {
      alert('Please select a preferred time slot to continue.')
      return
    }

    // STREAMLINED FOLLOW-UP / RESCHEDULE CONFIRMATION (Matches ClinicDetail.tsx)
    if ((isRescheduleMode || isReturningPatient) && retainedAppointment) {
      handleExecutePayment(true)
      return
    }

    // If unauthenticated (Guest / Demo mode), save booking position and redirect to login page
    if (!patientUser) {
      const pendingRedirect = {
        clinicId: selectedClinic?.id,
        doctorId: selectedDoctor?.id,
        serviceId: selectedService?.id,
        selectedLabTestIds: selectedLabTests.map((t) => t.id),
        bookingMode,
        bookingDate,
        selectedSlotId: selectedSlot?.id,
        isReturningPatient,
        followupCodeInput,
        returnRoute: 'patient-portal',
      }
      try {
        localStorage.setItem('dactor_pending_booking_redirect', JSON.stringify(pendingRedirect))
        localStorage.setItem('dactor_booking_login_notice', 'Please sign in with Google to book an appointment')
      } catch {}
      setPendingBookingRedirectNotice(true)
      if (onNavigate) {
        onNavigate('login')
      } else {
        setShowAuthModal(true)
      }
      return
    }

    setBookingStep(3)
  }

  const restorePendingBookingRedirect = async (overrideClinics?: Clinic[]) => {
    const pendingRaw = localStorage.getItem('dactor_pending_booking_redirect')
    if (!pendingRaw) return
    try {
      const parsed = JSON.parse(pendingRaw)
      if (parsed.clinicId) {
        const availableClinics = overrideClinics || clinics
        let clinicMatch = availableClinics.find((c) => c.id === parsed.clinicId)
        if (!clinicMatch) {
          const fetched = await getClinics()
          clinicMatch = fetched.find((c) => c.id === parsed.clinicId)
        }
        if (clinicMatch) {
          setSelectedClinic(clinicMatch)
          const [docs, servs, pCfg] = await Promise.all([
            getDoctorsByClinic(clinicMatch.id),
            getClinicServices(clinicMatch.id),
            getClinicPaymentConfig(clinicMatch.id),
          ])
          setClinicDoctors(docs)
          setClinicServices(servs.filter((s) => s.isAvailable))
          setClinicPaymentConfig(pCfg)

          if (parsed.doctorId) {
            const docMatch = docs.find((d) => d.id === parsed.doctorId)
            if (docMatch) setSelectedDoctor(docMatch)
          }
          if (parsed.serviceId) {
            const servMatch = servs.find((s) => s.id === parsed.serviceId)
            if (servMatch) setSelectedService(servMatch)
          }
          if (parsed.bookingMode) setBookingMode(parsed.bookingMode)
          if (parsed.bookingDate) setBookingDate(parsed.bookingDate)

          if (parsed.selectedSlotId) {
            const rawSlots = await getSlots(clinicMatch.id, parsed.bookingDate)
            const validSlots = rawSlots.filter((slot) => {
              const isExpired = isSlotTimeExpired(parsed.bookingDate, slot.endTime, slot.startTime)
              const hasCapacity = slot.bookedCount < slot.maxCapacity
              return !isExpired && hasCapacity && slot.isAvailable !== false
            })
            setAvailableSlots(validSlots)
            const slotMatch = validSlots.find((s) => s.id === parsed.selectedSlotId)
            if (slotMatch) setSelectedSlot(slotMatch)
          }

          setActiveTab('book')
          setBookingStep(3)
          localStorage.removeItem('dactor_pending_booking_redirect')
          setPendingBookingRedirectNotice(false)
          setBookingRestoredToast('Booking selection restored! Resuming right where you left off.')
          setTimeout(() => setBookingRestoredToast(null), 4000)
        }
      }
    } catch (err) {
      console.warn('Failed restoring booking redirect:', err)
    }
  }

  // ==========================================
  // CLAIM / RESTORE RECORD WITH CODE OR APPOINTMENT ID
  // ==========================================
  const handleClaimAppointmentCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const rawInput = claimCodeInput.trim()
    if (!rawInput) {
      setClaimCodeError('Please enter a valid 10-digit tracking code or Appointment ID.')
      return
    }

    setIsClaimingCode(true)
    setClaimCodeError(null)
    try {
      let appt = await getAppointmentByTrackingCodeOrContact(rawInput)
      if (!appt && rawInput.replace(/\D/g, '').length === 10) {
        appt = await getAppointmentByTrackingCode(rawInput.replace(/\D/g, ''))
      }
      if (!appt) {
        setClaimCodeError(`No appointment found for "${rawInput}". Please verify your 10-digit code or appointment ID and try again.`)
        return
      }

      const code10 = appt.trackingCode10Digit
      if (code10) {
        unhideRecordLocally(code10)
        saveTrackingCodeLocally(code10, true)
      }
      if (appt.id) {
        unhideRecordLocally(appt.id)
      }

      if (patientUser?.id && (!appt.userId || appt.userId !== patientUser.id)) {
        try {
          await supabase
            .from('appointments')
            .update({ user_id: patientUser.id, patient_email: patientUser.email })
            .or(`id.eq.${appt.id}${code10 ? `,tracking_code_10_digit.eq.${code10}` : ''}`)
        } catch {}
      }

      await loadAppointments()
      await loadTransactions()
      setShowClaimModal(false)
      setClaimCodeInput('')
      setBookingRestoredToast(`Record for ${appt.patientName} (${appt.appointmentDate}) claimed & restored to your records!`)
      setTimeout(() => setBookingRestoredToast(null), 4000)
    } catch (err: any) {
      setClaimCodeError(err.message || 'Failed to claim appointment.')
    } finally {
      setIsClaimingCode(false)
    }
  }

  // ==========================================
  // REMOVE RECORD & RESCHEDULE HANDLERS
  // ==========================================
  const handleConfirmRemoveRecord = async () => {
    if (!apptToRemoveConfirm) return
    const code = apptToRemoveConfirm.trackingCode10Digit
    const id = apptToRemoveConfirm.id
    hideRecordLocally(code)
    if (id) hideRecordLocally(id)
    if (
      viewingConsultationDetailsAppt?.id === id ||
      viewingConsultationDetailsAppt?.trackingCode10Digit === code
    ) {
      setViewingConsultationDetailsAppt(null)
    }
    setApptToRemoveConfirm(null)
    await loadAppointments()
    await loadTransactions()
  }

  const handleConfirmRescheduleFromModal = async (targetAppt: Appointment) => {
    setApptToRescheduleConfirm(null)
    setViewingConsultationDetailsAppt(null)
    setRetainedAppointment(targetAppt)
    setIsReturningPatient(true)
    setIsRescheduleMode(true)
    setFollowupCodeInput(targetAppt.trackingCode10Digit)
    setSelectedSlot(null)
    setSelectedLabTests([])
    setBookingDate(todayIso)
    setBookPatientName(targetAppt.patientName || '')
    setBookPatientAge(String(targetAppt.patientAge || ''))
    setBookPatientGender(targetAppt.patientGender || 'Male')
    setBookPatientPhone(targetAppt.patientMobile || '')

    const resolvedClinic =
      targetAppt.clinic ||
      clinics.find((c) => c.id === targetAppt.clinicId) ||
      (targetAppt.clinicId ? await getClinicById(targetAppt.clinicId) : null)

    if (resolvedClinic) {
      setSelectedClinic(resolvedClinic)
      const isLab =
        resolvedClinic.type === 'diagnostic_lab' ||
        resolvedClinic.type?.toLowerCase().includes('lab') ||
        resolvedClinic.name.toLowerCase().includes('lab') ||
        (resolvedClinic.specialties?.some(
          (s) => s.toLowerCase().includes('lab') || s.toLowerCase().includes('patholog')
        ) ?? false)
      setBookingMode(isLab ? 'lab' : 'opd')
    }

    if (targetAppt.clinicId) {
      try {
        const [docs, servs, pCfg] = await Promise.all([
          getDoctorsByClinic(targetAppt.clinicId),
          getClinicServices(targetAppt.clinicId),
          getClinicPaymentConfig(targetAppt.clinicId),
        ])
        setClinicDoctors(docs)
        setClinicServices(servs.filter((s) => s.isAvailable !== false))
        setClinicPaymentConfig(pCfg)
        const matchedDoc =
          (targetAppt.doctorId ? docs.find((d) => d.id === targetAppt.doctorId) : null) ||
          targetAppt.doctor ||
          docs[0] ||
          null
        setSelectedDoctor(matchedDoc)
      } catch {
        if (targetAppt.doctor) setSelectedDoctor(targetAppt.doctor)
      }
    } else if (targetAppt.doctor) {
      setSelectedDoctor(targetAppt.doctor)
    }

    setActiveTab('book')
    setBookingStep(2)
  }

  // ==========================================
  // RESCHEDULE APPOINTMENT HANDLER
  // ==========================================
  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rescheduleAppt) return
    setIsRescheduling(true)
    try {
      const ok = await shiftAppointmentDate(
        rescheduleAppt.id,
        newRescheduleDate,
        newRescheduleTime,
        rescheduleReason.trim() || 'Patient requested reschedule via Patient Portal',
        newRescheduleSlotId,
        rescheduleAppt.doctorId,
        rescheduleAppt.trackingCode10Digit
      )
      if (ok) {
        setRescheduleAppt(null)
        await loadAppointments()
        setBookingRestoredToast(`Appointment shifted to ${newRescheduleDate} (${newRescheduleTime}) successfully!`)
        setTimeout(() => setBookingRestoredToast(null), 3500)
      } else {
        alert('Could not reschedule appointment. Please try again.')
      }
    } catch (err: any) {
      alert(`Error rescheduling: ${err.message || err}`)
    } finally {
      setIsRescheduling(false)
    }
  }

  // ==========================================
  // LAB REPORTS LOOKUP & PRIVACY VERIFICATION
  // ==========================================
  const handleLookupLabReport = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = reportSearchCode.trim().replace(/\D/g, '')
    if (clean.length < 5) return
    setIsSearchingReport(true)
    setReportSearchError(null)
    try {
      const reports = await getLabReportsByTrackingCode(clean)
      if (reports.length > 0) {
        setPatientLabReports((prev) => {
          const map = new Map<string, LabReport>()
          for (const r of [...reports, ...prev]) map.set(r.id, r)
          return Array.from(map.values())
        })
        saveTrackingCodeLocally(clean)
        setBookingRestoredToast(`Found ${reports.length} report(s) for token #${clean}`)
        setTimeout(() => setBookingRestoredToast(null), 3000)
      } else {
        setReportSearchError(`No diagnostic lab report found for token #${clean}.`)
      }
    } catch {
      setReportSearchError('Failed to lookup lab report.')
    } finally {
      setIsSearchingReport(false)
    }
  }

  const handleExecuteReportVerification = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verifyingReport) return
    const rawInput = verificationInput.trim()
    if (!rawInput) {
      setVerificationError("Please enter the patient's registered mobile number")
      return
    }

    const cleanPhone = rawInput.replace(/\D/g, '')
    if (cleanPhone.length < 7) {
      setVerificationError('Please enter a valid mobile number (at least 7 digits).')
      return
    }

    setIsVerifyingReport(true)
    setVerificationError(null)

    try {
      let signedUrl: string | null = null

      if (verifyingReport.trackingCode10Digit) {
        signedUrl = await requestGuestLabReportUrl(verifyingReport.trackingCode10Digit, cleanPhone)
      }

      if (!signedUrl && verifyingReport.id) {
        signedUrl = await requestAuthorizedDocumentUrl('lab_report', verifyingReport.id, verifyingReport.reportFileUrl || '')
      }

      if (signedUrl) {
        setUnlockedReportIds((prev) => [...prev, verifyingReport.id])
        setUnlockedReportUrls((prev) => ({ ...prev, [verifyingReport.id]: signedUrl! }))
        window.open(signedUrl, '_blank')
        setVerifyingReport(null)
        setVerificationError(null)
      } else {
        setVerificationError('Verification failed: Mobile number does not match clinic appointment records.')
      }
    } catch {
      setVerificationError('Verification request failed. Please try again.')
    } finally {
      setIsVerifyingReport(false)
    }
  }

  const handleOpenOrUnlockReport = async (rep: LabReport) => {
    if (unlockedReportUrls[rep.id]) {
      window.open(unlockedReportUrls[rep.id], '_blank')
      return
    }

    if (patientUser?.id) {
      const signed = await requestAuthorizedDocumentUrl('lab_report', rep.id, rep.reportFileUrl || '')
      if (signed) {
        setUnlockedReportIds((prev) => [...prev, rep.id])
        setUnlockedReportUrls((prev) => ({ ...prev, [rep.id]: signed }))
        window.open(signed, '_blank')
        return
      }
    }

    setVerifyingReport(rep)
    setVerifyMethod('phone')
    setVerificationInput('')
    setVerificationError(null)
  }

  // ==========================================
  // AUTHENTICATION HANDLERS (STRICTLY GOOGLE SIGN-IN ONLY)
  // ==========================================
  // Real Google Sign-In linked to Supabase patient database (strictly NO auto-fill of name/gender/age from Google)
  const handleGoogleSignIn = async () => {
    setAuthSubmitting(true)
    setAuthError(null)
    try {
      // Clear any stale local auth state non-blocking to keep browser user-activation gesture fresh
      firebaseSignOut()
      const gUser = await signInWithFirebaseGoogle(activeTab === 'account' ? 'account' : 'patient')
      if (!gUser || !gUser.email) return

      // Enforce 1 Google Account = 1 Portal Role rule
      const assoc = await checkEmailPortalAssociation(gUser.email)
      if (assoc && assoc.portal !== 'patient') {
        firebaseSignOut()
        const entitySuffix = assoc.entityName ? ` (${assoc.entityName})` : ''
        setAuthError(
          `This Google account (${assoc.email}) is already associated with a ${assoc.portalLabel} account${entitySuffix}. You cannot log in to the Patient Portal with this Google ID. Please change your Google account.`
        )
        return
      }

      const profile = await getPatientProfileByEmail(gUser.email)
      const photo = gUser.photoURL || undefined
      if (profile && profile.fullName && profile.phone && profile.age && profile.gender) {
        const fullProfile = { ...profile, photoUrl: photo || profile.photoUrl }
        setPatientUser(fullProfile)
        initProfileFields(fullProfile)
        localStorage.setItem('dactor_patient_email', profile.email)
        localStorage.setItem('dactor_patient_session', JSON.stringify(fullProfile))
        localStorage.setItem('dactor_patient_logged_in', 'true')
        localStorage.setItem('dactor_last_active_role', 'patient')
        localStorage.setItem('dactor_last_active_portal', 'patient-portal')
        try {
          sessionStorage.removeItem('dactor_explicit_home')
          sessionStorage.removeItem('dactor_allow_home')
        } catch {}
        window.dispatchEvent(new Event('storage'))
        setShowAuthModal(false)
        await restorePendingBookingRedirect()
      } else {
        // New or incomplete Google user: strictly do NOT auto-fill name, gender, or age from Google account
        const partial: PatientProfile = {
          id: profile?.id || crypto.randomUUID(),
          authUid: gUser.uid,
          email: gUser.email,
          fullName: profile?.fullName || '',
          phone: profile?.phone || '',
          age: profile?.age,
          gender: profile?.gender || 'Male',
          city: profile?.city || '',
          photoUrl: photo,
          role: 'patient',
        }
        setPatientUser(partial)
        setEditName(partial.fullName || '')
        setEditPhone(partial.phone || '')
        setEditAge(partial.age ? String(partial.age) : '')
        setEditGender(partial.gender || 'Male')
        setEditCity(partial.city || '')
        setEditTermsAccepted(true)
        localStorage.setItem('dactor_patient_email', partial.email)
        localStorage.setItem('dactor_patient_logged_in', 'true')
        try {
          sessionStorage.removeItem('dactor_explicit_home')
          sessionStorage.removeItem('dactor_allow_home')
        } catch {}
        window.dispatchEvent(new Event('storage'))
        setShowAuthModal(false)
        setShowEditProfileModal(true)
      }
    } catch (err: any) {
      console.warn('Patient Google Sign-In notice:', err)
      const errCode = err?.code || ''
      if (errCode === 'auth/popup-closed-by-user' || err?.message?.includes('closed-by-user')) {
        setAuthError('Sign-in popup was closed before completing. Please tap to try again.')
      } else if (errCode === 'auth/popup-blocked' || err?.message?.includes('popup-blocked')) {
        setAuthError('Popup was blocked by your browser. Please tap "Sign in with Google" again and allow popups.')
      } else {
        setAuthError(err.message || 'Google Sign-In failed. Please try again.')
      }
    } finally {
      setAuthSubmitting(false)
    }
  }

  // Save updated profile with strict criteria validation
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientUser) return
    if (editName.trim().length < 2) {
      alert('Please enter your full name (at least 2 characters).')
      return
    }
    const cleanPhone = editPhone.replace(/\D/g, '')
    if (!/^9\d{9}$/.test(cleanPhone)) {
      alert('Please enter a valid 10-digit mobile number starting with 9 (e.g. 98XXXXXXXX).')
      return
    }
    const ageNum = Number(editAge)
    if (!editAge || !Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
      alert('Please enter a valid age between 1 and 120.')
      return
    }
    const genderToSave = editGender || 'Male'
    if (!editTermsAccepted) {
      alert('Please read and accept the Dactor Terms of Service and Privacy Policy to continue.')
      return
    }

    setIsUpdatingProfile(true)
    try {
      const updated = await savePatientProfile({
        id: patientUser.id,
        authUid: patientUser.authUid,
        email: patientUser.email,
        fullName: editName.trim(),
        phone: cleanPhone,
        age: ageNum,
        gender: genderToSave,
        city: editCity.trim() || undefined,
        role: 'patient',
      })
      const fallback: PatientProfile = {
        ...patientUser,
        fullName: editName.trim(),
        phone: cleanPhone,
        age: ageNum,
        gender: genderToSave,
        city: editCity.trim() || undefined,
        role: 'patient',
        updatedAt: new Date().toISOString(),
      }
      const finalProfile = updated || fallback
      setPatientUser(finalProfile)
      initProfileFields(finalProfile)
      localStorage.setItem('dactor_patient_session', JSON.stringify(finalProfile))
      localStorage.setItem('dactor_patient_email', finalProfile.email)
      localStorage.setItem('dactor_patient_logged_in', 'true')
      try {
        sessionStorage.removeItem('dactor_explicit_home')
        sessionStorage.removeItem('dactor_allow_home')
      } catch {}
      window.dispatchEvent(new Event('storage'))
      setShowEditProfileModal(false)
      await restorePendingBookingRedirect()
    } catch (saveErr) {
      console.warn('Profile save notice:', saveErr)
      const fallback: PatientProfile = {
        ...patientUser,
        fullName: editName.trim(),
        phone: cleanPhone,
        age: ageNum,
        gender: genderToSave,
        city: editCity.trim() || undefined,
        role: 'patient',
        updatedAt: new Date().toISOString(),
      }
      setPatientUser(fallback)
      initProfileFields(fallback)
      localStorage.setItem('dactor_patient_session', JSON.stringify(fallback))
      setShowEditProfileModal(false)
      await restorePendingBookingRedirect()
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const handleDownloadTransactionReceipt = (tx: PatientTransactionRecord) => {
    const win = window.open('', '_blank', 'width=800,height=700')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Dactor Receipt - ${escapeHtml(tx.trackingCode)}</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 36px; color: #0f172a; }
            .box { max-width: 680px; margin: 0 auto; border: 2px solid #0284c7; border-radius: 16px; padding: 28px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
            .badge { background: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 999px; font-weight: 800; font-size: 12px; text-transform: uppercase; }
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
                <h2 style="margin:0;font-size:22px;">${escapeHtml(tx.clinicName)}</h2>
                <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Official Payment & Appointment Invoice</p>
              </div>
              <span class="badge">${escapeHtml(tx.paymentStatus)}</span>
            </div>
            <div>
              <div style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:700;">10-Digit Universal Tracking Code</div>
              <div class="code">${escapeHtml(tx.trackingCode)}</div>
            </div>
            <table>
              <tr><th>Transaction ID</th><td><strong>${escapeHtml(tx.transactionId)}</strong></td></tr>
              <tr><th>Patient Name</th><td><strong>${escapeHtml(tx.patientName)}</strong></td></tr>
              <tr><th>Doctor / Service</th><td>${escapeHtml(tx.doctorName)}</td></tr>
              <tr><th>Appointment Date & Time</th><td>${escapeHtml(tx.appointmentDate)} • ${escapeHtml(tx.appointmentTime)}</td></tr>
              <tr><th>Payment Method</th><td>${escapeHtml(tx.paymentMethod)}</td></tr>
              <tr><th>Total Amount</th><td class="total">NPR ${escapeHtml(tx.amount)}</td></tr>
            </table>
            <p style="margin-top:24px;font-size:11px;color:#64748b;text-align:center;">
              Synced from Cloud Billing Invoices • Dactor Healthcare Ecosystem
            </p>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `)
    win.document.close()
  }

  const handlePrintAppointmentBill = (appt: Appointment, invoice?: BillingInvoice | null) => {
    const win = window.open('', '_blank', 'width=800,height=750')
    if (!win) return
    const clinicTitle = appt.clinic?.name || 'Dactor Certified Healthcare Center'
    const clinicAddr = appt.clinic?.addressText || 'Kathmandu, Nepal'
    const docTitle = appt.doctor?.fullName || 'General OPD Specialist'
    const docSpec = appt.doctor?.specialty || 'General Medicine'

    const inv = invoice || viewingInvoice
    const apptEffTotal = getEffectiveAppointmentTotal(appt)
    const effectiveTotal = inv?.totalAmount && inv.totalAmount > 0 ? Math.max(inv.totalAmount, apptEffTotal) : apptEffTotal
    const effectivePaid = inv ? (inv.paidAmount ?? (inv.paymentStatus === 'paid' ? effectiveTotal : 0)) : (appt.paymentStatus === 'paid' ? effectiveTotal : 0)
    const effectiveBalance = Math.max(0, effectiveTotal - effectivePaid)
    const isPaid = effectiveBalance <= 0 && effectiveTotal > 0

    const paymentLogs = parsePaymentRecords(inv?.remarks, effectivePaid, inv?.paidAt)
    const cleanRemarks = extractCleanClinicalRemarks(inv?.remarks)

    const rawItems = (inv?.items && inv.items.length > 0 ? inv.items : []).filter(
      (it: any) => !(it.itemName || it.name || it.item_name || '').toLowerCase().startsWith('payment received')
    )
    const items = rawItems.length > 0
      ? rawItems.map((it: any) => ({
          name: it.itemName || it.name || it.item_name || 'Clinical Service',
          quantity: it.quantity || 1,
          price: Number(it.price || 0),
          total: Number(it.total || ((it.price || 0) * (it.quantity || 1))),
        }))
      : [
          {
            name: `Doctor Consultation & OPD Entry (${appt.appointmentDate})`,
            quantity: 1,
            price: effectiveTotal,
            total: effectiveTotal,
          },
        ]

    const itemsRowsHtml = items
      .map(
        (it, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHtml(it.name)}</strong></td>
          <td style="text-align:center;">${escapeHtml(it.quantity)}</td>
          <td style="text-align:right;">Rs. ${escapeHtml(it.price)}</td>
          <td style="text-align:right;font-weight:700;">Rs. ${escapeHtml(it.total)}</td>
        </tr>`
      )
      .join('')

    const paymentLogsHtml = paymentLogs.length > 0
      ? `
        <div style="margin-top:20px;">
          <h4 style="margin:0 0 8px;font-size:12px;color:#166534;text-transform:uppercase;letter-spacing:0.5px;">Payment Receipts & Time Log</h4>
          <table style="width:100%;border-collapse:collapse;border:1px solid #bbf7d0;">
            <thead>
              <tr style="background:#dcfce7;color:#14532d;font-size:10px;text-transform:uppercase;">
                <th style="padding:6px;">Date & Time Log</th>
                <th style="padding:6px;">Note / Mode</th>
                <th style="padding:6px;text-align:right;">Paid (NPR)</th>
              </tr>
            </thead>
            <tbody>
              ${paymentLogs
                .map(
                  (p) => `
                <tr style="font-size:12px;border-bottom:1px solid #e2e8f0;">
                  <td style="padding:6px;font-family:monospace;">${escapeHtml(p.dateTime)}</td>
                  <td style="padding:6px;color:#475569;">${escapeHtml(p.note || 'Payment Received')}</td>
                  <td style="padding:6px;text-align:right;font-weight:700;color:#15803d;">Rs. ${escapeHtml(p.amount)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`
      : ''

    const cleanRemarksHtml = cleanRemarks
      ? `
        <div style="margin-top:14px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:11px;">
          <strong style="color:#0f172a;">Doctor Clinical Remarks & Prescriptions:</strong>
          <p style="margin:4px 0 0;color:#334155;white-space:pre-wrap;">${escapeHtml(cleanRemarks)}</p>
        </div>`
      : ''

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Dactor Official Bill - #${escapeHtml(appt.trackingCode10Digit)}</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; padding: 28px; color: #0f172a; background: #fff; }
            .box { max-width: 680px; margin: 0 auto; border: 2px solid #0d9488; border-radius: 16px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f0fdfa; padding-bottom: 14px; margin-bottom: 14px; }
            .badge { background: ${isPaid ? '#ecfdf5' : '#fffbeb'}; color: ${isPaid ? '#047857' : '#b45309'}; border: 1px solid ${isPaid ? '#a7f3d0' : '#fde68a'}; padding: 5px 12px; border-radius: 999px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
            .code-box { background: #f0fdf4; border: 1px dashed #14b8a6; border-radius: 12px; padding: 10px 14px; margin: 12px 0; text-align: center; }
            .code { font-family: monospace; font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #0f766e; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
            th { color: #64748b; text-transform: uppercase; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
            .footer { margin-top: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 12px; }
          </style>
        </head>
        <body>
          <div class="box">
            <div class="header">
              <div>
                <h2 style="margin:0;font-size:20px;color:#0f172a;">${escapeHtml(clinicTitle)}</h2>
                <p style="margin:3px 0 0;font-size:12px;color:#64748b;">${escapeHtml(clinicAddr)}</p>
                <p style="margin:2px 0 0;font-size:11px;font-weight:700;color:#0d9488;">Official Medical Invoice & OPD Receipt</p>
              </div>
              <span class="badge">${isPaid ? 'PAID FULL' : (effectivePaid > 0 ? 'PARTIAL PAID' : 'PAYABLE AT CLINIC')}</span>
            </div>

            <div class="code-box">
              <div style="font-size:10px;text-transform:uppercase;color:#0f766e;font-weight:800;letter-spacing:1px;">10-Digit Live OPD Queue Token</div>
              <div class="code">#${escapeHtml(appt.trackingCode10Digit)}</div>
              <div style="font-size:11px;color:#475569;margin-top:2px;">Present this token at the reception desk for instant check-in</div>
            </div>

            <!-- Patient & Visit Details -->
            <table style="margin-bottom:16px;">
              <tr><th style="width:30%;">Patient Name</th><td><strong>${escapeHtml(appt.patientName)}</strong> (${escapeHtml(appt.patientAge || '–')} Yrs, ${escapeHtml(appt.patientGender || '–')})</td></tr>
              <tr><th>Attending Doctor</th><td>Dr. ${escapeHtml(docTitle)} (${escapeHtml(docSpec)})</td></tr>
              <tr><th>Date & Time</th><td><strong>${escapeHtml(appt.appointmentDate)}</strong> • ${escapeHtml(appt.appointmentTime)}</td></tr>
              <tr><th>Contact Phone</th><td><span style="font-family:monospace;">${escapeHtml(appt.patientMobile || '–')}</span></td></tr>
            </table>

            <!-- Services & Procedures Table -->
            <div style="margin-top:10px;">
              <h4 style="margin:0 0 6px;font-size:11px;color:#334155;text-transform:uppercase;letter-spacing:0.5px;">Services & Procedures</h4>
              <table style="border:1px solid #e2e8f0;">
                <thead style="background:#f8fafc;">
                  <tr>
                    <th style="width:30px;">#</th>
                    <th>Description</th>
                    <th style="text-align:center;">Qty</th>
                    <th style="text-align:right;">Rate</th>
                    <th style="text-align:right;">Total (NPR)</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRowsHtml}
                </tbody>
              </table>
            </div>

            ${paymentLogsHtml}

            <!-- Financial Summary Box -->
            <div style="margin-top:16px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px;padding:12px;font-size:12px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:#475569;">Total Combined Bill:</span>
                <strong style="font-size:14px;color:#0f172a;">Rs. ${effectiveTotal}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#15803d;font-weight:700;">
                <span>Total Paid to Date:</span>
                <span>Rs. ${effectivePaid}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px dashed #99f6e4;color:#b91c1c;font-weight:800;font-size:13px;">
                <span>Balance Due:</span>
                <span>Rs. ${effectiveBalance}</span>
              </div>
            </div>

            ${cleanRemarksHtml}

            <div class="footer">
              <p style="margin:0;font-weight:700;color:#334155;">Verified by Dactor Unified Health Cloud Network • Computer Generated Official Receipt</p>
              <p style="margin:3px 0 0;font-size:10px;">Printed on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
            </div>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `)
    win.document.close()
  }

  const handleLogout = () => {
    firebaseSignOut()
    localStorage.removeItem('dactor_patient_email')
    localStorage.removeItem('dactor_patient_session')
    localStorage.removeItem('dactor_patient_logged_in')
    localStorage.removeItem('dactor_last_active_role')
    localStorage.removeItem('dactor_last_active_portal')
    setPatientUser(null)
    setMyAppointments([])
    setTransactions([])
    window.dispatchEvent(new Event('storage'))
  }

  // Filter Active vs Past appointments
  const todayStr = new Date().toISOString().split('T')[0]
  const filteredAppointments = myAppointments.filter((a) => {
    if (appointmentFilter === 'active') {
      return a.appointmentDate >= todayStr && a.checkinStatus !== 'cancelled'
    } else {
      return a.appointmentDate < todayStr || a.checkinStatus === 'cancelled'
    }
  })

  // Format countdown minutes:seconds
  const timerMinutes = Math.floor(paymentTimeRemaining / 60)
  const timerSeconds = paymentTimeRemaining % 60
  const formattedTimer = `${timerMinutes.toString().padStart(2, '0')}:${timerSeconds.toString().padStart(2, '0')}`

  return (
    <div className="min-h-screen py-5 sm:py-8 px-3 sm:px-6 lg:px-8 pb-28 sm:pb-12">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Transaction Failed Notice Toast (2-second transient notice) */}
        {transactionFailedNotice && (
          <div className="fixed top-20 sm:top-24 left-1/2 -translate-x-1/2 z-50 bg-rose-600/90 backdrop-blur-md text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl shadow-xl flex items-center space-x-2 animate-bounce text-xs sm:text-sm border border-rose-400/30">
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span className="font-bold">{transactionFailedNotice}</span>
          </div>
        )}

        {/* Booking Selection Restored Toast */}
        {bookingRestoredToast && (
          <div className="fixed top-20 sm:top-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-600/90 backdrop-blur-md text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl shadow-xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-4 text-xs sm:text-sm border border-emerald-400/30">
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span className="font-bold">{bookingRestoredToast}</span>
          </div>
        )}

        {/* 30-DAY ARCHIVE LOCK BANNER (ProfileScreen.kt lines 42-78) */}
        {patientUser?.isArchived && (
          <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl liquid-glass-elevated bg-rose-950/80 text-white border border-rose-500/40 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden backdrop-blur-xl">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-rose-400/50 to-transparent" />
            <div className="flex items-start space-x-3 sm:space-x-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-rose-600/80 flex items-center justify-center shrink-0 border border-rose-400/30">
                <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="space-y-1 text-left">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500 text-white">
                    30-Day Deletion Grace Period
                  </span>
                  <span className="text-xs font-mono font-bold text-rose-200">
                    {archiveDaysLeft} Days Remaining
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black">
                  Patient Account Archived &amp; Scheduled for Deletion
                </h2>
                <p className="text-xs text-rose-200 max-w-2xl leading-relaxed">
                  Your patient account is scheduled for permanent deletion on{' '}
                  <strong>{patientUser.deletionScheduledAt?.split('T')[0] || '30 days from archive'}</strong>. You can reactivate or reclaim your full account access, health records, and booking history anytime before the 30-day countdown expires.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelPatientArchive}
              className="w-full md:w-auto px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-black rounded-2xl text-xs shadow-lg shadow-emerald-500/25 cursor-pointer shrink-0 transition active:scale-[0.98]"
            >
              Reactivate / Reclaim Account
            </button>
          </div>
        )}

        {/* ==========================================
            PATIENT HEADER & PROFILE BAR
        ========================================== */}
        <div className="liquid-glass-elevated rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-white/40 dark:border-white/10 relative overflow-hidden shadow-sm">
          {/* Top specular refraction sheen */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
            <div className="flex items-start sm:items-center space-x-3 sm:space-x-4 min-w-0">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-teal-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-teal-500/20 font-black text-xl sm:text-2xl flex-shrink-0 overflow-hidden border border-white/20">
                {patientUser?.photoUrl ? (
                  <img
                    src={patientUser.photoUrl}
                    alt={patientUser.fullName || 'Patient Photo'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLElement).style.display = 'none'
                    }}
                  />
                ) : patientUser?.fullName ? (
                  patientUser.fullName.charAt(0).toUpperCase()
                ) : (
                  <User className="w-6 h-6 sm:w-8 sm:h-8" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <h1 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                    {patientUser?.fullName || 'Patient Portal'}
                  </h1>
                  <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                    {patientUser?.fullName ? 'Verified Patient' : 'Active Patient'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="truncate max-w-[200px] sm:max-w-none">{patientUser?.email || 'Track bookings & health records'}</span>
                  {patientUser?.phone && <span>• {patientUser.phone}</span>}
                  {patientUser?.age && <span>• {patientUser.age}y</span>}
                  {patientUser?.gender && <span>• {patientUser.gender}</span>}
                </p>
              </div>
            </div>

            {/* Profile Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-white/20 dark:border-white/5">
              {patientUser ? (
                <>
                  <button
                    onClick={() => setShowEditProfileModal(true)}
                    className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 liquid-glass-card hover:bg-white/80 dark:hover:bg-slate-800/80 rounded-xl transition border border-white/40 dark:border-white/10 cursor-pointer active:scale-[0.98]"
                  >
                    Edit Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-1.5 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 liquid-glass-card hover:bg-rose-500/20 rounded-xl transition border border-rose-500/30 cursor-pointer active:scale-[0.98]"
                  >
                    <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setAuthError(null)
                    setShowAuthModal(true)
                  }}
                  className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 sm:px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-teal-500/20 transition transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign in with Google</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ==========================================
            PORTAL NAVIGATION TABS (Aligned 1:1 with App)
        ========================================== */}
        <div className="liquid-glass-subtle rounded-2xl p-1.5 sm:p-2 border border-white/40 dark:border-white/10 flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none sm:flex-wrap">
          {[
            {
              id: 'appointments',
              label: 'Track / Queue',
              icon: Activity,
              badge: myAppointments.filter(
                (a) => a.checkinStatus !== 'completed' && a.checkinStatus !== 'cancelled'
              ).length,
            },
            {
              id: 'records',
              label: 'Records',
              icon: FileText,
              badge:
                myAppointments.filter((a) => a.checkinStatus === 'completed').length +
                patientLabReports.length,
            },
            {
              id: 'account',
              label: 'Account & Profile',
              icon: User,
              badge: unreadCount > 0 ? unreadCount : undefined,
            },
            {
              id: 'book',
              label: 'Book Appointment',
              icon: Sparkles,
            },
          ].map((tab) => {
            const Icon = tab.icon
            const isActive =
              activeTab === tab.id ||
              (tab.id === 'records' && activeTab === 'reports') ||
              (tab.id === 'account' && (activeTab === 'transactions' || activeTab === 'notifications'))
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'book' && !patientUser) {
                    const pendingRedirect = {
                      bookingMode: 'opd',
                      returnRoute: 'patient-portal',
                    }
                    try {
                      localStorage.setItem('dactor_pending_booking_redirect', JSON.stringify(pendingRedirect))
                      localStorage.setItem('dactor_booking_login_notice', 'Please sign in with Google to book an appointment')
                    } catch {}
                    if (onNavigate) {
                      onNavigate('login')
                    } else {
                      setPendingBookingRedirectNotice(true)
                      setShowAuthModal(true)
                    }
                    return
                  }
                  if (tab.id === 'book') {
                    handleOpenBookingCalendar()
                  } else {
                    setActiveTab(tab.id as any)
                  }
                }}
                className={`flex items-center space-x-1.5 sm:space-x-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 sm:shrink cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-sky-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-white/20'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`ml-1 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs rounded-full font-bold ${
                      isActive ? 'bg-white text-blue-800' : 'liquid-glass-card text-slate-700 dark:text-slate-300 border border-white/20'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ==========================================
            TAB 1: MY APPOINTMENTS & LIVE QUEUE
        ========================================== */}
        {activeTab === 'appointments' && (
          <div className="space-y-6">
            {/* Filter Sub-nav */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-1.5 liquid-glass-subtle p-1 rounded-xl border border-white/40 dark:border-white/10">
                <button
                  onClick={() => setAppointmentFilter('active')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    appointmentFilter === 'active'
                      ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Active & Upcoming
                </button>
                <button
                  onClick={() => setAppointmentFilter('past')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    appointmentFilter === 'past'
                      ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Past & History
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setClaimCodeInput('')
                    setClaimCodeError(null)
                    setShowClaimModal(true)
                  }}
                  className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 liquid-glass-card hover:bg-white/80 dark:hover:bg-slate-800/80 border border-white/40 dark:border-white/10 px-3.5 py-2 rounded-xl transition shadow-2xs cursor-pointer active:scale-[0.98]"
                >
                  <KeyRound className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>Claim 10-Digit Code</span>
                </button>
                <button
                  onClick={() => handleOpenBookingCalendar()}
                  className="flex items-center space-x-1.5 text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 px-3.5 py-2 rounded-xl transition cursor-pointer border border-teal-500/20 active:scale-[0.98]"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>+ Book Another</span>
                </button>
              </div>
            </div>

            {isLoadingAppointments ? (
              <div className="p-12 text-center liquid-glass-card rounded-3xl border border-white/40 dark:border-white/10">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-teal-600 dark:text-teal-400 mb-3" />
                <p className="text-slate-600 dark:text-slate-300 font-semibold text-sm">Loading your appointments & live queue tokens...</p>
              </div>
            ) : filteredAppointments.length === 0 ? (
              <div className="p-12 text-center liquid-glass-card rounded-3xl border border-white/40 dark:border-white/10 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-teal-500/10 flex items-center justify-center mx-auto text-teal-600 dark:text-teal-400 border border-teal-500/20">
                  <Calendar className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">No {appointmentFilter} appointments found</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                    You have no {appointmentFilter} tokens scheduled. Book an OPD slot or claim an existing 10-digit appointment code.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => handleOpenBookingCalendar()}
                    className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold text-sm rounded-xl transition shadow-md shadow-teal-500/20 cursor-pointer active:scale-[0.98]"
                  >
                    Book OPD or Lab Slot
                  </button>
                  <button
                    onClick={() => {
                      setClaimCodeInput('')
                      setClaimCodeError(null)
                      setShowClaimModal(true)
                    }}
                    className="px-5 py-2.5 liquid-glass-card hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200 font-bold text-sm rounded-xl transition border border-white/40 dark:border-white/10 shadow-2xs cursor-pointer active:scale-[0.98]"
                  >
                    Claim with 10-Digit Code
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredAppointments.map((appt) => {
                  const isToday = appt.appointmentDate === todayStr
                  const isCancelled = appt.checkinStatus === 'cancelled'

                  return (
                    <div
                      key={appt.id}
                      className={`liquid-glass-card rounded-3xl p-6 shadow-sm border transition hover:shadow-md relative overflow-hidden ${
                        isToday ? 'border-teal-500/80 ring-2 ring-teal-500/20' : 'border-white/40 dark:border-white/10'
                      }`}
                    >
                      {/* Top Bar with 10-Digit Code Pill */}
                      <div className="flex items-center justify-between pb-4 border-b border-white/20 dark:border-white/5">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            10-Digit Token:
                          </span>
                          <span className="font-mono text-sm font-black text-slate-900 dark:text-white liquid-glass-subtle px-2.5 py-1 rounded-lg border border-white/30 dark:border-white/10">
                            {appt.trackingCode10Digit}
                          </span>
                          <button
                            onClick={() => handleCopyCode(appt.trackingCode10Digit)}
                            className="p-1 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition cursor-pointer"
                            title="Copy tracking code"
                          >
                            {copiedCode === appt.trackingCode10Digit ? (
                              <Check className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                            appt.paymentMode === 'PAY_AT_DESK' && appt.status === 'WAITING_FOR_APPROVAL'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                              : appt.status === 'pending_payment'
                              ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
                              : appt.paymentMode === 'PAY_AT_DESK' && appt.status === 'UNAPPROVED'
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                              : appt.paymentMode === 'PAY_AT_DESK' && appt.status === 'EXPIRED'
                              ? 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30'
                              : isCancelled
                              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                              : appt.checkinStatus === 'completed'
                              ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20'
                              : appt.checkinStatus === 'in_consultation'
                              ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20 animate-pulse'
                              : 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20'
                          }`}
                        >
                          {appt.paymentMode === 'PAY_AT_DESK' && appt.status === 'WAITING_FOR_APPROVAL'
                            ? 'Waiting Approval'
                            : appt.status === 'pending_payment'
                            ? 'Payment Pending'
                            : appt.paymentMode === 'PAY_AT_DESK' && appt.status === 'UNAPPROVED'
                            ? 'Unapproved'
                            : appt.paymentMode === 'PAY_AT_DESK' && appt.status === 'EXPIRED'
                            ? 'Expired'
                            : isCancelled
                            ? 'Cancelled'
                            : appt.checkinStatus === 'in_consultation'
                            ? 'Inside Chamber'
                            : appt.checkinStatus === 'completed'
                            ? 'Completed'
                            : 'In Queue'}
                        </span>
                      </div>

                      {/* Doctor & Clinic Info */}
                      <div className="py-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-lg font-black text-slate-900 dark:text-white">
                              {appt.doctor?.fullName || 'General OPD Specialist'}
                            </h4>
                            <p className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                              {appt.doctor?.specialty || 'General Medicine'}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 block">Consultation Fee</span>
                            <span className="text-sm font-black text-slate-900 dark:text-white">
                              NPR {getEffectiveAppointmentTotal(appt) > 0 ? getEffectiveAppointmentTotal(appt) : 'Free'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          <span>{appt.clinic?.name || 'Clinic Center'}</span>
                          {appt.clinic?.addressText && <span>• {appt.clinic.addressText}</span>}
                        </div>

                        {/* Date & Slot Time */}
                        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <div className="flex items-center space-x-1.5 liquid-glass-subtle px-3 py-1.5 rounded-xl border border-white/30 dark:border-white/10">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{appt.appointmentDate}</span>
                          </div>
                          <div className="flex items-center space-x-1.5 liquid-glass-subtle px-3 py-1.5 rounded-xl border border-white/30 dark:border-white/10">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{appt.appointmentTime}</span>
                          </div>
                          <div className="flex items-center space-x-1.5 bg-teal-500/10 text-teal-800 dark:text-teal-300 px-3 py-1.5 rounded-xl border border-teal-500/20">
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>
                              {appt.paymentMode === 'PAY_AT_DESK'
                                ? `Pay at Desk (${appt.status === 'WAITING_FOR_APPROVAL' ? 'Waiting' : appt.status || 'Request'})`
                                : appt.paymentStatus === 'paid'
                                ? 'Paid Online'
                                : 'Payment at Clinic'}
                            </span>
                          </div>
                        </div>

                        {/* Patient Name */}
                        <div className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                          Patient: <strong className="text-slate-800 dark:text-slate-200">{appt.patientName}</strong> ({appt.patientAge || 28} yrs, {appt.patientGender || 'Male'})
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="pt-4 border-t border-white/20 dark:border-white/5 flex items-center justify-between gap-3">
                        {appt.paymentMode === 'PAY_AT_DESK' && appt.status === 'WAITING_FOR_APPROVAL' ? (
                          appt.clinic?.contactPhone ? (
                            <a
                              href={`tel:${appt.clinic.contactPhone}`}
                              className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl transition shadow-xs cursor-pointer active:scale-[0.98]"
                              title={`Call Clinic (${appt.clinic.contactPhone})`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call Clinic</span>
                            </a>
                          ) : (
                            <button
                              disabled
                              className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-200 dark:bg-slate-800 rounded-xl cursor-not-allowed"
                              title="Clinic has no contact phone"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Waiting Approval</span>
                            </button>
                          )
                        ) : appt.paymentMode === 'PAY_AT_DESK' && appt.status === 'UNAPPROVED' ? (
                          (appt.attemptNumber || 1) < 3 ? (
                            <button
                              disabled={retryingApptId === appt.id}
                              onClick={() => handleRetryPayAtDesk(appt)}
                              className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 rounded-xl transition shadow-xs cursor-pointer active:scale-[0.98] disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${retryingApptId === appt.id ? 'animate-spin' : ''}`} />
                              <span>{retryingApptId === appt.id ? 'Retrying...' : `Retry (${3 - (appt.attemptNumber || 1)} left)`}</span>
                            </button>
                          ) : (
                            <span className="flex-1 text-center py-2 text-xs font-bold text-rose-600 dark:text-rose-400">
                              Unapproved (Max retries)
                            </span>
                          )
                        ) : appt.paymentMode === 'PAY_AT_DESK' && appt.status === 'EXPIRED' ? (
                          <span className="flex-1 text-center py-2 text-xs font-bold text-slate-500">
                            Request Expired
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              if (onOpenLiveQueue) {
                                onOpenLiveQueue(appt.trackingCode10Digit)
                              } else {
                                window.location.hash = '#live-queue'
                              }
                            }}
                            className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 rounded-xl transition shadow-xs cursor-pointer active:scale-[0.98]"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            <span>Queue Board</span>
                          </button>
                        )}

                        <button
                          onClick={() => setViewingBillAppt(appt)}
                          className="px-3 py-2 text-xs font-bold text-blue-700 dark:text-blue-300 liquid-glass-card hover:bg-blue-500/20 rounded-xl transition border border-blue-500/30 flex items-center gap-1 cursor-pointer active:scale-[0.98]"
                          title="View Official Medical Bill / Slip"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Bill Slip</span>
                        </button>

                        {(appt.checkinStatus === 'completed' || Boolean(appt.notes)) && (
                          <button
                            onClick={() => setViewingPrescriptionAppt(appt)}
                            className="px-3 py-2 text-xs font-bold text-blue-700 dark:text-blue-300 liquid-glass-card hover:bg-blue-500/20 rounded-xl transition border border-blue-500/30 flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
                            title="View Clinical Prescription & Medicines"
                          >
                            <Stethoscope className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>Prescription</span>
                          </button>
                        )}

                        {!isCancelled && appt.checkinStatus !== 'completed' && (
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => {
                                if (appt.clinicId) {
                                  if (onNavigate) {
                                    onNavigate('clinic-detail', {
                                      clinicId: appt.clinicId,
                                      doctorId: appt.doctorId,
                                      trackingCode: appt.trackingCode10Digit,
                                      isReschedule: true,
                                      autoOpenBooking: true,
                                    })
                                  } else {
                                    window.location.href = `/?clinic=${appt.clinicId}&doctor=${appt.doctorId || ''}&rescheduleCode=${appt.trackingCode10Digit}&reschedule=true#clinic-detail`
                                  }
                                } else {
                                  setRescheduleAppt(appt)
                                  setNewRescheduleDate(appt.appointmentDate)
                                  setNewRescheduleTime(appt.appointmentTime || '10:00 AM - 11:00 AM')
                                  setRescheduleReason('')
                                }
                              }}
                              className="px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 liquid-glass-card hover:bg-sky-500/20 rounded-xl transition border border-sky-500/30 cursor-pointer active:scale-[0.98]"
                            >
                              Reschedule
                            </button>
                            <button
                              onClick={() => handleOpenCancelModal(appt)}
                              disabled={cancellingApptId === appt.id}
                              className="px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 liquid-glass-card hover:bg-rose-500/20 rounded-xl transition border border-rose-500/30 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {appt.checkinStatus === 'completed' && appt.clinicId && (
                          <button
                            onClick={() => {
                              if (onNavigate) {
                                onNavigate('clinic-detail', {
                                  clinicId: appt.clinicId,
                                  doctorId: appt.doctorId,
                                  trackingCode: appt.trackingCode10Digit,
                                  isReschedule: false,
                                })
                              }
                            }}
                            className="px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 liquid-glass-card hover:bg-emerald-500/20 rounded-xl transition border border-emerald-500/30 flex items-center gap-1 cursor-pointer active:scale-[0.98]"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Follow-Up Visit</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            TAB 2: BOOK NEW APPOINTMENT (STEP-BY-STEP)
        ========================================== */}
        {activeTab === 'book' && (
          <div className="liquid-glass-elevated rounded-3xl p-6 sm:p-10 shadow-sm border border-white/40 dark:border-white/10 space-y-8 relative overflow-hidden">
            {/* Top specular refraction sheen */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

            {/* Step Progress Header */}
            <div>
              <div className="flex items-center justify-between max-w-xl mx-auto mb-6">
                {[
                  { num: 1, label: 'Select Clinic' },
                  { num: 2, label: 'Date & Slot' },
                  { num: 3, label: 'Patient Info' },
                  { num: 4, label: 'Payment' },
                ].map((st) => (
                  <button
                    key={st.num}
                    type="button"
                    onClick={() => {
                      if (st.num === 1) {
                        setBookingStep(1)
                      } else if (st.num === 2) {
                        if (!selectedClinic && clinics.length > 0) {
                          handleSelectClinic(clinics[0])
                        } else if (selectedClinic) {
                          setBookingStep(2)
                        }
                      } else if (st.num === 3 && selectedSlot) {
                        setBookingStep(3)
                      }
                    }}
                    className="flex items-center space-x-2 cursor-pointer transition-all hover:opacity-90"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        bookingStep === st.num
                          ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-md shadow-teal-500/30 ring-4 ring-teal-500/20'
                          : bookingStep > st.num
                          ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20'
                          : 'liquid-glass-subtle text-slate-400 dark:text-slate-500 border border-white/20'
                      }`}
                    >
                      {bookingStep > st.num ? '✓' : st.num}
                    </div>
                    <span
                      className={`text-xs font-bold hidden sm:inline ${
                        bookingStep === st.num ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {st.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* STEP 1: SELECT CLINIC & DOCTOR (Dual Profile Discovery Hub) */}
            {bookingStep === 1 && (
              <div className="space-y-6">
                <div className="text-center max-w-xl mx-auto space-y-2">
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                    Book OPD Doctor or Medical Center
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Choose an affiliated specialist doctor or select an OPD clinic, multi-specialty polyclinic, or diagnostic pathology lab across Nepal.
                  </p>
                </div>

                {/* Search & Entity Filter Pills */}
                <div className="space-y-3 max-w-3xl mx-auto">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={clinicSearchQuery}
                      onChange={(e) => setClinicSearchQuery(e.target.value)}
                      placeholder="Search by doctor name, specialty, clinic, city, or symptom..."
                      className="w-full pl-11 pr-4 py-3 liquid-glass-input rounded-2xl text-xs font-semibold text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                    {clinicSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setClinicSearchQuery('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* 4 Entity Filter Pills (Matching Android PatientMainScreen.kt) */}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {[
                      { id: 'all', label: 'All (Recommended)', icon: Sparkles },
                      { id: 'doctors', label: 'Doctors Only', icon: Stethoscope },
                      { id: 'clinics', label: 'Clinics & Polyclinics', icon: Building2 },
                      { id: 'labs', label: 'Diagnostic Labs', icon: FlaskConical },
                    ].map((pill) => {
                      const Icon = pill.icon
                      const isSel = selectedEntityFilter === pill.id
                      return (
                        <button
                          key={pill.id}
                          type="button"
                          onClick={() => {
                            setSelectedEntityFilter(pill.id as any)
                            if (pill.id === 'labs') setClinicCategoryFilter('diagnostic_lab')
                            else if (pill.id === 'clinics') setClinicCategoryFilter('all')
                          }}
                          className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer active:scale-[0.98] ${
                            isSel
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-600'
                              : 'liquid-glass-card text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-white/40 dark:border-white/10'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{pill.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* City Selector if multiple cities available */}
                  {availableCities.length > 1 && (
                    <div className="flex items-center justify-center pt-1">
                      <div className="flex items-center space-x-1.5 liquid-glass-subtle px-3 py-1.5 rounded-xl border border-white/40 dark:border-white/10 text-xs font-bold">
                        <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span className="text-slate-500">City / Region:</span>
                        <select
                          value={selectedCityFilter}
                          onChange={(e) => setSelectedCityFilter(e.target.value)}
                          className="bg-transparent font-bold text-slate-800 dark:text-white outline-none cursor-pointer"
                        >
                          <option value="all" className="dark:bg-slate-900">All Locations</option>
                          {availableCities.map((city) => (
                            <option key={city} value={city} className="dark:bg-slate-900">
                              {city}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Quick Symptoms Suggestion Chips */}
                  <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs justify-center pt-1 scrollbar-none">
                    <span className="font-bold text-slate-400 dark:text-slate-500 shrink-0 text-[11px] uppercase tracking-wider">
                      Quick Symptoms:
                    </span>
                    {QUICK_SPECIALTY_SUGGESTIONS.slice(0, 7).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          const keyword = suggestion.split('/')[0].split('&')[0].replace(/\(.*\)/, '').trim()
                          setClinicSearchQuery(keyword)
                          saveRecentSearch(keyword)
                        }}
                        className="px-2.5 py-1 rounded-xl liquid-glass-subtle hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-semibold shrink-0 cursor-pointer transition border border-blue-500/20 text-[11px] active:scale-[0.98]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filtered Scoring for Doctors and Clinics */}
                {(() => {
                  // 1. Compute Filtered Doctors List
                  const scoredDoctors = allDoctors
                    .map((doc) => {
                      const linkedClinics = clinics.filter((c) => {
                        return (
                          c.id === doc.clinicId ||
                          c.id === (doc as any).activeClinicId ||
                          c.id === (doc as any).primaryClinicId ||
                          (clinicDoctorsMap[c.id] && clinicDoctorsMap[c.id].some((d) => d.id === doc.id))
                        )
                      })

                      if (selectedCityFilter !== 'all') {
                        const matchesCity = linkedClinics.some((c) => {
                          return (
                            (c.city || '').toLowerCase() === selectedCityFilter.toLowerCase() ||
                            (c.addressText || '').toLowerCase().includes(selectedCityFilter.toLowerCase())
                          )
                        })
                        if (!matchesCity) return null
                      }

                      if (!clinicSearchQuery.trim()) {
                        return { doc, linkedClinics, score: 10, matchReason: undefined }
                      }

                      const q = clinicSearchQuery.toLowerCase()
                      const nameMatch = (doc.fullName || '').toLowerCase().includes(q)
                      const specMatch =
                        (doc.specialty || '').toLowerCase().includes(q) ||
                        ((doc as any).specialties &&
                          (doc as any).specialties.some((s: string) => s.toLowerCase().includes(q)))
                      const qualMatch =
                        ((doc as any).qualifications || (doc as any).education || '').toLowerCase().includes(q)
                      const clinicMatch = linkedClinics.some((c) => (c.name || '').toLowerCase().includes(q))

                      if (nameMatch || specMatch || qualMatch || clinicMatch) {
                        let reason = 'Matched Specialist'
                        if (nameMatch) reason = `Doctor: Dr. ${doc.fullName}`
                        else if (specMatch) reason = `Specialty: ${doc.specialty}`
                        else if (clinicMatch) reason = `Practices at matched clinic`
                        return { doc, linkedClinics, score: nameMatch ? 20 : 15, matchReason: reason }
                      }

                      return null
                    })
                    .filter(Boolean) as Array<{
                    doc: Doctor
                    linkedClinics: Clinic[]
                    score: number
                    matchReason?: string
                  }>

                  // 2. Compute Filtered Clinics List
                  const scoredClinics = clinics
                    .map((c) => {
                      const t = (c.type || '').toLowerCase()
                      const n = (c.name || '').toLowerCase()
                      const isLab =
                        t === 'diagnostic_lab' ||
                        t.includes('lab') ||
                        n.includes('lab') ||
                        (c.specialties?.some(
                          (s) => s.toLowerCase().includes('lab') || s.toLowerCase().includes('patholog')
                        ) ?? false)
                      const isSingle = !isLab && (t === 'single_visit' || t === 'single_doctor')
                      const isPoly = !isLab && !isSingle

                      if (selectedEntityFilter === 'labs' && !isLab) return null
                      if (clinicCategoryFilter === 'diagnostic_lab' && !isLab) return null
                      if (clinicCategoryFilter === 'single_doctor' && !isSingle) return null
                      if (clinicCategoryFilter === 'polyclinic' && !isPoly) return null

                      if (selectedCityFilter !== 'all') {
                        const cityMatch =
                          (c.city || '').toLowerCase() === selectedCityFilter.toLowerCase() ||
                          (c.addressText || '').toLowerCase().includes(selectedCityFilter.toLowerCase())
                        if (!cityMatch) return null
                      }

                      const clinicDocs = clinicDoctorsMap[c.id] || []

                      if (!clinicSearchQuery.trim()) {
                        return {
                          c,
                          isLab,
                          isSingle,
                          isPoly,
                          score: 10,
                          matchReason: undefined,
                          matchedDoctor: undefined,
                          clinicDocs,
                        }
                      }

                      const match = matchClinic(c, clinicDocs, [], clinicSearchQuery)
                      if (!match.isMatch) return null

                      return {
                        c,
                        isLab,
                        isSingle,
                        isPoly,
                        score: match.score,
                        matchReason: match.matchHighlightReason,
                        matchedDoctor: match.matchedDoctors?.[0],
                        clinicDocs,
                      }
                    })
                    .filter(Boolean) as Array<{
                    c: Clinic
                    isLab: boolean
                    isSingle: boolean
                    isPoly: boolean
                    score: number
                    matchReason?: string
                    matchedDoctor?: Doctor
                    clinicDocs: Doctor[]
                  }>

                  const showDocs = selectedEntityFilter === 'all' || selectedEntityFilter === 'doctors'
                  const showClinics =
                    selectedEntityFilter === 'all' ||
                    selectedEntityFilter === 'clinics' ||
                    selectedEntityFilter === 'labs'

                  const hasDocs = showDocs && scoredDoctors.length > 0
                  const hasClinics = showClinics && scoredClinics.length > 0

                  if (!hasDocs && !hasClinics) {
                    return (
                      <div className="p-12 text-center liquid-glass-card rounded-3xl border border-white/40 dark:border-white/10 max-w-md mx-auto space-y-2">
                        <AlertCircle className="w-8 h-8 mx-auto text-slate-400" />
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                          No doctors or medical centers matched
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Try adjusting your search keyword or switching category filters.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setClinicSearchQuery('')
                            setSelectedEntityFilter('all')
                            setClinicCategoryFilter('all')
                            setSelectedCityFilter('all')
                          }}
                          className="mt-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-sky-600 text-white rounded-xl text-xs font-bold transition cursor-pointer active:scale-[0.98]"
                        >
                          Reset Filters
                        </button>
                      </div>
                    )
                  }

                  return (
                    <div className="space-y-8">
                      {/* SECTION 1: MATCHING DOCTORS */}
                      {hasDocs && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                <Stethoscope className="w-4 h-4" />
                              </div>
                              <h4 className="font-extrabold text-slate-900 dark:text-white text-base">
                                Available Doctors ({scoredDoctors.length})
                              </h4>
                            </div>
                            <span className="text-xs font-semibold text-slate-500">
                              Book specialist doctor directly
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {scoredDoctors.map(({ doc, linkedClinics, matchReason }) => (
                              <div
                                key={doc.id}
                                className="liquid-glass-card rounded-3xl border border-white/40 dark:border-white/10 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 transition flex flex-col justify-between overflow-hidden group"
                              >
                                <div>
                                  <DoctorAvatarBanner doctor={doc} hasClinics={linkedClinics.length > 0} />
                                  <div className="p-5 space-y-3">
                                    {matchReason && (
                                      <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center space-x-1.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        <span className="truncate">{matchReason}</span>
                                      </div>
                                    )}

                                    {/* Specialties chips */}
                                    <div className="flex flex-wrap gap-1.5">
                                      {((doc as any).specialties && (doc as any).specialties.length > 0
                                        ? (doc as any).specialties
                                        : [doc.specialty || 'General OPD']
                                      )
                                        .slice(0, 3)
                                        .map((spec: string) => (
                                          <span
                                            key={spec}
                                            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium"
                                          >
                                            {spec}
                                          </span>
                                        ))}
                                    </div>

                                    {/* Practicing clinics info */}
                                    <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-400">
                                      <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                                      <span className="truncate">
                                        {linkedClinics.length === 0
                                          ? 'Not affiliated with active clinic'
                                          : linkedClinics.length === 1
                                          ? `Practices at ${linkedClinics[0].name} · ${
                                              linkedClinics[0].city || linkedClinics[0].addressText || 'Nepal'
                                            }`
                                          : `Available at ${linkedClinics.length} clinics (${linkedClinics[0].name} & more)`}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Footer: Fee & Action Button */}
                                <div className="px-5 py-4 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                                  <div>
                                    <p className="text-[10px] uppercase font-bold text-slate-400">
                                      Consultation Fee
                                    </p>
                                    <p className="text-base font-extrabold text-slate-900 dark:text-white">
                                      Rs. {(doc as any).consultationFee || 500}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectDoctorFromCard(doc)}
                                    disabled={linkedClinics.length === 0}
                                    className={`px-4 py-2 text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 active:scale-95 cursor-pointer ${
                                      linkedClinics.length === 0
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                                    }`}
                                  >
                                    <span>
                                      {linkedClinics.length > 1 ? 'Select Clinic & Book' : 'Book Doctor'}
                                    </span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* SECTION 2: MATCHING CLINICS */}
                      {hasClinics && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div className="p-1.5 rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300">
                                <Building2 className="w-4 h-4" />
                              </div>
                              <h4 className="font-extrabold text-slate-900 dark:text-white text-base">
                                Verified Medical Centers & Labs ({scoredClinics.length})
                              </h4>
                            </div>
                            <span className="text-xs font-semibold text-slate-500">
                              Book OPD slot or lab diagnostic test
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {scoredClinics.map(({ c, isLab, matchReason, matchedDoctor, clinicDocs }) => {
                              const mapsUrl =
                                c.latitude && c.longitude
                                  ? `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`
                                  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                                      `${c.name} ${c.addressText || ''}`
                                    )}`

                              return (
                                <div
                                  key={c.id}
                                  className="liquid-glass-card rounded-3xl border border-white/40 dark:border-white/10 hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/10 transition flex flex-col justify-between overflow-hidden group"
                                >
                                  <div>
                                    <ClinicImageBanner clinic={c} isLab={isLab} />
                                    <div className="p-5 space-y-3">
                                      {matchReason && (
                                        <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center space-x-1.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                          <span className="truncate">{matchReason}</span>
                                        </div>
                                      )}

                                      <div>
                                        <h4 className="font-black text-slate-900 dark:text-white text-lg group-hover:text-teal-600 dark:group-hover:text-teal-400 transition leading-tight">
                                          {c.name}
                                        </h4>
                                        <div className="mt-1 flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                                          <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                          <span className="truncate">{c.addressText || c.city || 'Nepal'}</span>
                                        </div>
                                      </div>

                                      {/* Specialties chips */}
                                      <div className="flex flex-wrap gap-1.5">
                                        {(isLab
                                          ? ['🧪 Pathology', '🔬 Lab Diagnostics', '🩸 Blood Tests']
                                          : c.specialties && c.specialties.length > 0
                                          ? c.specialties
                                          : ['General Medicine']
                                        )
                                          .slice(0, 3)
                                          .map((spec) => (
                                            <span
                                              key={spec}
                                              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium"
                                            >
                                              {spec}
                                            </span>
                                          ))}
                                      </div>

                                      {/* Doctor Preview row if clinic has doctors (Only for non-lab clinics) */}
                                      {!isLab && clinicDocs.length > 0 && (
                                        <div className="flex items-center space-x-2.5 pt-1">
                                          <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 font-bold text-xs flex items-center justify-center shrink-0">
                                            {clinicDocs[0].fullName.slice(0, 2).toUpperCase()}
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                              Dr. {clinicDocs[0].fullName.replace(/^dr\.?\s*/i, '')}
                                            </p>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                              {clinicDocs[0].specialty || 'General OPD'}
                                            </p>
                                          </div>
                                        </div>
                                      )}

                                      {/* Maps Link */}
                                      <div className="pt-0.5">
                                        <a
                                          href={mapsUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center space-x-1 text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline liquid-glass-subtle px-2 py-0.5 rounded-lg border border-teal-500/20"
                                        >
                                          <span>Maps Directions</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Footer: Hours & Action Buttons */}
                                  <div className="px-5 py-4 bg-slate-50/80 dark:bg-slate-900/40 border-t border-slate-100 dark:border-white/5 space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                      <div className="flex items-center space-x-1.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                                          Open · Realtime Queue
                                        </span>
                                      </div>
                                      <span className="font-bold text-teal-700 dark:text-teal-400">
                                        Verified Partner
                                      </span>
                                    </div>

                                    <div className="flex items-center space-x-2">
                                      {c.contactPhone && (
                                        <a
                                          href={`tel:${c.contactPhone}`}
                                          className="px-3.5 py-2.5 border border-teal-600/40 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                                          title="Call Clinic"
                                        >
                                          <Phone className="w-3.5 h-3.5" />
                                          <span>Call</span>
                                        </a>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleSelectClinic(c, matchedDoctor)}
                                        className="flex-1 py-2.5 bg-[#0891B2] hover:bg-[#0e7490] active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-cyan-500/20 transition flex items-center justify-center space-x-1 cursor-pointer"
                                      >
                                        <span>{isLab ? 'Book Lab Scan' : 'Book Appointment'}</span>
                                        <ArrowRight className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Loading state while clinic and calendar are initializing */}
            {activeTab === 'book' && bookingStep === 2 && !selectedClinic && (
              <div className="p-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-teal-600 dark:text-teal-400" />
                <h4 className="text-base font-bold text-slate-900 dark:text-white">Loading Appointment Calendar...</h4>
                <p className="text-xs text-slate-500">Preparing available consultation dates and slots</p>
              </div>
            )}

            {/* STEP 2: SELECT DATE & VALID SLOTS */}
            {bookingStep === 2 && selectedClinic && (
              <div className="space-y-6 max-w-2xl mx-auto">
                {/* Back Button & Clinic Summary Banner */}
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRescheduleMode(false)
                        setBookingStep(1)
                      }}
                      className="flex items-center space-x-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-xl border border-slate-200 transition shadow-2xs cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Change Clinic / Browse All Medical Centers</span>
                    </button>
                    {isLabClinic ? (
                      <span className="inline-flex items-center space-x-1 text-xs font-bold px-3 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                        <FlaskConical className="w-3.5 h-3.5 text-purple-600" />
                        <span>Diagnostic Pathology Lab</span>
                      </span>
                    ) : isSingleDoctorClinic ? (
                      <span className="inline-flex items-center space-x-1 text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Single-Visit OPD Clinic</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Multi-Specialty Polyclinic</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-teal-500 text-white flex items-center justify-center font-black text-xl sm:text-2xl shadow-xs shrink-0 overflow-hidden border border-slate-200">
                      {selectedClinic.logoUrl || selectedClinic.photoUrl || (selectedClinic.pictures && selectedClinic.pictures.length > 0) ? (
                        <img
                          src={selectedClinic.logoUrl || selectedClinic.photoUrl || selectedClinic.pictures![0]}
                          alt={selectedClinic.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            ;(e.target as HTMLElement).style.display = 'none'
                          }}
                        />
                      ) : isLabClinic ? (
                        <FlaskConical className="w-7 h-7 text-white" />
                      ) : (
                        <span>{selectedClinic.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-black text-slate-900 truncate">{selectedClinic.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-500">
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{selectedClinic.addressText || 'Nepal'}</span>
                        </div>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            `${selectedClinic.name} ${selectedClinic.addressText || ''}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1 text-brand-600 hover:underline font-bold"
                        >
                          <span>Google Maps</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        {selectedClinic.contactPhone && (
                          <div className="flex items-center space-x-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{selectedClinic.contactPhone}</span>
                          </div>
                        )}
                        {selectedClinic.managerPhone && (
                          <div className="flex items-center space-x-1">
                            <span className="text-slate-400 font-bold">• Reception:</span>
                            <span>{selectedClinic.managerPhone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reschedule Active Banner (All clinic types: Lab, Single Doctor OPD, Polyclinic) */}
                {isRescheduleMode && retainedAppointment && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start justify-between gap-3 text-emerald-950">
                    <div className="flex items-start space-x-3">
                      <RefreshCw className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-0.5">
                        <strong className="block font-bold">
                          Rescheduling Appointment #{retainedAppointment.trackingCode10Digit}
                        </strong>
                        <p className="text-emerald-800">
                          Patient: {retainedAppointment.patientName} • Current Slot: {retainedAppointment.appointmentDate} ({retainedAppointment.appointmentTime}) • Pick your new date & slot below (NPR 0 extra fee).
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRescheduleMode(false)
                        setIsReturningPatient(false)
                        setRetainedAppointment(null)
                        setFollowupCodeInput('')
                      }}
                      className="text-[11px] font-bold text-emerald-800 hover:underline shrink-0 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* ============================================================== */}
                {/* CASE 1: DIAGNOSTIC PATHOLOGY LAB */}
                {/* ============================================================== */}
                {isLabClinic && !isRescheduleMode && (
                  <div className="space-y-6">
                    {/* Notice Banner */}
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex items-start space-x-3 text-purple-900">
                      <FlaskConical className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-0.5">
                        <strong className="block font-bold">Diagnostic Pathology Lab Booking</strong>
                        <p className="text-purple-700">
                          Select the tests or pathology packages you need, then pick your preferred sample collection slot. Verified digital reports will be uploaded directly to your portal once processed.
                        </p>
                      </div>
                    </div>

                    {/* Test Catalog Checkboxes */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Select Diagnostic Tests & Packages *
                        </label>
                        <span className="text-xs font-bold text-purple-700">
                          {selectedLabTests.length} tests selected
                        </span>
                      </div>

                      {clinicServices.length === 0 ? (
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-2">
                          <p className="font-semibold text-slate-800">Standard Pathology Service Catalog:</p>
                          {[
                            { id: 's1', serviceName: 'Complete Blood Count (CBC)', price: 450 },
                            { id: 's2', serviceName: 'Lipid Profile (Cholesterol / Triglycerides)', price: 900 },
                            { id: 's3', serviceName: 'Liver Function Test (LFT)', price: 1100 },
                            { id: 's4', serviceName: 'Thyroid Function Test (TSH, T3, T4)', price: 1200 },
                            { id: 's5', serviceName: 'Fasting Blood Sugar (FBS)', price: 200 },
                            { id: 's6', serviceName: 'Urine Routine Examination', price: 250 },
                          ].map((item) => {
                            const isChecked = selectedLabTests.some((t) => t.id === item.id)
                            return (
                              <div
                                key={item.id}
                                onClick={() => {
                                  if (isChecked) {
                                    setSelectedLabTests(selectedLabTests.filter((t) => t.id !== item.id))
                                  } else {
                                    setSelectedLabTests([...selectedLabTests, item as any])
                                  }
                                }}
                                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                                  isChecked
                                    ? 'bg-purple-50/70 border-purple-500 ring-1 ring-purple-500'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center space-x-2.5">
                                  {isChecked ? (
                                    <CheckSquare className="w-4 h-4 text-purple-600" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-400" />
                                  )}
                                  <span className="font-bold text-slate-800 text-xs">{item.serviceName}</span>
                                </div>
                                <span className="font-black text-slate-900 text-xs">NPR {item.price}</span>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {clinicServices.map((service) => {
                            const isChecked = selectedLabTests.some((t) => t.id === service.id)
                            return (
                              <div
                                key={service.id}
                                onClick={() => {
                                  if (isChecked) {
                                    setSelectedLabTests(selectedLabTests.filter((t) => t.id !== service.id))
                                  } else {
                                    setSelectedLabTests([...selectedLabTests, service])
                                  }
                                }}
                                className={`p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                                  isChecked
                                    ? 'bg-purple-50/70 border-purple-500 ring-1 ring-purple-500 shadow-2xs'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center space-x-3">
                                  {isChecked ? (
                                    <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                  )}
                                  <div>
                                    <div className="font-bold text-slate-800 text-xs">{service.serviceName}</div>
                                    {service.description && (
                                      <div className="text-[11px] text-slate-400 line-clamp-1">{service.description}</div>
                                    )}
                                  </div>
                                </div>
                                <span className="font-black text-slate-900 text-xs">
                                  NPR {service.price || 500}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Selected Tests Summary Pill */}
                      {selectedLabTests.length > 0 && (
                        <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl flex items-center justify-between text-xs">
                          <span className="font-semibold text-purple-900">Total Diagnostic Tests Cost:</span>
                          <span className="font-black text-purple-900 text-sm">NPR {calculatedFee}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ============================================================== */}
                {/* CASE 2: SINGLE-DOCTOR / SINGLE-VISIT CLINIC */}
                {/* ============================================================== */}
                {isSingleDoctorClinic && (
                  <div className="space-y-6">
                    {/* Notice Banner */}
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start space-x-3 text-emerald-900">
                      <Stethoscope className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-0.5">
                        <strong className="block font-bold">Single-Visit Consultation Clinic</strong>
                        <p className="text-emerald-700">
                          Each booking generates a dedicated single-use OPD token with our verified attending specialist. Arrive at the clinic during your chosen slot.
                        </p>
                      </div>
                    </div>

                    {/* Single Doctor Profile Card */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Attending Specialist Doctor
                      </label>
                      <div className="p-5 rounded-3xl border-2 border-emerald-500 bg-emerald-50/30 flex items-start space-x-4">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xl shrink-0 overflow-hidden">
                          {selectedDoctor?.profilePictureUrl ? (
                            <img
                              src={selectedDoctor.profilePictureUrl}
                              alt={selectedDoctor.fullName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-7 h-7" />
                          )}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-black text-slate-900 text-base">
                              {selectedDoctor?.fullName || 'Certified Specialist'}
                            </h4>
                            <span className="text-xs font-black text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-lg">
                              NPR {selectedDoctor?.consultationFee || 500}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-emerald-700">
                            {selectedDoctor?.specialty || 'General OPD Medicine'}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500 font-medium">
                            <span>{selectedDoctor?.education || 'MBBS, MD'}</span>
                            {selectedDoctor?.startingPracticingYear && (
                              <span>• {new Date().getFullYear() - selectedDoctor.startingPracticingYear} Yrs Exp</span>
                            )}
                            {selectedDoctor?.nmcLicenseNumber && <span>• NMC #{selectedDoctor.nmcLicenseNumber}</span>}
                          </div>
                          <div className="pt-1.5 flex items-center space-x-2">
                            <span
                              className={`inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                selectedDoctor?.isInClinic !== false
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              <span>{selectedDoctor?.isInClinic !== false ? 'In Clinic Chamber' : 'Scheduled'}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ============================================================== */}
                {/* CASE 3: POLYCLINIC / MULTI-SPECIALTY CLINIC */}
                {/* ============================================================== */}
                {isPolyclinic && (
                  <div className="space-y-6">
                    {/* Notice Banner */}
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start space-x-3 text-blue-900">
                      <Building2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-0.5">
                        <strong className="block font-bold">Multi-Specialty Polyclinic</strong>
                        <p className="text-blue-700">
                          Choose between a New Patient Consultation or a 100% Free Follow-Up Visit with your previous 10-digit Appointment ID.
                        </p>
                      </div>
                    </div>

                    {/* Visit Type Toggle: New vs Follow-up */}
                    {!isRescheduleMode && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Consultation Type
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setIsReturningPatient(false)
                            setIsRescheduleMode(false)
                            setFollowupCodeInput('')
                            setRetainedAppointment(null)
                          }}
                          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                            !isReturningPatient
                              ? 'border-brand-600 bg-brand-50/50 ring-2 ring-brand-500/20 font-bold'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900">New Patient Consultation</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Standard consultation fee applies</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsReturningPatient(true)}
                          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                            isReturningPatient
                              ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20 font-bold'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="text-xs font-bold text-emerald-800 flex items-center justify-between">
                            <span>Follow-Up Visit</span>
                            <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full uppercase">
                              FREE
                            </span>
                          </div>
                          <div className="text-[11px] text-emerald-700 mt-0.5">100% Free with 10-digit ID</div>
                        </button>
                      </div>
                    </div>
                    )}

                    {/* Follow-up 10-Digit Code Input Box */}
                    {!isRescheduleMode && isReturningPatient && (
                      <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-3">
                        <label className="block text-xs font-bold text-emerald-900">
                          Enter 10-Digit Previous Appointment Token ID *
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            maxLength={10}
                            value={followupCodeInput}
                            onChange={(e) => setFollowupCodeInput(e.target.value.replace(/\D/g, ''))}
                            placeholder="Enter 10-digit token (e.g. 8472910384)"
                            className="w-full px-4 py-2.5 bg-white border border-emerald-300 rounded-xl text-sm font-mono font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          {isLookingUpCode && (
                            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2" />
                          )}
                        </div>

                        {followupLookupError && (
                          <p className="text-[11px] text-rose-600 font-bold">{followupLookupError}</p>
                        )}

                        {retainedAppointment && (
                          <div className="p-3 bg-white rounded-xl border border-emerald-300 flex items-start space-x-3 text-xs text-emerald-900">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-bold">Verified Retained Patient: {retainedAppointment.patientName}</div>
                              <div className="text-[11px] text-slate-500">
                                Previous Visit: {retainedAppointment.appointmentDate} • Token #{retainedAppointment.trackingCode10Digit}
                              </div>
                              <div className="text-[11px] font-bold text-emerald-700 mt-0.5">
                                ✓ 100% Free Follow-Up Visit Activated (NPR 0)
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Doctor Selection Roster for Polyclinic */}
                    {clinicDoctors.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Select Specialist Doctor *
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {clinicDoctors.map((doc) => (
                            <div
                              key={doc.id}
                              onClick={() => setSelectedDoctor(doc)}
                              className={`p-4 rounded-2xl border cursor-pointer transition ${
                                selectedDoctor?.id === doc.id
                                  ? 'border-brand-600 bg-brand-50/50 ring-2 ring-brand-500/20 shadow-xs'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-start space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                                  {doc.profilePictureUrl ? (
                                    <img src={doc.profilePictureUrl} alt={doc.fullName} className="w-full h-full object-cover" />
                                  ) : (
                                    <User className="w-5 h-5" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-sm text-slate-900 truncate">{doc.fullName}</div>
                                  <div className="text-xs text-brand-600 font-medium truncate">{doc.specialty}</div>
                                </div>
                              </div>
                              <div className="text-xs text-slate-400 mt-2 flex items-center justify-between pt-1 border-t border-slate-100">
                                <span>{doc.education || 'MBBS, MD'}</span>
                                <strong className="text-slate-800">
                                  {isReturningPatient && retainedAppointment ? 'Free Follow-Up' : `NPR ${doc.consultationFee || 500}`}
                                </strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Always-Visible 7-Column Month Calendar Grid (Front & Center on Date & Slot Page) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-brand-600" />
                      <span>{isLabClinic ? 'Select Sample Collection Date (Month View) *' : 'Select Appointment Date (Month View) *'}</span>
                    </label>
                    {monthSlotsLoading && (
                      <span className="text-[10px] text-brand-600 font-semibold animate-pulse flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Updating slots...</span>
                      </span>
                    )}
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2.5">
                    {/* Month Navigator Header */}
                    <div className="flex items-center justify-between px-1">
                      <button
                        type="button"
                        disabled={viewedYearMonth.year === currentYearMonth.year && viewedYearMonth.month === currentYearMonth.month}
                        onClick={() => {
                          setViewedYearMonth((prev) => {
                            const m = prev.month === 0 ? 11 : prev.month - 1
                            const y = prev.month === 0 ? prev.year - 1 : prev.year
                            return { year: y, month: m }
                          })
                        }}
                        className="p-1.5 rounded-xl hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed text-slate-700 cursor-pointer transition"
                        title="Previous Month"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <span className="text-xs font-black text-slate-900 tracking-wide">
                        {new Date(viewedYearMonth.year, viewedYearMonth.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
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
                        className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 cursor-pointer transition"
                        title="Next Month"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Day of Week Headers */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                        <span key={d} className="text-[10px] font-bold text-slate-400 uppercase">{d}</span>
                      ))}
                    </div>

                    {/* 7-Column Day Grid with 4 States and Status Dots */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {Array.from({ length: new Date(viewedYearMonth.year, viewedYearMonth.month, 1).getDay() }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-8" />
                      ))}
                      {Array.from({ length: new Date(viewedYearMonth.year, viewedYearMonth.month + 1, 0).getDate() }).map((_, i) => {
                        const dayNum = i + 1
                        const dateStr = `${viewedYearMonth.year}-${String(viewedYearMonth.month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                        const dateState = computeCalendarDateState(dateStr)
                        const isSelectable = dateState === 'available'
                        const isSelected = bookingDate === dateStr

                        return (
                          <button
                            key={dateStr}
                            type="button"
                            disabled={!isSelectable}
                            onClick={() => setBookingDate(dateStr)}
                            className={`h-8 sm:h-9 rounded-xl flex flex-col items-center justify-center relative transition-all ${
                              isSelected
                                ? 'bg-brand-600 text-white font-black shadow-sm ring-2 ring-brand-500/30'
                                : isSelectable
                                ? 'hover:bg-brand-50 text-slate-800 font-bold cursor-pointer active:scale-95'
                                : dateState === 'past'
                                ? 'text-slate-300 cursor-not-allowed'
                                : dateState === 'fully_booked'
                                ? 'text-slate-600 bg-amber-50/50 cursor-not-allowed'
                                : 'text-slate-400 bg-slate-100/50 cursor-not-allowed'
                            }`}
                          >
                            <span className="text-[11px] leading-none">{dayNum}</span>
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

                    {/* Legend */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-around text-[10px] text-slate-500 font-semibold">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>Available</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>Fully Booked</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        <span>Closed / Holiday</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Jump Banner */}
                  {nextAvailableDate && nextAvailableDate !== bookingDate && (
                    <div className="p-2.5 rounded-xl bg-brand-50/80 border border-brand-200/80 flex items-center justify-between text-xs text-brand-900 font-semibold">
                      <div className="flex items-center gap-1.5 truncate">
                        <Calendar className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                        <span className="truncate">Next Open: {new Date(nextAvailableDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const targetD = new Date(nextAvailableDate + 'T00:00:00')
                          setViewedYearMonth({ year: targetD.getFullYear(), month: targetD.getMonth() })
                          setBookingDate(nextAvailableDate)
                        }}
                        className="text-[11px] font-bold text-brand-700 underline hover:text-brand-900 cursor-pointer shrink-0 ml-2"
                      >
                        Book this date
                      </button>
                    </div>
                  )}
                </div>

                {/* Common Slots Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {isLabClinic ? 'Available Sample Collection Slots *' : 'Available Time Slots *'}
                    </label>
                    <span className="text-[11px] text-slate-400">
                      (Past slots ending before now are hidden)
                    </span>
                  </div>

                  {isLoadingSlots ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-brand-600 mb-2" />
                      <span className="text-xs text-slate-500">Checking slot availability...</span>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="p-6 text-center bg-amber-50/60 rounded-2xl border border-amber-200 text-amber-900 space-y-1">
                      <Clock className="w-5 h-5 mx-auto text-amber-600 mb-1" />
                      <p className="text-xs font-bold">No Slots Published for {bookingDate}</p>
                      <p className="text-[11px] text-amber-700">
                        This center has not published time slots for this date. Please pick another date or contact clinic reception directly.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`p-3 rounded-xl border text-center transition cursor-pointer ${
                            selectedSlot?.id === slot.id
                              ? 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-600/20 font-bold'
                              : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700 font-semibold'
                          }`}
                        >
                          <div className="text-xs">{slot.startTime} - {slot.endTime}</div>
                          <div className={`text-[10px] mt-0.5 ${selectedSlot?.id === slot.id ? 'text-brand-100' : 'text-slate-400'}`}>
                            {slot.maxCapacity - slot.bookedCount} spots left
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Continue Action / 1-Click Follow-Up or Reschedule Action */}
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={handleProceedFromSlotStep}
                    disabled={
                      isPaymentProcessing ||
                      !selectedSlot ||
                      availableSlots.length === 0 ||
                      (!isRescheduleMode && isLabClinic && selectedLabTests.length === 0)
                    }
                    className={`w-full py-3.5 font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 ${
                      (isRescheduleMode || isReturningPatient) && retainedAppointment
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                        : 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-600/20'
                    }`}
                  >
                    {isPaymentProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{isRescheduleMode ? 'Rescheduling Appointment...' : 'Confirming Follow-Up...'}</span>
                      </>
                    ) : (isRescheduleMode || isReturningPatient) && retainedAppointment ? (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>{isRescheduleMode ? 'Confirm Reschedule' : 'Confirm Follow-Up'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        <span>Continue to Patient Details</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  {isRescheduleMode && retainedAppointment ? (
                    <p className="text-[11px] text-center text-emerald-700 font-semibold">
                      ✓ Rescheduling Token #{retainedAppointment.trackingCode10Digit} • Patient: {retainedAppointment.patientName} • NPR 0 Extra Fee
                    </p>
                  ) : isReturningPatient && retainedAppointment ? (
                    <p className="text-[11px] text-center text-emerald-700 font-semibold">
                      ✓ 100% Free Follow-Up • Verified for {retainedAppointment.patientName} (#{retainedAppointment.trackingCode10Digit}) • Instant Booking (No Login or Payment Required)
                    </p>
                  ) : !patientUser && (
                    <p className="text-[11px] text-center text-slate-500 font-medium">
                      🔒 Sign-in required on next step. Your selected clinic, services, date, and slot will be saved automatically.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: PATIENT INFORMATION */}
            {bookingStep === 3 && (
              <form onSubmit={handleProceedToPayment} className="space-y-6 max-w-xl mx-auto">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setBookingStep(2)}
                    className="flex items-center space-x-1 text-xs font-bold text-slate-500 hover:text-slate-800"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Slot</span>
                  </button>
                  <span className="text-xs font-bold text-slate-500">
                    Slot: {selectedSlot?.startTime} ({bookingDate})
                  </span>
                </div>

                {/* Verified Follow-Up Patient Details Locked Banner */}
                {isReturningPatient && retainedAppointment && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                      <Lock className="w-4 h-4 text-emerald-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-900">
                          Verified Follow-Up Patient Details Locked
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900 text-[10px] font-bold">
                          FREE (Rs. 0)
                        </span>
                      </div>
                      <p className="text-xs text-emerald-700 mt-1">
                        Linked to Previous Appointment #{retainedAppointment.trackingCode10Digit} ({retainedAppointment.patientName}). Patient details cannot be altered for follow-up visits.
                      </p>
                    </div>
                  </div>
                )}

                {/* Patient Full Name */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">Patient Full Name *</label>
                    {isReturningPatient && retainedAppointment && (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-500">
                        <Lock className="w-3 h-3 text-slate-400" />
                        <span>Locked</span>
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={bookPatientName}
                    onChange={(e) => setBookPatientName(e.target.value)}
                    placeholder="e.g. Sita Sharma"
                    readOnly={Boolean(isReturningPatient && retainedAppointment)}
                    disabled={Boolean(isReturningPatient && retainedAppointment)}
                    className={`w-full px-4 py-3 border rounded-xl text-sm font-semibold outline-none transition ${
                      isReturningPatient && retainedAppointment
                        ? 'bg-slate-100 text-slate-700 border-slate-200 cursor-not-allowed select-none'
                        : 'bg-white border-slate-200 text-slate-900 focus:ring-2 focus:ring-brand-500'
                    }`}
                  />
                </div>

                {/* Mobile Number & Age */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700">Mobile Number (10 digits) *</label>
                      {isReturningPatient && retainedAppointment && (
                        <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-500">
                          <Lock className="w-3 h-3 text-slate-400" />
                          <span>Locked</span>
                        </span>
                      )}
                    </div>
                    <input
                      type="tel"
                      required
                      value={bookPatientPhone}
                      onChange={(e) => setBookPatientPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="98xxxxxxxx"
                      maxLength={10}
                      readOnly={Boolean(isReturningPatient && retainedAppointment)}
                      disabled={Boolean(isReturningPatient && retainedAppointment)}
                      className={`w-full px-4 py-3 border rounded-xl text-sm font-semibold outline-none transition ${
                        isReturningPatient && retainedAppointment
                          ? 'bg-slate-100 text-slate-700 border-slate-200 cursor-not-allowed select-none'
                          : 'bg-white border-slate-200 text-slate-900 focus:ring-2 focus:ring-brand-500'
                      }`}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700">Patient Age (Years) *</label>
                      {isReturningPatient && retainedAppointment && (
                        <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-500">
                          <Lock className="w-3 h-3 text-slate-400" />
                          <span>Locked</span>
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      required
                      value={bookPatientAge}
                      onChange={(e) => setBookPatientAge(e.target.value)}
                      placeholder="e.g. 32"
                      min="1"
                      max="120"
                      readOnly={Boolean(isReturningPatient && retainedAppointment)}
                      disabled={Boolean(isReturningPatient && retainedAppointment)}
                      className={`w-full px-4 py-3 border rounded-xl text-sm font-semibold outline-none transition ${
                        isReturningPatient && retainedAppointment
                          ? 'bg-slate-100 text-slate-700 border-slate-200 cursor-not-allowed select-none'
                          : 'bg-white border-slate-200 text-slate-900 focus:ring-2 focus:ring-brand-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Gender */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">Gender *</label>
                    {isReturningPatient && retainedAppointment && (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-500">
                        <Lock className="w-3 h-3 text-slate-400" />
                        <span>Locked</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-3">
                    {['Male', 'Female', 'Other'].map((g) => (
                      <button
                        key={g}
                        type="button"
                        disabled={Boolean(isReturningPatient && retainedAppointment)}
                        onClick={() => !Boolean(isReturningPatient && retainedAppointment) && setBookPatientGender(g)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition ${
                          (bookPatientGender || 'Male').toLowerCase() === g.toLowerCase()
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200'
                        } ${isReturningPatient && retainedAppointment ? 'cursor-not-allowed opacity-90' : ''}`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Symptoms / Clinical Notes */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Symptoms / Medical Notes (Optional)</label>
                  <textarea
                    rows={2}
                    value={bookPatientNotes}
                    onChange={(e) => setBookPatientNotes(e.target.value)}
                    placeholder="Brief description of headache, fever, previous checkup..."
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>


                <button
                  type="submit"
                  disabled={isPaymentProcessing}
                  className={`w-full py-3.5 font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center space-x-2 ${
                    isReturningPatient && retainedAppointment
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                      : 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-600/20'
                  }`}
                >
                  {isPaymentProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Confirming Free Follow-Up...</span>
                    </>
                  ) : isReturningPatient && retainedAppointment ? (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Directly Confirm Free Follow-Up Booking (NPR 0)</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Proceed to Payment Confirmation</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 4: PAYMENT GATEWAY & 5-MINUTE RETAIN TIMER */}
            {bookingStep === 4 && (
              <div className="space-y-6 max-w-xl mx-auto">
                {/* 5-Minute Retain Countdown Timer Banner */}
                {isVerifyingEsewa ? (
                  <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center space-x-3 text-emerald-900">
                    <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin shrink-0" />
                    <div className="flex-1">
                      <div className="text-xs font-bold">Verifying eSewa Payment</div>
                      <div className="text-[11px] text-emerald-700">
                        {esewaVerifyMessage || 'Contacting server to verify eSewa payment status...'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => verifyEsewaPaymentOnReturn()}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition"
                    >
                      Refresh
                    </button>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between text-amber-900">
                    <div className="flex items-center space-x-3">
                      <Timer className="w-6 h-6 text-amber-600 animate-pulse" />
                      <div>
                        <div className="text-xs font-bold">Slot Reservation Retained</div>
                        <div className="text-[11px] text-amber-700">
                          Retains your spot for 5 minutes even if you close or refresh this tab.
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-xl font-black text-amber-900 tracking-wider">
                        {formattedTimer}
                      </span>
                    </div>
                  </div>
                )}

                {/* Appointment & Fee Summary */}
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Medical Center</span>
                    <strong className="text-slate-800">{selectedClinic?.name}</strong>
                  </div>
                  {isLabClinic ? (
                    <div className="flex items-start justify-between text-xs text-slate-500">
                      <span>Diagnostic Tests ({selectedLabTests.length})</span>
                      <strong className="text-slate-800 text-right max-w-[240px] truncate">
                        {selectedLabTests.map((t) => t.serviceName).join(', ')}
                      </strong>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Attending Specialist</span>
                      <strong className="text-slate-800">{selectedDoctor?.fullName || 'General OPD'}</strong>
                    </div>
                  )}
                  {isReturningPatient && retainedAppointment && (
                    <div className="flex items-center justify-between text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                      <span>Visit Type</span>
                      <strong className="font-bold">Follow-Up (Previous Token #{retainedAppointment.trackingCode10Digit})</strong>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Patient</span>
                    <strong className="text-slate-800">{bookPatientName}</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{isLabClinic ? 'Sample Collection Slot' : 'Appointment Slot'}</span>
                    <strong className="text-slate-800">{bookingDate} • {selectedSlot?.startTime}</strong>
                  </div>
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">
                      {isLabClinic ? 'Total Pathology Lab Fee' : 'Total Consultation Fee'}
                    </span>
                    <span className="text-lg font-black text-brand-700">
                      {calculatedFee === 0 ? 'FREE (NPR 0)' : `NPR ${calculatedFee}`}
                    </span>
                  </div>
                </div>

                {/* 100% Free Follow-Up Visit Card OR Digital Payment Gateways */}
                {calculatedFee === 0 ? (
                  <div className="bg-emerald-50 border-2 border-emerald-500 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center space-x-3 text-emerald-900">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div>
                        <div className="text-base font-black">100% Free Follow-Up Visit (NPR 0)</div>
                        <div className="text-xs text-emerald-700">
                          Verified with Previous Appointment #{retainedAppointment?.trackingCode10Digit}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-emerald-800 font-medium">
                      Your follow-up visit with Dr. {selectedDoctor?.fullName} is eligible for zero consultation charge. No digital payment gateway fee will be charged.
                    </p>
                    <button
                      type="button"
                      disabled={isPaymentProcessing}
                      onClick={() => handleExecutePayment(true)}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-2xl shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      <Check className="w-5 h-5 stroke-[3]" />
                      <span>{isPaymentProcessing ? 'Confirming Follow-Up...' : 'Confirm Free Follow-Up Appointment'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancelPaymentSession('User cancelled follow-up')}
                      disabled={isPaymentProcessing}
                      className="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition"
                    >
                      Cancel & Choose Different Slot
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Select Payment Method (Strictly filtered to clinic-verified gateways + always-available Pay at Desk) */}
                    {(() => {
                      const isDirect = selectedClinic?.isDirectPaymentEnabled === true
                      const verifiedOnlineOptions = [
                        ...(isDirect && clinicPaymentConfig?.esewa?.enabled && clinicPaymentConfig?.esewa?.is_verified
                          ? [{ id: 'esewa', name: 'eSewa Wallet', sub: 'Instant eSewa Checkout', color: 'bg-brand-500', merchantCode: clinicPaymentConfig.esewa.merchantCode || '' }]
                          : []),
                        ...(isDirect && clinicPaymentConfig?.khalti?.enabled && clinicPaymentConfig?.khalti?.is_verified
                          ? [{ id: 'khalti', name: 'Khalti Digital', sub: 'Wallet & Mobile Banking', color: 'bg-purple-600', merchantCode: clinicPaymentConfig.khalti.merchantCode || '' }]
                          : []),
                        ...(isDirect && clinicPaymentConfig?.fonepay?.enabled && clinicPaymentConfig?.fonepay?.is_verified
                          ? [{ id: 'fonepay', name: 'Fonepay QR', sub: 'Interbank QR & Banking', color: 'bg-rose-500', merchantCode: clinicPaymentConfig.fonepay.merchantCode || '' }]
                          : []),
                        ...(isDirect && clinicPaymentConfig?.connectips?.enabled && clinicPaymentConfig?.connectips?.is_verified
                          ? [{ id: 'connectips', name: 'ConnectIPS', sub: 'NCHL Direct Bank Transfer', color: 'bg-indigo-600', merchantCode: clinicPaymentConfig.connectips.merchantCode || '' }]
                          : []),
                      ]
                      const allOptions = [
                        ...verifiedOnlineOptions,
                        { id: 'pay_at_desk', name: 'Pay at Desk (+5%)', sub: 'Pay at clinic counter', color: 'bg-slate-700', merchantCode: '' },
                      ]
                      const activeOnline = verifiedOnlineOptions.find((o) => o.id === selectedPaymentMethod)
                      const serviceChargeAmt = Number((calculatedFee * (PAY_AT_DESK_SERVICE_CHARGE_PERCENT / 100)).toFixed(2))
                      const totalAtDesk = Number((calculatedFee + serviceChargeAmt).toFixed(2))

                      return (
                        <>
                          <div className="space-y-3">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                              Select Payment Method
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {allOptions.map((pm) => (
                                <button
                                  key={pm.id}
                                  type="button"
                                  onClick={() => setSelectedPaymentMethod(pm.id as any)}
                                  className={`p-3.5 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                                    selectedPaymentMethod === pm.id
                                      ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-500/20 shadow-sm'
                                      : 'border-slate-200 bg-white hover:border-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                                    {pm.id === 'esewa' ? (
                                      <div className="w-10 h-10 rounded-xl bg-[#60BB46] shrink-0 flex items-center justify-center shadow-xs">
                                        <span className="text-white font-black text-xl italic select-none" style={{ fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}>e</span>
                                      </div>
                                    ) : pm.id === 'khalti' ? (
                                      <div className="w-10 h-10 rounded-xl bg-[#5D2E8E] shrink-0 flex items-center justify-center shadow-xs">
                                        <span className="text-white font-black text-lg select-none" style={{ fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}>K</span>
                                      </div>
                                    ) : pm.id === 'fonepay' ? (
                                      <div className="w-10 h-10 rounded-xl bg-[#C8102E] shrink-0 flex items-center justify-center shadow-xs text-white">
                                        <QrCode className="w-5 h-5 stroke-[2.2]" />
                                      </div>
                                    ) : pm.id === 'connectips' ? (
                                      <div className="w-10 h-10 rounded-xl bg-[#0B3B60] shrink-0 flex items-center justify-center shadow-xs text-white relative overflow-hidden">
                                        <Building2 className="w-5 h-5 stroke-[2.2]" />
                                        <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-[#E31B23]"></span>
                                      </div>
                                    ) : (
                                      <div className="w-10 h-10 rounded-xl bg-amber-500 shrink-0 flex items-center justify-center shadow-xs text-white">
                                        <Store className="w-5 h-5 stroke-[2.2]" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center space-x-1.5 flex-wrap">
                                        <div className="text-xs font-bold text-slate-900 truncate">{pm.name}</div>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                          pm.id === 'pay_at_desk'
                                            ? 'bg-amber-500/15 text-amber-700'
                                            : 'bg-emerald-500/15 text-emerald-700'
                                        }`}>
                                          {pm.id === 'pay_at_desk' ? '+5% Fee' : '0% Fee'}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-500 truncate mt-0.5">{pm.sub}</div>
                                    </div>
                                  </div>
                                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ml-2 shrink-0 ${
                                    selectedPaymentMethod === pm.id
                                      ? 'border-teal-600 bg-teal-600'
                                      : 'border-slate-300'
                                  }`}>
                                    {selectedPaymentMethod === pm.id && (
                                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>

                            {/* Only display gateway merchant details if a verified online gateway is selected */}
                            {activeOnline ? (
                              <div className="p-4 bg-slate-100 rounded-xl text-xs space-y-1 text-slate-600">
                                <div className="font-semibold text-slate-800">
                                  Merchant Account: {selectedClinic?.name}
                                </div>
                                {activeOnline.merchantCode && (
                                  <div>
                                    Verified Gateway ID:{' '}
                                    <code className="font-mono text-slate-800 bg-white px-1.5 py-0.5 rounded">
                                      {activeOnline.merchantCode}
                                    </code>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2 text-xs text-amber-900">
                                <div className="font-bold">
                                  A {PAY_AT_DESK_SERVICE_CHARGE_PERCENT}% service charge applies when paying at the clinic desk
                                </div>
                                <div className="flex justify-between text-slate-700">
                                  <span>Consultation / Lab Fee:</span>
                                  <span className="font-semibold">NPR {calculatedFee}</span>
                                </div>
                                <div className="flex justify-between text-slate-700">
                                  <span>{PAY_AT_DESK_SERVICE_CHARGE_PERCENT}% Service Charge:</span>
                                  <span className="font-semibold">NPR {serviceChargeAmt}</span>
                                </div>
                                <div className="border-t border-amber-200 pt-1.5 flex justify-between font-black text-slate-900">
                                  <span>Total Payable at Desk:</span>
                                  <span className="text-brand-700">NPR {totalAtDesk}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* ACTION BUTTONS (With double-click prevention) */}
                          <div className="space-y-3 pt-2">
                            <button
                              type="button"
                              disabled={isPaymentProcessing || isVerifyingEsewa}
                              onClick={() => handleExecutePayment(false)}
                              className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md shadow-brand-600/20 transition flex items-center justify-center space-x-2 cursor-pointer"
                            >
                              <ShieldCheck className="w-4 h-4" />
                              <span>
                                {isPaymentProcessing || isVerifyingEsewa
                                  ? 'Processing Payment...'
                                  : selectedPaymentMethod === 'pay_at_desk' || selectedPaymentMethod === 'cash'
                                  ? `Confirm Pay at Desk (NPR ${totalAtDesk})`
                                  : `Pay NPR ${calculatedFee} via ${activeOnline?.name || selectedPaymentMethod.toUpperCase()} (Secure Checkout)`}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCancelPaymentSession('User clicked cancel button')}
                              disabled={isPaymentProcessing}
                              className="w-full py-2.5 text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                            >
                              Cancel Transaction & Choose Different Slot
                            </button>
                          </div>
                        </>
                      )
                    })()}
                  </>
                )}
              </div>
            )}

            {/* STEP 5: BOOKING CONFIRMED */}
            {bookingStep === 5 && confirmedBooking && (
              <div className="space-y-6 max-w-md mx-auto text-center py-4">
                <div className="w-16 h-16 rounded-3xl bg-brand-100 text-brand-600 flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900">
                    {isRescheduleMode ? 'Appointment Rescheduled!' : 'Appointment Confirmed!'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {isRescheduleMode
                      ? 'Your appointment time and clinic slot have been updated using your existing tracking token.'
                      : 'Your appointment has been registered in the live clinic queue board.'}
                  </p>
                </div>

                {/* 10-Digit Code Box */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 space-y-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">
                    Your 10-Digit Live Token
                  </span>
                  <div className="flex items-center justify-center space-x-2">
                    <span className="font-mono text-3xl font-black text-slate-900 tracking-wider">
                      {confirmedBooking.trackingCode10Digit}
                    </span>
                    <button
                      onClick={() => handleCopyCode(confirmedBooking.trackingCode10Digit)}
                      className="p-1.5 text-slate-400 hover:text-brand-600"
                    >
                      {copiedCode === confirmedBooking.trackingCode10Digit ? (
                        <Check className="w-5 h-5 text-brand-600" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-brand-600 font-semibold">
                    Keep this 10-digit code to track your queue position or check in at the clinic desk.
                  </p>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setViewingBillAppt(confirmedBooking)}
                    className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold text-xs rounded-xl shadow-glass-brand border border-white/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>View & Download Official Invoice Slip</span>
                  </button>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => {
                      if (onOpenLiveQueue) {
                        onOpenLiveQueue(confirmedBooking.trackingCode10Digit)
                      } else {
                        window.location.hash = '#live-queue'
                      }
                    }}
                    className="flex-1 py-3 bg-slate-900 hover:bg-brand-600 text-white font-bold text-xs rounded-xl shadow-md transition"
                  >
                    Open Live Queue Board
                  </button>
                  <button
                    onClick={() => {
                      setIsRescheduleMode(false)
                      setActiveTab('appointments')
                      setBookingStep(1)
                    }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition"
                  >
                    View All Appointments
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            TAB: PATIENT DIRECTORY & RECORDS
            (1:1 Parity with Android App RecordsTab)
        ========================================== */}
        {(activeTab === 'records' || activeTab === 'reports') && (
          <div className="space-y-6">
            {/* Top Gradient Header Banner (Palette matched to Dactor logo: #2563EB -> #1D4ED8) */}
            <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-blue-600 via-blue-700 to-sky-600 text-white shadow-lg shadow-blue-500/20 relative overflow-hidden border border-white/20">
              <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold text-white mb-2 border border-white/20">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Dactor Health Records & Medical Vault</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white">
                    Patient Directory & Records
                  </h3>
                  <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl">
                    Access your completed doctor consultations, digital prescriptions (Rx), clinical receipts, and diagnostic pathology lab reports anytime.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setClaimCodeInput('')
                      setClaimCodeError(null)
                      setShowClaimModal(true)
                    }}
                    className="flex items-center space-x-1.5 px-4 py-2.5 bg-white text-blue-700 hover:bg-blue-50 font-bold text-xs rounded-xl shadow-md transition cursor-pointer active:scale-95"
                  >
                    <KeyRound className="w-4 h-4 text-blue-600" />
                    <span>Claim 10-Digit Code</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      loadAppointments()
                      loadTransactions()
                    }}
                    className="p-2.5 bg-white/15 hover:bg-white/25 text-white rounded-xl transition cursor-pointer border border-white/20 active:scale-95"
                    title="Refresh all records"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Search Bar inside Records */}
              <div className="mt-5 relative z-10">
                <div className="relative">
                  <Search className="w-4 h-4 text-blue-200 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={recordsSearchQuery}
                    onChange={(e) => setRecordsSearchQuery(e.target.value)}
                    placeholder="Search doctor, clinic, 10-digit code, lab test, or diagnosis..."
                    className="w-full pl-10 pr-10 py-2.5 bg-white/15 backdrop-blur-md text-white placeholder-blue-200/70 border border-white/25 rounded-2xl text-xs sm:text-sm font-medium outline-none focus:bg-white focus:text-slate-900 focus:placeholder-slate-400 focus:ring-2 focus:ring-white transition"
                  />
                  {recordsSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setRecordsSearchQuery('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-blue-200 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Filter Chips Row matching Android App */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
              {[
                {
                  id: 'all',
                  label: 'All Records',
                  count:
                    filteredCompletedAppointments.length +
                    filteredLabReports.length +
                    filteredTransactionBills.length,
                },
                {
                  id: 'visits',
                  label: 'Consultations & Records',
                  count: filteredCompletedAppointments.length,
                },
                {
                  id: 'reports',
                  label: 'Diagnostic Lab Reports',
                  count: filteredLabReports.length,
                },
                {
                  id: 'bills',
                  label: 'Bills & Invoices',
                  count: filteredTransactionBills.length,
                },
              ].map((f) => {
                const isSelected = recordsFilter === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRecordsFilter(f.id as any)}
                    className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                        : 'liquid-glass-card hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-white/40 dark:border-white/10'
                    }`}
                  >
                    <span>{f.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {f.count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Empty State */}
            {filteredCompletedAppointments.length === 0 &&
            filteredLabReports.length === 0 &&
            filteredTransactionBills.length === 0 ? (
              <div className="p-12 text-center liquid-glass-card rounded-3xl border border-white/40 dark:border-white/10 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    No Directory Records Found
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                    Your clinic visits, doctor consultations, medical bills, and lab test reports will appear here automatically when completed or pushed by the clinic.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('book')
                      setBookingStep(1)
                    }}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-md shadow-blue-500/20 cursor-pointer active:scale-95"
                  >
                    Book OPD or Lab Slot
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setClaimCodeInput('')
                      setClaimCodeError(null)
                      setShowClaimModal(true)
                    }}
                    className="px-5 py-2.5 liquid-glass-card hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200 font-bold text-xs sm:text-sm rounded-xl transition border border-white/40 dark:border-white/10 shadow-xs cursor-pointer active:scale-95"
                  >
                    Claim 10-Digit Code
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. COMPLETED VISITS & RX PRESCRIPTIONS SECTION */}
                {(recordsFilter === 'all' || recordsFilter === 'visits') &&
                  filteredCompletedAppointments.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <Stethoscope className="w-4 h-4 text-blue-600" />
                          <span>Doctor Consultations & Records ({filteredCompletedAppointments.length})</span>
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredCompletedAppointments.map((appt) => {
                          const isCompleted = appt.checkinStatus === 'completed' || appt.checkinStatus === 'done'
                          const isCancelled = appt.checkinStatus === 'cancelled' || appt.status?.toUpperCase() === 'CANCELLED'
                          const isInConsultation = appt.checkinStatus === 'in_consultation' || appt.checkinStatus === 'inside'
                          const todayStr = new Date().toISOString().slice(0, 10)
                          const isPastDate = !!(appt.appointmentDate && appt.appointmentDate < todayStr)
                          const isMissed = appt.checkinStatus === 'no_show' || appt.status?.toLowerCase() === 'no_show' || (isPastDate && !isCompleted && !isCancelled)

                          return (
                            <div
                              key={appt.id}
                              onClick={() => setViewingConsultationDetailsAppt(appt)}
                              className="liquid-glass-card rounded-3xl p-5 border border-white/50 dark:border-white/10 shadow-xs hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500/50 transition-all space-y-4 relative overflow-hidden cursor-pointer group"
                            >
                              {/* Top Bar with 10-Digit Code Pill & Remove Button */}
                              <div className="flex items-center justify-between border-b border-white/30 dark:border-white/10 pb-3">
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg border border-blue-500/20">
                                    Token #{appt.trackingCode10Digit}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleCopyCode(appt.trackingCode10Digit)
                                    }}
                                    className="p-1 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                                    title="Copy 10-digit token"
                                  >
                                    {copiedCode === appt.trackingCode10Digit ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                                <div className="flex items-center space-x-1.5">
                                  <span
                                    className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                      isCancelled
                                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                                        : isMissed
                                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
                                        : isCompleted
                                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                                        : isInConsultation
                                        ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20 animate-pulse'
                                        : 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20'
                                    }`}
                                  >
                                    {isCompleted && <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                                    {isMissed && <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                                    <span>
                                      {isCompleted
                                        ? 'Completed Visit'
                                        : isCancelled
                                        ? 'Cancelled'
                                        : isMissed
                                        ? 'Missed Appointment'
                                        : isInConsultation
                                        ? 'Inside Chamber'
                                        : 'Active / Scheduled'}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    title="Remove from My Records"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setApptToRemoveConfirm(appt)
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Doctor & Clinic Info */}
                              <div className="space-y-1">
                                <h5 className="font-extrabold text-base text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                                  {appt.doctor?.fullName || 'Attending OPD Specialist'}
                                </h5>
                                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                  {appt.doctor?.specialty || 'General Medicine'}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>{appt.clinic?.name || 'Clinic Facility'}</span>
                                </p>
                              </div>

                              {/* Date & Slot Pill */}
                              <div className="flex items-center space-x-3 text-xs text-slate-600 dark:text-slate-300 bg-white/40 dark:bg-slate-800/40 p-2.5 rounded-xl border border-white/40 dark:border-white/5">
                                <div className="flex items-center space-x-1">
                                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                                  <span className="font-medium">{appt.appointmentDate}</span>
                                </div>
                                <span>•</span>
                                <div className="flex items-center space-x-1">
                                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                                  <span className="font-medium">{appt.appointmentTime || 'OPD Slot'}</span>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setViewingConsultationDetailsAppt(appt)
                                  }}
                                  className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View Details</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setApptToRescheduleConfirm(appt)
                                  }}
                                  className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 rounded-xl text-xs font-bold border border-sky-300/60 dark:border-sky-700/50 transition cursor-pointer active:scale-95"
                                >
                                  <CalendarRange className="w-3.5 h-3.5" />
                                  <span>Reschedule</span>
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setViewingBillAppt(appt)
                                  }}
                                  className="flex items-center justify-center space-x-1.5 py-2 px-3 liquid-glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-white/50 dark:border-white/10 transition cursor-pointer active:scale-95"
                                >
                                  <Receipt className="w-3.5 h-3.5 text-blue-600" />
                                  <span>View Bill Slip</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setRetainedAppointment(appt)
                                    setIsReturningPatient(true)
                                    setFollowupCodeInput(appt.trackingCode10Digit)
                                    if (appt.clinic) setSelectedClinic(appt.clinic)
                                    if (appt.doctor) setSelectedDoctor(appt.doctor)
                                    setActiveTab('book')
                                    setBookingStep(2)
                                  }}
                                  className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold border border-emerald-500/20 transition cursor-pointer active:scale-95"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Book Follow-up</span>
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                {/* 2. DIAGNOSTIC LAB REPORTS SECTION */}
                {(recordsFilter === 'all' || recordsFilter === 'reports') &&
                  filteredLabReports.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <FlaskConical className="w-4 h-4 text-teal-600" />
                          <span>Diagnostic Pathology & Radiology Reports ({filteredLabReports.length})</span>
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredLabReports.map((rep) => {
                          const isUnlocked =
                            unlockedReportIds.includes(rep.id) ||
                            Boolean(unlockedReportUrls[rep.id])

                          return (
                            <div
                              key={rep.id}
                              className="liquid-glass-card rounded-3xl p-5 border border-white/50 dark:border-white/10 shadow-xs hover:shadow-md transition space-y-3 relative overflow-hidden"
                            >
                              <div className="flex items-center justify-between border-b border-white/30 dark:border-white/10 pb-3">
                                <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 px-2.5 py-1 rounded-lg border border-teal-500/20">
                                  Code: {rep.trackingCode10Digit}
                                </span>
                                <div className="flex items-center space-x-1.5">
                                  {isUnlocked ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                                      <ShieldCheck className="w-3 h-3 mr-1" />
                                      Verified
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                      <Lock className="w-3 h-3 mr-1" />
                                      Protected
                                    </span>
                                  )}
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                      rep.status === 'delivered' || rep.status === 'prepared'
                                        ? 'bg-teal-500/10 text-teal-800 dark:text-teal-300 border-teal-500/20'
                                        : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20'
                                    }`}
                                  >
                                    {rep.status.replace('_', ' ')}
                                  </span>
                                </div>
                              </div>

                              <div>
                                <h5 className="font-extrabold text-base text-slate-900 dark:text-white">
                                  {rep.testName}
                                </h5>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Patient: {rep.patientName}
                                </p>
                              </div>

                              {rep.technicianNotes && (
                                <p className="text-xs text-slate-600 dark:text-slate-300 italic liquid-glass-subtle p-2.5 rounded-xl border border-white/30 dark:border-white/10">
                                  "{rep.technicianNotes}"
                                </p>
                              )}

                              <div className="pt-2 flex items-center justify-between border-t border-white/20 dark:border-white/5">
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {rep.uploadedAt?.split('T')[0] || 'Recent'}
                                </span>
                                {unlockedReportUrls[rep.id] ? (
                                  <a
                                    href={unlockedReportUrls[rep.id]}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white rounded-xl text-xs font-bold transition shadow-xs active:scale-95"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Download PDF</span>
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenOrUnlockReport(rep)}
                                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-800 hover:bg-teal-600 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                                  >
                                    <Lock className="w-3.5 h-3.5 text-amber-300" />
                                    <span>Unlock & Download</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                {/* 3. BILLING INVOICES & RECEIPTS SECTION */}
                {(recordsFilter === 'all' || recordsFilter === 'bills') &&
                  filteredTransactionBills.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-emerald-600" />
                          <span>Clinic Billing Invoices & Receipts ({filteredTransactionBills.length})</span>
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredTransactionBills.map((tx) => {
                          const matchingAppt = myAppointments.find(
                            (a) => a.trackingCode10Digit === tx.trackingCode
                          )
                          return (
                            <div
                              key={tx.id}
                              className="liquid-glass-card rounded-3xl p-5 border border-white/50 dark:border-white/10 shadow-xs hover:shadow-md transition space-y-3 relative overflow-hidden"
                            >
                              <div className="flex items-center justify-between border-b border-white/30 dark:border-white/10 pb-3">
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                    Transaction ID
                                  </span>
                                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                    {tx.transactionId}
                                  </span>
                                </div>
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25">
                                  {tx.paymentStatus || 'PAID'}
                                </span>
                              </div>

                              <div>
                                <h5 className="font-bold text-sm text-slate-900 dark:text-white">
                                  {tx.doctorName || 'Consultation Entry'}
                                </h5>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {tx.clinicName}
                                </p>
                              </div>

                              <div className="flex items-center justify-between bg-white/40 dark:bg-slate-800/40 p-3 rounded-2xl border border-white/40 dark:border-white/5">
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                    Amount Paid
                                  </span>
                                  <span className="text-base font-black text-slate-900 dark:text-white font-mono">
                                    NPR {tx.amount}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                    Payment Method
                                  </span>
                                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {tx.paymentMethod?.toUpperCase() || 'ONLINE DIGITAL'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <span className="text-[11px] font-mono text-slate-400">
                                  Token #{tx.trackingCode}
                                </span>
                                <div className="flex items-center space-x-2">
                                  {matchingAppt && (
                                    <button
                                      type="button"
                                      onClick={() => setViewingBillAppt(matchingAppt)}
                                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                                    >
                                      <Receipt className="w-3.5 h-3.5" />
                                      <span>Bill Slip</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadTransactionReceipt(tx)}
                                    className="flex items-center space-x-1 px-2.5 py-1.5 liquid-glass-subtle hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-xl font-bold text-xs transition cursor-pointer border border-blue-500/20 active:scale-95"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Receipt</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            TAB: PATIENT ACCOUNT & PROFILE
            (1:1 Parity with Android App ProfileTab)
        ========================================== */}
        {(activeTab === 'account' || activeTab === 'transactions' || activeTab === 'notifications') && (
          <div className="space-y-6">
            {!patientUser ? (
              /* GUEST ACCOUNT VIEW (Matching Android App GuestAccountView) */
              <div className="liquid-glass-elevated rounded-3xl p-6 sm:p-10 border border-white/50 dark:border-white/10 shadow-lg text-center space-y-6 relative overflow-hidden">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-blue-600 to-sky-500 text-white flex items-center justify-center mx-auto shadow-xl shadow-blue-500/25 border border-white/30">
                  <User className="w-10 h-10" />
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    Dactor Patient Account
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Sign in with Google to sync all your clinic visits, live queue tokens, digital prescriptions, and lab test reports seamlessly across your phone, tablet, and PC.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <div className="flex items-center space-x-2 p-3 rounded-2xl liquid-glass-subtle border border-white/40 dark:border-white/10">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Real-time queue tracking & audio chimes</span>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-2xl liquid-glass-subtle border border-white/40 dark:border-white/10">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Cloud Rx prescriptions & bill downloads</span>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-2xl liquid-glass-subtle border border-white/40 dark:border-white/10">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Pathology lab reports unlock with privacy</span>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-2xl liquid-glass-subtle border border-white/40 dark:border-white/10">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Automatic multi-device patient profile sync</span>
                  </div>
                </div>

                {authError && (
                  <div className="max-w-md mx-auto p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs sm:text-sm flex items-start justify-between gap-3 text-left animate-fadeIn">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span className="font-medium leading-relaxed">{authError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAuthError(null)}
                      className="p-1 text-rose-400 hover:text-rose-600 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={authSubmitting}
                    className="inline-flex items-center space-x-2 px-8 py-3 bg-gradient-to-r from-blue-600 via-blue-700 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-bold text-sm rounded-2xl shadow-lg shadow-blue-500/25 transition transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {authSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Connecting to Google...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        <span>Sign in with Google</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* AUTHENTICATED PROFILE VIEW */
              <div className="space-y-6">
                {/* Profile Header Card */}
                <div className="liquid-glass-card rounded-3xl p-6 sm:p-8 border border-white/50 dark:border-white/10 shadow-sm relative overflow-hidden space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-500 text-white flex items-center justify-center font-black text-2xl shadow-md shadow-blue-500/25 shrink-0 border border-white/30">
                        {patientUser.fullName
                          ? patientUser.fullName
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()
                          : 'PT'}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-xl font-black text-slate-900 dark:text-white">
                            {patientUser.fullName || 'Registered Patient'}
                          </h3>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                            <ShieldCheck className="w-3 h-3 mr-1" />
                            Verified
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {patientUser.email || 'Google Patient Account'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditName(patientUser.fullName || '')
                          setEditPhone(patientUser.phone || '')
                          setEditAge(patientUser.age ? String(patientUser.age) : '')
                          setEditGender(patientUser.gender || 'Male')
                          setEditCity(patientUser.city || '')
                          setEditTermsAccepted(true)
                          setShowEditProfileModal(true)
                        }}
                        className="px-4 py-2 liquid-glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold border border-blue-500/20 transition cursor-pointer active:scale-95 flex items-center space-x-1.5"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>Edit Profile</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="px-4 py-2 liquid-glass-subtle hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold border border-rose-500/20 transition cursor-pointer active:scale-95 flex items-center space-x-1.5"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>

                  {/* Patient Details Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/40 dark:bg-slate-800/40 p-4 rounded-2xl border border-white/50 dark:border-white/10 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Mobile Phone
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {patientUser.phone || 'Not added'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Age & Gender
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {patientUser.age || '–'} Yrs • {patientUser.gender || 'Not specified'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        City / Location
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {patientUser.city || 'Nepal'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Dactor ID
                      </span>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                        #{patientUser.id ? patientUser.id.slice(0, 8).toUpperCase() : 'PATIENT'}
                      </span>
                    </div>
                  </div>

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-2xl liquid-glass-subtle border border-white/40 dark:border-white/10 text-center">
                      <span className="text-xl font-black text-blue-600 font-mono block">
                        {myAppointments.filter((a) => a.checkinStatus === 'completed').length}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">Completed Visits</span>
                    </div>
                    <div className="p-3.5 rounded-2xl liquid-glass-subtle border border-white/40 dark:border-white/10 text-center">
                      <span className="text-xl font-black text-teal-600 font-mono block">
                        {myAppointments.filter((a) => a.checkinStatus !== 'completed' && a.checkinStatus !== 'cancelled').length}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">Active Queue Tokens</span>
                    </div>
                    <div className="p-3.5 rounded-2xl liquid-glass-subtle border border-white/40 dark:border-white/10 text-center">
                      <span className="text-xl font-black text-sky-600 font-mono block">
                        {patientLabReports.length}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">Diagnostic Reports</span>
                    </div>
                    <div className="p-3.5 rounded-2xl liquid-glass-subtle border border-white/40 dark:border-white/10 text-center">
                      <span className="text-xl font-black text-indigo-600 font-mono block">
                        {transactions.length}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">Receipts & Slips</span>
                    </div>
                  </div>
                </div>

                {/* Sub-Section Navigation Pills */}
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
                  {[
                    { id: 'consultations', label: 'Consultation Records & History', icon: Stethoscope, count: myAppointments.length },
                    { id: 'transactions', label: 'Transaction History', icon: CreditCard, count: transactions.length },
                    { id: 'notifications', label: 'Queue Alerts & Updates', icon: Bell, count: unreadCount },
                    { id: 'support', label: 'Helpdesk & Ticket Status', icon: Headphones, count: patientTickets.length },
                    { id: 'privacy', label: 'Privacy & Account Safety', icon: ShieldCheck },
                  ].map((sec) => {
                    const Icon = sec.icon
                    const isSel = accountSection === sec.id
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => setAccountSection(sec.id as any)}
                        className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                          isSel
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                            : 'liquid-glass-card hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-white/40 dark:border-white/10'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{sec.label}</span>
                        {sec.count !== undefined && sec.count > 0 && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                              isSel
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {sec.count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* SUB-SECTION 0: CONSULTATION RECORDS & HISTORY */}
                {accountSection === 'consultations' && (
                  <div className="liquid-glass-card rounded-3xl p-6 sm:p-8 shadow-sm border border-white/40 dark:border-white/10 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                          <Stethoscope className="w-5 h-5 text-blue-600" />
                          <span>Consultation Records & History</span>
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Complete history of all appointments, doctor remarks, lab reports, and billing slips.
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setClaimCodeInput('')
                            setClaimCodeError(null)
                            setShowClaimModal(true)
                          }}
                          className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 liquid-glass-card hover:bg-white/80 dark:hover:bg-slate-800/80 rounded-xl transition border border-white/40 dark:border-white/10 shadow-2xs cursor-pointer active:scale-95"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                          <span>+ Link / Restore Code</span>
                        </button>
                        <button
                          type="button"
                          onClick={loadAppointments}
                          className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 liquid-glass-subtle rounded-xl transition cursor-pointer"
                          title="Refresh consultations"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {isLoadingAppointments ? (
                      <div className="p-8 text-center">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                        <span className="text-xs text-slate-500 dark:text-slate-400">Loading consultation records...</span>
                      </div>
                    ) : myAppointments.length === 0 ? (
                      <div className="p-8 text-center space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center mx-auto border border-blue-500/20">
                          <FileText className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">No active consultation records</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          If you have booked a consultation or removed a record, you can link it back using your 10-digit code or appointment ID.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setClaimCodeInput('')
                            setClaimCodeError(null)
                            setShowClaimModal(true)
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
                        >
                          Link Appointment Code
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {myAppointments.map((appt) => {
                          const isCompleted = appt.checkinStatus === 'completed' || appt.checkinStatus === 'done'
                          const isCancelled = appt.checkinStatus === 'cancelled' || appt.status?.toUpperCase() === 'CANCELLED'
                          const isInConsultation = appt.checkinStatus === 'in_consultation' || appt.checkinStatus === 'inside'
                          const todayStr = new Date().toISOString().slice(0, 10)
                          const isPastDate = !!(appt.appointmentDate && appt.appointmentDate < todayStr)
                          const isMissed = appt.checkinStatus === 'no_show' || appt.status?.toLowerCase() === 'no_show' || (isPastDate && !isCompleted && !isCancelled)

                          return (
                            <div
                              key={appt.id}
                              onClick={() => setViewingConsultationDetailsAppt(appt)}
                              className="liquid-glass-card rounded-3xl p-5 border border-white/50 dark:border-white/10 shadow-xs hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500/50 transition-all space-y-4 relative overflow-hidden cursor-pointer group"
                            >
                              {/* Top Bar with 10-Digit Code Pill & Remove Button */}
                              <div className="flex items-center justify-between border-b border-white/30 dark:border-white/10 pb-3">
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg border border-blue-500/20">
                                    Token #{appt.trackingCode10Digit}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleCopyCode(appt.trackingCode10Digit)
                                    }}
                                    className="p-1 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                                    title="Copy 10-digit token"
                                  >
                                    {copiedCode === appt.trackingCode10Digit ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                                <div className="flex items-center space-x-1.5">
                                  <span
                                    className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                      isCancelled
                                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                                        : isCompleted
                                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                                        : isInConsultation
                                        ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20 animate-pulse'
                                        : 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20'
                                    }`}
                                  >
                                    {isCompleted && <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                                    <span>
                                      {isCompleted
                                        ? 'Completed Visit'
                                        : isCancelled
                                        ? 'Cancelled'
                                        : isInConsultation
                                        ? 'Inside Chamber'
                                        : 'Active / Scheduled'}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    title="Remove from My Records"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setApptToRemoveConfirm(appt)
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Doctor & Clinic Info */}
                              <div className="space-y-1">
                                <h5 className="font-extrabold text-base text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                                  {appt.doctor?.fullName || 'Attending Specialist'}
                                </h5>
                                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                  {appt.doctor?.specialty || 'OPD Medicine'}
                                </p>
                                <div className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                                  <Building2 className="w-3.5 h-3.5" />
                                  <span className="truncate">{appt.clinic?.name || 'Clinic Center'}</span>
                                </div>
                              </div>

                              {/* Visit Date & Time Badges */}
                              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                <div className="flex items-center space-x-1 liquid-glass-subtle px-2.5 py-1 rounded-lg border border-white/30 dark:border-white/10">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  <span>{appt.appointmentDate}</span>
                                </div>
                                <div className="flex items-center space-x-1 liquid-glass-subtle px-2.5 py-1 rounded-lg border border-white/30 dark:border-white/10">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span>{appt.appointmentTime || 'OPD'}</span>
                                </div>
                              </div>

                              {/* Action Footer Buttons */}
                              <div className="pt-2 border-t border-white/20 dark:border-white/5 flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setViewingConsultationDetailsAppt(appt)
                                  }}
                                  className="flex-1 py-2 px-3 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 rounded-xl transition shadow-xs flex items-center justify-center space-x-1 cursor-pointer active:scale-95"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Full Details & History</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleConfirmRescheduleFromModal(appt)
                                    }}
                                    className={`py-2 px-3 text-xs font-bold rounded-xl transition border flex items-center space-x-1 cursor-pointer active:scale-95 ${isMissed ? 'text-white bg-amber-600 hover:bg-amber-700 border-amber-600 shadow-xs' : 'text-sky-700 dark:text-sky-300 liquid-glass-card hover:bg-sky-500/20 border-sky-500/30'}`}
                                    title="Reschedule Consultation (Retains Paid Fee)"
                                  >
                                    <CalendarRange className="w-3.5 h-3.5" />
                                    <span>{isMissed ? 'Reschedule Missed Slot (Rs. 0)' : 'Reschedule (Rs. 0)'}</span>
                                  </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setViewingBillAppt(appt)
                                  }}
                                  className="py-2 px-2.5 text-xs font-bold text-blue-700 dark:text-blue-300 liquid-glass-card hover:bg-blue-500/20 rounded-xl transition border border-blue-500/30 flex items-center cursor-pointer active:scale-95"
                                  title="Download Billing Slip"
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-SECTION 1: TRANSACTIONS & RECEIPTS */}
                {accountSection === 'transactions' && (
                  <div className="liquid-glass-card rounded-3xl p-6 sm:p-8 shadow-sm border border-white/40 dark:border-white/10 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">
                          Appointment Transactions & Receipts
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Comprehensive audit history of your consultation payments, lab tests, and hospital billing slips.
                        </p>
                      </div>
                      <button
                        onClick={loadTransactions}
                        className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 liquid-glass-subtle rounded-xl transition cursor-pointer"
                        title="Refresh transactions"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>

                    {isLoadingTransactions ? (
                      <div className="p-8 text-center">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                        <span className="text-xs text-slate-500 dark:text-slate-400">Loading transaction history...</span>
                      </div>
                    ) : transactions.length === 0 ? (
                      <div className="p-12 text-center text-slate-400 space-y-2">
                        <Receipt className="w-10 h-10 mx-auto stroke-1" />
                        <p className="text-sm font-semibold">No transaction records found</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-white/20 dark:border-white/5 text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                              <th className="pb-3">Transaction ID</th>
                              <th className="pb-3">Tracking Code</th>
                              <th className="pb-3">Doctor & Clinic</th>
                              <th className="pb-3">Appointment Date</th>
                              <th className="pb-3">Amount</th>
                              <th className="pb-3">Method</th>
                              <th className="pb-3">Status</th>
                              <th className="pb-3 text-right">Invoice</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/20 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
                            {transactions.map((tx) => {
                              const matchingAppt = myAppointments.find(
                                (a) => a.trackingCode10Digit === tx.trackingCode
                              )
                              return (
                                <tr
                                  key={tx.id}
                                  onClick={() => matchingAppt && setViewingConsultationDetailsAppt(matchingAppt)}
                                  className={`hover:bg-white/40 dark:hover:bg-slate-800/40 transition ${
                                    matchingAppt ? 'cursor-pointer' : ''
                                  }`}
                                >
                                  <td className="py-3 font-mono font-bold text-slate-900 dark:text-white">
                                    {tx.transactionId}
                                  </td>
                                  <td className="py-3 font-mono">{tx.trackingCode}</td>
                                  <td className="py-3">
                                    <div className="font-bold text-slate-900 dark:text-white">{tx.doctorName}</div>
                                    <div className="text-[11px] text-slate-400">{tx.clinicName}</div>
                                  </td>
                                  <td className="py-3">{tx.appointmentDate} • {tx.appointmentTime}</td>
                                  <td className="py-3 font-mono font-bold text-slate-900 dark:text-white">
                                    NPR {tx.amount}
                                  </td>
                                  <td className="py-3">
                                    <span className="px-2 py-0.5 rounded-md liquid-glass-subtle text-slate-700 dark:text-slate-300 font-bold border border-white/20">
                                      {tx.paymentMethod}
                                    </span>
                                  </td>
                                  <td className="py-3">
                                    <span
                                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                                        tx.paymentStatus === 'paid'
                                          ? 'bg-teal-500/10 text-teal-800 dark:text-teal-300 border-teal-500/20'
                                          : tx.paymentStatus === 'free'
                                          ? 'bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-500/20'
                                          : tx.paymentStatus === 'failed'
                                          ? 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/20'
                                          : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20'
                                      }`}
                                    >
                                      {tx.paymentStatus}
                                    </span>
                                  </td>
                                  <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="inline-flex items-center space-x-1.5 justify-end">
                                      {matchingAppt && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => setViewingConsultationDetailsAppt(matchingAppt)}
                                            className="text-xs text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer"
                                            title="View consultation details & history"
                                          >
                                            Details
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setViewingBillAppt(matchingAppt)}
                                            className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                                            title="View bill slip"
                                          >
                                            Slip
                                          </button>
                                        </>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadTransactionReceipt(tx)}
                                        className="inline-flex items-center space-x-1 px-2 py-1 liquid-glass-subtle hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-lg font-bold text-[11px] transition cursor-pointer border border-blue-500/20 active:scale-95"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>Receipt</span>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-SECTION 2: QUEUE ALERTS & BROADCASTS */}
                {accountSection === 'notifications' && (
                  <div className="liquid-glass-card rounded-3xl p-6 sm:p-8 shadow-sm border border-white/40 dark:border-white/10 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">
                          Clinic Alerts & Queue Broadcasts
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Important announcements, holiday notices, and real-time OPD queue broadcast alerts.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={async () => {
                              const ids = notifications.filter((n) => !n.isRead).map((n) => n.id)
                              await markAllNotificationsAsRead(ids)
                              loadNotifications()
                            }}
                            className="px-3 py-1.5 liquid-glass-subtle hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold text-xs rounded-xl transition cursor-pointer border border-blue-500/20 active:scale-95"
                          >
                            Mark All Read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={loadNotifications}
                          className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 liquid-glass-subtle rounded-xl transition cursor-pointer"
                          title="Refresh"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {notifications.length === 0 ? (
                      <div className="p-12 text-center text-slate-400 space-y-2">
                        <Bell className="w-10 h-10 mx-auto stroke-1" />
                        <p className="text-sm font-semibold">No notifications right now</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {notifications.map((notif) => (
                          <div
                            key={notif.id}
                            onClick={async () => {
                              if (!notif.isRead) {
                                await markNotificationAsRead(notif.id)
                                loadNotifications()
                              }
                            }}
                            className={`p-4 rounded-2xl border flex items-start space-x-3.5 transition cursor-pointer ${
                              notif.isRead
                                ? 'border-white/30 dark:border-white/10 liquid-glass-subtle'
                                : 'border-blue-500/40 bg-blue-500/10 shadow-xs'
                            }`}
                          >
                            <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5 border border-blue-500/20">
                              <Bell className="w-4 h-4" />
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between">
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                                  {!notif.isRead && (
                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                  )}
                                  <span>{notif.title}</span>
                                </h4>
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {notif.createdAt?.split('T')[0]}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                {notif.message}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-SECTION 3: HELPDESK & SUPPORT */}
                {accountSection === 'support' && (
                  <div className="liquid-glass-card rounded-3xl p-6 sm:p-8 shadow-sm border border-white/40 dark:border-white/10 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">
                          Support Ticket Tracking & Official Helpdesk
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Track unresolved queries, refund inquiries, or hospital queue support tickets.
                        </p>
                      </div>
                      <a
                        href="https://dactorofficial.github.io/support"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs active:scale-95 cursor-pointer shrink-0"
                      >
                        <Headphones className="w-3.5 h-3.5" />
                        <span>Open 24/7 Support Desk</span>
                        <ExternalLink className="w-3 h-3 ml-0.5" />
                      </a>
                    </div>

                    {/* Search Ticket Form */}
                    <form onSubmit={handleSearchPatientTicket} className="flex gap-2">
                      <input
                        type="text"
                        value={ticketSearchInput}
                        onChange={(e) => setTicketSearchInput(e.target.value)}
                        placeholder="Enter Ticket ID, phone number, or email..."
                        className="flex-1 px-4 py-2.5 liquid-glass-input rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={isSearchingTicket}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                      >
                        {isSearchingTicket ? 'Searching...' : 'Lookup Ticket'}
                      </button>
                    </form>

                    {ticketSearchError && (
                      <div className="p-3 liquid-glass-subtle border border-amber-500/30 rounded-xl text-amber-800 dark:text-amber-200 text-xs font-semibold flex items-center space-x-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>{ticketSearchError}</span>
                      </div>
                    )}

                    {ticketLookupResult && (
                      <div className="p-4 rounded-2xl liquid-glass-subtle border border-blue-500/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">
                            Ticket #{ticketLookupResult.ticketCode}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              ticketLookupResult.status === 'resolved' || ticketLookupResult.status === 'closed'
                                ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20'
                            }`}
                          >
                            {ticketLookupResult.status}
                          </span>
                        </div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          {ticketLookupResult.category || ticketLookupResult.customReason || 'Patient Inquiry'}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {ticketLookupResult.message}
                        </p>
                        {ticketLookupResult.adminNotes && (
                          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-500/20 text-xs text-blue-800 dark:text-blue-200 mt-2 space-y-0.5">
                            <span className="font-bold block">Support Agent Resolution:</span>
                            <p>{ticketLookupResult.adminNotes}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {patientTickets.length > 0 && !ticketLookupResult && (
                      <div className="space-y-3">
                        <span className="text-xs font-bold uppercase text-slate-400 block tracking-wider">
                          Your Active Support Inquiries ({patientTickets.length})
                        </span>
                        {patientTickets.map((t) => (
                          <div
                            key={t.id}
                            className="p-3.5 rounded-2xl border border-white/40 dark:border-white/10 liquid-glass-subtle space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                                #{t.ticketCode}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                                {t.status}
                              </span>
                            </div>
                            <div className="font-bold text-xs text-slate-900 dark:text-white">
                              {t.category || t.customReason || 'Patient Inquiry'}
                            </div>
                            <div className="text-[11px] text-slate-500">{t.message}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-SECTION 4: PRIVACY & DATA SAFETY */}
                {accountSection === 'privacy' && (
                  <div className="liquid-glass-card rounded-3xl p-6 sm:p-8 shadow-sm border border-white/40 dark:border-white/10 space-y-6">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white">
                        Privacy, Data Security & Account Control
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        In accordance with Nepal Medical Council (NMC) patient confidentiality and digital health standards.
                      </p>
                    </div>

                    {/* NMC Compliance Box */}
                    <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-1 text-xs text-blue-800 dark:text-blue-200">
                      <div className="flex items-center space-x-2 font-bold">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        <span>End-to-End Encrypted Patient Privacy</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        Your clinical records, doctor prescriptions, and test results are confidential and protected by role-based access gates.
                      </p>
                    </div>

                    {/* Official Privacy Policy Card */}
                    <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="font-bold text-teal-900 dark:text-teal-200">
                          Official Patient &amp; Guardian Privacy Policy
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">
                          Statutory disclosure under Nepal Individual Privacy Act 2075 &amp; Google Play Store Health Apps Policies. Zero data selling guarantee.
                        </div>
                      </div>
                      <a
                        href="./privacy-patient.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs whitespace-nowrap transition cursor-pointer self-start sm:self-center"
                      >
                        Read Policy &rarr;
                      </a>
                    </div>

                    {/* Official Account Deletion & Data Erasure Portal URL (Google Play Compliant) */}
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="flex items-center gap-2 font-bold text-rose-900 dark:text-rose-200">
                          <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          <span>Official Account &amp; Data Deletion Portal URL</span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                          In compliance with Google Play Developer Policies and Nepal Individual Privacy Act 2075. Submit an instant or web-based erasure request.
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                        <a
                          href="./data-deletion.html"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs whitespace-nowrap transition cursor-pointer shadow-xs"
                          title="Open official Google Play compliant account deletion URL"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Account Deletion URL</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    {/* Account Deletion Control */}
                    <div className="p-5 rounded-2xl border border-rose-500/20 liquid-glass-subtle space-y-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          Account Lifecycle &amp; 30-Day Reversible Archive Policy
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          When deletion is requested, your account is placed into a 30-day reversible archive. During these 30 days you can reactivate or reclaim your account anytime. After 30 days, personal data is permanently purged.
                        </p>
                      </div>

                      {patientUser.isArchived ? (
                        <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                          <div className="flex items-center space-x-2 font-bold">
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                            <span>Account Scheduled for Permanent Deletion</span>
                          </div>
                          <p className="text-[11px]">
                            Scheduled deletion date: {patientUser.deletionScheduledAt?.split('T')[0] || 'In 30 days'}. You can reactivate or reclaim your account before the 30-day countdown expires.
                          </p>
                          <button
                            type="button"
                            onClick={handleCancelPatientArchive}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                          >
                            Reactivate / Reclaim Account
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirmModal(true)}
                            className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded-xl text-xs font-bold border border-amber-500/30 transition cursor-pointer active:scale-95"
                          >
                            Schedule 30-Day Account Archive &amp; Deletion
                          </button>
                          <button
                            type="button"
                            onClick={handlePermanentDeletePatient}
                            disabled={isDeletingPermanently}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                          >
                            {isDeletingPermanently ? 'Deleting...' : 'Permanent Instant Deletion'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Support & Legal Compliance Footer Card (Aligned with Mobile App) */}
        <div className="liquid-glass-card rounded-3xl p-6 sm:p-7 border border-white/40 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20 shrink-0">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">
                Contact Us & Official Dactor Helpdesk
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                24/7 patient support, hospital queue guidance, NMC compliance & terms
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2.5">
            <a
              href="https://dactorofficial.github.io/support"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition flex items-center space-x-1.5 cursor-pointer"
            >
              <span>Visit Support Desk</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* ==========================================
          MODAL: PATIENT AUTHENTICATION (LOGIN / SIGNUP)
      ========================================== */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-white/60 space-y-6 relative animate-in fade-in zoom-in-95 overflow-hidden">
            {/* Top specular refraction sheen */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

            <button
              onClick={() => {
                setShowAuthModal(false)
                setPendingBookingRedirectNotice(false)
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-1">
              <div className="w-14 h-14 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center justify-center mx-auto mb-3 shadow-inner border border-teal-500/20">
                <User className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                Patient Health Portal
              </h3>
              <p className="text-xs text-slate-600 max-w-xs mx-auto font-medium">
                Sign in with your verified Google account to track live queue tokens, access lab reports & manage appointments.
              </p>
            </div>

            {/* Pending Booking Redirect Notice matching patient-app LoginScreen.kt lines 607-620 */}
            {pendingBookingRedirectNotice && (
              <div className="p-4 rounded-2xl bg-teal-50/80 border border-teal-500/30 text-left flex items-start space-x-3 animate-in fade-in">
                <Info className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold text-xs text-slate-900">
                    Sign In Required to Book Appointment
                  </div>
                  <p className="text-[11px] text-teal-800 leading-snug font-medium">
                    Your selected clinic, doctor, date, and slot position are saved. You'll return right where you left off after signing in.
                  </p>
                </div>
              </div>
            )}

            {authError && (
              <div className="p-3.5 rounded-xl bg-rose-50/80 border border-rose-500/30 text-rose-700 text-xs font-semibold space-y-2.5">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null)
                    handleGoogleSignIn()
                  }}
                  disabled={authSubmitting}
                  className="w-full py-2 px-3 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-rose-800 font-bold text-xs flex items-center justify-center space-x-1.5 transition cursor-pointer shadow-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try With Different Google Account</span>
                </button>
              </div>
            )}

            {/* Official Google Sign-In Desk */}
            <div className="space-y-4 pt-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authSubmitting}
                className="w-full py-3.5 bg-white hover:bg-slate-50 text-slate-900 font-black text-xs rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center justify-center space-x-3 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{authSubmitting ? 'Connecting...' : 'Continue with Google'}</span>
              </button>

              <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 text-left space-y-1">
                <div className="flex items-center space-x-1.5 text-slate-900 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  <span>Single-Role Patient Identity</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  Your Google identity ensures verified authentication. First-time users will specify their full name, phone number, and age to maintain your personal health records.
                </p>
              </div>

              {/* Cross-Portal Quick Navigation Links */}
              <div className="pt-2 border-t border-slate-200/60 space-y-1.5 text-center text-[11px]">
                <p className="text-slate-600">
                  Are you a Medical Doctor?{' '}
                  <a
                    href="#doctor-portal"
                    onClick={() => setShowAuthModal(false)}
                    className="font-bold text-teal-700 hover:text-teal-900 hover:underline"
                  >
                    Doctor Login & NMC Registration →
                  </a>
                </p>
                <p className="text-slate-600">
                  Are you a Clinic / Hospital Manager?{' '}
                  <a
                    href="#portal"
                    onClick={() => setShowAuthModal(false)}
                    className="font-bold text-teal-700 hover:text-teal-900 hover:underline"
                  >
                    Clinic Portal & Onboarding →
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: EDIT PATIENT PROFILE
      ========================================== */}
      {showEditProfileModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-glass-modal border border-white/60 dark:border-white/15 space-y-5 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setShowEditProfileModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full liquid-glass-subtle text-slate-500 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Update Profile</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Sync details with Dactor encrypted patient records.</p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 liquid-glass-input rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Mobile Number (10 Digits)</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-4 py-2.5 liquid-glass-input rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Age</label>
                  <input
                    type="number"
                    value={editAge}
                    onChange={(e) => setEditAge(e.target.value)}
                    className="w-full px-4 py-2.5 liquid-glass-input rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Gender</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['Male', 'Female', 'Other'] as const).map((g) => {
                      const isSelected = (editGender || 'Male').toLowerCase() === g.toLowerCase()
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setEditGender(g)}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white border-transparent shadow-md shadow-teal-500/20'
                              : 'liquid-glass-card text-slate-700 dark:text-slate-300 border-white/60 dark:border-white/10 hover:bg-white/70'
                          }`}
                        >
                          {g}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">City / District (Nepal)</label>
                <input
                  type="text"
                  placeholder="e.g. Kathmandu, Lalitpur, Pokhara"
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  className="w-full px-4 py-2.5 liquid-glass-input rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none"
                />
              </div>

              {/* Terms Checkbox */}
              <label className="flex items-start space-x-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={editTermsAccepted}
                  onChange={(e) => setEditTermsAccepted(e.target.checked)}
                  className="mt-0.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <span className="text-[11px] leading-relaxed">
                  I agree to Dactor's Terms of Service, Privacy Policy, and patient healthcare privacy regulations.
                </span>
              </label>

              <button
                type="submit"
                disabled={isUpdatingProfile}
                className="w-full py-3 bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 text-white font-bold text-xs rounded-xl shadow-glass-brand border border-white/25 transition active:scale-[0.98] cursor-pointer"
              >
                {isUpdatingProfile ? 'Saving...' : 'Save Profile Changes'}
              </button>

              {/* Helpdesk & Support Links */}
              <div className="pt-1 space-y-2">

                <a
                  href={supportUrl.startsWith('http') || supportUrl.startsWith('mailto:') ? supportUrl : `https://${supportUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-between transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Headphones className="w-4 h-4 text-indigo-500" />
                    <span>Contact Us & Dactor Helpdesk Support</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </a>
              </div>

              <div className="pt-3 border-t border-white/40 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Account Settings</span>
                <div className="flex items-center gap-3">
                  <a
                    href="./data-deletion.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                    title="Official Google Play compliant account & data deletion URL"
                  >
                    <span>Account Deletion URL</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirmModal(true)}
                    className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:underline cursor-pointer"
                  >
                    Schedule 30-Day Account Archive &amp; Deletion
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: 30-DAY REVERSIBLE ACCOUNT DELETION
      ========================================== */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-glass-modal border border-rose-300/60 dark:border-rose-500/30 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-white/40 dark:border-white/10">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  30-Day Reversible Archive
                </span>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Schedule Patient Account Deletion?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                className="p-1.5 rounded-full liquid-glass-subtle text-slate-500 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-rose-500/10 backdrop-blur-md border border-rose-300/60 dark:border-rose-500/30 rounded-2xl text-xs text-rose-900 dark:text-rose-200 space-y-1.5 leading-relaxed text-left">
              <p className="font-bold">What happens when you schedule deletion:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Your profile enters a <strong>30-day reversible grace period</strong>.</li>
                <li>You can cancel deletion anytime with 1 click during the next 30 days.</li>
                <li>After 30 days, personal profile details are permanently removed.</li>
              </ul>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                className="flex-1 py-2.5 liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-white/50 dark:border-white/10 transition cursor-pointer"
              >
                Keep Account Active
              </button>
              <button
                type="button"
                onClick={handleSchedulePatientArchive}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-[0.98] cursor-pointer"
              >
                Schedule 30-Day Archive
              </button>
            </div>

            <div className="pt-2 border-t border-white/40 dark:border-white/10 space-y-2">
              <button
                type="button"
                disabled={isDeletingPermanently}
                onClick={handlePermanentDeletePatient}
                className="w-full py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-300/60 dark:border-rose-500/30 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>{isDeletingPermanently ? 'Deleting Profile...' : 'Permanent Delete (Immediate)'}</span>
              </button>
              <div className="text-center pt-1">
                <a
                  href="./data-deletion.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:underline"
                >
                  <span>Statutory Web Deletion Portal URL</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: CLAIM APPOINTMENT WITH 10-DIGIT CODE
      ========================================== */}
      {showClaimModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-glass-modal border border-white/60 dark:border-white/15 space-y-5 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setShowClaimModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full liquid-glass-subtle text-slate-500 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-400/30 text-brand-700 dark:text-brand-300 flex items-center justify-center mx-auto mb-2 shadow-inner">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Claim / Restore Record
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Enter your 10-digit tracking code or Appointment UUID to link or restore any consultation record to your account.
              </p>
            </div>

            {claimCodeError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-300/60 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{claimCodeError}</span>
              </div>
            )}

            <form onSubmit={handleClaimAppointmentCode} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Tracking Code or Appointment ID
                </label>
                <input
                  type="text"
                  maxLength={50}
                  required
                  placeholder="e.g. 8492018471 or UUID"
                  value={claimCodeInput}
                  onChange={(e) => {
                    setClaimCodeInput(e.target.value.trim())
                    if (claimCodeError) setClaimCodeError(null)
                  }}
                  className="w-full px-4 py-3 liquid-glass-input rounded-xl font-mono text-center text-sm sm:text-base font-bold tracking-wider text-slate-900 dark:text-white outline-none"
                />
                <span className="text-[11px] text-slate-400 block text-center">
                  {claimCodeInput.length > 0
                    ? claimCodeInput.length === 10
                      ? '10-digit tracking code'
                      : 'Appointment ID / UUID'
                    : 'Enter 10-digit tracking code or Appointment UUID'}
                </span>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClaimModal(false)}
                  className="flex-1 py-3 liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-white/50 dark:border-white/10 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isClaimingCode || claimCodeInput.length !== 10}
                  className="flex-1 py-3 bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-glass-brand border border-white/25 active:scale-[0.98] cursor-pointer"
                >
                  {isClaimingCode ? 'Verifying...' : 'Claim & Link Token'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: RESCHEDULE APPOINTMENT
      ========================================== */}
      {rescheduleAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-glass-modal border border-white/60 dark:border-white/15 space-y-5 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setRescheduleAppt(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full liquid-glass-subtle text-slate-500 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Token #{rescheduleAppt.trackingCode10Digit}
              </span>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                Reschedule Appointment
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Shift appointment date or slot with {rescheduleAppt.doctor?.fullName || 'the clinic'}.
              </p>
            </div>

            <form onSubmit={handleConfirmReschedule} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">New Appointment Date *</label>
                <input
                  type="date"
                  required
                  min={todayStr}
                  value={newRescheduleDate}
                  onChange={(e) => setNewRescheduleDate(e.target.value)}
                  className="w-full px-4 py-2.5 liquid-glass-input rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Preferred Time Slot *</label>
                  {isLoadingRescheduleSlots && (
                    <span className="text-[10px] text-teal-600 animate-pulse font-semibold">Loading doctor slots...</span>
                  )}
                </div>
                {rescheduleAvailableSlots.length > 0 ? (
                  <select
                    value={newRescheduleSlotId ? `slot:${newRescheduleSlotId}` : `raw:${newRescheduleTime}`}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val.startsWith('slot:')) {
                        const sid = val.slice(5)
                        const matched = rescheduleAvailableSlots.find((s) => s.id === sid)
                        if (matched) {
                          setNewRescheduleSlotId(matched.id)
                          setNewRescheduleTime(`${matched.startTime} - ${matched.endTime}`)
                        }
                      } else {
                        setNewRescheduleSlotId(undefined)
                        setNewRescheduleTime(val.startsWith('raw:') ? val.slice(4) : val)
                      }
                    }}
                    className="w-full px-4 py-2.5 liquid-glass-input rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                  >
                    <optgroup label="Published Doctor Slots">
                      {rescheduleAvailableSlots.map((s) => (
                        <option key={s.id} value={`slot:${s.id}`}>
                          {s.startTime} - {s.endTime} ({s.bookedCount || 0}/{s.maxCapacity || 5} booked)
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="General Time Slots">
                      <option value="raw:09:00 AM - 10:00 AM">09:00 AM - 10:00 AM (Morning)</option>
                      <option value="raw:11:00 AM - 12:00 PM">11:00 AM - 12:00 PM (Noon)</option>
                      <option value="raw:02:00 PM - 03:00 PM">02:00 PM - 03:00 PM (Afternoon)</option>
                      <option value="raw:04:00 PM - 05:00 PM">04:00 PM - 05:00 PM (Evening)</option>
                    </optgroup>
                  </select>
                ) : (
                  <select
                    value={newRescheduleTime}
                    onChange={(e) => {
                      setNewRescheduleSlotId(undefined)
                      setNewRescheduleTime(e.target.value)
                    }}
                    className="w-full px-4 py-2.5 liquid-glass-input rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none"
                  >
                    <option value="09:00 AM - 10:00 AM">09:00 AM - 10:00 AM (Morning)</option>
                    <option value="10:00 AM - 11:00 AM">10:00 AM - 11:00 AM (Morning)</option>
                    <option value="11:00 AM - 12:00 PM">11:00 AM - 12:00 PM (Noon)</option>
                    <option value="02:00 PM - 03:00 PM">02:00 PM - 03:00 PM (Afternoon)</option>
                    <option value="03:00 PM - 04:00 PM">03:00 PM - 04:00 PM (Afternoon)</option>
                    <option value="04:00 PM - 05:00 PM">04:00 PM - 05:00 PM (Evening)</option>
                    <option value="05:00 PM - 06:00 PM">05:00 PM - 06:00 PM (Evening)</option>
                  </select>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Reason for Rescheduling (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Schedule conflict, feeling better today..."
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  className="w-full px-4 py-2.5 liquid-glass-input rounded-xl text-xs text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRescheduleAppt(null)}
                  className="flex-1 py-3 liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-white/50 dark:border-white/10 transition cursor-pointer"
                >
                  Keep Existing
                </button>
                <button
                  type="submit"
                  disabled={isRescheduling}
                  className="flex-1 py-3 bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-glass-brand border border-white/25 active:scale-[0.98] cursor-pointer"
                >
                  {isRescheduling ? 'Shifting...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: LAB REPORT PRIVACY VERIFICATION GATE
      ========================================== */}
      {verifyingReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-glass-modal border border-white/60 dark:border-white/15 space-y-5 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => {
                setVerifyingReport(null)
                setVerificationError(null)
              }}
              className="absolute top-5 right-5 p-1.5 rounded-full liquid-glass-subtle text-slate-500 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-400/30 text-amber-700 dark:text-amber-300 flex items-center justify-center mx-auto mb-2 shadow-inner">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Health Privacy Verification
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                To protect confidential clinical data, please verify the registered patient's identity before viewing or downloading this report.
              </p>
            </div>

            {verificationError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-300/60 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{verificationError}</span>
              </div>
            )}

            <form onSubmit={handleExecuteReportVerification} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Enter Patient's Registered Mobile Number (10 digits)
                </label>
                <input
                  type="tel"
                  required
                  placeholder="98xxxxxxxx"
                  value={verificationInput}
                  onChange={(e) => setVerificationInput(e.target.value)}
                  className="w-full px-4 py-2.5 liquid-glass-input rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setVerifyingReport(null)
                    setVerificationError(null)
                  }}
                  className="flex-1 py-3 liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-white/50 dark:border-white/10 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifyingReport}
                  className="flex-1 py-3 bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-glass-brand border border-white/25 active:scale-[0.98] cursor-pointer"
                >
                  {isVerifyingReport ? 'Verifying with Server...' : 'Verify & Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: OFFICIAL APPOINTMENT BILL & SLIP
      ========================================== */}
      {viewingBillAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-glass-modal border border-white/60 dark:border-white/15 space-y-6 relative animate-in fade-in zoom-in-95 my-8">
            <button
              onClick={() => setViewingBillAppt(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full liquid-glass-subtle text-slate-500 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Bill Header */}
            <div className="flex items-start justify-between border-b border-white/40 dark:border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400 block">
                  Official Medical Invoice & OPD Slip
                </span>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                  {viewingBillAppt.clinic?.name || 'Dactor Certified Healthcare Center'}
                </h3>
                {viewingBillAppt.clinic?.addressText && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span>{viewingBillAppt.clinic.addressText}</span>
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25">
                  {viewingBillAppt.paymentStatus === 'paid' ? 'PAID' : 'PAYABLE AT CLINIC'}
                </span>
                <span className="text-[10px] font-mono text-slate-400 block mt-1">
                  INV-#{viewingBillAppt.trackingCode10Digit}
                </span>
              </div>
            </div>

            {/* 10-Digit Live Token Badge */}
            <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 block">
                  OPD Live Queue Token
                </span>
                <span className="font-mono text-2xl font-black text-slate-900 dark:text-white tracking-wider">
                  #{viewingBillAppt.trackingCode10Digit}
                </span>
              </div>
              <button
                onClick={() => handleCopyCode(viewingBillAppt.trackingCode10Digit)}
                className="px-3 py-1.5 rounded-xl liquid-glass-subtle text-xs font-bold text-teal-700 dark:text-teal-300 border border-teal-500/30 flex items-center gap-1.5 cursor-pointer"
              >
                {copiedCode === viewingBillAppt.trackingCode10Digit ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-teal-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Token</span>
                  </>
                )}
              </button>
            </div>

            {/* Details Table */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-white/40 dark:bg-slate-800/40 p-4 rounded-2xl border border-white/50 dark:border-white/10">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Patient Name</span>
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {viewingBillAppt.patientName}
                </span>
                <span className="text-slate-500 text-[11px] block">
                  {viewingBillAppt.patientAge || '–'} Yrs • {viewingBillAppt.patientGender || '–'}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Attending Doctor</span>
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {viewingBillAppt.doctor?.fullName || 'General OPD Specialist'}
                </span>
                <span className="text-brand-600 dark:text-brand-400 text-[11px] font-semibold block">
                  {viewingBillAppt.doctor?.specialty || 'General Medicine'}
                </span>
              </div>

              <div className="pt-2 border-t border-white/30 dark:border-white/10">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Appointment Date</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {viewingBillAppt.appointmentDate}
                </span>
              </div>

              <div className="pt-2 border-t border-white/30 dark:border-white/10">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Scheduled Slot</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {viewingBillAppt.appointmentTime}
                </span>
              </div>

              <div className="col-span-2 pt-2 border-t border-white/30 dark:border-white/10 flex justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Contact Phone</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {viewingBillAppt.patientMobile || 'Not provided'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Payment Mode</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {viewingBillAppt.paymentMethod?.toUpperCase() || (viewingBillAppt.paymentStatus === 'paid' ? 'ONLINE DIGITAL' : 'CASH AT RECEPTION')}
                  </span>
                </div>
              </div>
            </div>

            {/* Itemized Services & Procedures */}
            <div className="space-y-2 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Itemized Services & Procedures
              </span>
              <div className="border border-white/50 dark:border-white/10 rounded-xl overflow-hidden bg-white/40 dark:bg-slate-800/40">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100/70 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 border-b border-white/40 dark:border-white/10">
                    <tr>
                      <th className="p-2">Description</th>
                      <th className="p-2 text-center">Qty</th>
                      <th className="p-2 text-right">Rate</th>
                      <th className="p-2 text-right">Total (NPR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/40 dark:divide-white/10 font-medium">
                    {viewingInvoice?.items && viewingInvoice.items.length > 0 ? (
                      viewingInvoice.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2 text-slate-800 dark:text-slate-100">{it.itemName || it.name || (it as any).item_name || 'Clinical Service'}</td>
                          <td className="p-2 text-center font-mono text-slate-500">{it.quantity || 1}</td>
                          <td className="p-2 text-right font-mono text-slate-600 dark:text-slate-300">Rs. {it.price}</td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                            Rs. {it.total || (it.price * (it.quantity || 1))}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <>
                        <tr>
                          <td className="p-2 text-slate-800 dark:text-slate-100">Doctor Consultation & OPD Entry</td>
                          <td className="p-2 text-center font-mono text-slate-500">1</td>
                          <td className="p-2 text-right font-mono text-slate-600 dark:text-slate-300">Rs. {viewingBillAppt.feeAmount || 0}</td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900 dark:text-white">Rs. {viewingBillAppt.feeAmount || 0}</td>
                        </tr>
                        {String(viewingBillAppt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK' && getEffectiveServiceCharge(viewingBillAppt) > 0 && (
                          <tr>
                            <td className="p-2 text-slate-800 dark:text-slate-100">Pay at Desk Service Charge (5%)</td>
                            <td className="p-2 text-center font-mono text-slate-500">1</td>
                            <td className="p-2 text-right font-mono text-slate-600 dark:text-slate-300">Rs. {getEffectiveServiceCharge(viewingBillAppt)}</td>
                            <td className="p-2 text-right font-mono font-bold text-slate-900 dark:text-white">Rs. {getEffectiveServiceCharge(viewingBillAppt)}</td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Receipts & Time Log Table */}
            {(() => {
              const effBillTotal = getEffectiveAppointmentTotal(viewingBillAppt)
              const logs = parsePaymentRecords(
                viewingInvoice?.remarks,
                viewingInvoice ? viewingInvoice.paidAmount : (viewingBillAppt.paymentStatus === 'paid' ? effBillTotal : 0),
                viewingInvoice?.paidAt
              )
              if (logs.length === 0) return null
              return (
                <div className="space-y-1.5 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                    Payment Receipts & Time Log
                  </span>
                  <div className="border border-emerald-500/20 rounded-xl overflow-hidden bg-emerald-50/20 dark:bg-emerald-950/20">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-emerald-100/60 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200 border-b border-emerald-500/20">
                        <tr>
                          <th className="p-2">Date & Time Log</th>
                          <th className="p-2">Note / Mode</th>
                          <th className="p-2 text-right">Paid (NPR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-500/10 font-medium">
                        {logs.map((p, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-mono text-slate-700 dark:text-slate-200">{p.dateTime}</td>
                            <td className="p-2 text-slate-500 dark:text-slate-400">{p.note || 'Payment Received'}</td>
                            <td className="p-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              Rs. {p.amount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            {/* Financial Summary Box */}
            {(() => {
              const effBillTotal = getEffectiveAppointmentTotal(viewingBillAppt)
              const totalB = viewingInvoice?.totalAmount && viewingInvoice.totalAmount > 0
                ? Math.max(viewingInvoice.totalAmount, effBillTotal)
                : effBillTotal
              const totalP = viewingInvoice
                ? (viewingInvoice.paidAmount ?? (viewingInvoice.paymentStatus === 'paid' ? totalB : 0))
                : (viewingBillAppt.paymentStatus === 'paid' ? totalB : 0)
              const bal = Math.max(0, totalB - totalP)
              const cleanRem = extractCleanClinicalRemarks(viewingInvoice?.remarks)

              return (
                <div className="space-y-2">
                  <div className="p-3 bg-teal-50/60 dark:bg-teal-950/30 border border-teal-500/30 rounded-xl text-xs space-y-1.5 font-mono">
                    <div className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>Total Combined Bill:</span>
                      <strong className="text-slate-900 dark:text-white font-black text-sm">Rs. {totalB}</strong>
                    </div>
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                      <span>Total Paid to Date:</span>
                      <span>Rs. {totalP}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-teal-500/20 text-rose-600 dark:text-rose-400 font-black text-xs">
                      <span>Balance Due:</span>
                      <span>Rs. {bal}</span>
                    </div>
                  </div>

                  {cleanRem && (
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-white/40 dark:border-white/10 text-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Clinical Remarks / Advice</span>
                      <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{cleanRem}</p>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Official Stamp & Security Seal */}
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-slate-500 text-[11px] flex items-center justify-between border border-white/40 dark:border-white/10">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Digitally Authenticated • Dactor Health Cloud Network</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                {new Date(viewingBillAppt.createdAt || Date.now()).toLocaleDateString()}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setViewingBillAppt(null)}
                className="flex-1 py-3 liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-white/50 dark:border-white/10 transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handlePrintAppointmentBill(viewingBillAppt, viewingInvoice)}
                className="flex-1 py-3 bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 text-white rounded-xl text-xs font-bold transition shadow-glass-brand border border-white/25 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Print Official Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: APPOINTMENT CANCELLATION CONFIRMATION
      ========================================== */}
      {cancellingAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-glass-modal border border-white/60 dark:border-white/15 space-y-5 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setCancellingAppt(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full liquid-glass-subtle text-slate-500 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Cancel Appointment?
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Token #{cancellingAppt.trackingCode10Digit}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl liquid-glass-subtle border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 space-y-1">
              <p className="font-bold">Slot Release Warning:</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Cancelling will release your reserved slot for {cancellingAppt.appointmentDate} ({cancellingAppt.appointmentTime || 'OPD'}) with {cancellingAppt.doctor?.fullName || 'the attending doctor'}.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Reason for Cancellation
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {['Schedule conflict', 'Feeling better', 'Booked wrong date', 'Doctor unavailable'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setCancellationReason(r)}
                    className={`py-1.5 px-2.5 rounded-xl text-[11px] font-semibold border transition text-center cursor-pointer ${
                      cancellationReason === r
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300 font-bold'
                        : 'liquid-glass-subtle border-white/40 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Or specify custom reason..."
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full px-3.5 py-2.5 liquid-glass-input rounded-xl text-xs text-slate-900 dark:text-white outline-none mt-1"
              />
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingAppt(null)}
                className="flex-1 py-3 liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-white/50 dark:border-white/10 transition cursor-pointer"
              >
                Keep Appointment
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelAppointment}
                disabled={isConfirmingCancel}
                className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl text-xs font-bold transition shadow-xs border border-rose-500/30 active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {isConfirmingCancel ? 'Cancelling...' : 'Yes, Cancel Slot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: DIGITAL PRESCRIPTION (Rx) VIEWER
      ========================================== */}
      {viewingPrescriptionAppt && (() => {
        let parsedRx: {
          diagnosis?: string
          medicines?: Array<{ name: string; dosage?: string; frequency?: string; duration?: string; instructions?: string }>
          advice?: string
        } | null = null

        try {
          if (viewingPrescriptionAppt.notes && (viewingPrescriptionAppt.notes.trim().startsWith('{') || viewingPrescriptionAppt.notes.trim().startsWith('['))) {
            parsedRx = JSON.parse(viewingPrescriptionAppt.notes)
          }
        } catch {}

        const diagnosis = parsedRx?.diagnosis || viewingPrescriptionAppt.notes || 'Clinical Consultation Completed'
        const advice = parsedRx?.advice || ''
        const medicines = parsedRx?.medicines || []

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-md flex items-center justify-center p-4">
            <div className="liquid-glass-modal rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-glass-modal border border-white/60 dark:border-white/15 space-y-5 relative animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setViewingPrescriptionAppt(null)}
                className="absolute top-5 right-5 p-1.5 rounded-full liquid-glass-subtle text-slate-500 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start justify-between pr-8">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    ℞ Official Clinical Record
                  </span>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">
                    Medical Prescription (Rx)
                  </h3>
                  <span className="font-mono text-xs text-slate-500">
                    Token #{viewingPrescriptionAppt.trackingCode10Digit}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyCode(viewingPrescriptionAppt.trackingCode10Digit)}
                  className="px-2.5 py-1 rounded-xl liquid-glass-subtle text-xs font-bold text-blue-700 dark:text-blue-300 border border-blue-500/30 flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </button>
              </div>

              {/* Consultation Details */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-2xl liquid-glass-subtle border border-white/40 dark:border-white/10 space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Attending Doctor</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm block">
                    {viewingPrescriptionAppt.doctor?.fullName || 'OPD Specialist'}
                  </span>
                  <span className="text-blue-600 dark:text-blue-400 text-[11px] font-semibold block">
                    {viewingPrescriptionAppt.doctor?.specialty || 'General Medicine'}
                  </span>
                </div>
                <div className="p-3 rounded-2xl liquid-glass-subtle border border-white/40 dark:border-white/10 space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Patient Details</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm block">
                    {viewingPrescriptionAppt.patientName}
                  </span>
                  <span className="text-slate-500 text-[11px] block">
                    {viewingPrescriptionAppt.patientAge || '-'} Yrs • {viewingPrescriptionAppt.patientGender || '-'}
                  </span>
                </div>
              </div>

              {/* Diagnosis */}
              <div className="p-4 rounded-2xl liquid-glass-subtle border border-blue-500/20 space-y-1.5">
                <div className="flex items-center space-x-1.5 text-blue-700 dark:text-blue-300 font-bold text-xs uppercase tracking-wider">
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>Diagnosis & Clinical Findings</span>
                </div>
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                  {diagnosis}
                </p>
              </div>

              {/* Medicines List */}
              {medicines.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider block">
                    Prescribed Medicines
                  </span>
                  <div className="overflow-x-auto rounded-2xl border border-white/40 dark:border-white/10 liquid-glass-subtle">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/30 dark:border-white/10 text-[10px] uppercase text-slate-400">
                          <th className="p-2.5">Medicine</th>
                          <th className="p-2.5">Dosage</th>
                          <th className="p-2.5">Freq</th>
                          <th className="p-2.5">Duration</th>
                          <th className="p-2.5">Instructions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/20 dark:divide-white/5 font-medium">
                        {medicines.map((m, idx) => (
                          <tr key={idx} className="hover:bg-white/40 dark:hover:bg-slate-800/40">
                            <td className="p-2.5 font-bold text-slate-900 dark:text-white">{m.name}</td>
                            <td className="p-2.5 font-mono text-slate-600 dark:text-slate-300">{m.dosage || '-'}</td>
                            <td className="p-2.5 text-slate-600 dark:text-slate-300">{m.frequency || '-'}</td>
                            <td className="p-2.5 text-slate-600 dark:text-slate-300">{m.duration || '-'}</td>
                            <td className="p-2.5 text-blue-600 dark:text-blue-400 font-semibold">{m.instructions || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Doctor's Advice */}
              {advice && (
                <div className="p-4 rounded-2xl liquid-glass-subtle border border-emerald-500/20 space-y-1.5">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider block">
                    Doctor's Advice & Precautions
                  </span>
                  <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {advice}
                  </p>
                </div>
              )}

              {/* Footer Buttons */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setViewingPrescriptionAppt(null)}
                  className="flex-1 py-3 liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-white/50 dark:border-white/10 transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintPrescription(viewingPrescriptionAppt)}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold transition shadow-glass-brand border border-white/25 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Prescription (Rx)</span>
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ==========================================
          MODAL: SELECT CLINIC FOR DOCTOR BOOKING
          (1:1 Parity with Android App PatientMainScreen.kt:2392-2602)
      ========================================== */}
      {selectedDoctorForClinicPicker && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-modal rounded-3xl max-w-lg w-full border border-white/60 dark:border-white/15 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-blue-600 via-blue-700 to-sky-600 text-white relative">
              <button
                type="button"
                onClick={() => setSelectedDoctorForClinicPicker(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-2 text-xs font-bold text-blue-100 uppercase tracking-wider">
                <span>Doctor Consultation</span>
                <span>•</span>
                <span>Select Clinic</span>
              </div>
              <h3 className="text-xl font-black mt-1">Select Clinic to Book</h3>
              <p className="text-xs text-blue-100 mt-0.5 font-medium">
                Dr. {selectedDoctorForClinicPicker.fullName.replace(/^dr\.?\s*/i, '')} •{' '}
                {selectedDoctorForClinicPicker.specialty || 'Medical Specialist'}
              </p>
            </div>

            {/* Modal Body: Clinics List */}
            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose the clinic where you want to consult with Dr.{' '}
                {selectedDoctorForClinicPicker.fullName.replace(/^dr\.?\s*/i, '')}:
              </p>

              {doctorClinicsForPicker.length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                  <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Dr. {selectedDoctorForClinicPicker.fullName} is currently not affiliated with any active clinic.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {doctorClinicsForPicker.map((clinic) => (
                    <div
                      key={clinic.id}
                      onClick={() => {
                        const doc = selectedDoctorForClinicPicker
                        setSelectedDoctorForClinicPicker(null)
                        handleSelectClinic(clinic, doc)
                      }}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition cursor-pointer flex items-center justify-between group"
                    >
                      <div className="space-y-1 min-w-0 pr-3">
                        <h5 className="font-extrabold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition truncate">
                          {clinic.name}
                        </h5>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {clinic.addressText || clinic.city || 'Nepal'}
                        </p>
                        <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          ● Realtime OPD Queue Active
                        </p>
                      </div>
                      <button
                        type="button"
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs shrink-0 cursor-pointer"
                      >
                        Select & Book
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDoctorForClinicPicker(null)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: REMOVE RECORD CONFIRMATION
      ========================================== */}
      {apptToRemoveConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-white/60 dark:border-white/15 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-400/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Remove from My Records?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Token #{apptToRemoveConfirm.trackingCode10Digit}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to remove appointment <strong className="font-mono text-slate-900 dark:text-white">#{apptToRemoveConfirm.trackingCode10Digit}</strong> from your active records view? This will unlink it from your device.
            </p>

            <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/40 text-blue-900 dark:text-blue-300 text-xs flex items-start space-x-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
              <span>
                You can easily re-add or link this record anytime using your 10-digit code via the <strong>Claim 10-Digit Code</strong> button.
              </span>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setApptToRemoveConfirm(null)}
                className="flex-1 py-2.5 liquid-glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-white/50 dark:border-white/10 transition cursor-pointer"
              >
                Keep Record
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveRecord}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-rose-600/20 active:scale-95 cursor-pointer"
              >
                Remove Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: RESCHEDULE CONSULTATION CONFIRMATION
      ========================================== */}
      {apptToRescheduleConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-white/60 dark:border-white/15 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center space-x-3 text-sky-600 dark:text-sky-400">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center shrink-0">
                <CalendarRange className="w-6 h-6 text-sky-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Reschedule Consultation?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Token #{apptToRescheduleConfirm.trackingCode10Digit}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              You will be redirected to choose a new available date and time slot from the unified booking calendar.
            </p>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
              <p className="font-bold text-slate-900 dark:text-white">
                Doctor: {apptToRescheduleConfirm.doctor?.fullName || 'Attending Physician'}
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Clinic: {apptToRescheduleConfirm.clinic?.name || 'Partner Medical Clinic'}
              </p>
              <p className="font-semibold text-sky-600 dark:text-sky-400">
                Current Visit: {apptToRescheduleConfirm.appointmentDate} • {apptToRescheduleConfirm.appointmentTime || 'OPD Slot'}
              </p>
              <p className="font-extrabold text-emerald-600 dark:text-emerald-400">
                Fee: Retained (Rs. 0 / Zero Additional Payment)
              </p>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setApptToRescheduleConfirm(null)}
                className="flex-1 py-2.5 liquid-glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-white/50 dark:border-white/10 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmRescheduleFromModal(apptToRescheduleConfirm)}
                className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-sky-600/20 active:scale-95 cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <span>Pick New Slot</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: COMPREHENSIVE CONSULTATION & VISIT DETAILS
          (1:1 Parity with Android App RecordDetailDialog)
      ========================================== */}
      {viewingConsultationDetailsAppt && (() => {
        const target = viewingConsultationDetailsAppt
        const dDoctor = target.doctor
        const dClinic = target.clinic
        const dInvoice = detailInvoice
        const dRemarks = dInvoice?.remarks || target.notes || ''
        const cleanRemarks = extractCleanClinicalRemarks(dRemarks)

        const clinicName = dClinic?.name || 'Partner Medical Clinic'
        const clinicAddress = dClinic?.addressText || dClinic?.city || 'Nepal'
        const doctorName = dDoctor?.fullName
          ? (dDoctor.fullName.startsWith('Dr.') ? dDoctor.fullName : `Dr. ${dDoctor.fullName}`)
          : 'Attending Physician'
        const doctorSpec = dDoctor?.specialty || 'General Physician'
        const doctorAvatar = (dDoctor as any)?.resolvedProfilePictureUrl || dDoctor?.profilePictureUrl || null
        const doctorQualifications = (dDoctor as any)?.qualifications || (dDoctor as any)?.education || 'Nepal Medical Council Verified'

        const initials = doctorName
          .replace(/^dr\.?\s*/i, '')
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase())
          .join('') || 'DR'

        const effTargetTotal = getEffectiveAppointmentTotal(target)
        const totalBill = dInvoice && dInvoice.totalAmount > 0
          ? Math.max(dInvoice.totalAmount, effTargetTotal)
          : effTargetTotal
        const paidAmount = dInvoice && (dInvoice.paidAmount !== undefined || dInvoice.totalAmount > 0)
          ? (dInvoice.paidAmount ?? (target.paymentStatus === 'paid' ? totalBill : 0))
          : (target.paymentStatus === 'paid' ? totalBill : 0)
        const balanceLeft = Math.max(0, totalBill - paidAmount)
        const isCompleted = target.checkinStatus === 'completed'
        const isCancelled = target.checkinStatus === 'cancelled'
        const isInConsultation = target.checkinStatus === 'in_consultation'

        const paymentLedgerEntries = parsePaymentRecords(dRemarks, paidAmount, dInvoice?.paidAt)

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
            <div className="liquid-glass-modal rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col border border-white/60 dark:border-white/15 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              {/* Header Banner */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-600 via-sky-600 to-teal-600 text-white relative shrink-0">
                <button
                  type="button"
                  onClick={() => setViewingConsultationDetailsAppt(null)}
                  className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center space-x-2 text-[11px] font-bold text-blue-100 uppercase tracking-wider">
                  <span>Consultation Details</span>
                  <span>•</span>
                  <span>Visit History</span>
                </div>
                <h3 className="text-lg sm:text-xl font-black mt-1">
                  Appointment #{target.trackingCode10Digit}
                </h3>
                <p className="text-xs text-blue-100 mt-0.5">
                  Complete Clinical Remarks, Itemized Billing Ledger & Diagnostic Reports
                </p>
              </div>

              {/* Scrollable Content */}
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto max-h-[calc(92vh-140px)]">
                {/* 1. DOCTOR & CLINIC CREDENTIALS */}
                <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-3 shadow-xs">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-blue-50 dark:bg-slate-700 border-2 border-blue-500/40 flex items-center justify-center overflow-hidden shrink-0">
                      {doctorAvatar ? (
                        <img
                          src={doctorAvatar}
                          alt={doctorName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="font-black text-blue-600 dark:text-blue-400 text-lg">
                          {initials}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-black text-slate-900 dark:text-white text-base truncate">
                        {doctorName}
                      </h4>
                      <p className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate">
                        {doctorSpec}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {doctorQualifications}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
                    <Building2 className="w-4 h-4 text-teal-600 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{clinicName}</span>
                      <span className="text-slate-400 dark:text-slate-500"> • {clinicAddress}</span>
                    </div>
                  </div>
                </div>

                {/* PAY AT DESK STATUS BANNER (IF PAY_AT_DESK) */}
                {target.paymentMode === 'PAY_AT_DESK' && (
                  <div className={`p-4 rounded-2xl border space-y-3 ${
                    target.status === 'WAITING_FOR_APPROVAL'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : target.status === 'UNAPPROVED'
                      ? 'bg-rose-500/10 border-rose-500/30'
                      : target.status === 'EXPIRED'
                      ? 'bg-slate-500/10 border-slate-500/30'
                      : 'bg-emerald-500/10 border-emerald-500/30'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                        target.status === 'WAITING_FOR_APPROVAL'
                          ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                          : target.status === 'UNAPPROVED'
                          ? 'bg-rose-500/20 text-rose-800 dark:text-rose-200'
                          : target.status === 'EXPIRED'
                          ? 'bg-slate-500/20 text-slate-800 dark:text-slate-200'
                          : 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                      }`}>
                        {target.status === 'WAITING_FOR_APPROVAL'
                          ? 'Waiting for Clinic Approval'
                          : target.status === 'UNAPPROVED'
                          ? 'Unapproved'
                          : target.status === 'EXPIRED'
                          ? 'Request Expired'
                          : 'Approved'}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        Attempt {target.attemptNumber || 1} of 3
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      {target.status === 'WAITING_FOR_APPROVAL' && 'Your Pay at Desk request is awaiting clinic approval. It will enter the live queue once confirmed.'}
                      {target.status === 'UNAPPROVED' && ((target.attemptNumber || 1) < 3 ? 'This request was unapproved by the clinic. You can retry sending it.' : 'This request was unapproved and has reached the maximum attempts (3 of 3).')}
                      {target.status === 'EXPIRED' && 'This request has expired and cannot be approved.'}
                      {target.status === 'APPROVED' && 'This Pay at Desk request was approved by the clinic and is enrolled in the live queue.'}
                    </p>

                    <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 text-xs space-y-1">
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Consultation Fee:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">Rs. {target.feeAmount}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>5% Service Charge:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">Rs. {target.serviceChargeAmount || Number((target.feeAmount * 0.05).toFixed(2))}</span>
                      </div>
                      <div className="flex justify-between font-black text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                        <span>Total at Desk:</span>
                        <span className="text-teal-700 dark:text-teal-300">Rs. {target.totalAmount || (target.feeAmount + Number((target.feeAmount * 0.05).toFixed(2)))}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {target.status === 'WAITING_FOR_APPROVAL' && (
                        dClinic?.contactPhone ? (
                          <a
                            href={`tel:${dClinic.contactPhone}`}
                            className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call Clinic ({dClinic.contactPhone})</span>
                          </a>
                        ) : (
                          <button
                            disabled
                            className="flex-1 py-2 px-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-400 font-bold text-xs cursor-not-allowed"
                          >
                            No Clinic Phone Available
                          </button>
                        )
                      )}
                      {target.status === 'UNAPPROVED' && (target.attemptNumber || 1) < 3 && (
                        <button
                          disabled={retryingApptId === target.id}
                          onClick={() => handleRetryPayAtDesk(target)}
                          className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${retryingApptId === target.id ? 'animate-spin' : ''}`} />
                          <span>{retryingApptId === target.id ? 'Retrying...' : `Retry Request (${3 - (target.attemptNumber || 1)} left)`}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. APPOINTMENT TIME & DEMOGRAPHICS */}
                <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/60">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        10-Digit Appointment ID
                      </span>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className="font-mono text-sm sm:text-base font-black text-blue-600 dark:text-blue-400">
                          #{target.trackingCode10Digit}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(target.trackingCode10Digit)}
                          className="p-1 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                          title="Copy tracking code"
                        >
                          {copiedCode === target.trackingCode10Digit ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        isCancelled
                          ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                          : isCompleted
                          ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                          : isInConsultation
                          ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20 animate-pulse'
                          : 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20'
                      }`}
                    >
                      {isCompleted
                        ? '✓ Completed Visit'
                        : isCancelled
                        ? 'Cancelled'
                        : isInConsultation
                        ? 'Inside Chamber'
                        : 'Active / Scheduled'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300">
                      <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="font-semibold">{target.appointmentDate}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="font-semibold">{target.appointmentTime || 'OPD Slot'}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">Patient</span>
                      <span className="font-bold text-slate-900 dark:text-white">{target.patientName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">Demographics</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {target.patientGender || 'Male'} • {target.patientAge ? `${target.patientAge} yrs` : 'Age N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. CLINICAL REMARKS */}
                <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-2 shadow-xs">
                  <div className="flex items-center space-x-2 text-xs font-bold text-blue-700 dark:text-blue-300">
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Doctor's Clinical Remarks & Recommendations</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/50 dark:border-slate-700/40">
                    {cleanRemarks || 'No clinical remarks recorded for this consultation.'}
                  </p>
                </div>

                {/* 4. DIAGNOSTIC LAB REPORTS */}
                <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs font-bold text-purple-700 dark:text-purple-300">
                      <FlaskConical className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Diagnostic Lab Reports ({detailLabReports.length})</span>
                    </div>
                    <span className="text-[10px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                      {detailLabReports.length} Attached
                    </span>
                  </div>

                  {detailLabReports.length === 0 ? (
                    <p className="text-xs text-slate-400">No diagnostic lab reports attached to this appointment code.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailLabReports.map((report) => {
                        const isUnlocked =
                          unlockedReportIds.includes(report.id) ||
                          Boolean(unlockedReportUrls[report.id])
                        const isReady =
                          report.status === 'delivered' ||
                          report.status === 'prepared' ||
                          Boolean(report.reportFileUrl || (report as any).fileUrl || unlockedReportUrls[report.id])

                        return (
                          <div
                            key={report.id}
                            className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/40 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <h5 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                {report.testName || 'Diagnostic Lab Test'}
                              </h5>
                              <p className="text-[11px] text-purple-700 dark:text-purple-400">
                                {isReady ? '✓ Published & Ready' : 'In Lab Processing'}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2 shrink-0">
                              {isReady ? (
                                isUnlocked && unlockedReportUrls[report.id] ? (
                                  <a
                                    href={unlockedReportUrls[report.id]}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-xs"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Download</span>
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenOrUnlockReport(report)}
                                    className="px-3 py-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-purple-600 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                                  >
                                    <Lock className="w-3.5 h-3.5 text-amber-300" />
                                    <span>Unlock</span>
                                  </button>
                                )
                              ) : (
                                <span className="text-[10px] text-amber-600 font-semibold">Processing</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 5. ITEMISED BILLING & PAYMENT LEDGER */}
                <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <Receipt className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Itemized Billing Breakdown & Ledger</span>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                        totalBill <= 0
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : balanceLeft <= 0
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}
                    >
                      {totalBill <= 0 ? 'NO BILL' : balanceLeft <= 0 ? 'PAID' : `UNPAID (Rs. ${balanceLeft})`}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/40">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Total Bill</span>
                      <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                        Rs. {totalBill}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Paid</span>
                      <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">
                        Rs. {paidAmount}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Remaining</span>
                      <span
                        className={`text-xs sm:text-sm font-black ${
                          balanceLeft > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        Rs. {balanceLeft}
                      </span>
                    </div>
                  </div>

                  {/* Itemized entries */}
                  {dInvoice?.items && dInvoice.items.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-700/30 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Itemized Charges:
                      </span>
                      {dInvoice.items.map((itm, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 dark:text-slate-300">{itm.itemName || itm.name || (itm as any).item_name || 'Clinical Service'}</span>
                          <span className="font-bold text-slate-900 dark:text-white">Rs. {itm.total || ((itm.price || 0) * (itm.quantity || 1))}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Payment receipts timeline */}
                  {paymentLedgerEntries.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-1.5">
                      <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                        Payment Receipts Time Log:
                      </span>
                      {paymentLedgerEntries.map((rec, rIdx) => (
                        <div
                          key={rIdx}
                          className="flex items-center justify-between text-xs py-1 border-b last:border-b-0 border-emerald-200/40 dark:border-emerald-800/30"
                        >
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                              {rec.dateTime}
                            </span>
                            {rec.note && <span className="text-[10px] text-slate-500">{rec.note}</span>}
                          </div>
                          <span className="font-bold text-emerald-700 dark:text-emerald-300">
                            Rs. {rec.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 6. ASSOCIATED PAST VISITS & HISTORY */}
                <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs font-bold text-blue-700 dark:text-blue-300">
                      <History className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>All Associated Appointments & Visits ({associatedVisitsForDetail.length})</span>
                    </div>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                      Chronological Timeline
                    </span>
                  </div>

                  {isLoadingVisitsForDetail ? (
                    <div className="p-4 text-center">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600" />
                    </div>
                  ) : associatedVisitsForDetail.length <= 1 ? (
                    <p className="text-xs text-slate-400">This is the only visit recorded under this appointment ID.</p>
                  ) : (
                    <div className="space-y-2">
                      {associatedVisitsForDetail.map((pastAppt) => {
                        const isCurrent = pastAppt.id === target.id
                        return (
                          <div
                            key={pastAppt.id}
                            onClick={() => setViewingConsultationDetailsAppt(pastAppt)}
                            className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                              isCurrent
                                ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200 shadow-xs'
                                : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700/60 hover:border-blue-300 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-xs">
                                  {pastAppt.appointmentDate} • {pastAppt.appointmentTime || 'OPD'}
                                </span>
                                {isCurrent && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-600 text-white">
                                    Viewing Now
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {pastAppt.doctor?.fullName || 'Doctor'} • {pastAppt.clinic?.name || 'Clinic'}
                              </p>
                              <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">
                                #{pastAppt.trackingCode10Digit} • {pastAppt.checkinStatus}
                              </span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Sticky Action Buttons */}
              <div className="p-3 sm:p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2 justify-between shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                  <button
                    type="button"
                    onClick={() => handleConfirmRescheduleFromModal(target)}
                    className="flex-1 py-2.5 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <CalendarRange className="w-3.5 h-3.5" />
                    <span>Reschedule (Rs. 0)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingBillAppt(target)}
                    className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Bill PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setApptToRemoveConfirm(target)}
                    className="py-2.5 px-3 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                    title="Remove from My Records"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Remove</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingConsultationDetailsAppt(null)}
                  className="py-2.5 px-5 liquid-glass-subtle hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

