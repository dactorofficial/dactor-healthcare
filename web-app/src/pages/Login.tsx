import React, { useState, useEffect } from 'react'
import {
  Lock,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Calendar,
  Building2,
  Stethoscope,
  Clock,
  Sparkles,
  Info,
  X,
  FileText,
} from 'lucide-react'
import {
  signInWithFirebaseGoogle,
  firebaseSignOut,
  checkRedirectGoogleUser,
  onFirebaseAuthStateChanged,
} from '../lib/firebase'
import {
  checkEmailPortalAssociation,
  getPatientProfileByEmail,
  savePatientProfile,
  getClinicById,
  getDoctorById,
  getLoggedInUserSession,
} from '../services/db'
import { Clinic, Doctor, PatientProfile } from '../types'
import dactorLogo from '../assets/logo.svg'

interface LoginProps {
  onNavigate: (tab: string, params?: any) => void
  onOpenTrackerModal?: () => void
  onOpenReportModal?: () => void
}

export const Login: React.FC<LoginProps> = ({ onNavigate }) => {
  const [currentView, setCurrentView] = useState<'auth_choice' | 'register_form'>('auth_choice')
  const [isLoading, setIsLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // Pending booking redirect context
  const [pendingNotice, setPendingNotice] = useState<string | null>(null)
  const [pendingBooking, setPendingBooking] = useState<any | null>(null)
  const [pendingClinic, setPendingClinic] = useState<Clinic | null>(null)
  const [pendingDoctor, setPendingDoctor] = useState<Doctor | null>(null)

  // Registration Form State (strictly never auto-filled from Google account)
  const [verifiedEmail, setVerifiedEmail] = useState('')
  const [authUid, setAuthUid] = useState('')
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [patientAge, setPatientAge] = useState('')
  const [patientGender, setPatientGender] = useState<'Male' | 'Female' | 'Other'>('Male')
  const [patientCity, setPatientCity] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(true)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [showTermsModal, setShowTermsModal] = useState(false)

  // Load pending booking context and check existing session
  useEffect(() => {
    try {
      const session = getLoggedInUserSession()

      const rawPending = localStorage.getItem('dactor_pending_booking_redirect')
      const storedNotice = localStorage.getItem('dactor_booking_login_notice')

      if (rawPending) {
        const parsed = JSON.parse(rawPending)
        setPendingBooking(parsed)
        setPendingNotice(storedNotice || 'Please sign in with Google to book an appointment')

        if (parsed.clinicId) {
          getClinicById(parsed.clinicId).then((c) => {
            if (c) setPendingClinic(c)
          })
        }
        if (parsed.doctorId) {
          getDoctorById(parsed.doctorId).then((d) => {
            if (d) setPendingDoctor(d)
          })
        }

        // If already logged in as patient, immediately resume pending booking!
        if (session && session.role === 'patient') {
          if (parsed.returnRoute === 'clinic-detail' && parsed.clinicId) {
            onNavigate('clinic-detail', {
              clinicId: parsed.clinicId,
              doctorId: parsed.doctorId,
              autoOpenBooking: true,
            })
            return
          } else {
            onNavigate('patient-portal')
            return
          }
        }
      } else if (session) {
        onNavigate(session.portalTab)
      }
    } catch (err) {
      console.warn('Error reading pending booking info:', err)
    }
  }, [onNavigate])

  // Google Sign-In helper extracted for both popup and redirect returns
  const processPatientLoginForGoogleUser = async (email: string, authId: string, photo?: string) => {
    setIsLoading(true)
    setAuthError(null)

    try {
      const cleanEmail = email.trim().toLowerCase()

      // Enforce 1 Google Account = 1 Portal Role rule
      const assoc = await checkEmailPortalAssociation(cleanEmail)
      if (assoc && assoc.portal !== 'patient') {
        const entitySuffix = assoc.entityName ? ` (${assoc.entityName})` : ''
        setAuthError(
          `This Google account (${assoc.email}) is already associated with a ${assoc.portalLabel} account${entitySuffix}. You cannot log in to the Patient Portal with this Google ID. Please change your Google account.`
        )
        setIsLoading(false)
        return
      }

      // Check existing patient profile in Supabase
      const profile = await getPatientProfileByEmail(cleanEmail)

      if (profile && profile.fullName && profile.phone && profile.age && profile.gender) {
        // Complete profile already exists -> log in immediately and resume
        const fullProfile: PatientProfile = {
          ...profile,
          photoUrl: photo || profile.photoUrl,
        }
        localStorage.setItem('dactor_patient_email', profile.email)
        localStorage.setItem('dactor_patient_session', JSON.stringify(fullProfile))
        localStorage.setItem('dactor_patient_logged_in', 'true')
        try {
          sessionStorage.removeItem('dactor_explicit_home')
          sessionStorage.removeItem('dactor_allow_home')
        } catch {}
        window.dispatchEvent(new Event('storage'))

        resumeBookingOrNavigate(fullProfile)
      } else {
        // New or incomplete patient: strictly do NOT auto-fill name, gender, or age from Google account
        const normGen = (profile?.gender || 'Male').trim().toLowerCase()
        const resolvedGender = normGen === 'female' ? 'Female' : normGen === 'other' ? 'Other' : 'Male'
        setVerifiedEmail(cleanEmail)
        setAuthUid(authId)
        setPatientName(profile?.fullName || '')
        setPatientPhone(profile?.phone || '')
        setPatientAge(profile?.age ? String(profile.age) : '')
        setPatientGender(resolvedGender)
        setPatientCity(profile?.city || '')
        setTermsAccepted(true)
        setCurrentView('register_form')
        setIsLoading(false)
      }
    } catch (err: any) {
      console.warn('Patient login processing notice:', err)
      setAuthError(err?.message || 'Login failed. Please try again.')
      setIsLoading(false)
    }
  }

  // Restore session from Google OAuth redirect or active Firebase session
  useEffect(() => {
    let isMounted = true
    async function initGoogleRedirectCheck() {
      try {
        const redirected = await checkRedirectGoogleUser()
        if (isMounted && redirected && redirected.email) {
          await processPatientLoginForGoogleUser(redirected.email, redirected.uid, redirected.photoURL)
        }
      } catch (err) {
        console.warn('checkRedirect error in Login:', err)
      }
    }
    initGoogleRedirectCheck()

    const unsub = onFirebaseAuthStateChanged((u) => {
      if (isMounted && u && u.email && currentView === 'auth_choice' && !isLoading) {
        processPatientLoginForGoogleUser(u.email, u.uid, u.photoURL)
      }
    })

    return () => {
      isMounted = false
      if (typeof unsub === 'function') unsub()
    }
  }, [currentView, isLoading])

  // Google Sign-In with Role Exclusivity Check
  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setAuthError(null)

    try {
      const gUser = await signInWithFirebaseGoogle('patient')
      if (gUser && gUser.email) {
        await processPatientLoginForGoogleUser(gUser.email, gUser.uid, gUser.photoURL)
      }
    } catch (err: any) {
      console.warn('Google Sign-In notice:', err)
      const errCode = err?.code || ''
      if (errCode === 'auth/popup-closed-by-user' || err?.message?.includes('closed-by-user')) {
        setAuthError('Sign-in popup was closed before completing. Please try again.')
      } else if (errCode === 'auth/popup-blocked' || err?.message?.includes('popup-blocked')) {
        setAuthError('Popup was blocked by your browser. Please allow popups and try again.')
      } else {
        setAuthError(err?.message || 'Google Sign-In failed. Please try again.')
      }
      setIsLoading(false)
    }
  }

  // Handle saving patient registration profile
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors: Record<string, string> = {}

    if (patientName.trim().length < 2) {
      errors.name = 'Full legal name must be at least 2 characters.'
    }

    const cleanPhone = patientPhone.replace(/\D/g, '')
    if (cleanPhone.length !== 10 || !cleanPhone.startsWith('9')) {
      errors.phone = 'Mobile number must be a 10-digit number starting with 9 (e.g. 98XXXXXXXX).'
    }

    const ageNum = parseInt(patientAge, 10)
    if (!patientAge || isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      errors.age = 'Please enter a valid age between 1 and 120.'
    }

    const genderToSave = patientGender || 'Male'

    if (!termsAccepted) {
      errors.terms = 'You must accept the Terms of Service & Privacy Policy to continue.'
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setIsLoading(true)
    setValidationErrors({})

    try {
      const saved = await savePatientProfile({
        authUid,
        email: verifiedEmail,
        fullName: patientName.trim(),
        phone: cleanPhone,
        age: ageNum,
        gender: genderToSave,
        city: patientCity.trim() || undefined,
        role: 'patient',
      })

      const fallback: PatientProfile = {
        id: crypto.randomUUID(),
        authUid,
        email: verifiedEmail,
        fullName: patientName.trim(),
        phone: cleanPhone,
        age: ageNum,
        gender: genderToSave,
        city: patientCity.trim() || undefined,
        role: 'patient',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const finalProfile = saved || fallback

      localStorage.setItem('dactor_patient_email', finalProfile.email)
      localStorage.setItem('dactor_patient_session', JSON.stringify(finalProfile))
      localStorage.setItem('dactor_patient_logged_in', 'true')
      try {
        sessionStorage.removeItem('dactor_explicit_home')
        sessionStorage.removeItem('dactor_allow_home')
      } catch {}
      window.dispatchEvent(new Event('storage'))

      resumeBookingOrNavigate(finalProfile)
    } catch (err: any) {
      console.warn('Registration save notice:', err)
      const fallback: PatientProfile = {
        id: crypto.randomUUID(),
        authUid,
        email: verifiedEmail,
        fullName: patientName.trim(),
        phone: cleanPhone,
        age: ageNum,
        gender: genderToSave,
        city: patientCity.trim() || undefined,
        role: 'patient',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem('dactor_patient_email', fallback.email)
      localStorage.setItem('dactor_patient_session', JSON.stringify(fallback))
      localStorage.setItem('dactor_patient_logged_in', 'true')
      try {
        sessionStorage.removeItem('dactor_explicit_home')
        sessionStorage.removeItem('dactor_allow_home')
      } catch {}
      window.dispatchEvent(new Event('storage'))

      resumeBookingOrNavigate(fallback)
    }
  }

  // Resume booking or redirect to patient portal
  const resumeBookingOrNavigate = (profile: PatientProfile) => {
    try {
      const rawPending = localStorage.getItem('dactor_pending_booking_redirect')
      localStorage.removeItem('dactor_booking_login_notice')

      if (rawPending) {
        const parsed = JSON.parse(rawPending)
        if (parsed.returnRoute === 'clinic-detail' && parsed.clinicId) {
          onNavigate('clinic-detail', {
            clinicId: parsed.clinicId,
            doctorId: parsed.doctorId,
            autoOpenBooking: true,
          })
          return
        }
      }
    } catch {}

    // Default: navigate to patient portal
    onNavigate('patient-portal')
  }

  const handleCancelPendingBooking = () => {
    localStorage.removeItem('dactor_pending_booking_redirect')
    localStorage.removeItem('dactor_booking_login_notice')
    setPendingBooking(null)
    setPendingNotice(null)
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-8 sm:py-12 relative">
      <div className="max-w-md w-full liquid-glass-elevated rounded-3xl p-6 sm:p-8 border border-white/60 dark:border-white/10 shadow-2xl relative overflow-hidden">
        {/* Specular top glow */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

        {currentView === 'auth_choice' ? (
          <div className="space-y-6">
            {/* Header / Brand Icon */}
            <div className="text-center space-y-3">
              <img
                src={dactorLogo}
                alt="Dactor Logo"
                className="w-16 h-16 rounded-3xl object-contain mx-auto shadow-xl shadow-teal-500/20 bg-white/95 p-1.5 border border-white/60"
              />
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Sign In to Dactor
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">
                Nepal's Realtime OPD Queue, Clinic Token &amp; Medical Portal
              </p>
            </div>

            {/* Pending Booking Gate Notice (App Parity) */}
            {pendingNotice && (
              <div className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-2 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Sign-In Required to Book</span>
                </div>
                <p className="text-xs font-semibold leading-relaxed">
                  {pendingNotice}
                </p>

                {/* Booking details card summary */}
                {pendingBooking && (
                  <div className="mt-2 pt-2 border-t border-amber-500/20 text-[11px] space-y-1 text-slate-700 dark:text-slate-300">
                    {pendingClinic && (
                      <div className="flex items-center space-x-1 font-bold">
                        <Building2 className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                        <span className="truncate">{pendingClinic.name}</span>
                      </div>
                    )}
                    {pendingDoctor && (
                      <div className="flex items-center space-x-1">
                        <Stethoscope className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
                        <span className="truncate">Dr. {pendingDoctor.fullName} ({pendingDoctor.specialty})</span>
                      </div>
                    )}
                    {pendingBooking.bookingDate && (
                      <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>{pendingBooking.bookingDate}</span>
                        </span>
                        {pendingBooking.selectedSlotTime && (
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>{pendingBooking.selectedSlotTime}</span>
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-teal-700 dark:text-teal-400 font-bold pt-1">
                      ✓ Your selected date and slot are held and will restore automatically after sign-in.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {authError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{authError}</span>
              </div>
            )}

            {/* Google Sign-In Button */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-4 px-6 liquid-glass-card hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-900 dark:text-white font-bold rounded-2xl transition-all flex items-center justify-center space-x-3 text-sm cursor-pointer shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.98] border border-white/60 dark:border-white/10 disabled:opacity-60"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
                )}
                <span>Continue with Google</span>
              </button>

              <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
                🔒 Safe, fast, and password-free authentication powered by Google.
              </p>
            </div>

            {/* Guest / Navigation Fallback */}
            <div className="pt-4 border-t border-white/20 dark:border-white/5 space-y-2">
              {pendingBooking ? (
                <button
                  type="button"
                  onClick={() => {
                    handleCancelPendingBooking()
                    if (pendingBooking.clinicId) {
                      onNavigate('clinic-detail', { clinicId: pendingBooking.clinicId })
                    } else {
                      onNavigate('clinics')
                    }
                  }}
                  className="w-full py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Clinic Details without Booking</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate('home')}
                  className="w-full py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Browse Clinics & Doctors</span>
                </button>
              )}

              <div className="flex items-center justify-center space-x-4 pt-2 text-[11px] text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => onNavigate('doctor-portal')}
                  className="hover:text-teal-600 dark:hover:text-teal-400 transition cursor-pointer hover:underline"
                >
                  Doctor Login
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => onNavigate('portal')}
                  className="hover:text-teal-600 dark:hover:text-teal-400 transition cursor-pointer hover:underline"
                >
                  Clinic Login
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* PATIENT REGISTRATION FORM VIEW (App Parity: register_form) */
          /* ========================================================= */
          <div className="space-y-6">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setCurrentView('auth_choice')}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center space-x-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Complete Patient Profile
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Please enter your verified details for clinical records, prescription tokens, and OPD booking.
              </p>
            </div>

            {/* Verified Google Account pill */}
            <div className="p-3 rounded-2xl liquid-glass-subtle border-teal-500/30 flex items-center space-x-2 text-xs">
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold text-teal-700 dark:text-teal-300 block">
                  Verified Google Account
                </span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate block">
                  {verifiedEmail}
                </span>
              </div>
            </div>

            {/* Error banner */}
            {authError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-4" noValidate>
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Full Legal Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rajan Purbe"
                  value={patientName}
                  onChange={(e) => {
                    setPatientName(e.target.value)
                    if (validationErrors.name) {
                      setValidationErrors((prev) => ({ ...prev, name: '' }))
                    }
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    validationErrors.name
                      ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20'
                      : 'liquid-glass-input text-slate-900 dark:text-white'
                  } focus:outline-none focus:ring-2 focus:ring-teal-500`}
                />
                {validationErrors.name && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">
                    {validationErrors.name}
                  </p>
                )}
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mobile Number (Nepal) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="e.g. 9800000000"
                  value={patientPhone}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, '')
                    setPatientPhone(clean)
                    if (validationErrors.phone) {
                      setValidationErrors((prev) => ({ ...prev, phone: '' }))
                    }
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    validationErrors.phone
                      ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20'
                      : 'liquid-glass-input text-slate-900 dark:text-white'
                  } focus:outline-none focus:ring-2 focus:ring-teal-500`}
                />
                {validationErrors.phone && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">
                    {validationErrors.phone}
                  </p>
                )}
              </div>

              {/* Age */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Age (Years) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={120}
                  placeholder="e.g. 28"
                  value={patientAge}
                  onChange={(e) => {
                    setPatientAge(e.target.value)
                    if (validationErrors.age) {
                      setValidationErrors((prev) => ({ ...prev, age: '' }))
                    }
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    validationErrors.age
                      ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20'
                      : 'liquid-glass-input text-slate-900 dark:text-white'
                  } focus:outline-none focus:ring-2 focus:ring-teal-500`}
                />
                {validationErrors.age && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">
                    {validationErrors.age}
                  </p>
                )}
              </div>

              {/* Gender Radio Pills */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Gender <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Male', 'Female', 'Other'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        setPatientGender(g)
                        if (validationErrors.gender) {
                          setValidationErrors((prev) => ({ ...prev, gender: '' }))
                        }
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        patientGender.toLowerCase() === g.toLowerCase()
                          ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white border-transparent shadow-md shadow-teal-500/20'
                          : 'liquid-glass-card text-slate-700 dark:text-slate-300 border-white/60 dark:border-white/10 hover:bg-white/70'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                {validationErrors.gender && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">
                    {validationErrors.gender}
                  </p>
                )}
              </div>

              {/* Terms & Conditions Acceptance Checkbox */}
              <div className="pt-2">
                <label className="flex items-start space-x-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => {
                      setTermsAccepted(e.target.checked)
                      if (validationErrors.terms) {
                        setValidationErrors((prev) => ({ ...prev, terms: '' }))
                      }
                    }}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        setShowTermsModal(true)
                      }}
                      className="font-bold text-teal-700 dark:text-teal-400 hover:underline inline"
                    >
                      Terms of Service
                    </button>{' '}
                    and{' '}
                    <a
                      href="./privacy-patient.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-teal-700 dark:text-teal-400 hover:underline inline cursor-pointer"
                    >
                      Patient Privacy Policy
                    </a>{' '}
                    of Dactor Nepal.
                  </span>
                </label>
                {validationErrors.terms && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">
                    {validationErrors.terms}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-black rounded-2xl shadow-glass-base active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer border-t border-white/20 disabled:opacity-60"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>{pendingBooking ? 'Save Profile & Confirm Booking' : 'Complete Registration'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Terms of Service Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
          <div className="liquid-glass-modal rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/20 pb-3">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center space-x-2">
                <FileText className="w-5 h-5 text-teal-600" />
                <span>Terms of Service &amp; Patient Privacy</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
              <p>
                <strong>1. Accurate Health Information:</strong> You agree to provide true, current, and accurate legal identity details to ensure medical safety, verified electronic prescriptions, and correct queue sequencing.
              </p>
              <p>
                <strong>2. Realtime OPD Token Management:</strong> OPD token allocations and estimated wait times are computed dynamically based on clinic throughput and emergency priorities.
              </p>
              <p>
                <strong>3. Data Privacy &amp; Encryption:</strong> Your medical notes, diagnostic reports, and payment logs are encrypted and strictly accessible only to authorized attending physicians and clinic staff.
              </p>
              <div className="pt-2 border-t border-white/20">
                <a
                  href="./privacy-patient.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-700 dark:text-teal-300 font-bold hover:underline inline-flex items-center gap-1 text-[11px]"
                >
                  <span>Read Full Patient Privacy Policy (Live on GitHub) &rarr;</span>
                </a>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setTermsAccepted(true)
                setShowTermsModal(false)
              }}
              className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-bold rounded-xl text-xs cursor-pointer"
            >
              Accept &amp; Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
