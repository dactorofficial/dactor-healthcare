import React, { useState, useEffect } from 'react'
import {
  X,
  Search,
  FileText,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  ShieldCheck,
  AlertCircle,
  FlaskConical,
  ExternalLink,
} from 'lucide-react'
import {
  getLabReportsByTrackingCode,
  getAppointmentByTrackingCode,
  requestGuestLabReportResult,
  requestDirectLabReportUrl,
  requestAuthorizedDocumentUrl,
  isUserMatchingPatientEmail,
  getCurrentLoggedInUserEmail,
  getReportPhoneRateLimitState,
  clearReportPhoneRateLimit,
  MAX_REPORT_PHONE_ATTEMPTS,
} from '../services/db'
import { LabReport, Appointment } from '../types'

interface LabReportModalProps {
  isOpen: boolean
  onClose: () => void
  initialCode?: string
}

export const LabReportModal: React.FC<LabReportModalProps> = ({
  isOpen,
  onClose,
  initialCode = '',
}) => {
  const [code, setCode] = useState(initialCode)
  const [loading, setLoading] = useState(false)
  const [reports, setReports] = useState<LabReport[]>([])
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [searched, setSearched] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Server-side verification & Direct Access state
  const [verifyPhoneInput, setVerifyPhoneInput] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [directAccessEmail, setDirectAccessEmail] = useState<string | null>(null)

  // Rate limiting state
  const [rateLimitState, setRateLimitState] = useState(() => getReportPhoneRateLimitState(initialCode))
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  // Preview modal state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewType, setPreviewType] = useState<string>('pdf')

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          const fresh = getReportPhoneRateLimitState(code)
          setRateLimitState(fresh)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownSeconds, code])

  if (!isOpen) return null

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const clean = code.trim().replace(/\D/g, '')
    if (clean.length < 5) {
      setErrorMsg('Please enter a valid tracking code.')
      return
    }

    setLoading(true)
    setErrorMsg('')
    setVerifyError('')
    setIsVerified(false)
    setVerifyPhoneInput('')
    setSignedUrl(null)
    setDirectAccessEmail(null)

    const freshRateLimit = getReportPhoneRateLimitState(clean)
    setRateLimitState(freshRateLimit)
    setCooldownSeconds(freshRateLimit.remainingSeconds)

    try {
      const [reportsData, apptData] = await Promise.all([
        getLabReportsByTrackingCode(clean),
        getAppointmentByTrackingCode(clean),
      ])

      setReports(reportsData)
      setAppointment(apptData)
      setSearched(true)

      if (reportsData.length === 0 && !apptData) {
        setErrorMsg('No diagnostic record found for this tracking code.')
        return
      }

      // Check if patient email matches active logged-in Google user: Direct Access without confirmation!
      const patientEmail = apptData?.patientEmail
      if (patientEmail && isUserMatchingPatientEmail(patientEmail)) {
        const loggedInEmail = getCurrentLoggedInUserEmail()
        setDirectAccessEmail(loggedInEmail || patientEmail)
        setIsVerified(true)
        clearReportPhoneRateLimit(clean)

        // Directly fetch signed URL without requiring phone input
        let directUrl: string | null = null
        if (reportsData.length > 0 && reportsData[0].id) {
          directUrl = await requestAuthorizedDocumentUrl('lab_report', reportsData[0].id, reportsData[0].reportFileUrl || '')
        }
        if (!directUrl) {
          directUrl = await requestDirectLabReportUrl(clean, loggedInEmail)
        }
        if (directUrl) {
          setSignedUrl(directUrl)
        }
      }
    } catch {
      setErrorMsg('Error retrieving diagnostic report status.')
    } finally {
      setLoading(false)
    }
  }

  // Server-side registered phone verification check with rate limiting
  const handleVerifyPhone = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanCode = code.trim().replace(/\D/g, '')

    const freshLimit = getReportPhoneRateLimitState(cleanCode)
    if (freshLimit.isLocked) {
      setRateLimitState(freshLimit)
      setCooldownSeconds(freshLimit.remainingSeconds)
      setVerifyError(`Too many failed attempts. Verification locked for this tracking code. Please wait ${Math.ceil(freshLimit.remainingSeconds / 60)} minutes.`)
      return
    }

    const cleanPhone = verifyPhoneInput.trim().replace(/\D/g, '')
    if (cleanPhone.length < 7) {
      setVerifyError('Please enter a valid phone number (at least 7 digits) registered during booking.')
      return
    }

    setIsVerifying(true)
    setVerifyError('')

    try {
      const res = await requestGuestLabReportResult(cleanCode, cleanPhone)
      if (res.signedUrl) {
        setSignedUrl(res.signedUrl)
        setIsVerified(true)
        setVerifyError('')
        setRateLimitState(getReportPhoneRateLimitState(cleanCode))
        setCooldownSeconds(0)
      } else {
        const updatedLimit = getReportPhoneRateLimitState(cleanCode)
        setRateLimitState(updatedLimit)
        setCooldownSeconds(updatedLimit.remainingSeconds)
        setVerifyError(res.error || 'Verification failed: Mobile number does not match clinic appointment records.')
      }
    } catch {
      const updatedLimit = getReportPhoneRateLimitState(cleanCode)
      setRateLimitState(updatedLimit)
      setCooldownSeconds(updatedLimit.remainingSeconds)
      setVerifyError('Server verification error. Please try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'sample_collected':
        return {
          label: 'Sample Collected',
          desc: 'Your specimen has been collected at the clinic and forwarded to the diagnostic laboratory.',
          badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
          icon: FlaskConical,
        }
      case 'processing':
        return {
          label: 'Processing in Lab',
          desc: 'Your diagnostic sample is currently in laboratory processing and pathology analysis.',
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse',
          icon: Clock,
        }
      case 'prepared':
      case 'delivered':
        return {
          label: 'Prepared & Ready',
          desc: 'Your certified lab report is ready. Verify your registered patient name below to view or download.',
          badgeClass: 'bg-brand-100 text-brand-800 border-brand-200',
          icon: CheckCircle2,
        }
      default:
        return {
          label: 'Booking Received',
          desc: 'Appointment registered. Awaiting sample collection at clinic reception.',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
          icon: Clock,
        }
    }
  }

  // Determine current active status
  const currentStatus =
    reports.length > 0
      ? reports[0].status
      : appointment?.checkinStatus === 'completed'
      ? 'prepared'
      : appointment?.checkinStatus === 'in_consultation'
      ? 'processing'
      : 'sample_collected'

  const statusInfo = getStatusDisplay(currentStatus)
  const StatusIcon = statusInfo.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/45 backdrop-blur-md animate-in fade-in duration-200">
      <div className="liquid-glass-modal rounded-2xl sm:rounded-3xl max-w-xl w-full p-4 sm:p-8 shadow-glass-modal border border-white/80 relative max-h-[92vh] overflow-y-auto">
        {/* Specular Perimeter Line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] rounded-t-3xl bg-gradient-to-r from-transparent via-white/80 to-transparent" aria-hidden="true" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 sm:top-5 right-4 sm:right-5 p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 bg-white/60 hover:bg-white/90 border border-white/60 rounded-full transition-colors cursor-pointer shadow-glass-sm"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3 mb-5 sm:mb-6 pr-8">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-teal-50/80 text-teal-700 flex items-center justify-center border border-teal-200/50 shadow-glass-sm backdrop-blur-md shrink-0">
            <FlaskConical className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Diagnostic Lab Reports</h3>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
              3-Stage live status & name-verified report retrieval
            </p>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSearch} className="space-y-3 sm:space-y-4">
          <div className="relative">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 10-digit code (e.g. 9812345678)"
              maxLength={10}
              className="w-full px-3.5 sm:px-4 py-3 sm:py-3.5 pl-10 sm:pl-11 text-base sm:text-lg font-bold tracking-widest text-slate-900 liquid-glass-input rounded-2xl transition-all placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 font-mono shadow-glass-sm"
              autoFocus
            />
            <Search className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600 absolute left-3.5 top-3.5 sm:top-4" />
          </div>

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full py-3 sm:py-3.5 bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 hover:brightness-105 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-md shadow-teal-600/20 border border-white/30 flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.98] text-xs sm:text-sm"
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                <span>Checking Lab Status...</span>
              </span>
            ) : (
              <span>Track Lab Status</span>
            )}
          </button>
        </form>

        {errorMsg && (
          <div className="mt-4 p-3.5 bg-rose-50/80 border border-rose-200/70 text-rose-700 rounded-2xl text-xs flex items-center space-x-2 backdrop-blur-md shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Result Area */}
        {searched && (reports.length > 0 || appointment) && (
          <div className="mt-6 space-y-5 animate-in slide-in-from-bottom duration-200">
            {/* 3-Stage Progress Indicator */}
            <div className="liquid-glass-base p-4 rounded-3xl border border-white/80 shadow-glass-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Diagnostic Pipeline
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusInfo.badgeClass}`}
                >
                  <StatusIcon className="w-3.5 h-3.5 mr-1" />
                  {statusInfo.label}
                </span>
              </div>

              {/* Progress Steps */}
              <div className="grid grid-cols-3 gap-2 relative mt-2">
                {/* Step 1: Collected */}
                <div
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    currentStatus === 'sample_collected' ||
                    currentStatus === 'processing' ||
                    currentStatus === 'prepared' ||
                    currentStatus === 'delivered'
                      ? 'bg-brand-50 border-brand-300 text-brand-800'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase">Step 1</div>
                  <div className="text-xs font-bold mt-0.5">Sample Collected</div>
                </div>

                {/* Step 2: Processing */}
                <div
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    currentStatus === 'processing' ||
                    currentStatus === 'prepared' ||
                    currentStatus === 'delivered'
                      ? currentStatus === 'processing'
                        ? 'bg-blue-50 border-blue-400 text-blue-800 ring-2 ring-blue-300'
                        : 'bg-brand-50 border-brand-300 text-brand-800'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase">Step 2</div>
                  <div className="text-xs font-bold mt-0.5">Processing</div>
                </div>

                {/* Step 3: Prepared */}
                <div
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    currentStatus === 'prepared' || currentStatus === 'delivered'
                      ? 'bg-brand-50 border-brand-400 text-brand-800 ring-2 ring-brand-300'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase">Step 3</div>
                  <div className="text-xs font-bold mt-0.5">Report Prepared</div>
                </div>
              </div>

              <p className="text-xs text-slate-600 mt-3 font-medium bg-white p-2.5 rounded-xl border border-slate-100">
                {statusInfo.desc}
              </p>
            </div>

            {/* If Status is PREPARED: Direct Google Access or Require Phone Verification before Viewing/Downloading */}
            {(currentStatus === 'prepared' || currentStatus === 'delivered') && (
              <div className="bg-brand-50/70 border border-brand-200 p-5 rounded-2xl space-y-4">
                {directAccessEmail ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center space-x-2 text-emerald-900 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Direct Access Granted: Verified with Google ({directAccessEmail})</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-2 text-brand-900 font-bold text-sm">
                      <ShieldCheck className="w-5 h-5 text-brand-600" />
                      <span>Confidentiality: Mobile Number Verification Required</span>
                    </div>
                    <p className="text-xs text-slate-600">
                      To safeguard personal medical information, please verify the registered patient's mobile number before accessing the report file.
                    </p>
                  </>
                )}

                {!isVerified ? (
                  <form onSubmit={handleVerifyPhone} className="space-y-3">
                    <div>
                      <input
                        type="tel"
                        value={verifyPhoneInput}
                        onChange={(e) => setVerifyPhoneInput(e.target.value)}
                        placeholder="Enter Registered Mobile Number (e.g. 9841234567)"
                        disabled={rateLimitState.isLocked}
                        className="w-full px-3.5 py-2.5 bg-white border border-brand-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:bg-slate-100"
                      />
                    </div>
                    {verifyError && (
                      <p className="text-xs text-rose-600 font-medium">{verifyError}</p>
                    )}
                    {rateLimitState.isLocked ? (
                      <div className="p-2.5 bg-rose-100 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold flex items-center justify-between">
                        <span>Rate limit exceeded. Too many verification attempts.</span>
                        <span className="font-mono font-bold">
                          {Math.floor(cooldownSeconds / 60)}:{(cooldownSeconds % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                    ) : rateLimitState.attempts > 0 ? (
                      <p className="text-[11px] text-amber-700 font-medium">
                        Attempts remaining: {rateLimitState.remainingAttempts} of {MAX_REPORT_PHONE_ATTEMPTS}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={isVerifying || rateLimitState.isLocked}
                      className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{isVerifying ? 'Verifying with Server...' : rateLimitState.isLocked ? 'Verification Locked' : 'Verify Phone & Unlock Report'}</span>
                    </button>
                  </form>
                ) : (
                  <div className="space-y-3 pt-2">
                    <div className="p-2.5 bg-brand-100/70 border border-brand-300 rounded-xl flex items-center space-x-2 text-brand-900 text-xs font-bold">
                      <CheckCircle2 className="w-4 h-4 text-brand-700" />
                      <span>
                        {directAccessEmail
                          ? `Identity Verified via Google! Patient: ${appointment?.patientName || reports[0]?.patientName}`
                          : `Identity Verified! Patient: ${appointment?.patientName || reports[0]?.patientName}`}
                      </span>
                    </div>

                    {/* Report Files List */}
                    {signedUrl ? (
                      <div className="p-3.5 bg-white rounded-xl border border-brand-200 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">
                              {reports[0]?.testName || 'Diagnostic Lab Report'}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Ready for Download • Server Verified
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          {/* In-app Preview */}
                          <button
                            onClick={() => {
                              setPreviewUrl(signedUrl)
                              setPreviewType(reports[0]?.reportFileType || 'pdf')
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>

                          {/* Direct Download */}
                          <a
                            href={signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center space-x-1 shadow-xs"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-white rounded-xl border border-brand-200 text-xs text-slate-600">
                        <p className="font-semibold text-slate-900">
                          {reports[0]?.testName || 'Diagnostic Test'} marked Prepared.
                        </p>
                        <p className="mt-1">
                          The physical report is ready at the clinic desk, or an electronic copy will be uploaded shortly by the lab technician.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* In-App Preview Lightbox Modal */}
        {previewUrl && (
          <div className="fixed inset-0 z-60 bg-black/80 flex flex-col p-4">
            <div className="flex justify-between items-center text-white mb-2">
              <span className="font-bold text-sm">Lab Report Document Preview</span>
              <button
                onClick={() => setPreviewUrl(null)}
                className="p-1 hover:bg-white/20 rounded-lg text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 bg-white rounded-2xl overflow-hidden relative">
              {previewType === 'image' || previewUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i) ? (
                <img
                  src={previewUrl}
                  alt="Lab Report"
                  className="w-full h-full object-contain p-2"
                />
              ) : (
                <iframe
                  src={previewUrl}
                  title="PDF Preview"
                  className="w-full h-full border-none"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
