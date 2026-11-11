import React, { useState, useEffect } from 'react'
import { Navbar } from './components/Navbar'
import { BottomNav } from './components/BottomNav'
import { Footer } from './components/Footer'
import { Home } from './pages/Home'
import { FindClinics } from './pages/FindClinics'
import { ClinicDetail } from './pages/ClinicDetail'
import { LiveQueue } from './pages/LiveQueue'
import { LabReports } from './pages/LabReports'
import { AverageTime } from './pages/AverageTime'
import { ClinicPortal } from './pages/ClinicPortal'
import { PatientPortal } from './pages/PatientPortal'
import { DoctorPortal } from './pages/DoctorPortal'
import { Login } from './pages/Login'
import { Support } from './pages/Support'
import { NotFound } from './pages/NotFound'
import { LiveTrackerModal } from './components/LiveTrackerModal'
import { LabReportModal } from './components/LabReportModal'
import { NotificationModal } from './components/NotificationModal'
import { getPatientNotifications, getDoctorById, getLoggedInUserSession, refreshOnlinePayment } from './services/db'
import { supabase } from './lib/supabase'
import { LiquidAuroraBackground } from './components/glass'

// Helper to normalize tab aliases to canonical router views
export const normalizeTab = (tab: string): string => {
  const clean = (tab || '').toLowerCase().trim().split('?')[0]
  if (
    clean === 'portal' ||
    clean === 'clinic-portal' ||
    clean === 'admin-portal' ||
    clean === 'clinic' ||
    clean === 'tickets' ||
    clean === 'admin-tickets' ||
    clean === 'helpdesk-admin' ||
    clean === 'admin'
  ) {
    return 'portal'
  }
  if (clean === 'doctor' || clean === 'doctor-portal' || clean === 'practitioner') {
    return 'doctor-portal'
  }
  if (
    clean === 'patient' ||
    clean === 'patient-portal' ||
    clean === 'my-health' ||
    clean === 'book' ||
    clean === 'booking' ||
    clean === 'book-appointment'
  ) {
    return 'patient-portal'
  }
  if (clean === 'account' || clean === 'profile') {
    return 'account'
  }
  if (clean === 'records' || clean === 'medical-records') {
    return 'records'
  }
  return clean
}

// Helper to determine initial tab from URL hash, path, or query
const getPrivacyRedirectUrl = (fileName: string): string => {
  if (typeof window === 'undefined') return `./${fileName}`
  const isSubpath = window.location.pathname.toLowerCase().startsWith('/dactor')
  return isSubpath ? `/dactor/${fileName}` : `/${fileName}`
}

const getTabFromUrl = (): string => {
  if (typeof window === 'undefined') return 'home'

  // 1. Check URL query parameters (e.g. ?clinic=123 or ?page=support or ?tab=clinics)
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('clinic') || params.get('clinicId')) return 'clinic-detail'
    if (params.get('doctor') || params.get('doctorId')) return 'clinic-detail'
    // Handle OAuth redirect params (Google / Supabase OAuth return)
    const oauthCode = params.get('code')
    const hasOAuthParams =
      params.get('state') ||
      params.get('oauth_token') ||
      (oauthCode && !/^\d{10}$/.test(oauthCode))

    if (hasOAuthParams) {
      try {
        const target = sessionStorage.getItem('dactor_oauth_target_portal') || localStorage.getItem('dactor_oauth_target_portal')
        sessionStorage.removeItem('dactor_oauth_target_portal')
        localStorage.removeItem('dactor_oauth_target_portal')
        if (target === 'clinic') return 'portal'
        if (target === 'doctor') return 'doctor-portal'
        if (target === 'account') return 'account'
        if (target === 'records') return 'records'
        if (target === 'patient-portal' || target === 'patient') return 'patient-portal'
      } catch {}
      return 'portal'
    }

    if ((oauthCode && /^\d{10}$/.test(oauthCode)) || params.get('track')) return 'live-queue'
    if (params.get('q') || params.get('search') || params.get('specialty')) return 'clinics'
    if (!params.get('clinic') && (params.get('payment_result') || params.get('appointmentId') || params.get('appointment_id'))) return 'patient-portal'

    const tabParam = params.get('tab') || params.get('page')
    if (tabParam) {
      const cleanParam = tabParam.toLowerCase().trim()
      if (cleanParam === 'privacy-clinic' || cleanParam === 'clinic-privacy') {
        window.location.href = getPrivacyRedirectUrl('privacy-clinic.html')
        return 'home'
      }
      if (cleanParam === 'privacy-patient' || cleanParam === 'patient-privacy' || cleanParam === 'privacy') {
        window.location.href = getPrivacyRedirectUrl('privacy-patient.html')
        return 'home'
      }
      if (
        cleanParam === 'data-deletion' ||
        cleanParam === 'account-deletion' ||
        cleanParam === 'delete-account' ||
        cleanParam === 'deletion'
      ) {
        window.location.href = getPrivacyRedirectUrl('data-deletion.html')
        return 'home'
      }
      if (cleanParam === 'login' || cleanParam === 'signin' || cleanParam === 'auth') return 'login'
      if (cleanParam === 'support' || cleanParam === 'contact' || cleanParam === 'helpdesk') return 'support'
      if (cleanParam === 'patient' || cleanParam === 'patient-portal' || cleanParam === 'my-health') return 'patient-portal'
      if (cleanParam === 'records' || cleanParam === 'medical-records') return 'records'
      if (cleanParam === 'account' || cleanParam === 'profile') return 'account'
      if (cleanParam === 'doctor' || cleanParam === 'doctor-portal' || cleanParam === 'practitioner') return 'doctor-portal'
      if (cleanParam === 'portal' || cleanParam === 'admin-portal' || cleanParam === 'clinic-portal' || cleanParam === 'clinic') return 'portal'
      if (cleanParam === 'clinics') return 'clinics'
      if (cleanParam === 'clinic-detail') return 'clinic-detail'
      if (cleanParam === 'lab-reports' || cleanParam === 'reports') return 'lab-reports'
      if (cleanParam === 'average-time' || cleanParam === 'wait-time') return 'average-time'
      if (cleanParam === 'live-queue' || cleanParam === 'queue') return 'live-queue'
      if (cleanParam === 'home') return 'home'
      return '404'
    }
  } catch {}

  // 2. Check URL Hash (e.g. #clinics, #live-queue, #records, #account)
  const rawHash = window.location.hash.toLowerCase()
  if (rawHash) {
    const hash = rawHash.replace(/^#\/?/, '').replace(/\/$/, '').split('?')[0]
    if (hash === '' || hash === 'home') return 'home'
    if (hash === 'privacy-clinic' || hash === 'clinic-privacy') {
      window.location.href = getPrivacyRedirectUrl('privacy-clinic.html')
      return 'home'
    }
    if (hash === 'privacy-patient' || hash === 'patient-privacy' || hash === 'privacy') {
      window.location.href = getPrivacyRedirectUrl('privacy-patient.html')
      return 'home'
    }
    if (
      hash === 'data-deletion' ||
      hash === 'account-deletion' ||
      hash === 'delete-account' ||
      hash === 'deletion'
    ) {
      window.location.href = getPrivacyRedirectUrl('data-deletion.html')
      return 'home'
    }
    if (hash === 'login' || hash === 'signin' || hash === 'auth') return 'login'
    if (hash === 'support' || hash === 'contact' || hash === 'helpdesk') return 'support'
    if (
      hash === 'patient' ||
      hash === 'patient-portal' ||
      hash === 'my-health' ||
      hash === 'book' ||
      hash === 'booking' ||
      hash === 'book-appointment'
    )
      return 'patient-portal'
    if (hash === 'records') return 'records'
    if (hash === 'account' || hash === 'profile') return 'account'
    if (hash === 'doctor' || hash === 'doctor-portal' || hash === 'practitioner') return 'doctor-portal'
    if (
      hash === 'portal' ||
      hash === 'admin-portal' ||
      hash === 'clinic-portal' ||
      hash === 'clinic' ||
      hash === 'tickets' ||
      hash === 'admin-tickets' ||
      hash === 'helpdesk-admin' ||
      hash === 'admin'
    )
      return 'portal'
    if (hash === 'clinics') return 'clinics'
    if (hash === 'clinic-detail' || hash.startsWith('clinic')) return 'clinic-detail'
    if (hash === 'lab-reports' || hash === 'reports') return 'lab-reports'
    if (hash === 'average-time' || hash === 'wait-time') return 'average-time'
    if (hash === 'live-queue' || hash === 'queue') return 'live-queue'
    if (hash.includes('access_token') || hash.includes('id_token') || hash.includes('code=') || hash.includes('state=')) {
      try {
        const target = localStorage.getItem('dactor_oauth_target_portal') || sessionStorage.getItem('dactor_oauth_target_portal')
        if (target === 'clinic') return 'portal'
        if (target === 'doctor') return 'doctor-portal'
        if (target === 'account') return 'account'
        if (target === 'records') return 'records'
        if (target === 'patient' || target === 'patient-portal') return 'patient-portal'
      } catch {}
      return 'portal'
    }
    if (hash === '404' || hash === 'not-found' || hash === 'error') return '404'

    // If an unknown hash was specifically navigated to, it is a 404 broken link!
    return '404'
  }

  // 3. Check pathname (e.g. /support, /clinics, /records, /account)
  let path = window.location.pathname.toLowerCase().replace(/\/$/, '')
  // Support GitHub Pages project subpath /dactor or /dactor/
  if (path === '/dactor' || path === '/dactor/index.html' || path === '/dactor/index') {
    path = ''
  } else if (path.startsWith('/dactor/')) {
    path = path.slice('/dactor'.length).replace(/\/$/, '')
  }

  if (!path || path === '' || path === '/' || path === '/index.html' || path === '/index') return 'home'

  if (path.includes('privacy-clinic') || path.includes('privacy/clinic')) {
    window.location.href = getPrivacyRedirectUrl('privacy-clinic.html')
    return 'home'
  }
  if (path.includes('privacy-patient') || path.includes('privacy/patient')) {
    window.location.href = getPrivacyRedirectUrl('privacy-patient.html')
    return 'home'
  }
  if (
    path.includes('data-deletion') ||
    path.includes('account-deletion') ||
    path.includes('delete-account')
  ) {
    window.location.href = getPrivacyRedirectUrl('data-deletion.html')
    return 'home'
  }

  if (path.includes('login') || path.includes('signin') || path.includes('auth')) return 'login'
  if (path.includes('support') || path.includes('contact') || path.includes('helpdesk')) return 'support'
  if (path.includes('records')) return 'records'
  if (path.includes('account') || path.includes('profile')) return 'account'
  if (
    path.includes('patient') ||
    path.includes('my-health') ||
    path.includes('book') ||
    path.includes('booking')
  )
    return 'patient-portal'
  if (path.includes('doctor') || path.includes('practitioner')) return 'doctor-portal'
  if (
    path.includes('admin-portal') ||
    path.includes('/portal') ||
    path.includes('clinic-portal') ||
    path.includes('tickets') ||
    path.includes('admin')
  )
    return 'portal'
  if (path.includes('clinics')) return 'clinics'
  if (path.includes('lab-reports')) return 'lab-reports'
  if (path.includes('average-time')) return 'average-time'
  if (path.includes('live-queue')) return 'live-queue'
  if (path.includes('home')) return 'home'
  if (path.includes('404') || path.includes('not-found')) return '404'

  // Non-empty unknown path is a 404 broken link
  return '404'
}

// Helper to determine active starting tab, auto-redirecting logged-in users to their respective portal
export const getInitialTab = (): string => {
  const tab = getTabFromUrl()
  if (tab !== 'home') {
    return normalizeTab(tab)
  }

  // Check if user explicitly requested to view the landing page (e.g. ?view=home or #home?view=home)
  try {
    const searchParams = new URLSearchParams(window.location.search)
    const hashPart = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''
    const hashParams = new URLSearchParams(hashPart)
    if (
      searchParams.get('stay') === 'home' ||
      searchParams.get('view') === 'home' ||
      hashParams.get('view') === 'home' ||
      hashParams.get('stay') === 'home'
    ) {
      return 'home'
    }
  } catch {}

  // Check if user was in the middle of Google OAuth redirect
  try {
    const oauthTarget = sessionStorage.getItem('dactor_oauth_target_portal')
    if (oauthTarget) {
      sessionStorage.removeItem('dactor_oauth_target_portal')
      localStorage.removeItem('dactor_oauth_target_portal')
      if (oauthTarget === 'clinic') return 'portal'
      if (oauthTarget === 'doctor') return 'doctor-portal'
      if (oauthTarget === 'account') return 'account'
      if (oauthTarget === 'records') return 'records'
      if (oauthTarget === 'patient-portal' || oauthTarget === 'patient') return 'patient-portal'
    }
  } catch {}

  // Auto-redirect logged-in users upon initial load to their respective portal
  const session = getLoggedInUserSession()
  if (session) {
    return session.portalTab
  }

  return 'home'
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>(() => getInitialTab())
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      if (p.get('clinic')) return p.get('clinic')
      if (p.get('clinicId')) return p.get('clinicId')
      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
        return hashParams.get('clinic') || hashParams.get('clinicId') || null
      }
      return null
    } catch {
      return null
    }
  })
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      if (p.get('doctor')) return p.get('doctor')
      if (p.get('doctorId')) return p.get('doctorId')
      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
        return hashParams.get('doctor') || hashParams.get('doctorId') || null
      }
      return null
    } catch {
      return null
    }
  })
  const [autoOpenBooking, setAutoOpenBooking] = useState<boolean>(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      const action = p.get('action') || p.get('intent')
      if (action === 'book' || action === 'appointment' || action === 'reserve') return true
      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
        const hashAction = hashParams.get('action') || hashParams.get('intent')
        return hashAction === 'book' || hashAction === 'appointment' || hashAction === 'reserve'
      }
      return false
    } catch {
      return false
    }
  })
  const [activeTrackingCode, setActiveTrackingCode] = useState<string>(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      return p.get('code') || p.get('track') || ''
    } catch {
      return ''
    }
  })
  const [clinicFilter, setClinicFilter] = useState<string>('all')
  const [rescheduleTrackingCode, setRescheduleTrackingCode] = useState<string>(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      const hp = new URLSearchParams(window.location.hash.split('?')[1] || '')
      return p.get('rescheduleCode') || p.get('followupCode') || hp.get('rescheduleCode') || hp.get('followupCode') || ''
    } catch {
      return ''
    }
  })
  const [isRescheduleMode, setIsRescheduleMode] = useState<boolean>(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      const hp = new URLSearchParams(window.location.hash.split('?')[1] || '')
      return p.get('reschedule') === 'true' || hp.get('reschedule') === 'true'
    } catch {
      return false
    }
  })

  // Global Closed-Tab / Background Payment Reconciler (covers eSewa, Khalti, Fonepay & ConnectIPS)
  useEffect(() => {
    const reconcilePendingSession = async () => {
      try {
        const raw =
          localStorage.getItem('dactor_pending_online_payment') ||
          localStorage.getItem('dactor_pending_esewa_payment')
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (!parsed?.appointmentId || Date.now() - Number(parsed.createdAt || 0) > 86400000) return
        const res = await refreshOnlinePayment(String(parsed.appointmentId), parsed.trackingCode)
        if (res.status === 'complete' && activeTab !== 'clinic-detail' && activeTab !== 'patient-portal') {
          localStorage.removeItem('dactor_pending_online_payment')
          localStorage.removeItem('dactor_pending_esewa_payment')
          if (parsed.trackingCode) setActiveTrackingCode(String(parsed.trackingCode))
          setActiveTab('patient-portal')
        } else if (res.status === 'failed' || res.status === 'expired') {
          localStorage.removeItem('dactor_pending_online_payment')
          localStorage.removeItem('dactor_pending_esewa_payment')
        }
      } catch {}
    }
    reconcilePendingSession()
    const onResume = () => {
      if (document.visibilityState === 'visible') reconcilePendingSession()
    }
    window.addEventListener('focus', onResume)
    document.addEventListener('visibilitychange', onResume)
    return () => {
      window.removeEventListener('focus', onResume)
      document.removeEventListener('visibilitychange', onResume)
    }
  }, [activeTab])

  // Isolated Authentication State per Active Portal Tab
  const getTabAuthState = (tab: string) => {
    try {
      const normalized = normalizeTab(tab)
      if (normalized === 'portal') {
        const hasClinicPending = Boolean(localStorage.getItem('dactor_pending_verification'))
        const isClinic = localStorage.getItem('dactor_clinic_logged_in') === 'true' || hasClinicPending
        let email = localStorage.getItem('dactor_clinic_email') || null
        if (!email && hasClinicPending) {
          try {
            const parsed = JSON.parse(localStorage.getItem('dactor_pending_verification')!)
            email = parsed?.email || null
          } catch {}
        }
        return {
          isLoggedIn: isClinic,
          currentUserEmail: isClinic ? email : null,
          authRole: isClinic ? ('clinic_manager' as const) : null,
        }
      }
      if (normalized === 'doctor-portal') {
        const hasDocPending = Boolean(localStorage.getItem('dactor_doctor_pending_kyc'))
        const isDoc =
          (localStorage.getItem('dactor_doctor_logged_in') === 'true' &&
            (Boolean(localStorage.getItem('dactor_doctor_session')) || Boolean(localStorage.getItem('dactor_doctor_email')))) ||
          hasDocPending
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
          isLoggedIn: isDoc,
          currentUserEmail: isDoc ? email : null,
          authRole: isDoc ? ('doctor' as const) : null,
        }
      }
      if (normalized === 'patient-portal' || normalized === 'records' || normalized === 'account') {
        const isPat =
          localStorage.getItem('dactor_patient_logged_in') === 'true' ||
          Boolean(localStorage.getItem('dactor_patient_session')) ||
          Boolean(localStorage.getItem('dactor_patient_email'))
        let email = localStorage.getItem('dactor_patient_email') || null
        if (!email && localStorage.getItem('dactor_patient_session')) {
          try {
            const parsed = JSON.parse(localStorage.getItem('dactor_patient_session')!)
            email = parsed?.email || null
          } catch {}
        }
        return {
          isLoggedIn: isPat,
          currentUserEmail: isPat ? email : null,
          authRole: isPat ? ('patient' as const) : null,
        }
      }
      // Public browsing tabs (home, clinics, support, etc.): check active session across all roles
      const session = getLoggedInUserSession()
      if (session) {
        return {
          isLoggedIn: true,
          currentUserEmail: session.email,
          authRole: session.role,
        }
      }
      return { isLoggedIn: false, currentUserEmail: null, authRole: null }
    } catch {
      return { isLoggedIn: false, currentUserEmail: null, authRole: null }
    }
  }

  const initialTabAuth = getTabAuthState(getInitialTab())
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(initialTabAuth.isLoggedIn)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(initialTabAuth.currentUserEmail)
  const [authRole, setAuthRole] = useState<'clinic_manager' | 'doctor' | 'patient' | null>(initialTabAuth.authRole)

  // Live unread notification count from Supabase (never hardcoded)
  const [unreadCount, setUnreadCount] = useState<number>(0)

  // Modals
  const [trackerModalOpen, setTrackerModalOpen] = useState(false)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [notificationModalOpen, setNotificationModalOpen] = useState(false)
  const [reportModalInitialCode, setReportModalInitialCode] = useState('')

  const refreshUnreadNotifications = async () => {
    try {
      let trackingCodes: string[] = []
      let userId: string | undefined = undefined
      try {
        trackingCodes = JSON.parse(localStorage.getItem('dactor_patient_tracking_codes') || '[]')
        const sessionRaw = localStorage.getItem('dactor_patient_session')
        if (sessionRaw) {
          const parsed = JSON.parse(sessionRaw)
          if (parsed?.id) userId = parsed.id
        }
      } catch {}

      const list = await getPatientNotifications({ userId, trackingCodes })
      setUnreadCount(list.filter((n) => !n.isRead).length)
    } catch {}
  }

  // Initial URL hash synchronization for auto-redirected portal tabs
  useEffect(() => {
    if (activeTab !== 'home' && (!window.location.hash || window.location.hash === '#home' || window.location.hash === '#/')) {
      const session = getLoggedInUserSession()
      if (session && activeTab === session.portalTab) {
        try {
          const url = new URL(window.location.href)
          url.searchParams.delete('tab')
          url.searchParams.delete('page')
          url.searchParams.delete('view')
          window.history.replaceState({}, '', url.toString())
        } catch {}
        window.location.hash = `#${activeTab}`
      }
    }
  }, [])

  // Sync with browser URL hash & Supabase realtime notifications
  useEffect(() => {
    const handleHashChange = () => {
      const rawTab = getTabFromUrl()
      if (rawTab === 'home') {
        let isExplicitHome = false
        try {
          const searchParams = new URLSearchParams(window.location.search)
          const hashPart = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''
          const hashParams = new URLSearchParams(hashPart)
          isExplicitHome =
            searchParams.get('view') === 'home' ||
            searchParams.get('stay') === 'home' ||
            hashParams.get('view') === 'home' ||
            hashParams.get('stay') === 'home'
        } catch {}

        const session = getLoggedInUserSession()
        if (session && !isExplicitHome) {
          handleNavigate(session.portalTab)
          return
        }
      }
      const tab = normalizeTab(rawTab)
      setActiveTab(tab)
      const st = getTabAuthState(tab)
      setIsLoggedIn(st.isLoggedIn)
      setCurrentUserEmail(st.currentUserEmail)
      setAuthRole(st.authRole)
    }

    const syncAuth = () => {
      try {
        const currentTab = getTabFromUrl()
        let isExplicitHome = false
        try {
          const searchParams = new URLSearchParams(window.location.search)
          const hashPart = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''
          const hashParams = new URLSearchParams(hashPart)
          isExplicitHome =
            searchParams.get('view') === 'home' ||
            searchParams.get('stay') === 'home' ||
            hashParams.get('view') === 'home' ||
            hashParams.get('stay') === 'home'
        } catch {}
        const session = getLoggedInUserSession()

        // Auto-redirect to respective portal if on landing page without explicit override
        if (session && currentTab === 'home' && !isExplicitHome) {
          handleNavigate(session.portalTab)
          return
        }

        const st = getTabAuthState(currentTab)
        setIsLoggedIn(st.isLoggedIn)
        setCurrentUserEmail(st.currentUserEmail)
        setAuthRole(st.authRole)
        refreshUnreadNotifications()
      } catch {}
    }

    refreshUnreadNotifications()

    const channel = supabase
      .channel('app-unread-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        refreshUnreadNotifications()
      })
      .subscribe()

    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('storage', syncAuth)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('storage', syncAuth)
      supabase.removeChannel(channel)
    }
  }, [])

  // Resolve clinic if only doctor ID was provided in URL (e.g. direct Google Search or AI overview link)
  useEffect(() => {
    if (selectedDoctorId && !selectedClinicId) {
      let isMounted = true
      getDoctorById(selectedDoctorId).then((doc) => {
        if (isMounted && doc?.clinicId) {
          setSelectedClinicId(doc.clinicId)
        }
      })
      return () => {
        isMounted = false
      }
    }
  }, [selectedDoctorId, selectedClinicId])

  // Navigation handler with deep link support
  const handleNavigate = (tab: string, params?: any) => {
    const targetTab = normalizeTab(tab)

    if (targetTab === 'home') {
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('clinic')
        url.searchParams.delete('doctor')
        url.searchParams.delete('action')
        url.searchParams.delete('tab')
        url.searchParams.delete('page')
        url.searchParams.set('view', 'home')
        window.history.pushState({}, '', url.toString())
      } catch {}
      window.location.hash = '#home?view=home'
      setActiveTab('home')
      const nextAuth = getTabAuthState('home')
      setIsLoggedIn(nextAuth.isLoggedIn)
      setCurrentUserEmail(nextAuth.currentUserEmail)
      setAuthRole(nextAuth.authRole)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    } else {
      try {
        sessionStorage.removeItem('dactor_explicit_home')
        sessionStorage.removeItem('dactor_allow_home')
      } catch {}
    }

    if (targetTab === 'clinic-detail' && (params?.clinicId || selectedClinicId)) {
      const cId = params?.clinicId || selectedClinicId
      setSelectedClinicId(cId)
      if (params?.doctorId !== undefined) {
        setSelectedDoctorId(params.doctorId || null)
      }
      if (params?.action === 'book' || params?.autoOpenBooking || params?.isReschedule) {
        setAutoOpenBooking(true)
      } else {
        setAutoOpenBooking(false)
      }
      if (params?.trackingCode || params?.followupCode) {
        setRescheduleTrackingCode(params.trackingCode || params.followupCode)
      } else if (params?.resetTrackingCode || !params?.isReschedule) {
        setRescheduleTrackingCode('')
      }
      if (params?.isReschedule !== undefined) {
        setIsRescheduleMode(Boolean(params.isReschedule))
      } else if (params?.resetTrackingCode || !params?.isReschedule) {
        setIsRescheduleMode(false)
      }
      setActiveTab('clinic-detail')
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('clinic', cId!)
        if (params?.doctorId) url.searchParams.set('doctor', params.doctorId)
        else url.searchParams.delete('doctor')
        if (params?.action === 'book') url.searchParams.set('action', 'book')
        else url.searchParams.delete('action')
        if (params?.trackingCode) {
          url.searchParams.set(params.isReschedule ? 'rescheduleCode' : 'followupCode', params.trackingCode)
        } else {
          url.searchParams.delete('rescheduleCode')
          url.searchParams.delete('followupCode')
        }
        if (params?.isReschedule !== undefined) {
          url.searchParams.set('reschedule', String(params.isReschedule))
        } else {
          url.searchParams.delete('reschedule')
        }
        url.searchParams.delete('tab')
        url.searchParams.delete('page')
        window.history.pushState({}, '', url.toString())
      } catch {}
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    if (targetTab === 'clinics' && params?.filter) {
      setClinicFilter(params.filter)
    }

    setActiveTab(targetTab)
    const nextAuth = getTabAuthState(targetTab)
    setIsLoggedIn(nextAuth.isLoggedIn)
    setCurrentUserEmail(nextAuth.currentUserEmail)
    setAuthRole(nextAuth.authRole)

    try {
      const url = new URL(window.location.href)
      if (targetTab === 'home') {
        url.search = ''
      } else {
        url.searchParams.delete('clinic')
        url.searchParams.delete('doctor')
        url.searchParams.delete('action')
        url.searchParams.set('tab', targetTab)
      }
      window.history.pushState({}, '', url.toString())
    } catch {}

    if (window.location.hash !== `#${targetTab}`) {
      window.location.hash = `#${targetTab}`
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Handle logout
  const handleLogout = () => {
    try {
      const activeSession = getLoggedInUserSession()
      const roleToLogout = authRole || activeSession?.role

      if (roleToLogout === 'clinic_manager' || activeTab === 'portal') {
        localStorage.removeItem('dactor_clinic_logged_in')
        localStorage.removeItem('dactor_clinic_email')
        localStorage.removeItem('dactor_clinic_role')
        localStorage.removeItem('dactor_pending_verification')
      } else if (roleToLogout === 'doctor' || activeTab === 'doctor-portal') {
        localStorage.removeItem('dactor_doctor_session')
        localStorage.removeItem('dactor_doctor_email')
        localStorage.removeItem('dactor_doctor_logged_in')
        localStorage.removeItem('dactor_doctor_pending_kyc')
      } else {
        localStorage.removeItem('dactor_patient_session')
        localStorage.removeItem('dactor_patient_email')
        localStorage.removeItem('dactor_patient_logged_in')
      }
      try {
        sessionStorage.removeItem('dactor_explicit_home')
        sessionStorage.removeItem('dactor_allow_home')
      } catch {}

      const st = getTabAuthState(activeTab)
      setIsLoggedIn(st.isLoggedIn)
      setCurrentUserEmail(st.currentUserEmail)
      setAuthRole(st.authRole)
      window.dispatchEvent(new Event('storage'))
    } catch {}
  }

  // Open live queue page with specific tracking code
  const handleOpenLiveQueue = (code: string) => {
    setActiveTrackingCode(code)
    setActiveTab('live-queue')
    window.location.hash = '#live-queue'
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Open report modal with specific code
  const handleOpenReportModal = (code?: string) => {
    if (code) {
      setReportModalInitialCode(code)
    }
    setReportModalOpen(true)
  }

  return (
    <LiquidAuroraBackground>
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab, params) => handleNavigate(tab, params)}
        onOpenTrackerModal={() => setTrackerModalOpen(true)}
        onOpenReportModal={() => handleOpenReportModal()}
        onOpenNotificationModal={() => setNotificationModalOpen(true)}
        unreadNotificationsCount={unreadCount}
        isLoggedIn={isLoggedIn}
        currentUserEmail={currentUserEmail}
        authRole={authRole}
        onLogout={handleLogout}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {activeTab === 'home' && (
          <Home
            onNavigate={handleNavigate}
            onOpenTrackerModal={(code) => {
              if (code) {
                handleOpenLiveQueue(code)
              } else {
                setTrackerModalOpen(true)
              }
            }}
            onOpenReportModal={handleOpenReportModal}
          />
        )}

        {activeTab === 'clinics' && (
          <FindClinics
            onSelectClinic={(clinicId) => handleNavigate('clinic-detail', { clinicId })}
            initialFilter={clinicFilter}
          />
        )}

        {activeTab === 'clinic-detail' && selectedClinicId && (
          <ClinicDetail
            clinicId={selectedClinicId}
            initialDoctorId={selectedDoctorId || undefined}
            autoOpenBooking={autoOpenBooking}
            initialTrackingCode={rescheduleTrackingCode || undefined}
            isReschedule={isRescheduleMode}
            onBack={() => {
              setRescheduleTrackingCode('')
              setIsRescheduleMode(false)
              handleNavigate('clinics')
            }}
            onOpenLiveQueue={handleOpenLiveQueue}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === 'clinic-detail' && !selectedClinicId && selectedDoctorId ? (
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Opening doctor consultation & direct booking details...
              </p>
            </div>
          </div>
        ) : activeTab === 'clinic-detail' && !selectedClinicId ? (
          <NotFound
            attemptedPath="Clinic ID was not specified"
            onNavigate={handleNavigate}
            onOpenTrackerModal={() => setTrackerModalOpen(true)}
            onOpenReportModal={handleOpenReportModal}
          />
        ) : null}

        {(activeTab === 'live-queue' || activeTab === 'lab-reports') && (
          <LiveQueue
            initialCode={activeTrackingCode}
            onOpenReportModal={handleOpenReportModal}
            onNavigateHome={() => handleNavigate('home')}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === 'average-time' && (
          <AverageTime
            onSelectClinic={(clinicId) => handleNavigate('clinic-detail', { clinicId })}
          />
        )}

        {(activeTab === 'patient-portal' || activeTab === 'records' || activeTab === 'account') && (
          <PatientPortal
            initialTab={activeTab === 'records' ? 'records' : activeTab === 'account' ? 'account' : 'book'}
            onNavigateHome={() => handleNavigate('home')}
            onOpenLiveQueue={handleOpenLiveQueue}
            onOpenReportModal={handleOpenReportModal}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === 'login' && (
          <Login
            onNavigate={handleNavigate}
            onOpenTrackerModal={() => setTrackerModalOpen(true)}
            onOpenReportModal={handleOpenReportModal}
          />
        )}

        {activeTab === 'doctor-portal' && <DoctorPortal />}

        {activeTab === 'portal' && <ClinicPortal />}
        {activeTab === 'support' && <Support />}

        {/* 404 Not Found & Broken Link Handler */}
        {(activeTab === '404' ||
          ![
            'home',
            'clinics',
            'clinic-detail',
            'live-queue',
            'lab-reports',
            'average-time',
            'patient-portal',
            'records',
            'account',
            'login',
            'doctor-portal',
            'portal',
            'support',
          ].includes(activeTab)) && (
          <NotFound
            attemptedPath={
              typeof window !== 'undefined'
                ? window.location.pathname + window.location.hash
                : activeTab
            }
            onNavigate={handleNavigate}
            onOpenTrackerModal={() => setTrackerModalOpen(true)}
            onOpenReportModal={handleOpenReportModal}
          />
        )}
      </main>

      <Footer onNavigate={handleNavigate} />

      {/* Mobile Bottom Navigation Bar (Visible on mobile/tablet when not inside a portal) */}
      {!['portal', 'clinic-portal', 'admin-portal', 'doctor-portal', 'patient-portal', 'my-health', 'records', 'account', 'book'].includes(activeTab) && (
        <BottomNav
          activeTab={activeTab}
          setActiveTab={(tab, params) => handleNavigate(tab, params)}
          onOpenTrackerModal={() => setTrackerModalOpen(true)}
          authRole={authRole}
        />
      )}

      <LiveTrackerModal
        isOpen={trackerModalOpen}
        onClose={() => setTrackerModalOpen(false)}
        onOpenFullQueue={handleOpenLiveQueue}
        onNavigate={handleNavigate}
        onNavigateSupport={(ticketCode) => {
          if (ticketCode) {
            window.location.hash = `#support?track=${encodeURIComponent(ticketCode)}`
          } else {
            window.location.hash = '#support?view=track'
          }
          setActiveTab('support')
        }}
      />

      <LabReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        initialCode={reportModalInitialCode}
      />

      <NotificationModal
        isOpen={notificationModalOpen}
        onClose={() => setNotificationModalOpen(false)}
        clinicId={selectedClinicId || 'global'}
        onNotificationsChanged={(count) => setUnreadCount(count)}
      />
    </LiquidAuroraBackground>
  )
}
