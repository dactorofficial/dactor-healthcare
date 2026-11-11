import React, { useState, useEffect, useMemo } from 'react'
import {
  Activity,
  Search,
  Sparkles,
  Clock,
  CheckCircle2,
  Building2,
  Stethoscope,
  Users,
  AlertCircle,
  RefreshCw,
  BellRing,
  ArrowRight,
  ShieldCheck,
  User,
  FlaskConical,
  Copy,
  Phone,
  MapPin,
  ExternalLink,
  Lock,
  Eye,
  Download,
  Calendar,
  X,
  FileText,
  PauseCircle,
  Coffee,
  Check,
  Hourglass,
  Receipt,
  ArrowLeft,
} from 'lucide-react'
import {
  Appointment,
  Clinic,
  Doctor,
  LabReport,
  BillingInvoice,
  MultiSlotPositionResult,
} from '../types'
import {
  getAppointmentByTrackingCode,
  getAppointmentByTrackingCodeOrContact,
  getAppointmentsByClinic,
  getClinicById,
  isDiagnosticLabClinic,
  getDoctorById,
  getLabReportsByTrackingCode,
  shiftAppointmentDate,
  cancelAppointment,
  retryPayAtDeskAppointment,
  calculateMultiSlotDailyPosition,
  getLinkedConsultations,
  LinkedConsultationsResult,
  requestGuestLabReportUrl,
  resolveStorageUrl,
  resolveClinicLogoUrl,
  resolveClinicCoverUrl,
  resolveDoctorPhotoUrl,
} from '../services/db'
import { printAppointmentBill, printPrescription } from '../utils/medicalDocPrinter'
import { supabase } from '../lib/supabase'
import { playChimeSound } from '../utils/audioChime'
import { updatePageSEO } from '../utils/seo'

interface LiveQueueProps {
  initialCode?: string
  onOpenReportModal?: (code: string) => void
  onNavigateHome?: () => void
  onNavigate?: (tab: string, params?: any) => void
}

export const LiveQueue: React.FC<LiveQueueProps> = ({
  initialCode = '',
  onOpenReportModal,
  onNavigateHome,
  onNavigate,
}) => {
  const [inputCode, setInputCode] = useState(initialCode)
  const [activeCode, setActiveCode] = useState(initialCode)

  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [clinicQueue, setClinicQueue] = useState<Appointment[]>([])
  const [labReports, setLabReports] = useState<LabReport[]>([])
  const [publicQueueStatus, setPublicQueueStatus] = useState<any | null>(null)
  const [multiSlotResult, setMultiSlotResult] = useState<MultiSlotPositionResult | null>(null)
  const [linkedConsultations, setLinkedConsultations] = useState<LinkedConsultationsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [copyFeedback, setCopyFeedback] = useState(false)

  // Real-time Visual Notification Alert Banner State
  const [activeAlert, setActiveAlert] = useState<{
    id: string
    title: string
    message: string
  } | null>(null)

  // Live Consultation Timer
  const [currentEpochSecond, setCurrentEpochSecond] = useState<number>(() =>
    Math.floor(Date.now() / 1000)
  )

  // Security Verification State (Name or Mobile Number check for confidential file/report access & rescheduling)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isReportIdentityVerified, setIsReportIdentityVerified] = useState(false)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [pendingVerificationAction, setPendingVerificationAction] = useState<
    'view_report' | 'download_report' | 'reschedule' | 'cancel'
  >('view_report')
  const [verifyMethod, setVerifyMethod] = useState<'name' | 'phone'>('phone')
  const [verificationInput, setVerificationInput] = useState('')
  const [verifyError, setVerifyError] = useState('')

  // Report Viewing Modal
  const [showReportModal, setShowReportModal] = useState(false)
  const [selectedReportToView, setSelectedReportToView] = useState<LabReport | null>(null)

  // Prescription & Bill Modal
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false)
  const [selectedPrescriptionApptId, setSelectedPrescriptionApptId] = useState<string | null>(null)

  // Reschedule Modal
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [rescheduleProcessing, setRescheduleProcessing] = useState(false)
  const [rescheduleMsg, setRescheduleMsg] = useState('')

  // Pay at Desk state
  const [retryingPayAtDesk, setRetryingPayAtDesk] = useState(false)
  const [payAtDeskError, setPayAtDeskError] = useState<string | null>(null)

  // 1-second interval ticker for live in-cabin consultation elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentEpochSecond(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Public tracking codes return only operational queue status. Private
  // appointment details require a verified signed-in patient session.
  const fetchQueueData = async (targetCode: string, silent = false) => {
    const clean = targetCode.trim()
    if (!clean) return
    if (!silent) setLoading(true)
    setErrorMsg('')

    try {
      if (!/^\d{10}$/.test(clean)) {
        setAppointment(null)
        setPublicQueueStatus(null)
        setLabReports([])
        if (!silent) setErrorMsg('Enter the 10-digit tracking code to view queue status.')
        return
      }

      const appt = await getAppointmentByTrackingCodeOrContact(clean)
      if (!appt) {
        const { data: publicRows, error: publicError } = await supabase.rpc('get_public_queue_status', {
          p_tracking_code: clean,
        })
        const status = !publicError && Array.isArray(publicRows) ? publicRows[0] : null
        setAppointment(null)
        setLinkedConsultations(null)
        setClinicQueue([])
        setLabReports([])
        setMultiSlotResult(null)
        setPublicQueueStatus(status || null)
        if (status?.clinic_id) {
          setClinic(await getClinicById(status.clinic_id))
          setDoctor(status.doctor_id ? await getDoctorById(status.doctor_id) : null)
        } else {
          setClinic(null)
          setDoctor(null)
          if (!silent) setErrorMsg('No booking record found. Check the code and try again.')
        }
        return
      }

      const linked = await getLinkedConsultations(clean)
      const effectiveAppt = appt || linked?.targetAppointment || null
      setAppointment(effectiveAppt)
      setLinkedConsultations(linked)
      setPublicQueueStatus(null)

      if (effectiveAppt) {
        const appt = effectiveAppt
        const effectiveCode = appt.trackingCode10Digit || clean
        // Fetch clinic details
        if (appt.clinicId) {
          const [clinicData, queueList, reportsData] = await Promise.all([
            getClinicById(appt.clinicId),
            getAppointmentsByClinic(appt.clinicId, appt.appointmentDate),
            getLabReportsByTrackingCode(effectiveCode),
          ])
          setClinic(clinicData)
          setClinicQueue(queueList)
          setLabReports(reportsData)

          const avgMins = clinicData?.avgConsultationTimeMinutes || 10
          try {
            const multiSlot = await calculateMultiSlotDailyPosition(
              appt.clinicId,
              appt.doctorId,
              appt.appointmentDate,
              appt.id,
              appt.slotId,
              appt.appointmentTime,
              avgMins
            )
            setMultiSlotResult(multiSlot)
          } catch (e) {
            console.error('Error calculating multi-slot position:', e)
            setMultiSlotResult(null)
          }

          // Fetch attending doctor if linked
          if (appt.doctorId) {
            const doc = await getDoctorById(appt.doctorId)
            setDoctor(doc)
          } else if (clinicData && clinicData.type === 'single_doctor') {
            // If single doctor clinic, doctor can be inferred from clinic roster
          }
        }
      } else {
        setMultiSlotResult(null)
        if (!silent) setErrorMsg(`No booking record found for '${clean}'.`)
      }
    } catch {
      if (!silent) setErrorMsg('Failed to update live queue status. Please try again.')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Load when activeCode changes
  useEffect(() => {
    if (activeCode) {
      fetchQueueData(activeCode)
    }
  }, [activeCode])

  useEffect(() => {
    const queueNum = appointment?.queueNumber || publicQueueStatus?.token_number || ''
    const clinicName = clinic?.name || publicQueueStatus?.clinic_name || 'Clinic'
    const titleText = isUnlocked && appointment?.patientName
      ? `Live OPD Queue #${queueNum} • ${appointment.patientName} | Dactor`
      : queueNum
      ? `Live OPD Queue #${queueNum} • ${clinicName} | Dactor`
      : 'Real-Time Live OPD Queue Tracker Nepal | Dactor'

    updatePageSEO({
      title: titleText,
      description: 'Track live doctor consultation token numbers, doctor cabin status, estimated wait times, and delays in real-time at clinics across Nepal with your 10-digit Dactor code.',
    })
  }, [appointment, publicQueueStatus, clinic, isUnlocked])

  // Live auto-refresh every 4 seconds (matching Android QueueStatusScreen.kt)
  useEffect(() => {
    if (!activeCode) return
    const interval = setInterval(() => {
      fetchQueueData(activeCode, true)
    }, 4000)
    return () => clearInterval(interval)
  }, [activeCode])

  // Active Supabase Realtime WebSocket subscription for instant alerts & queue changes
  useEffect(() => {
    // Do not subscribe to private notification/appointment streams for a
    // public tracking code. The public queue RPC is polled separately.
    if (!appointment) return

    const apptId = appointment?.id
    const trackingCode = appointment?.trackingCode10Digit || activeCode
    const channelTopic = `live_queue_channel_${trackingCode || apptId || 'guest'}`

    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload) => {
          const newNotif = (payload.new || payload.old) as any
          if (!newNotif) return

          const msg = newNotif.message || ''
          const title = newNotif.title || ''
          const targetAudience = newNotif.target_audience
          const notifType = newNotif.type

          const matchesTracking = Boolean(
            trackingCode && (
              newNotif.appointment_id === trackingCode ||
              msg.includes(trackingCode) ||
              title.includes(trackingCode)
            )
          )
          const matchesAppt = Boolean(
            apptId && (
              newNotif.appointment_id === apptId ||
              msg.includes(apptId)
            )
          )
          const matchesUser = Boolean(
            appointment?.userId && newNotif.user_id === appointment.userId
          )
          const isBroadcast = targetAudience === 'all_users' || notifType === 'clinic_broadcast'

          if (matchesTracking || matchesAppt || matchesUser || isBroadcast) {
            playChimeSound()
            const cleanMsg = msg.replace(/\[\[META:.*?\]\]/g, '').trim()
            setActiveAlert({
              id: newNotif.id || String(Date.now()),
              title: title || 'Queue Alert',
              message: cleanMsg,
            })
            if (activeCode) {
              fetchQueueData(activeCode, true)
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => {
          const appt = payload.new as any
          if (appt && (appt.id === apptId || appt.tracking_code_10_digit === trackingCode)) {
            if (activeCode) {
              fetchQueueData(activeCode, true)
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries' },
        () => {
          if (activeCode) {
            fetchQueueData(activeCode, true)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeCode, appointment?.id, appointment?.trackingCode10Digit, appointment?.userId])

  // Auto-dismiss visual alert banner after 12 seconds
  useEffect(() => {
    if (!activeAlert) return
    const timer = setTimeout(() => {
      setActiveAlert(null)
    }, 12000)
    return () => clearTimeout(timer)
  }, [activeAlert])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = inputCode.trim()
    if (!/^\d{10}$/.test(clean)) {
      setErrorMsg('Please enter a valid 10-digit tracking code.')
      return
    }
    setActiveCode(clean)
  }

  const handleCopyCode = () => {
    if (!appointment?.trackingCode10Digit) return
    navigator.clipboard.writeText(appointment.trackingCode10Digit)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }

  // Calculations for live queue status: scoped strictly to this appointment's doctor
  const waitingPatients = useMemo(
    () => clinicQueue.filter((a) => {
      const matchDoc = appointment?.doctorId ? a.doctorId === appointment.doctorId : !a.doctorId
      const st = (a.status || '').toUpperCase()
      return (
        matchDoc &&
        a.checkinStatus === 'waiting' &&
        st === 'APPROVED' &&
        a.status !== 'WAITING_FOR_APPROVAL' &&
        a.status !== 'pending_payment' &&
        a.status !== 'UNAPPROVED' &&
        a.status !== 'EXPIRED'
      )
    }),
    [clinicQueue, appointment?.doctorId]
  )
  const inConsultationPatient = useMemo(
    () => clinicQueue.find((a) => {
      const matchDoc = appointment?.doctorId ? a.doctorId === appointment.doctorId : !a.doctorId
      return matchDoc && a.checkinStatus === 'in_consultation'
    }),
    [clinicQueue, appointment?.doctorId]
  )

  // Check if the appointment is tomorrow or a future date
  const isFutureOrTomorrow = useMemo(() => {
    if (multiSlotResult) {
      return multiSlotResult.isTomorrow || multiSlotResult.isFutureDate
    }
    if (!appointment?.appointmentDate) return false
    const apptDate = appointment.appointmentDate.trim().slice(0, 10)
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return apptDate > todayStr
  }, [multiSlotResult, appointment?.appointmentDate])

  const dateLabel = useMemo(() => {
    if (multiSlotResult?.dateLabel) return multiSlotResult.dateLabel
    if (!appointment?.appointmentDate) return 'visit'
    const apptDate = appointment.appointmentDate.trim().slice(0, 10)
    const now = new Date()
    const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const tomStr = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`
    if (apptDate === tomStr) return 'Tomorrow'
    try {
      const parts = apptDate.split('-')
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10)
        const m = parseInt(parts[1], 10) - 1
        const d = parseInt(parts[2], 10)
        const dt = new Date(y, m, d)
        return `${d} ${dt.toLocaleDateString('en-US', { month: 'short' })}`
      }
    } catch {}
    return apptDate
  }, [multiSlotResult?.dateLabel, appointment?.appointmentDate])

  const slotStartTimeStr = useMemo(() => {
    if (multiSlotResult?.slotStartTimeText) return multiSlotResult.slotStartTimeText
    if (!appointment?.appointmentTime) return '09:00 AM'
    const token = appointment.appointmentTime.split(/[-–]|to/)[0]?.trim()
    return token || '09:00 AM'
  }, [multiSlotResult?.slotStartTimeText, appointment?.appointmentTime])

  let patientsAhead = 0
  let displayTokenNumber = appointment?.queueNumber || 1

  if (isFutureOrTomorrow) {
    patientsAhead = multiSlotResult ? Math.max(0, multiSlotResult.patientsAheadInDay) : 0
    displayTokenNumber = multiSlotResult?.cumulativePosition || appointment?.queueNumber || 1
  } else if (appointment) {
    // For today: count active queue patients ahead for this doctor
    const activeWaiting = clinicQueue.filter(
      (a) => {
        const matchDoc = appointment?.doctorId ? a.doctorId === appointment.doctorId : !a.doctorId
        return (
          matchDoc &&
          a.id !== inConsultationPatient?.id &&
          !['completed', 'done', 'cancelled', 'no_show'].includes(a.checkinStatus?.toLowerCase() || '') &&
          (a.status || '').toUpperCase() === 'APPROVED' &&
          a.status !== 'WAITING_FOR_APPROVAL' &&
          a.status !== 'pending_payment' &&
          a.status !== 'UNAPPROVED' &&
          a.status !== 'EXPIRED'
        )
      }
    )
    const myPos = appointment.queuePosition || appointment.queueNumber || 0
    let aheadCount = 0
    if (myPos > 0) {
      aheadCount = activeWaiting.filter((a) => (a.queuePosition || a.queueNumber || 0) < myPos).length
    } else {
      const idx = activeWaiting.findIndex((a) => a.id === appointment.id)
      aheadCount = idx >= 0 ? idx : 0
    }
    if (inConsultationPatient && inConsultationPatient.id !== appointment.id) {
      aheadCount += 1
    }
    patientsAhead = Math.max(0, aheadCount)
    displayTokenNumber = appointment.queueNumber || (myPos > 0 ? myPos : 1)
  }

  const clinicAvgMinutes = clinic?.avgConsultationTimeMinutes || 10
  const estimatedWaitMinutes = Math.max(0, patientsAhead * clinicAvgMinutes)

  // Status flags
  const isLabClinic =
    isDiagnosticLabClinic(clinic, doctor, appointment) || labReports.length > 0

  const isConsultancyCompleted =
    appointment?.checkinStatus !== 'waiting' &&
    appointment?.checkinStatus !== 'scheduled' &&
    (
      appointment?.checkinStatus === 'completed' ||
      appointment?.checkinStatus === 'done' ||
      appointment?.checkinStatus === 'report_prepared' ||
      (appointment as any)?.queueStatus === 'completed' ||
      (appointment as any)?.queueStatus === 'done' ||
      (appointment as any)?.queueStatus === 'report_prepared'
    )

  const isInsideChamber =
    ['inside', 'in_consultation', 'called', 'serving'].includes(
      appointment?.checkinStatus?.toLowerCase() || ''
    ) ||
    ['inside', 'in_consultation', 'called', 'serving'].includes(
      (appointment as any)?.queueStatus?.toLowerCase() || ''
    )

  const hasPreparedReport =
    labReports.some((r) => {
      const st = (r.status as string | undefined)?.toLowerCase()
      return st === 'prepared' || st === 'ready' || st === 'delivered'
    }) ||
    appointment?.checkinStatus?.toLowerCase() === 'report_prepared' ||
    (appointment as any)?.queueStatus?.toLowerCase() === 'report_prepared'
  const hasProcessingReport = labReports.some((r) => r.status === 'processing')
  const isLabOrderProcessing =
    ['processing', 'sample_collected', 'in_lab'].includes(
      appointment?.checkinStatus?.toLowerCase() || ''
    ) ||
    ['processing', 'sample_collected', 'in_lab'].includes(
      (appointment as any)?.queueStatus?.toLowerCase() || ''
    )

  const isCalledInsideOrDone =
    isConsultancyCompleted || isInsideChamber || isLabOrderProcessing || hasProcessingReport || hasPreparedReport

  const effectiveLabStatus: 'waiting' | 'inside' | 'processing' | 'prepared' = hasPreparedReport
    ? 'prepared'
    : hasProcessingReport || isLabOrderProcessing
    ? 'processing'
    : isInsideChamber
    ? 'inside'
    : 'waiting'

  // Verification handling: server-side verification using exact 10-digit mobile number
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanPhone = verificationInput.trim().replace(/\D/g, '')
    if (cleanPhone.length !== 10 || !cleanPhone.startsWith('9')) {
      setVerifyError('Please enter your full 10-digit registered Nepal mobile number starting with 9.')
      return
    }

    setVerifyError('')

    try {
      if (pendingVerificationAction === 'view_report' || pendingVerificationAction === 'download_report') {
        const signedUrl = await requestGuestLabReportUrl(activeCode, cleanPhone)
        if (signedUrl) {
          setIsUnlocked(true)
          setIsReportIdentityVerified(true)
          setShowVerificationModal(false)

          setLabReports((prev) =>
            prev.map((r) => ({ ...r, reportFileUrl: signedUrl }))
          )

          if (pendingVerificationAction === 'view_report') {
            const rep =
              labReports.find((r) => {
                const st = (r.status as string | undefined)?.toLowerCase()
                return st === 'prepared' || st === 'ready' || st === 'delivered'
              }) || labReports[0]
            setSelectedReportToView(rep ? { ...rep, reportFileUrl: signedUrl } : null)
            setShowReportModal(true)
          } else {
            window.open(signedUrl, '_blank')
          }
          return
        }
      }

      const { data: isVerified, error: rpcErr } = await supabase.rpc('verify_guest_appointment_identity', {
        p_tracking_code: activeCode,
        p_patient_phone: cleanPhone,
      })

      if (!rpcErr && isVerified) {
        setIsUnlocked(true)
        setIsReportIdentityVerified(true)
        setShowVerificationModal(false)

        if (pendingVerificationAction === 'reschedule') {
          const targetClinicId = appointment?.clinicId || publicQueueStatus?.clinic_id
          const targetDocId = appointment?.doctorId || publicQueueStatus?.doctor_id
          if (targetClinicId) {
            if (onNavigate) {
              onNavigate('clinic-detail', {
                clinicId: targetClinicId,
                doctorId: targetDocId,
                trackingCode: activeCode,
                isReschedule: true,
                autoOpenBooking: true,
              })
            } else {
              window.location.href = `/?clinic=${targetClinicId}&doctor=${targetDocId || ''}&rescheduleCode=${activeCode}&reschedule=true#clinic-detail`
            }
          }
        } else if (pendingVerificationAction === 'cancel') {
          executeCancellation()
        }
      } else {
        setVerifyError('Verification failed. The mobile number does not match this booking record, or attempt limit exceeded.')
      }
    } catch {
      setVerifyError('Verification failed. Please check your connection and try again.')
    }
  }

  const handleActionWithAuth = (
    action: 'view_report' | 'download_report' | 'reschedule' | 'cancel'
  ) => {
    if (isUnlocked || isReportIdentityVerified) {
      if (action === 'view_report') {
        const rep = labReports.find((r) => r.status === 'prepared') || labReports[0]
        setSelectedReportToView(rep || null)
        setShowReportModal(true)
      } else if (action === 'download_report') {
        triggerReportDownload()
      } else if (action === 'reschedule') {
        if (appointment?.clinicId) {
          if (onNavigate) {
            onNavigate('clinic-detail', {
              clinicId: appointment.clinicId,
              doctorId: appointment.doctorId,
              trackingCode: appointment.trackingCode10Digit,
              isReschedule: true,
              autoOpenBooking: true,
            })
          } else {
            window.location.href = `/?clinic=${appointment.clinicId}&doctor=${appointment.doctorId || ''}&rescheduleCode=${appointment.trackingCode10Digit}&reschedule=true#clinic-detail`
          }
        }
      } else if (action === 'cancel') {
        executeCancellation()
      }
    } else {
      setPendingVerificationAction(action)
      setVerificationInput('')
      setVerifyError('')
      setShowVerificationModal(true)
    }
  }

  const triggerReportDownload = () => {
    const rep = labReports.find((r) => r.status === 'prepared') || labReports[0]
    if (rep?.reportFileUrl) {
      window.open(rep.reportFileUrl, '_blank')
    } else {
      alert(
        'Your diagnostic report is certified and ready for collection at the clinic desk. A digital PDF download will sync shortly.'
      )
    }
  }

  const executeCancellation = async () => {
    if (!appointment) return
    const confirmed = window.confirm(
      'Are you sure you want to cancel this appointment? This action cannot be undone.'
    )
    if (!confirmed) return

    try {
      await cancelAppointment(appointment.id)
      alert('Appointment cancelled successfully.')
      fetchQueueData(activeCode)
    } catch {
      alert('Failed to cancel appointment.')
    }
  }

  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appointment || !rescheduleDate) return
    setRescheduleProcessing(true)
    setRescheduleMsg('')
    try {
      const ok = await shiftAppointmentDate(
        appointment.id,
        rescheduleDate,
        rescheduleTime || appointment.appointmentTime || '10:00 AM',
        'Rescheduled by patient via Live Queue',
        undefined,
        appointment.doctorId,
        appointment.trackingCode10Digit
      )
      if (!ok) {
        setRescheduleMsg('Failed to reschedule. Please pick an open slot or contact clinic reception.')
        return
      }
      setRescheduleMsg('Appointment rescheduled successfully!')
      setTimeout(() => {
        setShowRescheduleModal(false)
        fetchQueueData(activeCode)
      }, 1200)
    } catch {
      setRescheduleMsg('Failed to reschedule. Please contact clinic reception.')
    } finally {
      setRescheduleProcessing(false)
    }
  }

  // Doctor presence flag (validated for this appointment's clinic)
  const isDoctorInClinic = Boolean(
    doctor &&
    doctor.isInClinic !== false &&
    (!doctor.activeClinicId || !appointment?.clinicId || doctor.activeClinicId === appointment.clinicId)
  )

  // Helper to parse slot start time
  const slotStartDate = useMemo(() => {
    if (!appointment?.appointmentTime) return null
    const token = appointment.appointmentTime.split(/[-–]|to/)[0]?.trim()
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
  }, [appointment?.appointmentTime])

  const {
    effectiveExpectedTime,
    timeWindowText,
    approxTimeText,
    suggestedArrivalText,
    slotNoticeText,
    displayWaitText
  } = useMemo(() => {
    const now = new Date()
    const isDoctorFree = isDoctorInClinic && !inConsultationPatient && clinic?.isOnBreak !== true

    // When appointment is tomorrow or on a future date, use multi-slot calculations directly
    if (isFutureOrTomorrow) {
      if (multiSlotResult) {
        return {
          effectiveExpectedTime: now,
          timeWindowText: `${multiSlotResult.timeWindowText} (±15 min)`,
          approxTimeText: multiSlotResult.approxAppointmentTimeText,
          suggestedArrivalText: `Scheduled slot for ${multiSlotResult.dateLabel}`,
          slotNoticeText: `Scheduled for ${multiSlotResult.dateLabel} • Approx. ${multiSlotResult.approxAppointmentTimeText}`,
          displayWaitText: multiSlotResult.approxAppointmentTimeText,
        }
      }
      return {
        effectiveExpectedTime: now,
        timeWindowText: `${slotStartTimeStr} (±15 min)`,
        approxTimeText: `Scheduled for ${dateLabel}`,
        suggestedArrivalText: `Scheduled slot for ${dateLabel}`,
        slotNoticeText: `Scheduled for ${dateLabel} • Syncing queue line position...`,
        displayWaitText: `Scheduled for ${dateLabel}`,
      }
    }

    let arrivalStr = ''
    let slotStartFmt = ''
    if (slotStartDate) {
      const arr = new Date(slotStartDate.getTime() - 15 * 60000)
      arrivalStr = arr.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      slotStartFmt = slotStartDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    }

    const arrivalAdvice = arrivalStr ? `Please arrive by ${arrivalStr}.` : ''
    const notice = slotStartDate
      ? (patientsAhead === 0
          ? `No one ahead of you. Your slot starts at ${slotStartFmt}. ${arrivalAdvice}`
          : `${patientsAhead} ${patientsAhead === 1 ? 'person' : 'people'} ahead. Your slot starts at ${slotStartFmt}. ${arrivalAdvice}`)
      : (patientsAhead === 0
          ? 'No one ahead of you. You are up next!'
          : `${patientsAhead} ahead in line. Est. wait: ~${estimatedWaitMinutes} mins`)

    const dynamicTime = new Date(now.getTime() + estimatedWaitMinutes * 60000)
    const isSlotInFuture = slotStartDate ? now.getTime() < slotStartDate.getTime() : false

    let finalExpected: Date
    let waitText: string

    if (patientsAhead === 0) {
      if (isSlotInFuture) {
        finalExpected = slotStartDate || now
        const diffMins = Math.round((finalExpected.getTime() - now.getTime()) / 60000)
        waitText = diffMins > 60 ? `Starts at ${slotStartFmt}` : `~${Math.max(0, diffMins)} min`
      } else {
        // Position 1 and current time is within slot or slot is over:
        finalExpected = now
        waitText = 'Arrive Fast'
      }
    } else {
      // Patient is at position 2, 3, etc. (patientsAhead > 0)
      if (isSlotInFuture && slotStartDate) {
        // Stagger patient by (patientsAhead * clinicAvgMinutes) so time is in between the time slot!
        const slotStaggered = new Date(slotStartDate.getTime() + patientsAhead * clinicAvgMinutes * 60000)
        finalExpected = dynamicTime.getTime() > slotStaggered.getTime() ? dynamicTime : slotStaggered
        const diffMins = Math.round((finalExpected.getTime() - now.getTime()) / 60000)
        waitText = diffMins > 60 ? `~${Math.round(diffMins / 60)} hr` : `~${Math.max(0, diffMins)} min`
      } else {
        // Current time is within slot or slot is over: calculate dynamically based on active queue
        finalExpected = dynamicTime
        waitText = `~${estimatedWaitMinutes} min`
      }
    }

    const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const startWin = new Date(finalExpected.getTime() - 5 * 60000)
    const endWin = new Date(finalExpected.getTime() + 10 * 60000)

    const isArriveFast = waitText === 'Arrive Fast'

    return {
      effectiveExpectedTime: finalExpected,
      timeWindowText: isArriveFast ? 'Immediate' : `${fmt(startWin)} – ${fmt(endWin)}`,
      approxTimeText: isArriveFast ? 'Your turn, arrive fast' : `around ${fmt(finalExpected)}`,
      suggestedArrivalText: arrivalAdvice,
      slotNoticeText: isArriveFast ? 'You are at position 1! You are next in line — arrive fast.' : notice,
      displayWaitText: waitText
    }
  }, [slotStartDate, isDoctorInClinic, inConsultationPatient, clinic?.isOnBreak, patientsAhead, estimatedWaitMinutes, isFutureOrTomorrow, multiSlotResult, dateLabel, slotStartTimeStr])

  // Formatted expected call time
  const formattedExpectedTime = approxTimeText

  if (!appointment && publicQueueStatus) {
    const publicStatus = String(publicQueueStatus.queue_status || publicQueueStatus.checkin_status || 'waiting')
      .replace(/_/g, ' ')
    const publicDate = publicQueueStatus.appointment_date
      ? new Date(`${publicQueueStatus.appointment_date}T00:00:00`).toLocaleDateString()
      : ''

    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
        <section className="mx-auto max-w-2xl space-y-5">
          <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Dactor Live Queue</p>
            <h1 className="mt-2 text-2xl font-bold">Your queue status</h1>
            <p className="mt-2 text-sm text-slate-300">Only clinic and queue details are shown here. Patient identity and medical information stay private.</p>
          </header>
          <form onSubmit={(event) => {
            event.preventDefault()
            const code = inputCode.trim()
            if (!/^\d{10}$/.test(code)) {
              setErrorMsg('Please enter a valid 10-digit tracking code.')
              return
            }
            setActiveCode(code)
            void fetchQueueData(code)
          }} className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <input
              value={inputCode}
              onChange={(event) => setInputCode(event.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              aria-label="10-digit tracking code"
              placeholder="10-digit tracking code"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
            />
            <button type="submit" disabled={loading} className="rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-60">
              {loading ? 'Checking…' : 'Check'}
            </button>
          </form>
          {errorMsg && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{errorMsg}</p>}
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Clinic</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{publicQueueStatus.clinic_name || clinic?.name || 'Clinic'}</h2>
                {publicQueueStatus.doctor_name && <p className="mt-1 text-sm text-slate-600">Dr. {publicQueueStatus.doctor_name}{publicQueueStatus.doctor_specialty ? ` · ${publicQueueStatus.doctor_specialty}` : ''}</p>}
              </div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold capitalize text-teal-800">{publicStatus}</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">People ahead</p><p className="mt-1 text-2xl font-bold text-slate-900">{Number(publicQueueStatus.patients_ahead || 0)}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Your queue position</p><p className="mt-1 text-2xl font-bold text-slate-900">{Number(publicQueueStatus.queue_position || 0) || '—'}</p></div>
            </div>
            <p className="mt-4 text-sm text-slate-600">{publicDate}{publicQueueStatus.appointment_time ? ` · ${publicQueueStatus.appointment_time}` : ''}</p>
            <p className="mt-4 text-xs text-slate-500">For reports, prescriptions, billing, or changes to this booking, sign in with the account used to book or contact the clinic.</p>
          </article>
        </section>
      </main>
    )
  }

  return (
    <div className="min-h-screen pb-28 sm:pb-16">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER: DARK OBSIDIAN / TEAL REFRACTION                     */}
      {/* ========================================================================= */}
      <div className="w-full bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 text-white pt-6 sm:pt-8 pb-12 sm:pb-16 px-3 sm:px-6 lg:px-8 border-b border-teal-500/20 relative overflow-hidden shadow-glass-elevated">
        {/* Specular Edge Highlight */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

        <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4 relative z-10">
          {/* Top Brand Capsule Pill + Refresh Action */}
          <div className="flex items-center justify-between">
            <div className="px-3 py-1 rounded-full bg-white/10 text-teal-300 text-[11px] sm:text-xs font-semibold backdrop-blur-md tracking-wide truncate max-w-[230px] sm:max-w-none border border-white/15">
              {clinic?.name || 'Dactor • Healthcare Ecosystem'}
            </div>

            <button
              onClick={() => fetchQueueData(activeCode)}
              disabled={loading}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition cursor-pointer active:scale-95 shadow-glass-sm"
              title="Refresh live queue status"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Title Row with Back Button */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 pt-1">
            {onNavigateHome && (
              <button
                onClick={onNavigateHome}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition cursor-pointer shrink-0 active:scale-95 shadow-glass-sm"
                title="Back to home"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
            <div>
              <h1 className="text-xl sm:text-3xl font-black tracking-tight text-white">Live Queue Position</h1>
              <p className="text-[11px] sm:text-xs text-teal-300/90 font-medium">Your health, our priority</p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. OVERLAPPING CONTENT CONTAINER (Negative offset over Teal Header)        */}
      {/* ========================================================================= */}
      <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 -mt-6 sm:-mt-8 space-y-4 sm:space-y-5">
        {/* Real-Time Live Notification Alert Banner */}
        {activeAlert && (
          <div className="liquid-glass-elevated bg-gradient-to-r from-amber-500/20 via-teal-500/20 to-cyan-500/20 border-2 border-amber-400/60 dark:border-amber-400/80 rounded-3xl p-4 sm:p-5 shadow-glass-elevated animate-in zoom-in-95 duration-300 relative overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-500 dark:text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30 animate-bounce">
                  <BellRing className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-900 dark:text-amber-200 text-[10px] font-black uppercase tracking-wider">
                      Live Alert
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                      {activeAlert.title}
                    </h3>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                    {activeAlert.message}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveAlert(null)}
                className="w-7 h-7 rounded-full bg-slate-500/10 hover:bg-slate-500/20 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0 transition cursor-pointer"
                title="Dismiss alert"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Search Input Bar (If not loaded or searching another code) */}
        <div className="liquid-glass-elevated rounded-3xl p-2 sm:p-2.5 border-teal-500/30 shadow-glass-elevated">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600 dark:text-teal-400 absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Enter 10-Digit Code..."
                maxLength={10}
                className="w-full pl-9 sm:pl-11 pr-2 sm:pr-4 py-2 sm:py-2.5 bg-transparent text-sm sm:text-lg font-black tracking-wider text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-normal placeholder:tracking-normal outline-none"
              />
            </div>
            <button
              type="submit"
              className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white text-xs font-bold rounded-2xl shadow-glass-base transition cursor-pointer shrink-0 active:scale-95 border-t border-white/20"
            >
              {loading ? 'Tracking...' : 'Track'}
            </button>
          </form>

          {errorMsg && (
            <div className="mt-2 p-2.5 sm:p-3 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 rounded-2xl text-xs flex items-center space-x-2 backdrop-blur-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* --------------------------------------------------------------------- */}
        {/* ACTIVE APPOINTMENT LIVE BOARD                                         */}
        {/* --------------------------------------------------------------------- */}
        {appointment && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* 1. BOOKING CODE CARD WITH COPY BUTTON */}
            <div className="liquid-glass-card rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3.5">
                <div className="w-11 h-11 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                    BOOKING CODE
                  </span>
                  <div className="text-lg font-black text-slate-900 dark:text-white tracking-wider font-mono">
                    #{appointment.trackingCode10Digit}
                  </div>
                </div>
              </div>

              <button
                onClick={handleCopyCode}
                className="p-2.5 rounded-xl liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5 text-xs font-semibold cursor-pointer active:scale-95"
                title="Copy code to clipboard"
              >
                {copyFeedback ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-300 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span className="hidden sm:inline">Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* PRESERVED QUICK PATIENT CONTROLS BAR */}
            <div className="liquid-glass-card rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2.5 border border-white/40 dark:border-white/10 shadow-glass-sm">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Patient Actions & Documents:</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => printAppointmentBill(appointment)}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition flex items-center space-x-1 cursor-pointer active:scale-95"
                  title="Download and print official medical bill"
                >
                  <Download className="w-3.5 h-3.5 text-teal-300" />
                  <span>Download Bill</span>
                </button>
                <button
                  type="button"
                  onClick={() => printPrescription(appointment)}
                  className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition flex items-center space-x-1 cursor-pointer active:scale-95"
                  title="Download official doctor prescription"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-white" />
                  <span>Download Rx</span>
                </button>
                {!isCalledInsideOrDone && (
                  <button
                    type="button"
                    onClick={() => handleActionWithAuth('reschedule')}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition flex items-center space-x-1 cursor-pointer active:scale-95"
                    title="Reschedule appointment date or slot"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Reschedule</span>
                  </button>
                )}
                {clinic?.contactPhone && (
                  <a
                    href={`tel:${clinic.contactPhone}`}
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-bold text-xs border border-emerald-300 dark:border-emerald-700 transition flex items-center space-x-1"
                    title={`Call Clinic Reception (${clinic.contactPhone})`}
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Call Reception</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => fetchQueueData(activeCode)}
                  className="p-1.5 rounded-xl liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300 transition cursor-pointer active:scale-95"
                  title="Refresh Queue Status"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* DUAL-CONSULTATION BREAKDOWN: INITIAL & FOLLOW-UP VISITS */}
            {linkedConsultations && linkedConsultations.isLinked && (
              <div className="liquid-glass-elevated rounded-3xl p-5 border border-teal-500/30 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/20 dark:border-white/10">
                  <div className="flex items-center space-x-2">
                    <Stethoscope className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <h3 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                      Dual-Consultation Clinical Breakdown
                    </h3>
                  </div>
                  <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10 px-2.5 py-0.5 rounded-full border border-teal-500/20">
                    2 Linked Visits Recorded
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Visit 1: Initial Consultation */}
                  {linkedConsultations.initialAppointment && (
                    <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-blue-100 dark:border-blue-900">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-700">
                          1. Initial Consultation (Paid)
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                          #{linkedConsultations.initialAppointment.trackingCode10Digit}
                        </span>
                      </div>

                      <div className="text-xs space-y-1.5 text-slate-700 dark:text-slate-300">
                        <div>
                          <strong className="text-slate-900 dark:text-white">Doctor:</strong>{' '}
                          {linkedConsultations.initialAppointment.doctor?.fullName || doctor?.fullName || 'OPD Specialist'}
                          {linkedConsultations.initialAppointment.doctor?.specialty ? ` (${linkedConsultations.initialAppointment.doctor?.specialty})` : ''}
                        </div>
                        <div>
                          <strong className="text-slate-900 dark:text-white">Date:</strong>{' '}
                          {linkedConsultations.initialAppointment.appointmentDate} • {linkedConsultations.initialAppointment.appointmentTime || '10:00 AM'}
                        </div>
                        <div>
                          <strong className="text-slate-900 dark:text-white">Total Bill:</strong> NPR{' '}
                          {linkedConsultations.initialAppointment.feeAmount || 500}{' '}
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            ({linkedConsultations.initialAppointment.paymentStatus || 'Paid'})
                          </span>
                        </div>
                        {linkedConsultations.initialAppointment.notes && (
                          <div className="mt-1 p-2 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-blue-100 dark:border-blue-900 text-[11px]">
                            <strong>Clinical Notes & Rx:</strong> {linkedConsultations.initialAppointment.notes}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-blue-100 dark:border-blue-900 flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => printAppointmentBill(linkedConsultations.initialAppointment!)}
                          className="flex-1 py-1.5 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-blue-900 dark:text-blue-200 font-bold text-xs border border-blue-200 dark:border-blue-700 transition flex items-center justify-center space-x-1 cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5 text-blue-600" />
                          <span>Download Initial Bill</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => printPrescription(linkedConsultations.initialAppointment!)}
                          className="flex-1 py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                        >
                          <Stethoscope className="w-3.5 h-3.5" />
                          <span>View Initial Rx</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Visit 2: Follow-Up Consultation */}
                  {linkedConsultations.followupAppointment && (
                    <div className="p-4 rounded-2xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-teal-100 dark:border-teal-900">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-700">
                          2. Follow-Up Consultation (Rs. 0 Free)
                        </span>
                        <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-300">
                          #{linkedConsultations.followupAppointment.trackingCode10Digit}
                        </span>
                      </div>

                      <div className="text-xs space-y-1.5 text-slate-700 dark:text-slate-300">
                        <div>
                          <strong className="text-slate-900 dark:text-white">Doctor:</strong>{' '}
                          {linkedConsultations.followupAppointment.doctor?.fullName || doctor?.fullName || 'OPD Specialist'}
                        </div>
                        <div>
                          <strong className="text-slate-900 dark:text-white">Date:</strong>{' '}
                          {linkedConsultations.followupAppointment.appointmentDate} • {linkedConsultations.followupAppointment.appointmentTime || '11:00 AM'}
                        </div>
                        <div>
                          <strong className="text-slate-900 dark:text-white">Status:</strong>{' '}
                          <span className="font-bold text-teal-700 dark:text-teal-300 uppercase">
                            {linkedConsultations.followupAppointment.checkinStatus.replace('_', ' ')}
                          </span>
                          {' • '}
                          <strong className="text-slate-900 dark:text-white">Fee:</strong>{' '}
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">NPR 0 (Free Follow-Up)</span>
                        </div>
                        {linkedConsultations.followupAppointment.notes && (
                          <div className="mt-1 p-2 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-teal-100 dark:border-teal-900 text-[11px]">
                            <strong>Remarks:</strong> {linkedConsultations.followupAppointment.notes}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-teal-100 dark:border-teal-900 flex items-center gap-2 flex-wrap">
                        {linkedConsultations.followupAppointment.checkinStatus === 'completed' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => printAppointmentBill(linkedConsultations.followupAppointment!)}
                              className="flex-1 py-1.5 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-slate-700 text-teal-900 dark:text-teal-200 font-bold text-xs border border-teal-200 dark:border-teal-700 transition flex items-center justify-center space-x-1 cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5 text-teal-600" />
                              <span>Follow-Up Bill</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => printPrescription(linkedConsultations.followupAppointment!)}
                              className="flex-1 py-1.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                            >
                              <Stethoscope className="w-3.5 h-3.5" />
                              <span>Follow-Up Rx</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleActionWithAuth('reschedule')}
                              className="flex-1 py-1.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              <span>Reschedule Follow-Up</span>
                            </button>
                            {clinic?.contactPhone && (
                              <a
                                href={`tel:${clinic.contactPhone}`}
                                className="flex-1 py-1.5 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-teal-50 text-teal-900 dark:text-teal-200 font-bold text-xs border border-teal-300 dark:border-teal-700 transition flex items-center justify-center space-x-1"
                              >
                                <Phone className="w-3.5 h-3.5 text-teal-600" />
                                <span>Clinic Help</span>
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. PENDING APPROVAL OR ONLINE PAYMENT ALERT BANNER */}
            {appointment.status !== 'APPROVED' ? (
              <div className="liquid-glass-elevated rounded-3xl p-5 sm:p-7 space-y-5 animate-in fade-in duration-200">
                {/* Header Status Badge & Attempt Counter */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-white/20 dark:border-white/5">
                  <span
                    className={`px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider border shadow-xs ${
                      appointment.status === 'WAITING_FOR_APPROVAL'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        : appointment.status === 'pending_payment'
                        ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
                        : appointment.status === 'UNAPPROVED'
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                        : 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30'
                    }`}
                  >
                    {appointment.status === 'WAITING_FOR_APPROVAL'
                      ? 'Waiting for Clinic Approval'
                      : appointment.status === 'pending_payment'
                      ? 'Pending Online Payment'
                      : appointment.status === 'UNAPPROVED'
                      ? 'Unapproved'
                      : 'Request Expired'}
                  </span>

                  {appointment.paymentMode === 'PAY_AT_DESK' && (
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>Attempt {appointment.attemptNumber || 1} of 3</span>
                    </div>
                  )}
                </div>

                {/* Status Main Message */}
                <div className="space-y-2">
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    {appointment.status === 'WAITING_FOR_APPROVAL' && 'Waiting for approval from clinic'}
                    {appointment.status === 'pending_payment' && 'Online Payment Pending'}
                    {appointment.status === 'UNAPPROVED' && 'Unapproved'}
                    {appointment.status === 'EXPIRED' && 'Request expired'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                    {appointment.status === 'WAITING_FOR_APPROVAL' &&
                      'Your Pay at Desk booking request has been submitted to the clinic counter. You will be assigned a live queue token as soon as reception approves your request.'}
                    {appointment.status === 'pending_payment' &&
                      'Your appointment slot is reserved. Please complete your online payment to enter the live OPD queue.'}
                    {appointment.status === 'UNAPPROVED' &&
                      ((appointment.attemptNumber || 1) < 3
                        ? 'The clinic unapproved your booking request. You can retry sending this request to the clinic.'
                        : 'The clinic unapproved your booking request. Maximum send attempts (3 of 3) have been reached.')}
                    {appointment.status === 'EXPIRED' &&
                      'This booking request has expired because it was not approved within 2 days or the slot time has passed.'}
                  </p>
                </div>

                {payAtDeskError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{payAtDeskError}</span>
                  </div>
                )}

                {/* Amount Breakdown Summary */}
                <div className="p-4 rounded-2xl liquid-glass-subtle border border-white/30 dark:border-white/10 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Consultation Fee</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Rs. {appointment.feeAmount}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Pay at Desk Service Charge (5%)</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Rs. {appointment.serviceChargeAmount || Number((appointment.feeAmount * 0.05).toFixed(2))}
                    </span>
                  </div>
                  <div className="border-t border-white/20 dark:border-white/10 pt-2 flex justify-between font-black text-sm text-slate-900 dark:text-white">
                    <span>Total Payable at Desk</span>
                    <span className="text-teal-600 dark:text-teal-400">
                      Rs. {appointment.totalAmount || (appointment.feeAmount + Number((appointment.feeAmount * 0.05).toFixed(2)))}
                    </span>
                  </div>
                </div>

                {/* Action Buttons based on status */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {appointment.status === 'WAITING_FOR_APPROVAL' && (
                    clinic?.contactPhone ? (
                      <a
                        href={`tel:${clinic.contactPhone}`}
                        className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs sm:text-sm shadow-glass-base flex items-center justify-center space-x-2 transition cursor-pointer active:scale-[0.98]"
                      >
                        <Phone className="w-4 h-4" />
                        <span>Call Clinic ({clinic.contactPhone})</span>
                      </a>
                    ) : (
                      <button
                        disabled
                        className="flex-1 py-3 px-5 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-bold text-xs sm:text-sm cursor-not-allowed flex items-center justify-center space-x-2"
                        title="Clinic has not provided a contact phone number"
                      >
                        <Phone className="w-4 h-4" />
                        <span>Call Clinic (No Phone Listed)</span>
                      </button>
                    )
                  )}

                  {appointment.status === 'UNAPPROVED' && (
                    (appointment.attemptNumber || 1) < 3 ? (
                      <button
                        type="button"
                        disabled={retryingPayAtDesk}
                        onClick={async () => {
                          setRetryingPayAtDesk(true)
                          setPayAtDeskError(null)
                          try {
                            const res = await retryPayAtDeskAppointment(appointment.id, appointment.patientMobile || undefined)
                            if (res.success) {
                              await fetchQueueData(activeCode)
                            } else {
                              setPayAtDeskError(res.error || 'Failed to retry request')
                            }
                          } catch (err: any) {
                            setPayAtDeskError(err.message || 'Failed to retry request')
                          } finally {
                            setRetryingPayAtDesk(false)
                          }
                        }}
                        className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold text-xs sm:text-sm shadow-glass-base flex items-center justify-center space-x-2 transition cursor-pointer active:scale-[0.98] disabled:opacity-50"
                      >
                        {retryingPayAtDesk ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Retrying Request...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            <span>Retry Request ({3 - (appointment.attemptNumber || 1)} retries left)</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (appointment.clinicId) {
                            if (onNavigate) {
                              onNavigate('clinic-detail', { clinicId: appointment.clinicId })
                            } else {
                              window.location.href = `/?clinic=${appointment.clinicId}#clinic-detail`
                            }
                          }
                        }}
                        className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-bold text-xs sm:text-sm shadow-glass-base flex items-center justify-center space-x-2 transition cursor-pointer active:scale-[0.98]"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>Book Another Slot</span>
                      </button>
                    )
                  )}

                  {appointment.status === 'EXPIRED' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (appointment.clinicId) {
                          if (onNavigate) {
                            onNavigate('clinic-detail', { clinicId: appointment.clinicId })
                          } else {
                            window.location.href = `/?clinic=${appointment.clinicId}#clinic-detail`
                          }
                        }
                      }}
                      className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-bold text-xs sm:text-sm shadow-glass-base flex items-center justify-center space-x-2 transition cursor-pointer active:scale-[0.98]"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Book Again</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => fetchQueueData(activeCode)}
                    className="py-3 px-4 rounded-2xl liquid-glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold text-xs transition flex items-center space-x-1.5 cursor-pointer active:scale-95 border border-white/30 dark:border-white/10"
                    title="Refresh Status"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
            {clinic?.isOnBreak && !isConsultancyCompleted && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center space-x-3 text-amber-900 dark:text-amber-300 shadow-glass-sm backdrop-blur-sm">
                <div className="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <PauseCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    CLINIC IS CURRENTLY ON BREAK
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-400/90">
                    Consultations are paused temporarily. They will resume shortly.
                  </p>
                </div>
              </div>
            )}

            {/* 3. DOCTOR PRESENCE / AWAY BANNER */}
            {!isConsultancyCompleted && !isLabClinic && (
              <div
                className={`p-3.5 rounded-2xl border text-xs flex items-center space-x-2.5 backdrop-blur-sm ${
                  isFutureOrTomorrow
                    ? 'bg-sky-500/10 border-sky-500/20 text-sky-900 dark:text-sky-300'
                    : isDoctorInClinic
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-300'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    isFutureOrTomorrow
                      ? 'bg-sky-500'
                      : isDoctorInClinic
                      ? 'bg-emerald-500 animate-ping'
                      : 'bg-amber-500'
                  }`}
                />
                <span className="font-bold">
                  {isFutureOrTomorrow
                    ? `Doctor session scheduled for ${dateLabel} • Starts at ${slotStartTimeStr} (±15 min)`
                    : isDoctorInClinic
                    ? inConsultationPatient
                      ? `Doctor is inside the clinic cabin • Attending active OPD tokens`
                      : `Doctor is inside and available • Consultations proceeding smoothly`
                    : `Doctor Temporarily Away • Will resume consultations shortly`}
                </span>
              </div>
            )}

            {/* 4. MAIN LIVE QUEUE STATUS CARD (Position Badge, Stepper, Slot & Wait) */}
            <div className="liquid-glass-elevated rounded-3xl p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Top Token Row: Position Circle + Dynamic Title */}
              <div className="flex items-center space-x-3 sm:space-x-4">
                {/* Circular Position Badge with Outer Halo Ring */}
                <div className="relative flex items-center justify-center shrink-0">
                  <div
                    className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center backdrop-blur-md border ${
                      isInsideChamber
                        ? 'bg-blue-500/15 border-blue-500/30'
                        : isConsultancyCompleted
                        ? 'bg-emerald-500/15 border-emerald-500/30'
                        : patientsAhead === 0
                        ? 'bg-emerald-500/15 border-emerald-500/30'
                        : 'bg-teal-500/15 border-teal-500/30'
                    }`}
                  >
                    <div
                      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex flex-col items-center justify-center text-white shadow-glass-base ${
                        isInsideChamber
                          ? 'bg-gradient-to-tr from-blue-600 to-indigo-600'
                          : isConsultancyCompleted
                          ? 'bg-gradient-to-tr from-emerald-600 to-teal-600'
                          : patientsAhead === 0
                          ? 'bg-gradient-to-tr from-emerald-600 to-teal-600'
                          : 'bg-gradient-to-tr from-teal-600 to-cyan-600'
                      }`}
                    >
                      <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-wider opacity-90 leading-tight">
                        {isInsideChamber
                          ? 'CURRENT'
                          : isConsultancyCompleted
                          ? 'VISIT'
                          : isFutureOrTomorrow
                          ? 'LINE NO.'
                          : patientsAhead === 0
                          ? 'UP NEXT'
                          : 'POSITION'}
                      </span>
                      <span className="text-xl sm:text-2xl font-black leading-none mt-0.5">
                        {isInsideChamber
                          ? 'NOW'
                          : isConsultancyCompleted
                          ? '✓'
                          : isFutureOrTomorrow
                          ? `${multiSlotResult?.cumulativePosition || displayTokenNumber}`
                          : `${Math.max(0, patientsAhead)}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dynamic Title, Subtitle, and Token Badge */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <h3
                      className={`text-base sm:text-xl font-black leading-snug ${
                        isLabClinic && effectiveLabStatus === 'prepared'
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : isLabClinic && effectiveLabStatus === 'processing'
                          ? 'text-amber-700 dark:text-amber-300'
                          : isLabClinic && effectiveLabStatus === 'inside'
                          ? 'text-blue-700 dark:text-blue-300'
                          : isInsideChamber
                          ? 'text-blue-700 dark:text-blue-300'
                          : isConsultancyCompleted
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {isLabClinic
                        ? effectiveLabStatus === 'prepared'
                        ? 'Status: Report Prepared'
                        : effectiveLabStatus === 'processing'
                        ? 'Status: Sample Processing'
                        : effectiveLabStatus === 'inside'
                        ? 'Called Inside Phlebotomy Booth!'
                        : patientsAhead === 0
                        ? 'Next for Sample Collection!'
                        : `${patientsAhead} Ahead for Phlebotomy`
                      : isInsideChamber
                      ? 'You are in OPD session'
                      : isConsultancyCompleted
                      ? 'Consultation completed'
                      : isFutureOrTomorrow && patientsAhead === 0
                      ? `1st in line for ${dateLabel}`
                      : isFutureOrTomorrow
                      ? `${patientsAhead} patients ahead for ${dateLabel}`
                      : patientsAhead === 0
                      ? "You're next in line!"
                      : `${patientsAhead} patients ahead`}
                    </h3>

                    <span className="px-2 sm:px-2.5 py-0.5 rounded-md liquid-glass-subtle text-slate-700 dark:text-slate-300 text-[11px] sm:text-xs font-bold">
                      Token #{displayTokenNumber}{doctor?.fullName && !isLabClinic ? ` • ${doctor.fullName}` : ''}
                    </span>
                  </div>

                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                    {isLabClinic
                      ? effectiveLabStatus === 'prepared'
                        ? 'Certified report ready • Verify identity below to view & download file'
                        : effectiveLabStatus === 'processing'
                        ? 'Sample collected • Biochemical processing underway in laboratory'
                        : effectiveLabStatus === 'inside'
                        ? '🔔 Token called! Please proceed immediately into the phlebotomy collection booth'
                        : 'Booked in Live Queue • Please proceed for sample collection'
                      : isInsideChamber
                      ? 'Currently with specialist in consultation cabin'
                      : isConsultancyCompleted
                      ? 'Thank you for visiting • Prescription & bill available below'
                      : isFutureOrTomorrow
                      ? `Scheduled for ${dateLabel} • Approx. ${multiSlotResult?.approxAppointmentTimeText || `${slotStartTimeStr} (±15 min)`}`
                      : slotNoticeText || (patientsAhead === 0
                      ? '0 patients ahead • Please stay close to the consultation cabin'
                      : `${patientsAhead} ahead in line • Est. wait: ~${estimatedWaitMinutes} mins`)}
                  </p>
                </div>
              </div>

              {/* 4-Step Stepper Progress Bar */}
              <div className="py-2 overflow-x-auto scrollbar-none">
                <div className="flex items-center justify-between relative min-w-[270px]">
                  {/* Connecting line behind */}
                  <div className="absolute top-1/2 left-4 sm:left-6 right-4 sm:right-6 -translate-y-1/2 h-0.5 bg-slate-200/60 dark:bg-white/10 -z-0" />

                  {(isLabClinic
                    ? ['Booked', 'Collected', 'Processing', 'Prepared']
                    : ['Booked', 'Waiting', 'In OPD', 'Done']
                  ).map((stepName, idx) => {
                    const isLab = isLabClinic
                    const isDone = isLab
                      ? (idx === 0) ||
                        (idx === 1 && (effectiveLabStatus === 'processing' || effectiveLabStatus === 'prepared')) ||
                        (idx === 2 && effectiveLabStatus === 'prepared') ||
                        (idx === 3 && effectiveLabStatus === 'prepared')
                      : (idx === 0) ||
                        (idx === 1 && (!isConsultancyCompleted || isInsideChamber)) ||
                        (idx === 2 && (isInsideChamber || isConsultancyCompleted)) ||
                        (idx === 3 && isConsultancyCompleted)

                    const isActive = isLab
                      ? (idx === 3 && effectiveLabStatus === 'prepared') ||
                        (idx === 2 && effectiveLabStatus === 'processing') ||
                        (idx === 1 && (effectiveLabStatus === 'inside' || (effectiveLabStatus === 'waiting' && patientsAhead === 0))) ||
                        (idx === 0 && effectiveLabStatus === 'waiting' && patientsAhead > 0)
                      : (idx === 3 && isConsultancyCompleted) ||
                        (idx === 2 && isInsideChamber) ||
                        (idx === 1 && !isInsideChamber && !isConsultancyCompleted)

                    return (
                      <div
                        key={stepName}
                        className="flex flex-col items-center space-y-1 z-10 px-1 sm:px-2"
                      >
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-black transition-all ${
                            isDone || isActive
                              ? 'bg-gradient-to-tr from-teal-600 to-cyan-600 text-white shadow-glass-sm'
                              : 'liquid-glass-subtle text-slate-400'
                          }`}
                        >
                          {isDone ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : idx + 1}
                        </div>
                        <span
                          className={`text-[10px] sm:text-[11px] font-bold ${
                            isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {stepName}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Slot & Expected Call Informational Cards (Hidden when completed or lab prepared) */}
              {!isConsultancyCompleted && effectiveLabStatus !== 'prepared' && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl liquid-glass-subtle space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {isFutureOrTomorrow ? 'Your Slot' : 'Your Booked Window'}
                      </span>
                      <div className="text-base font-black text-slate-900 dark:text-white">
                        {isFutureOrTomorrow
                          ? `${dateLabel}, ${slotStartTimeStr} (±15 min)`
                          : appointment.appointmentTime
                          ? `${appointment.appointmentTime} (±15 min)`
                          : '09:00 AM (±15 min)'}
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isFutureOrTomorrow
                          ? 'Scheduled slot'
                          : suggestedArrivalText || `Date: ${appointment.appointmentDate}`}
                      </span>
                    </div>

                    <div className="p-4 rounded-2xl liquid-glass-subtle space-y-0.5 border border-teal-500/30">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                        {isFutureOrTomorrow
                          ? 'Scheduled Window'
                          : 'Expected Window'}
                      </span>
                      <div className="text-base font-black text-teal-900 dark:text-teal-200">
                        {isFutureOrTomorrow && multiSlotResult
                          ? multiSlotResult.approxAppointmentTimeText
                          : isFutureOrTomorrow
                          ? `${slotStartTimeStr} (±15 min)`
                          : displayWaitText}
                      </div>
                      <span className="text-[11px] text-teal-700 dark:text-teal-400">
                        {isFutureOrTomorrow && multiSlotResult
                          ? `${multiSlotResult.timeWindowText} (±15 min)`
                          : isFutureOrTomorrow
                          ? 'Staggered arrival window'
                          : `${timeWindowText} (${approxTimeText})`}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            </>
            )}

            {/* 5. CLINIC & DOCTOR PROFILE CARD (Call, Directions & Roster) */}
            <div className="liquid-glass-card rounded-3xl p-6 space-y-5">
              {/* Clinic Information */}
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  {resolveClinicLogoUrl(clinic) || clinic?.photoUrl || clinic?.logoUrl || (clinic?.pictures && clinic.pictures[0]) ? (
                    <img
                      src={resolveClinicLogoUrl(clinic) || resolveStorageUrl(clinic?.photoUrl || clinic?.logoUrl || clinic?.pictures?.[0], 'clinic_logos')}
                      alt={clinic?.name || 'Clinic'}
                      className="w-10 h-10 rounded-xl object-cover shrink-0 border border-teal-500/20 shadow-sm"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-800 dark:text-teal-300 border border-teal-500/20 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      HEALTHCARE FACILITY
                    </span>
                    <h4 className="text-base font-black text-slate-900 dark:text-white">
                      {clinic?.name || appointment.clinic?.name || 'OPD Medical Center'}
                    </h4>
                  </div>
                </div>

                <div className="flex items-start space-x-2 text-xs text-slate-600 dark:text-slate-300 pl-1">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span>{clinic?.addressText || 'Nepal'}</span>
                </div>

                {/* Call Clinic & Google Maps Directions Action Buttons */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <a
                    href={`tel:${clinic?.contactPhone || clinic?.managerPhone || '01-4412345'}`}
                    className="py-2.5 px-3 rounded-xl liquid-glass-subtle text-teal-700 dark:text-teal-300 hover:bg-white/80 dark:hover:bg-slate-800/80 text-xs font-bold transition flex items-center justify-center space-x-1.5 active:scale-95"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call clinic</span>
                  </a>

                  <a
                    href={
                      (clinic?.latitude && clinic?.longitude) || (appointment.clinic?.latitude && appointment.clinic?.longitude)
                        ? `https://www.google.com/maps/dir/?api=1&destination=${clinic?.latitude || appointment.clinic?.latitude},${clinic?.longitude || appointment.clinic?.longitude}`
                        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                            `${clinic?.name || appointment.clinic?.name || ''} ${clinic?.addressText || appointment.clinic?.addressText || ''}`.trim()
                          )}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-3 rounded-xl liquid-glass-subtle text-teal-700 dark:text-teal-300 hover:bg-white/80 dark:hover:bg-slate-800/80 text-xs font-bold transition flex items-center justify-center space-x-1.5 active:scale-95"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Directions</span>
                  </a>
                </div>
              </div>

              {/* Attending Doctor Profile (If applicable) */}
              {doctor && (
                <div className="pt-4 border-t border-slate-200/50 dark:border-white/10 flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 flex items-center justify-center font-black text-lg shrink-0 overflow-hidden">
                    {doctor.profilePictureUrl ? (
                      <img
                        src={resolveDoctorPhotoUrl(doctor) || resolveStorageUrl(doctor.profilePictureUrl, 'doctor_photos')}
                        alt={doctor.fullName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      doctor.fullName.slice(0, 2).toUpperCase()
                    )}
                  </div>

                  <div className="flex-1 space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      ATTENDING DOCTOR
                    </span>
                    <h5 className="font-bold text-slate-900 dark:text-white text-sm">
                      {doctor.fullName.startsWith('Dr.') ? doctor.fullName : `Dr. ${doctor.fullName}`}
                    </h5>
                    <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                      {doctor.specialty || 'General OPD Specialist'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {doctor.education ? `${doctor.education} • ` : ''}
                      Consultation for general health & OPD
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 6. BOOKED DIAGNOSTIC LAB TESTS CARD (If applicable) */}
            {Boolean(appointment.selectedTests && appointment.selectedTests.length > 0) && (
              <div className="liquid-glass-subtle border-purple-500/30 rounded-3xl p-5 space-y-2">
                <div className="flex items-center space-x-2 text-purple-900 dark:text-purple-300 font-bold text-xs uppercase tracking-wider">
                  <FlaskConical className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Booked Diagnostic Lab Investigations</span>
                </div>
                <p className="text-xs font-bold text-purple-950 dark:text-purple-200">
                  {appointment.selectedTests?.join(', ')}
                </p>
              </div>
            )}

            {/* 7. ACTIVE IN-CHAMBER OPD CONSULTATION TIMER BANNER */}
            {isInsideChamber && (
              <div className="liquid-glass-elevated border-blue-500/50 rounded-3xl p-5 space-y-2 text-blue-900 dark:text-blue-300">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
                  <span className="text-xs font-black uppercase tracking-wider text-blue-800 dark:text-blue-300">
                    Active Consultation Session in Progress
                  </span>
                </div>
                <p className="text-xs font-bold text-blue-950 dark:text-blue-200">
                  Please step into the consultation room and discuss your symptoms with the attending specialist.
                </p>
              </div>
            )}

            {/* 8. CONSULTATION COMPLETED & PRESCRIPTION / BILL READY */}
            {isConsultancyCompleted && (
              <div className="liquid-glass-card border-emerald-500/30 rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-900 dark:text-emerald-300">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <h4 className="font-black text-sm">Consultation Finished & Bill Ready</h4>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 text-xs font-black">
                    COMPLETED
                  </span>
                </div>

                <p className="text-xs text-emerald-800 dark:text-emerald-300/90 font-medium">
                  Total Bill: NPR {appointment.feeAmount || 500} • Status: {appointment.paymentStatus === 'paid' ? 'Paid' : 'Settled at Reception'}
                </p>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => setShowPrescriptionModal(true)}
                    className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-glass-sm active:scale-95 border-t border-white/20"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>Prescription & Bill Summary</span>
                  </button>
                </div>
              </div>
            )}

            {/* ===================================================================== */}
            {/* 9. UNIFIED DIAGNOSTIC LAB REPORTS & FILES SECTION                     */}
            {/* (NO SEPARATE PORTAL: FILE CHECKING & REPORTS DIRECTLY INTEGRATED HERE)*/}
            {/* ===================================================================== */}
            {(isLabClinic || labReports.length > 0) && (
              <div className="liquid-glass-elevated rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">
                      Diagnostic Lab Reports & Files
                    </h4>
                  </div>

                  <span
                    className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      effectiveLabStatus === 'prepared'
                        ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20'
                        : effectiveLabStatus === 'processing'
                        ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20'
                        : effectiveLabStatus === 'inside'
                        ? 'bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-500/20 animate-pulse'
                        : 'bg-teal-500/10 text-teal-800 dark:text-teal-300 border border-teal-500/20'
                    }`}
                  >
                    {effectiveLabStatus === 'prepared'
                      ? 'PREPARED'
                      : effectiveLabStatus === 'processing'
                      ? 'PROCESSING'
                      : effectiveLabStatus === 'inside'
                      ? 'CALLED TO BOOTH'
                      : 'LIVE QUEUE'}
                  </span>
                </div>

                {effectiveLabStatus === 'prepared' ? (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-2xl liquid-glass-subtle border-emerald-500/30 text-xs text-emerald-900 dark:text-emerald-300 space-y-1">
                      <div className="font-bold flex items-center space-x-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Certified Diagnostic Report Prepared</span>
                      </div>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        {isReportIdentityVerified
                          ? `✓ Identity verified (${appointment.patientName}). Access and download your digital report below.`
                          : '🔒 Confidential medical report. Verify patient name or mobile number to view or download file.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        onClick={() => handleActionWithAuth('view_report')}
                        className="flex-1 py-2.5 px-4 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-glass-sm active:scale-95 border-t border-white/20"
                      >
                        <Eye className="w-4 h-4" />
                        <span>{isReportIdentityVerified ? 'View Report In-App' : 'Verify & View Report'}</span>
                      </button>

                      <button
                        onClick={() => handleActionWithAuth('download_report')}
                        className="py-2.5 px-4 liquid-glass-subtle text-teal-700 dark:text-teal-300 hover:bg-white/80 dark:hover:bg-slate-800/80 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download PDF</span>
                      </button>
                    </div>
                  </div>
                ) : effectiveLabStatus === 'processing' ? (
                  <div className="p-4 rounded-2xl liquid-glass-subtle border-amber-500/30 text-xs text-amber-900 dark:text-amber-300 space-y-1">
                    <div className="font-bold flex items-center space-x-1.5">
                      <Hourglass className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Sample Collected • Processing in Laboratory</span>
                    </div>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Your biological sample has been received and transferred to the diagnostic chamber. As soon as the certified pathologist signs off, this screen will transition to Prepared and unlock the report file.
                    </p>
                  </div>
                ) : effectiveLabStatus === 'inside' ? (
                  <div className="p-4 rounded-2xl liquid-glass-subtle border-blue-500/30 text-xs text-blue-900 dark:text-blue-300 space-y-1 animate-pulse">
                    <div className="font-bold flex items-center space-x-1.5">
                      <BellRing className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Called to Phlebotomy / Sample Collection Booth</span>
                    </div>
                    <p className="text-[11px] text-blue-700 dark:text-blue-400">
                      Please proceed immediately into the collection cabin. The phlebotomist is ready to collect your biological sample.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl liquid-glass-subtle border-teal-500/30 text-xs text-teal-900 dark:text-teal-300 space-y-1">
                    <div className="font-bold flex items-center space-x-1.5">
                      <FlaskConical className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span>Waiting in Queue for Sample Collection</span>
                    </div>
                    <p className="text-[11px] text-teal-700 dark:text-teal-400">
                      Please present your token #{appointment.queueNumber || 1} at the phlebotomy collection counter.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 10. RESCHEDULE & CANCEL ACTIONS */}
            {!isCalledInsideOrDone ? (
              <div className="flex items-center justify-between text-xs pt-2">
                <button
                  onClick={() => handleActionWithAuth('reschedule')}
                  className="font-bold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition cursor-pointer flex items-center space-x-1 active:scale-95"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Reschedule Visit</span>
                </button>

                <button
                  onClick={() => handleActionWithAuth('cancel')}
                  className="font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition cursor-pointer active:scale-95"
                >
                  Cancel Appointment
                </button>
              </div>
            ) : appointment?.clinicId ? (
              <div className="flex items-center justify-between text-xs pt-2">
                <button
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate('clinic-detail', {
                        clinicId: appointment.clinicId,
                        doctorId: appointment.doctorId,
                        trackingCode: appointment.trackingCode10Digit,
                        isReschedule: false,
                      })
                    }
                  }}
                  className="font-bold text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 transition cursor-pointer flex items-center space-x-1.5 active:scale-95 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Book Free Follow-Up Visit</span>
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECURITY VERIFICATION MODAL                                               */}
      {/* ========================================================================= */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-3.5 sm:space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-bold text-sm sm:text-base">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600 dark:text-teal-400" />
                <span>Patient Identity Verification</span>
              </div>
              <button
                onClick={() => setShowVerificationModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              For privacy and medical data protection, please enter the registered 10-digit mobile number for this booking.
            </p>

            <form onSubmit={handleVerifySubmit} className="space-y-3">
              <input
                type="tel"
                value={verificationInput}
                onChange={(e) => setVerificationInput(e.target.value)}
                placeholder="Enter 10-digit mobile number (e.g. 98XXXXXXXX)..."
                className="w-full px-3.5 sm:px-4 py-2.5 sm:py-3 liquid-glass-input rounded-xl font-bold text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />

              {verifyError && (
                <p className="text-xs text-rose-600 font-bold">{verifyError}</p>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowVerificationModal(false)}
                  className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold liquid-glass-subtle text-slate-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800/80 cursor-pointer active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl text-xs font-bold shadow-glass-sm cursor-pointer active:scale-95 border-t border-white/20"
                >
                  Verify & Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* IN-APP LAB REPORT FILE VIEWER MODAL                                       */}
      {/* ========================================================================= */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="liquid-glass-modal rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200/50 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                  {selectedReportToView?.testName || 'Diagnostic Pathology Report'}
                </h3>
                <span className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500">
                  Patient: {appointment?.patientName} • Token #{appointment?.queueNumber || 1}
                </span>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedReportToView?.reportFileUrl ? (
              <div className="space-y-3">
                <div className="p-3.5 sm:p-4 liquid-glass-subtle rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-teal-600 dark:text-teal-400 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                        Official Signed Lab Report
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                        File Type: PDF / Digital Image
                      </span>
                    </div>
                  </div>
                  <a
                    href={selectedReportToView.reportFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 shadow-glass-sm active:scale-95 border-t border-white/20"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </a>
                </div>

                <div className="w-full h-64 sm:h-80 rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 bg-slate-900/20 flex items-center justify-center">
                  <iframe
                    src={selectedReportToView.reportFileUrl}
                    title="Lab Report Document"
                    className="w-full h-full"
                  />
                </div>
              </div>
            ) : (
              <div className="p-6 sm:p-8 text-center space-y-2 liquid-glass-subtle rounded-2xl">
                <FileText className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-teal-600 dark:text-teal-400" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Diagnostic Report Prepared in Center
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  Your physical certified test report is prepared and signed by the pathologist at {clinic?.name || 'the clinic desk'}. A digital scan will synchronize directly to this portal.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRESCRIPTION & BILL MODAL                                                 */}
      {/* ========================================================================= */}
      {showPrescriptionModal && (() => {
        const hasLinked = linkedConsultations && linkedConsultations.isLinked
        const activeAppt =
          (selectedPrescriptionApptId &&
            linkedConsultations?.allConsultations.find((a) => a.id === selectedPrescriptionApptId)) ||
          appointment

        const apptDoctor = activeAppt?.doctor || doctor
        const apptClinic = activeAppt?.clinic || clinic

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
            <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200/50 dark:border-white/10 pb-3">
                <div className="flex items-center space-x-2">
                  <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    Prescription & Billing Documents
                  </h3>
                </div>
                <button
                  onClick={() => setShowPrescriptionModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full cursor-pointer transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Consultation Tab Switcher if multiple visits exist */}
              {hasLinked && linkedConsultations.allConsultations.length > 1 && (
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  {linkedConsultations.allConsultations.map((cAppt, idx) => {
                    const isSelected = (activeAppt?.id || appointment?.id) === cAppt.id
                    return (
                      <button
                        key={cAppt.id}
                        type="button"
                        onClick={() => setSelectedPrescriptionApptId(cAppt.id)}
                        className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-200 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        {idx === 0 ? '1. Initial Visit' : '2. Follow-Up Visit'}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="space-y-3 text-xs">
                <div className="p-3 liquid-glass-subtle rounded-xl space-y-1">
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                    <span>Patient Name:</span>
                    <span>{activeAppt?.patientName}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Facility:</span>
                    <span>{apptClinic?.name || 'OPD Clinic'}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Attending Doctor:</span>
                    <span>{apptDoctor?.fullName || 'OPD Specialist'}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Visit Date & Time:</span>
                    <span>{activeAppt?.appointmentDate} • {activeAppt?.appointmentTime || '10:00 AM'}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Tracking Token:</span>
                    <span className="font-mono font-bold text-teal-600 dark:text-teal-400">#{activeAppt?.trackingCode10Digit}</span>
                  </div>
                </div>

                <div className="p-3 liquid-glass-subtle border-emerald-500/30 text-emerald-900 dark:text-emerald-300 rounded-xl space-y-1">
                  <div className="flex justify-between font-bold text-sm">
                    <span>Total Consultation Fee:</span>
                    <span>NPR {activeAppt?.feeAmount ?? 500}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-emerald-700 dark:text-emerald-400">
                    <span>Payment Status:</span>
                    <span className="font-bold uppercase">{activeAppt?.paymentStatus || 'Paid'}</span>
                  </div>
                </div>

                {activeAppt?.notes && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">
                    <strong className="text-slate-800 dark:text-slate-200">Clinical Remarks & Instructions:</strong>
                    <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{activeAppt.notes}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons: Download Bill, Download Prescription, Close */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                {activeAppt && (
                  <>
                    <button
                      type="button"
                      onClick={() => printAppointmentBill(activeAppt)}
                      className="w-full sm:w-1/2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-glass-sm active:scale-95"
                    >
                      <Receipt className="w-4 h-4 text-teal-400" />
                      <span>Download Bill</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => printPrescription(activeAppt)}
                      className="w-full sm:w-1/2 py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-glass-sm active:scale-95"
                    >
                      <Stethoscope className="w-4 h-4 text-white" />
                      <span>Download Rx</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowPrescriptionModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 liquid-glass-subtle text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer active:scale-95"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ========================================================================= */}
      {/* RESCHEDULE DATE MODAL                                                     */}
      {/* ========================================================================= */}
      {showRescheduleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="liquid-glass-modal rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200/50 dark:border-white/10 pb-3">
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">Reschedule Consultation</h3>
              <button
                onClick={() => setShowRescheduleModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReschedule} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Select New Date</label>
                <input
                  type="date"
                  min={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' })}
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3.5 sm:px-4 py-2.5 liquid-glass-input rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              {rescheduleMsg && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold">{rescheduleMsg}</p>
              )}

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRescheduleModal(false)}
                  className="px-3.5 sm:px-4 py-2 text-xs font-bold liquid-glass-subtle text-slate-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800/80 rounded-xl cursor-pointer active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduleProcessing}
                  className="px-4 sm:px-5 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white text-xs font-bold rounded-xl shadow-glass-sm cursor-pointer active:scale-95 border-t border-white/20"
                >
                  {rescheduleProcessing ? 'Saving...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
