import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Building2,
  Stethoscope,
  FlaskConical,
  Activity,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  UploadCloud,
  Bell,
  Plus,
  Trash2,
  Search,
  LogIn,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Send,
  Eye,
  EyeOff,
  RefreshCw,
  Phone,
  UserCheck,
  X,
  CreditCard,
  Printer,
  Coffee,
  Check,
  Receipt,
  Layers,
  ArrowUpRight,
  Sparkles,
  Download,
  Settings,
  MapPin,
  Sliders,
  AlertTriangle,
  Play,
  Camera,
  Lock,
  ArrowUp,
  ArrowDown,
  CalendarClock,
  Tag,
  ReceiptText,
  ListPlus,
  Headphones,
  ExternalLink,
  HelpCircle,
  Copy,
  MessageSquare,
  Mail,
  LifeBuoy,
  ChevronDown,
  UserPlus,
  CalendarPlus,
  DollarSign,
} from 'lucide-react'
import { ClinicPaymentLogsView } from '../components/ClinicPaymentLogsView'
import dactorLogo from '../assets/logo.svg'
import { printAppointmentBill, printPrescription } from '../utils/medicalDocPrinter'
import { GlassCard, GlassButton, GlassBadge } from '../components/glass'
import { DateScroller } from '../components/DateScroller'
import { generateTrackingCode } from '../utils/trackingCode'
import {
  putRecord,
  putRecords,
  getRecord,
  getStore,
  queueMutation,
} from '../services/clinicOfflineDb'
import {
  initSyncManager,
  stopSyncManager,
  triggerSync,
  subscribeSyncState,
  SyncStatus,
} from '../services/clinicSyncManager'
import {
  syncBackupToGoogleDrive,
  downloadLocalBackup,
  restoreClinicBackup,
  DriveUploadResult,
  RestoreResult,
} from '../services/clinicBackupService'
import {
  Clinic,
  ClinicInvitation,
  Doctor,
  Appointment,
  ClinicService,
  LabReport,
  DactorNotification,
  BillingInvoice,
  Slot,
  DayScheduleInfo,
  MedicalSpecialty,
  MedicalQualification,
  CityLocation,
  OnlineGatewayId,
  ClinicGatewaySetupStatus,
  getEffectiveAppointmentTotal,
  getEffectiveInvoiceItems,
  getEffectiveInvoiceTotal,
  getEffectiveServiceCharge,
} from '../types'
import {
  getClinics,
  getClinicById,
  isDiagnosticLabClinic,
  getClinicForPortalById,
  getClinicByEmail,
  getDoctors,
  getDoctorsByClinic,
  getAppointmentsByClinic,
  updateAppointmentStatus,
  transitionDiagnosticToProcessing,
  autoTransferUncompletedQueueToNoShow,
  updateAppointmentNotes,
  createAppointment,
  getClinicServices,
  createClinicService,
  deleteClinicService,
  saveLabReport,
  uploadReportFile,
  getLabReportsByClinic,
  getClinicNotifications,
  markAllNotificationsAsRead,
  sendBroadcastNotification,
  createClinic,
  createDoctor,
  uploadClinicDocument,
  getMedicalSpecialties,
  getMedicalQualifications,
  generate10DigitTrackingCode,
  getAppointmentByTrackingCode,
  getBillingInvoicesByClinic,
  getInvoiceForAppointment,
  saveOrUpdateInvoicePayment,
  uploadReceiptFile,
  updateDoctorPresence,
  updateClinicBreak,
  searchPatientRecords,
  updateClinic,
  toggleClinicHoliday,
  saveWeeklySchedule,
  updateDoctor,
  sendManualNotification,
  checkEmailPortalAssociation,
  getClinicPatientDirectory,
  buildClinicPatientDirectory,
  ClinicPatientDirectoryEntry,
  PatientDirectoryConsultation,
  getSupportUrl,
  createSlot,
  createSlotsBatch,
  getSlots,
  isSlotTimeExpired,
  parseTimeToMinutes,
  updateSlot,
  deleteSlot,
  reorderQueuePosition,
  shiftAppointmentDate,
  checkAndNotifyApproachingPatients,
  uploadClinicPhoto,
  uploadDoctorPhoto,
  requestClinicActivationRenewal,
  completeClinicSubscriptionPayment,
  scheduleClinicDeletion,
  cancelClinicDeletion,
  getClinicInvitations,
  sendClinicInvitation,
  cancelClinicInvitation,
  deleteClinicPermanently,
  purgeExpiredClinicData,
  getLocationDetails,
  addCityLocation,
  deleteCityLocation,
  updateCityLocation,
  saveClinicEsewaCredentials,
  getClinicGatewaySetupStatus,
  saveClinicGatewayCredentials,
  toggleClinicGateway,
  reconcileClinicPendingPayments,
  getPendingPayAtDeskRequests,
  getPendingPayAtDeskCount,
  approvePayAtDeskAppointment,
  rejectPayAtDeskAppointment,
  markPayAtDeskCollected,
  requestAuthorizedDocumentUrl,
} from '../services/db'
import { compressImage } from '../utils/imageCompressor'
import { playClinicChime } from '../utils/audioChime'
import {
  parsePaymentRecords,
  extractCleanClinicalRemarks,
  buildCombinedRemarks,
  WebPaymentRecord,
} from '../utils/paymentLedger'
import { supabase } from '../lib/supabase'
import {
  signInWithFirebaseGoogle,
  signOutFirebase,
  firebaseSignOut,
  checkRedirectGoogleUser,
  onFirebaseAuthStateChanged,
} from '../lib/firebase'

interface ClinicPortalProps {
  onLogout?: () => void
}

// Default 7-day weekly schedule template
const DEFAULT_WEEKLY_SCHEDULE: DayScheduleInfo[] = [
  { day: 'Sunday', isOpen: true, openTime: '08:00 AM', closeTime: '08:00 PM', hasBreak: true, breakStart: '01:00 PM', breakEnd: '02:00 PM' },
  { day: 'Monday', isOpen: true, openTime: '08:00 AM', closeTime: '08:00 PM', hasBreak: true, breakStart: '01:00 PM', breakEnd: '02:00 PM' },
  { day: 'Tuesday', isOpen: true, openTime: '08:00 AM', closeTime: '08:00 PM', hasBreak: true, breakStart: '01:00 PM', breakEnd: '02:00 PM' },
  { day: 'Wednesday', isOpen: true, openTime: '08:00 AM', closeTime: '08:00 PM', hasBreak: true, breakStart: '01:00 PM', breakEnd: '02:00 PM' },
  { day: 'Thursday', isOpen: true, openTime: '08:00 AM', closeTime: '08:00 PM', hasBreak: true, breakStart: '01:00 PM', breakEnd: '02:00 PM' },
  { day: 'Friday', isOpen: true, openTime: '08:00 AM', closeTime: '08:00 PM', hasBreak: true, breakStart: '01:00 PM', breakEnd: '02:00 PM' },
  { day: 'Saturday', isOpen: true, openTime: '08:00 AM', closeTime: '04:00 PM', hasBreak: false, breakStart: '01:00 PM', breakEnd: '02:00 PM' },
]

interface TimingEstimateResult {
  statusText: string
  estimatedWait: string
  exactTimeStr: string
  isDoctorAway: boolean
  isOnBreak: boolean
  isSoonBeReady: boolean
  remainingMinutes: number
  timeWindowText?: string
  approxTimeText?: string
  slotNoticeText?: string
  canOfferEarlyArrival?: boolean
  suggestedArrivalText?: string
}

function formatPayAtDeskRelativeTime(isoString?: string): string {
  if (!isoString) return ''
  try {
    const millis = new Date(isoString).getTime()
    const diff = Date.now() - millis
    const mins = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (diff < 0) return 'Just now'
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days === 1) return 'Yesterday'
    return `${days}d ago`
  } catch {
    return ''
  }
}

function formatMinutesTo12h(totalMins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMins)))
  const h24 = Math.floor(clamped / 60)
  const m = clamped % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`
}

function parseSlotStartTime(slotStr?: string): Date | null {
  if (!slotStr) return null
  const token = slotStr.split(/[-–]|to/)[0]?.trim()
  if (!token) return null
  const m = token.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([APap][Mm]))?/)
  if (!m) return null
  let hours = parseInt(m[1], 10)
  const minutes = parseInt(m[2], 10)
  const ampm = m[3]?.toUpperCase()
  if (ampm === 'PM' && hours < 12) hours += 12
  if (ampm === 'AM' && hours === 12) hours = 0
  const d = new Date()
  d.setHours(hours, minutes, 0, 0)
  return d
}

function formatTimeWindow(d: Date, spreadMinutes = 15): string {
  const start = new Date(d.getTime() - 5 * 60000)
  const end = new Date(d.getTime() + Math.max(5, spreadMinutes - 5) * 60000)
  const fmt = (x: Date) => x.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${fmt(start)} – ${fmt(end)}`
}

function formatApproxTime(d: Date): string {
  const fmt = (x: Date) => x.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `around ${fmt(d)}`
}

// Real timing estimate calculation
function calculateLiveQueueTimingEstimate(
  targetAppt: Appointment,
  allTodayAppts: Appointment[],
  clinic: Clinic,
  doctor: Doctor | null,
  now = new Date()
): TimingEstimateResult {
  const formatTime = (d: Date) => {
    let h = d.getHours()
    const m = d.getMinutes().toString().padStart(2, '0')
    const ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return `${h.toString().padStart(2, '0')}:${m} ${ampm}`
  }

  // 1. Check if doctor is not inside the clinic
  if (doctor && doctor.isInClinic === false) {
    return {
      statusText: 'Doctor is not inside the clinic (He/She is not in)',
      estimatedWait: 'Doctor Away',
      exactTimeStr: 'Doctor Away',
      isDoctorAway: true,
      isOnBreak: false,
      isSoonBeReady: false,
      remainingMinutes: 0,
      timeWindowText: 'Doctor Away',
      approxTimeText: 'Doctor Away',
    }
  }

  // 2. Check if clinic is on break
  if (clinic.isOnBreak) {
    return {
      statusText: 'Clinic is currently on break. Consultations will resume shortly.',
      estimatedWait: 'On Break',
      exactTimeStr: 'On Break',
      isDoctorAway: false,
      isOnBreak: true,
      isSoonBeReady: false,
      remainingMinutes: 0,
      timeWindowText: 'On Break',
      approxTimeText: 'On Break',
    }
  }

  // Determine average consultation time
  const avgMins = Math.max(
    1,
    clinic.avgTimeMode === 'manual'
      ? clinic.manualAvgConsultationTimeMinutes || 10
      : clinic.calculatedAvgConsultationTimeMinutes || clinic.avgConsultationTimeMinutes || 10
  )

  // 3. Count ONLY active people. Strictly exclude completed, cancelled and no-show patients.
  const activeAppts = allTodayAppts.filter(
    (a) => a.checkinStatus === 'waiting' || a.checkinStatus === 'in_consultation' || a.checkinStatus === 'inside'
  )
  const insidePatient = activeAppts.find(
    (a) => a.checkinStatus === 'in_consultation' || a.checkinStatus === 'inside'
  )

  // If target patient is inside
  if (insidePatient && insidePatient.id === targetAppt.id) {
    return {
      statusText: 'Patient is currently inside doctor cabin.',
      estimatedWait: 'Currently Inside',
      exactTimeStr: 'In Cabin Now',
      isDoctorAway: false,
      isOnBreak: false,
      isSoonBeReady: false,
      remainingMinutes: 0,
      timeWindowText: 'Now in cabin',
      approxTimeText: 'In cabin now',
    }
  }

  // If target patient is already completed or cancelled
  if (
    targetAppt.checkinStatus === 'completed' ||
    targetAppt.checkinStatus === 'no_show' ||
    targetAppt.checkinStatus === 'cancelled'
  ) {
    return {
      statusText: `Status: ${targetAppt.checkinStatus.toUpperCase()}`,
      estimatedWait: '–',
      exactTimeStr: '–',
      isDoctorAway: false,
      isOnBreak: false,
      isSoonBeReady: false,
      remainingMinutes: 0,
    }
  }

  // People ahead in active queue
  const waitingList = activeAppts.filter((a) => a.checkinStatus === 'waiting')
  const pos = waitingList.findIndex((a) => a.id === targetAppt.id)
  const patientsAhead = pos >= 0 ? pos + (insidePatient ? 1 : 0) : 0

  // Slot timing analysis
  const slotStartDate = parseSlotStartTime(targetAppt.appointmentTime)
  const isSlotInFuture = slotStartDate ? now.getTime() < slotStartDate.getTime() : false
  const isDoctorFree = Boolean(doctor && doctor.isInClinic !== false && !insidePatient && !clinic.isOnBreak)

  let arrivalAdvice = ''
  let slotStartFmt = ''
  if (slotStartDate) {
    const arr = new Date(slotStartDate.getTime() - 15 * 60000)
    arrivalAdvice = `Please arrive by ${formatTime(arr)}.`
    slotStartFmt = formatTime(slotStartDate)
  }

  const slotNotice = slotStartDate
    ? (patientsAhead === 0
        ? `No one ahead of you. Your slot starts at ${slotStartFmt}. ${arrivalAdvice}`.trim()
        : `${patientsAhead} ${patientsAhead === 1 ? 'person' : 'people'} ahead. Your slot starts at ${slotStartFmt}. ${arrivalAdvice}`.trim())
    : (patientsAhead === 0
        ? 'No one ahead of you. You are up next!'
        : `${patientsAhead} ahead in line. Est. wait: ~${patientsAhead * avgMins} mins`)

  // Dynamic wait based on active queue
  let remainingForInside = 0
  if (insidePatient) {
    const insideStart = new Date(insidePatient.updatedAt || insidePatient.createdAt || now)
    const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - insideStart.getTime()) / 60000))
    remainingForInside = Math.max(0, avgMins - elapsedMinutes)
  }
  const dynamicWaitMins = remainingForInside + (pos >= 0 ? pos * avgMins : 0)
  const dynamicExpectedTime = new Date(now.getTime() + dynamicWaitMins * 60000)

  let finalExpectedTime: Date
  let waitStr: string
  let remainingMins: number

  if (patientsAhead === 0) {
    if (slotStartDate && isSlotInFuture) {
      finalExpectedTime = slotStartDate
      remainingMins = Math.max(0, Math.round((slotStartDate.getTime() - now.getTime()) / 60000))
      waitStr = remainingMins > 60 ? `Starts at ${slotStartFmt}` : `~${remainingMins} mins`
    } else {
      // Position 1 and current time is within slot or slot is over:
      finalExpectedTime = now
      waitStr = 'Arrive Fast'
      remainingMins = 0
    }
  } else {
    // Patient is at position 2, 3, etc. (patientsAhead > 0)
    if (slotStartDate && isSlotInFuture) {
      const slotStaggered = new Date(slotStartDate.getTime() + patientsAhead * avgMins * 60000)
      finalExpectedTime = dynamicExpectedTime.getTime() > slotStaggered.getTime() ? dynamicExpectedTime : slotStaggered
      remainingMins = Math.max(0, Math.round((finalExpectedTime.getTime() - now.getTime()) / 60000))
      waitStr = remainingMins > 60 ? `~${Math.round(remainingMins / 60)} hr` : `~${remainingMins} mins`
    } else {
      // Current time is within slot or slot is over: calculate dynamically based on active queue
      finalExpectedTime = dynamicExpectedTime
      remainingMins = dynamicWaitMins
      waitStr = `~${dynamicWaitMins} mins`
    }
  }

  const isArriveFast = waitStr === 'Arrive Fast'
  const windowText = isArriveFast ? 'Immediate' : formatTimeWindow(finalExpectedTime)
  const approxText = isArriveFast ? 'Your turn, arrive fast' : formatApproxTime(finalExpectedTime)

  const isSoon = patientsAhead === 0 || remainingMins <= 3 || waitStr.includes('Soon') || isArriveFast

  return {
    statusText: slotNotice,
    estimatedWait: waitStr,
    exactTimeStr: `${windowText} (${approxText})`,
    isDoctorAway: false,
    isOnBreak: false,
    isSoonBeReady: isSoon,
    remainingMinutes: remainingMins,
    timeWindowText: windowText,
    approxTimeText: approxText,
    slotNoticeText: slotNotice,
    canOfferEarlyArrival: false,
    suggestedArrivalText: arrivalAdvice,
  }
}

export const ClinicPortal: React.FC<ClinicPortalProps> = () => {
  // Authentication & Profile State
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [clinicDoctors, setClinicDoctors] = useState<Doctor[]>([])

  // Authentication & Verification State Machine
  const [currentView, setCurrentView] = useState<
    'auth_choice' | 'register_form' | 'pending_verification' | 'operational_desk'
  >(() => {
    try {
      const isClinicAuth = localStorage.getItem('dactor_clinic_logged_in') === 'true'
      const role = localStorage.getItem('dactor_clinic_role')
      if (isClinicAuth && (role === 'clinic_manager' || role === 'lab_tech' || role === 'doctor')) {
        return 'operational_desk'
      }
      if (localStorage.getItem('dactor_pending_verification')) {
        return 'pending_verification'
      }
      return 'auth_choice'
    } catch {
      return 'auth_choice'
    }
  })

  const [pendingEntity, setPendingEntity] = useState<{
    email: string
    role: 'clinic' | 'doctor'
    name: string
    id: string
    details: string
    status: string
  } | null>(() => {
    try {
      const raw = localStorage.getItem('dactor_pending_verification')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const [verifiedEmail, setVerifiedEmail] = useState<string>(() => {
    try {
      return localStorage.getItem('dactor_clinic_email') || ''
    } catch {
      return ''
    }
  })

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
    if (typeof window !== 'undefined' && (navigator as any).brave) {
      if (typeof (navigator as any).brave.isBrave === 'function') {
        (navigator as any).brave.isBrave().then((val: boolean) => {
          if (val) setIsBrave(true)
        }).catch(() => {})
      } else {
        setIsBrave(true)
      }
    }
  }, [])

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const isClinicAuth = localStorage.getItem('dactor_clinic_logged_in') === 'true'
      const role = localStorage.getItem('dactor_clinic_role')
      return isClinicAuth && (role === 'clinic_manager' || role === 'lab_tech' || role === 'doctor')
    } catch {
      return false
    }
  })
  const [authEmail, setAuthEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem('dactor_clinic_email') || null
    } catch {
      return null
    }
  })
  const [authRole, setAuthRole] = useState<'clinic_manager' | 'doctor' | 'lab_tech'>(() => {
    try {
      return (localStorage.getItem('dactor_clinic_role') as any) || 'clinic_manager'
    } catch {
      return 'clinic_manager'
    }
  })

  // Google Sign-In Status
  const [firebaseLoading, setFirebaseLoading] = useState(false)
  const [firebaseError, setFirebaseError] = useState<string | null>(null)
  const isProcessingAuth = useRef(false)
  const authInFlightEmail = useRef<string | null>(null)

  // Taxonomy Lists from Supabase
  const [medicalSpecialties, setMedicalSpecialties] = useState<MedicalSpecialty[]>([])
  const [medicalQualifications, setMedicalQualifications] = useState<MedicalQualification[]>([])

  // ==========================================
  // CLINIC REGISTRATION FORM FIELDS
  // ==========================================
  const [regClinicName, setRegClinicName] = useState('')
  const [regClinicType, setRegClinicType] = useState('opd_clinic')
  const [regClinicPan, setRegClinicPan] = useState('')
  const [regClinicPhone, setRegClinicPhone] = useState('')
  const [regManagerPhone, setRegManagerPhone] = useState('')
  const [regClinicAddress, setRegClinicAddress] = useState('')
  const [regClinicLat, setRegClinicLat] = useState<number>(27.7052)
  const [regClinicLng, setRegClinicLng] = useState<number>(85.3193)
  const [regClinicSpecialties, setRegClinicSpecialties] = useState<string[]>([])
  const [regClinicDocFile, setRegClinicDocFile] = useState<File | null>(null)
  const [regClinicPictures, setRegClinicPictures] = useState<File[]>([])
  const [regClinicDesc, setRegClinicDesc] = useState('')
  const [regClinicTermsAccepted, setRegClinicTermsAccepted] = useState(false)
  const [regClinicErrors, setRegClinicErrors] = useState<{ [key: string]: string }>({})
  const [isDetectingLocation, setIsDetectingLocation] = useState(false)
  const [gpsStatusFeedback, setGpsStatusFeedback] = useState<string | null>(null)
  const [gpsErrorFeedback, setGpsErrorFeedback] = useState<string | null>(null)
  const [regSubmitError, setRegSubmitError] = useState<string | null>(null)
  const [isBrave, setIsBrave] = useState<boolean>(false)

  // Form submission status & progress
  const [isSubmittingRegistration, setIsSubmittingRegistration] = useState(false)
  const [registrationStatusMsg, setRegistrationStatusMsg] = useState<string | null>(null)
  const [checkingVerification, setCheckingVerification] = useState(false)
  const [verificationCheckMsg, setVerificationCheckMsg] = useState<string | null>(null)

  // Operational desk tabs matching DashboardScreen.kt
  const [deskTab, setDeskTab] = useState<
    | 'queue'
    | 'pay_at_desk_requests'
    | 'walkin'
    | 'slots'
    | 'future_appts'
    | 'noshow'
    | 'fees'
    | 'invitations'
    | 'working_hours'
    | 'doctors'
    | 'billing'
    | 'payment_logs'
    | 'patients'
    | 'lab'
    | 'rates'
    | 'broadcast'
    | 'settings'
  >('queue')

  // Pay at Desk requests state
  const [payAtDeskRequests, setPayAtDeskRequests] = useState<Appointment[]>([])
  const [payAtDeskCount, setPayAtDeskCount] = useState<number>(0)
  const [isLoadingPayAtDesk, setIsLoadingPayAtDesk] = useState<boolean>(false)
  const [payAtDeskActionLoading, setPayAtDeskActionLoading] = useState<boolean>(false)
  const [payAtDeskDetailModal, setPayAtDeskDetailModal] = useState<Appointment | null>(null)
  const [confirmPayAtDeskAction, setConfirmPayAtDeskAction] = useState<{ action: 'approve' | 'reject'; appt: Appointment } | null>(null)

  // Offline Connectivity & Sync Manager State
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => ({
    state: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online',
    pendingCount: 0,
  }))

  // Google Drive & Backup / Disaster Recovery States
  const [isSyncingGoogleDrive, setIsSyncingGoogleDrive] = useState(false)
  const [driveSyncResult, setDriveSyncResult] = useState<DriveUploadResult | null>(null)
  const [driveSyncError, setDriveSyncError] = useState<string | null>(null)
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false)
  const [downloadBackupResult, setDownloadBackupResult] = useState<{ filename: string; sha256?: string } | null>(null)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [isRestoringBackup, setIsRestoringBackup] = useState(false)
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const handleTriggerManualSync = async () => {
    try {
      await triggerSync()
    } catch (err) {
      console.error('Manual sync error:', err)
    }
  }

  const handleSyncToGoogleDrive = async () => {
    if (!selectedClinic?.id) return
    setIsSyncingGoogleDrive(true)
    setDriveSyncError(null)
    setDriveSyncResult(null)
    try {
      const res = await syncBackupToGoogleDrive(selectedClinic.id)
      setDriveSyncResult(res)
    } catch (err: any) {
      console.error('Google Drive sync error:', err)
      setDriveSyncError(err?.message || 'Failed to sync backup to Google Drive')
    } finally {
      setIsSyncingGoogleDrive(false)
    }
  }

  const handleDownloadLocalBackup = async () => {
    if (!selectedClinic?.id) return
    setIsDownloadingBackup(true)
    try {
      await downloadLocalBackup(selectedClinic.id)
      setDownloadBackupResult({ filename: `dactor-clinic-${selectedClinic.id}.json` })
    } catch (err: any) {
      console.error('Download local backup error:', err)
      alert(err?.message || 'Failed to download local backup')
    } finally {
      setIsDownloadingBackup(false)
    }
  }

  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClinic?.id) return
    setIsRestoringBackup(true)
    setRestoreError(null)
    setRestoreResult(null)
    try {
      const content = await file.text()
      const res = await restoreClinicBackup(content, selectedClinic.id)
      setRestoreResult(res)
      setRefreshKey((k) => k + 1)
    } catch (err: any) {
      console.error('Restore backup error:', err)
      setRestoreError(err?.message || 'Failed to restore clinic backup')
    } finally {
      setIsRestoringBackup(false)
      e.target.value = ''
    }
  }


  useEffect(() => {
    // Keep desk tab clean
  }, [])

  // Queue Board Segmented Sub-Tab (QueueBoardScreen.kt: Live vs Processing vs Completed)
  const [queueSubTab, setQueueSubTab] = useState<'waiting' | 'processing' | 'past'>('waiting')
  const [selectedQueueDate, setSelectedQueueDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  )
  const [expandedQueueApptId, setExpandedQueueApptId] = useState<string | null>(null)
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null)

  // Clinical Remark Modal State (QueueBoardScreen.kt & FutureAppointmentsScreen.kt)
  const [remarkModalOpen, setRemarkModalOpen] = useState(false)
  const [remarkTargetAppt, setRemarkTargetAppt] = useState<Appointment | null>(null)
  const [remarkText, setRemarkText] = useState('')
  const [savingRemark, setSavingRemark] = useState(false)

  // Subscription Renewal Modal & Notification Drawer State (DashboardScreen.kt)
  const [showRenewalModal, setShowRenewalModal] = useState(false)
  const [renewalPlan, setRenewalPlan] = useState<'1_month' | '12_months'>('1_month')
  const [renewalTxnRef, setRenewalTxnRef] = useState('')
  const [submittingRenewal, setSubmittingRenewal] = useState(false)
  const [clinicNotifications, setClinicNotifications] = useState<DactorNotification[]>([])
  const [showNotificationsModal, setShowNotificationsModal] = useState(false)
  const [isExpiryBannerDismissed, setIsExpiryBannerDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('dismiss_clinic_expiry_banner') === 'true'
    } catch {
      return false
    }
  })

  // Scroll collapsing state across 3 portals: Future OPD, Live Queue, Slot Publishing
  const [isScrolledDown, setIsScrolledDown] = useState(false)

  useEffect(() => {
    let lastScrollY = window.scrollY
    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY
          // If scrolled down more than 90px and scrolling downwards -> collapse top controls smoothly
          if (currentScrollY > 90 && currentScrollY > lastScrollY + 12) {
            setIsScrolledDown(true)
          } 
          // If scrolling upwards by more than 8px or near the top -> show all buttons smoothly
          else if (currentScrollY < lastScrollY - 8 || currentScrollY <= 60) {
            setIsScrolledDown(false)
          }
          lastScrollY = currentScrollY
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    setIsScrolledDown(false)
  }, [deskTab])

  // Staff & Doctor Invitations State (InvitationManagerScreen.kt)
  const [allSystemDoctors, setAllSystemDoctors] = useState<Doctor[]>([])
  const [clinicInvitations, setClinicInvitations] = useState<ClinicInvitation[]>([])
  const [inviteSubTab, setInviteSubTab] = useState<'find' | 'sent'>('find')
  const [inviteRoleFilter, setInviteRoleFilter] = useState<'all' | 'doctor' | 'lab_technician'>('all')
  const [inviteSearchQuery, setInviteSearchQuery] = useState('')
  const [customInviteEmail, setCustomInviteEmail] = useState('')
  const [customInviteName, setCustomInviteName] = useState('')
  const [customInviteRole, setCustomInviteRole] = useState<'doctor' | 'lab_technician'>('doctor')
  const [viewingDoctorProfile, setViewingDoctorProfile] = useState<Doctor | null>(null)

  // Consultation Fee Manager State (ConsultationFeeManagerScreen.kt)
  const [editingDoctorFees, setEditingDoctorFees] = useState<{ [docId: string]: number }>({})
  const [savingDocFeeId, setSavingDocFeeId] = useState<string | null>(null)

  // Slot Capacity Edit Modal State (SlotManagerScreen.kt)
  const [editingSlotCapacity, setEditingSlotCapacity] = useState<Slot | null>(null)
  const [newSlotCapacityVal, setNewSlotCapacityVal] = useState<number>(5)

  // Future OPD Sub-Filter (FutureAppointmentsScreen.kt)
  const [futureSubFilter, setFutureSubFilter] = useState<'all' | 'waiting' | 'completed'>('all')

  // Billing Date Filter & Catalog Category Filter (BillingScreen.kt & CatalogManagerScreen.kt)
  const [billingDateFilter, setBillingDateFilter] = useState<string>('all')
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<string>('All')
  const [catalogSearchQuery, setCatalogSearchQuery] = useState<string>('')

  // Lab Workflow Sub-Tab, Search & Verification Gate Modal (LabWorkflowScreen.kt)
  const [labSubTab, setLabSubTab] = useState<'all' | 'processing' | 'prepared'>('all')
  const [labSearchQuery, setLabSearchQuery] = useState('')
  const [labVerifyTargetReport, setLabVerifyTargetReport] = useState<{ report: LabReport; appt: Appointment } | null>(null)
  const [labVerifyInput, setLabVerifyInput] = useState('')
  const [labVerifyError, setLabVerifyError] = useState<string | null>(null)

  // Operational Data State
  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    try {
      const raw = localStorage.getItem('dactor_clinic_cached_appts_' + (selectedClinic?.id || ''))
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [labReports, setLabReports] = useState<LabReport[]>([])
  const [services, setServices] = useState<ClinicService[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Doctor In-Clinic Presence & Clinic Break
  const [doctorInClinic, setDoctorInClinic] = useState<boolean>(true)
  const [clinicOnBreak, setClinicOnBreak] = useState<boolean>(false)
  const [updatingPresence, setUpdatingPresence] = useState(false)
  const [updatingBreak, setUpdatingBreak] = useState(false)

  // Average Consultation Time Mode & Settings
  const [avgTimeMode, setAvgTimeMode] = useState<'auto' | 'manual'>('auto')
  const [manualAvgMinutes, setManualAvgMinutes] = useState<number>(10)
  const [savingAvgTime, setSavingAvgTime] = useState(false)

  // Future Appointments & Holiday Management
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  const [futureSelectedDate, setFutureSelectedDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [togglingHoliday, setTogglingHoliday] = useState(false)

  // Working Hours & Break Weekly Schedule
  const [weeklySchedule, setWeeklySchedule] = useState<DayScheduleInfo[]>(DEFAULT_WEEKLY_SCHEDULE)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleSaveSuccess, setScheduleSaveSuccess] = useState(false)

  // Push Alert Notification Modal
  const [pushAlertModalOpen, setPushAlertModalOpen] = useState(false)
  const [pushAlertTargetAppt, setPushAlertTargetAppt] = useState<Appointment | null>(null)
  const [pushAlertTitle, setPushAlertTitle] = useState('')
  const [pushAlertMessage, setPushAlertMessage] = useState('')
  const [pushAlertLeftVal, setPushAlertLeftVal] = useState('')
  const [pushAlertRightVal, setPushAlertRightVal] = useState('')
  const [sendingPushAlert, setSendingPushAlert] = useState(false)
  const [pushAlertSentSuccess, setPushAlertSentSuccess] = useState(false)

  // Timed Slots Publisher State
  const [slotDoctorId, setSlotDoctorId] = useState<string>('')
  const [slotDate, setSlotDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [slotStartTime, setSlotStartTime] = useState<string>('09:00 AM')
  const [slotEndTime, setSlotEndTime] = useState<string>('11:00 AM')
  const [slotCapacity, setSlotCapacity] = useState<number>(10)
  const [publishedSlots, setPublishedSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [publishingSlot, setPublishingSlot] = useState(false)

  // Shift / Reschedule Appointment Modal State
  const [shiftModalOpen, setShiftModalOpen] = useState(false)
  const [shiftTargetAppt, setShiftTargetAppt] = useState<Appointment | null>(null)
  const [shiftNewDate, setShiftNewDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [shiftNewTime, setShiftNewTime] = useState<string>('09:00 AM')
  const [shiftReason, setShiftReason] = useState<string>('')
  const [shiftingAppointment, setShiftingAppointment] = useState(false)

  // Walk-in optional email & Print Token Slip
  const [walkinEmail, setWalkinEmail] = useState('')
  const [printSlipAppt, setPrintSlipAppt] = useState<Appointment | null>(null)
  const [showPrintTokenSlip, setShowPrintTokenSlip] = useState(false)

  // Billing Line Items & Catalog Quick Selection
  const [billItems, setBillItems] = useState<{ id: string; name: string; price: number; quantity: number }[]>([])
  const [customBillItemName, setCustomBillItemName] = useState('')
  const [customBillItemPrice, setCustomBillItemPrice] = useState('')

  // Push Bill / Payment Dialog State
  const [billModalOpen, setBillModalOpen] = useState(false)
  const [billTargetAppt, setBillTargetAppt] = useState<Appointment | null>(null)
  const [billTotalAmount, setBillTotalAmount] = useState<string>('')
  const [billPaidAmount, setBillPaidAmount] = useState<string>('')
  const [billRemarks, setBillRemarks] = useState<string>('')
  const [billReceiptFile, setBillReceiptFile] = useState<File | null>(null)
  const [billReceiptCompressionInfo, setBillReceiptCompressionInfo] = useState<string | null>(null)
  const [billPaymentRecords, setBillPaymentRecords] = useState<WebPaymentRecord[]>([])
  const [billNewPaymentInput, setBillNewPaymentInput] = useState<string>('')
  const [billNewPaymentNote, setBillNewPaymentNote] = useState<string>('')
  const [billNewPaymentDate, setBillNewPaymentDate] = useState<string>('')
  const [billNewPaymentTime, setBillNewPaymentTime] = useState<string>('')
  const [savingBill, setSavingBill] = useState(false)
  const [showPrintableInvoice, setShowPrintableInvoice] = useState(false)

  // Patient Directory State
  const [patientSearchQuery, setPatientSearchQuery] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState<Appointment[]>([])
  const [searchingPatients, setSearchingPatients] = useState(false)
  const [loadingDirectory, setLoadingDirectory] = useState(false)

  // Reactive Patient Directory: Automatically derived from all clinic appointments in real time
  const patientDirectory = useMemo<ClinicPatientDirectoryEntry[]>(() => {
    return buildClinicPatientDirectory(appointments)
  }, [appointments])

  // Instant Keystroke Live Filtering for Patient Directory Table
  const displayedPatientDirectory = useMemo(() => {
    if (!patientSearchQuery.trim()) return patientDirectory
    const q = patientSearchQuery.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return patientDirectory.filter((p) => {
      const matchName = (p.fullName || '').toLowerCase().includes(q)
      const matchPhone = digits ? (p.phone || '').replace(/\D/g, '').includes(digits) : false
      const matchCode = p.trackingCodes.some((code) => code.toLowerCase().includes(q))
      const matchEmail = (p.email || '').toLowerCase().includes(q)
      return matchName || matchPhone || matchCode || matchEmail
    })
  }, [patientDirectory, patientSearchQuery])

  // Direct Add Patient Dialog (Patient Directory Parity)
  const [registerPatientModalOpen, setRegisterPatientModalOpen] = useState(false)
  const [newPatientName, setNewPatientName] = useState('')
  const [newPatientPhone, setNewPatientPhone] = useState('')
  const [newPatientAge, setNewPatientAge] = useState('')
  const [newPatientGender, setNewPatientGender] = useState('Male')
  const [newPatientEmail, setNewPatientEmail] = useState('')
  const [newPatientNotes, setNewPatientNotes] = useState('')
  const [isRegisteringPatient, setIsRegisteringPatient] = useState(false)

  // Schedule Next Visit Dialog (Patient Directory Parity)
  const [scheduleNextModalOpen, setScheduleNextModalOpen] = useState(false)
  const [scheduleNextPatient, setScheduleNextPatient] = useState<any | null>(null)
  const [scheduleNextDoctorId, setScheduleNextDoctorId] = useState('')
  const [scheduleNextDate, setScheduleNextDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [scheduleNextTime, setScheduleNextTime] = useState('10:00 AM')
  const [scheduleNextRemarks, setScheduleNextRemarks] = useState('Follow-up consultation')
  const [isSchedulingNextVisit, setIsSchedulingNextVisit] = useState(false)

  // Onboarding Form State (when adding a new doctor/staff)
  const [showDoctorOnboarding, setShowDoctorOnboarding] = useState(false)
  const [docName, setDocName] = useState('')
  const [docSpecialty, setDocSpecialty] = useState('General Physician')
  const [docEducation, setDocEducation] = useState('MBBS, MD')
  const [docLicense, setDocLicense] = useState('')
  const [docStartingYear, setDocStartingYear] = useState<number>(2020)
  const [docMobile, setDocMobile] = useState('')
  const [docFee, setDocFee] = useState(500)
  const [docRole, setDocRole] = useState<'doctor' | 'lab_technician'>('doctor')
  const [onboardingErrors, setOnboardingErrors] = useState<{ [key: string]: string }>({})

  // Walk-in booking state
  const [walkinName, setWalkinName] = useState('')
  const [walkinAge, setWalkinAge] = useState('')
  const [walkinGender, setWalkinGender] = useState('Male')
  const [walkinMobile, setWalkinMobile] = useState('')
  const [walkinDoctorId, setWalkinDoctorId] = useState('')
  const [walkinErrors, setWalkinErrors] = useState<{ [key: string]: string }>({})
  const [walkinSuccessCode, setWalkinSuccessCode] = useState<string | null>(null)
  const [walkinSelectedTests, setWalkinSelectedTests] = useState<ClinicService[]>([])
  const [walkinIsFollowup, setWalkinIsFollowup] = useState(false)
  const [walkinFollowupCode, setWalkinFollowupCode] = useState('')
  const [walkinRetainedAppt, setWalkinRetainedAppt] = useState<Appointment | null>(null)
  const [walkinLookupLoading, setWalkinLookupLoading] = useState(false)
  const [walkinLookupError, setWalkinLookupError] = useState<string | null>(null)
  const [walkinSlotTime, setWalkinSlotTime] = useState('')
  const [walkinSlotId, setWalkinSlotId] = useState('')
  const [walkinAvailableSlots, setWalkinAvailableSlots] = useState<Slot[]>([])
  const [walkinEndedSlotsCount, setWalkinEndedSlotsCount] = useState(0)
  const [walkinDate, setWalkinDate] = useState<string>(() => new Date().toISOString().split('T')[0])

  // 3 Clinic Types Classification for active clinic
  const isLabClinic = useMemo(() => isDiagnosticLabClinic(selectedClinic), [selectedClinic])

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

  // Align slot defaults with SlotManagerScreen.kt (lab: 25 capacity & facility-wide; OPD: 10 capacity)
  useEffect(() => {
    setSlotCapacity(isLabClinic ? 25 : 10)
    if (isLabClinic) {
      setSlotDoctorId('')
    }
  }, [isLabClinic])

  // Walk-in 10-digit follow-up code lookup
  useEffect(() => {
    let active = true
    const clean = walkinFollowupCode.trim()
    if (walkinIsFollowup && clean.length === 10 && /^[0-9A-Z]{10}$/i.test(clean)) {
      setWalkinLookupLoading(true)
      setWalkinLookupError(null)
      getAppointmentByTrackingCode(clean)
        .then((found) => {
          if (!active) return
          setWalkinLookupLoading(false)
          if (found) {
            setWalkinRetainedAppt(found)
            setWalkinName(found.patientName)
            setWalkinAge(String(found.patientAge || ''))
            setWalkinGender(found.patientGender || 'Male')
            setWalkinMobile(found.patientMobile || '')
            if (found.patientEmail) setWalkinEmail(found.patientEmail)
            if (found.doctorId && clinicDoctors.length > 0) {
              const matched = clinicDoctors.find((d) => d.id === found.doctorId)
              if (matched) setWalkinDoctorId(matched.id)
            }
          } else {
            setWalkinRetainedAppt(null)
            setWalkinLookupError(`No appointment record found for 10-digit code #${clean}.`)
          }
        })
        .catch(() => {
          if (!active) return
          setWalkinLookupLoading(false)
          setWalkinRetainedAppt(null)
          setWalkinLookupError('Failed to lookup 10-digit tracking code.')
        })
    } else {
      setWalkinRetainedAppt(null)
      if (clean.length > 0 && clean.length !== 10) {
        setWalkinLookupError('Tracking code must be exactly 10 digits.')
      } else {
        setWalkinLookupError(null)
      }
    }
    return () => {
      active = false
    }
  }, [walkinIsFollowup, walkinFollowupCode, clinicDoctors])

  // Diagnostic Lab Management State
  const [labUploadModalOpen, setLabUploadModalOpen] = useState(false)
  const [targetLabAppt, setTargetLabAppt] = useState<Appointment | null>(null)
  const [reportFile, setReportFile] = useState<File | null>(null)
  const [reportCompressionInfo, setReportCompressionInfo] = useState<string | null>(null)
  const [technicianNotes, setTechnicianNotes] = useState('')
  const [uploadingReport, setUploadingReport] = useState(false)

  // New Lab Test Rate State
  const [newServiceName, setNewServiceName] = useState('')
  const [newServicePrice, setNewServicePrice] = useState('')
  const [newServiceCategory, setNewServiceCategory] = useState('Hematology')

  // Broadcast Alert State
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastSent, setBroadcastSent] = useState(false)

  // Clinic Settings State (ClinicSettingsScreen.kt)
  const [settingName, setSettingName] = useState('')
  const [settingType, setSettingType] = useState('multi_visit')
  const [settingPhone, setSettingPhone] = useState('')
  const [settingEmail, setSettingEmail] = useState('')
  const [settingAddress, setSettingAddress] = useState('')
  const [settingLat, setSettingLat] = useState<number>(27.7172)
  const [settingLng, setSettingLng] = useState<number>(85.324)
  const [settingPan, setSettingPan] = useState('')
  const [settingManagerPhone, setSettingManagerPhone] = useState('')
  const [settingThreshold, setSettingThreshold] = useState<number>(2)
  const [settingSpecialties, setSettingSpecialties] = useState<string[]>([])
  const [settingDesc, setSettingDesc] = useState('')
  const [settingGatewayProvider, setSettingGatewayProvider] = useState<OnlineGatewayId>('esewa')
  const [settingGatewayEnabled, setSettingGatewayEnabled] = useState<boolean>(true)
  const [settingPaymentEnvironment, setSettingPaymentEnvironment] = useState<'test' | 'live'>('test')
  const [showPaymentSecretKey, setShowPaymentSecretKey] = useState(false)
  const [settingMerchantId, setSettingMerchantId] = useState('')
  const [settingPaymentApiKey, setSettingPaymentApiKey] = useState('')
  const [settingPaymentSecretKey, setSettingPaymentSecretKey] = useState('')
  const [settingFonepayUsername, setSettingFonepayUsername] = useState('')
  const [settingFonepayPassword, setSettingFonepayPassword] = useState('')
  const [settingConnectIpsAppId, setSettingConnectIpsAppId] = useState('')
  const [settingConnectIpsAppName, setSettingConnectIpsAppName] = useState('DactorClinic')
  const [settingConnectIpsAppPassword, setSettingConnectIpsAppPassword] = useState('')
  const [settingConnectIpsPrivateKeyPem, setSettingConnectIpsPrivateKeyPem] = useState('')
  const [settingConnectIpsPfxBase64, setSettingConnectIpsPfxBase64] = useState('')
  const [settingConnectIpsPfxFileName, setSettingConnectIpsPfxFileName] = useState('')
  const [settingConnectIpsPfxPassword, setSettingConnectIpsPfxPassword] = useState('')
  const [gatewaySetupStatus, setGatewaySetupStatus] = useState<ClinicGatewaySetupStatus | null>(null)
  const [savingGatewayOnly, setSavingGatewayOnly] = useState(false)
  const [gatewayStatusMsg, setGatewayStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [settingDirectPaymentEnabled, setSettingDirectPaymentEnabled] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSuccess, setSettingsSuccess] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [showDeleteArchiveModal, setShowDeleteArchiveModal] = useState(false)
  const [isDeletingPermanently, setIsDeletingPermanently] = useState(false)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  // Admin Cities & Locations Dropdown Manager State
  const [adminCities, setAdminCities] = useState<CityLocation[]>([])
  const [loadingAdminCities, setLoadingAdminCities] = useState(false)
  const [showAddCityModal, setShowAddCityModal] = useState(false)
  const [newCityName, setNewCityName] = useState('')
  const [newCityCoords, setNewCityCoords] = useState('27.7172, 85.3240')
  const [newCityAliases, setNewCityAliases] = useState('')
  const [cityActionMsg, setCityActionMsg] = useState<string | null>(null)
  const [isSubmittingCity, setIsSubmittingCity] = useState(false)

  const loadAdminCities = async () => {
    setLoadingAdminCities(true)
    try {
      const list = await getLocationDetails()
      setAdminCities(list)
    } catch (err) {
      console.warn('Error loading admin cities:', err)
    } finally {
      setLoadingAdminCities(false)
    }
  }

  const handleAddNewCity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCityName.trim()) return
    setIsSubmittingCity(true)
    try {
      const added = await addCityLocation({
        name: newCityName.trim(),
        coordinates: newCityCoords.trim() || '27.7172, 85.3240',
        aliases: newCityAliases.trim() || newCityName.toLowerCase(),
        isActive: true,
      })
      if (added) {
        setAdminCities((prev) => [added, ...prev])
        setCityActionMsg(`✓ Added "${newCityName.trim()}" to location dropdown!`)
        setNewCityName('')
        setNewCityAliases('')
        setShowAddCityModal(false)
        setTimeout(() => setCityActionMsg(null), 3500)
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to add city')
    } finally {
      setIsSubmittingCity(false)
    }
  }

  const handleDeleteCity = async (city: CityLocation) => {
    if (!confirm(`Are you sure you want to delete city "${city.name}" from the location dropdown?`)) return
    try {
      setAdminCities((prev) => prev.filter((c) => c.id !== city.id))
      await deleteCityLocation(city.id)
      setCityActionMsg(`✓ Deleted "${city.name}" from location dropdown.`)
      setTimeout(() => setCityActionMsg(null), 3500)
    } catch (err: any) {
      alert(err?.message || 'Failed to delete city')
      loadAdminCities()
    }
  }

  const handleToggleCityActive = async (city: CityLocation) => {
    const nextState = !city.isActive
    try {
      setAdminCities((prev) =>
        prev.map((c) => (c.id === city.id ? { ...c, isActive: nextState } : c))
      )
      await updateCityLocation(city.id, { isActive: nextState })
      setCityActionMsg(`✓ Updated visibility for "${city.name}".`)
      setTimeout(() => setCityActionMsg(null), 2500)
    } catch (err: any) {
      alert(err?.message || 'Failed to update city')
      loadAdminCities()
    }
  }

  const handleCopyBookingLink = (url: string) => {
    try {
      navigator.clipboard.writeText(url)
      setCopiedLink(url)
      setTimeout(() => setCopiedLink(null), 2500)
    } catch {
      alert('Copied link: ' + url)
    }
  }

  // Generate Year dropdown options (2026 down to 1960)
  const practicingYears: number[] = []
  for (let y = 2026; y >= 1960; y--) {
    practicingYears.push(y)
  }

  const syncClinicToSettings = (clinicObj: Clinic) => {
    setClinicOnBreak(clinicObj.isOnBreak ?? false)
    setAvgTimeMode((clinicObj.avgTimeMode as any) || 'auto')
    setManualAvgMinutes(clinicObj.manualAvgConsultationTimeMinutes || 10)
    if (clinicObj.weeklyScheduleJson) {
      try {
        setWeeklySchedule(JSON.parse(clinicObj.weeklyScheduleJson))
      } catch {}
    }
    setSettingName(clinicObj.name || '')
    setSettingType(clinicObj.type || 'multi_visit')
    setSettingPhone(clinicObj.contactPhone || '')
    setSettingEmail(clinicObj.contactEmail || '')
    setSettingAddress(clinicObj.addressText || '')
    setSettingLat(clinicObj.latitude || 27.7172)
    setSettingLng(clinicObj.longitude || 85.324)
    setSettingPan(clinicObj.panNumber || '')
    setSettingManagerPhone(clinicObj.managerPhone || '')
    setSettingThreshold(clinicObj.autoNotifyThreshold || 2)
    setSettingSpecialties(clinicObj.specialties || [])
    setSettingDesc(clinicObj.description || '')
    const normalizedProv = (clinicObj.paymentGatewayProvider || 'esewa').toLowerCase()
    const validProv: OnlineGatewayId =
      normalizedProv === 'khalti' || normalizedProv === 'fonepay' || normalizedProv === 'connectips'
        ? normalizedProv
        : 'esewa'
    setSettingGatewayProvider(validProv)
    let clinicEnv: 'test' | 'live' = 'test'
    try {
      if (clinicObj.description && clinicObj.description.trim().startsWith('{')) {
        const meta = JSON.parse(clinicObj.description)
        if (meta.payment_environment === 'live' || meta.esewa_environment === 'live') clinicEnv = 'live'
        else if (meta.payment_gateways_json) {
          const g = typeof meta.payment_gateways_json === 'string' ? JSON.parse(meta.payment_gateways_json) : meta.payment_gateways_json
          if (g?.[validProv]?.environment === 'live') clinicEnv = 'live'
        }
      }
    } catch {}
    setSettingPaymentEnvironment(clinicEnv)
    setSettingMerchantId(clinicObj.merchantId || '')
    setSettingPaymentApiKey(clinicObj.paymentApiKey || '')
    setSettingPaymentSecretKey('')
    setSettingDirectPaymentEnabled(clinicObj.isDirectPaymentEnabled ?? false)
  }

  const populateGatewayFormFromSetup = (gw: OnlineGatewayId, setup: ClinicGatewaySetupStatus | null) => {
    setSettingPaymentSecretKey('')
    setSettingFonepayPassword('')
    setSettingConnectIpsAppPassword('')
    setSettingConnectIpsPrivateKeyPem('')
    setSettingConnectIpsPfxBase64('')
    setSettingConnectIpsPfxFileName('')
    setSettingConnectIpsPfxPassword('')
    setGatewayStatusMsg(null)
    if (!setup) return

    if (gw === 'esewa') {
      setSettingGatewayEnabled(setup.esewa.enabled)
      setSettingPaymentEnvironment(setup.esewa.environment || 'test')
      setSettingMerchantId(setup.esewa.merchant_id || '')
      setSettingPaymentApiKey('')
    } else if (gw === 'khalti') {
      setSettingGatewayEnabled(setup.khalti.enabled)
      setSettingPaymentEnvironment(setup.khalti.environment || 'test')
      setSettingPaymentApiKey(setup.khalti.public_key || '')
      setSettingMerchantId(setup.khalti.public_key || '')
    } else if (gw === 'fonepay') {
      setSettingGatewayEnabled(setup.fonepay.enabled)
      setSettingPaymentEnvironment(setup.fonepay.environment || 'test')
      setSettingMerchantId(setup.fonepay.merchant_code || '')
      setSettingFonepayUsername(setup.fonepay.username || '')
    } else if (gw === 'connectips') {
      setSettingGatewayEnabled(setup.connectips.enabled)
      setSettingPaymentEnvironment(setup.connectips.environment || 'test')
      setSettingMerchantId(setup.connectips.merchant_id || '')
      setSettingConnectIpsAppId(setup.connectips.app_id || '')
      setSettingConnectIpsAppName(setup.connectips.app_name || 'DactorClinic')
    }
  }

  useEffect(() => {
    if (!selectedClinic?.id) return
    let active = true
    ;(async () => {
      // Reconcile any closed-app / background pending online payments for this clinic
      reconcileClinicPendingPayments(selectedClinic.id).catch(() => null)
      const setup = await getClinicGatewaySetupStatus(selectedClinic.id)
      if (!active || !setup) return
      setGatewaySetupStatus(setup)
      setSettingDirectPaymentEnabled(setup.is_direct_payment_enabled)
      populateGatewayFormFromSetup(settingGatewayProvider, setup)
    })()
    return () => {
      active = false
    }
  }, [selectedClinic?.id])

  // Load Clinics and Taxonomy on mount
  useEffect(() => {
    async function init() {
      const [cList, specs, quals, allDocs] = await Promise.all([
        getClinics(),
        getMedicalSpecialties(),
        getMedicalQualifications(),
        getDoctors(),
      ])
      setClinics(cList)
      setMedicalSpecialties(specs)
      setMedicalQualifications(quals)
      setAllSystemDoctors(allDocs)

      const savedEmail = (localStorage.getItem('dactor_clinic_email') || '').trim().toLowerCase()
      let initialClinic: Clinic | null = null
      if (savedEmail) {
        initialClinic =
          cList.find((c) => (c.contactEmail || '').toLowerCase() === savedEmail) ||
          (await getClinicByEmail(savedEmail))
      }
      if (!initialClinic && cList.length > 0 && !localStorage.getItem('dactor_clinic_logged_in') && !selectedClinic) {
        initialClinic = cList[0]
      }

      if (initialClinic) {
        setSelectedClinic(initialClinic)
        syncClinicToSettings(initialClinic)
      }
    }
    init()
  }, [])

  // Load clinic-specific operational data
  useEffect(() => {
    if (!selectedClinic) return

    async function loadClinicDetails() {
      setLoading(true)
      try {
        try {
          await autoTransferUncompletedQueueToNoShow(selectedClinic.id, false)
        } catch {}
        const [docs, appts, srvs, reps, invs, notifs, invites, sysDocs] = await Promise.all([
          getDoctorsByClinic(selectedClinic.id),
          getAppointmentsByClinic(selectedClinic.id),
          getClinicServices(selectedClinic.id),
          getLabReportsByClinic(selectedClinic.id),
          getBillingInvoicesByClinic(selectedClinic.id),
          getClinicNotifications(selectedClinic.id),
          getClinicInvitations(selectedClinic.id),
          getDoctors(),
        ])

        setClinicDoctors(docs)
        const feeMap: { [id: string]: number } = {}
        docs.forEach((d) => {
          feeMap[d.id] = d.consultationFee || 500
        })
        setEditingDoctorFees(feeMap)

        if (docs.length > 0) {
          const doc = docs[0]
          setSelectedDoctor(doc)
          setWalkinDoctorId((prev) => prev || doc.id)
          if (!isDiagnosticLabClinic(selectedClinic)) {
            setSlotDoctorId((prev) => prev || doc.id)
          }
          setDoctorInClinic(doc.isInClinic ?? true)
        }
        setAppointments(appts)
        try {
          if (selectedClinic?.id) {
            localStorage.setItem('dactor_clinic_cached_appts_' + selectedClinic.id, JSON.stringify(appts))
          }
        } catch (_) {}
        setServices(srvs)
        setLabReports(reps)
        setInvoices(invs)
        setClinicNotifications(notifs)
        setClinicInvitations(invites)
        setAllSystemDoctors(sysDocs)
        syncClinicToSettings(selectedClinic)
      } catch (err) {
        console.error('Error loading clinic operational data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadClinicDetails()
  }, [selectedClinic, refreshKey])

  // Pay at Desk requests loader & real-time sync
  const fetchPayAtDesk = async (clinicId?: string) => {
    const cid = clinicId || selectedClinic?.id
    if (!cid) return
    setIsLoadingPayAtDesk(true)
    try {
      const list = await getPendingPayAtDeskRequests(cid)
      setPayAtDeskRequests(list)
      setPayAtDeskCount(list.length)
    } catch (e) {
      console.error('Error fetching pay at desk requests:', e)
    } finally {
      setIsLoadingPayAtDesk(false)
    }
  }

  useEffect(() => {
    if (!selectedClinic?.id) return
    fetchPayAtDesk(selectedClinic.id)

    // Realtime bidirectional sync for live queue, doctor cabin, and appointments
    const sub = supabase
      .channel(`clinic_live_ops_${selectedClinic.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `clinic_id=eq.${selectedClinic.id}`,
        },
        async () => {
          fetchPayAtDesk(selectedClinic.id)
          try {
            const freshAppts = await getAppointmentsByClinic(selectedClinic.id)
            if (freshAppts) setAppointments(freshAppts)
          } catch (e) {
            console.error('Error auto-syncing appointments:', e)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
        },
        async () => {
          try {
            const freshAppts = await getAppointmentsByClinic(selectedClinic.id)
            if (freshAppts) setAppointments(freshAppts)
          } catch (e) {
            console.error('Error auto-syncing queue entries:', e)
          }
        }
      )
      .subscribe()

    const interval = setInterval(() => {
      fetchPayAtDesk(selectedClinic.id)
    }, 10000)

    return () => {
      supabase.removeChannel(sub)
      clearInterval(interval)
    }
  }, [selectedClinic?.id])

  // Automatically audit & sweep uncompleted past appointments to no-show when viewing the tab
  useEffect(() => {
    if (deskTab === 'noshow' && selectedClinic?.id) {
      autoTransferUncompletedQueueToNoShow(selectedClinic.id, false).then(async (res) => {
        if (res.count > 0) {
          const freshAppts = await getAppointmentsByClinic(selectedClinic.id)
          if (freshAppts) setAppointments(freshAppts)
        }
      })
    }
  }, [deskTab, selectedClinic?.id])

  // Initialize and synchronize offline IndexedDB sync manager
  useEffect(() => {
    if (!selectedClinic?.id) return

    initSyncManager(selectedClinic.id)
    const unsub = subscribeSyncState((status) => {
      setSyncStatus(status)
    })

    return () => {
      unsub()
      stopSyncManager()
    }
  }, [selectedClinic?.id])

  const handleApprovePayAtDesk = async (appt: Appointment) => {
    if (!selectedClinic?.id || payAtDeskActionLoading) return
    setPayAtDeskActionLoading(true)
    try {
      const res = await approvePayAtDeskAppointment(appt.id, selectedClinic.id)
      if (res.success) {
        setConfirmPayAtDeskAction(null)
        setPayAtDeskDetailModal(null)
        await fetchPayAtDesk()
        const [appts, liveSlots] = await Promise.all([
          getAppointmentsByClinic(selectedClinic.id),
          getSlots(selectedClinic.id, appt.appointmentDate),
        ])
        setAppointments(appts)
        try {
          if (selectedClinic?.id) {
            localStorage.setItem('dactor_clinic_cached_appts_' + selectedClinic.id, JSON.stringify(appts))
          }
        } catch (_) {}
        setPublishedSlots(
          isLabClinic
            ? liveSlots
            : slotDoctorId
            ? liveSlots.filter((s) => s.doctorId === slotDoctorId || !s.doctorId)
            : liveSlots
        )
        if (res.expired) {
          alert(res.message || `Appointment #${appt.trackingCode10Digit || appt.id} slot date has already passed. The request has been expired and cancelled.`)
        } else {
          playClinicChime()
        }
      } else {
        alert(res.error || 'Failed to approve request')
      }
    } catch (err: any) {
      alert(err.message || 'Error approving request')
    } finally {
      setPayAtDeskActionLoading(false)
    }
  }

  const handleRejectPayAtDesk = async (appt: Appointment) => {
    if (!selectedClinic?.id || payAtDeskActionLoading) return
    setPayAtDeskActionLoading(true)
    try {
      const res = await rejectPayAtDeskAppointment(appt.id, selectedClinic.id)
      if (res.success) {
        setConfirmPayAtDeskAction(null)
        setPayAtDeskDetailModal(null)
        await fetchPayAtDesk()
      } else {
        alert(res.error || 'Failed to reject request')
      }
    } catch (err: any) {
      alert(err.message || 'Error rejecting request')
    } finally {
      setPayAtDeskActionLoading(false)
    }
  }

  // Load published slots for selected clinic / doctor & date
  useEffect(() => {
    if (!selectedClinic?.id || !slotDate) return
    if (!isLabClinic && clinicDoctors.length > 0 && !slotDoctorId) return
    async function loadSlots() {
      setLoadingSlots(true)
      try {
        const allSlots = await getSlots(selectedClinic!.id, slotDate)
        const scoped = isLabClinic
          ? allSlots
          : slotDoctorId
          ? (() => {
              const docOnly = allSlots.filter((s) => s.doctorId === slotDoctorId)
              return docOnly.length > 0 ? docOnly : allSlots.filter((s) => !s.doctorId)
            })()
          : allSlots
        setPublishedSlots(scoped)
      } catch (err) {
        console.error('Error loading slots:', err)
      } finally {
        setLoadingSlots(false)
      }
    }
    loadSlots()
  }, [selectedClinic?.id, isLabClinic, clinicDoctors.length, slotDoctorId, slotDate, refreshKey])

  // Load published slots for walk-in appointment registration (all clinic types: OPD, General & Diagnostic Lab)
  useEffect(() => {
    if (!selectedClinic?.id) {
      setWalkinAvailableSlots([])
      setWalkinEndedSlotsCount(0)
      return
    }
    let active = true
    const docId = walkinDoctorId || clinicDoctors[0]?.id
    const targetDate = walkinDate || todayStr
    const now = new Date()
    const localTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    getSlots(selectedClinic.id, targetDate)
      .then((slots) => {
        if (!active) return
        const publishedOnly = (slots || []).filter((s) => s.isPublished !== false)
        const scopedSlots = isLabClinic
          ? publishedOnly
          : docId
          ? (() => {
              const docOnly = publishedOnly.filter((s) => s.doctorId === docId)
              return docOnly.length > 0 ? docOnly : publishedOnly.filter((s) => !s.doctorId)
            })()
          : publishedOnly
        const activeSlots = scopedSlots
          .filter((s) => {
            if (targetDate < todayStr) return false
            if (targetDate > todayStr) return true
            return !isSlotTimeExpired(localTodayStr, s.endTime || s.startTime, s.startTime)
          })
          .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime))
        setWalkinEndedSlotsCount(Math.max(0, scopedSlots.length - activeSlots.length))
        setWalkinAvailableSlots(activeSlots)
      })
      .catch((err) => {
        if (!active) return
        console.error('Error loading walkin slots:', err)
        setWalkinEndedSlotsCount(0)
        setWalkinAvailableSlots([])
      })
    return () => {
      active = false
    }
  }, [selectedClinic?.id, isLabClinic, walkinDoctorId, clinicDoctors, walkinDate, todayStr, refreshKey])

  // Auto-select first open published walk-in slot (or keep existing valid selection)
  useEffect(() => {
    if (walkinAvailableSlots.length === 0) {
      setWalkinSlotId('')
      setWalkinSlotTime('')
      return
    }
    const existing = walkinAvailableSlots.find((s) => s.id === walkinSlotId)
    const target =
      existing ||
      walkinAvailableSlots.find((s) => (s.bookedCount || 0) < (s.maxCapacity || 5)) ||
      walkinAvailableSlots[0]
    if (target) {
      const range = `${target.startTime} - ${target.endTime}`
      if (walkinSlotId !== target.id) setWalkinSlotId(target.id)
      if (walkinSlotTime !== range) setWalkinSlotTime(range)
    }
  }, [walkinAvailableSlots])


  // Recalculate bill total amount when line items change
  useEffect(() => {
    if (billItems.length > 0) {
      const sum = billItems.reduce((acc, it) => acc + (it.price || 0) * (it.quantity || 1), 0)
      setBillTotalAmount(String(sum))
    }
  }, [billItems])

  // Load cities list when Settings desk tab is active
  useEffect(() => {
    if (deskTab === 'settings') {
      loadAdminCities()
    }
  }, [deskTab])

  const saveSession = (email: string, role: 'clinic_manager' | 'doctor' | 'lab_tech' = 'clinic_manager') => {
    setIsAuthenticated(true)
    setAuthEmail(email)
    setAuthRole(role)
    setCurrentView('operational_desk')
    try {
      localStorage.setItem('dactor_clinic_logged_in', 'true')
      localStorage.setItem('dactor_clinic_email', email)
      localStorage.setItem('dactor_clinic_role', role)
      localStorage.setItem('dactor_last_active_role', 'clinic_manager')
      localStorage.setItem('dactor_last_active_portal', 'portal')
      localStorage.removeItem('dactor_pending_verification')

      // Purge conflicting patient session keys to prevent Navbar role mismatch
      localStorage.removeItem('dactor_patient_logged_in')
      localStorage.removeItem('dactor_patient_session')
      localStorage.removeItem('dactor_patient_email')

      try {
        sessionStorage.removeItem('dactor_explicit_home')
        sessionStorage.removeItem('dactor_allow_home')
      } catch {}
      window.dispatchEvent(new Event('storage'))
    } catch {}
  }

  const resetToAuthChoice = () => {
    setIsAuthenticated(false)
    setAuthEmail(null)
    setPendingEntity(null)
    setCurrentView('auth_choice')
    try {
      localStorage.removeItem('dactor_clinic_logged_in')
      localStorage.removeItem('dactor_clinic_email')
      localStorage.removeItem('dactor_clinic_role')
      localStorage.removeItem('dactor_pending_verification')
      if (localStorage.getItem('dactor_last_active_role') === 'clinic_manager') {
        localStorage.removeItem('dactor_last_active_role')
        localStorage.removeItem('dactor_last_active_portal')
      }
      firebaseSignOut()
      window.dispatchEvent(new Event('storage'))
    } catch {}
  }

  const handleLogout = () => {
    resetToAuthChoice()
  }

  // Restore session from Google OAuth redirect or active Clinic session
  useEffect(() => {
    let isMounted = true
    async function initGoogleRedirectCheck() {
      // 1. Check if returning from genuine Google OAuth redirect intended for clinic
      const targetPortal =
        sessionStorage.getItem('dactor_oauth_target_portal') ||
        localStorage.getItem('dactor_oauth_target_portal')
      if (targetPortal === 'clinic') {
        const redirected = await checkRedirectGoogleUser({ requireRedirectOnly: true })
        if (!isMounted) return
        if (redirected && redirected.email) {
          sessionStorage.removeItem('dactor_oauth_target_portal')
          localStorage.removeItem('dactor_oauth_target_portal')
          await processLoginForEmail(redirected.email, 'clinic')
          return
        }
      }

      // 2. Check if already marked as logged in
      const isClinicAuth = localStorage.getItem('dactor_clinic_logged_in') === 'true'
      const savedEmail = (localStorage.getItem('dactor_clinic_email') || '').trim().toLowerCase()
      if (isClinicAuth && savedEmail && !isAuthenticated) {
        await processLoginForEmail(savedEmail, 'clinic')
      }
    }

    initGoogleRedirectCheck()

    // 3. Listen to reactive Firebase auth state changes ONLY when clinic Google sign-in was initiated
    const unsub = onFirebaseAuthStateChanged((u) => {
      const targetPortal =
        sessionStorage.getItem('dactor_oauth_target_portal') ||
        localStorage.getItem('dactor_oauth_target_portal')
      if (isMounted && u && u.email && !isAuthenticated && currentView === 'auth_choice' && targetPortal === 'clinic') {
        processLoginForEmail(u.email, 'clinic')
      }
    })

    return () => {
      isMounted = false
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  // 1. Process Login & Verification for Clinic Email (Strictly Clinic Portal Only)
  const processLoginForEmail = async (email: string, _roleTab: 'clinic' | 'doctor' = 'clinic') => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) return
    if (authInFlightEmail.current === trimmedEmail && isAuthenticated) return
    authInFlightEmail.current = trimmedEmail

    setFirebaseLoading(true)
    setFirebaseError(null)
    setVerifiedEmail(trimmedEmail)

    try {
      // Enforce 1 Google Account = 1 Portal Role rule
      const assoc = await checkEmailPortalAssociation(trimmedEmail)
      if (assoc && assoc.portal !== 'clinic') {
        await signOutFirebase().catch(() => {})
        setVerifiedEmail('')
        setCurrentView('auth_choice')
        const entitySuffix = assoc.entityName ? ` (${assoc.entityName})` : ''
        setFirebaseError(
          `This Google account (${trimmedEmail}) is already associated with a ${assoc.portalLabel} account${entitySuffix}. You cannot log in to the Clinic Portal with this Google ID. Please change your Google account.`
        )
        return
      }

      const existingClinic = await getClinicByEmail(trimmedEmail)
      if (existingClinic) {
        const vStatus = (existingClinic.verificationStatus || 'approved').toLowerCase()
        if (vStatus === 'approved' || vStatus === 'verified') {
          setSelectedClinic(existingClinic)
          saveSession(trimmedEmail, 'clinic_manager')
        } else {
          const pending = {
            email: trimmedEmail,
            role: 'clinic' as const,
            name: existingClinic.name,
            id: existingClinic.id,
            details: `${(existingClinic.type || 'Polyclinic').replace('_', ' ')} • PAN: ${existingClinic.panNumber || '9-Digit Record'} • ${existingClinic.addressText || 'Nepal'}`,
            status: vStatus,
          }
          setPendingEntity(pending)
          localStorage.setItem('dactor_pending_verification', JSON.stringify(pending))
          setCurrentView('pending_verification')
        }
      } else {
        // Unregistered clinic -> Open Clinic Registration Form! (Never prefill name from Google)
        setRegClinicName('')
        setRegClinicErrors({})
        setCurrentView('register_form')
      }
    } catch (err: any) {
      console.error('Error verifying clinic account:', err)
      setFirebaseError(err.message || 'Error communicating with database')
    } finally {
      setFirebaseLoading(false)
      authInFlightEmail.current = null
    }
  }

  // 2. Google Sign-In Trigger for Clinic Portal
  const handleGoogleSignInWithRole = async (_roleTab: 'clinic' | 'doctor' = 'clinic') => {
    if (isProcessingAuth.current) return
    isProcessingAuth.current = true
    setFirebaseLoading(true)
    setFirebaseError(null)
    try {
      // Clear any stale local auth state non-blocking to keep browser user-activation gesture fresh
      firebaseSignOut()
      const googleUser = await signInWithFirebaseGoogle('clinic')
      if (googleUser && googleUser.email) {
        await processLoginForEmail(googleUser.email, 'clinic')
      }
    } catch (err: any) {
      console.warn('Google Sign-In caught:', err)
      if (err?.message?.includes('cancelled')) {
        setFirebaseError('Google Sign-In was cancelled. Please try again.')
      } else {
        setFirebaseError(err?.message || 'Failed to sign in with Google. Please try again.')
      }
    } finally {
      setFirebaseLoading(false)
      isProcessingAuth.current = false
    }
  }

  // 3. Real-Time Status Verification Checker
  const checkVerificationStatus = async () => {
    if (!pendingEntity) return
    setCheckingVerification(true)
    setVerificationCheckMsg(null)
    try {
      const refreshed = pendingEntity.id
        ? await getClinicForPortalById(pendingEntity.id)
        : await getClinicByEmail(pendingEntity.email)
      if (refreshed) {
        const st = (refreshed.verificationStatus || 'pending').toLowerCase()
        if (st === 'approved' || st === 'verified') {
          setSelectedClinic(refreshed)
          saveSession(pendingEntity.email, 'clinic_manager')
          return
        } else {
          setPendingEntity({ ...pendingEntity, status: st })
          localStorage.setItem('dactor_pending_verification', JSON.stringify({ ...pendingEntity, status: st }))
          setVerificationCheckMsg('Status checked: Registration is still under administrative review.')
        }
      }
    } catch (err: any) {
      setVerificationCheckMsg(err.message || 'Failed to check verification status')
    } finally {
      setCheckingVerification(false)
    }
  }

  // Helper: Normalize Nepal mobile phone numbers by stripping +977, spaces, and formatting
  const normalizeNepalPhone = (raw: string): string => {
    let digits = (raw || '').replace(/\D/g, '')
    if (digits.startsWith('977') && digits.length > 10) {
      digits = digits.slice(3)
    }
    if (digits.startsWith('0') && digits.length === 11) {
      digits = digits.slice(1)
    }
    return digits.slice(0, 10)
  }

  // 4. Browser Geolocation GPS Detector with Mobile Resilience & Fallback (Brave Shield Safe)
  const handleBrowserGPS = () => {
    setGpsErrorFeedback(null)
    setGpsStatusFeedback(null)

    if (!navigator.geolocation) {
      setGpsErrorFeedback('Geolocation is not supported by your browser. Please choose a Nepal City Preset below.')
      return
    }

    if (
      typeof window !== 'undefined' &&
      window.isSecureContext === false &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setGpsErrorFeedback(
        'Browser Security Notice: Live GPS detection requires HTTPS. Please select your city from the Nepal City Presets below.'
      )
      return
    }

    setIsDetectingLocation(true)

    // Fast 3.5s high-accuracy attempt with automatic cellular/Wi-Fi low-accuracy fallback
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6))
        const lng = Number(pos.coords.longitude.toFixed(6))
        setRegClinicLat(lat)
        setRegClinicLng(lng)
        setSettingLat(lat)
        setSettingLng(lng)
        setIsDetectingLocation(false)
        setGpsStatusFeedback(`Live GPS detected: ${lat}, ${lng}`)
      },
      (firstErr) => {
        // Attempt 2 Fallback: Quick low-accuracy / network-assisted GPS (3s timeout)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = Number(pos.coords.latitude.toFixed(6))
            const lng = Number(pos.coords.longitude.toFixed(6))
            setRegClinicLat(lat)
            setRegClinicLng(lng)
            setSettingLat(lat)
            setSettingLng(lng)
            setIsDetectingLocation(false)
            setGpsStatusFeedback(`Live GPS detected: ${lat}, ${lng}`)
          },
          (secondErr) => {
            setIsDetectingLocation(false)
            console.warn('Geolocation fallback notice:', secondErr)
            if (secondErr.code === 1) {
              setGpsErrorFeedback('Location permission was denied. Tap any Nepal City Preset below to set clinic coordinates.')
            } else {
              setGpsErrorFeedback('Live GPS unavailable. Default coordinates set. Tap any Nepal City Preset below to adjust.')
            }
          },
          { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
        )
      },
      { timeout: 3500, enableHighAccuracy: true, maximumAge: 60000 }
    )
  }

  // 5. Submit Clinic Registration
  const submitClinicRegistration = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegSubmitError(null)
    const errors: { [key: string]: string } = {}
    if (regClinicName.trim().length < 2) errors.name = 'Clinic name must be at least 2 characters.'
    if (regClinicAddress.trim().length < 3) errors.address = 'Physical clinic address is required.'
    const cleanPan = regClinicPan.replace(/\D/g, '')
    if (cleanPan.length !== 9) errors.pan = 'PAN number must be exactly 9 digits.'
    // Strip optional +977 or 977 country code before validating 10-digit Nepal mobile number
    const cleanPhone = normalizeNepalPhone(regClinicPhone)
    if (cleanPhone.length !== 10 || !cleanPhone.startsWith('9')) errors.phone = 'Clinic phone must be 10 digits starting with 9.'
    const cleanMgr = normalizeNepalPhone(regManagerPhone)
    if (cleanMgr.length !== 10 || !cleanMgr.startsWith('9')) errors.managerPhone = 'Manager phone must be 10 digits starting with 9.'
    if (!regClinicTermsAccepted) errors.terms = 'You must accept the Regulatory Terms & Conditions to register.'
    if (regClinicPictures.length > 4) errors.pictures = 'Maximum 4 clinic pictures allowed.'

    if (Object.keys(errors).length > 0) {
      setRegClinicErrors(errors)
      return
    }

    setRegClinicErrors({})

    const effectiveClinicEmail = verifiedEmail.trim() || `clinic.${Date.now()}@dactor.health`
    if (!verifiedEmail.trim()) setVerifiedEmail(effectiveClinicEmail)

    setIsSubmittingRegistration(true)
    setRegistrationStatusMsg('Compressing documents and uploading securely...')

    try {
      let regDocUrl: string | undefined
      if (regClinicDocFile) {
        try {
          const compressed = await compressImage(regClinicDocFile, 300 * 1024)
          regDocUrl =
            (await uploadClinicDocument(`reg_${regClinicDocFile.name}`, compressed, 'clinic_registration_docs')) ||
            undefined
        } catch (docErr) {
          console.warn('Doc compression/upload notice:', docErr)
        }
      }

      const picUrls: string[] = []
      for (let i = 0; i < regClinicPictures.length; i++) {
        try {
          const pic = regClinicPictures[i]
          const compressed = await compressImage(pic, 300 * 1024)
          const u = await uploadClinicDocument(`pic_${i}_${pic.name}`, compressed, 'clinic_pictures')
          if (u) picUrls.push(u)
        } catch (picErr) {
          console.warn('Picture upload notice:', picErr)
        }
      }

      const newClinicPayload: Partial<Clinic> = {
        name: regClinicName.trim(),
        type: regClinicType,
        panNumber: cleanPan,
        contactPhone: cleanPhone,
        managerPhone: cleanMgr,
        contactEmail: effectiveClinicEmail,
        addressText: regClinicAddress.trim(),
        latitude: regClinicLat || 27.7052,
        longitude: regClinicLng || 85.3193,
        specialties: regClinicSpecialties,
        description: regClinicDesc.trim(),
        registrationDocUrl: regDocUrl,
        pictures: picUrls,
        verificationStatus: 'pending',
      }

      setRegistrationStatusMsg('Creating clinic record on secure network...')
      const created = await createClinic(newClinicPayload)
      if (!created) throw new Error('Failed to create clinic in database.')

      const pending = {
        email: effectiveClinicEmail,
        role: 'clinic' as const,
        name: created.name,
        id: created.id,
        details: `PAN: ${cleanPan} • ${(created.type || 'Polyclinic').replace('_', ' ')} • ${created.addressText}`,
        status: 'pending',
      }
      setSelectedClinic(created)
      setClinics((prev) => [created, ...prev])
      setPendingEntity(pending)
      localStorage.setItem('dactor_pending_verification', JSON.stringify(pending))
      setCurrentView('pending_verification')
    } catch (err: any) {
      console.error('Clinic registration error details:', err)
      const errDetail = err?.message || 'Failed to create clinic in database. Please verify your details.'
      setRegSubmitError(errDetail)
    } finally {
      setIsSubmittingRegistration(false)
      setRegistrationStatusMsg(null)
    }
  }

  // Master Doctor Presence Toggle (All Doctors Present / Off-Duty at once - DashboardScreen.kt)
  const handleToggleAllDoctorsPresence = async (makePresent: boolean) => {
    if (clinicDoctors.length === 0) return
    setUpdatingPresence(true)
    try {
      await Promise.all(clinicDoctors.map((d) => updateDoctorPresence(d.id, makePresent, selectedClinic?.id)))
      setClinicDoctors((prev) => prev.map((d) => ({ ...d, isInClinic: makePresent })))
      setDoctorInClinic(makePresent)
      if (selectedDoctor) {
        setSelectedDoctor({ ...selectedDoctor, isInClinic: makePresent })
      }
    } catch (err) {
      console.error('Error toggling all doctors presence:', err)
    } finally {
      setUpdatingPresence(false)
    }
  }

  // Clinical Remark Save Handler (QueueBoardScreen.kt & FutureAppointmentsScreen.kt)
  const handleOpenRemarkModal = (appt: Appointment) => {
    setRemarkTargetAppt(appt)
    setRemarkText(appt.notes || '')
    setRemarkModalOpen(true)
  }

  const handleSaveClinicalRemark = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!remarkTargetAppt) return
    setSavingRemark(true)
    try {
      const ok = await updateAppointmentNotes(remarkTargetAppt.id, remarkText)
      if (ok) {
        setAppointments((prev) =>
          prev.map((a) => (a.id === remarkTargetAppt.id ? { ...a, notes: remarkText.trim() } : a))
        )
        setRemarkModalOpen(false)
      }
    } finally {
      setSavingRemark(false)
    }
  }

  // Subscription Renewal & Instant Bypass Handlers (DashboardScreen.kt & ClinicSettingsScreen.kt)
  const handleRequestRenewalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClinic) return
    if (!renewalTxnRef.trim()) {
      alert('Please enter your payment transaction ID / reference.')
      return
    }
    setSubmittingRenewal(true)
    try {
      const amt = renewalPlan === '12_months' ? 15000 : 1500
      const ok = await requestClinicActivationRenewal(selectedClinic.id, renewalPlan, amt, renewalTxnRef.trim())
      if (ok) {
        alert('Renewal payment reference submitted to Dactor Admin for verification!')
        setShowRenewalModal(false)
        setRenewalTxnRef('')
      }
    } finally {
      setSubmittingRenewal(false)
    }
  }

  const handleInstantBypassSubscription = async () => {
    if (!selectedClinic) return
    setSubmittingRenewal(true)
    try {
      const amt = renewalPlan === '12_months' ? 15000 : 1500
      const ok = await completeClinicSubscriptionPayment(
        selectedClinic.id,
        renewalPlan,
        amt,
        `BYPASS-${Date.now()}`
      )
      if (ok) {
        const refreshed = await getClinicForPortalById(selectedClinic.id)
        if (refreshed) setSelectedClinic(refreshed)
        setShowRenewalModal(false)
        alert(`Subscription activated for ${renewalPlan === '12_months' ? '365 days' : '30 days'}!`)
      }
    } finally {
      setSubmittingRenewal(false)
    }
  }

  // 30-Day Archive Schedule & Restore Handlers (ClinicSettingsScreen.kt & DashboardScreen.kt)
  const handleScheduleClinicArchive = async () => {
    if (!selectedClinic) return
    const ok = await scheduleClinicDeletion(selectedClinic.id)
    if (ok) {
      const refreshed = await getClinicForPortalById(selectedClinic.id)
      if (refreshed) setSelectedClinic(refreshed)
      setShowDeleteArchiveModal(false)
    }
  }

  const handleCancelClinicArchive = async () => {
    if (!selectedClinic) return
    const ok = await cancelClinicDeletion(selectedClinic.id)
    if (ok) {
      const refreshed = await getClinicForPortalById(selectedClinic.id)
      if (refreshed) setSelectedClinic(refreshed)
      alert('Account deletion cancelled! Your clinic operational desk is restored.')
    }
  }

  // Admin Permanent Deletion Handler
  const handlePermanentDeleteClinic = async () => {
    if (!selectedClinic) return
    const confirmName = window.prompt(
      `⚠️ ADMIN PERMANENT PURGE:\nThis will permanently delete "${selectedClinic.name}", its doctors, appointments, slots, and services from the database.\n\nType "${selectedClinic.name}" to confirm:`
    )
    if (confirmName !== selectedClinic.name) {
      if (confirmName !== null) alert('Clinic name did not match. Deletion aborted.')
      return
    }

    setIsDeletingPermanently(true)
    try {
      const ok = await deleteClinicPermanently(selectedClinic.id)
      if (ok) {
        alert(`Clinic "${selectedClinic.name}" has been permanently purged.`)
        setSelectedClinic(null)
        setShowDeleteArchiveModal(false)
        const refreshedList = await getClinics()
        setClinics(refreshedList)
      } else {
        alert('Failed to permanently delete clinic. Please verify permissions.')
      }
    } catch (e: any) {
      alert(`Error during permanent deletion: ${e?.message || e}`)
    } finally {
      setIsDeletingPermanently(false)
    }
  }

  // Slot -30m / +30m & Capacity Update Handlers (SlotManagerScreen.kt)
  const adjustSlotEndTimeByMinutes = async (slot: Slot, deltaMinutes: number) => {
    try {
      const startMins = parseTimeToMinutes(slot.startTime)
      const endMins = parseTimeToMinutes(slot.endTime || slot.startTime)
      if (deltaMinutes < 0 && endMins - startMins <= Math.abs(deltaMinutes)) {
        await handleDeleteSlot(slot.id)
        return
      }
      const newEndStr = formatMinutesTo12h(endMins + deltaMinutes)
      const ok = await updateSlot(slot.id, { endTime: newEndStr })
      if (ok) {
        setPublishedSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, endTime: newEndStr } : s)))
      }
    } catch {}
  }

  const handleSubtract30MinsFromSlot = (slot: Slot) => adjustSlotEndTimeByMinutes(slot, -30)
  const handleAdd30MinsToSlot = (slot: Slot) => adjustSlotEndTimeByMinutes(slot, 30)

  const handleSaveSlotCapacityUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSlotCapacity) return
    const ok = await updateSlot(editingSlotCapacity.id, { maxCapacity: newSlotCapacityVal })
    if (ok) {
      setPublishedSlots((prev) =>
        prev.map((s) => (s.id === editingSlotCapacity.id ? { ...s, maxCapacity: newSlotCapacityVal } : s))
      )
      setEditingSlotCapacity(null)
    }
  }

  // Consultation Fee Manager Handler (ConsultationFeeManagerScreen.kt)
  const handleSaveDoctorFee = async (doc: Doctor, newFee: number) => {
    setSavingDocFeeId(doc.id)
    try {
      const ok = await updateDoctor(doc.id, { consultationFee: newFee })
      if (ok) {
        setClinicDoctors((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, consultationFee: newFee } : d))
        )
        if (selectedDoctor?.id === doc.id) {
          setSelectedDoctor({ ...selectedDoctor, consultationFee: newFee })
        }
        alert(`Consultation fee for ${doc.fullName} updated to Rs. ${newFee}!`)
      }
    } finally {
      setSavingDocFeeId(null)
    }
  }

  // Staff & Doctor Invitations Handlers (InvitationManagerScreen.kt)
  const handleSendCustomStaffInvitation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClinic || !customInviteEmail.trim() || !customInviteName.trim()) return
    const created = await sendClinicInvitation({
      clinicId: selectedClinic.id,
      clinicName: selectedClinic.name,
      invitedEmail: customInviteEmail.trim(),
      invitedName: customInviteName.trim(),
      role: customInviteRole,
    })
    if (created) {
      setClinicInvitations((prev) => [created, ...prev])
      setCustomInviteEmail('')
      setCustomInviteName('')
      alert(`Invitation sent to ${created.invitedName} (${created.invitedEmail})!`)
    }
  }

  const handleSendDoctorInvitation = async (doc: Doctor) => {
    if (!selectedClinic) return
    const role: 'doctor' | 'lab_technician' =
      doc.practitionerRole === 'lab_technician' || doc.isLabTechnician ? 'lab_technician' : 'doctor'
    const created = await sendClinicInvitation({
      clinicId: selectedClinic.id,
      clinicName: selectedClinic.name,
      doctorId: doc.id,
      invitedEmail: doc.email || `${doc.id}@dactor.health`,
      invitedName: doc.fullName,
      role,
      specialty: doc.specialty,
    })
    if (created) {
      setClinicInvitations((prev) => [created, ...prev.filter((i) => i.id !== created.id)])
      alert(`✓ Invitation sent directly to ${doc.fullName}'s account!`)
    } else {
      alert('Failed to send invitation. Please try again.')
    }
  }

  const handleCancelStaffInvitation = async (invId: string) => {
    if (!selectedClinic) return
    const ok = await cancelClinicInvitation(invId, selectedClinic.id)
    if (ok) {
      setClinicInvitations((prev) => prev.filter((i) => i.id !== invId))
    }
  }

  const handleSettingsGPS = handleBrowserGPS

  // Lab Report Privacy Verification Gate Handler (LabWorkflowScreen.kt)
  const handleVerifyAndOpenLabReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!labVerifyTargetReport) return
    const q = labVerifyInput.trim().toLowerCase()
    const pName = (labVerifyTargetReport.appt.patientName || '').trim().toLowerCase()
    const pPhone = (labVerifyTargetReport.appt.patientMobile || '').replace(/\D/g, '')
    const qDigits = q.replace(/\D/g, '')

    const isMatch =
      (q.length >= 2 && pName.includes(q)) ||
      (qDigits.length >= 6 && pPhone.includes(qDigits))

    if (!isMatch) {
      setLabVerifyError('Verification failed. Please enter the matching patient name or registered phone number.')
      return
    }

    const rawUrl = labVerifyTargetReport.report.reportFileUrl
    let url = rawUrl
    if (url && (url.startsWith('http://') || url.startsWith('https://')) && !url.includes('/storage/v1/object/public/')) {
      // already a full url or signed url
    } else if (rawUrl || labVerifyTargetReport.report.id) {
      const signed = await requestAuthorizedDocumentUrl(
        'lab_report',
        labVerifyTargetReport.report.id,
        rawUrl || ''
      )
      if (signed) {
        url = signed
      }
    }

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      alert(
        `Verified! Report: ${labVerifyTargetReport.report.testName}\nStatus: ${labVerifyTargetReport.report.status}\nNotes: ${labVerifyTargetReport.report.technicianNotes || 'Normal parameters.'}`
      )
    }
    setLabVerifyTargetReport(null)
    setLabVerifyInput('')
    setLabVerifyError(null)
  }

  // Doctor In-Clinic Presence Toggle
  const handleToggleDoctorPresence = async (doc = selectedDoctor) => {
    if (!doc) return
    setUpdatingPresence(true)
    const newStatus = !(doc.isInClinic ?? true)
    try {
      const ok = await updateDoctorPresence(doc.id, newStatus, selectedClinic?.id)
      if (ok) {
        setDoctorInClinic(newStatus)
        setClinicDoctors((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, isInClinic: newStatus } : d))
        )
        if (selectedDoctor?.id === doc.id) {
          setSelectedDoctor({ ...selectedDoctor, isInClinic: newStatus })
        }
      }
    } catch (err) {
      console.error('Error toggling doctor presence:', err)
    } finally {
      setUpdatingPresence(false)
    }
  }

  // Clinic Break Toggle
  const handleToggleClinicBreak = async () => {
    if (!selectedClinic) return
    setUpdatingBreak(true)
    const newBreak = !clinicOnBreak
    try {
      const ok = await updateClinicBreak(selectedClinic.id, newBreak)
      if (ok) {
        setClinicOnBreak(newBreak)
        setSelectedClinic({ ...selectedClinic, isOnBreak: newBreak })
      }
    } catch (err) {
      console.error('Error toggling clinic break:', err)
    } finally {
      setUpdatingBreak(false)
    }
  }

  // Average Consultation Time Mode Save
  const handleSaveAvgTimeSettings = async () => {
    if (!selectedClinic) return
    setSavingAvgTime(true)
    try {
      const ok = await updateClinic(selectedClinic.id, {
        avgTimeMode,
        manualAvgConsultationTimeMinutes: manualAvgMinutes,
      })
      if (ok) {
        setSelectedClinic({
          ...selectedClinic,
          avgTimeMode,
          manualAvgConsultationTimeMinutes: manualAvgMinutes,
        })
        alert('Average consultation time settings saved successfully!')
      }
    } catch (err) {
      console.error('Error saving avg time:', err)
    } finally {
      setSavingAvgTime(false)
    }
  }

  // Declare Holiday Toggle for Future Appointments
  const handleToggleHolidayForDate = async (dateStr: string) => {
    if (!selectedClinic) return
    setTogglingHoliday(true)
    const isCurrentlyHoliday = selectedClinic.declaredHolidays?.includes(dateStr) ?? false
    const newHolidayState = !isCurrentlyHoliday
    try {
      const ok = await toggleClinicHoliday(selectedClinic.id, dateStr, newHolidayState)
      if (ok) {
        const updatedHolidays = newHolidayState
          ? [...(selectedClinic.declaredHolidays || []), dateStr]
          : (selectedClinic.declaredHolidays || []).filter((d) => d !== dateStr)
        setSelectedClinic({ ...selectedClinic, declaredHolidays: updatedHolidays })
      }
    } catch (err) {
      console.error('Error toggling clinic holiday:', err)
    } finally {
      setTogglingHoliday(false)
    }
  }

  // Save Weekly Working & Break Schedule
  const handleSaveWeeklySchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClinic) return
    setSavingSchedule(true)
    try {
      const ok = await saveWeeklySchedule(selectedClinic.id, weeklySchedule)
      if (ok) {
        setSelectedClinic({
          ...selectedClinic,
          weeklyScheduleJson: JSON.stringify(weeklySchedule),
        })
        setScheduleSaveSuccess(true)
        setTimeout(() => setScheduleSaveSuccess(false), 3500)
      }
    } catch (err) {
      console.error('Error saving schedule:', err)
    } finally {
      setSavingSchedule(false)
    }
  }

  const handleCopyMonHoursToAll = () => {
    const monday = weeklySchedule.find((s) => s.day === 'Monday')
    if (!monday) return
    setWeeklySchedule((prev) =>
      prev.map((s) =>
        s.day === 'Saturday' || s.day === 'Sunday'
          ? s
          : { ...s, openTime: monday.openTime, closeTime: monday.closeTime, breakStart: monday.breakStart, breakEnd: monday.breakEnd, hasBreak: monday.hasBreak }
      )
    )
  }

  // Push Alert Modal Trigger
  const handleOpenPushAlertModal = (appt: Appointment) => {
    if (!selectedClinic) return
    setPushAlertTargetAppt(appt)
    const estimate = calculateLiveQueueTimingEstimate(
      appt,
      appointments,
      selectedClinic,
      selectedDoctor
    )

    setPushAlertLeftVal(estimate.estimatedWait)
    setPushAlertRightVal(estimate.exactTimeStr)
    setPushAlertTitle(`Token #${appt.trackingCode10Digit}: Live OPD Queue Alert`)
    setPushAlertMessage(
      `Dear ${appt.patientName}, doctor is ready for consultation. Please proceed to Cabin 1.`
    )
    setPushAlertModalOpen(true)
    setPushAlertSentSuccess(false)
  }

  const handleSendPushAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pushAlertTargetAppt || !selectedClinic) return
    setSendingPushAlert(true)
    try {
      const ok = await sendManualNotification(
        pushAlertTargetAppt.id,
        pushAlertTitle.trim(),
        pushAlertMessage.trim(),
        pushAlertLeftVal,
        pushAlertRightVal,
        pushAlertTargetAppt.trackingCode10Digit,
        pushAlertTargetAppt.userId || undefined,
        selectedClinic.id
      )

      if (ok) {
        setPushAlertSentSuccess(true)
        setTimeout(() => {
          setPushAlertModalOpen(false)
          setPushAlertSentSuccess(false)
        }, 1500)
      }
    } catch (err) {
      console.error('Error sending push alert:', err)
    } finally {
      setSendingPushAlert(false)
    }
  }


  // Doctor onboarding form validation
  const validateDoctorOnboarding = () => {
    const errors: { [key: string]: string } = {}
    if (!docName.trim()) {
      errors.name = 'Doctor / Practitioner full name is required.'
    }
    if (!docMobile.trim() || docMobile.replace(/\D/g, '').length < 8) {
      errors.mobile = 'Valid contact mobile number is required.'
    }
    if (!docLicense.trim()) {
      errors.license = 'Medical council license number is required.'
    }

    setOnboardingErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateDoctorOnboarding() || !selectedClinic) return

    setLoading(true)
    try {
      const created = await createDoctor({
        clinicId: selectedClinic.id,
        fullName: docName.trim(),
        specialty: docSpecialty,
        education: docEducation,
        nmcLicenseNumber: docLicense.trim(),
        startingPracticingYear: docStartingYear,
        personalMobileNumber: docMobile.trim(),
        consultationFee: docFee,
        practitionerRole: docRole,
        isLabTechnician: docRole === 'lab_technician',
        isInClinic: true,
      })

      if (created) {
        setClinicDoctors([...clinicDoctors, created])
        setShowDoctorOnboarding(false)
        setDocName('')
        setDocLicense('')
        setDocMobile('')
        alert('Doctor / Practitioner successfully registered!')
      }
    } catch (err) {
      console.error('Error saving doctor:', err)
    } finally {
      setLoading(false)
    }
  }

  // Walk-in booking submit (Offline-First with Collision-Proof Tracking Code)
  const handleWalkinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors: { [key: string]: string } = {}
    if (!walkinName.trim()) errors.name = 'Patient name is required.'
    if (!walkinAge || Number(walkinAge) <= 0) errors.age = 'Valid age is required.'
    if (walkinMobile.trim() && walkinMobile.replace(/\D/g, '').length < 8) {
      errors.mobile = 'Mobile number must be 8-10 digits if provided.'
    }
    if (isLabClinic && walkinSelectedTests.length === 0) {
      errors.tests = 'Please select at least one diagnostic lab test.'
    }
    if (!walkinSlotId) {
      errors.slot = isLabClinic
        ? 'Please select a published lab collection time slot.'
        : 'Please select a published OPD time slot.'
    } else {
      const now = new Date()
      const localTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const targetWalkinDate = walkinDate || todayStr
      const chosenSlotObj = walkinAvailableSlots.find((s) => s.id === walkinSlotId)
      if (
        targetWalkinDate < todayStr ||
        (chosenSlotObj &&
          targetWalkinDate === todayStr &&
          isSlotTimeExpired(localTodayStr, chosenSlotObj.endTime || chosenSlotObj.startTime, chosenSlotObj.startTime))
      ) {
        errors.slot = `Selected slot (${chosenSlotObj ? `${chosenSlotObj.startTime} - ${chosenSlotObj.endTime}` : walkinSlotTime}) has already ended. Please select an active slot.`
      }
    }

    setWalkinErrors(errors)
    if (Object.keys(errors).length > 0 || !selectedClinic) return

    try {
      const code10 = generateTrackingCode()

      const labFee = walkinSelectedTests.reduce((acc, t) => acc + (t.price || 0), 0)
      const assignedDoc = clinicDoctors.find((d) => d.id === walkinDoctorId) || clinicDoctors[0]
      const docFee = assignedDoc?.consultationFee || 500
      const isFreeFollowup = walkinIsFollowup && walkinRetainedAppt
      const finalFee = isLabClinic ? labFee : isFreeFollowup ? 0 : docFee

      const walkinNotes = isLabClinic
        ? 'Walk-In Diagnostic Lab Sample Registration'
        : isFreeFollowup
        ? `Walk-In Free Follow-Up Visit (Previous Token #${walkinRetainedAppt.trackingCode10Digit})`
        : 'Walk-In Reception Registration'

      const rawTime = walkinSlotTime.trim()
      const apptDate = walkinDate || new Date().toISOString().split('T')[0]
      const apptId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'appt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
      const queueId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'q_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)

      // Calculate queue position
      const todayWaitingAppts = appointments.filter((a) => a.appointmentDate === apptDate && a.checkinStatus === 'waiting')
      const queuePos = todayWaitingAppts.length + 1

      const localAppt: Appointment = {
        id: apptId,
        clinicId: selectedClinic.id,
        doctorId: isLabClinic ? undefined : (walkinDoctorId || clinicDoctors[0]?.id || undefined),
        doctor: assignedDoc,
        clinic: selectedClinic,
        trackingCode10Digit: code10,
        patientName: walkinName.trim(),
        patientAge: Number(walkinAge) || 25,
        patientGender: walkinGender || 'Other',
        patientMobile: walkinMobile.trim() || '9800000000',
        patientEmail: walkinEmail.trim() || undefined,
        appointmentDate: apptDate,
        appointmentTime: rawTime,
        slotId: walkinSlotId || undefined,
        checkinStatus: 'waiting',
        paymentStatus: 'paid',
        feeAmount: finalFee,
        notes: walkinNotes,
        selectedTests: isLabClinic ? walkinSelectedTests.map((t) => t.serviceName) : [],
        queuePosition: queuePos,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const localQueueEntry = {
        id: queueId,
        appointment_id: apptId,
        clinic_id: selectedClinic.id,
        doctor_id: localAppt.doctorId || null,
        status: 'waiting',
        token_number: code10,
        queue_position: queuePos,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // 1. Instant local IndexedDB persistence
      try {
        await putRecord('appointments', {
          id: apptId,
          clinic_id: selectedClinic.id,
          doctor_id: localAppt.doctorId,
          date: apptDate,
          appointment_date: apptDate,
          checkin_status: 'waiting',
          tracking_code: code10,
          tracking_code_10_digit: code10,
          patient_name: localAppt.patientName,
          patient_phone: localAppt.patientMobile,
          patient_mobile: localAppt.patientMobile,
          patient_age: localAppt.patientAge,
          patient_gender: localAppt.patientGender,
          appointment_time: rawTime,
          slot_id: walkinSlotId || null,
          fee_amount: finalFee,
          payment_status: 'paid',
          notes: walkinNotes,
          queue_position: queuePos,
          created_at: localAppt.createdAt,
          updated_at: localAppt.updatedAt,
        })
        await putRecord('opd_queue', localQueueEntry)
        await queueMutation({
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'mut_' + Date.now(),
          table: 'appointments',
          action: 'UPSERT',
          clinicId: selectedClinic.id,
          entityId: apptId,
          payload: {
            id: apptId,
            clinic_id: selectedClinic.id,
            doctor_id: localAppt.doctorId,
            tracking_code_10_digit: code10,
            patient_name: localAppt.patientName,
            patient_age: localAppt.patientAge,
            patient_gender: localAppt.patientGender,
            patient_mobile: localAppt.patientMobile,
            patient_email: localAppt.patientEmail,
            appointment_date: apptDate,
            appointment_time: rawTime,
            slot_id: walkinSlotId || null,
            checkin_status: 'waiting',
            payment_status: 'paid',
            fee_amount: finalFee,
            notes: walkinNotes,
            selected_tests: localAppt.selectedTests,
          },
          timestamp: Date.now(),
          retryCount: 0,
          status: 'pending',
        })
        await queueMutation({
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'mut_q_' + Date.now(),
          table: 'queue_entries',
          action: 'UPSERT',
          clinicId: selectedClinic.id,
          entityId: queueId,
          payload: localQueueEntry,
          timestamp: Date.now(),
          retryCount: 0,
          status: 'pending',
        })
      } catch (idbErr) {
        console.warn('Local IndexedDB walk-in save error:', idbErr)
      }

      // 2. Optimistic UI State Update (Zero Delay)
      const submittedSlotId = walkinSlotId
      setAppointments((prev) => [localAppt, ...prev])
      setWalkinSuccessCode(code10)
      setPrintSlipAppt(localAppt)
      setWalkinName('')
      setWalkinAge('')
      setWalkinMobile('')
      setWalkinEmail('')
      setWalkinSlotTime('')
      setWalkinSlotId('')
      if (submittedSlotId) {
        setWalkinAvailableSlots((prev) =>
          prev.map((s) =>
            s.id === submittedSlotId ? { ...s, bookedCount: (s.bookedCount || 0) + 1 } : s
          )
        )
      }
      setWalkinSelectedTests([])
      setWalkinIsFollowup(false)
      setWalkinFollowupCode('')
      setWalkinRetainedAppt(null)

      // 3. Background cloud sync if online
      if (typeof navigator === 'undefined' || navigator.onLine) {
        createAppointment({
          clinicId: selectedClinic.id,
          doctorId: isLabClinic ? undefined : (walkinDoctorId || clinicDoctors[0]?.id || undefined),
          trackingCode10Digit: code10,
          patientName: localAppt.patientName,
          patientAge: localAppt.patientAge,
          patientGender: localAppt.patientGender,
          patientMobile: localAppt.patientMobile,
          patientEmail: localAppt.patientEmail,
          appointmentDate: apptDate,
          appointmentTime: rawTime,
          slotId: submittedSlotId || undefined,
          checkinStatus: 'waiting',
          paymentStatus: 'paid',
          feeAmount: finalFee,
          notes: walkinNotes,
          isWalkin: true,
          selectedTests: isLabClinic ? walkinSelectedTests.map((t) => t.serviceName) : [],
        }).then((created) => {
          if (created) {
            setPrintSlipAppt(created)
            setRefreshKey((k) => k + 1)
          }
        }).catch((err) => {
          console.warn('Background Supabase appointment create failed, queued offline:', err)
        })
        triggerSync().catch(() => {})
      }
    } catch (err) {
      console.error('Error creating walkin:', err)
    }
  }

  // Diagnostic Lab Processing Transfer Handler
  const handleMarkDiagnosticProcessing = async (appt: Appointment) => {
    try {
      const testNameStr =
        appt.selectedTests?.join(', ') ||
        (typeof appt.selectedLabTests === 'string' ? appt.selectedLabTests : '') ||
        'Diagnostic Report'

      // Optimistic React + IndexedDB state update
      const nowIso = new Date().toISOString()
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appt.id
            ? { ...a, checkinStatus: 'processing' as any, updatedAt: nowIso }
            : a
        )
      )
      try {
        const existing = await getRecord<any>('appointments', appt.id)
        if (existing) {
          await putRecord('appointments', { ...existing, checkin_status: 'processing', updated_at: nowIso })
        }
        const qEntries = await getStore<any>('opd_queue')
        const matchedQ = qEntries.find((q: any) => q.appointment_id === appt.id || q.id === appt.id)
        if (matchedQ) {
          await putRecord('opd_queue', { ...matchedQ, status: 'processing', updated_at: nowIso })
        }
      } catch (idbErr) {
        console.warn('Local IndexedDB processing update warning:', idbErr)
      }

      const ok = await transitionDiagnosticToProcessing(appt.id, testNameStr)
      let saved: LabReport | null = null
      if (selectedClinic) {
        saved = await saveLabReport({
          appointmentId: appt.id,
          clinicId: selectedClinic.id,
          trackingCode10Digit: appt.trackingCode10Digit,
          patientName: appt.patientName,
          testName: testNameStr,
          status: 'processing',
        })
        if (saved) {
          setLabReports((prev) => [
            saved!,
            ...prev.filter((r) => r.appointmentId !== appt.id && r.id !== saved!.id),
          ])
        }
      }
      if (ok || saved) {
        setRefreshKey((k) => k + 1)
        alert(`✓ ${appt.patientName} added to Processing section! Mark report prepared in Processing / Diagnostic Lab Pipeline.`)
      } else {
        setRefreshKey((k) => k + 1)
        alert(`Unable to transfer ${appt.patientName} to Processing. Please check your connection/permissions and try again.`)
      }
    } catch (err) {
      console.error('Error transitioning to processing:', err)
    }
  }

  // Update Queue Status (Offline-First with Instant Persistence and Chime)
  const handleStatusChange = async (appointmentId: string, newStatus: string) => {
    // Play chime immediately on cabin call
    if (newStatus === 'in_consultation') {
      try {
        playClinicChime()
      } catch {}
    }

    // Optimistic UI state update
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === appointmentId
          ? { ...a, checkinStatus: newStatus as any, updatedAt: new Date().toISOString() }
          : a
      )
    )

    // Local IndexedDB update & Outbox queuing
    try {
      const existing = await getRecord<any>('appointments', appointmentId)
      if (existing) {
        await putRecord('appointments', {
          ...existing,
          checkin_status: newStatus,
          updated_at: new Date().toISOString(),
        })
      }
      const qEntries = await getStore<any>('opd_queue')
      const matchedQ = qEntries.find(
        (q: any) => q.appointment_id === appointmentId || q.id === appointmentId
      )
      if (matchedQ) {
        const qStatus =
          newStatus === 'in_consultation'
            ? 'inside'
            : newStatus === 'completed'
            ? 'done'
            : newStatus
        await putRecord('opd_queue', {
          ...matchedQ,
          status: qStatus,
          updated_at: new Date().toISOString(),
        })
      }
      await queueMutation({
        id: (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'mut_status_' + Date.now(),
        table: 'appointments',
        action: 'UPDATE',
        clinicId: selectedClinic?.id,
        entityId: appointmentId,
        payload: { id: appointmentId, checkin_status: newStatus, updated_at: new Date().toISOString() },
        timestamp: Date.now(),
        retryCount: 0,
        status: 'pending',
      })
    } catch (idbErr) {
      console.warn('Local IndexedDB queue status update error:', idbErr)
    }

    // Cloud update if online
    try {
      const ok = await updateAppointmentStatus(appointmentId, newStatus)
      if (ok) {
        if (selectedClinic && (newStatus === 'in_consultation' || newStatus === 'completed' || newStatus === 'processing')) {
          checkAndNotifyApproachingPatients(selectedClinic.id, settingThreshold || 2).catch(() => {})
        }
      }
      triggerSync().catch(() => {})
    } catch (err) {
      console.warn('Cloud queue status update deferred to sync manager:', err)
    }
  }

  // Queue Sliding (Reordering / ranking / emergency priority)
  const handleQueueReorder = async (apptId: string, direction: 'up' | 'down' | 'top') => {
    if (!selectedClinic) return
    const res = await reorderQueuePosition(selectedClinic.id, apptId, direction)
    if (res.success) {
      setRefreshKey((k) => k + 1)
    } else {
      alert(res.message || 'Unable to reorder queue position')
    }
  }

  // Shift Appointment Modal Handlers
  const handleOpenShiftModal = (appt: Appointment) => {
    if (
      appt.checkinStatus === 'completed' ||
      appt.checkinStatus === 'done' ||
      appt.checkinStatus === 'report_prepared' ||
      appt.checkinStatus === 'processing'
    ) {
      alert('Completed or processing visits cannot be shifted. Please schedule a new follow-up visit.')
      return
    }
    setShiftTargetAppt(appt)
    const d = new Date()
    d.setDate(d.getDate() + 1)
    setShiftNewDate(d.toISOString().split('T')[0])
    setShiftNewTime(appt.appointmentTime || '09:00 AM')
    setShiftReason('')
    setShiftModalOpen(true)
  }

  const handleShiftAppointmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!shiftTargetAppt) return
    setShiftingAppointment(true)
    try {
      const ok = await shiftAppointmentDate(
        shiftTargetAppt.id,
        shiftNewDate,
        shiftNewTime,
        shiftReason
      )
      if (ok) {
        setShiftModalOpen(false)
        setRefreshKey((k) => k + 1)
        alert(`Appointment for ${shiftTargetAppt.patientName} has been shifted to ${shiftNewDate} (${shiftNewTime})!`)
      } else {
        alert('Failed to shift appointment date.')
      }
    } catch (err) {
      console.error('Error shifting appointment:', err)
    } finally {
      setShiftingAppointment(false)
    }
  }

  // Auto-Notify Threshold Alert Trigger
  const handleTriggerAutoNotify = async () => {
    if (!selectedClinic) return
    await checkAndNotifyApproachingPatients(selectedClinic.id, settingThreshold || 2)
    alert(`Auto-notification alerts dispatched to waiting patients who have ≤ ${settingThreshold || 2} people ahead in line!`)
  }

  // Open Printable Token Slip
  const handleOpenPrintSlip = (appt: Appointment) => {
    setPrintSlipAppt(appt)
    setShowPrintTokenSlip(true)
  }

  // Slot Publishing Handlers
  const handlePublishSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClinic || !slotDate || !slotStartTime || (!isLabClinic && clinicDoctors.length > 0 && !slotDoctorId)) {
      alert(isLabClinic || clinicDoctors.length === 0 ? 'Please select date and start time' : 'Please select doctor, date, and start time')
      return
    }
    const startMins = parseTimeToMinutes(slotStartTime)
    const endMins = parseTimeToMinutes(slotEndTime || slotStartTime)
    if (endMins <= startMins) {
      alert('End time must be later than start time.')
      return
    }
    setPublishingSlot(true)
    try {
      const targetDoctorId = isLabClinic ? undefined : (slotDoctorId || undefined)
      const newSlot = await createSlot({
        clinicId: selectedClinic.id,
        doctorId: targetDoctorId,
        slotDate: slotDate,
        startTime: slotStartTime.trim(),
        endTime: (slotEndTime || slotStartTime).trim(),
        maxCapacity: Math.max(1, Number(slotCapacity) || (isLabClinic ? 25 : 10)),
        bookedCount: 0,
        isPublished: true,
      })
      if (newSlot) {
        setPublishedSlots((prev) => [...prev, newSlot])
        setRefreshKey((k) => k + 1)
        alert(`Slot ${slotStartTime} - ${slotEndTime} published successfully!`)
      } else {
        alert('Failed to publish slot.')
      }
    } catch (err) {
      console.error('Error publishing slot:', err)
    } finally {
      setPublishingSlot(false)
    }
  }

  const handlePublishLabCollectionWindow = async (startLabel: string, endLabel: string) => {
    if (!selectedClinic || !slotDate) {
      alert('Please select date first')
      return
    }
    setPublishingSlot(true)
    try {
      const newSlot = await createSlot({
        clinicId: selectedClinic.id,
        doctorId: undefined,
        slotDate: slotDate,
        startTime: startLabel,
        endTime: endLabel,
        maxCapacity: Math.max(1, Number(slotCapacity) || 25),
        bookedCount: 0,
        isPublished: true,
      })
      if (newSlot) {
        setPublishedSlots((prev) => [...prev, newSlot])
        setRefreshKey((k) => k + 1)
        alert(`Sample collection window ${startLabel} - ${endLabel} published for ${slotDate}!`)
      } else {
        alert('Failed to publish collection window.')
      }
    } catch (err) {
      console.error('Error publishing collection window:', err)
    } finally {
      setPublishingSlot(false)
    }
  }

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm('Are you sure you want to delete this time slot?')) return
    const ok = await deleteSlot(slotId)
    if (ok) {
      setPublishedSlots((prev) => prev.filter((s) => s.id !== slotId))
      setRefreshKey((k) => k + 1)
    } else {
      alert('Failed to delete slot.')
    }
  }

  const handleGenerateBulkSlots = async (startH: number, endH: number, intervalMinutes: number) => {
    if (!selectedClinic || !slotDate || (!isLabClinic && clinicDoctors.length > 0 && !slotDoctorId)) {
      alert(isLabClinic || clinicDoctors.length === 0 ? 'Please select date first' : 'Please select doctor and date first')
      return
    }
    setPublishingSlot(true)
    try {
      const targetDoctorId = isLabClinic ? undefined : (slotDoctorId || undefined)
      const slotsToCreate: Partial<Slot>[] = []
      for (let h = startH; h < endH; h++) {
        for (let m = 0; m < 60; m += intervalMinutes) {
          const sH12 = h > 12 ? h - 12 : (h === 0 ? 12 : h)
          const sAmpm = h >= 12 ? 'PM' : 'AM'
          const sTime = `${String(sH12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${sAmpm}`

          let nextM = m + intervalMinutes
          let nextH = h
          if (nextM >= 60) {
            nextM -= 60
            nextH += 1
          }
          const eH12 = nextH > 12 ? nextH - 12 : (nextH === 0 ? 12 : nextH)
          const eAmpm = nextH >= 12 ? 'PM' : 'AM'
          const eTime = `${String(eH12).padStart(2, '0')}:${String(nextM).padStart(2, '0')} ${eAmpm}`

          slotsToCreate.push({
            clinicId: selectedClinic.id,
            doctorId: targetDoctorId,
            slotDate: slotDate,
            startTime: sTime,
            endTime: eTime,
            maxCapacity: Math.max(1, Number(slotCapacity) || (isLabClinic ? 25 : 10)),
            bookedCount: 0,
            isPublished: true,
          })
        }
      }
      const created = await createSlotsBatch(slotsToCreate)
      setRefreshKey((k) => k + 1)
      alert(`Published ${created.length || slotsToCreate.length} slots for ${slotDate}!`)
    } catch (err) {
      console.error('Error generating bulk slots:', err)
    } finally {
      setPublishingSlot(false)
    }
  }

  // Billing Item Catalog Handlers
  const handleAddCatalogItemToBill = (item: { serviceName: string; price: number }) => {
    const newItem = {
      id: crypto.randomUUID(),
      name: item.serviceName,
      price: item.price,
      quantity: 1,
    }
    setBillItems((prev) => {
      const next = [...prev, newItem]
      const nextTotal = next.reduce((sum, it) => sum + it.price * (it.quantity || 1), 0)
      setBillTotalAmount(String(nextTotal))
      return next
    })
  }

  const handleRemoveBillItem = (id: string) => {
    setBillItems((prev) => {
      const next = prev.filter((it) => it.id !== id)
      const nextTotal = next.reduce((sum, it) => sum + it.price * (it.quantity || 1), 0)
      setBillTotalAmount(String(nextTotal))
      return next
    })
  }

  const handleAddCustomBillItem = () => {
    if (!customBillItemName.trim() || !customBillItemPrice) return
    const newItem = {
      id: crypto.randomUUID(),
      name: customBillItemName.trim(),
      price: Number(customBillItemPrice) || 0,
      quantity: 1,
    }
    setBillItems((prev) => {
      const next = [...prev, newItem]
      const nextTotal = next.reduce((sum, it) => sum + it.price * (it.quantity || 1), 0)
      setBillTotalAmount(String(nextTotal))
      return next
    })
    setCustomBillItemName('')
    setCustomBillItemPrice('')
  }

  const handleRemovePaymentRecord = (recordId: string) => {
    setBillPaymentRecords((prev) => {
      const next = prev.filter((r) => r.id !== recordId)
      const nextPaid = next.reduce((sum, r) => sum + r.amount, 0)
      setBillPaidAmount(String(nextPaid))
      return next
    })
  }

  // Bill / Payment Modal
  const handleOpenBillModal = async (appt: Appointment) => {
    setBillTargetAppt(appt)
    setBillReceiptFile(null)
    setBillReceiptCompressionInfo(null)
    setShowPrintableInvoice(false)
    setBillNewPaymentInput('')
    setBillNewPaymentNote('')
    setBillNewPaymentDate(new Date().toISOString().split('T')[0])
    setBillNewPaymentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    setBillModalOpen(true)

    try {
      const existing = await getInvoiceForAppointment(appt.id)
      if (existing) {
        if (existing.items && existing.items.length > 0) {
          const normalizedItems = getEffectiveInvoiceItems(appt, existing.items)
          setBillItems(
            normalizedItems.map((it, idx) => ({
              id: `item_${idx}`,
              name: it.name,
              price: Number(it.price || 0),
              quantity: Number(it.quantity || 1),
            }))
          )
        } else {
          const baseFee = Number(appt.feeAmount || 0)
          const deskCharge = getEffectiveServiceCharge(appt)
          const effectiveTotal = getEffectiveAppointmentTotal(appt)
          const initialFee = Math.max(Number(existing.totalAmount || 0), effectiveTotal || 500)
          if (String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK' && baseFee > 0 && deskCharge > 0) {
            setBillItems([
              {
                id: 'initial_consult',
                name: `${appt.doctor?.fullName || selectedDoctor?.fullName || 'Doctor'} Consultation Fee`,
                price: baseFee,
                quantity: 1,
              },
              {
                id: 'pad_service_charge',
                name: 'Pay at Desk Service Charge (5%)',
                price: deskCharge,
                quantity: 1,
              },
            ])
          } else {
            setBillItems([
              {
                id: 'initial_consult',
                name: `${appt.doctor?.fullName || selectedDoctor?.fullName || 'Doctor'} Consultation Fee`,
                price: initialFee,
                quantity: 1,
              },
            ])
          }
        }

        const calcTotal = Math.max(getEffectiveInvoiceTotal(appt, existing), 500)
        const calcPaid =
          existing.paymentStatus === 'paid' || appt.paymentStatus === 'paid'
            ? Math.max(Number(existing.paidAmount || 0), calcTotal)
            : Number(existing.paidAmount || 0)
        const isPad = String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK'
        const rawLogs = parsePaymentRecords(existing.remarks, calcPaid, existing.paidAt)
        const parsedLogs =
          isPad && rawLogs.length === 1 && calcPaid >= calcTotal && rawLogs[0].amount < calcTotal
            ? [{ ...rawLogs[0], amount: calcTotal }]
            : rawLogs
        setBillPaymentRecords(parsedLogs)
        setBillTotalAmount(String(calcTotal))
        setBillPaidAmount(String(calcPaid))
        setBillRemarks(extractCleanClinicalRemarks(existing.remarks) || appt.notes || '')
      } else {
        const baseFee = Number(appt.feeAmount) || 500
        const deskCharge = getEffectiveServiceCharge(appt)
        const initialTotal = getEffectiveAppointmentTotal(appt) || baseFee
        if (String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK' && deskCharge > 0) {
          setBillItems([
            {
              id: 'initial_consult',
              name: `${appt.doctor?.fullName || selectedDoctor?.fullName || 'Doctor'} Consultation Fee`,
              price: baseFee,
              quantity: 1,
            },
            {
              id: 'pad_service_charge',
              name: 'Pay at Desk Service Charge (5%)',
              price: deskCharge,
              quantity: 1,
            },
          ])
        } else {
          setBillItems([
            {
              id: 'initial_consult',
              name: `${appt.doctor?.fullName || selectedDoctor?.fullName || 'Doctor'} Consultation Fee`,
              price: initialTotal,
              quantity: 1,
            },
          ])
        }
        const initialPaid = appt.paymentStatus === 'paid' ? initialTotal : 0
        const initialLogs: WebPaymentRecord[] = initialPaid > 0 ? [{
          id: crypto.randomUUID(),
          amount: initialPaid,
          dateTime: `${appt.appointmentDate} ${appt.appointmentTime || '10:00 AM'}`,
          note: String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK'
            ? 'Pay at Desk Collection (Includes 5% Commission)'
            : 'Initial Consultation Fee'
        }] : []
        setBillPaymentRecords(initialLogs)
        setBillTotalAmount(String(initialTotal))
        setBillPaidAmount(String(initialPaid))
        setBillRemarks(appt.notes || '')
      }
    } catch (e) {
      console.error('Error fetching invoice for bill modal:', e)
    }
  }

  const handleBillReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type.startsWith('image/')) {
      const origSizeKb = Math.round(file.size / 1024)
      const compressed = await compressImage(file, 300 * 1024, 1600)
      const newSizeKb = Math.round(compressed.size / 1024)
      setBillReceiptFile(compressed)
      setBillReceiptCompressionInfo(
        `Optimized receipt image from ${origSizeKb} KB down to ${newSizeKb} KB (≤ 300 KB)`
      )
    } else {
      setBillReceiptFile(file)
      setBillReceiptCompressionInfo(null)
    }
  }

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!billTargetAppt || !selectedClinic) return

    setSavingBill(true)
    try {
      let receiptUrl: string | undefined = undefined
      if (billReceiptFile) {
        try {
          const uploaded = await uploadReceiptFile(billReceiptFile.name, billReceiptFile)
          if (uploaded) receiptUrl = uploaded
        } catch (uploadErr) {
          console.warn('Receipt upload deferred offline:', uploadErr)
        }
      }

      const itemsTotal = billItems.reduce((acc, it) => acc + it.price * (it.quantity || 1), 0)
      const inputTotal = Number(billTotalAmount) || 0
      const finalTotalAmount = itemsTotal > 0 ? (inputTotal > itemsTotal ? inputTotal : itemsTotal) : (inputTotal > 0 ? inputTotal : (Number(billTargetAppt.feeAmount) || 500))

      // If user typed a larger total than items sum, add a reconciling item so itemized list reflects the total
      let itemsToPersist = [...billItems]
      if (itemsToPersist.length === 0) {
        itemsToPersist = [
          {
            id: 'consultation',
            name: `${billTargetAppt.doctor?.fullName || selectedDoctor?.fullName || 'Doctor'} Consultation Fee`,
            price: finalTotalAmount,
            quantity: 1,
          }
        ]
      } else if (inputTotal > itemsTotal) {
        const diff = inputTotal - itemsTotal
        itemsToPersist.push({
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'item_' + Date.now(),
          name: 'Additional Clinical Procedures & Services',
          price: diff,
          quantity: 1,
        })
      }

      const newPaymentAmt = Number(billNewPaymentInput) || 0
      let updatedPayments = [...billPaymentRecords]
      if (newPaymentAmt > 0) {
        const payDate = billNewPaymentDate || new Date().toISOString().split('T')[0]
        const payTime = billNewPaymentTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        updatedPayments.push({
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'pay_' + Date.now(),
          amount: newPaymentAmt,
          dateTime: `${payDate} ${payTime}`,
          note: billNewPaymentNote.trim() || 'Payment Received',
        })
      }
      const finalPaidAmount = updatedPayments.length > 0
        ? updatedPayments.reduce((acc, p) => acc + p.amount, 0)
        : (Number(billPaidAmount) || 0)

      const derivedApptStatus = finalPaidAmount >= finalTotalAmount && finalTotalAmount > 0 ? 'paid' : (finalPaidAmount > 0 ? 'partial' : 'unpaid')
      const invoiceId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'inv_' + Date.now()
      const cleanBillRemarks = extractCleanClinicalRemarks(billRemarks)
      const encodedRemarks = buildCombinedRemarks(cleanBillRemarks, updatedPayments)

      const localInvoice: BillingInvoice = {
        id: invoiceId,
        appointmentId: billTargetAppt.id,
        clinicId: billTargetAppt.clinicId || selectedClinic.id,
        totalAmount: finalTotalAmount,
        paidAmount: finalPaidAmount,
        balanceDue: Math.max(0, finalTotalAmount - finalPaidAmount),
        paymentStatus: derivedApptStatus as any,
        remarks: billRemarks.trim() || undefined,
        receiptUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // 1. Instant local IndexedDB persistence (invoices, billing_items, outbox)
      try {
        await putRecord('invoices', {
          id: localInvoice.id,
          appointment_id: billTargetAppt.id,
          clinic_id: localInvoice.clinicId,
          total_amount: finalTotalAmount,
          paid_amount: finalPaidAmount,
          balance_due: Math.max(0, finalTotalAmount - finalPaidAmount),
          payment_status: derivedApptStatus,
          remarks: encodedRemarks,
          receipt_url: receiptUrl,
          created_at: localInvoice.createdAt,
          updated_at: localInvoice.updatedAt,
        })

        if (itemsToPersist.length > 0) {
          const dbBillingItems = itemsToPersist.map((it, idx) => ({
            id: it.id || `${localInvoice.id}_item_${idx}`,
            invoice_id: localInvoice.id,
            name: it.name,
            item_name: it.name,
            price: it.price,
            quantity: it.quantity,
            total: it.price * it.quantity,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }))
          await putRecords('billing_items', dbBillingItems)
        }

        await queueMutation({
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'mut_inv_' + Date.now(),
          table: 'billing_invoices',
          action: 'UPSERT',
          clinicId: localInvoice.clinicId,
          entityId: localInvoice.id,
          payload: {
            id: localInvoice.id,
            appointment_id: billTargetAppt.id,
            clinic_id: localInvoice.clinicId,
            total_amount: finalTotalAmount,
            paid_amount: finalPaidAmount,
            balance_due: Math.max(0, finalTotalAmount - finalPaidAmount),
            payment_status: derivedApptStatus,
            remarks: encodedRemarks,
            items: itemsToPersist,
            payment_records: updatedPayments,
          },
          timestamp: Date.now(),
          retryCount: 0,
          status: 'pending',
        })
      } catch (idbErr) {
        console.warn('Local IndexedDB invoice save error:', idbErr)
      }

      // 2. Optimistic UI state updates (zero delay, zero freeze)
      setInvoices((prev) => {
        const idx = prev.findIndex((i) => i.appointmentId === billTargetAppt.id)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = { ...prev[idx], ...localInvoice }
          return updated
        }
        return [localInvoice, ...prev]
      })

      setAppointments((prev) =>
        prev.map((a) =>
          a.id === billTargetAppt.id
            ? { ...a, feeAmount: finalTotalAmount, paymentStatus: derivedApptStatus as any }
            : a
        )
      )

      setBillModalOpen(false)
      setRefreshKey((k) => k + 1)

      // 3. Background cloud sync if online (network failure alerts strictly suppressed)
      if (typeof navigator === 'undefined' || navigator.onLine) {
        saveOrUpdateInvoicePayment({
          appointmentId: billTargetAppt.id,
          clinicId: billTargetAppt.clinicId || selectedClinic.id,
          totalAmount: finalTotalAmount,
          paidAmount: finalPaidAmount,
          remarks: billRemarks.trim() || undefined,
          receiptUrl,
          items: itemsToPersist.map((it) => ({
            itemName: it.name,
            name: it.name,
            quantity: it.quantity,
            price: it.price,
            total: it.price * it.quantity,
          })),
          paymentRecords: updatedPayments,
        }).then((savedInvoice) => {
          if (savedInvoice) {
            setInvoices((prev) => {
              const idx = prev.findIndex((i) => i.appointmentId === billTargetAppt.id)
              if (idx >= 0) {
                const updated = [...prev]
                updated[idx] = savedInvoice
                return updated
              }
              return [savedInvoice, ...prev]
            })
          }
        }).catch((syncErr) => {
          console.warn('Background Supabase bill save failed, queued in offline outbox:', syncErr)
        })
        triggerSync().catch(() => {})
      }
    } catch (err) {
      console.warn('Error during bill processing, saved locally:', err)
    } finally {
      setSavingBill(false)
    }
  }

  // Patient Directory Search
  const handlePatientSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientSearchQuery.trim() || !selectedClinic) return

    setSearchingPatients(true)
    try {
      const results = await searchPatientRecords(selectedClinic.id, patientSearchQuery.trim())
      setPatientSearchResults(results)
    } catch (err) {
      console.error('Error searching patients:', err)
    } finally {
      setSearchingPatients(false)
    }
  }

  // Direct Patient Directory Registration
  const handleDirectRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClinic || !newPatientName.trim() || !newPatientPhone.trim()) {
      alert('Please enter patient name and mobile phone.')
      return
    }
    setIsRegisteringPatient(true)
    try {
      const code10 = generate10DigitTrackingCode()
      const doc = clinicDoctors[0] || selectedDoctor
      const today = new Date().toISOString().split('T')[0]
      const created = await createAppointment({
        clinicId: selectedClinic.id,
        doctorId: doc?.id || '',
        patientName: newPatientName.trim(),
        patientMobile: newPatientPhone.trim(),
        patientGender: newPatientGender,
        patientAge: Number(newPatientAge) || 30,
        patientEmail: newPatientEmail.trim() || undefined,
        appointmentDate: today,
        appointmentTime: '10:00 AM',
        feeAmount: doc?.consultationFee || 500,
        paymentStatus: 'unpaid',
        paymentMode: 'PAY_AT_DESK',
        checkinStatus: 'waiting',
        status: 'APPROVED',
        notes: newPatientNotes.trim() || 'Direct Reception Walk-In Registration',
        trackingCode10Digit: code10,
        isWalkin: true,
      })

      if (created) {
        setAppointments((prev) => [created, ...prev])
        setRegisterPatientModalOpen(false)
        setNewPatientName('')
        setNewPatientPhone('')
        setNewPatientAge('')
        setNewPatientNotes('')
        setNewPatientEmail('')
        setRefreshKey((k) => k + 1)
        alert(`Patient registered successfully with Token #${code10}!`)
      } else {
        alert('Failed to register patient.')
      }
    } catch (err) {
      console.error('Error registering patient directly:', err)
      alert('Failed to register patient.')
    } finally {
      setIsRegisteringPatient(false)
    }
  }

  // Schedule Next Follow-Up Visit
  const handleOpenScheduleNextVisit = (pat: any) => {
    setScheduleNextPatient(pat)
    setScheduleNextDoctorId(clinicDoctors[0]?.id || selectedDoctor?.id || '')
    const d = new Date()
    d.setDate(d.getDate() + 1)
    setScheduleNextDate(d.toISOString().split('T')[0])
    setScheduleNextTime('10:00 AM')
    setScheduleNextRemarks('Follow-up consultation')
    setScheduleNextModalOpen(true)
  }

  const handleScheduleNextVisitSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClinic || !scheduleNextPatient || !scheduleNextDoctorId || !scheduleNextDate) {
      alert('Please fill all required fields.')
      return
    }
    setIsSchedulingNextVisit(true)
    try {
      const code10 = generate10DigitTrackingCode()
      const created = await createAppointment({
        clinicId: selectedClinic.id,
        doctorId: scheduleNextDoctorId,
        patientName: scheduleNextPatient.fullName,
        patientMobile: scheduleNextPatient.phone !== 'N/A' ? scheduleNextPatient.phone : '',
        patientGender: scheduleNextPatient.gender || 'Male',
        patientAge: scheduleNextPatient.age || 30,
        patientEmail: scheduleNextPatient.email || undefined,
        appointmentDate: scheduleNextDate,
        appointmentTime: scheduleNextTime,
        feeAmount: 0, // Free follow-up consultation
        paymentStatus: 'paid',
        paymentMode: 'PAY_AT_DESK',
        checkinStatus: 'waiting',
        status: 'APPROVED',
        notes: scheduleNextRemarks.trim() || 'Follow-up consultation',
        trackingCode10Digit: code10,
        isWalkin: true,
      })

      if (created) {
        setScheduleNextModalOpen(false)
        setRefreshKey((k) => k + 1)
        alert(`Follow-up visit for ${scheduleNextPatient.fullName} scheduled for ${scheduleNextDate} (${scheduleNextTime}) with Token #${code10}!`)
      } else {
        alert('Failed to schedule follow-up visit.')
      }
    } catch (err) {
      console.error('Error scheduling follow-up visit:', err)
      alert('Failed to schedule follow-up visit.')
    } finally {
      setIsSchedulingNextVisit(false)
    }
  }

  // Diagnostic Lab 3-Stage Workflow
  const handleLabReportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type.startsWith('image/')) {
      const origSizeKb = Math.round(file.size / 1024)
      const compressed = await compressImage(file, 300 * 1024, 1800)
      const newSizeKb = Math.round(compressed.size / 1024)
      setReportFile(compressed)
      setReportCompressionInfo(
        `Optimized report scan from ${origSizeKb} KB down to ${newSizeKb} KB (≤ 300 KB)`
      )
    } else {
      setReportFile(file)
      setReportCompressionInfo(null)
    }
  }

  const handleUploadReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetLabAppt || !selectedClinic) return

    setUploadingReport(true)
    try {
      let fileUrl = ''
      let fileType = 'pdf'

      if (reportFile) {
        fileType = reportFile.type.includes('image') ? 'image' : 'pdf'
        const uploaded = await uploadReportFile(reportFile.name, reportFile)
        if (uploaded) {
          fileUrl = uploaded
        }
      }

      const savedReport = await saveLabReport({
        appointmentId: targetLabAppt.id,
        clinicId: selectedClinic.id,
        trackingCode10Digit: targetLabAppt.trackingCode10Digit,
        patientName: targetLabAppt.patientName,
        testName: targetLabAppt.selectedTests?.join(', ') || 'Diagnostic Report',
        status: 'prepared',
        preparedAt: new Date().toISOString(),
        reportFileUrl: fileUrl || undefined,
        reportFileType: fileType,
        technicianNotes: technicianNotes.trim() || undefined,
      })

      await updateAppointmentStatus(targetLabAppt.id, 'report_prepared')
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === targetLabAppt.id
            ? { ...a, checkinStatus: 'report_prepared' as any, updatedAt: new Date().toISOString() }
            : a
        )
      )
      if (savedReport) {
        setLabReports((prev) => [
          savedReport,
          ...prev.filter((r) => r.appointmentId !== targetLabAppt.id && r.id !== savedReport.id),
        ])
      }

      await sendBroadcastNotification(
        selectedClinic.id,
        `Diagnostic Report Ready for ${targetLabAppt.patientName}`,
        `Your diagnostic test results are prepared. Verify patient name with 10-digit code #${targetLabAppt.trackingCode10Digit} to view or download.`
      )

      setLabUploadModalOpen(false)
      setReportFile(null)
      setTechnicianNotes('')
      setRefreshKey((k) => k + 1)
      alert(`Report marked PREPARED! Patient notified with secure name verification requirement.`)
    } catch (err) {
      console.error('Error uploading report:', err)
    } finally {
      setUploadingReport(false)
    }
  }

  // Add Lab Test Rate
  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newServiceName.trim() || !newServicePrice || !selectedClinic) return

    try {
      const created = await createClinicService({
        clinicId: selectedClinic.id,
        serviceName: newServiceName.trim(),
        price: Number(newServicePrice),
        category: newServiceCategory,
        isAvailable: true,
      })

      if (created) {
        setServices([...services, created])
        setNewServiceName('')
        setNewServicePrice('')
        alert('New diagnostic test added to rate list!')
      }
    } catch (err) {
      console.error('Error adding service:', err)
    }
  }

  const handleDeleteService = async (serviceId: string) => {
    if (!confirm('Remove this test from your clinic rates?')) return
    const ok = await deleteClinicService(serviceId)
    if (ok) {
      setServices((prev) => prev.filter((s) => s.id !== serviceId))
    }
  }

  // Send Broadcast Alert
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastTitle.trim() || !broadcastMessage.trim() || !selectedClinic) return

    try {
      const ok = await sendBroadcastNotification(
        selectedClinic.id,
        broadcastTitle.trim(),
        broadcastMessage.trim()
      )

      if (ok) {
        setBroadcastSent(true)
        setBroadcastTitle('')
        setBroadcastMessage('')
        setTimeout(() => setBroadcastSent(false), 4000)
      }
    } catch (err) {
      console.error('Error sending broadcast:', err)
    }
  }

  const persistActiveGatewayCredentials = async (clinicId: string): Promise<boolean> => {
    const gw = settingGatewayProvider
    const hasExistingVerified = Boolean(gatewaySetupStatus?.[gw]?.is_verified)
    const hasNewKeyInput = Boolean(
      settingMerchantId.trim() ||
        settingPaymentSecretKey.trim() ||
        settingPaymentApiKey.trim() ||
        settingConnectIpsAppId.trim() ||
        settingConnectIpsAppPassword.trim() ||
        settingConnectIpsPrivateKeyPem.trim() ||
        settingConnectIpsPfxBase64.trim()
    )

    if (!hasNewKeyInput && !hasExistingVerified) {
      // Clinic owner hasn't provided keys for this gateway yet — allowed if they only want Pay at Desk or other gateways
      return true
    }

    if (!settingGatewayEnabled && hasExistingVerified && !settingPaymentSecretKey.trim() && !settingConnectIpsPfxBase64.trim() && !settingConnectIpsPrivateKeyPem.trim()) {
      await toggleClinicGateway({ clinicId, gateway: gw, enabled: false })
      const refreshed = await getClinicGatewaySetupStatus(clinicId)
      if (refreshed) setGatewaySetupStatus(refreshed)
      return true
    }

    const res = await saveClinicGatewayCredentials({
      clinicId,
      gateway: gw,
      enabled: settingGatewayEnabled,
      isDirectPaymentEnabled: settingDirectPaymentEnabled,
      environment: settingPaymentEnvironment,
      productCode: gw === 'esewa' ? settingMerchantId.trim() : undefined,
      merchantId: settingMerchantId.trim() || undefined,
      merchantCode: gw === 'fonepay' ? settingMerchantId.trim() : undefined,
      publicKey: gw === 'khalti' ? settingPaymentApiKey.trim() : undefined,
      secretKey: settingPaymentSecretKey.trim() || undefined,
      username: gw === 'fonepay' ? settingFonepayUsername.trim() : undefined,
      password: gw === 'fonepay' ? settingFonepayPassword.trim() || undefined : undefined,
      appId: gw === 'connectips' ? settingConnectIpsAppId.trim() : undefined,
      appName: gw === 'connectips' ? settingConnectIpsAppName.trim() : undefined,
      appPassword: gw === 'connectips' ? settingConnectIpsAppPassword.trim() || undefined : undefined,
      privateKeyPem: gw === 'connectips' ? settingConnectIpsPrivateKeyPem.trim() || undefined : undefined,
      pfxBase64: gw === 'connectips' ? settingConnectIpsPfxBase64.trim() || undefined : undefined,
      pfxPassword: gw === 'connectips' ? settingConnectIpsPfxPassword : undefined,
    })

    const refreshed = await getClinicGatewaySetupStatus(clinicId)
    if (refreshed) {
      setGatewaySetupStatus(refreshed)
      populateGatewayFormFromSetup(gw, refreshed)
    }
    setGatewayStatusMsg({ type: 'ok', text: res.message || `${gw.toUpperCase()} verified and saved!` })
    return true
  }

  const handleSaveSelectedGatewayOnly = async () => {
    if (!selectedClinic || savingGatewayOnly) return
    setSavingGatewayOnly(true)
    setGatewayStatusMsg(null)
    try {
      await persistActiveGatewayCredentials(selectedClinic.id)
    } catch (err: any) {
      setGatewayStatusMsg({ type: 'err', text: err?.message || `Could not verify ${settingGatewayProvider.toUpperCase()} keys` })
    } finally {
      setSavingGatewayOnly(false)
    }
  }

  // Save Clinic Settings (ClinicSettingsScreen.kt)
  const handleSaveClinicSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClinic) return
    setSavingSettings(true)
    setGatewayStatusMsg(null)
    try {
      try {
        await persistActiveGatewayCredentials(selectedClinic.id)
      } catch (secErr: any) {
        console.error('Error saving gateway credentials:', secErr)
        setGatewayStatusMsg({ type: 'err', text: secErr?.message || String(secErr) })
        alert(`Could not verify/save ${settingGatewayProvider.toUpperCase()} credentials: ${secErr.message || secErr}`)
        setSavingSettings(false)
        return
      }

      const updates: Partial<Clinic> = {
        name: settingName.trim(),
        type: settingType as any,
        contactPhone: settingPhone.trim(),
        contactEmail: settingEmail.trim(),
        addressText: settingAddress.trim(),
        latitude: settingLat,
        longitude: settingLng,
        panNumber: settingPan.trim(),
        managerPhone: settingManagerPhone.trim(),
        autoNotifyThreshold: settingThreshold,
        specialties: settingSpecialties,
        description: settingDesc.trim(),
        paymentGatewayProvider: settingGatewayProvider,
        merchantId: settingMerchantId.trim(),
        paymentApiKey: settingPaymentApiKey.trim(),
        // All gateway secrets are stored strictly server-side in clinic_payment_credentials, never in public clinics columns
        paymentSecretKey: undefined,
        isDirectPaymentEnabled: settingDirectPaymentEnabled,
      }
      const ok = await updateClinic(selectedClinic.id, updates)
      if (ok) {
        setSelectedClinic({
          ...selectedClinic,
          ...updates,
        })
        setSettingsSuccess(true)
        setTimeout(() => setSettingsSuccess(false), 3000)
      }
    } catch (err) {
      console.error('Error updating clinic profile:', err)
    } finally {
      setSavingSettings(false)
    }
  }

  // Doctor photo upload modal state & handler
  const [doctorPhotoModalOpen, setDoctorPhotoModalOpen] = useState(false)
  const [doctorPhotoTarget, setDoctorPhotoTarget] = useState<Doctor | null>(null)
  const [doctorPhotoFile, setDoctorPhotoFile] = useState<File | null>(null)
  const [doctorPhotoPreview, setDoctorPhotoPreview] = useState<string | null>(null)
  const [uploadingDoctorPhoto, setUploadingDoctorPhoto] = useState(false)
  const [doctorPhotoMsg, setDoctorPhotoMsg] = useState<string | null>(null)

  const handleOpenDoctorPhotoUpload = (doc: Doctor) => {
    setDoctorPhotoTarget(doc)
    setDoctorPhotoFile(null)
    setDoctorPhotoPreview(doc.profilePictureUrl || null)
    setDoctorPhotoMsg(null)
    setDoctorPhotoModalOpen(true)
  }

  const handleDoctorPhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDoctorPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setDoctorPhotoPreview(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSaveDoctorPhoto = async () => {
    if (!doctorPhotoTarget) return
    if (!doctorPhotoFile) {
      alert('Please select an image file first.')
      return
    }
    setUploadingDoctorPhoto(true)
    setDoctorPhotoMsg('Compressing photo to <= 300 KB...')
    try {
      const compressed = await compressImage(doctorPhotoFile, 300 * 1024)
      setDoctorPhotoMsg('Uploading doctor photo to secure storage...')
      const publicUrl = await uploadDoctorPhoto(doctorPhotoTarget.id, compressed, doctorPhotoFile.name)
      if (!publicUrl) throw new Error('Failed to upload doctor photo to secure storage.')

      setDoctorPhotoMsg('Updating doctor profile...')
      const ok = await updateDoctor(doctorPhotoTarget.id, { profilePictureUrl: publicUrl })
      if (!ok) throw new Error('Failed to update doctor profile picture in database.')

      setClinicDoctors((prev) =>
        prev.map((d) => (d.id === doctorPhotoTarget.id ? { ...d, profilePictureUrl: publicUrl } : d))
      )
      if (selectedDoctor?.id === doctorPhotoTarget.id) {
        setSelectedDoctor({ ...selectedDoctor, profilePictureUrl: publicUrl })
      }
      setDoctorPhotoMsg('Doctor profile picture updated successfully!')
      setTimeout(() => {
        setDoctorPhotoModalOpen(false)
        setDoctorPhotoMsg(null)
      }, 1500)
    } catch (err: any) {
      console.error('Error saving doctor photo:', err)
      alert(err?.message || 'Failed to save doctor photo')
      setDoctorPhotoMsg(null)
    } finally {
      setUploadingDoctorPhoto(false)
    }
  }

  // Clinic Facility Photos Upload & Management
  const [uploadingClinicPhoto, setUploadingClinicPhoto] = useState(false)
  const [clinicPhotoStatusMsg, setClinicPhotoStatusMsg] = useState<string | null>(null)

  const handleUploadClinicPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClinic) return
    const currentPics = selectedClinic.pictures || []
    if (currentPics.length >= 4) {
      alert('A maximum of 4 clinic facility photos can be added. Please remove an existing photo first.')
      return
    }

    setUploadingClinicPhoto(true)
    setClinicPhotoStatusMsg('Compressing facility image...')
    try {
      const compressed = await compressImage(file, 300 * 1024)
      setClinicPhotoStatusMsg('Uploading photo to secure storage...')
      const publicUrl = await uploadClinicPhoto(selectedClinic.id, compressed, file.name)
      if (!publicUrl) throw new Error('Failed to upload photo to secure storage.')

      const updatedPics = [...currentPics, publicUrl]
      setClinicPhotoStatusMsg('Saving to clinic profile...')
      const ok = await updateClinic(selectedClinic.id, { pictures: updatedPics })
      if (!ok) throw new Error('Failed to update clinic pictures in database.')

      setSelectedClinic({ ...selectedClinic, pictures: updatedPics })
      setClinicPhotoStatusMsg('Facility photo uploaded successfully!')
      setTimeout(() => setClinicPhotoStatusMsg(null), 3000)
    } catch (err: any) {
      console.error('Error uploading clinic photo:', err)
      alert(err?.message || 'Failed to upload clinic photo')
      setClinicPhotoStatusMsg(null)
    } finally {
      setUploadingClinicPhoto(false)
      e.target.value = ''
    }
  }

  const handleRemoveClinicPhoto = async (indexToRemove: number) => {
    if (!selectedClinic) return
    const currentPics = selectedClinic.pictures || []
    if (!window.confirm('Are you sure you want to remove this facility photo?')) return

    const updatedPics = currentPics.filter((_, idx) => idx !== indexToRemove)
    try {
      const ok = await updateClinic(selectedClinic.id, { pictures: updatedPics })
      if (ok) {
        setSelectedClinic({ ...selectedClinic, pictures: updatedPics })
      }
    } catch (err) {
      console.error('Error removing clinic photo:', err)
    }
  }

  const handleSetClinicCoverPhoto = async (photoUrl: string) => {
    if (!selectedClinic) return
    try {
      const ok = await updateClinic(selectedClinic.id, { logoUrl: photoUrl })
      if (ok) {
        setSelectedClinic({ ...selectedClinic, logoUrl: photoUrl })
        alert('Cover logo updated successfully!')
      }
    } catch (err) {
      console.error('Error setting cover photo:', err)
    }
  }

  const isDiagnosticLab = true // Allow all clinics access to Lab & Rates modules like DashboardScreen.kt

  // Subscription & Archive Countdown Calculations (DashboardScreen.kt & ClinicSettingsScreen.kt)
  const subscriptionDaysLeft = useMemo(() => {
    if (!selectedClinic?.activationExpiresAt) return 30
    try {
      const exp = new Date(selectedClinic.activationExpiresAt).getTime()
      const diff = Math.ceil((exp - Date.now()) / (1000 * 60 * 60 * 24))
      return Math.max(0, diff)
    } catch {
      return 30
    }
  }, [selectedClinic?.activationExpiresAt])

  const isSubscriptionActive = Boolean(
    (selectedClinic?.isActivated ?? true) && subscriptionDaysLeft > 0
  )

  const archiveDaysLeft = useMemo(() => {
    if (!selectedClinic?.deletionScheduledAt) return 30
    try {
      const del = new Date(selectedClinic.deletionScheduledAt).getTime()
      const diff = Math.ceil((del - Date.now()) / (1000 * 60 * 60 * 24))
      return Math.max(0, diff)
    } catch {
      return 30
    }
  }, [selectedClinic?.deletionScheduledAt])

  // 14-Day Horizontal Date Strip (SlotManagerScreen.kt & FutureAppointmentsScreen.kt)
  const upcoming14Dates = useMemo(() => {
    const arr: { dateStr: string; dayShort: string; dayNum: string; monthShort: string }[] = []
    for (let i = 0; i < 14; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      const dayShort = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-US', { weekday: 'short' })
      const dayNum = String(d.getDate()).padStart(2, '0')
      const monthShort = d.toLocaleDateString('en-US', { month: 'short' })
      arr.push({ dateStr, dayShort, dayNum, monthShort })
    }
    return arr
  }, [])

  // 13 Nepal City Presets (ClinicSettingsScreen.kt)
  const NEPAL_CITY_PRESETS = [
    { name: 'Kathmandu', lat: 27.7172, lng: 85.324 },
    { name: 'Lalitpur (Patan)', lat: 27.6644, lng: 85.3188 },
    { name: 'Bhaktapur', lat: 27.671, lng: 85.4298 },
    { name: 'Pokhara', lat: 28.2096, lng: 83.9856 },
    { name: 'Bharatpur (Chitwan)', lat: 27.6833, lng: 84.4333 },
    { name: 'Biratnagar', lat: 26.4525, lng: 87.2718 },
    { name: 'Birgunj', lat: 27.0104, lng: 84.877 },
    { name: 'Dharan', lat: 26.812, lng: 87.2836 },
    { name: 'Butwal', lat: 27.7006, lng: 83.4484 },
    { name: 'Hetauda', lat: 27.4284, lng: 85.0322 },
    { name: 'Janakpur', lat: 26.7288, lng: 85.9263 },
    { name: 'Nepalgunj', lat: 28.05, lng: 81.6167 },
    { name: 'Dhangadhi', lat: 28.6852, lng: 80.6216 },
  ]

  const defaultSpecialtyList = useMemo(
    () =>
      medicalSpecialties.length > 0
        ? medicalSpecialties.map((s) => s.name)
        : [
            'General Physician',
            'Pediatrics',
            'Orthopedics',
            'Gynecology & Obstetrics',
            'Dermatology',
            'Cardiology',
            'ENT',
            'Dentistry',
            'Ophthalmology',
            'Pathology & Lab Diagnostics',
            'Psychiatry',
            'Neurology',
          ],
    [medicalSpecialties]
  )

  // Queue Counts (filtered by selected queue date from DateScroller)
  const todayDateStr = new Date().toISOString().split('T')[0]
  const todayAppointments = useMemo(() => {
    const list = appointments.filter((a) => {
      if (a.appointmentDate !== selectedQueueDate) return false
      // Strict OPD Queue Guard: Only APPROVED appointments enter the live queue
      const st = (a.status || '').toUpperCase()
      if (
        st !== 'APPROVED' ||
        a.status === 'WAITING_FOR_APPROVAL' ||
        a.status === 'pending_payment' ||
        a.status === 'UNAPPROVED' ||
        a.status === 'EXPIRED'
      ) {
        return false
      }
      return true
    })
    return [...list].sort((a, b) => {
      const aInside = a.checkinStatus === 'in_consultation' || a.checkinStatus === 'inside' ? 0 : 1
      const bInside = b.checkinStatus === 'in_consultation' || b.checkinStatus === 'inside' ? 0 : 1
      if (aInside !== bInside) return aInside - bInside
      return (a.appointmentTime || '').localeCompare(b.appointmentTime || '')
    })
  }, [appointments, selectedQueueDate])

  const noShowAppointments = useMemo(
    () =>
      appointments.filter(
        (a) =>
          a.checkinStatus === 'no_show' ||
          a.checkinStatus === 'cancelled' ||
          (a.appointmentDate < todayStr &&
            a.checkinStatus !== 'completed' &&
            a.checkinStatus !== 'done' &&
            a.checkinStatus !== 'processing' &&
            a.checkinStatus !== 'report_prepared')
      ),
    [appointments, todayStr]
  )

  const datewiseGroupedNoShows = useMemo(() => {
    const groups: { [date: string]: Appointment[] } = {}
    noShowAppointments.forEach((a) => {
      const d = a.appointmentDate || 'Unknown Date'
      if (!groups[d]) groups[d] = []
      groups[d].push(a)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [noShowAppointments])

  const activeConsultationPatient = useMemo(
    () =>
      todayAppointments.find(
        (a) => a.checkinStatus === 'in_consultation' || a.checkinStatus === 'inside'
      ),
    [todayAppointments]
  )

  const queueWaitingCount = todayAppointments.filter((a) => a.checkinStatus === 'waiting').length
  const queueInsideCount = todayAppointments.filter(
    (a) => a.checkinStatus === 'in_consultation' || a.checkinStatus === 'inside'
  ).length
  const queueProcessingCount = todayAppointments.filter(
    (a) => a.checkinStatus === 'processing' || a.checkinStatus === 'sample_collected'
  ).length
  const queueCompletedCount = todayAppointments.filter(
    (a) => a.checkinStatus === 'completed' || a.checkinStatus === 'done' || a.checkinStatus === 'report_prepared'
  ).length

  // Appointments for the selected future date
  const futureDateAppointments = useMemo(
    () =>
      appointments.filter(
        (a) =>
          a.appointmentDate === futureSelectedDate &&
          (a.status || '').toUpperCase() === 'APPROVED' &&
          a.status !== 'WAITING_FOR_APPROVAL' &&
          a.status !== 'pending_payment' &&
          a.status !== 'UNAPPROVED' &&
          a.status !== 'EXPIRED'
      ),
    [appointments, futureSelectedDate]
  )

  const isSelectedDateHoliday = Boolean(
    selectedClinic?.declaredHolidays?.includes(futureSelectedDate)
  )

  // ==========================================
  // VIEW 1: REGULATORY VERIFICATION PENDING SCREEN
  // ==========================================
  if (currentView === 'pending_verification' && pendingEntity) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="liquid-glass-elevated liquid-glass-ShatterHighlight rounded-3xl p-8 sm:p-10 shadow-glass-elevated border border-amber-300/60 dark:border-amber-500/30 space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/15 border border-amber-400/30 text-amber-700 dark:text-amber-300 flex items-center justify-center mx-auto shadow-inner">
              <Clock className="w-8 h-8 stroke-[2.5]" />
            </div>
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-400/40">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Under Regulatory Review</span>
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              Dactor Administration Verification
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
              Your registration has been recorded in the Dactor National Healthcare Network. Our clinical oversight committee verifies PAN records, physical location, and Nepal Medical Council (NMC) credentials before activating operational desk access.
            </p>
          </div>

          {/* Entity Details Card */}
          <div className="liquid-glass-subtle rounded-2xl p-5 border border-white/50 dark:border-white/10 space-y-3 text-left">
            <div className="flex items-center justify-between border-b border-white/40 dark:border-white/10 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  {pendingEntity.role === 'clinic'
                    ? 'Healthcare Facility Accreditation'
                    : 'Medical Practitioner KYC'}
                </span>
                <h3 className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  {pendingEntity.name}
                </h3>
              </div>
              <span className="px-3 py-1 rounded-xl text-xs font-black uppercase bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-400/40">
                {pendingEntity.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block">Registered Account Email</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{pendingEntity.email}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Submitted Credentials</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{pendingEntity.details}</span>
              </div>
            </div>
          </div>

          {verificationCheckMsg && (
            <div className="p-4 rounded-2xl bg-amber-500/10 backdrop-blur-md border border-amber-300/60 dark:border-amber-500/30 text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center space-x-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{verificationCheckMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            <a
              href={supportUrl.startsWith('http') || supportUrl.startsWith('mailto:') ? supportUrl : `https://${supportUrl}`}
              target="_blank"
              rel="noreferrer"
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:brightness-110 text-white font-bold rounded-2xl shadow-lg border border-amber-400/40 transition-all flex items-center justify-center space-x-2 text-sm cursor-pointer active:scale-[0.98]"
            >
              <Headphones className="w-4 h-4" />
              <span>Contact Dactor Support & Onboarding Desk</span>
              <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-80" />
            </a>

            <button
              type="button"
              onClick={checkVerificationStatus}
              disabled={checkingVerification}
              className="w-full py-3.5 bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 text-white font-bold rounded-2xl shadow-glass-brand border border-white/25 transition-all flex items-center justify-center space-x-2 text-sm cursor-pointer disabled:opacity-60 active:scale-[0.98]"
            >
              <RefreshCw className={`w-4 h-4 ${checkingVerification ? 'animate-spin' : ''}`} />
              <span>
                {checkingVerification
                  ? 'Querying Live Verification Status...'
                  : 'Check Verification Status Now'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                saveSession(
                  pendingEntity.email,
                  pendingEntity.role === 'clinic' ? 'clinic_manager' : 'doctor'
                )
              }}
              className="w-full py-3.5 bg-slate-900/90 hover:bg-slate-800 text-white font-bold rounded-2xl border border-white/15 transition-all flex items-center justify-center space-x-2 text-xs cursor-pointer active:scale-[0.98]"
            >
              <CheckCircle2 className="w-4 h-4 text-sky-400" />
              <span>Enter Operational Desk Now (Active Provider Access)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetToAuthChoice()
                handleGoogleSignInWithRole(pendingEntity.role)
              }}
              className="w-full py-3 liquid-glass-card hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200 border border-white/50 dark:border-white/10 font-bold rounded-2xl transition-all text-xs cursor-pointer flex items-center justify-center space-x-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Change Account</span>
            </button>
          </div>

          <div className="p-3.5 liquid-glass-subtle rounded-2xl border border-white/40 dark:border-white/10 text-center">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Standard verification completes within 24–48 business hours. For urgent hospital or diagnostic lab onboarding, contact Dactor Regulatory Support at{' '}
              <span className="font-bold text-slate-700 dark:text-slate-200">dactorofficial@gmail.com</span>.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ==========================================
  // VIEW 2: CLINIC REGISTRATION FORM
  // ==========================================
  if (currentView === 'register_form') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="liquid-glass-elevated liquid-glass-ShatterHighlight rounded-3xl p-6 sm:p-10 shadow-glass-elevated border border-white/60 dark:border-white/15 space-y-6">
          {/* Top Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/40 dark:border-white/10 pb-4">
            <button
              type="button"
              onClick={resetToAuthChoice}
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <span>← Back to Login Desk</span>
            </button>
            <span className="text-xs font-bold px-3 py-1 bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-400/30 rounded-full flex items-center space-x-1">
              <Building2 className="w-3.5 h-3.5" />
              <span>Healthcare Facility Registration</span>
            </span>
          </div>

          {/* Account Not Registered Notice Banner */}
          <div className="p-4 rounded-2xl bg-amber-500/10 backdrop-blur-md border border-amber-300/60 dark:border-amber-500/30 flex items-start space-x-3 text-left">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-black text-amber-900 dark:text-amber-200 block">
                Account Not Registered
              </span>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                No Clinic profile is registered under <strong>"{verifiedEmail}"</strong>. Complete your details below to register, or tap Change Account to use another Gmail.
              </p>
            </div>
          </div>

          {/* Read-Only Selected Google Account Card */}
          <div className="p-4 rounded-2xl bg-brand-500/10 backdrop-blur-md border border-brand-300/60 dark:border-brand-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
            <div className="space-y-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-brand-700 dark:text-brand-300 block">
                Selected Google Account
              </span>
              <span className="text-sm font-black text-slate-900 dark:text-white font-mono block">
                {verifiedEmail}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleGoogleSignInWithRole('clinic')}
              className="px-3.5 py-2 rounded-xl border border-brand-300/60 dark:border-brand-500/30 liquid-glass-card hover:bg-brand-500/15 text-brand-700 dark:text-brand-300 font-bold text-xs shrink-0 cursor-pointer transition shadow-2xs"
            >
              Change Account
            </button>
          </div>

          {/* CLINIC REGISTRATION FORM */}
          <form onSubmit={submitClinicRegistration} className="space-y-6 text-left">
              {regSubmitError && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-2 text-xs font-semibold text-rose-800 dark:text-rose-300 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Registration Failed</p>
                    <p className="text-[11px] font-normal mt-0.5">{regSubmitError}</p>
                  </div>
                </div>
              )}

              {isBrave && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center space-x-2.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                  <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Brave Shields detected: Mobile registration optimized for Brave privacy protections.</span>
                </div>
              )}

              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                  Register Healthcare Facility / Clinic
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Complete all statutory details matching your government registration and 9-digit PAN certificate.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Facility / Clinic Name *
                  </label>
                  <input
                    type="text"
                    value={regClinicName}
                    onChange={(e) => {
                      setRegClinicName(e.target.value)
                      if (regClinicErrors.name) {
                        setRegClinicErrors((prev) => {
                          const next = { ...prev }
                          delete next.name
                          return next
                        })
                      }
                    }}
                    placeholder="e.g. Kathmandu City Polyclinic & Lab"
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold text-slate-900 dark:text-white outline-none"
                  />
                  {regClinicErrors.name && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-1">{regClinicErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Healthcare Facility Type *
                  </label>
                  <select
                    value={regClinicType}
                    onChange={(e) => setRegClinicType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-bold text-slate-800 dark:text-white outline-none"
                  >
                    <option value="opd_clinic">OPD Polyclinic & Consultation Center</option>
                    <option value="diagnostic_lab">Diagnostic Pathology Lab</option>
                    <option value="polyclinic">Multi-Specialty Hospital / Polyclinic</option>
                    <option value="dental">Dental Care Clinic</option>
                    <option value="eye_care">Ophthalmology / Eye Care Center</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      9-Digit PAN Number *
                    </label>
                    {regClinicPan.length === 9 && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Valid</span>
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    maxLength={12}
                    value={regClinicPan}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 9)
                      setRegClinicPan(val)
                      if (regClinicErrors.pan) {
                        setRegClinicErrors((prev) => {
                          const next = { ...prev }
                          delete next.pan
                          return next
                        })
                      }
                    }}
                    placeholder="e.g. 609812345"
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-mono font-bold text-slate-900 dark:text-white outline-none"
                  />
                  {regClinicErrors.pan && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-1">{regClinicErrors.pan}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Clinic Reception Mobile *
                    </label>
                    {regClinicPhone.length === 10 && regClinicPhone.startsWith('9') && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Valid</span>
                      </span>
                    )}
                  </div>
                  <input
                    type="tel"
                    maxLength={14}
                    value={regClinicPhone}
                    onChange={(e) => {
                      const val = normalizeNepalPhone(e.target.value)
                      setRegClinicPhone(val)
                      if (regClinicErrors.phone) {
                        setRegClinicErrors((prev) => {
                          const next = { ...prev }
                          delete next.phone
                          return next
                        })
                      }
                    }}
                    placeholder="98XXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-mono font-bold text-slate-900 dark:text-white outline-none"
                  />
                  {regClinicErrors.phone && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-1">{regClinicErrors.phone}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Clinic Manager Mobile *
                    </label>
                    {regManagerPhone.length === 10 && regManagerPhone.startsWith('9') && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Valid</span>
                      </span>
                    )}
                  </div>
                  <input
                    type="tel"
                    maxLength={14}
                    value={regManagerPhone}
                    onChange={(e) => {
                      const val = normalizeNepalPhone(e.target.value)
                      setRegManagerPhone(val)
                      if (regClinicErrors.managerPhone) {
                        setRegClinicErrors((prev) => {
                          const next = { ...prev }
                          delete next.managerPhone
                          return next
                        })
                      }
                    }}
                    placeholder="98XXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-mono font-bold text-slate-900 dark:text-white outline-none"
                  />
                  {regClinicErrors.managerPhone && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-1">
                      {regClinicErrors.managerPhone}
                    </p>
                  )}
                </div>
              </div>

              {/* Address & Live GPS */}
              <div className="p-4 rounded-2xl liquid-glass-subtle border border-white/50 dark:border-white/10 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Full Street Address & Landmark *
                  </label>
                  <input
                    type="text"
                    value={regClinicAddress}
                    onChange={(e) => {
                      setRegClinicAddress(e.target.value)
                      if (regClinicErrors.address) {
                        setRegClinicErrors((prev) => {
                          const next = { ...prev }
                          delete next.address
                          return next
                        })
                      }
                    }}
                    placeholder="e.g. Maharajgunj Chakrapath, Near Teaching Hospital, Kathmandu"
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold text-slate-900 dark:text-white outline-none"
                  />
                  {regClinicErrors.address && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-1">
                      {regClinicErrors.address}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      GPS Latitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={regClinicLat}
                      onChange={(e) => setRegClinicLat( parseFloat(e.target.value) || 27.7052 )}
                      className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      GPS Longitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={regClinicLng}
                      onChange={(e) => setRegClinicLng( parseFloat(e.target.value) || 85.3193 )}
                      className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleBrowserGPS}
                    disabled={isDetectingLocation}
                    className="py-2 px-3 rounded-xl bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-glass-brand border border-white/25 cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{isDetectingLocation ? 'Detecting GPS...' : 'Detect Live GPS'}</span>
                  </button>
                </div>

                {gpsStatusFeedback && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center space-x-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{gpsStatusFeedback}</span>
                  </div>
                )}

                {gpsErrorFeedback && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-2 text-xs font-semibold text-amber-900 dark:text-amber-200 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p>{gpsErrorFeedback}</p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-300 font-normal mt-0.5">
                        Brave Shields may block automatic GPS. Tap any Nepal City Preset below to set location immediately.
                      </p>
                    </div>
                  </div>
                )}

                {/* Quick Nepal City GPS Presets */}
                <div className="pt-2 border-t border-slate-200/50 dark:border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      Quick Nepal City Presets (13 Major Cities):
                    </span>
                    <span className="text-[10px] text-slate-400">Tap city to auto-fill GPS</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {NEPAL_CITY_PRESETS.map((city) => {
                      const isSelected =
                        Math.abs(regClinicLat - city.lat) < 0.005 &&
                        Math.abs(regClinicLng - city.lng) < 0.005
                      return (
                        <button
                          key={city.name}
                          type="button"
                          onClick={() => {
                            setRegClinicLat(city.lat)
                            setRegClinicLng(city.lng)
                            setSettingLat(city.lat)
                            setSettingLng(city.lng)
                            setGpsStatusFeedback(`Selected preset: ${city.name} (${city.lat}, ${city.lng})`)
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                            isSelected
                              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-xs'
                              : 'liquid-glass-subtle hover:bg-brand-500/15 text-slate-700 dark:text-slate-300 border border-slate-300/40 dark:border-white/10'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                          <span>{city.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Specialties Multi-Select */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Available Medical Specialties & Departments
                </label>
                <div className="flex flex-wrap gap-2">
                  {defaultSpecialtyList.map((spec) => {
                    const selected = regClinicSpecialties.includes(spec)
                    return (
                      <button
                        key={spec}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setRegClinicSpecialties(regClinicSpecialties.filter((s) => s !== spec))
                          } else {
                            setRegClinicSpecialties([...regClinicSpecialties, spec])
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          selected
                            ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white border-white/25 shadow-glass-brand'
                            : 'liquid-glass-subtle text-slate-700 dark:text-slate-200 border-white/50 dark:border-white/10 hover:bg-white/60'
                        }`}
                      >
                        {selected ? `✓ ${spec}` : `+ ${spec}`}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* File Uploads (Registration Doc & Facility Photos) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-dashed border-white/60 dark:border-white/20 liquid-glass-subtle space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <FileText className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <span>Government Registration / PAN Certificate</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Auto-compressed to &le;300 KB before uploading to secure storage.
                  </p>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setRegClinicDocFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-500/15 file:text-brand-700 dark:file:text-brand-300 hover:file:bg-brand-500/25"
                  />
                  {regClinicDocFile && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                      Selected: {regClinicDocFile.name} ({Math.round(regClinicDocFile.size / 1024)} KB)
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-2xl border border-dashed border-white/60 dark:border-white/20 liquid-glass-subtle space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <Camera className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                      <span>Clinic Exterior / Reception Photos</span>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-300">
                      {regClinicPictures.length}/4
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {regClinicPictures.length === 0
                      ? 'Add up to 4 photos. Displayed to patients in Dactor to help identify your building.'
                      : regClinicPictures.length >= 4
                      ? 'Maximum 4 photos added.'
                      : `${regClinicPictures.length}/4 photos added (${4 - regClinicPictures.length} remaining)`}
                  </p>
                  {regClinicPictures.length < 4 && (
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        if (!e.target.files) return
                        const incoming = Array.from(e.target.files)
                        const remaining = 4 - regClinicPictures.length
                        if (remaining <= 0) return
                        if (incoming.length > remaining) {
                          alert(`You can only add up to ${remaining} more picture(s). A maximum of 4 photos is allowed.`)
                        }
                        const toAdd = incoming.slice(0, remaining)
                        setRegClinicPictures((prev) => [...prev, ...toAdd].slice(0, 4))
                        e.target.value = ''
                      }}
                      className="text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-500/15 file:text-brand-700 dark:file:text-brand-300 hover:file:bg-brand-500/25"
                    />
                  )}
                  {regClinicPictures.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex flex-wrap gap-2">
                        {regClinicPictures.map((pic, idx) => (
                          <div
                            key={idx}
                            className="flex items-center space-x-1.5 px-2.5 py-1 bg-white/60 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]"
                          >
                            <span className="font-bold text-slate-500">#{idx + 1}</span>
                            <span className="max-w-[120px] truncate font-medium text-slate-700 dark:text-slate-300">
                              {pic.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => setRegClinicPictures((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-red-500 font-bold ml-1 text-xs"
                              title="Remove photo"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                        {regClinicPictures.length} of 4 photos ready for compression & upload
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  About Facility & Patient Services
                </label>
                <textarea
                  rows={2}
                  value={regClinicDesc}
                  onChange={(e) => setRegClinicDesc(e.target.value)}
                  placeholder="Describe available diagnostic equipment, pharmacy, parking, or visiting hours..."
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-medium text-slate-900 dark:text-white outline-none"
                />
              </div>

              {/* Terms Checkbox */}
              <label className="flex items-start space-x-3 p-3.5 rounded-2xl liquid-glass-subtle border border-white/50 dark:border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={regClinicTermsAccepted}
                  onChange={(e) => setRegClinicTermsAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  I hereby declare that this healthcare facility holds a valid operating license in Nepal, that the 9-digit PAN number is authentic, and I agree to the{' '}
                  <span className="font-bold text-slate-900 dark:text-white">
                    Dactor Healthcare Provider Regulatory Terms & Patient Data Protection Policy
                  </span>
                  .
                </span>
              </label>
              {regClinicErrors.terms && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">{regClinicErrors.terms}</p>
              )}

              {registrationStatusMsg && (
                <div className="p-3.5 rounded-2xl bg-brand-500/10 border border-brand-300/60 dark:border-brand-500/30 text-xs font-bold text-brand-800 dark:text-brand-200 flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-brand-600 shrink-0" />
                  <span>{registrationStatusMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmittingRegistration}
                className="w-full py-4 bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 text-white font-black rounded-2xl shadow-glass-brand border border-white/25 transition-all text-sm cursor-pointer disabled:opacity-60 active:scale-[0.98]"
              >
                {isSubmittingRegistration
                  ? 'Uploading Documents & Creating Clinic Record...'
                  : 'Submit Clinic Registration for Verification'}
              </button>
            </form>
          
        </div>
      </div>
    )
  }

  // ==========================================
  // VIEW 3: CLINIC MANAGER AUTH / GOOGLE LOGIN DESK
  // ==========================================
  if (!isAuthenticated || currentView === 'auth_choice') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="liquid-glass-elevated liquid-glass-ShatterHighlight rounded-3xl p-8 sm:p-10 shadow-glass-elevated border border-white/60 dark:border-white/15 text-center space-y-6">
          {/* Brand Icon */}
          <img
            src={dactorLogo}
            alt="Dactor Logo"
            className="w-16 h-16 rounded-3xl object-contain mx-auto shadow-xl shadow-teal-500/20 bg-white/95 p-1.5 border border-white/60"
          />

          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
              Official Dactor Facility Network
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              Clinic & Diagnostic Facility Portal
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Manage live OPD reception tokens, walk-in registrations, doctor schedules, diagnostic pathology reports, and facility billing.
            </p>
          </div>

          {/* Account Exclusivity Security Notice */}
          <div className="p-3.5 bg-amber-500/10 backdrop-blur-md rounded-2xl border border-amber-300/60 dark:border-amber-500/30 text-left space-y-1">
            <div className="flex items-center space-x-2 text-amber-900 dark:text-amber-200 font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Strict Single-Role Account Security</span>
            </div>
            <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
              Your Google account is exclusively bound to your Clinic Manager profile. In accordance with Dactor security rules, an account cannot be used across Doctor or Patient portals.
            </p>
          </div>

          {/* Error Banner */}
          {firebaseError && (
            <div className="p-4 rounded-2xl bg-rose-500/10 backdrop-blur-md border border-rose-300/60 dark:border-rose-500/30 text-rose-800 dark:text-rose-200 text-xs font-medium text-left space-y-2.5">
              <div className="flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block">Access Restricted</span>
                  <p className="leading-relaxed">{firebaseError}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleGoogleSignInWithRole('clinic')}
                  className="px-3 py-1.5 rounded-xl liquid-glass-card hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-300/60 font-bold text-xs cursor-pointer transition"
                >
                  Change Account
                </button>
              </div>
            </div>
          )}

          {/* Single Google Sign In Button */}
          <button
            type="button"
            onClick={() => handleGoogleSignInWithRole('clinic')}
            disabled={firebaseLoading}
            className="w-full py-4 bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 text-white font-black rounded-2xl shadow-glass-brand border border-white/25 transition-all flex items-center justify-center space-x-3 text-sm cursor-pointer disabled:opacity-60 active:scale-[0.98]"
          >
            {firebaseLoading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin text-white" />
                <span>Verifying Clinic Account...</span>
              </>
            ) : (
              <>
                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                </div>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Terms & Policy Disclosure Button */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-300 underline cursor-pointer transition"
            >
              By continuing, you accept Dactor&apos;s Clinic Terms &amp; Policy
            </button>
          </div>

          <div className="p-3.5 liquid-glass-subtle rounded-2xl border border-white/40 dark:border-white/10 text-left space-y-1">
            <div className="flex items-center space-x-2 text-slate-800 dark:text-slate-200 font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>Unified Clinic Login &amp; Registration</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Sign in with your Google account above. Verified clinics enter their operational dashboard directly; new healthcare facilities are guided through registration.
            </p>
          </div>
        </div>

        {/* Terms Modal accessible from Login Screen */}
        {showTermsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-md">
            <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-6 shadow-glass-modal border border-white/60 dark:border-white/15 space-y-4 max-h-[85vh] flex flex-col text-left animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-white/40 dark:border-white/10">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                    Healthcare Governance
                  </span>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Dactor Clinic Terms, Privacy &amp; Regulatory Compliance
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  className="p-1.5 rounded-full liquid-glass-subtle text-slate-500 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed pr-1">
                <p>
                  <strong>1. Nepal Medical Council (NMC) &amp; MoHP Compliance:</strong> All doctors and laboratory personnel registered under this clinic must hold valid, active licenses from the Nepal Medical Council (NMC) or Nepal Health Professional Council (NHPC).
                </p>
                <p>
                  <strong>2. Patient Data Confidentiality:</strong> Patient medical records, diagnostic pathology reports, and contact details are strictly confidential and protected under Nepal&apos;s Individual Privacy Act. Laboratory reports require patient name/mobile verification before viewing.
                </p>
                <p>
                  <strong>3. Transparent Billing &amp; PAN Disclosure:</strong> Clinics issuing digital invoices or accepting direct eSewa/Khalti/Fonepay settlements are responsible for accurate tax and PAN reporting.
                </p>
                <p>
                  <strong>4. 30-Day Reversible Account Archive Policy:</strong> When a clinic schedules account deletion, all public listings are hidden immediately, while historical patient records remain safely archived for 30 days in case the clinic administrator chooses to restore the account.
                </p>
              </div>
              <div className="pt-2 border-t border-white/40 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                <a
                  href="./privacy-clinic.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-600 dark:text-teal-400 font-bold hover:underline text-xs flex items-center gap-1 cursor-pointer"
                >
                  <span>Read Official Clinic &amp; Provider Privacy Policy &rarr;</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  className="px-5 py-2.5 bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 text-white rounded-xl text-xs font-bold shadow-glass-brand border border-white/25 cursor-pointer"
                >
                  I Understand &amp; Acknowledge
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ==========================================
  // VIEW: LOGGED IN OPERATIONAL CLINIC PORTAL
  // ==========================================
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-8 pb-28 sm:pb-12">
      {/* 30-DAY ARCHIVE LOCK BANNER */}
      {selectedClinic?.isArchived && (
        <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-rose-950/85 backdrop-blur-xl text-white border border-rose-500/60 shadow-glass-elevated flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3 sm:space-x-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-rose-600/80 border border-rose-400/50 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500 text-white">
                  30-Day Deletion Grace Period
                </span>
                <span className="text-xs font-mono font-bold text-rose-200">
                  {archiveDaysLeft} Days Remaining
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black">
                Clinic Account Archived &amp; Hidden from Patient Bookings
              </h2>
              <p className="text-xs text-rose-200 max-w-2xl leading-relaxed">
                This clinic is scheduled for permanent deletion on{' '}
                <strong>{selectedClinic.deletionScheduledAt?.split('T')[0] || '30 days from archive'}</strong>. You can reactivate or reclaim full operational status anytime before the 30-day countdown expires.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancelClinicArchive}
            className="w-full md:w-auto px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl text-xs shadow-lg cursor-pointer shrink-0 transition active:scale-[0.98]"
          >
            Reactivate / Reclaim Clinic Account
          </button>
        </div>
      )}

      {/* Top Banner / Clinic Context Bar */}
      <div className="liquid-glass-elevated liquid-glass-ShatterHighlight rounded-2xl sm:rounded-3xl border border-white/60 dark:border-white/15 p-4 sm:p-6 shadow-glass-elevated flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-teal-500 text-white flex items-center justify-center font-black text-xl shrink-0 overflow-hidden border border-white/40 shadow-glass-brand relative">
            {selectedClinic?.logoUrl || (selectedClinic?.pictures && selectedClinic.pictures.length > 0) ? (
              <img
                src={selectedClinic.logoUrl || selectedClinic.pictures![0]}
                alt={selectedClinic?.name || 'Clinic Photo'}
                className="w-full h-full object-cover"
                onError={(e) => {
                  ;(e.target as HTMLElement).style.display = 'none'
                }}
              />
            ) : (
              <Building2 className="w-6 h-6 sm:w-8 sm:h-8" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h1 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white truncate">
                {selectedClinic?.name}
              </h1>
              {/* Subscription Status Pill */}
              <button
                type="button"
                onClick={() => setShowRenewalModal(true)}
                className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black border flex items-center gap-1 cursor-pointer transition ${
                  isSubscriptionActive
                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-400/40 hover:bg-emerald-500/25'
                    : 'bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-400/40 hover:bg-rose-500/25 animate-pulse'
                }`}
                title="Click to manage Clinic Subscription & License Renewal"
              >
                <CreditCard className="w-3 h-3" />
                <span>
                  {isSubscriptionActive
                    ? `Active • ${subscriptionDaysLeft}d left`
                    : 'Expired • Renew'}
                </span>
              </button>

              {selectedClinic?.pictures && selectedClinic.pictures.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDeskTab('settings')}
                  className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold liquid-glass-subtle hover:bg-brand-500/15 text-slate-700 dark:text-slate-200 hover:text-brand-800 dark:hover:text-brand-300 border border-white/50 dark:border-white/10 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Click to view and manage clinic facility photos in Settings"
                >
                  <Camera className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                  <span>{selectedClinic.pictures.length} {selectedClinic.pictures.length === 1 ? 'Photo' : 'Photos'}</span>
                </button>
              )}
              <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-brand-500/15 text-brand-800 dark:text-brand-300 border border-brand-400/30">
                {selectedClinic?.type === 'diagnostic_lab'
                  ? 'Diagnostic Lab'
                  : selectedClinic?.type === 'single_Specialty'
                  ? 'Single Specialty'
                  : 'Polyclinic OPD'}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Logged in as <strong className="text-slate-800 dark:text-slate-200">{authEmail}</strong> • Active Operational Desk
            </p>
          </div>
        </div>

        {/* Action Controls in Header */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full md:w-auto justify-between md:justify-end pt-2 md:pt-0 border-t md:border-t-0 border-white/40 dark:border-white/10">
          {/* Connectivity Status Pill (R3 Parity) */}
          <button
            type="button"
            onClick={handleTriggerManualSync}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-glass-sm active:scale-[0.98] ${
              syncStatus.state === 'syncing'
                ? 'bg-blue-500/15 border-blue-400/40 text-blue-800 dark:text-blue-200 animate-pulse'
                : syncStatus.state === 'error'
                ? 'bg-rose-500/20 border-rose-400/50 text-rose-900 dark:text-rose-200 hover:bg-rose-500/30'
                : syncStatus.state === 'offline'
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-900 dark:text-amber-200 hover:bg-amber-500/30'
                : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/25'
            }`}
            title={
              syncStatus.state === 'syncing'
                ? `Synchronizing ${syncStatus.pendingCount} pending offline changes to cloud...`
                : syncStatus.state === 'error'
                ? `Sync error: ${syncStatus.error || 'Failed to sync with cloud'}. Tap to retry.`
                : syncStatus.state === 'offline'
                ? `Offline Mode: Reception is fully functional. ${syncStatus.pendingCount} changes queued locally for sync.`
                : 'Cloud Connected: All clinic data synchronized in real-time. Tap to check updates.'
            }
          >
            {syncStatus.state === 'syncing' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin" />
                <span>Syncing ({syncStatus.pendingCount})...</span>
              </>
            ) : syncStatus.state === 'error' ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
                <span className="font-black">Sync Error</span>
              </>
            ) : syncStatus.state === 'offline' ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
                <span className="font-black">Offline Mode ({syncStatus.pendingCount} queued)</span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50" />
                <span className="font-black">Cloud Connected</span>
              </>
            )}
          </button>

          {/* Notification Bell Drawer Trigger */}
          <button
            type="button"
            onClick={() => setShowNotificationsModal(true)}
            className="relative p-2 sm:p-2.5 rounded-xl liquid-glass-subtle hover:bg-brand-500/15 text-slate-700 dark:text-slate-200 hover:text-brand-700 border border-white/50 dark:border-white/10 transition cursor-pointer"
            title="View Clinic Notifications"
          >
            <Bell className="w-4 h-4" />
            {clinicNotifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center">
                {Math.min(9, clinicNotifications.length)}
              </span>
            )}
          </button>

          {/* Doctor Presence Toggle */}
          {selectedDoctor && (
            <button
              onClick={() => handleToggleDoctorPresence(selectedDoctor)}
              disabled={updatingPresence}
              className={`flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                doctorInClinic
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/25'
                  : 'bg-rose-500/15 border-rose-400/40 text-rose-800 dark:text-rose-300 hover:bg-rose-500/25'
              }`}
              title="Click to toggle Doctor In-Clinic Presence"
            >
              <span
                className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${
                  doctorInClinic ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span className="truncate">{doctorInClinic ? 'Doctor In' : 'Doctor Out'}</span>
            </button>
          )}

          {/* Clinic Break Toggle */}
          <button
            onClick={handleToggleClinicBreak}
            disabled={updatingBreak}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              clinicOnBreak
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-900 dark:text-amber-200 hover:bg-amber-500/30'
                : 'liquid-glass-subtle border-white/50 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-white/60'
            }`}
            title="Click to toggle Clinic Break mode (broadcasts alert to all patients)"
          >
            <Coffee className="w-3.5 h-3.5" />
            <span>{clinicOnBreak ? 'On Break' : 'Take Break'}</span>
          </button>

          {!isLabClinic && (
          <button
            onClick={() => setDeskTab('invitations')}
            className="flex items-center space-x-1 px-2.5 sm:px-3 py-2 bg-brand-500/15 hover:bg-brand-500/25 text-brand-800 dark:text-brand-300 border border-brand-400/40 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            title="Invite doctors & lab technicians to clinic roster"
          >
            <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Add / Invite Doctor</span>
          </button>
        )}

          <button
            onClick={handleLogout}
            className="flex items-center space-x-1 px-2.5 sm:px-3 py-2 liquid-glass-subtle hover:bg-rose-500/15 hover:text-rose-600 text-slate-600 dark:text-slate-300 border border-white/50 dark:border-white/10 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* ACTIVE PORTAL SUBSCRIPTION EXPIRY BANNER (Red alert when expiring within 7 days and not dismissed) */}
      {isSubscriptionActive && subscriptionDaysLeft <= 7 && !isExpiryBannerDismissed && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/60 rounded-2xl p-3 sm:p-4 flex items-center justify-between shadow-sm animate-in fade-in">
          <div
            onClick={() => setShowRenewalModal(true)}
            className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
          >
            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-rose-900 dark:text-rose-200 truncate">
                Active Portal Subscription ({subscriptionDaysLeft} days left)
              </h4>
              <p className="text-[11px] text-rose-700 dark:text-rose-400 truncate">
                Expires on {selectedClinic?.activationExpiresAt?.split('T')[0] || 'soon'} • Click to renew
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpiryBannerDismissed(true)
              try {
                sessionStorage.setItem('dismiss_clinic_expiry_banner', 'true')
              } catch {}
            }}
            className="p-1.5 rounded-full hover:bg-rose-200/60 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 transition cursor-pointer shrink-0 ml-2"
            title="Remove notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Desk Tabs (All 15 Modules) */}
      <div className="flex items-center space-x-2 p-1.5 rounded-2xl liquid-glass-base overflow-x-auto scrollbar-none">
        <button
          onClick={() => {
            const d = new Date()
            const todayLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            setSelectedQueueDate(todayLocal)
            setDeskTab('queue')
          }}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'queue'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Live OPD Queue ({queueWaitingCount})</span>
        </button>

        <button
          onClick={() => setDeskTab('pay_at_desk_requests')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'pay_at_desk_requests'
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>View Requests</span>
          {payAtDeskCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-900 animate-pulse">
              {payAtDeskCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setDeskTab('walkin')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'walkin'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Reception Walk-In</span>
        </button>

        <button
          onClick={() => setDeskTab('slots')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'slots'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <CalendarClock className="w-4 h-4" />
          <span>{isLabClinic ? 'Lab Collection Slots' : 'Timed Slots Publisher'}</span>
        </button>

        <button
          onClick={() => setDeskTab('future_appts')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'future_appts'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Future Appointments & Holidays</span>
        </button>

        <button
          onClick={() => setDeskTab('noshow')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'noshow'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-rose-700 dark:text-rose-300 hover:bg-rose-500/15'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>No-Show Patients ({noShowAppointments.length})</span>
        </button>

        <button
          onClick={() => setDeskTab('fees')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'fees'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Consultation Fees</span>
        </button>

        <button
          onClick={() => setDeskTab('invitations')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'invitations'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Doctor & Staff Invitations</span>
        </button>

        <button
          onClick={() => setDeskTab('working_hours')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'working_hours'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Working Hours & Break Schedule</span>
        </button>

        <button
          onClick={() => setDeskTab('doctors')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'doctors'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          <span>Doctors & Staff ({clinicDoctors.length})</span>
        </button>

        <button
          onClick={() => setDeskTab('billing')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'billing'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Bills & Invoices</span>
        </button>

        <button
          onClick={() => setDeskTab('payment_logs')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'payment_logs'
              ? 'bg-gradient-to-r from-teal-600 to-emerald-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Payment Logs</span>
        </button>

        <button
          onClick={() => setDeskTab('patients')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'patients'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Patient Directory</span>
        </button>

        {isDiagnosticLab && (
          <button
            onClick={() => setDeskTab('lab')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              deskTab === 'lab'
                ? 'bg-gradient-to-r from-teal-600 to-brand-500 text-white shadow-glass-brand border border-white/25'
                : 'text-teal-800 dark:text-teal-300 hover:bg-teal-500/15'
            }`}
          >
            <FlaskConical className="w-4 h-4" />
            <span>Diagnostic Lab Pipeline</span>
          </button>
        )}

        {isDiagnosticLab && (
          <button
            onClick={() => setDeskTab('rates')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              deskTab === 'rates'
                ? 'bg-gradient-to-r from-teal-600 to-brand-500 text-white shadow-glass-brand border border-white/25'
                : 'text-teal-800 dark:text-teal-300 hover:bg-teal-500/15'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Lab Tests & Rates</span>
          </button>
        )}

        <button
          onClick={() => setDeskTab('broadcast')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'broadcast'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Broadcast Alerts</span>
        </button>


        <button
          onClick={() => setDeskTab('settings')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            deskTab === 'settings'
              ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand border border-white/25'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Clinic Settings</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* DESK TAB 1: LIVE OPD QUEUE MANAGEMENT */}
      {/* ========================================================= */}
      {deskTab === 'queue' && (
        <div className="space-y-6">
          {/* Collapsible Doctor Roster & Controls Bar (Smooth transition on scroll) */}
          <div
            className={`transition-all duration-300 ease-in-out transform origin-top space-y-4 ${
              isScrolledDown
                ? 'max-h-0 opacity-0 overflow-hidden pointer-events-none scale-y-95 mb-0'
                : 'max-h-[1200px] opacity-100 scale-y-100 mb-6'
            }`}
          >
            {/* Enlisted Doctors & Presence Roster Bar with Master Switch */}
          {clinicDoctors.length > 0 && !isLabClinic && (
            <div className="liquid-glass-card p-5 rounded-3xl border border-white/60 dark:border-white/15 shadow-glass-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/40 dark:border-white/10 pb-3">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <span>Enlisted Doctors & Live Cabin Presence Roster ({clinicDoctors.filter((d) => d.isInClinic ?? true).length}/{clinicDoctors.length} Present)</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Toggle individual doctor presence or use the Master Switch to set all doctors Present or Off-Duty.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={updatingPresence}
                    onClick={() => handleToggleAllDoctorsPresence(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 border border-emerald-400/40 text-xs font-bold cursor-pointer transition active:scale-[0.98]"
                  >
                    ● Set All Present
                  </button>
                  <button
                    type="button"
                    disabled={updatingPresence}
                    onClick={() => handleToggleAllDoctorsPresence(false)}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-800 dark:text-rose-300 border border-rose-400/40 text-xs font-bold cursor-pointer transition active:scale-[0.98]"
                  >
                    ○ Set All Off-Duty
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {clinicDoctors.map((doc) => {
                  const isPresent = doc.isInClinic ?? true
                  return (
                    <div
                      key={doc.id}
                      className={`px-3 py-2 rounded-2xl border flex items-center space-x-2.5 text-xs transition ${
                        isPresent
                          ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-950 dark:text-emerald-200'
                          : 'liquid-glass-subtle border-white/40 dark:border-white/10 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-brand-500 to-teal-500 text-white font-black flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                        {doc.profilePictureUrl ? (
                          <img src={doc.profilePictureUrl} alt={doc.fullName} className="w-full h-full object-cover" />
                        ) : (
                          doc.fullName.charAt(0)
                        )}
                      </div>
                      <div>
                        <span className="font-bold block leading-tight">{doc.fullName}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{doc.specialty || 'General'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleDoctorPresence(doc)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black cursor-pointer transition ${
                          isPresent
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-400/30'
                        }`}
                      >
                        {isPresent ? 'IN' : 'OUT'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!loading && clinicDoctors.length === 0 && !isLabClinic && (
            <div className="liquid-glass-card p-6 rounded-3xl border border-blue-200/60 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/20 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                <UserPlus className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">No Doctors Enlisted</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                No medical specialists are currently connected with this clinic. Invite doctors to manage queues and publish OPD slots.
              </p>
              <button
                type="button"
                onClick={() => setDeskTab('invitations')}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add / Invite Doctor</span>
              </button>
            </div>
          )}

          {/* Top Banner Alert if Doctor is Away or Clinic is on Break */}
          {!loading && clinicDoctors.length > 0 && !doctorInClinic && !isLabClinic && (
            <div className="p-4 bg-rose-500/10 backdrop-blur-md border border-rose-300/60 dark:border-rose-500/30 rounded-2xl flex items-center space-x-3 text-rose-800 dark:text-rose-200 text-xs font-bold">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <span>Doctor is not inside the clinic (He/She is not in).</span>
                <span className="font-normal text-rose-700 dark:text-rose-300 ml-1">
                  Patients checking their queue status are informed that the doctor is currently away.
                </span>
              </div>
            </div>
          )}

          {clinicOnBreak && (
            <div className="p-4 bg-amber-500/10 backdrop-blur-md border border-amber-300/60 dark:border-amber-500/30 rounded-2xl flex items-center space-x-3 text-amber-900 dark:text-amber-200 text-xs font-bold">
              <Coffee className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <span>Clinic is currently in Break Mode.</span>
                <span className="font-normal text-amber-800 dark:text-amber-300 ml-1">
                  All consultations are temporarily paused. Patients can see the break notice on their mobile tracker.
                </span>
              </div>
            </div>
          )}

          {/* Queue Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="liquid-glass-card p-4 rounded-2xl border border-white/50 dark:border-white/10 shadow-glass-sm">
              <span className="text-[11px] font-bold uppercase text-slate-400">Waiting Patients</span>
              <p className="text-2xl font-black text-sky-500 dark:text-sky-400 mt-1">{queueWaitingCount}</p>
            </div>
            <div className="liquid-glass-card p-4 rounded-2xl border border-white/50 dark:border-white/10 shadow-glass-sm">
              <span className="text-[11px] font-bold uppercase text-slate-400">Inside Cabin</span>
              <p className="text-2xl font-black text-amber-500 dark:text-amber-400 mt-1">{queueInsideCount}</p>
            </div>
            <div className="liquid-glass-card p-4 rounded-2xl border border-white/50 dark:border-white/10 shadow-glass-sm">
              <span className="text-[11px] font-bold uppercase text-slate-400">Completed Today</span>
              <p className="text-2xl font-black text-teal-500 dark:text-teal-400 mt-1">{queueCompletedCount}</p>
            </div>
            <div className="liquid-glass-card p-4 rounded-2xl border border-white/50 dark:border-white/10 shadow-glass-sm">
              <span className="text-[11px] font-bold uppercase text-slate-400">Total Registered</span>
              <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{todayAppointments.length}</p>
            </div>
          </div>

          {/* Consultation Timing Configuration Bar (Auto vs Manual Toggle) */}
          <div className="liquid-glass-card p-4 rounded-2xl border border-white/50 dark:border-white/10 shadow-glass-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl liquid-glass-subtle flex items-center justify-center text-slate-600 dark:text-slate-300">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Average Consultation Time Mode</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  Configures the estimated wait calculation for all patients in today's live queue.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Auto / Manual toggle buttons */}
              <div className="flex p-1 liquid-glass-subtle rounded-xl border border-white/40 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setAvgTimeMode('auto')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    avgTimeMode === 'auto'
                      ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Auto Calculated
                </button>
                <button
                  type="button"
                  onClick={() => setAvgTimeMode('manual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    avgTimeMode === 'manual'
                      ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-glass-brand'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Manual Time
                </button>
              </div>

              {avgTimeMode === 'manual' && (
                <div className="flex items-center space-x-1.5">
                  <input
                    type="number"
                    min="2"
                    max="60"
                    value={manualAvgMinutes}
                    onChange={(e) => setManualAvgMinutes(Number(e.target.value) || 10)}
                    className="w-16 px-2.5 py-1.5 liquid-glass-input rounded-lg text-xs font-bold text-center text-slate-900 dark:text-white outline-none"
                  />
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Mins</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveAvgTimeSettings}
                disabled={savingAvgTime}
                className="px-3 py-1.5 bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 text-white rounded-lg text-xs font-bold transition-colors shadow-glass-brand border border-white/25 cursor-pointer active:scale-[0.98]"
              >
                {savingAvgTime ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>

        {/* Compact Sticky Queue Summary Bar when scrolled down */}
        {isScrolledDown && (
          <div
            onClick={() => setIsScrolledDown(false)}
            className="sticky top-2 z-20 liquid-glass-elevated px-4 py-2.5 rounded-2xl border border-white/60 dark:border-white/20 shadow-glass-sm flex items-center justify-between cursor-pointer transition-all duration-300 hover:bg-white/80 dark:hover:bg-slate-800/80"
          >
            <div className="flex items-center space-x-3 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Activity className="w-4 h-4 text-brand-600" />
              <span>Live OPD Queue: {queueWaitingCount} Waiting • {queueInsideCount} Inside • {queueCompletedCount} Completed</span>
            </div>
            <span className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1">
              Show Roster &amp; Controls ▲
            </span>
          </div>
        )}

          {/* Active Cabin Card (Patient currently inside) */}
          {activeConsultationPatient && (
            <div className="p-5 bg-amber-500/10 backdrop-blur-md border border-amber-300/60 dark:border-amber-500/30 rounded-3xl shadow-glass-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg animate-pulse shadow-md">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full border border-amber-400/30">
                      Currently Inside Doctor Cabin
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-900 dark:text-amber-200">
                      Token #{activeConsultationPatient.trackingCode10Digit}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {activeConsultationPatient.patientName} ({activeConsultationPatient.patientAge || '–'} Yrs, {activeConsultationPatient.patientGender || '–'})
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Attending: {activeConsultationPatient.doctor?.fullName || selectedDoctor?.fullName || 'OPD Doctor'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 w-full md:w-auto">
                <button
                  onClick={() => {
                    if (isDiagnosticLabClinic(selectedClinic, null, activeConsultationPatient)) {
                      handleMarkDiagnosticProcessing(activeConsultationPatient)
                    } else {
                      handleStatusChange(activeConsultationPatient.id, 'completed')
                    }
                  }}
                  className="flex-1 md:flex-initial px-4 py-2.5 bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 text-white text-xs font-bold rounded-xl shadow-glass-brand border border-white/25 transition-colors cursor-pointer active:scale-[0.98]"
                >
                  {isDiagnosticLabClinic(selectedClinic, null, activeConsultationPatient)
                    ? 'Mark Done (Processing)'
                    : 'Mark Consultation Done'}
                </button>
                <button
                  onClick={() => handleOpenRemarkModal(activeConsultationPatient)}
                  className="px-3 py-2.5 liquid-glass-card hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200 border border-white/50 dark:border-white/10 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  title="Add or edit clinical remark"
                >
                  Remark
                </button>
                <button
                  onClick={() => handleOpenPushAlertModal(activeConsultationPatient)}
                  className="px-3 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 border border-amber-300/60 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  title="Send push alert to patient"
                >
                  <Bell className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleOpenBillModal(activeConsultationPatient)}
                  className="px-3 py-2.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-800 dark:text-sky-200 border border-sky-300/60 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  title="Push Bill / Settle Payment"
                >
                  <Receipt className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Date Scroller (Patient App Style, Compact) */}
          <DateScroller
            selectedDate={selectedQueueDate}
            onSelectDate={(d) => {
              setSelectedQueueDate(d)
              setExpandedQueueApptId(null)
            }}
            className="mb-3"
          />

          {/* Section Header + Segmented Sub-Tabs (Live vs Processing vs Completed) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 p-1 liquid-glass-subtle rounded-xl border border-white/40 dark:border-white/10 overflow-x-auto no-scrollbar max-w-full">
              <button
                type="button"
                onClick={() => {
                  setQueueSubTab('waiting')
                  setExpandedQueueApptId(null)
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  queueSubTab === 'waiting'
                    ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Live ({queueWaitingCount + queueInsideCount})
              </button>
              {(isLabClinic || queueProcessingCount > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setQueueSubTab('processing')
                    setExpandedQueueApptId(null)
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer inline-flex items-center space-x-1 ${
                    queueSubTab === 'processing'
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  <span>Processing ({queueProcessingCount})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setQueueSubTab('past')
                  setExpandedQueueApptId(null)
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  queueSubTab === 'past'
                    ? 'bg-gradient-to-r from-brand-600 to-teal-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Completed (
                {todayAppointments.filter(
                  (a) =>
                    a.checkinStatus === 'completed' ||
                    a.checkinStatus === 'done' ||
                    a.checkinStatus === 'report_prepared' ||
                    a.checkinStatus === 'no_show' ||
                    a.checkinStatus === 'cancelled'
                ).length}
                )
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleTriggerAutoNotify}
                className="flex items-center space-x-1.5 text-xs font-bold text-amber-900 dark:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-300/60 px-2.5 py-1.5 rounded-xl cursor-pointer transition-colors"
                title={`Notify patients who are ≤ ${settingThreshold} spots away from consultation cabin`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Auto-Notify (&le; {settingThreshold})</span>
              </button>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                className="flex items-center space-x-1.5 text-xs font-bold text-brand-700 dark:text-brand-300 liquid-glass-subtle border border-brand-400/30 px-2.5 py-1.5 rounded-xl cursor-pointer transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {todayAppointments.length === 0 ? (
            <div className="p-12 text-center liquid-glass-card rounded-3xl border border-white/60 dark:border-white/10 shadow-glass-sm">
              <Activity className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h3 className="font-bold text-slate-800 dark:text-slate-200">
                No appointments scheduled for {selectedQueueDate}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Patients scheduled or registered for this date will automatically appear here.
              </p>
            </div>
          ) : (
            <div className="liquid-glass-elevated rounded-3xl border border-white/60 dark:border-white/15 overflow-hidden shadow-glass-base">
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)] min-h-[360px] scrollbar-thin">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 liquid-glass-subtle border-b border-white/40 dark:border-white/10 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-bold backdrop-blur-md bg-white/95 dark:bg-slate-900/95 shadow-xs">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center">Turn</th>
                      <th className="py-3 px-4">Patient</th>
                      <th className="py-3 px-4">Doctor</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/30 dark:divide-white/5 font-medium">
                    {todayAppointments
                      .filter((appt) => {
                        if (queueSubTab === 'waiting') {
                          return (
                            appt.checkinStatus === 'waiting' ||
                            appt.checkinStatus === 'in_consultation' ||
                            appt.checkinStatus === 'inside'
                          )
                        }
                        if (queueSubTab === 'processing') {
                          return (
                            appt.checkinStatus === 'processing' ||
                            appt.checkinStatus === 'sample_collected'
                          )
                        }
                        return (
                          appt.checkinStatus === 'completed' ||
                          appt.checkinStatus === 'done' ||
                          appt.checkinStatus === 'report_prepared' ||
                          appt.checkinStatus === 'no_show' ||
                          appt.checkinStatus === 'cancelled'
                        )
                      })
                      .map((appt, idx) => {
                        const isWaiting = appt.checkinStatus === 'waiting'
                        const inCabin =
                          appt.checkinStatus === 'in_consultation' || appt.checkinStatus === 'inside'
                        const isProcessing =
                          appt.checkinStatus === 'processing' || appt.checkinStatus === 'sample_collected'
                        const isReportPrepared = appt.checkinStatus === 'report_prepared'
                        const isDone =
                          appt.checkinStatus === 'completed' ||
                          appt.checkinStatus === 'done' ||
                          isReportPrepared
                        const isDiagAppt = isDiagnosticLabClinic(selectedClinic, null, appt)
                        const isExpanded = expandedQueueApptId === appt.id

                        return (
                          <React.Fragment key={appt.id}>
                            <tr
                              onClick={() => setExpandedQueueApptId(isExpanded ? null : appt.id)}
                              className={`transition-colors cursor-pointer ${
                                isExpanded
                                  ? 'bg-blue-50/60 dark:bg-slate-800/60'
                                  : 'hover:bg-white/40 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              {/* Turn # */}
                              <td className="py-3.5 px-4 text-center font-black text-brand-700 dark:text-brand-300">
                                #{idx + 1}
                              </td>

                              {/* Patient Name & Demographics (Token is hidden until tapped) */}
                              <td className="py-3.5 px-4">
                                <div className="font-bold text-slate-900 dark:text-white text-sm">
                                  {appt.patientName}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  {appt.patientAge ? `${appt.patientAge} Yrs` : ''}
                                  {appt.patientAge && appt.patientGender ? ' • ' : ''}
                                  {appt.patientGender || ''}
                                </div>
                                {appt.notes && (
                                  <div className="mt-1 px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-300/50 text-[10px] text-amber-900 dark:text-amber-200 font-medium line-clamp-1">
                                    Remark: {appt.notes}
                                  </div>
                                )}
                              </td>

                              {/* Doctor */}
                              <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                                {appt.doctor?.fullName || selectedDoctor?.fullName || 'General OPD'}
                              </td>

                              {/* Status Badge */}
                              <td className="py-3.5 px-4">
                                {inCabin ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-400/40 animate-pulse">
                                    Inside Cabin
                                  </span>
                                ) : isProcessing ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-900 dark:text-blue-200 border border-blue-400/40">
                                    {appt.checkinStatus === 'sample_collected' ? 'Sample Collected' : 'Processing in Lab'}
                                  </span>
                                ) : isReportPrepared ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-900 dark:text-teal-200 border border-teal-400/40">
                                    Report Prepared
                                  </span>
                                ) : isDone ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border border-emerald-400/40">
                                    Completed
                                  </span>
                                ) : appt.checkinStatus === 'no_show' ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-900 dark:text-rose-200 border border-rose-400/40">
                                    No-Show
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-900 dark:text-sky-200 border border-sky-400/40">
                                    Waiting
                                  </span>
                                )}
                              </td>

                              {/* Payment */}
                              <td className="py-3.5 px-4">
                                <div className="flex flex-col items-start gap-1">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      appt.paymentStatus === 'paid'
                                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-400/40'
                                        : appt.paymentStatus === 'partial'
                                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-400/40'
                                        : 'liquid-glass-subtle text-slate-700 dark:text-slate-300 border border-white/40'
                                    }`}
                                  >
                                    Rs. {getEffectiveAppointmentTotal(appt) || 500} • {appt.paymentStatus.toUpperCase()}
                                  </span>
                                  {String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK' && appt.paymentStatus !== 'paid' && (
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        const res = await markPayAtDeskCollected(appt.id, selectedClinic?.id)
                                        if (res.success) {
                                          const collectedAmt = res.totalAmount || getEffectiveAppointmentTotal(appt)
                                          setAppointments((prev) =>
                                            prev.map((a) =>
                                              a.id === appt.id
                                                ? { ...a, paymentStatus: 'paid', totalAmount: collectedAmt }
                                                : a
                                            )
                                          )
                                          setRefreshKey((k) => k + 1)
                                        }
                                      }}
                                      className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-bold cursor-pointer shadow-xs"
                                    >
                                      Mark Paid (Rs. {getEffectiveAppointmentTotal(appt) || 500})
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* Action Cell: ONLY Call Inside or Mark Done without tapping */}
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                {isWaiting && (
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        try {
                                          playClinicChime()
                                        } catch {}
                                        await handleStatusChange(appt.id, 'in_consultation')
                                      }}
                                      className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg font-bold text-xs shadow-sm cursor-pointer active:scale-[0.98] inline-flex items-center space-x-1"
                                    >
                                      <Bell className="w-3.5 h-3.5" />
                                      <span>{isDiagAppt ? 'Call' : 'Call Inside'}</span>
                                    </button>
                                    {isDiagAppt && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleMarkDiagnosticProcessing(appt)
                                        }}
                                        className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg font-bold text-xs shadow-sm cursor-pointer active:scale-[0.98] inline-flex items-center space-x-1"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>Mark Done (Processing)</span>
                                      </button>
                                    )}
                                  </div>
                                )}

                                {inCabin && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (isDiagAppt) {
                                        handleMarkDiagnosticProcessing(appt)
                                      } else {
                                        handleStatusChange(appt.id, 'completed')
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg font-bold text-xs shadow-sm cursor-pointer active:scale-[0.98] inline-flex items-center space-x-1"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>{isDiagAppt ? 'Mark Done (Processing)' : 'Mark Done'}</span>
                                  </button>
                                )}

                                {isProcessing && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setTargetLabAppt(appt)
                                      setLabUploadModalOpen(true)
                                    }}
                                    className="px-3 py-1.5 bg-gradient-to-r from-brand-600 to-teal-600 hover:from-brand-700 hover:to-teal-700 text-white rounded-lg font-bold text-xs shadow-sm cursor-pointer active:scale-[0.98] inline-flex items-center space-x-1"
                                  >
                                    <UploadCloud className="w-3.5 h-3.5" />
                                    <span>Prepare Report</span>
                                  </button>
                                )}

                                {appt.checkinStatus === 'no_show' && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleStatusChange(appt.id, 'waiting')
                                    }}
                                    className="px-2.5 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 border border-blue-400/40 rounded-lg font-bold text-xs cursor-pointer inline-flex items-center space-x-1"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    <span>Re-Queue</span>
                                  </button>
                                )}
                              </td>
                            </tr>

                            {/* Tapped / Expanded Options Drawer */}
                            {isExpanded && (
                              <tr className="bg-slate-50/90 dark:bg-slate-900/90">
                                <td colSpan={6} className="px-4 py-3.5">
                                  <div className="p-3.5 rounded-2xl liquid-glass-subtle border border-brand-500/20 space-y-3">
                                    {/* Patient Info with Token & Direct Phone Call Button */}
                                    <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-white/50 dark:border-white/10">
                                      <div className="flex items-center space-x-3">
                                        <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 liquid-glass-card px-2.5 py-1 rounded-lg border border-white/40">
                                          Token: #{appt.trackingCode10Digit}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard?.writeText(appt.trackingCode10Digit)
                                            alert(`Copied Token #${appt.trackingCode10Digit}`)
                                          }}
                                          className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                                        >
                                          Copy
                                        </button>
                                      </div>

                                      {/* Direct Call Patient Option */}
                                      {appt.patientMobile && (
                                        <a
                                          href={`tel:${appt.patientMobile}`}
                                          onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 border border-emerald-400/40 text-xs font-bold transition cursor-pointer"
                                        >
                                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                                          <span>Call Patient ({appt.patientMobile})</span>
                                        </a>
                                      )}
                                    </div>

                                    {/* Action Options Row */}
                                    <div className="flex flex-wrap items-center gap-2">
                                      {/* Slide Up / Down / Emergency Priority (if waiting) */}
                                      {isWaiting && (
                                        <div className="inline-flex items-center rounded-xl border border-white/50 dark:border-white/10 p-1 liquid-glass-subtle space-x-1">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase px-1">Order:</span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleQueueReorder(appt.id, 'up')
                                            }}
                                            className="p-1 hover:bg-white/60 text-slate-600 dark:text-slate-300 hover:text-blue-600 rounded cursor-pointer"
                                            title="Slide Up"
                                          >
                                            <ArrowUp className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleQueueReorder(appt.id, 'down')
                                            }}
                                            className="p-1 hover:bg-white/60 text-slate-600 dark:text-slate-300 hover:text-blue-600 rounded cursor-pointer"
                                            title="Slide Down"
                                          >
                                            <ArrowDown className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleQueueReorder(appt.id, 'top')
                                            }}
                                            className="p-1 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded cursor-pointer font-bold text-[10px]"
                                            title="Emergency Priority: Bump patient to front"
                                          >
                                            <AlertTriangle className="w-3.5 h-3.5 inline mr-0.5" />
                                            <span>#1 Priority</span>
                                          </button>
                                        </div>
                                      )}

                                      {/* Clinical Remark */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenRemarkModal(appt)
                                        }}
                                        className="px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 border border-amber-300/50 rounded-xl font-bold text-xs cursor-pointer inline-flex items-center space-x-1"
                                      >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        <span>Remark</span>
                                      </button>

                                      {/* Push Bill / Update Payment */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenBillModal(appt)
                                        }}
                                        className="px-2.5 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-800 dark:text-sky-200 border border-sky-300/50 rounded-xl font-bold text-xs cursor-pointer inline-flex items-center space-x-1"
                                      >
                                        <Receipt className="w-3.5 h-3.5" />
                                        <span>Bill</span>
                                      </button>

                                      {/* Push Alert */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenPushAlertModal(appt)
                                        }}
                                        className="px-2.5 py-1.5 bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 border border-purple-300/50 rounded-xl font-bold text-xs cursor-pointer inline-flex items-center space-x-1"
                                      >
                                        <Bell className="w-3.5 h-3.5" />
                                        <span>Push Alert</span>
                                      </button>

                                      {/* Shift Date */}
                                      {!isDone && !isProcessing && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleOpenShiftModal(appt)
                                          }}
                                          className="px-2.5 py-1.5 bg-teal-500/15 hover:bg-teal-500/25 text-teal-800 dark:text-teal-300 border border-teal-300/50 rounded-xl font-bold text-xs cursor-pointer inline-flex items-center space-x-1"
                                        >
                                          <Calendar className="w-3.5 h-3.5" />
                                          <span>Shift Date</span>
                                        </button>
                                      )}

                                      {/* Print Slip */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenPrintSlip(appt)
                                        }}
                                        className="px-2.5 py-1.5 liquid-glass-subtle hover:bg-white/70 text-slate-700 dark:text-slate-200 border border-white/50 dark:border-white/10 rounded-xl font-bold text-xs cursor-pointer inline-flex items-center space-x-1"
                                      >
                                        <Printer className="w-3.5 h-3.5" />
                                        <span>Slip</span>
                                      </button>

                                      {/* Mark No Show */}
                                      {!isDone && !isProcessing && appt.checkinStatus !== 'no_show' && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleStatusChange(appt.id, 'no_show')
                                          }}
                                          className="px-2.5 py-1.5 liquid-glass-subtle hover:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-white/50 dark:border-white/10 rounded-xl font-bold text-xs cursor-pointer inline-flex items-center space-x-1"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                          <span>No Show</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB: PAY AT DESK REQUESTS */}
      {/* ========================================================= */}
      {deskTab === 'pay_at_desk_requests' && (
        <div className="space-y-6">
          {/* Header Card */}
          <GlassCard variant="elevated" padding="lg" radius="xl" specular className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    Pay at Desk Requests
                    {payAtDeskCount > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-white">
                        {payAtDeskCount} Pending
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                    Review and approve patient appointments booked with Pay at Desk
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => fetchPayAtDesk()}
                disabled={isLoadingPayAtDesk}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 cursor-pointer transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPayAtDesk ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </GlassCard>

          {/* Overload Rule Notice Banner */}
          <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">Pay at Desk FIFO & Overload Policy</p>
              <p className="text-amber-800 dark:text-amber-300">
                Requests are arranged in chronological order with the oldest on top. Approving from top to bottom ensures patients enter the live queue in fair booking order. Approving also reserves the requested slot (even if full) and assigns an immediate live OPD token.
              </p>
            </div>
          </div>

          {/* Requests Content */}
          {isLoadingPayAtDesk && payAtDeskRequests.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-brand-600 animate-spin" />
              <p className="text-sm font-bold text-slate-500">Loading pending requests...</p>
            </div>
          ) : payAtDeskRequests.length === 0 ? (
            <GlassCard variant="subtle" padding="lg" radius="xl" className="py-16 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600">
                <Receipt className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-slate-800 dark:text-white">No Pending Requests</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                There are no Pay at Desk appointment requests waiting for approval at this time.
              </p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {payAtDeskRequests.map((req, index) => {
                const isOldest = index === 0
                return (
                <GlassCard
                  key={req.id}
                  variant="elevated"
                  padding="md"
                  radius="xl"
                  specular
                  className={`space-y-3 border ${
                    isOldest
                      ? 'border-amber-400 dark:border-amber-500 shadow-md ring-2 ring-amber-400/30'
                      : 'border-slate-200/80 dark:border-white/10'
                  } hover:shadow-lg transition-all`}
                >
                  {/* Top Oldest Badge */}
                  {isOldest && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-300/60 text-amber-800 dark:text-amber-300 text-[11px] font-black tracking-wide">
                      <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                      <span>⚡ OLDEST REQUEST • FIRST IN LINE TO APPROVE</span>
                    </div>
                  )}

                  {/* Top Bar: 10-Digit ID + Attempt Badge */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-mono text-xs font-black tracking-wider text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                      #{req.trackingCode10Digit}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300/40">
                      Attempt {req.attemptNumber || 1} of 3
                    </span>
                  </div>

                  {/* Patient Info */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-base font-black text-slate-900 dark:text-white">
                        {req.patientName}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {req.patientAge ? `${req.patientAge} yrs` : '—'} • {req.patientGender || 'Other'}
                      </p>
                    </div>
                    {req.patientMobile && (
                      <a
                        href={`tel:${req.patientMobile}`}
                        className="p-2 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 hover:bg-emerald-100 transition-colors"
                        title="Call patient"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                  </div>

                  {/* Doctor & Slot */}
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center space-x-1.5 font-semibold text-slate-800 dark:text-slate-200">
                      <Stethoscope className="w-3.5 h-3.5 text-brand-600" />
                      <span>{req.doctor?.fullName || 'Assigned Doctor'}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{req.appointmentDate} • {req.appointmentTime}</span>
                    </div>
                    {req.createdAt && (
                      <div className="flex items-center space-x-1.5 text-amber-700 dark:text-amber-300 font-medium pt-0.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Requested: {formatPayAtDeskRelativeTime(req.createdAt)}</span>
                      </div>
                    )}
                  </div>

                  {/* Fee Breakdown */}
                  <div className="p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-xs space-y-1">
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>Consultation Fee:</span>
                      <span className="font-semibold">NPR {req.feeAmount}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>5% Service Charge:</span>
                      <span className="font-semibold">NPR {req.serviceChargeAmount || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-1 border-t border-amber-200/40">
                      <span>Total Due at Desk:</span>
                      <span className="text-emerald-600 dark:text-emerald-400">NPR {req.totalAmount || req.feeAmount}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      onClick={() => setConfirmPayAtDeskAction({ action: 'reject', appt: req })}
                      disabled={payAtDeskActionLoading}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 border border-rose-200/60 dark:border-rose-900/40 transition-all cursor-pointer disabled:opacity-50"
                    >
                      Cancel / Reject
                    </button>
                    <button
                      onClick={() => setConfirmPayAtDeskAction({ action: 'approve', appt: req })}
                      disabled={payAtDeskActionLoading}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </div>

                  <button
                    onClick={() => setPayAtDeskDetailModal(req)}
                    className="w-full text-center text-[11px] font-semibold text-slate-500 hover:text-brand-600 cursor-pointer pt-1"
                  >
                    View Full Details
                  </button>
                </GlassCard>
                )
              })}
            </div>
          )}

          {/* Action Confirmation Modal */}
          {confirmPayAtDeskAction && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
              <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center space-x-3">
                  <div className={`p-3 rounded-full ${
                    confirmPayAtDeskAction.action === 'approve'
                      ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600'
                      : 'bg-rose-100 dark:bg-rose-950/50 text-rose-600'
                  }`}>
                    {confirmPayAtDeskAction.action === 'approve' ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : (
                      <AlertTriangle className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">
                      {confirmPayAtDeskAction.action === 'approve' ? 'Approve Appointment?' : 'Unapprove Request?'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Patient: {confirmPayAtDeskAction.appt.patientName} (ID: #{confirmPayAtDeskAction.appt.trackingCode10Digit})
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
                  <p><strong>Date & Slot:</strong> {confirmPayAtDeskAction.appt.appointmentDate} at {confirmPayAtDeskAction.appt.appointmentTime}</p>
                  <p><strong>Total at Desk:</strong> NPR {confirmPayAtDeskAction.appt.totalAmount}</p>
                  <p><strong>Attempt:</strong> {confirmPayAtDeskAction.appt.attemptNumber || 1} of 3</p>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {confirmPayAtDeskAction.action === 'approve'
                    ? 'Approving adds the patient directly to the live OPD queue. If the slot is full, the slot is safely overloaded.'
                    : 'The request will be marked UNAPPROVED. The patient will be notified and can retry if attempts remain.'}
                </p>

                <div className="flex items-center space-x-3 pt-2">
                  <button
                    onClick={() => setConfirmPayAtDeskAction(null)}
                    disabled={payAtDeskActionLoading}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 cursor-pointer disabled:opacity-50"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={() => {
                      if (confirmPayAtDeskAction.action === 'approve') {
                        handleApprovePayAtDesk(confirmPayAtDeskAction.appt)
                      } else {
                        handleRejectPayAtDesk(confirmPayAtDeskAction.appt)
                      }
                    }}
                    disabled={payAtDeskActionLoading}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-1.5 ${
                      confirmPayAtDeskAction.action === 'approve'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    {payAtDeskActionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{confirmPayAtDeskAction.action === 'approve' ? 'Confirm Approval' : 'Confirm Unapprove'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Full Detail Modal */}
          {payAtDeskDetailModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
              <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Request Details</h3>
                    <p className="font-mono text-xs font-bold text-brand-600">#{payAtDeskDetailModal.trackingCode10Digit}</p>
                  </div>
                  <button
                    onClick={() => setPayAtDeskDetailModal(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <p className="text-slate-400">Patient</p>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5">{payAtDeskDetailModal.patientName}</p>
                      <p className="text-slate-500">{payAtDeskDetailModal.patientAge ? `${payAtDeskDetailModal.patientAge} yrs` : '—'} • {payAtDeskDetailModal.patientGender || 'Other'}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <p className="text-slate-400">Contact</p>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5">{payAtDeskDetailModal.patientMobile || '—'}</p>
                      <p className="text-slate-500">{payAtDeskDetailModal.patientEmail || 'No email'}</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Doctor:</span>
                      <span className="font-bold text-slate-900 dark:text-white">{payAtDeskDetailModal.doctor?.fullName || 'Assigned Doctor'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Slot Date & Time:</span>
                      <span className="font-bold text-slate-900 dark:text-white">{payAtDeskDetailModal.appointmentDate} • {payAtDeskDetailModal.appointmentTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Attempt Count:</span>
                      <span className="font-bold text-amber-600">Attempt {payAtDeskDetailModal.attemptNumber || 1} of 3</span>
                    </div>
                    {payAtDeskDetailModal.notes && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-slate-400">Clinical Notes / Tests:</span>
                        <p className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">{payAtDeskDetailModal.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 space-y-1.5">
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>Consultation Fee:</span>
                      <span className="font-bold">NPR {payAtDeskDetailModal.feeAmount}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>5% Service Charge:</span>
                      <span className="font-bold">NPR {payAtDeskDetailModal.serviceChargeAmount || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-2 border-t border-amber-200/60 dark:border-amber-900/60">
                      <span>Total Payable at Desk:</span>
                      <span className="text-emerald-600 dark:text-emerald-400">NPR {payAtDeskDetailModal.totalAmount || payAtDeskDetailModal.feeAmount}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3 pt-2">
                  <button
                    onClick={() => {
                      const m = payAtDeskDetailModal
                      setPayAtDeskDetailModal(null)
                      setConfirmPayAtDeskAction({ action: 'reject', appt: m })
                    }}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 cursor-pointer"
                  >
                    Cancel / Reject
                  </button>
                  <button
                    onClick={() => {
                      const m = payAtDeskDetailModal
                      setPayAtDeskDetailModal(null)
                      setConfirmPayAtDeskAction({ action: 'approve', appt: m })
                    }}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md cursor-pointer"
                  >
                    Approve Request
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB 2: RECEPTION WALK-IN BOOKING */}
      {/* ========================================================= */}
      {deskTab === 'walkin' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <GlassCard variant="elevated" padding="lg" radius="xl" specular className="space-y-6">
            <div>
              <h2 className="text-xl font-black text-slate-900">Reception Walk-In Booking</h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Register walk-in patients directly into the live OPD queue. Generates an instant 10-digit token code.
              </p>
            </div>

            {walkinSuccessCode && (
              <div className="p-4 bg-brand-50/80 backdrop-blur-md border border-brand-200/80 rounded-2xl flex items-center justify-between shadow-glass-sm">
                <div>
                  <span className="text-xs font-bold text-brand-800 block">
                    Walk-in Patient Added to Live Queue!
                  </span>
                  <span className="text-base font-black font-mono text-brand-900">
                    Code: #{walkinSuccessCode}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {printSlipAppt && (
                    <button
                      type="button"
                      onClick={() => setShowPrintTokenSlip(true)}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center space-x-1 cursor-pointer shadow-glass-sm"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Token Slip</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setWalkinSuccessCode(null)
                      setPrintSlipAppt(null)
                    }}
                    className="px-3 py-1.5 bg-brand-600 text-white text-xs font-bold rounded-lg cursor-pointer shadow-glass-sm"
                  >
                    New Booking
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleWalkinSubmit} className="space-y-4">
              {/* Type-Specific Notice Header */}
              {isLabClinic ? (
                <div className="p-3.5 bg-purple-50/80 backdrop-blur-md border border-purple-200/80 rounded-2xl flex items-center space-x-2.5 text-xs text-purple-900">
                  <FlaskConical className="w-4 h-4 text-purple-600 shrink-0" />
                  <span className="font-semibold">
                    Diagnostic Pathology Center Desk: Select tests to register sample collection token.
                  </span>
                </div>
              ) : isSingleDoctorClinic ? (
                <div className="p-3.5 bg-emerald-50/80 backdrop-blur-md border border-emerald-200/80 rounded-2xl flex items-center space-x-2.5 text-xs text-emerald-900">
                  <Stethoscope className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold">
                    Single-Visit Clinic: Auto-assigning verified attending specialist.
                  </span>
                </div>
              ) : (
                /* Polyclinic Consultation Type Toggle */
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">Consultation Type</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setWalkinIsFollowup(false)
                        setWalkinFollowupCode('')
                        setWalkinRetainedAppt(null)
                      }}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        !walkinIsFollowup
                          ? 'border-brand-600 bg-brand-50/70 backdrop-blur-md ring-2 ring-brand-500/20 font-bold text-slate-900 shadow-glass-sm'
                          : 'border-white/70 bg-white/55 backdrop-blur-md text-slate-600 hover:bg-white/80'
                      }`}
                    >
                      <div className="text-xs font-bold">New Patient</div>
                      <div className="text-[10px] text-slate-400">Normal OPD Fee</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWalkinIsFollowup(true)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        walkinIsFollowup
                          ? 'border-emerald-600 bg-emerald-50/70 backdrop-blur-md ring-2 ring-emerald-500/20 font-bold text-emerald-900 shadow-glass-sm'
                          : 'border-white/70 bg-white/55 backdrop-blur-md text-slate-600 hover:bg-white/80'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>Follow-Up Visit</span>
                        <span className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 rounded font-black">FREE</span>
                      </div>
                      <div className="text-[10px] text-emerald-700">10-Digit ID lookup</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Polyclinic Follow-Up 10-Digit Code Lookup */}
              {isPolyclinic && walkinIsFollowup && (
                <div className="p-3.5 bg-emerald-50/75 backdrop-blur-md border border-emerald-200/80 rounded-2xl space-y-2">
                  <label className="text-xs font-bold text-emerald-900 block">
                    Enter Previous 10-Digit Appointment ID *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={10}
                      value={walkinFollowupCode}
                      onChange={(e) => setWalkinFollowupCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase())}
                      placeholder="e.g. 1234567890 or 982DCE95B6"
                      className="w-full px-3.5 py-2 rounded-xl text-sm font-mono font-black border border-emerald-300 bg-white/85 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    {walkinLookupLoading && (
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                  {walkinLookupError && (
                    <p className="text-[11px] text-rose-600 font-bold">{walkinLookupError}</p>
                  )}
                  {walkinRetainedAppt && (
                    <div className="p-2.5 bg-white/85 backdrop-blur-md border border-emerald-300 rounded-xl flex items-start space-x-2 text-xs text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Verified Patient: {walkinRetainedAppt.patientName}</strong>
                        <div className="text-[10px] text-slate-500">
                          Previous Visit: {walkinRetainedAppt.appointmentDate} • Token #{walkinRetainedAppt.trackingCode10Digit}
                        </div>
                        <div className="text-[10px] font-bold text-emerald-700">✓ 100% Free Follow-Up Fee (Rs. 0)</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Patient Full Name */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Patient Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={walkinName}
                  onChange={(e) => {
                    setWalkinName(e.target.value)
                    if (walkinErrors.name) setWalkinErrors({ ...walkinErrors, name: '' })
                  }}
                  placeholder="Enter Patient Full Name"
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold border ${
                    walkinErrors.name ? 'border-rose-500 bg-rose-50/50' : 'liquid-glass-input'
                  } focus:outline-none focus:ring-2 focus:ring-brand-500`}
                />
                {walkinErrors.name && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">{walkinErrors.name}</p>
                )}
              </div>

              {/* Age and Gender */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Age <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={walkinAge}
                    onChange={(e) => {
                      setWalkinAge(e.target.value)
                      if (walkinErrors.age) setWalkinErrors({ ...walkinErrors, age: '' })
                    }}
                    placeholder="e.g. 28"
                    className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold border ${
                      walkinErrors.age ? 'border-rose-500 bg-rose-50/50' : 'liquid-glass-input'
                    } focus:outline-none focus:ring-2 focus:ring-brand-500`}
                  />
                  {walkinErrors.age && (
                    <p className="text-[11px] text-rose-600 font-bold mt-1">{walkinErrors.age}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Gender</label>
                  <select
                    value={walkinGender}
                    onChange={(e) => setWalkinGender(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Mobile Number */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={walkinMobile}
                  onChange={(e) => {
                    setWalkinMobile(e.target.value)
                    if (walkinErrors.mobile) setWalkinErrors({ ...walkinErrors, mobile: '' })
                  }}
                  placeholder="e.g. 98XXXXXXXX"
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold border ${
                    walkinErrors.mobile ? 'border-rose-500 bg-rose-50/50' : 'liquid-glass-input'
                  } focus:outline-none focus:ring-2 focus:ring-brand-500`}
                />
                {walkinErrors.mobile && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">{walkinErrors.mobile}</p>
                )}
              </div>

              {/* Email Address */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Email Address <span className="text-slate-400 font-normal">(Optional - auto-links to patient Google account)</span>
                </label>
                <input
                  type="email"
                  value={walkinEmail}
                  onChange={(e) => setWalkinEmail(e.target.value)}
                  placeholder="e.g. patient@gmail.com"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Diagnostic Lab Tests Checklist vs Doctor Selector */}
              {isLabClinic ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 block">
                      Select Diagnostic Pathology Tests <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-xs font-bold text-purple-700">
                      Total: Rs. {walkinSelectedTests.reduce((acc, t) => acc + (t.price || 0), 0)}
                    </span>
                  </div>

                  {services.length === 0 ? (
                    <div className="p-3 liquid-glass-subtle rounded-xl border border-white/70 text-xs text-slate-600 space-y-1.5">
                      {[
                        { id: 's1', serviceName: 'Complete Blood Count (CBC)', price: 450 },
                        { id: 's2', serviceName: 'Lipid Profile', price: 900 },
                        { id: 's3', serviceName: 'Liver Function Test (LFT)', price: 1100 },
                        { id: 's4', serviceName: 'Thyroid Function Test (TSH)', price: 1200 },
                        { id: 's5', serviceName: 'Fasting Blood Sugar (FBS)', price: 200 },
                      ].map((item) => {
                        const isChecked = walkinSelectedTests.some((t) => t.id === item.id)
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              if (isChecked) {
                                setWalkinSelectedTests(walkinSelectedTests.filter((t) => t.id !== item.id))
                              } else {
                                setWalkinSelectedTests([...walkinSelectedTests, item as any])
                              }
                            }}
                            className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition ${
                              isChecked ? 'bg-purple-50/85 border-purple-400 shadow-glass-sm' : 'bg-white/75 border-white/80'
                            }`}
                          >
                            <span className="font-semibold text-xs text-slate-800">{item.serviceName}</span>
                            <span className="font-bold text-xs text-slate-900">Rs. {item.price}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {services.map((s) => {
                        const isChecked = walkinSelectedTests.some((t) => t.id === s.id)
                        return (
                          <div
                            key={s.id}
                            onClick={() => {
                              if (isChecked) {
                                setWalkinSelectedTests(walkinSelectedTests.filter((t) => t.id !== s.id))
                              } else {
                                setWalkinSelectedTests([...walkinSelectedTests, s])
                              }
                            }}
                            className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition ${
                              isChecked ? 'bg-purple-50/85 border-purple-400 shadow-glass-sm' : 'bg-white/75 border-white/80'
                            }`}
                          >
                            <span className="font-semibold text-xs text-slate-800">{s.serviceName}</span>
                            <span className="font-bold text-xs text-slate-900">Rs. {s.price || 500}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {walkinErrors.tests && (
                    <p className="text-[11px] text-rose-600 font-bold">{walkinErrors.tests}</p>
                  )}
                </div>
              ) : isSingleDoctorClinic ? (
                /* Single Doctor Card */
                <div className="p-3.5 bg-emerald-50/75 backdrop-blur-md border border-emerald-200/80 rounded-2xl space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
                    Attending Specialist Doctor
                  </span>
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-slate-900 text-sm">
                        {clinicDoctors[0]?.fullName || 'Verified Attending Specialist'}
                      </strong>
                      <div className="text-emerald-700 font-semibold">
                        {clinicDoctors[0]?.specialty || 'General Medicine'} • {clinicDoctors[0]?.education || 'MBBS, MD'}
                      </div>
                    </div>
                    <span className="font-black text-emerald-900 text-sm bg-white/85 px-2.5 py-1 rounded-lg border border-emerald-200">
                      Rs. {clinicDoctors[0]?.consultationFee || 500}
                    </span>
                  </div>
                </div>
              ) : clinicDoctors.length === 0 ? (
                /* General / Facility Clinic Card (No Doctors Listed) */
                <div className="p-3.5 bg-blue-50/75 backdrop-blur-md border border-blue-200/80 rounded-2xl flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 block">
                      Clinic Reception Counter
                    </span>
                    <strong className="text-slate-900 text-sm">General Consultation Queue</strong>
                  </div>
                  <span className="font-black text-blue-900 text-sm bg-white/85 px-2.5 py-1 rounded-lg border border-blue-200">
                    Rs. 500
                  </span>
                </div>
              ) : (
                /* Polyclinic Doctor Dropdown */
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Attending Specialist Doctor</label>
                  <select
                    value={walkinDoctorId}
                    onChange={(e) => setWalkinDoctorId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {clinicDoctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName} ({d.specialty || 'General'}) – {walkinIsFollowup && walkinRetainedAppt ? 'FREE' : `Rs. ${d.consultationFee || 500}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Appointment Date */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Appointment Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={walkinDate}
                  min={todayStr}
                  onChange={(e) => {
                    setWalkinDate(e.target.value)
                    setWalkinSlotId('')
                    setWalkinSlotTime('')
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Published Slots Section (All clinic types: OPD, General & Diagnostic Lab) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    {isLabClinic ? 'Select Published Lab Collection Slot' : 'Select Published OPD Slot'}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  {walkinAvailableSlots.length > 0 && (() => {
                    const totalAvail = walkinAvailableSlots.reduce((acc, s) => acc + Math.max(0, (s.maxCapacity || 5) - (s.bookedCount || 0)), 0)
                    return (
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${totalAvail === 0 ? 'text-amber-700 bg-amber-100 border border-amber-300' : 'text-emerald-700 bg-emerald-50 border border-emerald-300'}`}>
                        {totalAvail === 0 ? 'All Full • Overbooking Active' : `${totalAvail} available • ${walkinAvailableSlots.length} slots`}
                      </span>
                    )
                  })()}
                </div>

                {walkinAvailableSlots.length === 0 ? (
                  <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/80 backdrop-blur-md flex items-start space-x-3 text-amber-900 shadow-glass-sm">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-xs font-bold">
                        {walkinEndedSlotsCount > 0
                          ? isLabClinic
                            ? `All Lab Slots Ended for ${walkinDate}`
                            : `All OPD Slots Ended for ${walkinDate}`
                          : isLabClinic
                          ? 'No Published Lab Collection Slots Found'
                          : 'No Published OPD Slots Found'}
                      </h4>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        {walkinEndedSlotsCount > 0
                          ? `All ${walkinEndedSlotsCount} published ${isLabClinic ? 'lab collection' : 'OPD'} slot(s) on ${walkinDate} have already ended. Please publish a new active slot in the Timed Slots Publisher or select an upcoming date.`
                          : isLabClinic
                          ? `No lab collection time slots have been published on ${walkinDate}. Please create and publish time slots in the Timed Slots Publisher before issuing walk-in tokens.`
                          : `No OPD time slots have been published for this clinic on ${walkinDate}. Please create and publish time slots in the Timed Slots Publisher before issuing walk-in tokens.`}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSlotDate(walkinDate || todayStr)
                          setDeskTab('slots')
                        }}
                        className="mt-2 inline-flex items-center space-x-1 text-[11px] font-bold text-amber-900 underline hover:text-brand-700 cursor-pointer"
                      >
                        <span>Open Timed Slots Publisher</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {walkinAvailableSlots.map((s) => {
                      const isFull = (s.bookedCount || 0) >= (s.maxCapacity || 5)
                      const isSelected = walkinSlotId === s.id
                      const timeInterval = `${s.startTime} - ${s.endTime}`
                      return (
                        <div
                          key={s.id}
                          onClick={() => {
                            setWalkinSlotId(s.id)
                            setWalkinSlotTime(timeInterval)
                            if (walkinErrors.slot) {
                              setWalkinErrors({ ...walkinErrors, slot: '' })
                            }
                          }}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'border-brand-600 bg-brand-50/80 ring-2 ring-brand-500/30 shadow-glass-sm'
                              : isFull
                              ? 'border-amber-300 bg-amber-50/40 hover:bg-amber-50/60'
                              : 'border-white/70 bg-white/75 hover:bg-white/95'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isSelected ? 'text-brand-900' : 'text-slate-900'}`}>
                              {timeInterval}
                            </span>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                isSelected ? 'border-brand-600 bg-brand-600' : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between">
                            {isFull ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                Full ({s.bookedCount || 0}/{s.maxCapacity || 5}) • Overbooking Available
                              </span>
                            ) : (
                              <div className="flex items-center space-x-1.5">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  {Math.max(0, (s.maxCapacity || 5) - (s.bookedCount || 0))} available
                                </span>
                                <span className="text-[11px] font-medium text-slate-500">
                                  ({s.bookedCount || 0} / {s.maxCapacity || 5} booked)
                                </span>
                              </div>
                            )}
                            <span className="text-[10px] font-semibold text-slate-400">
                              Cap: {s.maxCapacity || 5}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Contextual Overbooking vs Availability Banner */}
                {(() => {
                  const selectedSlotObj = walkinAvailableSlots.find(s => s.id === walkinSlotId)
                  if (!selectedSlotObj) return null
                  const isFull = (selectedSlotObj.bookedCount || 0) >= (selectedSlotObj.maxCapacity || 5)
                  if (isFull) {
                    return (
                      <div className="p-3 rounded-xl border border-amber-300 bg-amber-50/80 backdrop-blur-md flex items-start space-x-2.5 text-amber-900 shadow-glass-sm mt-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-[11.5px]">
                          <strong className="block text-amber-800">Reception Desk Overbooking Active</strong>
                          <span>This {isLabClinic ? 'lab collection' : 'OPD'} slot ({selectedSlotObj.startTime} - {selectedSlotObj.endTime}) has reached capacity ({selectedSlotObj.bookedCount || 0}/{selectedSlotObj.maxCapacity || 5}). Submitting will overbook this walk-in patient into today's queue.</span>
                        </div>
                      </div>
                    )
                  } else {
                    const spots = Math.max(0, (selectedSlotObj.maxCapacity || 5) - (selectedSlotObj.bookedCount || 0))
                    return (
                      <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 backdrop-blur-md flex items-center space-x-2 text-emerald-900 shadow-glass-sm mt-2 text-[11.5px]">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Slot available: <strong>{spots} spots remaining</strong> in {selectedSlotObj.startTime} - {selectedSlotObj.endTime}.</span>
                      </div>
                    )
                  }
                })()}

                {walkinErrors.slot && (
                  <p className="text-[11px] text-rose-600 font-bold">{walkinErrors.slot}</p>
                )}

                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  Walk-in patient will be placed at the last position of the selected time slot, and all subsequent time slot patients will automatically shift down (+1).
                </p>
              </div>

              {/* Submit Button */}
              {(() => {
                const isOverbookingSlot = walkinAvailableSlots.some(s => s.id === walkinSlotId && (s.bookedCount || 0) >= (s.maxCapacity || 5))
                return (
                  <GlassButton
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    rightIcon={<ChevronRight className="w-4 h-4" />}
                  >
                    {isLabClinic
                      ? isOverbookingSlot
                        ? `Confirm & Overbook Lab Token (Rs. ${walkinSelectedTests.reduce((acc, t) => acc + (t.price || 0), 0)})`
                        : `Issue Diagnostic Lab Token (Rs. ${walkinSelectedTests.reduce((acc, t) => acc + (t.price || 0), 0)})`
                      : walkinIsFollowup && walkinRetainedAppt
                      ? 'Issue Live OPD Token (100% FREE Follow-Up)'
                      : isOverbookingSlot
                      ? 'Confirm & Overbook Live OPD Token'
                      : 'Issue Live OPD Token'}
                  </GlassButton>
                )
              })()}
            </form>
          </GlassCard>
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB: TIMED SLOTS PUBLISHER (SlotManagerScreen.kt) */}
      {/* ========================================================= */}
      {deskTab === 'slots' && (
        <div className="space-y-6">
          {/* Collapsible Header & Date Strip (Smooth transition on scroll) */}
          <div
            className={`transition-all duration-300 ease-in-out transform origin-top space-y-4 ${
              isScrolledDown
                ? 'max-h-0 opacity-0 overflow-hidden pointer-events-none scale-y-95 mb-0'
                : 'max-h-[800px] opacity-100 scale-y-100 mb-6'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {isLabClinic ? 'Lab Collection Slots Publisher' : 'Doctor Timed Slots Publisher'}
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {isLabClinic
                    ? 'Publish timed diagnostic sample collection windows (e.g. 09:00 - 09:15, with patient capacity limit). Available slots appear live for walk-in and online lab booking.'
                    : 'Publish timed consultation slots (e.g. 09:00 - 09:15, with patient capacity limit). Available slots appear live on the patient booking app.'}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <GlassBadge variant="brand" size="md">
                  {publishedSlots.length} Slots Published on {slotDate}
                </GlassBadge>
              </div>
            </div>

            {/* 14-Day Horizontal Date Strip (SlotManagerScreen.kt) */}
            <GlassCard variant="subtle" padding="md" radius="xl" className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Quick 14-Day Schedule Selector
              </span>
              <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                {upcoming14Dates.map((d) => {
                  const isSelected = slotDate === d.dateStr
                  const isHol = selectedClinic?.declaredHolidays?.includes(d.dateStr)
                  return (
                    <button
                      key={d.dateStr}
                      type="button"
                      onClick={() => setSlotDate(d.dateStr)}
                      className={`px-3.5 py-2 rounded-2xl border text-center shrink-0 transition cursor-pointer ${
                        isSelected
                          ? 'bg-brand-600 border-brand-600 text-white shadow-glass-brand'
                          : isHol
                          ? 'bg-rose-50/80 border-rose-200 text-rose-700 backdrop-blur-md'
                          : 'bg-white/60 border-white/80 text-slate-700 hover:bg-white/90 backdrop-blur-md'
                      }`}
                    >
                      <span className="text-[10px] font-bold block uppercase opacity-80">{d.dayShort}</span>
                      <span className="text-sm font-black block">{d.dayNum} {d.monthShort}</span>
                    </button>
                  )
                })}
              </div>
            </GlassCard>

            {/* Quick Doctor / Facility & Date Selector Bar */}
            <GlassCard variant="base" padding="md" radius="xl" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isLabClinic || clinicDoctors.length === 0 ? (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    {isLabClinic ? 'Publishing Facility Counter' : 'Clinic Counter'}
                  </label>
                  <div className="w-full px-3.5 py-2.5 rounded-xl text-xs font-bold bg-purple-50/70 border border-purple-200 text-purple-900">
                    {isLabClinic ? 'Diagnostic Lab Phlebotomy Counter (Facility-Wide)' : 'General Facility Schedule Counter'}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Select Attending Doctor <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={slotDoctorId}
                    onChange={(e) => setSlotDoctorId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-bold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {clinicDoctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName} ({d.specialty || 'General'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Slot Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs font-bold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </GlassCard>
          </div>

          {/* Compact Sticky Bar when scrolled down */}
          {isScrolledDown && (
            <div
              onClick={() => setIsScrolledDown(false)}
              className="sticky top-2 z-20 liquid-glass-elevated px-4 py-2.5 rounded-2xl border border-white/60 shadow-glass-sm flex items-center justify-between cursor-pointer transition-all duration-300 hover:bg-white/80"
            >
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
                <CalendarClock className="w-4 h-4 text-brand-600" />
                <span>Timed Slots: {slotDate} ({publishedSlots.length} Published Slots)</span>
              </div>
              <span className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1">
                Show Date Selector &amp; Controls ▲
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Publish Single Slot or Quick Presets */}
            <div className="space-y-6">
              {/* Manual Slot Creator */}
              <GlassCard variant="base" padding="md" radius="xl" className="space-y-4">
                <div className="flex items-center space-x-2 text-brand-700 font-black text-sm pb-2 border-b border-white/60">
                  <CalendarClock className="w-4 h-4" />
                  <span>{isLabClinic ? `Add Sample Collection Slot (${slotDate})` : `Add Timed Slot (${slotDate})`}</span>
                </div>

                {isLabClinic && (
                  <div className="p-3 rounded-xl bg-teal-50/85 border border-teal-200 flex items-center space-x-2.5 text-xs">
                    <FlaskConical className="w-4 h-4 text-teal-700 shrink-0" />
                    <div>
                      <div className="font-bold text-teal-950">Diagnostic Lab Mode</div>
                      <div className="text-[11px] text-teal-800">
                        Facility phlebotomy collection window (no doctor required)
                      </div>
                    </div>
                  </div>
                )}

                {(() => {
                  const startMins = parseTimeToMinutes(slotStartTime)
                  const endMins = parseTimeToMinutes(slotEndTime)
                  const isInvalidInterval = endMins <= startMins
                  const durationMins = endMins - startMins
                  return (
                    <form onSubmit={handlePublishSlot} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">Start Time</label>
                          <input
                            type="text"
                            value={slotStartTime}
                            onChange={(e) => setSlotStartTime(e.target.value)}
                            placeholder="09:00 AM"
                            className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">End Time</label>
                          <input
                            type="text"
                            value={slotEndTime}
                            onChange={(e) => setSlotEndTime(e.target.value)}
                            placeholder={isLabClinic ? '11:00 AM' : '09:15 AM'}
                            className={`w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 ${
                              isInvalidInterval ? 'border-rose-400 focus:ring-rose-500' : 'focus:ring-brand-500'
                            }`}
                            required
                          />
                        </div>
                      </div>

                      {isInvalidInterval ? (
                        <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-800">
                          End time ({slotEndTime}) must be later than start time ({slotStartTime}).
                        </div>
                      ) : (
                        <div className="text-[11px] font-semibold text-emerald-700">
                          ✓ Slot Window: {slotStartTime} to {slotEndTime} ({durationMins} mins)
                        </div>
                      )}

                      <div>
                        <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">Quick Duration:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {[15, 30, 60, 120, 180, 240].map((mins) => {
                            const activeChip = durationMins === mins
                            return (
                              <button
                                key={mins}
                                type="button"
                                onClick={() => setSlotEndTime(formatMinutesTo12h(startMins + mins))}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                                  activeChip
                                    ? 'bg-brand-600 text-white border-brand-600'
                                    : 'bg-white/75 text-slate-700 border-slate-200 hover:bg-brand-50'
                                }`}
                              >
                                {mins >= 60 ? `+${mins / 60} hr` : `+${mins} min`}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Patient Capacity (Max Bookings)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={slotCapacity}
                          onChange={(e) => setSlotCapacity(Math.max(1, Number(e.target.value) || 1))}
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>

                      <GlassButton
                        type="submit"
                        variant="primary"
                        size="md"
                        fullWidth
                        disabled={publishingSlot || isInvalidInterval}
                      >
                        {publishingSlot ? 'Adding...' : isLabClinic ? 'Add Sample Slot' : 'Add slot'}
                      </GlassButton>
                    </form>
                  )
                })()}
              </GlassCard>

              {/* Quick Preset Generators */}
              <GlassCard variant="base" padding="md" radius="xl" className="space-y-3">
                <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                  {isLabClinic ? '⚡ 1-Click Sample Collection Windows' : '⚡ 1-Click Slot Generators (15-min Intervals)'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {isLabClinic
                    ? 'Quickly publish facility-wide phlebotomy collection windows without doctor selection:'
                    : 'Quickly publish complete session schedules without manual entry:'}
                </p>

                {isLabClinic ? (
                  <div className="space-y-2 pt-1">
                    {[
                      { label: 'Morning Fasting: 06:00 AM – 09:00 AM', start: '06:00 AM', end: '09:00 AM', tag: '3 hr Window' },
                      { label: 'Mid-Day Collection: 09:00 AM – 12:00 PM', start: '09:00 AM', end: '12:00 PM', tag: '3 hr Window' },
                      { label: 'Afternoon Collection: 01:00 PM – 04:00 PM', start: '01:00 PM', end: '04:00 PM', tag: '3 hr Window' },
                    ].map((win) => (
                      <button
                        key={win.start}
                        type="button"
                        disabled={publishingSlot}
                        onClick={() => handlePublishLabCollectionWindow(win.start, win.end)}
                        className="w-full py-2.5 px-3 bg-white/60 hover:bg-teal-50/80 hover:text-teal-800 border border-white/80 hover:border-teal-200 rounded-xl text-xs font-bold text-left transition-colors cursor-pointer flex items-center justify-between shadow-glass-sm"
                      >
                        <span>{win.label}</span>
                        <span className="text-[10px] text-teal-700 font-mono">{win.tag} &rarr;</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      disabled={publishingSlot}
                      onClick={() => handleGenerateBulkSlots(9, 12, 15)}
                      className="w-full py-2.5 px-3 bg-white/60 hover:bg-brand-50/80 hover:text-brand-700 border border-white/80 hover:border-brand-200 rounded-xl text-xs font-bold text-left transition-colors cursor-pointer flex items-center justify-between shadow-glass-sm"
                    >
                      <span>Morning: 09:00 AM – 12:00 PM</span>
                      <span className="text-[10px] text-brand-600 font-mono">12 Slots &rarr;</span>
                    </button>

                    <button
                      type="button"
                      disabled={publishingSlot}
                      onClick={() => handleGenerateBulkSlots(13, 16, 15)}
                      className="w-full py-2.5 px-3 bg-white/60 hover:bg-brand-50/80 hover:text-brand-700 border border-white/80 hover:border-brand-200 rounded-xl text-xs font-bold text-left transition-colors cursor-pointer flex items-center justify-between shadow-glass-sm"
                    >
                      <span>Afternoon: 01:00 PM – 04:00 PM</span>
                      <span className="text-[10px] text-brand-600 font-mono">12 Slots &rarr;</span>
                    </button>

                    <button
                      type="button"
                      disabled={publishingSlot}
                      onClick={() => handleGenerateBulkSlots(16, 19, 15)}
                      className="w-full py-2.5 px-3 bg-white/60 hover:bg-brand-50/80 hover:text-brand-700 border border-white/80 hover:border-brand-200 rounded-xl text-xs font-bold text-left transition-colors cursor-pointer flex items-center justify-between shadow-glass-sm"
                    >
                      <span>Evening: 04:00 PM – 07:00 PM</span>
                      <span className="text-[10px] text-brand-600 font-mono">12 Slots &rarr;</span>
                    </button>
                  </div>
                )}
              </GlassCard>
            </div>

            {/* Right Column (2 cols): Published Slots Grid */}
            <div className="lg:col-span-2 space-y-4">
              <GlassCard variant="base" padding="md" radius="xl" className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/60">
                  <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                    Published Slots on {slotDate} ({publishedSlots.length})
                  </h3>
                  <button
                    onClick={() => setRefreshKey((k) => k + 1)}
                    className="text-xs text-brand-700 hover:underline font-bold flex items-center space-x-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingSlots ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {loadingSlots ? (
                  <div className="p-8 text-center text-xs text-slate-400">Loading published slots...</div>
                ) : publishedSlots.length === 0 ? (
                  <div className="p-12 text-center">
                    <CalendarClock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-700">No time slots published for this date</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Use the creator on the left or the 1-click generators to publish time slots.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                    {publishedSlots.map((slot) => {
                      const effectiveCap = slot.maxCapacity || (isLabClinic ? 25 : 10)
                      const booked = slot.bookedCount || 0
                      const remaining = Math.max(0, effectiveCap - booked)
                      const isFull = booked >= effectiveCap
                      const matchedDoc = clinicDoctors.find((d) => d.id === slot.doctorId)
                      const counterLabel = isLabClinic
                        ? 'Lab Phlebotomy Counter'
                        : matchedDoc?.fullName || 'General Counter'

                      return (
                        <div
                          key={slot.id}
                          className="p-3.5 liquid-glass-subtle hover:bg-white/80 rounded-2xl border border-white/75 flex items-center justify-between transition-colors gap-2 shadow-glass-sm"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <span className="text-xs font-black text-slate-900 font-mono block">
                              {slot.startTime} – {slot.endTime}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-600 block truncate">
                              {counterLabel}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isFull
                                    ? 'bg-rose-100/90 text-rose-800'
                                    : 'bg-brand-100/90 text-brand-800'
                                }`}
                              >
                                {isFull ? 'Full' : 'Available'}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Registered: {booked} / {effectiveCap} ({remaining} left)
                              </span>
                            </div>
                          </div>

                          {/* Slot Actions from SlotManagerScreen.kt: -30m, +30m, Edit Capacity, Delete */}
                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSubtract30MinsFromSlot(slot)}
                              className="px-2 py-1 text-[10px] font-bold bg-amber-50/85 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg cursor-pointer"
                              title="Shorten slot end time by 30 minutes"
                            >
                              -30m
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdd30MinsToSlot(slot)}
                              className="px-2 py-1 text-[10px] font-bold bg-emerald-50/85 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg cursor-pointer"
                              title="Extend slot end time by 30 minutes"
                            >
                              +30m
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSlotCapacity(slot)
                                setNewSlotCapacityVal(effectiveCap)
                              }}
                              className="px-2 py-1 text-[10px] font-bold bg-white/80 hover:bg-brand-50 text-slate-700 hover:text-brand-700 border border-white/90 rounded-lg cursor-pointer"
                              title="Edit max patients capacity"
                            >
                              Cap
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSlot(slot.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50/80 rounded-xl transition-colors cursor-pointer"
                              title="Delete this time slot"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </GlassCard>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB 3: FUTURE APPOINTMENTS & DECLARE HOLIDAY */}
      {/* ========================================================= */}
      {deskTab === 'future_appts' && (
        <div className="space-y-6">
          {/* Collapsible Calendar & Controls (Smooth transition on scroll) */}
          <div
            className={`transition-all duration-300 ease-in-out transform origin-top space-y-4 ${
              isScrolledDown
                ? 'max-h-0 opacity-0 overflow-hidden pointer-events-none scale-y-95 mb-0'
                : 'max-h-[800px] opacity-100 scale-y-100 mb-6'
            }`}
          >
            {/* 14-Day Horizontal Date Strip with Holiday & Booking Indicators (FutureAppointmentsScreen.kt) */}
            <GlassCard variant="subtle" padding="md" radius="xl" className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                14-Day Upcoming OPD Calendar Strip
              </span>
              <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                {upcoming14Dates.map((d) => {
                  const isSelected = futureSelectedDate === d.dateStr
                  const isHol = selectedClinic?.declaredHolidays?.includes(d.dateStr)
                  const apptCount = appointments.filter((a) => a.appointmentDate === d.dateStr).length
                  return (
                    <button
                      key={d.dateStr}
                      type="button"
                      onClick={() => setFutureSelectedDate(d.dateStr)}
                      className={`px-3.5 py-2 rounded-2xl border text-center shrink-0 transition cursor-pointer relative ${
                        isSelected
                          ? 'bg-brand-600 border-brand-600 text-white shadow-glass-brand'
                          : isHol
                          ? 'bg-rose-50/80 border-rose-300 text-rose-800 backdrop-blur-md'
                          : 'bg-white/60 border-white/80 text-slate-700 hover:bg-white/90 backdrop-blur-md'
                      }`}
                    >
                      <span className="text-[10px] font-bold block uppercase opacity-80">{d.dayShort}</span>
                      <span className="text-sm font-black block">{d.dayNum} {d.monthShort}</span>
                      <div className="flex items-center justify-center gap-1 mt-0.5">
                        {isHol && (
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-rose-600 text-white">
                            Closed
                          </span>
                        )}
                        {apptCount > 0 && (
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                              isSelected ? 'bg-white text-brand-700' : 'bg-brand-100 text-brand-800'
                            }`}
                          >
                            {apptCount} OPD
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </GlassCard>

            {/* Top Control Bar: Date Selector & Declare Holiday Toggle */}
            <GlassCard variant="base" padding="md" radius="xl" className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-black text-slate-900">Future Appointments & Holiday Desk</h2>
                <p className="text-xs text-slate-500">
                  Select any upcoming date to view scheduled appointments or declare the clinic closed on holidays.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                {/* Sub-filter Pills (FutureAppointmentsScreen.kt: All / Waiting / Completed) */}
                <div className="flex p-1 liquid-glass-subtle rounded-xl border border-white/70">
                  {(['all', 'waiting', 'completed'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFutureSubFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize cursor-pointer ${
                        futureSubFilter === f
                          ? 'bg-white/90 text-brand-700 shadow-glass-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'waiting' ? 'Waiting / Active' : 'Completed'}
                    </button>
                  ))}
                </div>

                {/* Date Input */}
                <input
                  type="date"
                  value={futureSelectedDate}
                  onChange={(e) => setFutureSelectedDate(e.target.value)}
                  className="px-3.5 py-2 rounded-xl liquid-glass-input text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />

                {/* Declare Holiday Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleHolidayForDate(futureSelectedDate)}
                  disabled={togglingHoliday}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    isSelectedDateHoliday
                      ? 'bg-rose-600 border-rose-600 text-white shadow-glass-sm'
                      : 'bg-white/65 border-white/80 text-slate-700 hover:bg-rose-50 hover:text-rose-700 backdrop-blur-md'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    {isSelectedDateHoliday
                      ? 'Holiday Declared (Clinic Closed)'
                      : 'Declare Holiday on Date'}
                  </span>
                </button>
              </div>
            </GlassCard>

            {/* Holiday Notice Banner if declared */}
            {isSelectedDateHoliday && (
              <div className="p-4 bg-rose-50/85 backdrop-blur-md border border-rose-200/80 rounded-2xl flex items-center space-x-3 text-rose-800 text-xs font-bold shadow-glass-sm">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <span>HOLIDAY DECLARED FOR {futureSelectedDate}: Clinic is marked CLOSED.</span>
                  <p className="font-normal text-rose-700 mt-0.5">
                    Whenever any patient checks for appointments on this date, the system will inform them that the clinic is closed.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Compact Sticky Bar when scrolled down */}
          {isScrolledDown && (
            <div
              onClick={() => setIsScrolledDown(false)}
              className="sticky top-2 z-20 liquid-glass-elevated px-4 py-2.5 rounded-2xl border border-white/60 shadow-glass-sm flex items-center justify-between cursor-pointer transition-all duration-300 hover:bg-white/80"
            >
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
                <Calendar className="w-4 h-4 text-brand-600" />
                <span>OPD Queue: {futureSelectedDate} ({futureDateAppointments.length} Appointments)</span>
                <span className="text-[10px] uppercase px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 font-bold border border-brand-200">
                  Filter: {futureSubFilter === 'all' ? 'All' : futureSubFilter === 'waiting' ? 'Waiting / Active' : 'Completed'}
                </span>
              </div>
              <span className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1">
                Show Calendar &amp; Controls ▲
              </span>
            </div>
          )}

          {/* Future Appointments Table */}
          <GlassCard variant="base" padding="none" radius="xl" className="overflow-hidden">
            <div className="p-4 bg-white/45 backdrop-blur-md border-b border-white/70 flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-700">
                Appointments Scheduled for {futureSelectedDate} ({futureDateAppointments.length})
              </h3>
            </div>

            {futureDateAppointments.length === 0 ? (
              <div className="p-12 text-center">
                <Calendar className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                <h4 className="text-xs font-bold text-slate-700">No appointments booked for this date yet</h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Patients booking online for this date will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/45 text-slate-500 uppercase tracking-wider font-bold border-b border-white/60">
                    <tr>
                      <th className="py-3 px-4">Tracking Code</th>
                      <th className="py-3 px-4">Patient Name</th>
                      <th className="py-3 px-4">Mobile</th>
                      <th className="py-3 px-4">Doctor</th>
                      <th className="py-3 px-4">Time Slot</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Fee Amount</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/50 font-medium">
                    {futureDateAppointments
                      .filter((appt) =>
                        futureSubFilter === 'all'
                          ? true
                          : futureSubFilter === 'waiting'
                          ? appt.checkinStatus === 'waiting' || appt.checkinStatus === 'in_consultation'
                          : appt.checkinStatus === 'completed'
                      )
                      .map((appt) => (
                      <tr key={appt.id} className="hover:bg-white/45 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          #{appt.trackingCode10Digit}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          <div>{appt.patientName}</div>
                          {appt.notes && (
                            <div className="mt-0.5 text-[10px] text-amber-800 bg-amber-50/80 px-2 py-0.5 rounded border border-amber-200 inline-block">
                              Remark: {appt.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {appt.patientMobile || '–'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {appt.doctor?.fullName || selectedDoctor?.fullName || 'OPD Doctor'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 font-bold">
                          {appt.appointmentTime}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/75 border border-white/80 text-slate-800">
                            {appt.checkinStatus.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-brand-700">
                          Rs. {getEffectiveAppointmentTotal(appt)} ({appt.paymentStatus})
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleOpenRemarkModal(appt)}
                            className="px-2.5 py-1 bg-amber-50/85 text-amber-900 hover:bg-amber-100 rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            Remark
                          </button>
                          {appt.checkinStatus !== 'completed' && appt.checkinStatus !== 'done' && (
                            <button
                              type="button"
                              onClick={() => handleOpenShiftModal(appt)}
                              className="px-2.5 py-1 bg-teal-50/85 text-teal-800 hover:bg-teal-100 rounded-lg text-[11px] font-bold cursor-pointer"
                              title="Shift appointment to another date"
                            >
                              Shift Date
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenPushAlertModal(appt)}
                            className="px-2.5 py-1 bg-purple-50/85 text-purple-700 hover:bg-purple-100 rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            Push Alert
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenBillModal(appt)}
                            className="px-2.5 py-1 bg-blue-50/85 text-blue-700 hover:bg-blue-100 rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            Bill
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB: NO-SHOW PATIENTS DESK (DashboardScreen.kt)      */}
      {/* ========================================================= */}
      {deskTab === 'noshow' && (
        <div className="space-y-6">
          <GlassCard variant="base" padding="md" radius="xl" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <span>No-Show Patients Management Desk</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Review patients marked as No-Show. Restore them back into the active waiting queue if they arrive late, or reschedule their appointment date.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!selectedClinic?.id) return
                  const res = await autoTransferUncompletedQueueToNoShow(selectedClinic.id, false)
                  const freshAppts = await getAppointmentsByClinic(selectedClinic.id)
                  if (freshAppts) setAppointments(freshAppts)
                  alert(`Sweep completed! Automatically transferred ${res.count} uncompleted past appointment(s) to No-Show.`)
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Sweep all past appointments where patient did not show up"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Audit &amp; Sweep</span>
              </button>
              <GlassBadge variant="danger" size="md">
                {noShowAppointments.length} No-Show Records
              </GlassBadge>
            </div>
          </GlassCard>

          {noShowAppointments.length === 0 ? (
            <GlassCard variant="subtle" padding="lg" radius="xl" className="p-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <h3 className="font-bold text-slate-800 text-sm">Zero No-Show Patients</h3>
              <p className="text-xs text-slate-500 mt-1">
                All registered patients have attended or are actively waiting in queue.
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-6">
              {datewiseGroupedNoShows.map(([dateStr, appts]) => (
                <GlassCard key={dateStr} variant="base" padding="none" radius="xl" className="overflow-hidden shadow-sm">
                  {/* Date Group Header */}
                  <div className="bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-rose-600" />
                      <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                        {dateStr}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">
                        ({appts.length} Missed Patient{appts.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <GlassBadge variant="danger" size="sm">
                      {dateStr === todayStr ? 'Today (Expired)' : 'Past Missed Date'}
                    </GlassBadge>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-rose-50/60 dark:bg-rose-950/20 border-b border-rose-100 dark:border-rose-900/30 text-rose-900 dark:text-rose-300 uppercase tracking-wider font-bold">
                        <tr>
                          <th className="py-3 px-4">Token Code</th>
                          <th className="py-3 px-4">Patient Information</th>
                          <th className="py-3 px-4">Mobile & Call</th>
                          <th className="py-3 px-4">Original Slot</th>
                          <th className="py-3 px-4">Consulting Doctor</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/50 dark:divide-slate-700/50 font-medium">
                        {appts.map((appt) => (
                          <tr key={appt.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                              #{appt.trackingCode10Digit}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900 dark:text-slate-100">{appt.patientName}</div>
                              {(appt.patientAge || appt.patientGender) && (
                                <div className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold">
                                  {[appt.patientAge ? `${appt.patientAge} yrs` : null, appt.patientGender].filter(Boolean).join(' • ')}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {appt.patientMobile ? (
                                <div className="flex items-center gap-2">
                                  <a
                                    href={`tel:${appt.patientMobile}`}
                                    className="text-brand-700 dark:text-brand-400 font-mono font-bold hover:underline"
                                  >
                                    {appt.patientMobile}
                                  </a>
                                  <a
                                    href={`tel:${appt.patientMobile}`}
                                    className="p-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 inline-flex items-center"
                                    title="Call patient phone"
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              ) : (
                                <span className="text-slate-400">–</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                              {appt.appointmentTime || 'OPD Slot'}
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                              {appt.doctor?.fullName || selectedDoctor?.fullName || 'OPD Doctor'}
                            </td>
                            <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                              {appt.patientMobile && (
                                <a
                                  href={`tel:${appt.patientMobile}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[11px] cursor-pointer shadow-sm transition-colors"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>Call</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenShiftModal(appt)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-[11px] cursor-pointer shadow-sm transition-colors"
                              >
                                <Calendar className="w-3 h-3" />
                                <span>Reschedule</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(appt.id, 'waiting')}
                                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-[11px] cursor-pointer transition-colors"
                                title="Restore patient if they arrived late today"
                              >
                                Restore to Queue
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB: CONSULTATION FEES MANAGER (ConsultationFeeManagerScreen.kt) */}
      {/* ========================================================= */}
      {deskTab === 'fees' && (
        <div className="space-y-6">
          <GlassCard variant="base" padding="md" radius="xl" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Doctor Consultation Fees Manager
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Configure OPD consultation fees for each enlisted doctor. Changes sync immediately to walk-in reception, online bookings, and billing invoices.
              </p>
            </div>
            <GlassBadge variant="brand" size="md">
              {clinicDoctors.length} Enlisted Doctors
            </GlassBadge>
          </GlassCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clinicDoctors.map((doc) => {
              const currentFeeVal =
                editingDoctorFees[doc.id] !== undefined
                  ? editingDoctorFees[doc.id]
                  : doc.consultationFee || 500
              return (
                <GlassCard
                  key={doc.id}
                  variant="base"
                  padding="md"
                  radius="xl"
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-2xl bg-brand-100/80 text-brand-800 font-black flex items-center justify-center overflow-hidden shadow-glass-sm">
                        {doc.profilePictureUrl ? (
                          <img src={doc.profilePictureUrl} alt={doc.fullName} className="w-full h-full object-cover" />
                        ) : (
                          doc.fullName.charAt(0)
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900">{doc.fullName}</h3>
                        <p className="text-xs text-brand-700 font-bold">{doc.specialty || 'General Physician'}</p>
                      </div>
                    </div>
                    <GlassBadge variant="success" size="sm">
                      Current: Rs. {doc.consultationFee || 500}
                    </GlassBadge>
                  </div>

                  {/* Quick Fee Presets */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-500 block">
                      Quick Fee Presets (NPR):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[300, 500, 700, 800, 1000, 1200, 1500].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            setEditingDoctorFees({ ...editingDoctorFees, [doc.id]: preset })
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition ${
                            currentFeeVal === preset
                              ? 'bg-brand-600 text-white border-brand-600 shadow-glass-sm'
                              : 'bg-white/65 text-slate-700 border-white/80 hover:bg-white/90'
                          }`}
                        >
                          Rs. {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      min={0}
                      value={currentFeeVal}
                      onChange={(e) =>
                        setEditingDoctorFees({
                          ...editingDoctorFees,
                          [doc.id]: Number(e.target.value) || 0,
                        })
                      }
                      className="flex-1 px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-black focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <GlassButton
                      type="button"
                      variant="primary"
                      size="md"
                      disabled={savingDocFeeId === doc.id}
                      onClick={() => handleSaveDoctorFee(doc, currentFeeVal)}
                    >
                      {savingDocFeeId === doc.id ? 'Saving...' : 'Update Fee'}
                    </GlassButton>
                  </div>
                </GlassCard>
              )
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB: DOCTOR & STAFF INVITATIONS (InvitationManagerScreen.kt) */}
      {/* ========================================================= */}
      {deskTab === 'invitations' && (
        <div className="space-y-6">
          <GlassCard variant="base" padding="md" radius="xl" className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Doctor & Clinical Staff Invitations
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Search verified Dactor practitioners across Nepal, inspect their full NMC credentials, and invite them to join {selectedClinic?.name}.
              </p>
            </div>
            <div className="flex p-1 liquid-glass-subtle rounded-2xl border border-white/70">
              <button
                type="button"
                onClick={() => setInviteSubTab('find')}
                className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition ${
                  inviteSubTab === 'find'
                    ? 'bg-white/90 text-brand-700 shadow-glass-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Find & Invite Staff ({allSystemDoctors.length})
              </button>
              <button
                type="button"
                onClick={() => setInviteSubTab('sent')}
                className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition ${
                  inviteSubTab === 'sent'
                    ? 'bg-white/90 text-brand-700 shadow-glass-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sent Invitations ({clinicInvitations.length})
              </button>
            </div>
          </GlassCard>

          {inviteSubTab === 'find' ? (
            <div className="space-y-6">
              {/* Direct Custom Email Invite Card */}
              <form
                onSubmit={handleSendCustomStaffInvitation}
                className="liquid-glass-card p-6 rounded-3xl space-y-4 border border-white/80 shadow-glass-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-white/60">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-brand-500/10 text-brand-700 flex items-center justify-center">
                      <Mail className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-brand-700">
                      Send Direct Invitation by Google Email
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Invite external practitioners directly to your clinic via their registered Google email
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="relative">
                    <UserPlus className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={customInviteName}
                      onChange={(e) => setCustomInviteName(e.target.value)}
                      placeholder="Doctor / Technician Name"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      value={customInviteEmail}
                      onChange={(e) => setCustomInviteEmail(e.target.value)}
                      placeholder="practitioner@gmail.com"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold"
                      required
                    />
                  </div>
                  <select
                    value={customInviteRole}
                    onChange={(e) => setCustomInviteRole(e.target.value as any)}
                    className="px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-bold"
                  >
                    <option value="doctor">Medical Doctor</option>
                    <option value="lab_technician">Lab Technician</option>
                  </select>
                  <GlassButton
                    type="submit"
                    variant="primary"
                    size="md"
                    className="flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Invitation</span>
                  </GlassButton>
                </div>
              </form>

              {/* Filter & Search Bar */}
              <GlassCard variant="subtle" padding="md" radius="xl" className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {(['all', 'doctor', 'lab_technician'] as const).map((rf) => (
                    <button
                      key={rf}
                      type="button"
                      onClick={() => setInviteRoleFilter(rf)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                        inviteRoleFilter === rf
                          ? 'bg-brand-600 text-white shadow-glass-sm'
                          : 'bg-white/65 border border-white/80 text-slate-600 hover:bg-white/90'
                      }`}
                    >
                      {rf === 'all' ? 'All Roles' : rf === 'doctor' ? 'Doctors' : 'Lab Staff'}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                  <input
                    type="text"
                    value={inviteSearchQuery}
                    onChange={(e) => setInviteSearchQuery(e.target.value)}
                    placeholder="Search by Doctor Name, Specialty, NMC License, or Email..."
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl liquid-glass-input text-xs font-semibold"
                  />
                </div>
              </GlassCard>

              {/* System Doctors Directory Grid */}
              {allSystemDoctors
                .filter((d) =>
                  inviteRoleFilter === 'all'
                    ? true
                    : (d.practitionerRole || (d.isLabTechnician ? 'lab_technician' : 'doctor')) ===
                      inviteRoleFilter
                )
                .filter((d) => {
                  if (!inviteSearchQuery.trim()) return true
                  const q = inviteSearchQuery.toLowerCase()
                  return (
                    d.fullName.toLowerCase().includes(q) ||
                    (d.specialty || '').toLowerCase().includes(q) ||
                    (d.nmcLicenseNumber || '').toLowerCase().includes(q) ||
                    (d.email || '').toLowerCase().includes(q)
                  )
                }).length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500 liquid-glass-card rounded-3xl space-y-2">
                  <p className="font-bold text-slate-700">No registered practitioners matched your search criteria.</p>
                  <p className="text-[11px] text-slate-400">
                    Try adjusting your query or send a direct email invitation using the Google Email form above.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allSystemDoctors
                    .filter((d) =>
                      inviteRoleFilter === 'all'
                        ? true
                        : (d.practitionerRole || (d.isLabTechnician ? 'lab_technician' : 'doctor')) ===
                          inviteRoleFilter
                    )
                    .filter((d) => {
                      if (!inviteSearchQuery.trim()) return true
                      const q = inviteSearchQuery.toLowerCase()
                      return (
                        d.fullName.toLowerCase().includes(q) ||
                        (d.specialty || '').toLowerCase().includes(q) ||
                        (d.nmcLicenseNumber || '').toLowerCase().includes(q) ||
                        (d.email || '').toLowerCase().includes(q)
                      )
                    })
                    .map((doc) => {
                      const cleanEmail = (doc.email || '').toLowerCase()
                      const existingInvite = clinicInvitations.find(
                        (inv) => (inv.invitedEmail || inv.email || '').toLowerCase() === cleanEmail
                      )
                      const alreadyEnlisted =
                        clinicDoctors.some((cd) => cd.id === doc.id) || existingInvite?.status === 'accepted'
                      const isPending = !alreadyEnlisted && existingInvite?.status === 'pending'
                      const isRejected = !alreadyEnlisted && existingInvite?.status === 'rejected'
                      const isLabRole = doc.practitionerRole === 'lab_technician' || doc.isLabTechnician
                      const experienceYears = doc.startingPracticingYear
                        ? Math.max(1, 2026 - doc.startingPracticingYear)
                        : doc.experienceYears || 5

                      return (
                        <div
                          key={doc.id}
                          className="flex flex-col justify-between h-full rounded-3xl overflow-hidden border border-white/80 shadow-glass-sm hover:shadow-glass-elevated hover:border-brand-300/60 transition-all duration-200 group bg-white/75 backdrop-blur-md"
                        >
                          {/* Top Identity Header: Small Profile Avatar (56x56 px strictly) + Info */}
                          <div className="p-4 pb-3 flex items-start gap-3.5 border-b border-slate-100/80">
                            {/* Small Fixed Size Avatar */}
                            <div className="relative shrink-0">
                              <div className="w-14 h-14 min-w-[3.5rem] min-h-[3.5rem] max-w-[3.5rem] max-h-[3.5rem] rounded-2xl bg-gradient-to-br from-brand-100 via-sky-50 to-brand-50 border-2 border-white shadow-sm overflow-hidden flex items-center justify-center">
                                {doc.profilePictureUrl ? (
                                  <img
                                    src={doc.profilePictureUrl}
                                    alt={doc.fullName}
                                    className="w-full h-full object-cover object-center"
                                    onError={(e) => {
                                      ;(e.target as HTMLElement).style.display = 'none'
                                    }}
                                  />
                                ) : (
                                  <span className="text-brand-800 font-black text-xl">
                                    {doc.fullName.charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              {/* Verified Shield Badge on Avatar */}
                              {doc.nmcLicenseNumber && (
                                <span
                                  title={`Nepal Medical Council Verified: #${doc.nmcLicenseNumber}`}
                                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px] font-black ring-2 ring-white shadow-xs"
                                >
                                  ✓
                                </span>
                              )}
                            </div>

                            {/* Identity Text */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <h4
                                  className="text-sm font-black text-slate-900 group-hover:text-brand-700 transition-colors truncate"
                                  title={doc.fullName}
                                >
                                  {doc.fullName}
                                </h4>
                                <span
                                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                                    isLabRole
                                      ? 'bg-purple-500/10 text-purple-700 border border-purple-300/50'
                                      : 'bg-brand-500/10 text-brand-700 border border-brand-300/50'
                                  }`}
                                >
                                  {isLabRole ? 'Lab Staff' : 'Doctor'}
                                </span>
                              </div>

                              <p className="text-xs font-bold text-brand-600 truncate flex items-center gap-1">
                                <Stethoscope className="w-3.5 h-3.5 shrink-0 text-brand-500" />
                                <span className="truncate">{doc.specialty || 'General Practitioner'}</span>
                              </p>

                              <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
                                {doc.education || 'MBBS'} •{' '}
                                <span className="font-semibold text-slate-600">
                                  NMC: {doc.nmcLicenseNumber || 'Verified'}
                                </span>
                              </p>
                            </div>
                          </div>

                          {/* Middle Body: Clinical Credentials & Highlights Strip */}
                          <div className="p-4 pt-3 space-y-3 flex-1 flex flex-col justify-between">
                            {/* 3 Metric Pills */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200/60 text-center">
                                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 block">
                                  Experience
                                </span>
                                <span className="text-xs font-black text-slate-800 mt-0.5 block truncate">
                                  {experienceYears}+ Yrs
                                </span>
                              </div>

                              <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200/60 text-center">
                                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 block">
                                  OPD Fee
                                </span>
                                <span className="text-xs font-black text-brand-700 mt-0.5 block truncate">
                                  Rs. {doc.consultationFee || 500}
                                </span>
                              </div>

                              <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200/60 text-center">
                                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 block">
                                  License
                                </span>
                                <span className="text-xs font-black text-emerald-700 mt-0.5 block truncate">
                                  Verified
                                </span>
                              </div>
                            </div>

                            {/* Bio Quote or Practitioner Email */}
                            {doc.description ? (
                              <p className="text-[11px] text-slate-600 bg-white/70 p-2.5 rounded-xl border border-slate-200/60 line-clamp-2 leading-relaxed italic">
                                "{doc.description}"
                              </p>
                            ) : (
                              <div className="text-[11px] text-slate-500 bg-white/60 px-2.5 py-1.5 rounded-xl border border-slate-200/50 flex items-center gap-1.5 truncate">
                                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">{doc.email || 'Registered Dactor Practitioner'}</span>
                              </div>
                            )}

                            {/* Card Footer: View Full Profile & Invitation Actions */}
                            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => setViewingDoctorProfile(doc)}
                                className="flex-1 py-2 px-3 rounded-xl border border-slate-200 bg-white/80 hover:bg-white text-slate-700 font-bold text-xs cursor-pointer transition flex items-center justify-center gap-1.5 shadow-2xs hover:border-slate-300"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                <span>View Profile</span>
                              </button>

                              {alreadyEnlisted ? (
                                <span className="flex-1 py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Affiliated</span>
                                </span>
                              ) : isPending ? (
                                <span className="flex-1 py-2 px-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs">
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Invite Sent</span>
                                </span>
                              ) : isRejected ? (
                                <button
                                  type="button"
                                  onClick={() => handleSendDoctorInvitation(doc)}
                                  className="flex-1 py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs cursor-pointer border border-rose-200 transition flex items-center justify-center gap-1.5 shadow-2xs"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Re-Invite</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSendDoctorInvitation(doc)}
                                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-brand-600 to-sky-600 hover:from-brand-500 hover:to-sky-500 text-white font-bold text-xs cursor-pointer shadow-glass-sm transition flex items-center justify-center gap-1.5"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>+ Invite Staff</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          ) : (
            <GlassCard variant="base" padding="none" radius="xl" className="overflow-hidden">
              {clinicInvitations.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  No staff invitations have been sent from this clinic yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/45 border-b border-white/70 text-slate-500 uppercase tracking-wider font-bold">
                      <tr>
                        <th className="py-3.5 px-4">Practitioner Name</th>
                        <th className="py-3.5 px-4">Email</th>
                        <th className="py-3.5 px-4">Role</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/50 font-medium">
                      {clinicInvitations.map((inv) => {
                        const matchedDoc = allSystemDoctors.find(
                          (d) => (d.email || '').toLowerCase() === (inv.invitedEmail || inv.email || '').toLowerCase()
                        )
                        const displayName = matchedDoc?.fullName || inv.invitedName || inv.invitedEmail || inv.email
                        return (
                          <tr key={inv.id} className="hover:bg-white/45 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-slate-900">{displayName}</td>
                            <td className="py-3.5 px-4 text-slate-600">{inv.invitedEmail || inv.email}</td>
                            <td className="py-3.5 px-4 capitalize">{inv.role === 'lab_technician' ? 'Lab Technician' : 'Doctor'}</td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                  inv.status === 'accepted'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : inv.status === 'rejected'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {inv.status === 'accepted' ? '✓ Affiliated' : inv.status === 'rejected' ? '✕ Declined' : '⏳ Pending'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right space-x-2">
                              {inv.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelStaffInvitation(inv.id)}
                                  className="px-3 py-1 bg-rose-50/85 hover:bg-rose-100 text-rose-700 rounded-lg font-bold text-[11px] cursor-pointer"
                                >
                                  Cancel / Revoke
                                </button>
                              )}
                              {inv.status === 'rejected' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (matchedDoc) {
                                      handleSendDoctorInvitation(matchedDoc)
                                    } else {
                                      const res = await sendClinicInvitation({
                                        clinicId: selectedClinic.id,
                                        clinicName: selectedClinic.name,
                                        invitedEmail: inv.invitedEmail || inv.email || '',
                                        invitedName: displayName,
                                        role: inv.role,
                                      })
                                      if (res) {
                                        setClinicInvitations((prev) => [res, ...prev.filter((i) => i.id !== res.id)])
                                        alert(`✓ Invitation re-sent to ${displayName}!`)
                                      }
                                    }
                                  }}
                                  className="px-3 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg font-bold text-[11px] cursor-pointer"
                                >
                                  Re-Invite
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB 4: WORKING HOURS & BREAK MANAGEMENT */}
      {/* ========================================================= */}
      {deskTab === 'working_hours' && (
        <div className="space-y-6">
          {/* Header Notice */}
          <GlassCard variant="base" padding="md" radius="xl" className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Operational Working Hours & Break Management
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Set weekly working and break times for all seven days (Sunday to Saturday).
                <strong> Note:</strong> This working and break schedule provides informational guidance to patients checking their live queue or appointment status; it does not publish booking slots.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <GlassButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopyMonHoursToAll}
              >
                Copy Mon Hours to Weekdays
              </GlassButton>
            </div>
          </GlassCard>

          {scheduleSaveSuccess && (
            <div className="p-4 bg-brand-50/85 backdrop-blur-md border border-brand-200/80 rounded-2xl flex items-center space-x-2 text-brand-800 text-xs font-bold shadow-glass-sm">
              <CheckCircle2 className="w-4 h-4 text-brand-600" />
              <span>Weekly operational schedule successfully saved to clinic profile!</span>
            </div>
          )}

          {/* 7 Days Schedule Grid Form */}
          <form onSubmit={handleSaveWeeklySchedule} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {weeklySchedule.map((sched, idx) => (
                <GlassCard
                  key={sched.day}
                  variant="base"
                  padding="md"
                  radius="lg"
                  className="space-y-3.5"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-white/60">
                    <span className="text-sm font-black text-slate-900">{sched.day}</span>
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sched.isOpen}
                        onChange={(e) => {
                          const updated = [...weeklySchedule]
                          updated[idx] = { ...sched, isOpen: e.target.checked }
                          setWeeklySchedule(updated)
                        }}
                        className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4"
                      />
                      <span className="text-[11px] font-bold text-slate-600">
                        {sched.isOpen ? 'Open' : 'Closed'}
                      </span>
                    </label>
                  </div>

                  {sched.isOpen ? (
                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="text-[11px] font-bold text-slate-500 block mb-1">
                          Working Hours
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-400 block">Open</label>
                            <input
                              type="text"
                              value={sched.openTime}
                              onChange={(e) => {
                                const updated = [...weeklySchedule]
                                updated[idx] = { ...sched, openTime: e.target.value }
                                setWeeklySchedule(updated)
                              }}
                              placeholder="08:00 AM"
                              className="w-full px-2.5 py-1.5 rounded-lg liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 block">Close</label>
                            <input
                              type="text"
                              value={sched.closeTime}
                              onChange={(e) => {
                                const updated = [...weeklySchedule]
                                updated[idx] = { ...sched, closeTime: e.target.value }
                                setWeeklySchedule(updated)
                              }}
                              placeholder="08:00 PM"
                              className="w-full px-2.5 py-1.5 rounded-lg liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/60">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-bold text-slate-500">
                            Daily Break Hour
                          </span>
                          <label className="flex items-center space-x-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sched.hasBreak}
                              onChange={(e) => {
                                const updated = [...weeklySchedule]
                                updated[idx] = { ...sched, hasBreak: e.target.checked }
                                setWeeklySchedule(updated)
                              }}
                              className="rounded text-brand-600 focus:ring-brand-500 w-3.5 h-3.5"
                            />
                            <span className="text-[10px] text-slate-500">Enable</span>
                          </label>
                        </div>

                        {sched.hasBreak && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-slate-400 block">Start</label>
                              <input
                                type="text"
                                value={sched.breakStart}
                                onChange={(e) => {
                                  const updated = [...weeklySchedule]
                                  updated[idx] = { ...sched, breakStart: e.target.value }
                                  setWeeklySchedule(updated)
                                }}
                                placeholder="01:00 PM"
                                className="w-full px-2.5 py-1.5 rounded-lg liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 block">End</label>
                              <input
                                type="text"
                                value={sched.breakEnd}
                                onChange={(e) => {
                                  const updated = [...weeklySchedule]
                                  updated[idx] = { ...sched, breakEnd: e.target.value }
                                  setWeeklySchedule(updated)
                                }}
                                placeholder="02:00 PM"
                                className="w-full px-2.5 py-1.5 rounded-lg liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-4 text-center font-medium">
                      Clinic is closed on this day.
                    </p>
                  )}
                </GlassCard>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <GlassButton
                type="submit"
                variant="primary"
                size="lg"
                disabled={savingSchedule}
              >
                {savingSchedule ? 'Saving Schedule...' : 'Save Weekly Operational Schedule'}
              </GlassButton>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB 5: DOCTORS & STAFF DIRECTORY */}
      {/* ========================================================= */}
      {deskTab === 'doctors' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900">Doctors & Practitioners Directory</h2>
              <p className="text-xs text-slate-500">
                Manage doctor presence, consultation fee, medical council license, and practice years.
              </p>
            </div>
            <GlassButton
              variant="primary"
              size="sm"
              leftIcon={<UserPlus className="w-4 h-4" />}
              onClick={() => setDeskTab('invitations')}
            >
              Add / Invite Doctor
            </GlassButton>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clinicDoctors.map((doc) => (
              <GlassCard
                key={doc.id}
                variant="base"
                padding="md"
                radius="xl"
                className="space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-14 h-14 rounded-2xl bg-brand-100/80 text-brand-800 flex items-center justify-center font-black text-xl shrink-0 overflow-hidden border border-white/80 shadow-glass-sm relative group">
                      {doc.profilePictureUrl ? (
                        <img
                          src={doc.profilePictureUrl}
                          alt={doc.fullName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        doc.fullName.charAt(0)
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenDoctorPhotoUpload(doc)}
                        className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-[9px] font-bold cursor-pointer"
                        title="Upload or change doctor photo"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Photo</span>
                      </button>
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{doc.fullName}</h3>
                      <p className="text-xs text-brand-700 font-bold">{doc.specialty || 'General'}</p>
                      <button
                        type="button"
                        onClick={() => handleOpenDoctorPhotoUpload(doc)}
                        className="mt-1 text-[10px] font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1 cursor-pointer"
                      >
                        <Camera className="w-3 h-3" />
                        <span>{doc.profilePictureUrl ? 'Change Photo' : '+ Upload Photo'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Presence Toggle button for this doctor */}
                  <button
                    type="button"
                    onClick={() => handleToggleDoctorPresence(doc)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                      doc.isInClinic ?? true
                        ? 'bg-brand-50/85 border-brand-300 text-brand-800'
                        : 'bg-rose-50/85 border-rose-300 text-rose-800'
                    }`}
                  >
                    {doc.isInClinic ?? true ? '● In Clinic' : '○ Away'}
                  </button>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 pt-1 border-t border-white/60">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Education:</span>
                    <span className="font-semibold text-slate-800">{doc.education || 'MBBS'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">NMC License:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {doc.nmcLicenseNumber || '–'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Experience:</span>
                    <span className="font-semibold text-slate-800">
                      {doc.startingPracticingYear
                        ? `${2026 - doc.startingPracticingYear} Yrs (Since ${doc.startingPracticingYear})`
                        : `${doc.experienceYears || 5} Yrs`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Consultation Fee:</span>
                    <span className="font-black text-brand-700">Rs. {doc.consultationFee || 500}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Mobile:</span>
                    <span className="font-mono text-slate-700">{doc.personalMobileNumber || '–'}</span>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB 6: BILLS & PAYMENTS DIRECTORY (BillingScreen.kt) */}
      {/* ========================================================= */}
      {deskTab === 'billing' && (
        <div className="space-y-6">
          <GlassCard variant="base" padding="md" radius="xl" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">Clinic Billing & Invoices Directory</h2>
              <p className="text-xs text-slate-500">
                Track all patient payments, total bills, balance due, and dates. Filter by date or generate thermal receipts.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={billingDateFilter === 'all' ? '' : billingDateFilter}
                onChange={(e) => setBillingDateFilter(e.target.value || 'all')}
                className="px-3 py-1.5 rounded-xl liquid-glass-input text-xs font-bold text-slate-800"
              />
              {billingDateFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setBillingDateFilter('all')}
                  className="px-2.5 py-1.5 rounded-xl bg-white/75 border border-white/80 hover:bg-white text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Show All Dates
                </button>
              )}
              <GlassBadge variant="brand" size="md">
                {invoices.length} Invoices Recorded
              </GlassBadge>
            </div>
          </GlassCard>

          <GlassCard variant="base" padding="none" radius="xl" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/45 border-b border-white/70 text-slate-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="py-3.5 px-4">Invoice ID / Date</th>
                    <th className="py-3.5 px-4">Total Amount</th>
                    <th className="py-3.5 px-4">Paid Amount</th>
                    <th className="py-3.5 px-4">Balance Due</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Remarks</th>
                    <th className="py-3.5 px-4 text-right">Receipt File</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 font-medium">
                  {invoices
                    .filter((inv) =>
                      billingDateFilter === 'all'
                        ? true
                        : (inv.createdAt?.split('T')[0] || '') === billingDateFilter
                    )
                    .map((inv) => (
                    <tr key={inv.id} className="hover:bg-white/45 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        #{inv.id.substring(0, 8)} •{' '}
                        <span className="text-slate-500 font-normal">
                          {inv.createdAt?.split('T')[0] || 'Today'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-black text-slate-900">Rs. {inv.totalAmount}</td>
                      <td className="py-3.5 px-4 font-bold text-brand-700">Rs. {inv.paidAmount}</td>
                      <td className="py-3.5 px-4 font-bold text-rose-700">Rs. {inv.balanceDue}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            inv.paymentStatus === 'paid'
                              ? 'bg-brand-100/90 text-brand-800'
                              : inv.paymentStatus === 'partial'
                              ? 'bg-amber-100/90 text-amber-800'
                              : 'bg-rose-100/90 text-rose-800'
                          }`}
                        >
                          {inv.paymentStatus.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{extractCleanClinicalRemarks(inv.remarks) || '–'}</td>
                      <td className="py-3.5 px-4 text-right">
                        {inv.receiptUrl ? (
                          <a
                            href={inv.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-bold"
                          >
                            View Receipt
                          </a>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Clinic Direct Billing Catalog Manager (CatalogManagerScreen.kt) */}
          <GlassCard variant="base" padding="md" radius="xl" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-white/60">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
                  <Tag className="w-4 h-4 text-brand-600" />
                  <span>Clinic Billing Item Catalog</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure direct items for 1-click billing. Clicking any catalog item adds it instantly to patient invoices.
                </p>
              </div>
              <GlassBadge variant="neutral" size="sm">
                {services.length} Catalog Items
              </GlassBadge>
            </div>

            {/* Category Filter Tabs & Search Bar (CatalogManagerScreen.kt) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {['All', 'Hematology', 'Biochemistry', 'Radiology & Imaging', 'Clinical Pathology', 'Consultation'].map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCatalogCategoryFilter(cat)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition ${
                        catalogCategoryFilter === cat
                          ? 'bg-brand-600 text-white shadow-glass-sm'
                          : 'bg-white/65 border border-white/80 text-slate-600 hover:bg-white/90'
                      }`}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>
              <input
                type="text"
                value={catalogSearchQuery}
                onChange={(e) => setCatalogSearchQuery(e.target.value)}
                placeholder="Search catalog items..."
                className="px-3.5 py-1.5 rounded-xl liquid-glass-input text-xs font-semibold sm:w-56"
              />
            </div>

            {/* Form to add item to catalog */}
            <form onSubmit={handleAddService} className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 liquid-glass-subtle rounded-2xl border border-white/75">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Item / Service Name</label>
                <input
                  type="text"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  placeholder="e.g. ECG Test, Blood Sugar, Dressing"
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Price (Rs.)</label>
                <input
                  type="number"
                  value={newServicePrice}
                  onChange={(e) => setNewServicePrice(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
              <div className="flex items-end">
                <GlassButton
                  type="submit"
                  variant="primary"
                  size="sm"
                  fullWidth
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  Add to Catalog
                </GlassButton>
              </div>
            </form>

            {/* List of Catalog Items */}
            {services.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No custom catalog items yet. Add consultation or procedure items above to enable 1-click billing chips.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {services
                  .filter((item) =>
                    catalogCategoryFilter === 'All'
                      ? true
                      : (item.category || '').toLowerCase() === catalogCategoryFilter.toLowerCase()
                  )
                  .filter((item) =>
                    !catalogSearchQuery.trim()
                      ? true
                      : item.serviceName.toLowerCase().includes(catalogSearchQuery.toLowerCase())
                  )
                  .map((item) => (
                  <div
                    key={item.id}
                    className="p-3 liquid-glass-subtle hover:bg-white/80 rounded-2xl border border-white/75 flex items-center justify-between transition-colors shadow-glass-sm"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{item.serviceName}</span>
                      <span className="text-xs font-black text-brand-700">Rs. {item.price}</span>
                      {item.category && (
                        <span className="text-[10px] text-slate-500 ml-1.5 font-medium">({item.category})</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm(`Remove "${item.serviceName}" from catalog?`)) {
                          await deleteClinicService(item.id)
                          setServices((prev) => prev.filter((s) => s.id !== item.id))
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50/80 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB: PAYMENT LOGS & AUDIT LEDGER */}
      {/* ========================================================= */}
      {deskTab === 'payment_logs' && (
        <ClinicPaymentLogsView
          clinic={selectedClinic}
          appointments={appointments}
          invoices={invoices}
          doctors={clinicDoctors}
          onOpenPatientBill={(appId) => {
            const target = appointments.find((a) => a.id === appId)
            if (target) {
              handleOpenBillModal(target)
            }
          }}
        />
      )}

      {/* ========================================================= */}
      {/* DESK TAB 7: PATIENT DIRECTORY & HISTORY */}
      {/* ========================================================= */}
      {deskTab === 'patients' && (
        <div className="space-y-6">
          <GlassCard variant="base" padding="md" radius="xl" className="space-y-4">
            <h2 className="text-xl font-black text-slate-900">Patient Directory & Visit History</h2>
            <p className="text-xs text-slate-500 font-medium">
              Search historical patient records across all visits by 10-digit tracking code, registered mobile number, or patient name.
            </p>

            <form onSubmit={handlePatientSearch} className="flex gap-2 max-w-xl">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={patientSearchQuery}
                  onChange={(e) => setPatientSearchQuery(e.target.value)}
                  placeholder="Enter 10-Digit Code, Mobile, or Patient Name..."
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {patientSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setPatientSearchQuery('')
                      setPatientSearchResults([])
                    }}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Clear Search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <GlassButton
                type="submit"
                variant="primary"
                size="md"
                disabled={searchingPatients}
              >
                {searchingPatients ? 'Searching...' : 'Search'}
              </GlassButton>
            </form>
          </GlassCard>

          {/* Search Results Table */}
          {patientSearchResults.length > 0 && (
            <GlassCard variant="base" padding="none" radius="xl" className="overflow-hidden">
              <div className="p-4 bg-white/45 border-b border-white/70 flex justify-between items-center">
                <h3 className="font-bold text-xs text-slate-700">
                  Search Results ({patientSearchResults.length} Visits Found)
                </h3>
                <button
                  type="button"
                  onClick={() => setPatientSearchResults([])}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/45 text-slate-500 uppercase tracking-wider font-bold border-b border-white/60">
                    <tr>
                      <th className="py-3 px-4">Visit Date</th>
                      <th className="py-3 px-4">Tracking Code</th>
                      <th className="py-3 px-4">Patient Name</th>
                      <th className="py-3 px-4">Mobile</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Fee Amount</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/50 font-medium">
                    {patientSearchResults.map((res) => (
                      <tr key={res.id} className="hover:bg-white/45 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {res.appointmentDate}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                          #{res.trackingCode10Digit}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {res.patientName}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {res.patientMobile || '–'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/75 border border-white/80 text-slate-800">
                            {res.checkinStatus.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-brand-700">
                          Rs. {getEffectiveAppointmentTotal(res)} ({res.paymentStatus})
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleOpenBillModal(res)}
                            className="px-2.5 py-1 bg-blue-50/85 text-blue-700 hover:bg-blue-100 rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            View / Push Bill
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {/* Patient Directory Table */}
          <GlassCard variant="base" padding="none" radius="xl" className="overflow-hidden">
            <div className="p-4 bg-white/45 border-b border-white/70 flex justify-between items-center">
              <h3 className="font-bold text-xs text-slate-700">
                Registered Patients Directory ({patientDirectory.length} Total Patients)
              </h3>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setRegisterPatientModalOpen(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-600 to-brand-600 hover:from-teal-500 hover:to-brand-500 text-white font-bold text-xs rounded-xl shadow-sm transition active:scale-[0.98] cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Register Patient</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (selectedClinic) {
                      setLoadingDirectory(true)
                      try {
                        const freshAppts = await getAppointmentsByClinic(selectedClinic.id)
                        if (freshAppts) setAppointments(freshAppts)
                      } finally {
                        setLoadingDirectory(false)
                      }
                    }
                  }}
                  className="flex items-center space-x-1 text-[11px] font-bold text-brand-700 hover:text-brand-800 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingDirectory ? 'animate-spin' : ''}`} />
                  <span>Refresh Directory</span>
                </button>
              </div>
            </div>
            {displayedPatientDirectory.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-xs">
                {patientSearchQuery.trim()
                  ? `No patients found matching "${patientSearchQuery}".`
                  : 'No patient records found yet. Walk-in and online bookings will automatically populate this directory.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/45 text-slate-500 uppercase tracking-wider font-bold border-b border-white/60">
                    <tr>
                      <th className="py-3 px-4">Patient Name</th>
                      <th className="py-3 px-4">Mobile</th>
                      <th className="py-3 px-4">Gender & Age</th>
                      <th className="py-3 px-4">Total Visits</th>
                      <th className="py-3 px-4">Last Visit</th>
                      <th className="py-3 px-4">Tracking Code(s)</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/50 font-medium">
                    {displayedPatientDirectory.map((pat) => {
                      const isExpanded = expandedPatientId === pat.id
                      const matchingAppt = appointments.find(
                        (a) =>
                          (pat.trackingCodes && pat.trackingCodes.includes(a.trackingCode10Digit)) ||
                          (pat.phone && pat.phone !== 'N/A' && a.patientMobile === pat.phone) ||
                          a.patientName.toLowerCase() === pat.fullName.toLowerCase()
                      ) || ({
                        id: pat.id,
                        trackingCode10Digit: pat.trackingCodes[0] || '1000000000',
                        clinicId: selectedClinic?.id || '',
                        patientName: pat.fullName,
                        patientMobile: pat.phone !== 'N/A' ? pat.phone : '',
                        patientGender: pat.gender,
                        patientAge: pat.age,
                        appointmentDate: pat.lastVisitDate || new Date().toISOString().slice(0, 10),
                        appointmentTime: '10:00 AM',
                        checkinStatus: 'waiting',
                        paymentStatus: 'unpaid',
                        feeAmount: 0,
                        clinic: selectedClinic || undefined,
                      } as unknown as Appointment)

                      const cleanPhone = pat.phone ? pat.phone.replace(/\D/g, '') : ''

                      return (
                        <React.Fragment key={pat.id}>
                          <tr className={`hover:bg-white/50 transition-colors ${isExpanded ? 'bg-white/40' : ''}`}>
                            <td className="py-3.5 px-4 font-bold text-slate-900">
                              <div className="flex items-center space-x-2">
                                <span>{pat.fullName}</span>
                                {pat.consultations && pat.consultations.length > 1 && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[10px] font-bold border border-teal-200">
                                    Follow-Up Patient
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-700">
                              {pat.phone}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600">
                              {pat.gender} {pat.age ? `• ${pat.age} yrs` : ''}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-brand-700">
                              {pat.visitCount} {pat.visitCount === 1 ? 'visit' : 'visits'}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600">
                              {pat.lastVisitDate || '–'}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-wrap gap-1">
                                {pat.trackingCodes.slice(0, 2).map((code: string) => (
                                  <span
                                    key={code}
                                    className="px-2 py-0.5 rounded-md bg-white/75 border border-white/80 text-slate-800 font-mono text-[10px] font-bold"
                                  >
                                    #{code}
                                  </span>
                                ))}
                                {pat.trackingCodes.length > 2 && (
                                  <span className="text-[10px] text-slate-500 font-bold">
                                    +{pat.trackingCodes.length - 2} more
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end space-x-1.5 flex-wrap">
                                {pat.phone && pat.phone !== 'N/A' && (
                                  <a
                                    href={`tel:${pat.phone}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300 transition-colors"
                                    title={`Call ${pat.fullName} (${pat.phone})`}
                                  >
                                    <Phone className="w-3 h-3 text-emerald-600" />
                                    <span>Call</span>
                                  </a>
                                )}
                                {cleanPhone && (
                                  <a
                                    href={`https://wa.me/977${cleanPhone}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-[11px] border border-teal-300 transition-colors"
                                    title="WhatsApp Patient"
                                  >
                                    <MessageSquare className="w-3 h-3 text-teal-600" />
                                    <span>WhatsApp</span>
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenBillModal(matchingAppt)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer"
                                  title="Push / Update Billing Invoice"
                                >
                                  <Receipt className="w-3 h-3" />
                                  <span>Push Bill</span>
                                </button>
                                {matchingAppt.checkinStatus !== 'completed' && matchingAppt.checkinStatus !== 'done' && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenShiftModal(matchingAppt)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer"
                                    title="Reschedule / Shift Appointment Date"
                                  >
                                    <Calendar className="w-3 h-3" />
                                    <span>Shift Date</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenScheduleNextVisit(pat)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer"
                                  title="Schedule Next Follow-Up Visit"
                                >
                                  <CalendarPlus className="w-3 h-3" />
                                  <span>Next Visit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenPrintSlip(matchingAppt)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer"
                                  title="Print 80mm Walk-In / Token Slip"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>Slip</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpandedPatientId(isExpanded ? null : pat.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/80 hover:bg-white text-slate-700 font-bold text-[11px] border border-slate-300 transition-colors cursor-pointer"
                                  title="View Consultations Timeline"
                                >
                                  <span>{isExpanded ? 'Hide' : 'Visits'}</span>
                                  <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* EXPANDABLE DUAL-CONSULTATION TIMELINE DRAWER */}
                          {isExpanded && (
                            <tr className="bg-slate-50/90 dark:bg-slate-900/60 border-y border-emerald-200 dark:border-emerald-800">
                              <td colSpan={7} className="p-4 md:p-5">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                                    <div className="flex items-center space-x-2">
                                      <Stethoscope className="w-4 h-4 text-emerald-600" />
                                      <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                                        Consultation Journey & Clinical Records ({pat.consultations?.length || pat.visitCount} Visits)
                                      </h4>
                                    </div>
                                    <span className="text-[11px] text-slate-500">
                                      Patient: <strong>{pat.fullName}</strong> • Contact: {pat.phone}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    {(pat.consultations && pat.consultations.length > 0
                                      ? pat.consultations
                                      : pat.trackingCodes.map((tc, idx): PatientDirectoryConsultation => ({
                                          id: `${pat.id}-${idx}`,
                                          appointmentDate: pat.lastVisitDate || 'Recorded',
                                          appointmentTime: 'OPD',
                                          doctorName: undefined,
                                          doctorSpecialty: undefined,
                                          trackingCode: tc,
                                          checkinStatus: 'completed',
                                          paymentStatus: 'paid',
                                          feeAmount: idx === 0 ? 500 : 0,
                                          notes: undefined,
                                          isFollowup: idx > 0,
                                        }))
                                    ).map((consult, cIdx) => {
                                      const consultAppt = appointments.find((a) => a.trackingCode10Digit === consult.trackingCode) || ({
                                        ...matchingAppt,
                                        id: consult.id,
                                        trackingCode10Digit: consult.trackingCode,
                                        appointmentDate: consult.appointmentDate,
                                        appointmentTime: consult.appointmentTime,
                                        feeAmount: consult.feeAmount,
                                        checkinStatus: consult.checkinStatus,
                                        paymentStatus: consult.paymentStatus,
                                        notes: consult.notes,
                                      } as unknown as Appointment)

                                      return (
                                        <div
                                          key={consult.id || consult.trackingCode || cIdx}
                                          className={`p-3.5 rounded-2xl border transition-all ${
                                            consult.isFollowup
                                              ? 'bg-teal-50/70 border-teal-200'
                                              : 'bg-blue-50/70 border-blue-200'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/60">
                                            <span
                                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                                                consult.isFollowup
                                                  ? 'bg-teal-200/80 text-teal-900 border border-teal-300'
                                                  : 'bg-blue-200/80 text-blue-900 border border-blue-300'
                                              }`}
                                            >
                                              {cIdx === 0
                                                ? '1. Initial Consultation'
                                                : `2. Follow-Up Consultation ${consult.feeAmount === 0 ? '(Free Visit)' : ''}`}
                                            </span>
                                            <span className="font-mono text-[11px] font-bold text-slate-700 bg-white/80 px-2 py-0.5 rounded">
                                              #{consult.trackingCode}
                                            </span>
                                          </div>

                                          <div className="text-[11px] space-y-1 text-slate-700">
                                            <div>
                                              <strong className="text-slate-900">Doctor:</strong>{' '}
                                              {consult.doctorName || 'OPD Specialist'}
                                              {consult.doctorSpecialty ? ` (${consult.doctorSpecialty})` : ''}
                                            </div>
                                            <div>
                                              <strong className="text-slate-900">Date & Slot:</strong> {consult.appointmentDate} • {consult.appointmentTime}
                                            </div>
                                            <div>
                                              <strong className="text-slate-900">Status:</strong>{' '}
                                              <span className="font-semibold capitalize">{consult.checkinStatus.replace('_', ' ')}</span>
                                              {' • '}
                                              <strong className="text-slate-900">Fee:</strong> Rs. {consult.feeAmount}{' '}
                                              <span className="text-emerald-700 font-bold">({consult.paymentStatus})</span>
                                            </div>
                                            {consult.notes && (
                                              <div className="mt-1 p-2 rounded-lg bg-white/80 border border-white text-slate-800">
                                                <strong>Clinical Notes:</strong> {consult.notes}
                                              </div>
                                            )}
                                          </div>

                                          <div className="mt-3 pt-2 border-t border-white/60 flex items-center justify-between flex-wrap gap-1.5">
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => printAppointmentBill(consultAppt)}
                                                className="px-2 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-800 font-bold text-[10px] border border-slate-300 shadow-xs cursor-pointer"
                                                title="Print Official Bill Invoice"
                                              >
                                                <Receipt className="w-2.5 h-2.5 inline mr-1 text-emerald-600" />
                                                Print Bill
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => printPrescription(consultAppt)}
                                                className="px-2 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-800 font-bold text-[10px] border border-slate-300 shadow-xs cursor-pointer"
                                                title="Print Official Prescription (Rx)"
                                              >
                                                <Stethoscope className="w-2.5 h-2.5 inline mr-1 text-blue-600" />
                                                Print Rx
                                              </button>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => handleOpenBillModal(consultAppt)}
                                                className="px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] cursor-pointer"
                                              >
                                                Push Bill
                                              </button>
                                              {consultAppt.checkinStatus !== 'completed' && consultAppt.checkinStatus !== 'done' && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenShiftModal(consultAppt)}
                                                  className="px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] cursor-pointer"
                                                >
                                                  Shift Date
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => handleOpenPrintSlip(consultAppt)}
                                                className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-800 text-white font-bold text-[10px] cursor-pointer"
                                              >
                                                Slip
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB 8: DIAGNOSTIC LAB 3-STAGE PIPELINE (LabWorkflowScreen.kt) */}
      {/* ========================================================= */}
      {deskTab === 'lab' && isDiagnosticLab && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Diagnostic Laboratory Pipeline (3-Stage Workflow)
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Step 1: Collect Sample → Step 2: Processing in Lab → Step 3: Mark Prepared & Upload Report
              </p>
            </div>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="flex items-center space-x-1.5 text-xs font-bold text-teal-700 bg-teal-50/85 border border-teal-200 px-3 py-1.5 rounded-xl cursor-pointer self-start sm:self-auto shadow-glass-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Lab Queue</span>
            </button>
          </div>

          {/* 3 Sub-Tabs + Search Bar (LabWorkflowScreen.kt) */}
          <GlassCard variant="subtle" padding="md" radius="xl" className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex p-1 liquid-glass-subtle rounded-2xl border border-white/75">
              {(['all', 'processing', 'prepared'] as const).map((lt) => (
                <button
                  key={lt}
                  type="button"
                  onClick={() => setLabSubTab(lt)}
                  className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition ${
                    labSubTab === lt
                      ? 'bg-white/95 text-teal-700 shadow-glass-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lt === 'all'
                    ? 'All Lab Orders'
                    : lt === 'processing'
                    ? 'Processing in Lab'
                    : 'Prepared & Ready'}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={labSearchQuery}
                onChange={(e) => setLabSearchQuery(e.target.value)}
                placeholder="Search by 10-Digit Code, Patient Name, or Test..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl liquid-glass-input text-xs font-semibold"
              />
            </div>
          </GlassCard>

          <GlassCard variant="base" padding="none" radius="xl" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-teal-50/75 border-b border-teal-100 text-teal-900 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="py-3.5 px-4">Tracking Code</th>
                    <th className="py-3.5 px-4">Patient Name</th>
                    <th className="py-3.5 px-4">Tests Ordered</th>
                    <th className="py-3.5 px-4">Current Lab Status</th>
                    <th className="py-3.5 px-4 text-right">Lab Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 font-medium">
                  {appointments
                    .filter((appt) => {
                      const st = (appt.status || 'APPROVED').toUpperCase()
                      if (st !== 'APPROVED') return false
                      return appt.checkinStatus !== 'cancelled' && appt.checkinStatus !== 'no_show'
                    })
                    .map((appt) => {
                      const relatedReport = labReports.find(
                        (r) =>
                          r.appointmentId === appt.id ||
                          (Boolean(appt.trackingCode10Digit) && r.trackingCode10Digit === appt.trackingCode10Digit)
                      )
                      const rawReportStatus = relatedReport?.status as string | undefined
                      const labStatus: 'sample_collected' | 'processing' | 'prepared' =
                        rawReportStatus === 'ready' || rawReportStatus === 'prepared' || rawReportStatus === 'delivered'
                          ? 'prepared'
                          : rawReportStatus === 'processing'
                          ? 'processing'
                          : appt.checkinStatus === 'report_prepared' ||
                            appt.checkinStatus === 'completed' ||
                            appt.checkinStatus === 'done'
                          ? 'prepared'
                          : appt.checkinStatus === 'processing' || appt.checkinStatus === 'in_consultation'
                          ? 'processing'
                          : 'sample_collected'
                      return { appt, relatedReport, labStatus }
                    })
                    .filter(({ appt, labStatus }) => {
                      if (labSubTab === 'processing' && labStatus !== 'processing') return false
                      if (labSubTab === 'prepared' && labStatus !== 'prepared') return false
                      if (labSearchQuery.trim()) {
                        const q = labSearchQuery.toLowerCase()
                        return (
                          appt.trackingCode10Digit.toLowerCase().includes(q) ||
                          appt.patientName.toLowerCase().includes(q) ||
                          (appt.selectedTests?.join(', ').toLowerCase().includes(q) ?? false)
                        )
                      }
                      return true
                    })
                    .map(({ appt, relatedReport, labStatus }) => {

                    return (
                      <tr key={appt.id} className="hover:bg-white/45 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          #{appt.trackingCode10Digit}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {appt.patientName}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {appt.selectedTests?.join(', ') || 'Diagnostic Routine'}
                        </td>
                        <td className="py-3.5 px-4">
                          {labStatus === 'prepared' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-brand-100/90 text-brand-800">
                              Prepared (Ready)
                            </span>
                          ) : labStatus === 'processing' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100/90 text-blue-800 animate-pulse">
                              Processing in Lab
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100/90 text-amber-800">
                              Sample Collected
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-1.5">
                          {labStatus !== 'processing' && labStatus !== 'prepared' && (
                            <button
                              onClick={() => handleMarkDiagnosticProcessing(appt)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] shadow-glass-sm cursor-pointer"
                            >
                              Mark Processing
                            </button>
                          )}
                          {labStatus !== 'prepared' && (
                            <button
                              onClick={() => {
                                setTargetLabAppt(appt)
                                setLabUploadModalOpen(true)
                              }}
                              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-[11px] shadow-glass-sm cursor-pointer"
                            >
                              Mark Prepared & Upload
                            </button>
                          )}
                          {labStatus === 'prepared' && relatedReport?.reportFileUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setLabVerifyTargetReport({ report: relatedReport, appt })
                                setLabVerifyInput('')
                                setLabVerifyError(null)
                              }}
                              className="px-2.5 py-1 bg-teal-50/85 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg font-bold text-[11px] inline-flex items-center space-x-1 cursor-pointer"
                            >
                              <Lock className="w-3 h-3" />
                              <span>Verify & View Report</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB 9: MANAGE LAB TESTS & PRICING RATES (CatalogManagerScreen.kt) */}
      {/* ========================================================= */}
      {deskTab === 'rates' && isDiagnosticLab && (
        <div className="space-y-6">
          {/* 1-Click Common Diagnostic Test Presets (CatalogManagerScreen.kt) */}
          <GlassCard variant="base" padding="md" radius="xl" className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-teal-700">
              ⚡ 1-Click Common Pathology & Diagnostic Presets
            </h3>
            <p className="text-xs text-slate-500">
              Click any standard Nepal laboratory test below to add it immediately to your clinic's published rate list:
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { name: 'Complete Blood Count (CBC)', price: 450, cat: 'Hematology' },
                { name: 'Fasting Blood Sugar (FBS)', price: 150, cat: 'Biochemistry' },
                { name: 'HbA1c (Glycated Hemoglobin)', price: 750, cat: 'Biochemistry' },
                { name: 'Lipid Profile', price: 900, cat: 'Biochemistry' },
                { name: 'Liver Function Test (LFT)', price: 850, cat: 'Biochemistry' },
                { name: 'Renal Function Test (RFT)', price: 800, cat: 'Biochemistry' },
                { name: 'Thyroid Profile (T3, T4, TSH)', price: 1100, cat: 'Hormones & Immunology' },
                { name: 'Urine Routine Examination (R/E)', price: 200, cat: 'Clinical Pathology' },
                { name: 'Digital X-Ray Chest PA', price: 600, cat: 'Radiology & Imaging' },
                { name: 'USG Whole Abdomen & Pelvis', price: 1200, cat: 'Radiology & Imaging' },
              ].map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={async () => {
                    if (!selectedClinic) return
                    const created = await createClinicService({
                      clinicId: selectedClinic.id,
                      serviceName: preset.name,
                      price: preset.price,
                      category: preset.cat,
                      isAvailable: true,
                    })
                    if (created) {
                      setServices((prev) => [...prev, created])
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-teal-50/85 hover:bg-teal-100 text-teal-900 border border-teal-200 text-xs font-bold cursor-pointer transition shadow-glass-sm"
                >
                  + {preset.name} (Rs. {preset.price})
                </button>
              ))}
            </div>
          </GlassCard>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <GlassCard variant="base" padding="md" radius="xl" className="space-y-4">
              <h3 className="text-lg font-black text-slate-900">Add Diagnostic Test</h3>
              <p className="text-xs text-slate-500 font-medium">
                Create a new test or package with your official rate.
              </p>

              <form onSubmit={handleAddService} className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Test Name</label>
                  <input
                    type="text"
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                    placeholder="e.g. Complete Blood Count (CBC)"
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Price (Rs.)</label>
                  <input
                    type="number"
                    value={newServicePrice}
                    onChange={(e) => setNewServicePrice(e.target.value)}
                    placeholder="e.g. 600"
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                  <select
                    value={newServiceCategory}
                    onChange={(e) => setNewServiceCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="Hematology">Hematology</option>
                    <option value="Biochemistry">Biochemistry</option>
                    <option value="Hormones & Immunology">Hormones & Immunology</option>
                    <option value="Microbiology & Serology">Microbiology & Serology</option>
                    <option value="Clinical Pathology">Clinical Pathology</option>
                    <option value="Radiology & Imaging">Radiology & Imaging</option>
                  </select>
                </div>

                <GlassButton
                  type="submit"
                  variant="primary"
                  size="md"
                  fullWidth
                >
                  Save Test & Publish Rate
                </GlassButton>
              </form>
            </GlassCard>

            <GlassCard variant="base" padding="md" radius="xl" className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900">Current Clinic Diagnostic Rates</h3>
                <GlassBadge variant="info" size="sm">
                  {services.length} Tests Active
                </GlassBadge>
              </div>

              <div className="space-y-2.5 max-h-[500px] overflow-y-auto">
                {services.map((srv) => (
                  <div
                    key={srv.id}
                    className="p-3.5 rounded-2xl border border-white/75 liquid-glass-subtle flex items-center justify-between shadow-glass-sm"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{srv.serviceName}</h4>
                      <span className="text-[10px] text-slate-400 font-medium">{srv.category}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs font-black text-teal-700">Rs. {srv.price}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteService(srv.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Remove test"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB 10: BROADCAST NOTIFICATION ALERT */}
      {/* ========================================================= */}
      {deskTab === 'broadcast' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <GlassCard variant="elevated" padding="lg" radius="xl" specular className="space-y-6">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Clinic Notification Broadcast Desk
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Transmits real-time alerts directly to patient devices and live tracker boards.
              </p>
            </div>

            {broadcastSent && (
              <div className="p-4 bg-brand-50/85 backdrop-blur-md border border-brand-200/80 rounded-2xl text-brand-800 text-xs font-bold flex items-center space-x-2 shadow-glass-sm">
                <CheckCircle2 className="w-4 h-4 text-brand-600" />
                <span>Broadcast message successfully sent to all patients!</span>
              </div>
            )}

            <form onSubmit={handleSendBroadcast} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Notification Title
                </label>
                <input
                  type="text"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="e.g. Doctor Delay Notice / Break Hour Resumption"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Alert Message
                </label>
                <textarea
                  rows={4}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Enter detailed notification content..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <GlassButton
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                leftIcon={<Send className="w-4 h-4" />}
              >
                Broadcast Notification
              </GlassButton>
            </form>
          </GlassCard>
        </div>
      )}

      {/* ========================================================= */}
      {/* DESK TAB 11: CLINIC PROFILE & OPERATIONAL SETTINGS (ClinicSettingsScreen.kt) */}
      {/* ========================================================= */}
      {deskTab === 'settings' && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* 1. PORTAL LICENSE & SUBSCRIPTION STATUS CARD (ClinicSettingsScreen.kt lines 155-235) */}
          <GlassCard variant="base" padding="lg" radius="xl" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-brand-600 block">
                  Dactor Cloud Operational License
                </span>
                <h3 className="text-lg font-black text-slate-900">
                  Portal Subscription & License Status
                </h3>
                <p className="text-xs text-slate-500">
                  Plan: <strong className="text-slate-800">{selectedClinic?.activationPlan || '1_month'}</strong> • Expires:{' '}
                  <strong className="text-slate-800">
                    {selectedClinic?.activationExpiresAt?.split('T')[0] || '30 Days'}
                  </strong>
                </p>
              </div>
              <GlassBadge
                variant={isSubscriptionActive ? 'success' : 'danger'}
                size="md"
              >
                {isSubscriptionActive
                  ? `Active • ${subscriptionDaysLeft} Days Left`
                  : 'Subscription Expired'}
              </GlassBadge>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <GlassButton
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setShowRenewalModal(true)}
              >
                Renew Subscription Plan (1 Month / 1 Year)
              </GlassButton>
              <GlassButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={submittingRenewal}
                onClick={handleInstantBypassSubscription}
              >
                ⚡ Instant 30-Day Testing Activation Bypass
              </GlassButton>
            </div>
          </GlassCard>

          {/* GOOGLE SEARCH, MAPS & AI OVERVIEW INTEGRATION CARD */}
          <GlassCard variant="base" padding="lg" radius="xl" className="space-y-4 border border-teal-500/30 bg-gradient-to-br from-white via-teal-50/20 to-cyan-50/20 dark:from-slate-900 dark:via-teal-950/20 dark:to-slate-900 shadow-glass-base">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-500 to-cyan-500 flex items-center justify-center text-white shadow-glass-sm shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 dark:text-teal-400 block">
                    Google Search, Maps & AI Overview Integration
                  </span>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Direct Google "Book Online" & AI Search Links
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                  Schema.org Active
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              When patients search your clinic or doctors on Google Search, Google Maps, or AI search engines (ChatGPT, Perplexity, Gemini), Dactor provides structured Schema.org <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">MedicalClinic</code> and <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">ReserveAction</code> metadata. Copy the booking link below and add it to your <strong>Google Business Profile</strong> on Google Maps to display an official <strong>"Book Online"</strong> button!
            </p>

            {/* Clinic Direct Booking Link */}
            {selectedClinic && (
              <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-teal-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-teal-600" />
                    Clinic Direct Booking Link (Google Maps / Business Profile)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyBookingLink(`https://dactorofficial.github.io/dactor/?clinic=${selectedClinic.id}&action=book`)}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-glass-sm"
                  >
                    {copiedLink?.includes(selectedClinic.id) && !copiedLink?.includes('doctor') ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-white/10 text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate">
                  https://dactorofficial.github.io/dactor/?clinic={selectedClinic.id}&amp;action=book
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  👉 Go to your <strong>Google Business Profile</strong> (Google Maps manager) &gt; Edit Profile &gt; Bookings / Links &gt; paste this link as your appointment booking link.
                </p>
              </div>
            )}

            {/* Doctor Specific Direct Booking Links */}
            {clinicDoctors.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 block">
                  Attending Doctors Direct Booking Links (Share on Google, WhatsApp, Social Media):
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {clinicDoctors.map((doc) => {
                    const docUrl = `https://dactorofficial.github.io/dactor/?clinic=${selectedClinic?.id}&doctor=${doc.id}&action=book`
                    const isDocCopied = copiedLink === docUrl
                    return (
                      <div
                        key={doc.id}
                        className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-white/10 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-800 dark:text-white truncate">
                            Dr. {doc.fullName} ({doc.specialty || 'Doctor'})
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            {docUrl}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyBookingLink(docUrl)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-700 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition shrink-0 cursor-pointer active:scale-95"
                        >
                          {isDocCopied ? (
                            <span className="text-emerald-600 font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" /> Copied
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Copy className="w-3 h-3" /> Copy
                            </span>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </GlassCard>

          {/* 1B. DATA BACKUP, CLOUD DISASTER RECOVERY & OFFLINE SNAPSHOTS */}
          <GlassCard variant="base" padding="lg" radius="xl" className="space-y-5 border border-sky-500/30 bg-gradient-to-br from-white via-sky-50/20 to-blue-50/20 dark:from-slate-900 dark:via-sky-950/20 dark:to-slate-900 shadow-glass-base">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-glass-sm shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 block">
                    Disaster Recovery &amp; Redundancy
                  </span>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Clinic Data Backup &amp; Google Drive Sync
                  </h3>
                </div>
              </div>
              <GlassBadge variant="brand" size="md">
                Encrypted Local &amp; Cloud Archive
              </GlassBadge>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Export complete clinic records (doctors, appointments, queue history, itemized billing invoices, patient directory, and operational settings) directly to your Google Drive or local storage for audit compliance and disaster recovery.
            </p>

            {driveSyncResult && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <span>Backup synced to Google Drive successfully! ({driveSyncResult.filename})</span>
                {driveSyncResult.webViewLink && (
                  <a
                    href={driveSyncResult.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold underline text-emerald-900 dark:text-emerald-200 inline-flex items-center space-x-1"
                  >
                    <span>Open in Drive</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}

            {driveSyncError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-700 rounded-xl text-xs text-rose-800 dark:text-rose-300">
                Failed to sync backup to Google Drive: {driveSyncError}
              </div>
            )}

            {downloadBackupResult && (
              <div className="p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-300 dark:border-sky-700 rounded-xl text-xs text-sky-800 dark:text-sky-300">
                Local backup downloaded: <strong>{downloadBackupResult.filename}</strong> (SHA-256 integrity sealed)
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* 1. Google Drive Sync Button */}
              <button
                type="button"
                onClick={handleSyncToGoogleDrive}
                disabled={isSyncingGoogleDrive}
                className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-sky-400/40 hover:border-sky-500 text-left transition space-y-2 cursor-pointer shadow-glass-sm hover:shadow-md disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <UploadCloud className={`w-5 h-5 text-sky-600 ${isSyncingGoogleDrive ? 'animate-bounce' : ''}`} />
                  <span className="text-[10px] font-bold text-sky-700 bg-sky-100 dark:bg-sky-950 px-2 py-0.5 rounded-full">
                    {isSyncingGoogleDrive ? 'Syncing...' : '1-Click Cloud'}
                  </span>
                </div>
                <div className="text-xs font-black text-slate-900 dark:text-white">Sync to Google Drive</div>
                <div className="text-[10px] text-slate-500">Exports timestamped snapshot to Google Drive &quot;Dactor Clinic Backups&quot; folder.</div>
              </button>

              {/* 2. Download Local Backup Button */}
              <button
                type="button"
                onClick={handleDownloadLocalBackup}
                disabled={isDownloadingBackup}
                className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 hover:border-brand-500 text-left transition space-y-2 cursor-pointer shadow-glass-sm hover:shadow-md disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <Download className={`w-5 h-5 text-brand-600 ${isDownloadingBackup ? 'animate-bounce' : ''}`} />
                  <span className="text-[10px] font-bold text-brand-700 bg-brand-100 dark:bg-brand-950 px-2 py-0.5 rounded-full">
                    {isDownloadingBackup ? 'Exporting...' : 'Direct JSON'}
                  </span>
                </div>
                <div className="text-xs font-black text-slate-900 dark:text-white">Download Local Backup</div>
                <div className="text-[10px] text-slate-500">Instantly saves complete structured JSON archive to your local hard drive.</div>
              </button>

              {/* 3. Restore Backup Button */}
              <button
                type="button"
                onClick={() => {
                  setRestoreError(null)
                  setRestoreResult(null)
                  setShowRestoreModal(true)
                }}
                className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 hover:border-emerald-500 text-left transition space-y-2 cursor-pointer shadow-glass-sm hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <RefreshCw className="w-5 h-5 text-emerald-600" />
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full">Restore Archive</span>
                </div>
                <div className="text-xs font-black text-slate-900 dark:text-white">Restore Backup File</div>
                <div className="text-[10px] text-slate-500">Restores clinic records from a previously exported backup snapshot file.</div>
              </button>
            </div>
          </GlassCard>

          {/* 2. CLINIC PROFILE, OPERATIONAL TYPE, GPS & PAYMENT GATEWAY FORM */}
          <GlassCard variant="base" padding="lg" radius="xl" className="space-y-6">
            <div>
              <h2 className="text-xl font-black text-slate-900">Clinic Profile & Operational Settings</h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Configure your official registration details, facility type, 13 Nepal City GPS coordinates, specialties, and direct payment gateway keys.
              </p>
            </div>

            {settingsSuccess && (
              <div className="p-4 bg-brand-50/85 backdrop-blur-md border border-brand-200/80 rounded-2xl text-brand-800 text-xs font-bold flex items-center space-x-2 shadow-glass-sm">
                <CheckCircle2 className="w-4 h-4 text-brand-600" />
                <span>Clinic settings successfully updated in database!</span>
              </div>
            )}

            <form onSubmit={handleSaveClinicSettings} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Clinic Name</label>
                  <input
                    type="text"
                    value={settingName}
                    onChange={(e) => setSettingName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Operational Facility Type
                  </label>
                  <div className="relative">
                    <select
                      value={settingType}
                      disabled
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs font-bold liquid-glass-input opacity-75 cursor-not-allowed bg-slate-100 dark:bg-slate-800 focus:outline-none"
                    >
                      <option value="multi_visit">Polyclinic / Multi-Visit OPD Hospital</option>
                      <option value="single_Specialty">Single-Specialty Clinic</option>
                      <option value="diagnostic_lab">Diagnostic Pathology Lab</option>
                    </select>
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium mt-1">
                      🔒 Facility operational model is locked after registration. Contact Super Admin to request changes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={settingPhone}
                    onChange={(e) => setSettingPhone(e.target.value)}
                    placeholder="e.g. 014XXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Manager Phone</label>
                  <input
                    type="tel"
                    value={settingManagerPhone}
                    onChange={(e) => setSettingManagerPhone(e.target.value)}
                    placeholder="e.g. 98XXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">PAN / VAT Number</label>
                  <input
                    type="text"
                    value={settingPan}
                    onChange={(e) => setSettingPan(e.target.value)}
                    placeholder="e.g. 601234567"
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={settingEmail}
                    onChange={(e) => setSettingEmail(e.target.value)}
                    placeholder="clinic@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* Address & 13 Nepal Cities GPS Presets (ClinicSettingsScreen.kt) */}
              <div className="p-4 rounded-2xl liquid-glass-subtle border border-white/75 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Address Text</label>
                  <input
                    type="text"
                    value={settingAddress}
                    onChange={(e) => setSettingAddress(e.target.value)}
                    placeholder="Street Address, City, Ward"
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-600 block">
                    Quick Nepal City GPS Presets (13 Major Cities):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {NEPAL_CITY_PRESETS.map((city) => (
                      <button
                        key={city.name}
                        type="button"
                        onClick={() => {
                          setSettingLat(city.lat)
                          setSettingLng(city.lng)
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/80 hover:bg-brand-50 text-slate-700 hover:text-brand-800 border border-white/80 text-[10px] font-bold cursor-pointer"
                      >
                        📍 {city.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={settingLat}
                      onChange={(e) => setSettingLat(parseFloat(e.target.value) || 27.7172)}
                      className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={settingLng}
                      onChange={(e) => setSettingLng(parseFloat(e.target.value) || 85.324)}
                      className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSettingsGPS}
                    disabled={isDetectingLocation}
                    className="py-2 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center justify-center space-x-1 shadow-glass-sm"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{isDetectingLocation ? 'Detecting...' : 'Detect Live GPS'}</span>
                  </button>
                </div>
              </div>

              {/* Specialties Multi-Select */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  Available Medical Specialties & Departments
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {defaultSpecialtyList.map((spec) => {
                    const selected = settingSpecialties.includes(spec)
                    return (
                      <button
                        key={spec}
                        type="button"
                        onClick={() =>
                          setSettingSpecialties(
                            selected
                              ? settingSpecialties.filter((s) => s !== spec)
                              : [...settingSpecialties, spec]
                          )
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition ${
                          selected
                            ? 'bg-brand-600 text-white border-brand-600 shadow-glass-sm'
                            : 'bg-white/65 text-slate-700 border-white/80 hover:bg-white/90'
                        }`}
                      >
                        {selected ? `✓ ${spec}` : `+ ${spec}`}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Facility Description & Patient Instructions
                </label>
                <textarea
                  rows={2}
                  value={settingDesc}
                  onChange={(e) => setSettingDesc(e.target.value)}
                  placeholder="Describe available diagnostic services, pharmacy, parking, and OPD timings..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium liquid-glass-input"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Auto-Notify Threshold (Number of patients ahead before auto-alert)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={settingThreshold}
                  onChange={(e) => setSettingThreshold(Number(e.target.value) || 2)}
                  className="w-32 px-3.5 py-2 rounded-xl text-xs font-bold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Direct Payment Gateway & API Configuration (ClinicSettingsScreen.kt lines 420-530) */}
              <div className="p-5 rounded-2xl liquid-glass-subtle border border-white/75 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Direct Patient Payment Gateway Integration
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Configure eSewa, Khalti, Fonepay &amp; ConnectIPS simultaneously. Only gateways with verified keys are shown to patients; <strong>Pay at Desk (+5%)</strong> is always available without keys.
                    </p>
                  </div>
                  <label className="flex items-center space-x-2 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settingDirectPaymentEnabled}
                      onChange={(e) => setSettingDirectPaymentEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600"
                    />
                    <span className="text-xs font-bold text-slate-800">Enable Online Gateways</span>
                  </label>
                </div>

                {/* Multi-Gateway Tabs with Live Verification Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'esewa' as OnlineGatewayId, label: 'eSewa', sub: 'ePay v2 Wallet' },
                      { id: 'khalti' as OnlineGatewayId, label: 'Khalti', sub: 'ePayment v2' },
                      { id: 'fonepay' as OnlineGatewayId, label: 'Fonepay', sub: 'Dynamic QR / Web' },
                      { id: 'connectips' as OnlineGatewayId, label: 'ConnectIPS', sub: 'NCHL Direct Bank' },
                    ]
                  ).map((gw) => {
                    const st = gatewaySetupStatus?.[gw.id]
                    const isVerifiedAndEnabled = Boolean(st?.is_verified && st?.enabled && settingDirectPaymentEnabled)
                    const isVerifiedOnly = Boolean(st?.is_verified)
                    return (
                      <button
                        key={gw.id}
                        type="button"
                        onClick={() => {
                          setSettingGatewayProvider(gw.id)
                          populateGatewayFormFromSetup(gw.id, gatewaySetupStatus)
                        }}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          settingGatewayProvider === gw.id
                            ? 'bg-brand-50/90 border-brand-500 ring-2 ring-brand-500/20'
                            : 'bg-white/70 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900">{gw.label}</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              isVerifiedAndEnabled
                                ? 'bg-emerald-100 text-emerald-800'
                                : isVerifiedOnly
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {isVerifiedAndEnabled ? '● Live to Patients' : isVerifiedOnly ? 'Paused' : 'Keys Needed'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 block mt-0.5">{gw.sub}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Per-Gateway Enable Toggle & Environment Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-white/70 border border-slate-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Show {settingGatewayProvider.toUpperCase()} Option to Patients
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Requires verified merchant keys saved on server
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settingGatewayEnabled}
                      onChange={(e) => setSettingGatewayEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      {settingGatewayProvider.toUpperCase()} Environment
                    </label>
                    <select
                      value={settingPaymentEnvironment}
                      onChange={(e) => setSettingPaymentEnvironment(e.target.value as 'test' | 'live')}
                      className={`w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-bold ${
                        settingPaymentEnvironment === 'live' ? 'text-emerald-700 font-black' : 'text-amber-700'
                      }`}
                    >
                      <option value="test">TEST / Sandbox Environment</option>
                      <option value="live">LIVE Production Environment</option>
                    </select>
                  </div>
                </div>

                {/* 1. eSewa Fields */}
                {settingGatewayProvider === 'esewa' && (
                  <div className="space-y-3 pt-1">
                    <div className={`p-3 rounded-xl border text-[11px] flex items-start justify-between gap-3 ${
                      settingPaymentEnvironment === 'live'
                        ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900'
                        : 'bg-amber-50/70 border-amber-300 text-amber-900'
                    }`}>
                      <div>
                        <span className="font-bold block">
                          {settingPaymentEnvironment === 'live' ? '● eSewa LIVE PRODUCTION MODE' : '● eSewa SANDBOX MODE'}
                        </span>
                        <span>
                          {settingPaymentEnvironment === 'live'
                            ? 'Processed via epay.esewa.com.np directly into your clinic eSewa merchant account.'
                            : 'Uses rc-epay.esewa.com.np sandbox. No real money is charged.'}
                        </span>
                      </div>
                      {settingPaymentEnvironment === 'test' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSettingMerchantId('EPAYTEST')
                            setSettingPaymentSecretKey('8gBm/:&EnhH.1/q')
                          }}
                          className="shrink-0 px-2.5 py-1 bg-amber-200/80 hover:bg-amber-300 text-amber-900 font-bold rounded-lg text-[10px] transition cursor-pointer"
                        >
                          Fill Sandbox Defaults
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          eSewa Product Code (Merchant ID) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={settingMerchantId}
                          onChange={(e) => setSettingMerchantId(e.target.value)}
                          placeholder="e.g. EPAYTEST or live Product Code"
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700 block">
                            eSewa Secret Key (HMAC-SHA256) <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowPaymentSecretKey(!showPaymentSecretKey)}
                            className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold cursor-pointer"
                          >
                            {showPaymentSecretKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{showPaymentSecretKey ? 'Hide' : 'Show'}</span>
                          </button>
                        </div>
                        <input
                          type={showPaymentSecretKey ? 'text' : 'password'}
                          value={settingPaymentSecretKey}
                          onChange={(e) => setSettingPaymentSecretKey(e.target.value)}
                          placeholder={gatewaySetupStatus?.esewa?.has_secret_key ? 'Saved securely on server (enter new to rotate)' : 'Enter eSewa HMAC Secret Key'}
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Khalti Fields */}
                {settingGatewayProvider === 'khalti' && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700 block">
                            Khalti Secret Key ({settingPaymentEnvironment === 'live' ? 'live_secret_key_...' : 'test_secret_key_...'}) <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowPaymentSecretKey(!showPaymentSecretKey)}
                            className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold cursor-pointer"
                          >
                            {showPaymentSecretKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{showPaymentSecretKey ? 'Hide' : 'Show'}</span>
                          </button>
                        </div>
                        <input
                          type={showPaymentSecretKey ? 'text' : 'password'}
                          value={settingPaymentSecretKey}
                          onChange={(e) => setSettingPaymentSecretKey(e.target.value)}
                          placeholder={gatewaySetupStatus?.khalti?.has_secret_key ? 'Saved securely on server (enter new to rotate)' : 'Key from admin.khalti.com -> Keys'}
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Khalti Public Key / Merchant Label (Optional)
                        </label>
                        <input
                          type="text"
                          value={settingPaymentApiKey}
                          onChange={(e) => setSettingPaymentApiKey(e.target.value)}
                          placeholder="live_public_key_... or Merchant ID"
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Fonepay Fields */}
                {settingGatewayProvider === 'fonepay' && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Fonepay Merchant Code (PID) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={settingMerchantId}
                          onChange={(e) => setSettingMerchantId(e.target.value)}
                          placeholder="e.g. NBQM or your Fonepay PID"
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700 block">
                            Fonepay HMAC-SHA512 Secret Key <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowPaymentSecretKey(!showPaymentSecretKey)}
                            className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold cursor-pointer"
                          >
                            {showPaymentSecretKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{showPaymentSecretKey ? 'Hide' : 'Show'}</span>
                          </button>
                        </div>
                        <input
                          type={showPaymentSecretKey ? 'text' : 'password'}
                          value={settingPaymentSecretKey}
                          onChange={(e) => setSettingPaymentSecretKey(e.target.value)}
                          placeholder={gatewaySetupStatus?.fonepay?.has_secret_key ? 'Saved securely on server (enter new to rotate)' : 'Fonepay shared HMAC secret'}
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Dynamic QR API Username (Optional — for background QR polling)
                        </label>
                        <input
                          type="text"
                          value={settingFonepayUsername}
                          onChange={(e) => setSettingFonepayUsername(e.target.value)}
                          placeholder="98... or Fonepay API username"
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Dynamic QR API Password (Optional)
                        </label>
                        <input
                          type="password"
                          value={settingFonepayPassword}
                          onChange={(e) => setSettingFonepayPassword(e.target.value)}
                          placeholder={gatewaySetupStatus?.fonepay?.has_password ? 'Saved on server' : 'Optional API password'}
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. ConnectIPS Fields */}
                {settingGatewayProvider === 'connectips' && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          ConnectIPS Merchant ID <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={settingMerchantId}
                          onChange={(e) => setSettingMerchantId(e.target.value)}
                          placeholder="e.g. 509"
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          ConnectIPS App ID <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={settingConnectIpsAppId}
                          onChange={(e) => setSettingConnectIpsAppId(e.target.value)}
                          placeholder="e.g. MER-509-APP-1"
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          ConnectIPS App Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={settingConnectIpsAppName}
                          onChange={(e) => setSettingConnectIpsAppName(e.target.value)}
                          placeholder="Assigned NCHL App Name"
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Validation API Password (Basic Auth) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type={showPaymentSecretKey ? 'text' : 'password'}
                          value={settingConnectIpsAppPassword}
                          onChange={(e) => setSettingConnectIpsAppPassword(e.target.value)}
                          placeholder={gatewaySetupStatus?.connectips?.has_app_password ? 'Saved securely on server' : 'NCHL API validation password'}
                          className="w-full px-3 py-2 rounded-xl liquid-glass-input text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* ConnectIPS Certificate (.pfx upload OR PKCS#8 PEM) */}
                    <div className="p-3 rounded-xl bg-white/75 border border-slate-200 space-y-2.5">
                      <div className="text-[11px] font-bold text-slate-800">
                        NCHL Signing Certificate (Upload <code>.pfx</code> + Password <em>OR</em> Paste Private Key PEM) <span className="text-rose-500">*</span>
                        {gatewaySetupStatus?.connectips?.has_private_key && (
                          <span className="ml-2 text-emerald-700 font-semibold">(✓ Signing key saved on server)</span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-1">Upload CREDITOR.pfx / .p12</label>
                          <input
                            type="file"
                            accept=".pfx,.p12,application/x-pkcs12"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              setSettingConnectIpsPfxFileName(file.name)
                              const reader = new FileReader()
                              reader.onload = () => {
                                const res = String(reader.result || '')
                                setSettingConnectIpsPfxBase64(res)
                              }
                              reader.readAsDataURL(file)
                            }}
                            className="w-full text-[11px] file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-brand-100 file:text-brand-800 file:font-bold"
                          />
                          {settingConnectIpsPfxFileName && (
                            <span className="text-[10px] text-emerald-700 font-semibold block mt-1">
                              Loaded: {settingConnectIpsPfxFileName}
                            </span>
                          )}
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-1">.pfx Certificate Password</label>
                          <input
                            type="password"
                            value={settingConnectIpsPfxPassword}
                            onChange={(e) => setSettingConnectIpsPfxPassword(e.target.value)}
                            placeholder="Password for .pfx file"
                            className="w-full px-3 py-1.5 rounded-xl liquid-glass-input text-xs font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">Or Paste RSA Private Key (PEM)</label>
                        <textarea
                          rows={2}
                          value={settingConnectIpsPrivateKeyPem}
                          onChange={(e) => setSettingConnectIpsPrivateKeyPem(e.target.value)}
                          placeholder="-----BEGIN PRIVATE KEY----- ..."
                          className="w-full px-3 py-1.5 rounded-xl liquid-glass-input text-[11px] font-mono"
                        />
                      </div>
                    </div>

                    {/* Copyable ConnectIPS Portal Success/Failure Callback URL */}
                    <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-teal-900 block">NCHL Portal Success &amp; Failure Return URL:</span>
                        <code className="text-[10px] text-teal-800 break-all">
                          {`${gatewaySetupStatus?.callbackBaseUrl || `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/appointment-payment`}?action=return&gateway=connectips`}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyBookingLink(
                            `${gatewaySetupStatus?.callbackBaseUrl || `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/appointment-payment`}?action=return&gateway=connectips`
                          )
                        }
                        className="shrink-0 px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Callback URL</span>
                      </button>
                    </div>
                  </div>
                )}

                {gatewayStatusMsg && (
                  <div
                    className={`p-2.5 rounded-xl text-xs font-semibold ${
                      gatewayStatusMsg.type === 'ok'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-800'
                    }`}
                  >
                    {gatewayStatusMsg.text}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <span className="text-[10.5px] text-slate-600 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                    <span>Background-safe: appointments &amp; queue tokens generate automatically even if the patient closes the app during payment.</span>
                  </span>
                  <button
                    type="button"
                    disabled={savingGatewayOnly}
                    onClick={handleSaveSelectedGatewayOnly}
                    className="shrink-0 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
                  >
                    {savingGatewayOnly ? 'Verifying Keys...' : `Verify & Save ${settingGatewayProvider.toUpperCase()} Keys`}
                  </button>
                </div>
              </div>

              <GlassButton
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={savingSettings}
              >
                {savingSettings ? 'Verifying with Provider & Saving Settings...' : 'Save All Clinic Profile & Gateway Settings'}
              </GlassButton>
            </form>
          </GlassCard>

          {/* 3. CLINIC FACILITY PHOTOS & LOGO GALLERY (1-4 Photos) */}
          <GlassCard variant="base" padding="lg" radius="xl" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/60">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-brand-600" />
                  <span>Clinic Facility Photos (1–4 Photos)</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Real photos of your clinic facility, reception, and consultation cabins. Synced directly to patient search and profile view.
                </p>
              </div>
              <GlassBadge variant="brand" size="md">
                {selectedClinic?.pictures?.length || 0} / 4 Photos
              </GlassBadge>
            </div>

            {clinicPhotoStatusMsg && (
              <div className="p-3 bg-brand-50/85 backdrop-blur-md border border-brand-200/80 rounded-2xl text-brand-800 text-xs font-bold flex items-center space-x-2 shadow-glass-sm">
                <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0" />
                <span>{clinicPhotoStatusMsg}</span>
              </div>
            )}

            {/* Photo Gallery Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {selectedClinic?.pictures && selectedClinic.pictures.length > 0 ? (
                selectedClinic.pictures.map((picUrl, idx) => {
                  const isCover = (selectedClinic.logoUrl === picUrl) || (idx === 0 && !selectedClinic.logoUrl)
                  return (
                    <div
                      key={idx}
                      className="group relative rounded-2xl border border-white/80 overflow-hidden bg-slate-100 shadow-glass-sm"
                    >
                      <div className="w-full h-44 overflow-hidden relative">
                        <img
                          src={picUrl}
                          alt={`Facility Photo ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                      </div>

                      {/* Top Badges */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-black/60 text-white backdrop-blur-xs">
                          Photo #{idx + 1}
                        </span>
                        {isCover && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-brand-600 text-white shadow-xs">
                            Cover / Main Photo
                          </span>
                        )}
                      </div>

                      {/* Bottom Actions */}
                      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                        {!isCover ? (
                          <button
                            type="button"
                            onClick={() => handleSetClinicCoverPhoto(picUrl)}
                            className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-white/90 hover:bg-white text-slate-800 backdrop-blur-xs shadow-xs transition-colors cursor-pointer"
                          >
                            Set as Cover
                          </button>
                        ) : (
                          <span className="text-[10px] text-white/90 font-bold drop-shadow-xs">Active Banner</span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveClinicPhoto(idx)}
                          className="p-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-700 text-white transition-colors cursor-pointer"
                          title="Remove this photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="col-span-full p-8 border-2 border-dashed border-white/80 rounded-3xl text-center space-y-2 liquid-glass-subtle">
                  <Camera className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">No Facility Photos Added Yet</p>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    Add up to 4 real photos of your facility entrance, OPD chambers, or reception to build trust with patients.
                  </p>
                </div>
              )}
            </div>

            {/* Add Photo Button / File Picker (if < 4 photos) */}
            {(selectedClinic?.pictures?.length || 0) < 4 && (
              <div className="pt-2">
                <label className="flex items-center justify-center space-x-2 w-full py-4 px-6 border-2 border-dashed border-brand-300 hover:border-brand-500 rounded-2xl bg-brand-50/50 hover:bg-brand-50/80 backdrop-blur-md transition-all cursor-pointer">
                  <UploadCloud className="w-5 h-5 text-brand-600" />
                  <span className="text-xs font-bold text-brand-800">
                    {uploadingClinicPhoto ? 'Compressing & Uploading...' : `+ Upload Facility Photo (${(selectedClinic?.pictures?.length || 0) + 1} of 4)`}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingClinicPhoto}
                    onChange={handleUploadClinicPhoto}
                    className="hidden"
                  />
                </label>
                <p className="text-[10px] text-slate-400 text-center mt-1.5">
                  Images are automatically compressed to ≤ 300 KB and uploaded securely.
                </p>
              </div>
            )}
          </GlassCard>

          {/* 4. LEGAL TERMS & 30-DAY ARCHIVE ACCOUNT DELETION (ClinicSettingsScreen.kt lines 540-630) */}
          <GlassCard variant="base" padding="lg" radius="xl" className="border-rose-200/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Regulatory Terms & Account Lifecycle Governance
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review your Dactor healthcare provider agreement or schedule a 30-day reversible clinic account deletion.
                </p>
              </div>
              <GlassButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowTermsModal(true)}
              >
                View Regulatory Terms & Conditions
              </GlassButton>
            </div>

            <div className="pt-3 border-t border-white/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-rose-700">
                <strong>30-Day Reversible Archive &amp; Reclaim Policy:</strong> Deleting your clinic account immediately places it into a 30-day reversible archive, hiding it from patient search. You can reactivate or reclaim your account anytime within 30 days before permanent deletion.
              </div>
              {selectedClinic?.isArchived ? (
                <button
                  type="button"
                  onClick={handleCancelClinicArchive}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs cursor-pointer shrink-0 shadow-glass-sm"
                >
                  Reactivate / Reclaim Clinic Account
                </button>
              ) : (
                <GlassButton
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteArchiveModal(true)}
                >
                  Schedule 30-Day Account Archive &amp; Deletion
                </GlassButton>
              )}
            </div>

            {/* Official Account Deletion & Data Erasure Portal URL (Google Play Compliant) */}
            <div className="pt-3 border-t border-white/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>Official Account &amp; Data Deletion Portal URL</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Statutory web portal for account and personal data deletion under Google Play policies and Nepal Individual Privacy Act 2075.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href="./data-deletion.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition shadow-glass-sm"
                  title="Open official Google Play compliant account deletion URL"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Account Deletion URL</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </GlassCard>

          {/* 5. CONTACT US & OFFICIAL SUPPORT HELPDESK */}
          <GlassCard variant="base" padding="lg" radius="xl" className="border-indigo-200/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
                  <Headphones className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Contact Us & Dactor Helpdesk Support
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Connect directly to our dedicated support center for assistance with licenses, onboarding, or technical questions.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <a
                  href={supportUrl.startsWith('http') || supportUrl.startsWith('mailto:') ? supportUrl : `https://${supportUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Contact Support Desk</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-80" />
                </a>
              </div>
            </div>
          </GlassCard>

          {/* 6. ADMIN CITIES & LOCATIONS DROPDOWN MANAGER */}
          <GlassCard variant="base" padding="lg" radius="xl" className="border-emerald-200/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-100 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Cities & Locations Dropdown Manager</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                      Live Sync
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Add, delete, or toggle cities and regions shown in the main location dropdown across the website and patient mobile app.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadAdminCities}
                  disabled={loadingAdminCities}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAdminCities ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddCityModal(true)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add City to Dropdown</span>
                </button>
              </div>
            </div>

            {cityActionMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{cityActionMsg}</span>
              </div>
            )}

            {/* Quick Live Preview Pill */}
            <div className="p-3 rounded-xl liquid-glass-subtle flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                Active in Dropdown:
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 text-xs">
                📍 All Nepal (Universal)
              </span>
              {adminCities.filter(c => c.isActive).map(c => (
                <span
                  key={c.id}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800 text-xs flex items-center gap-1"
                >
                  <span>📍 {c.name}</span>
                </span>
              ))}
            </div>

            {/* Cities Table */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3.5">City Name</th>
                      <th className="py-2.5 px-3.5">District / Area Aliases</th>
                      <th className="py-2.5 px-3.5">Center Coordinates</th>
                      <th className="py-2.5 px-3.5">Dropdown Visibility</th>
                      <th className="py-2.5 px-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {loadingAdminCities && adminCities.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                          <span>Loading city options from database...</span>
                        </td>
                      </tr>
                    ) : adminCities.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No cities found in database. Click &quot;+ Add City to Dropdown&quot; to add one.
                        </td>
                      </tr>
                    ) : (
                      adminCities.map((city) => (
                        <tr key={city.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3.5 font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{city.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-slate-600 dark:text-slate-400">
                            <span className="line-clamp-1 max-w-xs text-[11px]">
                              {city.aliases || city.name.toLowerCase()}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 font-mono text-[11px] text-slate-500">
                            {city.coordinates || '27.7172, 85.3240'}
                          </td>
                          <td className="py-3 px-3.5">
                            <button
                              type="button"
                              onClick={() => handleToggleCityActive(city)}
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-full cursor-pointer transition ${
                                city.isActive
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {city.isActive ? 'Shown in Dropdown' : 'Hidden'}
                            </button>
                          </td>
                          <td className="py-3 px-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteCity(city)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                              title={`Delete ${city.name} from dropdown`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </GlassCard>

          {/* Add City Modal */}
          {showAddCityModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/60">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-600">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      Add New City to Location Dropdown
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddCityModal(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleAddNewCity} className="space-y-3.5">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      City / Location Name *
                    </label>
                    <input
                      type="text"
                      value={newCityName}
                      onChange={(e) => setNewCityName(e.target.value)}
                      placeholder="e.g. Butwal, Janakpur, Itahari, Birtamode..."
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      District & Area Keywords (Comma-separated)
                    </label>
                    <input
                      type="text"
                      value={newCityAliases}
                      onChange={(e) => setNewCityAliases(e.target.value)}
                      placeholder="e.g. butwal, rupandehi, bhairahawa, lumbini"
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Clinics whose address matches any of these keywords will be found when this city is chosen.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Center Coordinates (Latitude, Longitude)
                    </label>
                    <input
                      type="text"
                      value={newCityCoords}
                      onChange={(e) => setNewCityCoords(e.target.value)}
                      placeholder="27.7172, 85.3240"
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowAddCityModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingCity}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/20 transition cursor-pointer disabled:opacity-60"
                    >
                      {isSubmittingCity ? 'Adding...' : 'Add City to Dropdown'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PUSH ALERT NOTIFICATION WITH REAL TEMPLATE PREVIEW */}
      {/* ========================================================= */}
      {pushAlertModalOpen && pushAlertTargetAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600">
                  Live Queue Push Alert
                </span>
                <h3 className="text-lg font-black text-slate-900">
                  Send Push Notification to Patient
                </h3>
                <p className="text-xs text-slate-500">
                  Patient: <strong className="text-slate-900">{pushAlertTargetAppt.patientName}</strong> • Token #{pushAlertTargetAppt.trackingCode10Digit}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPushAlertModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* REAL NOTIFICATION TEMPLATE PREVIEW */}
            <div className="p-4 bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl shadow-inner border border-white/15 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {/* Real App Logo SVG */}
                  <img
                    src={dactorLogo}
                    alt="Dactor Logo"
                    className="w-7 h-7 rounded-lg bg-white p-0.5 object-contain shadow-xs"
                  />
                  <span className="text-xs font-black tracking-wide text-brand-400">
                    DACTOR HEALTH
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Real-Time Alert</span>
              </div>

              <div>
                <h4 className="text-xs font-bold text-white">{pushAlertTitle}</h4>
                <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-2">
                  {pushAlertMessage}
                </p>
              </div>

              {/* 2-Metric Pill Cards (Notification Template requirement) */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                  <span className="text-[10px] text-slate-400 font-medium block">
                    Estimated Time Left
                  </span>
                  <span className="text-xs font-black text-brand-400 mt-0.5 block">
                    {pushAlertLeftVal || 'Soon, be ready'}
                  </span>
                </div>
                <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                  <span className="text-[10px] text-slate-400 font-medium block">
                    Your Appointment Time
                  </span>
                  <span className="text-xs font-black text-blue-400 mt-0.5 block">
                    {pushAlertRightVal || 'Soon, be ready'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 block">Quick Alert Templates:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPushAlertTitle(`Token #${pushAlertTargetAppt.trackingCode10Digit}: Doctor Ready for Consultation`)
                    setPushAlertMessage(`Dear ${pushAlertTargetAppt.patientName}, doctor is ready for consultation. Please proceed to Cabin 1.`)
                  }}
                  className="px-2.5 py-1 bg-white/75 border border-white/80 hover:bg-white text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
                >
                  Ready for Cabin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPushAlertTitle(`Token #${pushAlertTargetAppt.trackingCode10Digit}: Minor Consultation Delay`)
                    setPushAlertMessage(`Doctor consultation is running approximately 10 minutes late due to critical OPD case. Thank you for your patience.`)
                  }}
                  className="px-2.5 py-1 bg-white/75 border border-white/80 hover:bg-white text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
                >
                  10 Mins Delay
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPushAlertTitle(`Token #${pushAlertTargetAppt.trackingCode10Digit}: Clinic on Short Break`)
                    setPushAlertMessage(`The clinic is temporarily on a 15-minute break. Live queue consultations will resume shortly.`)
                  }}
                  className="px-2.5 py-1 bg-white/75 border border-white/80 hover:bg-white text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
                >
                  Clinic on Break
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPushAlertTitle(`Token #${pushAlertTargetAppt.trackingCode10Digit}: Report to Reception Desk`)
                    setPushAlertMessage(`Please report to the reception desk for document and billing settlement.`)
                  }}
                  className="px-2.5 py-1 bg-white/75 border border-white/80 hover:bg-white text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
                >
                  Visit Reception
                </button>
              </div>
            </div>

            <form onSubmit={handleSendPushAlertSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Notification Title
                </label>
                <input
                  type="text"
                  value={pushAlertTitle}
                  onChange={(e) => setPushAlertTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Message Content
                </label>
                <textarea
                  rows={3}
                  value={pushAlertMessage}
                  onChange={(e) => setPushAlertMessage(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs font-medium liquid-glass-input focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Left Metric (Estimated Wait)
                  </label>
                  <input
                    type="text"
                    value={pushAlertLeftVal}
                    onChange={(e) => setPushAlertLeftVal(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold liquid-glass-input"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Right Metric (Appointment Time)
                  </label>
                  <input
                    type="text"
                    value={pushAlertRightVal}
                    onChange={(e) => setPushAlertRightVal(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold liquid-glass-input"
                  />
                </div>
              </div>

              {pushAlertSentSuccess && (
                <div className="p-3 bg-brand-50/85 border border-brand-200 rounded-xl text-brand-800 text-xs font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-600" />
                  <span>Push notification delivered to patient device!</span>
                </div>
              )}

              <div className="flex items-center space-x-3 pt-2">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setPushAlertModalOpen(false)}
                >
                  Cancel
                </GlassButton>
                <button
                  type="submit"
                  disabled={sendingPushAlert}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-colors shadow-md shadow-purple-600/20 cursor-pointer"
                >
                  {sendingPushAlert ? 'Transmitting Alert...' : 'Send Push Alert to Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PUSH BILL & UPDATE PAYMENT (WITH DIRECT CATALOG) */}
      {/* ========================================================= */}
      {billModalOpen && billTargetAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-xl w-full p-6 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
                  Billing & Payment Desk
                </span>
                <h3 className="text-lg font-black text-slate-900">
                  Push Bill & Invoice to Patient
                </h3>
                <p className="text-xs text-slate-500">
                  Patient: <strong className="text-slate-900">{billTargetAppt.patientName}</strong> • Token #{billTargetAppt.trackingCode10Digit}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBillModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBill} className="space-y-4">
              {/* Direct Catalog 1-Click Quick Chips */}
              <div className="space-y-2 p-3 liquid-glass-subtle rounded-2xl border border-white/75">
                <span className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                  <Tag className="w-3.5 h-3.5 text-brand-600" />
                  <span>Click to Add from Clinic Catalog:</span>
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pt-1">
                  {/* Default standard items */}
                  {[
                    { serviceName: 'OPD Consultation', price: Number(selectedDoctor?.consultationFee) || 500 },
                    { serviceName: 'Blood Glucose Test', price: 150 },
                    { serviceName: 'CBC Blood Count', price: 400 },
                    { serviceName: 'ECG Recording', price: 800 },
                    { serviceName: 'Wound Dressing', price: 250 },
                    { serviceName: 'Nebulization', price: 300 },
                    ...services,
                  ].map((catItem, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAddCatalogItemToBill(catItem)}
                      className="px-2.5 py-1 bg-white/80 hover:bg-brand-50 hover:text-brand-800 text-slate-700 text-[11px] font-bold rounded-lg border border-white/90 hover:border-brand-300 transition-colors cursor-pointer shadow-glass-sm flex items-center space-x-1"
                    >
                      <span>+ {catItem.serviceName}</span>
                      <span className="text-brand-600 font-mono font-black">(Rs. {catItem.price})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Line Item Input */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={customBillItemName}
                  onChange={(e) => setCustomBillItemName(e.target.value)}
                  placeholder="Custom Item Name (e.g. Suture, Injection)"
                  className="flex-1 px-3 py-2 rounded-xl liquid-glass-input text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  type="number"
                  value={customBillItemPrice}
                  onChange={(e) => setCustomBillItemPrice(e.target.value)}
                  placeholder="Price (Rs.)"
                  className="w-24 px-3 py-2 rounded-xl liquid-glass-input text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={handleAddCustomBillItem}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer shadow-glass-sm"
                >
                  + Add
                </button>
              </div>

              {/* Itemized Line Items Table */}
              {billItems.length > 0 && (
                <div className="border border-white/80 rounded-xl overflow-hidden text-xs shadow-glass-sm">
                  <div className="bg-white/65 p-2 font-bold text-slate-700 flex justify-between border-b border-white/60">
                    <span>Invoice Line Items</span>
                    <span>Subtotal</span>
                  </div>
                  <div className="divide-y divide-slate-200/50 max-h-36 overflow-y-auto bg-white/75 backdrop-blur-md">
                    {billItems.map((it) => (
                      <div key={it.id} className="p-2.5 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveBillItem(it.id)}
                            className="text-slate-300 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-bold text-slate-800">{it.name}</span>
                          <span className="text-slate-500 font-mono text-[10px]">
                            @ Rs. {it.price}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-slate-900">
                          Rs. {it.price * (it.quantity || 1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Combined Total Bill (Rs.)
                  </label>
                  <input
                    type="number"
                    value={billTotalAmount}
                    onChange={(e) => setBillTotalAmount(e.target.value)}
                    placeholder="e.g. 1500"
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Total Paid to Date (Rs.)
                  </label>
                  <div className="px-3.5 py-2.5 rounded-xl bg-slate-100/80 border border-slate-200 text-xs font-mono font-bold text-slate-800">
                    Rs. {(billPaymentRecords.reduce((acc, p) => acc + p.amount, 0) + (Number(billNewPaymentInput) || 0))}
                  </div>
                </div>
              </div>

              {/* Historical Payment Receipts & Time Log */}
              {billPaymentRecords.length > 0 && (
                <div className="border border-emerald-200/80 rounded-xl overflow-hidden text-xs bg-emerald-50/30">
                  <div className="bg-emerald-100/70 p-2 font-bold text-emerald-900 flex justify-between border-b border-emerald-200/60">
                    <span>Payment Receipts & Time Log ({billPaymentRecords.length})</span>
                    <span>Paid</span>
                  </div>
                  <div className="divide-y divide-emerald-100 max-h-36 overflow-y-auto">
                    {billPaymentRecords.map((p) => (
                      <div key={p.id} className="p-2 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleRemovePaymentRecord(p.id)}
                            className="text-slate-300 hover:text-rose-600 cursor-pointer"
                            title="Remove log entry"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <div>
                            <span className="font-bold text-slate-800 block text-[11px]">{p.dateTime}</span>
                            <span className="text-[10px] text-slate-500">{p.note || 'Payment Received'}</span>
                          </div>
                        </div>
                        <span className="font-mono font-black text-emerald-700 text-xs">
                          Rs. {p.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Record New Follow-up Payment with Date & Time */}
              <div className="p-3 bg-sky-50/50 border border-sky-200/70 rounded-2xl space-y-2.5">
                <span className="text-xs font-bold text-sky-900 flex items-center space-x-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                  <span>Record Payment (Time-Stamped Follow-Up):</span>
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Payment Date</label>
                    <input
                      type="date"
                      value={billNewPaymentDate}
                      onChange={(e) => setBillNewPaymentDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg liquid-glass-input text-xs font-medium focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Payment Time</label>
                    <input
                      type="text"
                      value={billNewPaymentTime}
                      onChange={(e) => setBillNewPaymentTime(e.target.value)}
                      placeholder="e.g. 11:30 AM"
                      className="w-full px-2.5 py-1.5 rounded-lg liquid-glass-input text-xs font-medium focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Amount Paid Now (Rs.)</label>
                    <input
                      type="number"
                      value={billNewPaymentInput}
                      onChange={(e) => setBillNewPaymentInput(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full px-2.5 py-1.5 rounded-lg liquid-glass-input text-xs font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Note / Payment Mode</label>
                    <input
                      type="text"
                      value={billNewPaymentNote}
                      onChange={(e) => setBillNewPaymentNote(e.target.value)}
                      placeholder="e.g. Cash, CT Scan advance"
                      className="w-full px-2.5 py-1.5 rounded-lg liquid-glass-input text-xs font-medium focus:outline-none"
                    />
                  </div>
                </div>
                {/* Quick Chips for Payment */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Math.max(0, (Number(billTotalAmount) || 0) - (billPaymentRecords.reduce((acc, p) => acc + p.amount, 0))) > 0 && (
                    <button
                      type="button"
                      onClick={() => setBillNewPaymentInput(String(Math.max(0, (Number(billTotalAmount) || 0) - (billPaymentRecords.reduce((acc, p) => acc + p.amount, 0)))))}
                      className="px-2 py-0.5 bg-sky-100 hover:bg-sky-200 text-sky-800 rounded-md text-[10px] font-bold border border-sky-300 cursor-pointer"
                    >
                      Clear Balance (Rs. {Math.max(0, (Number(billTotalAmount) || 0) - (billPaymentRecords.reduce((acc, p) => acc + p.amount, 0)))})
                    </button>
                  )}
                  {['500', '1000', '1500', '2000'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBillNewPaymentInput(preset)}
                      className="px-2 py-0.5 bg-white/90 hover:bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold border border-slate-200 cursor-pointer"
                    >
                      Rs. {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Balance Due Banner */}
              {billTotalAmount && (
                <div className="p-3 liquid-glass-subtle rounded-xl border border-white/75 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">Calculated Balance Due:</span>
                  <span className="font-black text-rose-700 font-mono text-sm">
                    Rs. {Math.max(0, (Number(billTotalAmount) || 0) - (billPaymentRecords.reduce((acc, p) => acc + p.amount, 0) + (Number(billNewPaymentInput) || 0)))}
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Doctor Clinical Remarks & Prescriptions
                </label>
                <textarea
                  value={billRemarks}
                  onChange={(e) => setBillRemarks(e.target.value)}
                  placeholder="Doctor's findings, prescriptions, and follow-up advice..."
                  rows={2}
                  className="w-full px-3.5 py-2 rounded-xl liquid-glass-input text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Compressed Image Attachment */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Attach Bill / Prescription Image (Auto-Compress to &le; 300 KB)
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleBillReceiptFileChange}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
                />
                {billReceiptCompressionInfo && (
                  <p className="text-[11px] text-brand-700 font-bold bg-brand-50/85 p-2 rounded-lg border border-brand-200">
                    ⚡ {billReceiptCompressionInfo}
                  </p>
                )}
              </div>

              {/* On-Demand Bill Generation & Thermal Print */}
              <div className="pt-2 flex items-center justify-between border-t border-white/60">
                <button
                  type="button"
                  onClick={() => setShowPrintableInvoice(!showPrintableInvoice)}
                  className="text-xs font-bold text-brand-700 hover:text-brand-900 flex items-center space-x-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{showPrintableInvoice ? 'Hide Invoice Preview' : 'Generate & Preview Invoice'}</span>
                </button>
              </div>

              {/* Printable Invoice View */}
              {showPrintableInvoice && (
                <div id="dactor-printable-invoice" className="p-4 bg-white rounded-2xl border-2 border-dashed border-slate-300 text-xs space-y-3 font-mono text-slate-900">
                  <div className="flex justify-between font-black text-slate-800 pb-2 border-b border-slate-300">
                    <div>
                      <span className="text-sm uppercase block font-black">{selectedClinic?.name}</span>
                      <span className="text-[10px] text-slate-500">{selectedClinic?.addressText}</span>
                      {selectedClinic?.panNumber && (
                        <span className="text-[10px] text-slate-500 block">PAN: {selectedClinic.panNumber}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">OFFICIAL BILL</span>
                      <span className="font-bold text-slate-700">{new Date().toISOString().split('T')[0]}</span>
                    </div>
                  </div>

                  <div className="flex justify-between text-slate-700 text-[11px]">
                    <span>Patient: <strong>{billTargetAppt.patientName}</strong> ({billTargetAppt.patientAge || '–'} Yrs, {billTargetAppt.patientGender || '–'})</span>
                    <span>Token: <strong>#{billTargetAppt.trackingCode10Digit}</strong></span>
                  </div>

                  {/* 1. Services & Procedures Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                    <div className="bg-slate-100 p-1.5 font-bold text-[10px] uppercase text-slate-700 border-b border-slate-200">
                      Services & Procedures
                    </div>
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="p-1.5">Description</th>
                          <th className="p-1.5 text-center">Qty</th>
                          <th className="p-1.5 text-right">Rate</th>
                          <th className="p-1.5 text-right">Amount (NPR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {billItems.length > 0 ? (
                          billItems.map((it) => (
                            <tr key={it.id}>
                              <td className="p-1.5 font-medium">{it.name}</td>
                              <td className="p-1.5 text-center font-mono">{it.quantity || 1}</td>
                              <td className="p-1.5 text-right font-mono">Rs. {it.price}</td>
                              <td className="p-1.5 text-right font-mono font-bold">Rs. {it.price * (it.quantity || 1)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="p-1.5">Consultation & Services</td>
                            <td className="p-1.5 text-center font-mono">1</td>
                            <td className="p-1.5 text-right font-mono">Rs. {billTotalAmount || 500}</td>
                            <td className="p-1.5 text-right font-mono font-bold">Rs. {billTotalAmount || 500}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* 2. Payment Receipts & Time Log Table */}
                  {(() => {
                    const allPayments = [...billPaymentRecords]
                    if (Number(billNewPaymentInput) > 0) {
                      allPayments.push({
                        id: 'new_entry',
                        amount: Number(billNewPaymentInput),
                        dateTime: `${billNewPaymentDate || new Date().toISOString().split('T')[0]} ${billNewPaymentTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                        note: billNewPaymentNote || 'Payment Received',
                      })
                    }
                    if (allPayments.length === 0) return null
                    return (
                      <div className="border border-emerald-200 rounded-lg overflow-hidden bg-white">
                        <div className="bg-emerald-50 p-1.5 font-bold text-[10px] uppercase text-emerald-900 border-b border-emerald-200">
                          Payment Receipts & Time Log
                        </div>
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-emerald-50/50 border-b border-emerald-100 text-emerald-800">
                            <tr>
                              <th className="p-1.5">Date & Time Log</th>
                              <th className="p-1.5">Note / Mode</th>
                              <th className="p-1.5 text-right">Paid (NPR)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-50">
                            {allPayments.map((p, idx) => (
                              <tr key={idx}>
                                <td className="p-1.5 font-mono">{p.dateTime}</td>
                                <td className="p-1.5 text-slate-600">{p.note || 'Payment Received'}</td>
                                <td className="p-1.5 text-right font-mono font-bold text-emerald-700">Rs. {p.amount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()}

                  {/* 3. Financial Summary */}
                  {(() => {
                    const allPayments = [...billPaymentRecords]
                    if (Number(billNewPaymentInput) > 0) {
                      allPayments.push({
                        id: 'new_entry',
                        amount: Number(billNewPaymentInput),
                        dateTime: '',
                      })
                    }
                    const totalP = allPayments.reduce((acc, p) => acc + p.amount, 0)
                    const totalB = Number(billTotalAmount) || billItems.reduce((acc, it) => acc + it.price * (it.quantity || 1), 0) || 500
                    const bal = Math.max(0, totalB - totalP)
                    return (
                      <div className="space-y-1 pt-1 border-t border-slate-300 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Total Bill Amount:</span>
                          <span className="font-bold">Rs. {totalB}</span>
                        </div>
                        <div className="flex justify-between font-bold text-emerald-700">
                          <span>Total Paid to Date:</span>
                          <span>Rs. {totalP}</span>
                        </div>
                        <div className="flex justify-between font-bold text-rose-700">
                          <span>Balance Due:</span>
                          <span>Rs. {bal}</span>
                        </div>
                        {billRemarks && (
                          <div className="text-[10px] text-slate-500 pt-1 border-t border-dashed border-slate-200">
                            <strong>Clinical Remarks / Rx:</strong> {billRemarks}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Official Invoice Slip</span>
                  </button>
                </div>
              )}

              <div className="flex items-center space-x-3 pt-2">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setBillModalOpen(false)}
                >
                  Cancel
                </GlassButton>
                <GlassButton
                  type="submit"
                  variant="primary"
                  size="md"
                  className="flex-1"
                  disabled={savingBill}
                >
                  {savingBill ? 'Saving & Recording...' : 'Push Bill to Patient'}
                </GlassButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SHIFT APPOINTMENT DATE / RESCHEDULE */}
      {/* ========================================================= */}
      {shiftModalOpen && shiftTargetAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-600">
                  Reschedule / Shift Appointment
                </span>
                <h3 className="text-lg font-black text-slate-900">
                  Shift Appointment Date
                </h3>
                <p className="text-xs text-slate-500">
                  Patient: <strong className="text-slate-900">{shiftTargetAppt.patientName}</strong> • #{shiftTargetAppt.trackingCode10Digit}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShiftModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 liquid-glass-subtle rounded-xl border border-white/75 text-xs space-y-1">
              <p className="text-slate-600">
                Current Scheduled Date: <strong className="text-slate-900">{shiftTargetAppt.appointmentDate}</strong>
              </p>
              <p className="text-slate-600">
                Current Time: <strong className="text-slate-900">{shiftTargetAppt.appointmentTime}</strong>
              </p>
            </div>

            <form onSubmit={handleShiftAppointmentSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  New Appointment Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={shiftNewDate}
                  onChange={(e) => setShiftNewDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  New Time Slot
                </label>
                <input
                  type="text"
                  value={shiftNewTime}
                  onChange={(e) => setShiftNewTime(e.target.value)}
                  placeholder="e.g. 10:00 AM"
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Reason for Rescheduling
                </label>
                <input
                  type="text"
                  value={shiftReason}
                  onChange={(e) => setShiftReason(e.target.value)}
                  placeholder="e.g. Patient requested, Doctor schedule adjusted"
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <p className="text-[11px] text-teal-800 bg-teal-50/85 p-2.5 rounded-xl border border-teal-200 font-medium leading-relaxed">
                🔔 The patient will automatically receive a real-time notification alert informing them that their appointment has been rescheduled.
              </p>

              <div className="flex items-center space-x-3 pt-2">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setShiftModalOpen(false)}
                >
                  Cancel
                </GlassButton>
                <button
                  type="submit"
                  disabled={shiftingAppointment}
                  className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs transition-colors shadow-md shadow-teal-600/20 cursor-pointer"
                >
                  {shiftingAppointment ? 'Shifting...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: DIRECT REGISTER PATIENT TO DIRECTORY */}
      {/* ========================================================= */}
      {registerPatientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-teal-500/15 text-teal-700 flex items-center justify-center font-bold">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Add Patient to Directory</h3>
                  <p className="text-[11px] text-slate-500">Register new patient profile for walk-in or records</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRegisterPatientModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDirectRegisterPatient} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  placeholder="e.g. Suman Shrestha"
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={newPatientPhone}
                  onChange={(e) => setNewPatientPhone(e.target.value)}
                  placeholder="e.g. 9841234567"
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Age</label>
                  <input
                    type="number"
                    value={newPatientAge}
                    onChange={(e) => setNewPatientAge(e.target.value)}
                    placeholder="35"
                    min="1"
                    max="120"
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Gender</label>
                  <select
                    value={newPatientGender}
                    onChange={(e) => setNewPatientGender(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Email (Optional)</label>
                <input
                  type="email"
                  value={newPatientEmail}
                  onChange={(e) => setNewPatientEmail(e.target.value)}
                  placeholder="patient@gmail.com"
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Notes / Complaint</label>
                <input
                  type="text"
                  value={newPatientNotes}
                  onChange={(e) => setNewPatientNotes(e.target.value)}
                  placeholder="e.g. Fever & cough for 2 days"
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setRegisterPatientModalOpen(false)}
                >
                  Cancel
                </GlassButton>
                <button
                  type="submit"
                  disabled={isRegisteringPatient}
                  className="flex-1 py-3 bg-gradient-to-r from-teal-600 to-brand-600 hover:from-teal-500 hover:to-brand-500 text-white font-bold rounded-xl text-xs transition-colors shadow-md shadow-teal-600/20 cursor-pointer"
                >
                  {isRegisteringPatient ? 'Registering...' : 'Register Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SCHEDULE NEXT FOLLOW-UP VISIT */}
      {/* ========================================================= */}
      {scheduleNextModalOpen && scheduleNextPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-700 flex items-center justify-center font-bold">
                  <CalendarPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Schedule Next Visit</h3>
                  <p className="text-[11px] text-slate-500">
                    Patient: <strong className="text-slate-900">{scheduleNextPatient.fullName}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScheduleNextModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleScheduleNextVisitSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Attending Doctor <span className="text-rose-500">*</span>
                </label>
                <select
                  value={scheduleNextDoctorId}
                  onChange={(e) => setScheduleNextDoctorId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  required
                >
                  {clinicDoctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName} ({d.specialty || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Visit Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={scheduleNextDate}
                    onChange={(e) => setScheduleNextDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Time Slot</label>
                  <input
                    type="text"
                    value={scheduleNextTime}
                    onChange={(e) => setScheduleNextTime(e.target.value)}
                    placeholder="10:00 AM"
                    className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Doctor Remarks / Instructions</label>
                <input
                  type="text"
                  value={scheduleNextRemarks}
                  onChange={(e) => setScheduleNextRemarks(e.target.value)}
                  placeholder="e.g. Follow-up after blood test results"
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="p-3 bg-teal-50/80 rounded-xl border border-teal-200 text-teal-800 text-xs">
                ✨ Follow-up consultation is scheduled at <strong>Rs. 0 (Free Visit)</strong> by default and will appear in the Future Appointments list.
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setScheduleNextModalOpen(false)}
                >
                  Cancel
                </GlassButton>
                <button
                  type="submit"
                  disabled={isSchedulingNextVisit}
                  className="flex-1 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold rounded-xl text-xs transition-colors shadow-md shadow-teal-600/20 cursor-pointer"
                >
                  {isSchedulingNextVisit ? 'Booking...' : 'Schedule Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PRINTABLE RECEPTION TOKEN SLIP */}
      {/* ========================================================= */}
      {showPrintTokenSlip && printSlipAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <h3 className="text-sm font-black text-slate-900">
                Reception Walk-In Token Slip
              </h3>
              <button
                type="button"
                onClick={() => setShowPrintTokenSlip(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thermal printable card container */}
            <div id="dactor-token-receipt" className="p-4 bg-white/85 border-2 border-dashed border-slate-300 rounded-2xl font-mono text-xs space-y-3 text-slate-800">
              <div className="text-center border-b border-slate-300 pb-2">
                <h2 className="text-base font-black uppercase text-slate-900">{selectedClinic?.name}</h2>
                <p className="text-[10px] text-slate-600">{selectedClinic?.addressText || 'Kathmandu, Nepal'}</p>
                <p className="text-[10px] text-slate-600">Tel: {selectedClinic?.contactPhone || '+9779800000000'}</p>
                <p className="text-[10px] text-brand-700 font-bold mt-1">DACTOR LIVE OPD TOKEN</p>
              </div>

              <div className="text-center py-2 bg-white rounded-xl border border-slate-200">
                <p className="text-[10px] uppercase font-bold text-slate-500">Universal 10-Digit Live Code</p>
                <p className="text-xl font-black tracking-widest text-brand-800 my-1">
                  {printSlipAppt.trackingCode10Digit}
                </p>
                <p className="text-[10px] text-slate-500">Live Status: dactor.health</p>
              </div>

              <div className="space-y-1 text-[11px] pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Patient:</span>
                  <span className="font-bold">{printSlipAppt.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Age / Gender:</span>
                  <span>{printSlipAppt.patientAge} Yrs / {printSlipAppt.patientGender}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Doctor:</span>
                  <span className="font-bold">{printSlipAppt.doctor?.fullName || selectedDoctor?.fullName || 'General OPD Doctor'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span>{printSlipAppt.appointmentDate} ({printSlipAppt.appointmentTime})</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
                  <span>{String(printSlipAppt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK' ? 'Total Payable (incl. 5%):' : 'Consultation Fee:'}</span>
                  <span>Rs. {getEffectiveAppointmentTotal(printSlipAppt) || 500}</span>
                </div>
              </div>

              <div className="text-center text-[9px] text-slate-500 border-t border-slate-300 pt-2 leading-relaxed">
                * Track your live token queue position in real time on any smartphone without downloading any app using your 10-digit code.
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <GlassButton
                type="button"
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => setShowPrintTokenSlip(false)}
              >
                Close
              </GlassButton>
              <GlassButton
                type="button"
                variant="primary"
                size="md"
                className="flex-1"
                leftIcon={<Printer className="w-3.5 h-3.5" />}
                onClick={() => window.print()}
              >
                Print Slip
              </GlassButton>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: LAB REPORT UPLOAD & MARK PREPARED */}
      {/* ========================================================= */}
      {labUploadModalOpen && targetLabAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-600">
                Step 3: Laboratory Completion
              </span>
              <h3 className="text-xl font-black text-slate-900 mt-1">
                Mark Prepared & Upload Report
              </h3>
              <p className="text-xs text-slate-500">
                Patient: <strong className="text-slate-900">{targetLabAppt.patientName}</strong> (Code #{targetLabAppt.trackingCode10Digit})
              </p>
            </div>

            <form onSubmit={handleUploadReportSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Upload PDF Report or Scan (Auto-Compress to &le; 300 KB)
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleLabReportFileChange}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer"
                />
                {reportCompressionInfo && (
                  <p className="text-[11px] text-teal-700 font-bold bg-teal-50/85 p-2 rounded-lg border border-teal-200 mt-1">
                    ⚡ {reportCompressionInfo}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Technician Notes / Pathologist Remarks
                </label>
                <textarea
                  rows={3}
                  value={technicianNotes}
                  onChange={(e) => setTechnicianNotes(e.target.value)}
                  placeholder="e.g. All parameters within normal biological reference ranges..."
                  className="w-full px-3.5 py-2 rounded-xl text-xs font-medium liquid-glass-input focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="p-3 bg-amber-50/85 rounded-xl border border-amber-200 text-[11px] text-amber-900">
                Patient will only be able to view and download this report after verifying their registered patient name for privacy.
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setLabUploadModalOpen(false)}
                >
                  Cancel
                </GlassButton>
                <button
                  type="submit"
                  disabled={uploadingReport}
                  className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs transition-colors shadow-md shadow-teal-600/20 cursor-pointer"
                >
                  {uploadingReport ? 'Uploading File...' : 'Mark Prepared & Notify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: DOCTOR / PRACTITIONER ONBOARDING */}
      {/* ========================================================= */}
      {showDoctorOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="text-xl font-black text-slate-900">
                Register Doctor / Medical Practitioner
              </h3>
              <p className="text-xs text-slate-500">
                Add a specialist or lab technician to {selectedClinic?.name} with starting practice year and consultation fee.
              </p>
            </div>

            <form onSubmit={handleCreateDoctor} className="space-y-4">
              {/* Role Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Practitioner Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDocRole('doctor')
                      if (docSpecialty === 'Pathology & Lab Medicine') setDocSpecialty('General Physician')
                    }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      docRole === 'doctor'
                        ? 'bg-brand-600 text-white border-brand-600 shadow-glass-sm'
                        : 'bg-white/65 text-slate-700 border-white/80 hover:bg-white/90'
                    }`}
                  >
                    👨‍⚕️ Medical Doctor
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDocRole('lab_technician')
                      setDocSpecialty('Pathology & Lab Medicine')
                    }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      docRole === 'lab_technician'
                        ? 'bg-teal-600 text-white border-teal-600 shadow-glass-sm'
                        : 'bg-white/65 text-slate-700 border-white/80 hover:bg-white/90'
                    }`}
                  >
                    🧪 Lab Technician
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => {
                    setDocName(e.target.value)
                    if (onboardingErrors.name) setOnboardingErrors({ ...onboardingErrors, name: '' })
                  }}
                  placeholder="e.g. Dr. Sushil Karki"
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold border ${
                    onboardingErrors.name ? 'border-rose-500 bg-rose-50/50' : 'liquid-glass-input'
                  } focus:outline-none focus:ring-2 focus:ring-brand-500`}
                />
                {onboardingErrors.name && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">{onboardingErrors.name}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Specialty</label>
                  <select
                    value={docSpecialty}
                    onChange={(e) => setDocSpecialty(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="General Physician">General Physician</option>
                    <option value="Cardiology">Cardiology</option>
                    <option value="Pathology & Lab Medicine">Pathology & Lab Medicine</option>
                    <option value="Pediatrics">Pediatrics</option>
                    <option value="Orthopedics">Orthopedics</option>
                    <option value="Dermatology">Dermatology</option>
                    <option value="Gynecology">Gynecology</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Qualifications</label>
                  <input
                    type="text"
                    value={docEducation}
                    onChange={(e) => setDocEducation(e.target.value)}
                    placeholder="MBBS, MD"
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    NMC / Council License <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={docLicense}
                    onChange={(e) => {
                      setDocLicense(e.target.value)
                      if (onboardingErrors.license) setOnboardingErrors({ ...onboardingErrors, license: '' })
                    }}
                    placeholder="e.g. 14250"
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  {onboardingErrors.license && (
                    <p className="text-[11px] text-rose-600 font-bold mt-1">{onboardingErrors.license}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Start Year of Practice
                  </label>
                  <select
                    value={docStartingYear}
                    onChange={(e) => setDocStartingYear(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {practicingYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr} ({2026 - yr} Yrs Experience)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Contact Mobile <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={docMobile}
                    onChange={(e) => {
                      setDocMobile(e.target.value)
                      if (onboardingErrors.mobile) setOnboardingErrors({ ...onboardingErrors, mobile: '' })
                    }}
                    placeholder="98XXXXXXXX"
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  {onboardingErrors.mobile && (
                    <p className="text-[11px] text-rose-600 font-bold mt-1">{onboardingErrors.mobile}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Fee (Rs.)</label>
                  <input
                    type="number"
                    value={docFee}
                    onChange={(e) => setDocFee(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold liquid-glass-input focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-3">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setShowDoctorOnboarding(false)}
                >
                  Cancel
                </GlassButton>
                <GlassButton
                  type="submit"
                  variant="primary"
                  size="md"
                  className="flex-1"
                >
                  Register Practitioner
                </GlassButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: DOCTOR PHOTO UPLOAD / UPDATE                       */}
      {/* ========================================================= */}
      {doctorPhotoModalOpen && doctorPhotoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
                  Practitioner Profile
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Update Photo for {doctorPhotoTarget.fullName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDoctorPhotoModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Photo Preview */}
            <div className="flex flex-col items-center justify-center space-y-3 py-2">
              <div className="w-28 h-28 rounded-3xl bg-brand-50/80 border-2 border-brand-200 overflow-hidden flex items-center justify-center shadow-inner relative">
                {doctorPhotoPreview ? (
                  <img
                    src={doctorPhotoPreview}
                    alt={doctorPhotoTarget.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-4xl font-black text-brand-700">
                    {doctorPhotoTarget.fullName.charAt(0)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {doctorPhotoTarget.specialty || 'General Practitioner'} • NMC: {doctorPhotoTarget.nmcLicenseNumber || '–'}
              </p>
            </div>

            {doctorPhotoMsg && (
              <div className="p-3 bg-brand-50/85 border border-brand-200 rounded-xl text-brand-800 text-xs font-bold text-center">
                {doctorPhotoMsg}
              </div>
            )}

            {/* File Input */}
            <div className="space-y-3">
              <label className="flex items-center justify-center space-x-2 w-full py-3 px-4 border border-white/80 hover:border-brand-400 rounded-xl liquid-glass-subtle hover:bg-brand-50/80 transition cursor-pointer text-xs font-bold text-slate-700">
                <Camera className="w-4 h-4 text-brand-600" />
                <span>{doctorPhotoFile ? doctorPhotoFile.name : 'Choose Image File (JPG, PNG, WEBP)'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleDoctorPhotoFileChange}
                  className="hidden"
                />
              </label>

              <div className="flex items-center gap-2 pt-2">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  className="w-1/2"
                  onClick={() => setDoctorPhotoModalOpen(false)}
                >
                  Cancel
                </GlassButton>
                <GlassButton
                  type="button"
                  variant="primary"
                  size="md"
                  className="w-1/2"
                  disabled={uploadingDoctorPhoto || !doctorPhotoFile}
                  onClick={handleSaveDoctorPhoto}
                >
                  {uploadingDoctorPhoto ? 'Uploading...' : 'Save & Publish Photo'}
                </GlassButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: PORTAL SUBSCRIPTION & ACTIVATION RENEWAL         */}
      {/* ========================================================= */}
      {showRenewalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
                  Dactor Portal License
                </span>
                <h3 className="text-lg font-black text-slate-900">
                  Manage & Renew Clinic Subscription
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedClinic?.name} • Status: {!isSubscriptionActive ? 'Expired / Renewal Due' : `${subscriptionDaysLeft} Days Remaining`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRenewalModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestRenewalSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRenewalPlan('1_month')}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                    renewalPlan === '1_month'
                      ? 'bg-brand-50/85 border-brand-500 ring-2 ring-brand-500/20 shadow-glass-sm'
                      : 'bg-white/65 border-white/80 hover:bg-white/90'
                  }`}
                >
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600 block">
                    Monthly License
                  </span>
                  <span className="text-lg font-black text-slate-900 block mt-0.5">
                    Rs. 1,500
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    30 Days Full OPD & Lab Portal
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRenewalPlan('12_months')}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer relative ${
                    renewalPlan === '12_months'
                      ? 'bg-brand-50/85 border-brand-500 ring-2 ring-brand-500/20 shadow-glass-sm'
                      : 'bg-white/65 border-white/80 hover:bg-white/90'
                  }`}
                >
                  <span className="px-2 py-0.5 bg-emerald-600 text-white text-[9px] font-black rounded-md uppercase absolute top-2.5 right-2.5">
                    Save 17%
                  </span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600 block">
                    Annual License
                  </span>
                  <span className="text-lg font-black text-slate-900 block mt-0.5">
                    Rs. 15,000
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    365 Days Full OPD & Lab Portal
                  </span>
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  eSewa / Khalti / Bank Transaction Reference ID
                </label>
                <input
                  type="text"
                  value={renewalTxnRef}
                  onChange={(e) => setRenewalTxnRef(e.target.value)}
                  placeholder="e.g. ESW-984120394 or Bank Voucher #"
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={submittingRenewal}
                  onClick={handleInstantBypassSubscription}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  ⚡ Instant Activation (Testing Bypass)
                </button>
                <GlassButton
                  type="submit"
                  variant="primary"
                  size="md"
                  className="flex-1"
                  disabled={submittingRenewal}
                >
                  {submittingRenewal ? 'Submitting...' : 'Submit Payment Renewal'}
                </GlassButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: CLINIC NOTIFICATIONS DRAWER                      */}
      {/* ========================================================= */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div className="flex items-center space-x-2">
                <Bell className="w-5 h-5 text-brand-600" />
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Clinic Notifications & Activity Log
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Recent alerts, bookings, and broadcasts for {selectedClinic?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {clinicNotifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-medium">
                  No recent notifications found for this clinic.
                </div>
              ) : (
                clinicNotifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-3.5 rounded-2xl liquid-glass-subtle border border-white/75 space-y-1 shadow-glass-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900">{n.title}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-white/60 flex justify-end">
              <GlassButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowNotificationsModal(false)}
              >
                Close Drawer
              </GlassButton>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: CLINICAL REMARK / RECEPTION NOTES EDITOR         */}
      {/* ========================================================= */}
      {remarkModalOpen && remarkTargetAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
                  Reception / Clinical Notes
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Add / Edit Remark for {remarkTargetAppt.patientName}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Token #{remarkTargetAppt.trackingCode10Digit}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRemarkModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClinicalRemark} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Clinical Remark / Symptoms / Reception Note
                </label>
                <textarea
                  rows={4}
                  value={remarkText}
                  onChange={(e) => setRemarkText(e.target.value)}
                  placeholder="Enter patient vitals, chief complaint, follow-up instructions, or reception notes..."
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setRemarkModalOpen(false)}
                >
                  Cancel
                </GlassButton>
                <GlassButton
                  type="submit"
                  variant="primary"
                  size="md"
                  className="flex-1"
                  disabled={savingRemark}
                >
                  {savingRemark ? 'Saving...' : 'Save Remark'}
                </GlassButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: EDIT SLOT MAX CAPACITY                           */}
      {/* ========================================================= */}
      {editingSlotCapacity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
                  Slot Capacity Control
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Update Max Patients for Slot
                </h3>
                <p className="text-[11px] text-slate-500">
                  {editingSlotCapacity.startTime} - {editingSlotCapacity.endTime} ({editingSlotCapacity.slotDate})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSlotCapacity(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSlotCapacityUpdate} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Maximum Patient Bookings Allowed
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={newSlotCapacityVal}
                  onChange={(e) => setNewSlotCapacityVal(Number(e.target.value) || 1)}
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-sm font-black focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              <div className="flex items-center space-x-2">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setEditingSlotCapacity(null)}
                >
                  Cancel
                </GlassButton>
                <GlassButton
                  type="submit"
                  variant="primary"
                  size="md"
                  className="flex-1"
                >
                  Update Capacity
                </GlassButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 5: VIEW DOCTOR PROFILE (FROM INVITATIONS DIRECTORY) */}
      {/* ========================================================= */}
      {viewingDoctorProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 space-y-4 shadow-glass-modal border border-white/80">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div className="flex items-center space-x-3.5">
                <div className="w-14 h-14 min-w-[3.5rem] min-h-[3.5rem] max-w-[3.5rem] max-h-[3.5rem] rounded-2xl bg-gradient-to-br from-brand-50 to-sky-100 border-2 border-brand-200 overflow-hidden flex items-center justify-center font-black text-brand-700 text-lg shadow-xs shrink-0">
                  {viewingDoctorProfile.profilePictureUrl ? (
                    <img
                      src={viewingDoctorProfile.profilePictureUrl}
                      alt={viewingDoctorProfile.fullName}
                      className="w-full h-full object-cover object-center"
                      onError={(e) => {
                        ;(e.target as HTMLElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    viewingDoctorProfile.fullName.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {viewingDoctorProfile.fullName}
                  </h3>
                  <p className="text-xs font-bold text-brand-600 flex items-center gap-1">
                    <Stethoscope className="w-3.5 h-3.5 text-brand-500" />
                    <span>{viewingDoctorProfile.specialty || 'General Practitioner'}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium">
                    NMC Reg: #{viewingDoctorProfile.nmcLicenseNumber || 'Verified'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingDoctorProfile(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs liquid-glass-subtle p-4 rounded-2xl border border-white/75 bg-white/50">
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Practitioner Role:</span>
                <span className="font-bold text-slate-900 capitalize">
                  {viewingDoctorProfile.practitionerRole === 'lab_technician' || viewingDoctorProfile.isLabTechnician
                    ? 'Lab Technician'
                    : 'Medical Doctor'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Nepal Medical Council (NMC):</span>
                <span className="font-bold text-brand-700">
                  #{viewingDoctorProfile.nmcLicenseNumber || 'Verified'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Qualifications / Degrees:</span>
                <span className="font-bold text-slate-900">{viewingDoctorProfile.education || 'MBBS, MD'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Clinical Experience:</span>
                <span className="font-bold text-slate-900">
                  {viewingDoctorProfile.startingPracticingYear
                    ? `${Math.max(1, 2026 - viewingDoctorProfile.startingPracticingYear)}+ Years (Since ${viewingDoctorProfile.startingPracticingYear})`
                    : `${viewingDoctorProfile.experienceYears || 5}+ Years`}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Standard OPD Consultation Fee:</span>
                <span className="font-bold text-brand-700">Rs. {viewingDoctorProfile.consultationFee || 500}</span>
              </div>
              {viewingDoctorProfile.email && (
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Registered Account Email:</span>
                  <span className="font-semibold text-slate-700">{viewingDoctorProfile.email}</span>
                </div>
              )}
              {viewingDoctorProfile.publicMobileNumber && (
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Public Contact Number:</span>
                  <span className="font-bold text-slate-900">{viewingDoctorProfile.publicMobileNumber}</span>
                </div>
              )}
              {viewingDoctorProfile.description && (
                <div className="pt-2 mt-1">
                  <span className="text-slate-500 font-medium block mb-1">Bio / Clinical Summary:</span>
                  <p className="text-slate-700 leading-relaxed bg-white/70 p-2.5 rounded-xl border border-slate-200/60 text-[11px]">
                    {viewingDoctorProfile.description}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <GlassButton
                type="button"
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => setViewingDoctorProfile(null)}
              >
                Close
              </GlassButton>
              {clinicDoctors.some((cd) => cd.id === viewingDoctorProfile.id) ||
              clinicInvitations.some(
                (inv) =>
                  (inv.invitedEmail || inv.email || '').toLowerCase() ===
                    (viewingDoctorProfile.email || '').toLowerCase() && inv.status === 'accepted'
              ) ? (
                <span className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Already Affiliated
                </span>
              ) : clinicInvitations.some(
                  (inv) =>
                    (inv.invitedEmail || inv.email || '').toLowerCase() ===
                      (viewingDoctorProfile.email || '').toLowerCase() && inv.status === 'pending'
                ) ? (
                <span className="flex-1 py-2.5 px-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs">
                  <Clock className="w-4 h-4 text-amber-600" /> Invitation Pending
                </span>
              ) : (
                <GlassButton
                  type="button"
                  variant="primary"
                  size="md"
                  className="flex-1"
                  onClick={() => {
                    handleSendDoctorInvitation(viewingDoctorProfile)
                    setViewingDoctorProfile(null)
                  }}
                >
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Send Clinic Invitation
                </GlassButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 6: LAB REPORT PRIVACY VERIFICATION GATE             */}
      {/* ========================================================= */}
      {labVerifyTargetReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600">
                  Patient Privacy Security Gate
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Verify Identity to View Report
                </h3>
                <p className="text-[11px] text-slate-500">
                  Report: {labVerifyTargetReport.report.testName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLabVerifyTargetReport(null)
                  setLabVerifyInput('')
                  setLabVerifyError(null)
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleVerifyAndOpenLabReport} className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                For patient confidentiality, please enter the patient&apos;s <strong>Full Name</strong> or <strong>Registered Mobile Number</strong> to unlock and open this diagnostic report.
              </p>

              <div>
                <input
                  type="text"
                  value={labVerifyInput}
                  onChange={(e) => {
                    setLabVerifyInput(e.target.value)
                    setLabVerifyError(null)
                  }}
                  placeholder={`e.g. ${labVerifyTargetReport.appt.patientName}`}
                  className="w-full px-3.5 py-2.5 rounded-xl liquid-glass-input text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                />
                {labVerifyError && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">{labVerifyError}</p>
                )}
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => {
                    setLabVerifyTargetReport(null)
                    setLabVerifyInput('')
                    setLabVerifyError(null)
                  }}
                >
                  Cancel
                </GlassButton>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
                >
                  Verify & Open Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 7: CLINIC REGULATORY TERMS & DATA COMPLIANCE        */}
      {/* ========================================================= */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
                  Healthcare Governance
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Dactor Clinic Terms, Privacy & Regulatory Compliance
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 text-xs text-slate-600 leading-relaxed pr-1">
              <p>
                <strong>1. Nepal Medical Council (NMC) & MoHP Compliance:</strong> All doctors and laboratory personnel registered under this clinic must hold valid, active licenses from the Nepal Medical Council (NMC) or Nepal Health Professional Council (NHPC).
              </p>
              <p>
                <strong>2. Patient Data Confidentiality:</strong> Patient medical records, diagnostic pathology reports, and contact details are strictly confidential and protected under Nepal&apos;s Individual Privacy Act. Laboratory reports require patient name/mobile verification before viewing.
              </p>
              <p>
                <strong>3. Transparent Billing & PAN Disclosure:</strong> Clinics issuing digital invoices or accepting direct eSewa/Khalti/Fonepay settlements are responsible for accurate tax and PAN reporting.
              </p>
              <p>
                <strong>4. 30-Day Reversible Account Archive Policy:</strong> When a clinic schedules account deletion, all public listings are hidden immediately, while historical patient records remain safely archived for 30 days in case the clinic administrator chooses to restore the account.
              </p>
            </div>

            <div className="pt-2 border-t border-white/60 flex flex-col sm:flex-row items-center justify-between gap-3">
              <a
                href="./privacy-clinic.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 font-bold hover:underline text-xs flex items-center gap-1 cursor-pointer"
              >
                <span>Read Official Clinic &amp; Provider Privacy Policy &rarr;</span>
              </a>
              <GlassButton
                type="button"
                variant="primary"
                size="md"
                onClick={() => setShowTermsModal(false)}
              >
                I Understand & Acknowledge
              </GlassButton>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 8: 30-DAY REVERSIBLE CLINIC ACCOUNT DELETION        */}
      {/* ========================================================= */}
      {showDeleteArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-6 border-rose-200/80 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/60">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
                  30-Day Reversible Archive
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Schedule Clinic Account Deletion?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteArchiveModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-rose-50/85 border border-rose-200 rounded-2xl text-xs text-rose-900 space-y-1.5 leading-relaxed">
              <p className="font-bold">What happens when you schedule deletion:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Your clinic will enter a <strong>30-day archive grace period</strong>.</li>
                <li>You can reactivate or reclaim your clinic account with 1 click at any time during the next 30 days.</li>
                <li>After 30 days, the clinic profile will be permanently deactivated.</li>
              </ul>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <GlassButton
                type="button"
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => setShowDeleteArchiveModal(false)}
              >
                Keep Account Active
              </GlassButton>
              <GlassButton
                type="button"
                variant="destructive"
                size="md"
                className="flex-1"
                onClick={handleScheduleClinicArchive}
              >
                Schedule 30-Day Archive
              </GlassButton>
            </div>

            <div className="pt-2 border-t border-white/60 space-y-2">
              <button
                type="button"
                disabled={isDeletingPermanently}
                onClick={handlePermanentDeleteClinic}
                className="w-full py-2 bg-red-50/85 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                <span>{isDeletingPermanently ? 'Purging Clinic...' : 'Admin: Permanent Purge (Immediate)'}</span>
              </button>
              <div className="text-center pt-1">
                <a
                  href="./data-deletion.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-rose-600 hover:underline"
                >
                  <span>Statutory Web Deletion Portal URL</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 9: RESTORE CLINIC BACKUP & DISASTER RECOVERY        */}
      {/* ========================================================= */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/60 dark:border-white/10">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-600">
                  Disaster Recovery
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Restore Clinic Backup
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-white/80 dark:hover:bg-slate-800 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-900 dark:text-amber-200 text-xs space-y-1">
              <div className="font-bold flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Important Safety Notice</span>
              </div>
              <p>
                Restoring a backup will verify cryptographic SHA-256 integrity and re-hydrate clinic records (doctors, appointments, queue, invoices) into your browser&apos;s local offline database.
              </p>
            </div>

            {restoreResult && (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 rounded-2xl text-xs text-emerald-800 dark:text-emerald-300 space-y-2">
                <div className="font-bold flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Backup Restored Successfully!</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px] font-medium pt-1">
                  {Object.entries(restoreResult.restoredStores).map(([store, count]) => (
                    <div key={store} className="capitalize">
                      {store.replace(/_/g, ' ')}: <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {restoreError && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-700 rounded-2xl text-xs text-rose-800 dark:text-rose-300">
                {restoreError}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Select Backup JSON Snapshot File
              </label>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreFileSelected}
                disabled={isRestoringBackup}
                className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer border border-slate-200 dark:border-white/10 rounded-xl p-2 bg-white/50 dark:bg-slate-900/50"
              />
              {isRestoringBackup && (
                <div className="flex items-center space-x-2 text-xs text-sky-600 font-bold animate-pulse pt-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Validating SHA-256 seal and restoring clinic stores...</span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
