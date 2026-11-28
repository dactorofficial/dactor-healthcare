import React, { useState } from 'react'
import { Lock, Phone, X, AlertCircle } from 'lucide-react'
import {
  getCurrentLoggedInUserEmail,
  getReportPhoneRateLimitState,
  recordReportPhoneAttempt,
  clearReportPhoneRateLimit,
  verifyAppointmentOwnership,
} from '../services/db'
import { markTrackingCodeVerified } from '../utils/appointmentOwnershipGuard'

export type ProtectedWebAction = 'download_bill' | 'book_followup' | 'reschedule'

interface IdentityVerifyModalProps {
  isOpen: boolean
  trackingCode: string
  actionType: ProtectedWebAction
  onClose: () => void
  onVerified: (verifiedPhone: string) => void
}

export const IdentityVerifyModal: React.FC<IdentityVerifyModalProps> = ({
  isOpen,
  trackingCode,
  actionType,
  onClose,
  onVerified,
}) => {
  const [phoneInput, setPhoneInput] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [verifying, setVerifying] = useState(false)

  if (!isOpen) return null

  const cleanCode = (trackingCode || '').trim().toUpperCase()
  const actionLabel =
    actionType === 'download_bill'
      ? 'download this bill'
      : actionType === 'book_followup'
      ? 'book a follow-up'
      : 'reschedule this appointment'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanPhone = phoneInput.replace(/\D/g, '')
    if (cleanPhone.length !== 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number.')
      return
    }
    const rl = getReportPhoneRateLimitState(cleanCode)
    if (rl.isLocked) {
      setErrorMsg(`Too many failed attempts. Try again in ${Math.ceil(rl.remainingSeconds / 60)} minute(s).`)
      return
    }

    setVerifying(true)
    setErrorMsg('')
    try {
      const loggedEmail = getCurrentLoggedInUserEmail()
      const res = await verifyAppointmentOwnership(cleanCode, loggedEmail, cleanPhone, true)
      if (res.allowed) {
        clearReportPhoneRateLimit(cleanCode)
        markTrackingCodeVerified(cleanCode, cleanPhone)
        setPhoneInput('')
        onVerified(cleanPhone)
      } else if (res.reason === 'gmail_mismatch') {
        setErrorMsg(res.message || 'This tracking code belongs to another Gmail account.')
      } else if (res.reason === 'rate_limited') {
        setErrorMsg('Too many failed attempts. Verification locked for 15 minutes.')
      } else {
        const updated = recordReportPhoneAttempt(cleanCode, false)
        setErrorMsg(
          updated.isLocked
            ? 'Too many failed attempts. Verification locked for 15 minutes.'
            : `Mobile number does not match this tracking code. (${updated.remainingAttempts} attempts left)`
        )
      }
    } catch {
      setErrorMsg('Verification failed. Please check your connection and try again.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-600 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Verify Mobile Number
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tracking Code #{cleanCode}
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
          To {actionLabel}, please enter the 10-digit mobile number associated with this tracking code.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Phone className="w-4 h-4 text-sky-600 absolute left-3.5 top-3.5" />
            <input
              type="tel"
              maxLength={10}
              value={phoneInput}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                setPhoneInput(digits)
                setErrorMsg('')
              }}
              placeholder="98XXXXXXXX"
              className="w-full pl-10 pr-4 py-2.5 text-sm font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              autoFocus
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={verifying}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={phoneInput.length !== 10 || verifying}
              className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-xl cursor-pointer"
            >
              {verifying ? 'Verifying...' : 'Verify & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
