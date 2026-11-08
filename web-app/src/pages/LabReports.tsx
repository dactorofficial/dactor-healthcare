import React, { useState, useEffect } from 'react'
import {
  FlaskConical,
  Search,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  ShieldCheck,
  AlertCircle,
  FileText,
  Building2,
  Lock,
} from 'lucide-react'
import { getLabReportsByTrackingCode, getAppointmentByTrackingCode, requestGuestLabReportUrl } from '../services/db'
import { LabReport, Appointment } from '../types'
import { updatePageSEO } from '../utils/seo'

export const LabReports: React.FC = () => {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [reports, setReports] = useState<LabReport[]>([])
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [searched, setSearched] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    updatePageSEO({
      title: 'Retrieve Diagnostic Pathology Lab Reports Online | Dactor Nepal',
      description: 'Track sample collection, testing progress, and securely view or download certified pathology lab reports (MRI, CT Scan, Blood, USG) in Nepal.',
    })
  }, [])

  // Server-side verification state
  const [verifyPhoneInput, setVerifyPhoneInput] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  // Preview modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
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
    try {
      const [reportsData, apptData] = await Promise.all([
        getLabReportsByTrackingCode(clean),
        getAppointmentByTrackingCode(clean),
      ])

      setReports(reportsData)
      setAppointment(apptData)
      setSearched(true)

      if (reportsData.length === 0 && !apptData) {
        setErrorMsg('No diagnostic lab records found matching this tracking code.')
      }
    } catch {
      setErrorMsg('Error retrieving diagnostic report status.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyPhone = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanPhone = verifyPhoneInput.trim().replace(/\D/g, '')
    if (cleanPhone.length < 7) {
      setVerifyError('Please enter a valid mobile number (at least 7 digits) registered during booking.')
      return
    }

    const cleanCode = code.trim().replace(/\D/g, '')
    setIsVerifying(true)
    setVerifyError('')

    try {
      const url = await requestGuestLabReportUrl(cleanCode, cleanPhone)
      if (url) {
        setSignedUrl(url)
        setIsVerified(true)
        setVerifyError('')
      } else {
        setVerifyError('Verification failed: Provided mobile number does not match clinic appointment records.')
      }
    } catch {
      setVerifyError('Verification error communicating with server. Please try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  const currentStatus =
    reports.length > 0
      ? reports[0].status
      : appointment?.checkinStatus === 'completed'
      ? 'prepared'
      : appointment?.checkinStatus === 'in_consultation'
      ? 'processing'
      : 'sample_collected'

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8 pb-28 sm:pb-10">
      {/* Header */}
      <div className="text-center space-y-2 sm:space-y-3">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-500/10 dark:bg-teal-400/10 text-teal-800 dark:text-teal-300 text-[11px] sm:text-xs font-bold uppercase tracking-wider border border-teal-500/20 backdrop-blur-md">
          <FlaskConical className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
          <span>Pathology & Lab Diagnostics</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
          Retrieve Diagnostic Lab Reports
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium max-w-xl mx-auto leading-relaxed">
          Track 3-stage status and securely access verified lab test reports with patient identity verification.
        </p>
      </div>

      {/* Code Input */}
      <div className="max-w-xl mx-auto">
        <form
          onSubmit={handleSearch}
          className="p-1.5 sm:p-2 liquid-glass-elevated rounded-2xl sm:rounded-3xl border-teal-500/30 shadow-glass-elevated flex items-center gap-1.5 sm:gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 10-Digit Code..."
              maxLength={10}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 pl-9 sm:pl-11 text-sm sm:text-lg font-black tracking-wider text-slate-900 dark:text-white bg-transparent focus:outline-none placeholder:text-slate-400 placeholder:font-normal placeholder:tracking-normal"
            />
            <Search className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600 dark:text-teal-400 absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2" />
          </div>
          <button
            type="submit"
            className="px-4 sm:px-6 py-2.5 sm:py-3.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white text-xs sm:text-sm font-bold rounded-xl sm:rounded-2xl shadow-glass-base transition-all shrink-0 cursor-pointer active:scale-95 border-t border-white/20"
          >
            {loading ? 'Checking...' : 'Check Status'}
          </button>
        </form>

        {errorMsg && (
          <div className="mt-2.5 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 rounded-2xl text-xs flex items-center space-x-2 backdrop-blur-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Results Area */}
      {searched && (reports.length > 0 || appointment) && (
        <div className="liquid-glass-elevated rounded-2xl sm:rounded-3xl p-4 sm:p-8 space-y-4 sm:space-y-6 animate-in fade-in duration-200">
          {/* 3-Stage Process Card */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[11px] sm:text-xs">
                Laboratory Processing Status
              </span>
              <span className="font-black font-mono text-slate-800 dark:text-white">
                Code: #{code}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
              <div
                className={`p-2 sm:p-4 rounded-xl sm:rounded-2xl border text-center transition-all ${
                  currentStatus === 'sample_collected' ||
                  currentStatus === 'processing' ||
                  currentStatus === 'prepared' ||
                  currentStatus === 'delivered'
                    ? 'bg-teal-500/15 border-teal-500/30 text-teal-900 dark:text-teal-200 shadow-glass-sm'
                    : 'liquid-glass-subtle text-slate-400 opacity-60'
                }`}
              >
                <div className="text-[9px] sm:text-[10px] font-bold uppercase">Stage 1</div>
                <div className="text-[11px] sm:text-sm font-black mt-0.5 sm:mt-1 leading-tight">Sample Collected</div>
              </div>

              <div
                className={`p-2 sm:p-4 rounded-xl sm:rounded-2xl border text-center transition-all ${
                  currentStatus === 'processing' ||
                  currentStatus === 'prepared' ||
                  currentStatus === 'delivered'
                    ? currentStatus === 'processing'
                      ? 'bg-blue-500/15 border-blue-500/40 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/30 shadow-glass-sm'
                      : 'bg-teal-500/15 border-teal-500/30 text-teal-900 dark:text-teal-200 shadow-glass-sm'
                    : 'liquid-glass-subtle text-slate-400 opacity-60'
                }`}
              >
                <div className="text-[9px] sm:text-[10px] font-bold uppercase">Stage 2</div>
                <div className="text-[11px] sm:text-sm font-black mt-0.5 sm:mt-1 leading-tight">Processing in Lab</div>
              </div>

              <div
                className={`p-2 sm:p-4 rounded-xl sm:rounded-2xl border text-center transition-all ${
                  currentStatus === 'prepared' || currentStatus === 'delivered'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/30 shadow-glass-sm'
                    : 'liquid-glass-subtle text-slate-400 opacity-60'
                }`}
              >
                <div className="text-[9px] sm:text-[10px] font-bold uppercase">Stage 3</div>
                <div className="text-[11px] sm:text-sm font-black mt-0.5 sm:mt-1 leading-tight">Report Prepared</div>
              </div>
            </div>
          </div>

          {/* If Prepared: Phone Verification Unlock */}
          {currentStatus === 'prepared' || currentStatus === 'delivered' ? (
            <div className="p-4 sm:p-6 liquid-glass-subtle rounded-2xl border-emerald-500/30 space-y-3 sm:space-y-4">
              <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-bold text-xs sm:text-sm">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>Patient Mobile Number Verification</span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                To access and download your certified diagnostic report, please confirm the registered patient's mobile number.
              </p>

              {!isVerified ? (
                <form onSubmit={handleVerifyPhone} className="max-w-md space-y-2.5 sm:space-y-3">
                  <input
                    type="tel"
                    value={verifyPhoneInput}
                    onChange={(e) => setVerifyPhoneInput(e.target.value)}
                    placeholder="Enter Registered Mobile Number (e.g. 9841234567)..."
                    className="w-full px-3.5 sm:px-4 py-2 sm:py-2.5 liquid-glass-input rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  {verifyError && (
                    <p className="text-xs text-rose-600 font-bold">{verifyError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={isVerifying}
                    className="w-full sm:w-auto px-5 sm:px-6 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-glass-sm transition-all cursor-pointer active:scale-95 border-t border-white/20"
                  >
                    {isVerifying ? 'Verifying with Server...' : 'Verify & Unlock Report'}
                  </button>
                </form>
              ) : (
                <div className="space-y-3 sm:space-y-4 pt-1 sm:pt-2">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center space-x-2 text-emerald-900 dark:text-emerald-300 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="truncate">Identity Verified: {appointment?.patientName || reports[0]?.patientName}</span>
                  </div>

                  {signedUrl ? (
                    <div className="p-3.5 sm:p-4 liquid-glass-card rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-teal-600 dark:text-teal-400 shrink-0" />
                        <div>
                          <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                            {reports[0]?.testName || 'Diagnostic Report File'}
                          </p>
                          <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                            Uploaded on {new Date(reports[0]?.uploadedAt || Date.now()).toLocaleDateString()} • Server Verified
                          </p>
                        </div>
                      </div>

                      <div className="w-full sm:w-auto flex items-center space-x-2">
                        <a
                          href={signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 shadow-glass-sm active:scale-95 border-t border-white/20"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Report</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 sm:p-4 liquid-glass-subtle rounded-xl text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Your diagnostic report is prepared and ready for collection at the clinic desk. A digital PDF copy will also sync here if uploaded by the lab.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 sm:p-4 liquid-glass-subtle border-blue-500/30 rounded-2xl text-xs text-blue-900 dark:text-blue-300 flex items-start space-x-2.5 sm:space-x-3">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Report Still In Preparation</strong>
                <span className="leading-relaxed text-blue-800 dark:text-blue-300/80">
                  Your diagnostic specimen is being processed. As soon as the certified pathologist signs off, this screen will transition to 'Report Prepared' and allow you to view the file.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
