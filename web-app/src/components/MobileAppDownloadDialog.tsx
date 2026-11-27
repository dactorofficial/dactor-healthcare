import React, { useEffect, useState } from 'react'
import { Smartphone, X, Download, ShieldCheck, ArrowRight } from 'lucide-react'

interface MobileAppDownloadDialogProps {
  activeTab: string
  blockedByOtherModal?: boolean
}

const PATIENT_APP_URL = 'https://play.google.com/store/apps/details?id=com.dactor.patient'
const CLINIC_APP_URL = 'https://play.google.com/store/apps/details?id=com.dactor.clinic'
const DISMISS_KEY = 'dactor_mobile_app_prompt_dismissed'

function isMobileBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  const isNarrow = window.innerWidth <= 820
  return isMobileUa || isNarrow
}

/**
 * Cancellable mobile popup encouraging mobile web visitors to install the
 * Dactor Patient App across general/patient pages, or the Dactor Clinic & Doctor
 * App exclusively inside the Clinic Portal or Doctor Portal.
 */
export const MobileAppDownloadDialog: React.FC<MobileAppDownloadDialogProps> = ({
  activeTab,
  blockedByOtherModal = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)

  const isClinicOrDoctorPortal =
    activeTab === 'portal' ||
    activeTab === 'doctor-portal'

  const targetApp = isClinicOrDoctorPortal
    ? {
        title: 'Dactor Clinic & Doctor App',
        subtitle: 'Manage live OPD queues, patient billing, lab workflows & doctor desk alerts faster on Android.',
        cta: 'Download Clinic App',
        url: CLINIC_APP_URL,
        badge: 'CLINIC & DOCTOR PORTAL',
      }
    : {
        title: 'Dactor Patient App',
        subtitle: 'Book OPD appointments, track your live queue token in real time, and get instant turn alerts on your phone.',
        cta: 'Download Patient App',
        url: PATIENT_APP_URL,
        badge: 'RECOMMENDED ON MOBILE',
      }

  useEffect(() => {
    if (blockedByOtherModal) return
    if (!isMobileBrowser()) return
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return
    } catch {}

    const timer = window.setTimeout(() => {
      setIsOpen(true)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [blockedByOtherModal, activeTab])

  const handleDismiss = () => {
    setIsOpen(false)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {}
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-app-download-title"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Close app download dialog"
          className="absolute top-3 right-3 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <span className="inline-block text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 mb-1">
                {targetApp.badge}
              </span>
              <h3 id="mobile-app-download-title" className="text-lg font-extrabold text-slate-900 leading-tight">
                {targetApp.title}
              </h3>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            {targetApp.subtitle}
          </p>

          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-5">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Official Google Play release • Free &amp; lightweight</span>
          </div>

          <div className="flex flex-col gap-2.5">
            <a
              href={targetApp.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDismiss}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm shadow-sm transition"
            >
              <Download className="w-4 h-4" />
              <span>{targetApp.cta}</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={handleDismiss}
              className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-sm transition"
            >
              Continue on Web
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
