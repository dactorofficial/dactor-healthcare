import React, { useState, useEffect, useMemo } from 'react'
import {
  Activity,
  Search,
  Sparkles,
  Calendar,
  Clock,
  ShieldCheck,
  Stethoscope,
  FlaskConical,
  Building2,
  ArrowRight,
  CheckCircle2,
  Users,
  MapPin,
  ChevronRight,
  ChevronDown,
  User,
  SlidersHorizontal,
  X,
  Phone,
  Check,
  AlertCircle,
  RefreshCw,
  Eye,
  Navigation,
  Camera,
  GraduationCap,
  Award,
  Info,
} from 'lucide-react'
import { Clinic, Doctor, DoctorHomeItem } from '../types'
import {
  getClinics,
  getDoctors,
  resolveClinicCoverUrl,
  linkDoctorsWithClinics,
  getCityLocations,
  DEFAULT_NEPAL_CITIES,
  getLoggedInUserSession,
} from '../services/db'
import { supabase } from '../lib/supabase'
import { matchClinic, matchDoctor } from '../utils/searchEngine'
import { updatePageSEO } from '../utils/seo'
import dactorLogo from '../assets/logo.svg'

interface HomeProps {
  onNavigate: (tab: string, params?: any) => void
  onOpenTrackerModal: (code?: string) => void
  onOpenReportModal: (code?: string) => void
}


// Common department / symptom chips from real app
const SPECIALTY_CHIPS = [
  { id: 'all', label: 'All Clinics & Labs' },
  { id: 'skin', label: 'Skin / Dermatology' },
  { id: 'heart', label: 'Heart / Cardiology' },
  { id: 'ortho', label: 'Bone & Joint (Orthopedics)' },
  { id: 'eye', label: 'Eye / Ophthalmology' },
  { id: 'child', label: 'Child / Pediatrics' },
  { id: 'dental', label: 'Dental Care' },
  { id: 'general', label: 'General Medicine' },
  { id: 'ent', label: 'ENT (Ear, Nose & Throat)' },
  { id: 'lab', label: 'Diagnostic Pathology Lab' },
  { id: 'mri', label: 'MRI Scan' },
  { id: 'ct', label: 'CT Scan' },
  { id: 'ultrasound', label: 'Ultrasound / USG / X-Ray' },
]

export const Home: React.FC<HomeProps> = ({
  onNavigate,
  onOpenTrackerModal,
  onOpenReportModal,
}) => {
  const [trackingCode, setTrackingCode] = useState('')
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)

  // Location selector state (synced with Supabase database & Admin Panel)
  const [locationOptions, setLocationOptions] = useState<string[]>(DEFAULT_NEPAL_CITIES)
  const [selectedLocation, setSelectedLocation] = useState('All Nepal')
  const [showLocationDropdown, setShowLocationDropdown] = useState(false)

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSpecialty, setSelectedSpecialty] = useState('all')
  const [selectedSort, setSelectedSort] = useState<'default' | 'in_clinic' | 'fee_asc'>('default')
  const [showSortDropdown, setShowSortDropdown] = useState(false)

  // Entity tab switcher: 'all' | 'doctors' | 'clinics' (Strict parity with mobile app)
  const [activeEntityTab, setActiveEntityTab] = useState<'all' | 'doctors' | 'clinics'>('all')

  // Doctor Modals
  const [selectedDoctorForModal, setSelectedDoctorForModal] = useState<DoctorHomeItem | null>(null)
  const [selectedDoctorForClinicPicker, setSelectedDoctorForClinicPicker] = useState<DoctorHomeItem | null>(null)

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

  // Date strip state (7 consecutive days starting from today)
  const today = useMemo(() => new Date(), [])
  const [selectedDateIndex, setSelectedDateIndex] = useState(0)

  const dateList = useMemo(() => {
    const list = []
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(today.getDate() + i)
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
      const dayNum = d.getDate()
      const fullDateStr = d.toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
      list.push({ date: d, dayName, dayNum, fullDateStr })
    }
    return list
  }, [today])

  // Auto-redirect logged-in users to their respective portal unless intentionally viewing landing page
  useEffect(() => {
    try {
      if (
        sessionStorage.getItem('dactor_explicit_home') === 'true' ||
        sessionStorage.getItem('dactor_allow_home') === 'true'
      ) {
        return
      }
      const session = getLoggedInUserSession()
      if (session) {
        onNavigate(session.portalTab)
      }
    } catch {}
  }, [onNavigate])

  useEffect(() => {
    async function loadData() {
      try {
        const [cList, dList, cityList] = await Promise.all([
          getClinics(),
          getDoctors(),
          getCityLocations(),
        ])
        setClinics(cList.filter((c) => !c.isArchived))
        setDoctors(dList)
        if (cityList && cityList.length > 0) {
          setLocationOptions(cityList)
        }
      } catch (err) {
        console.error('Failed to load clinics & doctors', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
    updatePageSEO({
      title: "Dactor - Nepal Healthcare OPD Queue Tracker & Clinic Booking Portal",
      description: "Search verified specialist doctors, polyclinics, and diagnostic pathology labs in Nepal. Book doctor appointments online, track live token queue status in real time, and download certified medical test reports.",
    })
  }, [])

  // Live real-time listener: when admin panel adds or deletes cities in medical_qualifications, update dropdown immediately
  useEffect(() => {
    const channel = supabase
      .channel('home_realtime_cities')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'medical_qualifications',
        },
        async () => {
          try {
            const freshCities = await getCityLocations()
            if (freshCities && freshCities.length > 0) {
              setLocationOptions(freshCities)
            }
          } catch (e) {
            console.warn('Realtime location update error:', e)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Auto-fallback to 'All Nepal' if currently selected city was deleted by admin
  useEffect(() => {
    if (selectedLocation !== 'All Nepal' && !locationOptions.includes(selectedLocation)) {
      setSelectedLocation('All Nepal')
    }
  }, [locationOptions, selectedLocation])

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (trackingCode.trim()) {
      onOpenTrackerModal(trackingCode.trim())
    }
  }

  // Filter and sort clinics & doctor cards
  const filteredClinics = useMemo(() => {
    let result = clinics.map((c) => {
      // Find affiliated doctors for this clinic
      const clinicDocs = doctors.filter(
        (d) => d.clinicId === c.id || (d as any).activeClinicId === c.id
      )
      const primaryDoc = clinicDocs[0] || null
      const hasDocInClinic = clinicDocs.some((d) => d.isInClinic)

      return {
        ...c,
        doctorsList: clinicDocs,
        primaryDoctor: primaryDoc,
        hasDocInClinic,
      }
    })

    // Location filter
    if (selectedLocation !== 'All Nepal') {
      result = result.filter(
        (c) =>
          c.addressText?.toLowerCase().includes(selectedLocation.toLowerCase()) ||
          c.name.toLowerCase().includes(selectedLocation.toLowerCase())
      )
    }

    // Search query filter with MedicalSearchEngine symptom & organ matching
    if (searchQuery.trim()) {
      result = result.filter((c) => {
        const match = matchClinic(c, c.doctorsList, [], searchQuery)
        return match.isMatch
      })
    }

    // Specialty chip filter
    if (selectedSpecialty !== 'all') {
      const target = selectedSpecialty.toLowerCase()
      result = result.filter((c) => {
        if (target === 'lab') {
          return (
            c.type === 'diagnostic_lab' ||
            c.specialties?.some((s) => s.toLowerCase().includes('lab') || s.toLowerCase().includes('patholog'))
          )
        }
        if (target === 'mri') {
          return (
            c.specialties?.some((s) => s.toLowerCase().includes('mri') || s.toLowerCase().includes('radiolog')) ||
            c.name.toLowerCase().includes('mri') ||
            c.type === 'diagnostic_lab'
          )
        }
        if (target === 'ct') {
          return (
            c.specialties?.some((s) => s.toLowerCase().includes('ct') || s.toLowerCase().includes('radiolog') || s.toLowerCase().includes('scan')) ||
            c.name.toLowerCase().includes('ct') ||
            c.type === 'diagnostic_lab'
          )
        }
        if (target === 'ultrasound') {
          return (
            c.specialties?.some((s) => s.toLowerCase().includes('ultrasound') || s.toLowerCase().includes('usg') || s.toLowerCase().includes('x-ray') || s.toLowerCase().includes('xray')) ||
            c.type === 'diagnostic_lab'
          )
        }
        return (
          c.specialties?.some((s) => s.toLowerCase().includes(target)) ||
          c.doctorsList.some((d) => d.specialty?.toLowerCase().includes(target))
        )
      })
    }

    // Sorting
    if (selectedSort === 'in_clinic') {
      result.sort((a, b) => (b.hasDocInClinic ? 1 : 0) - (a.hasDocInClinic ? 1 : 0))
    } else if (selectedSort === 'fee_asc') {
      result.sort((a, b) => {
        const feeA = a.primaryDoctor?.consultationFee || 500
        const feeB = b.primaryDoctor?.consultationFee || 500
        return feeA - feeB
      })
    }

    return result
  }, [clinics, doctors, selectedLocation, searchQuery, selectedSpecialty, selectedSort])

  // Pre-link all doctors with their practicing clinics (Parity with Mobile DoctorHomeItem)
  const doctorHomeItems: DoctorHomeItem[] = useMemo(() => {
    return linkDoctorsWithClinics(doctors, clinics)
  }, [doctors, clinics])

  // Filter and sort doctor cards (Strict Parity with Mobile App PatientMainScreen)
  const filteredDoctorItems = useMemo(() => {
    let result = doctorHomeItems.filter((item) => !item.doctor.isLabTechnician)

    // Location filter
    if (selectedLocation !== 'All Nepal') {
      const locLower = selectedLocation.toLowerCase()
      result = result.filter((item) => {
        return item.practicingClinics.some(
          (c) =>
            c.addressText?.toLowerCase().includes(locLower) ||
            c.city?.toLowerCase().includes(locLower) ||
            c.name.toLowerCase().includes(locLower)
        )
      })
    }

    // Search query filter using matchDoctor
    if (searchQuery.trim()) {
      result = result.filter((item) => {
        const match = matchDoctor(item.doctor, item.practicingClinics, searchQuery)
        return match.isMatch
      })
    }

    // Specialty chip filter
    if (selectedSpecialty !== 'all') {
      const target = selectedSpecialty.toLowerCase()
      result = result.filter((item) => {
        const docSpec = (item.doctor.specialty || '').toLowerCase()
        const docSpecs = (item.doctor.specialties || []).map((s) => s.toLowerCase())
        if (target === 'lab' || target === 'mri' || target === 'ct' || target === 'ultrasound') {
          return (
            docSpec.includes(target) ||
            docSpecs.some((s) => s.includes(target)) ||
            (target === 'lab' && docSpec.includes('patholog')) ||
            ((target === 'mri' || target === 'ct' || target === 'ultrasound') &&
              (docSpec.includes('radiolog') || docSpec.includes('imag')))
          )
        }
        return (
          docSpec.includes(target) ||
          docSpecs.some((s) => s.includes(target)) ||
          item.practicingClinics.some((c) =>
            c.specialties?.some((s) => s.toLowerCase().includes(target))
          )
        )
      })
    }

    // Sorting
    if (selectedSort === 'in_clinic') {
      result.sort((a, b) => (b.hasDocInClinic ? 1 : 0) - (a.hasDocInClinic ? 1 : 0))
    } else if (selectedSort === 'fee_asc') {
      result.sort((a, b) => {
        const feeA = a.doctor.consultationFee || 500
        const feeB = b.doctor.consultationFee || 500
        return feeA - feeB
      })
    } else {
      // Default: in-clinic first, then by experience
      result.sort((a, b) => {
        if (a.hasDocInClinic !== b.hasDocInClinic) {
          return a.hasDocInClinic ? -1 : 1
        }
        const expA = a.doctor.experienceYears || 0
        const expB = b.doctor.experienceYears || 0
        return expB - expA
      })
    }

    return result
  }, [doctorHomeItems, selectedLocation, searchQuery, selectedSpecialty, selectedSort])

  return (
    <div className="min-h-screen space-y-8 sm:space-y-12 pb-24 font-sans text-slate-900 selection:bg-brand-500 selection:text-white">
      {/* ========================================================= */}
      {/* TOP LOCATION & REAL APP BRAND BAR */}
      {/* ========================================================= */}
      <section className="liquid-glass-elevated border-b border-white/60 sticky top-16 sm:top-20 z-40 shadow-glass-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
            {/* Location Selector (matches real app's "All Nepal" dropdown) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                className="w-full sm:w-auto flex items-center justify-between sm:justify-start space-x-2 text-slate-800 hover:text-brand-600 transition-colors group cursor-pointer py-1 px-1"
              >
                <div className="flex items-center space-x-2">
                  <MapPin className="w-4 h-4 text-brand-600 shrink-0" />
                  <span className="text-base sm:text-lg font-black tracking-tight text-slate-900">
                    {selectedLocation}
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showLocationDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showLocationDropdown && (
                <div className="absolute left-0 mt-2 w-full sm:w-64 liquid-glass-elevated rounded-2xl shadow-glass-lg border border-white/80 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Select City / Region
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {locationOptions.map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => {
                          setSelectedLocation(loc)
                          setShowLocationDropdown(false)
                        }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center justify-between transition-colors ${
                          selectedLocation === loc
                            ? 'bg-brand-50/90 text-brand-700 font-bold'
                            : 'text-slate-700 hover:bg-white/60'
                        }`}
                      >
                        <span>{loc}</span>
                        {selectedLocation === loc && <Check className="w-3.5 h-3.5 text-brand-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live 10-Digit Quick Code Tracker Form (Pill styled like real app) */}
            <form
              onSubmit={handleTrackSubmit}
              className="w-full sm:w-auto flex items-center gap-2 liquid-glass-input p-1 rounded-2xl border border-white/70 shadow-glass-sm"
            >
              <div className="relative flex-1 sm:w-60">
                <input
                  type="text"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  placeholder="10-Digit Token Code..."
                  maxLength={10}
                  className="w-full pl-8 pr-3 py-1.5 text-sm sm:text-xs font-bold text-slate-900 bg-transparent focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                />
                <Sparkles className="w-3.5 h-3.5 text-brand-600 absolute left-2.5 top-2.5" />
              </div>
              <button
                type="submit"
                className="px-4 py-1.5 bg-gradient-to-r from-brand-600 to-cyan-500 hover:brightness-105 text-white font-bold rounded-xl text-xs transition-all shadow-glass-brand shrink-0 cursor-pointer active:scale-[0.97]"
              >
                Track Queue
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* HERO SECTION WITH INSTANT 10-DIGIT QUEUE TRACKER */}
      {/* ========================================================= */}
      <section className="relative overflow-hidden pt-2 sm:pt-4 pb-6 sm:pb-10 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="liquid-glass-elevated border border-white/80 rounded-3xl p-5 sm:p-10 shadow-glass-lg relative overflow-hidden">
          {/* Specular Perimeter Line */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] rounded-t-3xl bg-gradient-to-r from-transparent via-white/80 to-transparent" aria-hidden="true" />

          {/* Subtle medical shield background watermark */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-96 h-96 opacity-5 pointer-events-none -mr-16">
            <img src={dactorLogo} alt="" className="w-full h-full object-contain" />
          </div>

          <div className="max-w-3xl mx-auto space-y-6 text-center relative z-10">
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full liquid-glass-subtle border border-brand-200/60 text-brand-900 text-xs font-bold tracking-wide shadow-glass-sm mx-auto">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <img src={dactorLogo} alt="Dactor" className="w-4 h-4 object-contain rounded-full" />
              <span>Nepal's Realtime OPD Queue & Diagnostic Network</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-950 tracking-tight leading-[1.12]">
              Skip the waiting room. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 via-sky-500 to-cyan-500">
                Track your doctor's turn live from home.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed max-w-2xl mx-auto">
              Know the exact moment your specialist steps into the clinic. Track your live queue position with a 10-digit code, receive turn alerts, and walk in right as your turn arrives.
            </p>

            {/* Instant 10-Digit Universal Token Tracker Card */}
            <div className="liquid-glass-base p-4 sm:p-5 rounded-2xl border border-white/90 shadow-glass-md max-w-xl mx-auto space-y-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-brand-600" />
                  Instant Token Queue Lookup
                </span>
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" /> Real-Time Sync
                </span>
              </div>

              <form onSubmit={handleTrackSubmit} className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-3 text-slate-400 font-black text-sm">#</span>
                  <input
                    type="text"
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="Enter 10-digit token (e.g. 6316821683)"
                    maxLength={10}
                    className="w-full pl-8 pr-3 py-2.5 text-sm font-bold text-slate-900 bg-white/90 rounded-xl border border-slate-200/80 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-inner"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-brand-600 via-sky-600 to-cyan-500 hover:brightness-105 text-white font-black rounded-xl text-xs sm:text-sm transition-all shadow-glass-brand shrink-0 cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <span>Track Live Queue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                <span>
                  Try test code:{' '}
                  <button
                    type="button"
                    onClick={() => setTrackingCode('6316821683')}
                    className="font-bold text-brand-600 underline hover:text-brand-800"
                  >
                    #6316821683
                  </button>
                </span>
                <span className="flex items-center gap-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> No login needed
                </span>
              </div>
            </div>

            {/* Portal Links & CTAs */}
            <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2.5 sm:gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('patient-portal')}
                className="px-5 py-2.5 bg-gradient-to-r from-brand-600 via-sky-600 to-cyan-500 hover:brightness-105 text-white font-bold rounded-2xl text-xs sm:text-sm shadow-glass-brand border border-white/30 flex items-center justify-center space-x-2 transition-all cursor-pointer active:scale-[0.98]"
              >
                <User className="w-4 h-4" />
                <span>Patient Portal & My Bookings</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('lab-reports')}
                className="px-4 py-2.5 liquid-glass-subtle hover:bg-white/90 text-slate-800 border border-white/80 font-bold rounded-2xl text-xs sm:text-sm shadow-glass-sm flex items-center justify-center space-x-2 transition-all cursor-pointer active:scale-[0.98]"
              >
                <FlaskConical className="w-4 h-4 text-emerald-600" />
                <span>3-Stage Lab Reports</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('portal')}
                className="px-4 py-2.5 liquid-glass-subtle hover:bg-white/90 text-indigo-700 border border-indigo-200 font-bold rounded-2xl text-xs sm:text-sm shadow-glass-sm flex items-center justify-center space-x-2 transition-all cursor-pointer active:scale-[0.98]"
              >
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>For Clinics & Hospitals</span>
              </button>
            </div>

            {/* Trust Metrics */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-5 sm:gap-8 text-xs font-semibold text-slate-600">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">14k+</div>
                <span>Tokens Served</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">~42m</div>
                <span>Avg Waiting Saved</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold">100%</div>
                <span>Verified Doctors</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* VALUE PILLARS ("WHY DACTOR") */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12 space-y-2">
          <span className="text-xs font-extrabold uppercase tracking-widest text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-100">
            Engineered For Nepal Healthcare
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-950 tracking-tight">
            Everything You Need For A Stress-Free Clinic Visit
          </h2>
          <p className="text-xs sm:text-base text-slate-600 font-medium">
            Dactor connects patients, specialist doctors, and diagnostic polyclinics into one transparent real-time network.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 text-left">
          {/* Pillar 1 */}
          <div className="liquid-glass-elevated p-5 sm:p-6 rounded-3xl border border-white/80 shadow-glass-sm hover:shadow-glass-md transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 mb-2">Live Turn Counter</h3>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              See exactly how many patients are ahead in line, the doctor's average speed, and estimated arrival window with ±15 min accuracy.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="liquid-glass-elevated p-5 sm:p-6 rounded-3xl border border-white/80 shadow-glass-sm hover:shadow-glass-md transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 mb-2">Doctor Presence Beacon</h3>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Never travel to the clinic only to find the doctor is stuck in hospital emergency. Our verified beacon verifies physical attendance in real-time.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="liquid-glass-elevated p-5 sm:p-6 rounded-3xl border border-white/80 shadow-glass-sm hover:shadow-glass-md transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 mb-2">10-Digit Universal Code</h3>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Walk-in patients receive a simple 10-digit tracking token via printed receipt or SMS. Track instantly on any mobile or desktop without an app.
            </p>
          </div>

          {/* Pillar 4 */}
          <div className="liquid-glass-elevated p-5 sm:p-6 rounded-3xl border border-white/80 shadow-glass-sm hover:shadow-glass-md transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-cyan-100 text-cyan-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <FlaskConical className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 mb-2">3-Stage Lab Reports</h3>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Track blood tests, urine analysis, and pathology through Collection, Processing, and Doctor Review with certified PDF report download.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* HOW IT WORKS (3 SIMPLE STEPS) */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="liquid-glass-base border border-white/80 rounded-3xl p-6 sm:p-10 shadow-glass-sm space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-1.5">
            <h2 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight">How Dactor Works in 3 Steps</h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Simple, frictionless healthcare without waiting room chaos.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="liquid-glass-elevated p-5 rounded-2xl border border-white/90 shadow-glass-sm space-y-3 relative text-left">
              <div className="w-9 h-9 rounded-xl bg-brand-600 text-white font-black text-sm flex items-center justify-center shadow-glass-brand">
                1
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Find Doctor or Polyclinic</h3>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                Filter by symptoms, specialty, or location. View practicing schedules across all clinics in Kathmandu, Lalitpur, and Pokhara.
              </p>
            </div>

            <div className="liquid-glass-elevated p-5 rounded-2xl border border-white/90 shadow-glass-sm space-y-3 relative text-left">
              <div className="w-9 h-9 rounded-xl bg-sky-600 text-white font-black text-sm flex items-center justify-center shadow-glass-brand">
                2
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Book Slot & Get 10-Digit Code</h3>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                Pick your preferred time slot online, or get a printed token receipt upon walk-in. Receive SMS turn updates automatically.
              </p>
            </div>

            <div className="liquid-glass-elevated p-5 rounded-2xl border border-white/90 shadow-glass-sm space-y-3 relative text-left">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shadow-glass-brand">
                3
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Track Live & Walk In On Time</h3>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                Watch the live queue progression on your phone. Leave home when recommended and enter the doctor's cabin without waiting.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* SEARCH BAR & SPECIALTY CHIPS (Exactly like Real Android App) */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        {/* Pill Search Input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skin, heart, child, clinic or doctor..."
            className="w-full pl-12 pr-10 py-3.5 liquid-glass-input rounded-full text-sm font-semibold text-slate-900 shadow-glass-sm border border-white/80 placeholder:text-slate-400 placeholder:font-normal"
          />
          <Search className="w-5 h-5 text-brand-600 absolute left-4 top-3.5" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Scrollable Specialty Chips with smooth edge-to-edge swiping */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0">
          {SPECIALTY_CHIPS.map((chip) => {
            const isSelected = selectedSpecialty === chip.id
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setSelectedSpecialty(chip.id)}
                className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer border ${
                  isSelected
                    ? 'bg-gradient-to-r from-brand-600 to-cyan-500 text-white border-white/40 shadow-glass-brand scale-[1.02]'
                    : 'liquid-glass-subtle text-slate-700 border-white/60 hover:bg-white/90 shadow-glass-sm'
                }`}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* ========================================================= */}
      {/* HORIZONTAL DATE PICKER STRIP (Matches 01_home_dashboard.png) */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-3 sm:space-y-4">
        {/* Month Header with badge */}
        <div className="flex items-center justify-between px-1">
          <span className="text-sm sm:text-lg font-black text-slate-900">
            {today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <div className="flex items-center space-x-1 text-slate-400">
            <span className="text-[11px] sm:text-xs font-semibold text-brand-700 liquid-glass-subtle border border-brand-200/60 px-2.5 py-0.5 sm:py-1 rounded-full shadow-xs">
              7-Day Availability
            </span>
          </div>
        </div>

        {/* 7 Days Strip */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
          {dateList.map((item, idx) => {
            const isSelected = selectedDateIndex === idx
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedDateIndex(idx)}
                className={`py-2.5 sm:py-4 px-0.5 sm:px-2 rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-gradient-to-r from-brand-600 via-sky-600 to-cyan-500 text-white border-white/40 shadow-glass-brand scale-[1.03]'
                    : 'liquid-glass-subtle text-slate-700 border-white/60 hover:bg-white/80 shadow-glass-sm'
                }`}
              >
                <span className={`text-[10px] sm:text-xs font-bold leading-tight ${isSelected ? 'text-white/90' : 'text-slate-500'}`}>
                  {item.dayName}
                </span>
                <span className="text-sm sm:text-2xl font-black mt-0.5 leading-none">
                  {item.dayNum}
                </span>
              </button>
            )
          })}
        </div>

        {/* Selected Day Status & Sort Filter Bar */}
        <div className="flex items-center justify-between pt-1 sm:pt-2 px-1 gap-2">
          <h2 className="text-xs sm:text-lg font-black text-slate-900 truncate">
            {dateList[selectedDateIndex]?.fullDateStr}
          </h2>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-brand-600 to-cyan-500 text-white rounded-xl text-xs font-bold hover:brightness-105 transition-all cursor-pointer shadow-glass-brand border border-white/30"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Sort</span>
            </button>

            {showSortDropdown && (
              <div className="absolute right-0 mt-2 w-48 liquid-glass-elevated rounded-2xl shadow-glass-lg border border-white/80 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSort('default')
                    setShowSortDropdown(false)
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold ${
                    selectedSort === 'default' ? 'bg-brand-50/90 text-brand-700 font-bold' : 'text-slate-700 hover:bg-white/60'
                  }`}
                >
                  Recommended
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSort('in_clinic')
                    setShowSortDropdown(false)
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold ${
                    selectedSort === 'in_clinic' ? 'bg-brand-50/90 text-brand-700 font-bold' : 'text-slate-700 hover:bg-white/60'
                  }`}
                >
                  🟢 Doctor In Clinic First
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSort('fee_asc')
                    setShowSortDropdown(false)
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold ${
                    selectedSort === 'fee_asc' ? 'bg-brand-50/90 text-brand-700 font-bold' : 'text-slate-700 hover:bg-white/60'
                  }`}
                >
                  Lowest Fee First
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* ENTITY TYPE SELECTOR (All Providers vs Specialist Doctors vs Clinics) */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 liquid-glass-subtle rounded-2xl border border-white/80 shadow-glass-sm max-w-xl">
          <button
            type="button"
            onClick={() => setActiveEntityTab('all')}
            className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all text-center cursor-pointer ${
              activeEntityTab === 'all'
                ? 'bg-gradient-to-r from-brand-600 to-sky-600 text-white shadow-glass-brand scale-[1.01]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            All Providers
          </button>
          <button
            type="button"
            onClick={() => setActiveEntityTab('doctors')}
            className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all text-center cursor-pointer flex items-center justify-center space-x-1.5 ${
              activeEntityTab === 'doctors'
                ? 'bg-gradient-to-r from-brand-600 to-sky-600 text-white shadow-glass-brand scale-[1.01]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Specialist Doctors</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${activeEntityTab === 'doctors' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {filteredDoctorItems.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveEntityTab('clinics')}
            className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all text-center cursor-pointer flex items-center justify-center space-x-1.5 ${
              activeEntityTab === 'clinics'
                ? 'bg-gradient-to-r from-brand-600 to-sky-600 text-white shadow-glass-brand scale-[1.01]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Clinics & Labs</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${activeEntityTab === 'clinics' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {filteredClinics.length}
            </span>
          </button>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 1. SPECIALIST DOCTORS SECTION (Parity with Mobile Doctor Roster) */}
      {/* ========================================================= */}
      {(activeEntityTab === 'all' || activeEntityTab === 'doctors') && (
        <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
                <Stethoscope className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  {activeEntityTab === 'all' ? 'Featured Specialist Doctors' : 'Specialist Doctors & Medical Consultants'}
                </h2>
                <p className="text-xs text-slate-500">
                  {filteredDoctorItems.length} verified doctors available in {selectedLocation}
                </p>
              </div>
            </div>

            {activeEntityTab === 'all' && filteredDoctorItems.length > 3 && (
              <button
                type="button"
                onClick={() => setActiveEntityTab('doctors')}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center space-x-1 cursor-pointer"
              >
                <span>View All ({filteredDoctorItems.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-slate-100 rounded-3xl animate-pulse" />
              ))}
            </div>
          ) : filteredDoctorItems.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center max-w-md mx-auto space-y-3">
              <Stethoscope className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">No doctors found matching criteria</h3>
              <p className="text-xs text-slate-500">
                Try searching for symptoms like "skin", "heart", or switch location to "All Nepal".
              </p>
              <button
                onClick={() => {
                  setSearchQuery('')
                  setSelectedSpecialty('all')
                  setSelectedLocation('All Nepal')
                }}
                className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {(activeEntityTab === 'all' ? filteredDoctorItems.slice(0, 6) : filteredDoctorItems).map((item) => {
                const doc = item.doctor
                const initials = doc.fullName
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0].toUpperCase())
                  .join('') || 'DR'

                const hasPhoto = Boolean(doc.profilePictureUrl && doc.profilePictureUrl.trim().length > 0)
                const isDocInClinic = item.hasDocInClinic || doc.isInClinic
                const primaryClinic = item.practicingClinics[0]

                return (
                  <div
                    key={doc.id}
                    className="group liquid-glass-card rounded-3xl border border-white/80 shadow-glass-md hover:shadow-glass-lg transition-all duration-300 p-4 sm:p-5 flex flex-col justify-between overflow-hidden"
                  >
                    <div className="space-y-3.5">
                      {/* Top Header: Avatar & In-Clinic Status Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-3">
                          <div className="relative shrink-0">
                            {hasPhoto ? (
                              <img
                                src={doc.profilePictureUrl}
                                alt={doc.fullName}
                                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-white/80 shadow-glass-sm group-hover:scale-105 transition-transform"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none'
                                }}
                              />
                            ) : null}
                            {!hasPhoto && (
                              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-sky-600 via-sky-500 to-cyan-500 text-white font-black text-lg sm:text-xl flex items-center justify-center border-2 border-white/80 shadow-glass-sm">
                                {initials}
                              </div>
                            )}
                            {isDocInClinic && (
                              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white" />
                              </span>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-100">
                                {doc.education || 'MBBS'}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-500">
                                {doc.experienceYears || 5}+ Yrs Exp
                              </span>
                            </div>
                            <h3
                              onClick={() => setSelectedDoctorForModal(item)}
                              className="text-base sm:text-lg font-black text-slate-900 line-clamp-1 group-hover:text-brand-600 transition-colors cursor-pointer mt-0.5"
                            >
                              Dr. {doc.fullName}
                            </h3>
                            <p className="text-xs font-bold text-brand-600 line-clamp-1">
                              {doc.specialty || 'General Practitioner'}
                            </p>
                          </div>
                        </div>

                        {/* Verification Badge */}
                        <div className="shrink-0">
                          {isDocInClinic ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                              In Clinic
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200/80">
                              <ShieldCheck className="w-3 h-3 mr-1 text-sky-600" />
                              Verified
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Sub-specialties tags */}
                      {doc.specialties && doc.specialties.length > 1 && (
                        <div className="flex flex-wrap gap-1">
                          {doc.specialties.slice(0, 3).map((spec, sIdx) => (
                            <span
                              key={sIdx}
                              className="text-[10px] font-semibold text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded-md"
                            >
                              {spec}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Practicing Clinics Line */}
                      <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-100 text-xs space-y-1">
                        <div className="flex items-center space-x-1.5 text-slate-700 font-medium">
                          <Building2 className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                          {item.practicingClinics.length === 0 ? (
                            <span className="text-slate-500 italic text-[11px]">Private Consultation / Tele-health</span>
                          ) : item.practicingClinics.length === 1 ? (
                            <span className="truncate font-semibold text-slate-800 text-[11px]">
                              {primaryClinic.name} ({primaryClinic.city || 'Nepal'})
                            </span>
                          ) : (
                            <div className="flex items-center justify-between w-full">
                              <span className="truncate font-semibold text-slate-800 text-[11px]">
                                {primaryClinic.name}
                              </span>
                              <span className="text-[10px] font-bold bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded shrink-0">
                                +{item.practicingClinics.length - 1} clinics
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Footer: Fee & Action Buttons */}
                    <div className="pt-3.5 mt-3.5 border-t border-slate-100/80 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Fee</span>
                        <span className="text-sm sm:text-base font-black text-slate-900">
                          Rs. {doc.consultationFee || 500}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedDoctorForModal(item)}
                          className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white/80 hover:bg-white border border-slate-200 transition-all cursor-pointer shadow-xs"
                        >
                          Profile
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (item.practicingClinics.length === 0) {
                              alert(`Dr. ${doc.fullName} is currently accepting direct consultations at partner clinics. Please select an affiliated clinic.`)
                            } else if (item.practicingClinics.length === 1) {
                              onNavigate('clinic-detail', {
                                clinicId: item.practicingClinics[0].id,
                                doctorId: doc.id,
                                action: 'book',
                              })
                            } else {
                              setSelectedDoctorForClinicPicker(item)
                            }
                          }}
                          className="px-3.5 py-2 bg-gradient-to-r from-brand-600 via-sky-600 to-cyan-500 hover:brightness-105 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer shadow-glass-brand border border-white/30"
                        >
                          <span>Book Slot</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ========================================================= */}
      {/* 2. CLINICS & DIAGNOSTIC LABS SECTION (Matches 01_home_dashboard.png) */}
      {/* ========================================================= */}
      {(activeEntityTab === 'all' || activeEntityTab === 'clinics') && (
        <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center font-bold">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  {activeEntityTab === 'all' ? 'Clinics & Diagnostic Pathology Labs' : 'All Clinics & Diagnostic Centers'}
                </h2>
                <p className="text-xs text-slate-500">
                  {filteredClinics.length} certified healthcare centers in {selectedLocation}
                </p>
              </div>
            </div>

            {activeEntityTab === 'all' && filteredClinics.length > 6 && (
              <button
                type="button"
                onClick={() => setActiveEntityTab('clinics')}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center space-x-1 cursor-pointer"
              >
                <span>View All ({filteredClinics.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-slate-100 rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : filteredClinics.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center max-w-md mx-auto space-y-3">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">No clinics found matching criteria</h3>
            <p className="text-xs text-slate-500">
              Try clearing filters or switching location to "All Nepal".
            </p>
            <button
              onClick={() => {
                setSearchQuery('')
                setSelectedSpecialty('all')
                setSelectedLocation('All Nepal')
              }}
              className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredClinics.map((clinic) => {
              const doc = clinic.primaryDoctor
              const isDocInClinic = clinic.hasDocInClinic || doc?.isInClinic
              const selectedDayShort = dateList[selectedDateIndex]?.dayName || 'Mon'
              let scheduleLabel = `Avg ~${clinic.avgConsultationTimeMinutes || 10} min / patient`
              if (clinic.weeklyScheduleJson) {
                try {
                  const parsed = JSON.parse(clinic.weeklyScheduleJson)
                  if (Array.isArray(parsed)) {
                    const match = parsed.find((item: any) =>
                      String(item.day || '').toLowerCase().startsWith(selectedDayShort.toLowerCase())
                    )
                    if (match) {
                      scheduleLabel = match.isOpen === false
                        ? 'Closed on selected day'
                        : `${match.openTime || '09:00 AM'} – ${match.closeTime || '05:00 PM'}`
                    }
                  }
                } catch {}
              }

              const coverPhoto =
                resolveClinicCoverUrl(clinic) ||
                (clinic.pictures && clinic.pictures.length > 0 ? clinic.pictures[0] : null) ||
                clinic.logoUrl

              return (
                <div
                  key={clinic.id}
                  className="group liquid-glass-card rounded-3xl border border-white/80 shadow-glass-md hover:shadow-glass-lg transition-all duration-300 flex flex-col justify-between overflow-hidden"
                >
                  <div>
                    {/* Clinic Photo Banner */}
                    <div className="relative w-full h-40 sm:h-44 bg-slate-100 overflow-hidden">
                      {coverPhoto ? (
                        <img
                          src={coverPhoto}
                          alt={clinic.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-tr from-brand-600 via-brand-500 to-teal-500 flex items-center justify-center text-white">
                          <div className="text-center space-y-1">
                            <Building2 className="w-10 h-10 mx-auto opacity-80" />
                            <span className="text-xs font-bold tracking-wider uppercase opacity-90">Dactor Certified Clinic</span>
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-black/20" />

                      {/* Top Overlay Badges */}
                      <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 right-2.5 sm:right-3 flex flex-wrap items-center justify-between gap-1.5">
                        <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold bg-white/90 text-brand-900 backdrop-blur-md shadow-glass-sm border border-white/80">
                          {clinic.type === 'diagnostic_lab'
                            ? 'Diagnostic Lab'
                            : clinic.type === 'single_visit'
                            ? 'Single-Visit'
                            : 'Multi-Visit'}
                        </span>

                        <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold bg-emerald-500 text-white shadow-xs border border-white/30">
                          <ShieldCheck className="w-3 sm:w-3.5 h-3 sm:h-3.5 mr-1" />
                          Verified
                        </span>
                      </div>

                      {/* Photo Count Indicator */}
                      {clinic.pictures && clinic.pictures.length > 1 && (
                        <div className="absolute bottom-2.5 right-3 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-xs text-[10px] font-bold text-white flex items-center space-x-1 border border-white/20">
                          <Camera className="w-3 h-3" />
                          <span>{clinic.pictures.length} Photos</span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 sm:p-5 space-y-3 sm:space-y-3.5">
                      {/* Clinic Title & Address */}
                      <div>
                        <h3 className="text-base sm:text-lg font-black text-slate-900 line-clamp-1 group-hover:text-brand-600 transition-colors">
                          {clinic.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{clinic.addressText || 'Nepal'}</span>
                        </p>
                      </div>

                      {/* LIVE DOCTOR PHYSICAL PRESENCE & BREAK BANNER */}
                      <div className="space-y-1.5">
                        {clinic.isOnBreak ? (
                          <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 border border-amber-300/60 flex items-center space-x-2 text-amber-800 backdrop-blur-xs">
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 animate-pulse" />
                            <span className="text-[11px] sm:text-xs font-bold leading-tight">
                              Clinic Currently on Short Break • Queue Paused
                            </span>
                          </div>
                        ) : isDocInClinic ? (
                          <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-300/60 flex items-center space-x-2 text-emerald-800 backdrop-blur-xs">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 animate-ping" />
                            <span className="text-[11px] sm:text-xs font-bold leading-tight">
                              Doctor is Physically Inside Clinic Now
                            </span>
                          </div>
                        ) : (
                          <div className="p-2 sm:p-2.5 rounded-xl liquid-glass-subtle border border-white/60 flex items-center space-x-2 text-slate-600">
                            <div className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                            <span className="text-[11px] sm:text-xs font-semibold leading-tight">
                              {clinic.type === 'diagnostic_lab'
                                ? 'Lab Open for Sample Collection'
                                : 'Doctor Away • Available for Next OPD Slot'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Doctor & Schedule Info */}
                      <div className="space-y-2 pt-2 border-t border-slate-100/70">
                        {doc ? (
                          <div className="flex items-center space-x-2.5 text-xs font-bold text-slate-800">
                            <div className="w-8 h-8 rounded-xl bg-brand-50/80 text-brand-800 flex items-center justify-center font-black text-xs shrink-0 overflow-hidden border border-white/80 shadow-xs">
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
                            </div>
                            <div className="truncate">
                              <span className="font-bold text-slate-900 line-clamp-1">{doc.fullName}</span>
                              {doc.specialty && (
                                <span className="text-brand-700 font-medium text-[11px] block truncate">
                                  {doc.specialty}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-600">
                            <Stethoscope className="w-4 h-4 text-brand-600 shrink-0" />
                            <span className="truncate">
                              {clinic.specialties && clinic.specialties.length > 0
                                ? clinic.specialties.slice(0, 2).join(' • ')
                                : 'OPD & Diagnostic Services'}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center space-x-1.5 text-xs font-medium text-slate-600">
                          <Clock className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                          <span className="shrink-0">Schedule:</span>
                          <span className="px-2 py-0.5 rounded-md bg-cyan-50/80 text-cyan-800 font-mono font-bold text-[10px] sm:text-[11px] border border-cyan-200/60 truncate">
                            {scheduleLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Fee & Book OPD Action */}
                  <div className="p-4 pt-3 border-t border-slate-100/70 flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="text-xs font-bold text-slate-800 block truncate">
                        {doc?.consultationFee
                          ? `Fee: Rs. ${doc.consultationFee}`
                          : `Avg: ~${clinic.avgConsultationTimeMinutes || 10}m`}
                      </span>
                      {!isDocInClinic && clinic.type !== 'diagnostic_lab' && (
                        <span className="text-[10px] text-teal-700 font-semibold block">
                          Next slot available
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigate('clinic-detail', { clinicId: clinic.id })}
                      className="px-3.5 py-2 bg-gradient-to-r from-brand-600 via-sky-600 to-cyan-500 hover:brightness-105 text-white font-bold rounded-xl text-xs transition-all shadow-glass-brand border border-white/30 hover:scale-[1.02] active:scale-[0.98] flex items-center space-x-1.5 cursor-pointer shrink-0"
                    >
                      <span>
                        {clinic.type === 'diagnostic_lab'
                          ? 'Book Lab'
                          : isDocInClinic
                          ? 'Book OPD'
                          : 'Book'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
      )}

      {/* ========================================================= */}
      {/* 4 QUICK ACTION TILES (Medical Cyan & Deep Navy Themed) */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Card 1: Find Clinics */}
          <div
            onClick={() => onNavigate('clinics')}
            className="group p-5 sm:p-6 liquid-glass-card rounded-3xl border border-white/80 shadow-glass-md hover:shadow-glass-lg transition-all duration-300 cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-brand-50/80 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors flex items-center justify-center mb-3 sm:mb-4 border border-brand-200/50 shadow-glass-sm backdrop-blur-md">
                <Building2 className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-brand-600 transition-colors">
                Find Clinics & OPD
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Browse polyclinics, check doctor rosters, and inspect transparent working & break hours.
              </p>
            </div>
            <div className="mt-4 sm:mt-5 flex items-center text-xs font-bold text-brand-600 group-hover:translate-x-1 transition-transform">
              <span>Browse Clinics</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </div>

          {/* Card 2: Book Doctor Slot */}
          <div
            onClick={() => onNavigate('clinics')}
            className="group p-5 sm:p-6 liquid-glass-card rounded-3xl border border-white/80 shadow-glass-md hover:shadow-glass-lg transition-all duration-300 cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-cyan-50/80 text-cyan-600 group-hover:bg-cyan-600 group-hover:text-white transition-colors flex items-center justify-center mb-3 sm:mb-4 border border-cyan-200/50 shadow-glass-sm backdrop-blur-md">
                <Stethoscope className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-cyan-600 transition-colors">
                Doctor Consultations
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Book appointment slots with NMC verified specialists. Pay at reception or directly.
              </p>
            </div>
            <div className="mt-4 sm:mt-5 flex items-center text-xs font-bold text-cyan-600 group-hover:translate-x-1 transition-transform">
              <span>Book Doctor Slot</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </div>

          {/* Card 3: Diagnostic Lab Tests */}
          <div
            onClick={() => onNavigate('clinics', { filter: 'diagnostic_lab' })}
            className="group p-5 sm:p-6 liquid-glass-card rounded-3xl border border-white/80 shadow-glass-md hover:shadow-glass-lg transition-all duration-300 cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-sky-50/80 text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-colors flex items-center justify-center mb-3 sm:mb-4 border border-sky-200/50 shadow-glass-sm backdrop-blur-md">
                <FlaskConical className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-sky-600 transition-colors">
                Diagnostic Lab Tests
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Pathology tests with upfront clinic prices and rapid sample collection.
              </p>
            </div>
            <div className="mt-4 sm:mt-5 flex items-center text-xs font-bold text-sky-600 group-hover:translate-x-1 transition-transform">
              <span>Select Lab Tests</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </div>

          {/* Card 4: Verified Lab Reports */}
          <div
            onClick={() => onOpenReportModal()}
            className="group p-5 sm:p-6 liquid-glass-card rounded-3xl border border-white/80 shadow-glass-md hover:shadow-glass-lg transition-all duration-300 cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-brand-50/80 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors flex items-center justify-center mb-3 sm:mb-4 border border-brand-200/50 shadow-glass-sm backdrop-blur-md">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-brand-600 transition-colors">
                Name-Verified Reports
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Track 3-stage lab status (Collected &rarr; Processing &rarr; Ready) and download in-app.
              </p>
            </div>
            <div className="mt-4 sm:mt-5 flex items-center text-xs font-bold text-brand-600 group-hover:translate-x-1 transition-transform">
              <span>Verify & Download</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3-STAGE LAB SYSTEM EXPLAINER SECTION */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="liquid-glass-elevated border border-white/80 rounded-3xl p-6 sm:p-12 shadow-glass-lg relative overflow-hidden">
          {/* Specular Perimeter Line */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] rounded-t-3xl bg-gradient-to-r from-transparent via-white/80 to-transparent" aria-hidden="true" />

          <div className="max-w-3xl space-y-2 sm:space-y-3">
            <span className="text-xs font-bold tracking-wider uppercase text-brand-700 liquid-glass-subtle px-3 py-1 rounded-full border border-brand-200/60 shadow-xs">
              For Diagnostic Lab Clinics & Patients
            </span>
            <h2 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight">
              3-Stage Diagnostic Pipeline with Name-Verified Delivery
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
              Diagnostic centers on Dactor operate on an integrated laboratory pipeline specifically engineered for specimen collection, test pricing, and digital report delivery.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mt-6 sm:mt-8">
            <div className="liquid-glass-subtle p-5 sm:p-6 rounded-2xl border border-white/70 shadow-glass-sm space-y-2 hover:bg-white/80 transition-all">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-100/80 text-amber-800 border border-amber-200/50 flex items-center justify-center font-bold text-sm shadow-xs">
                1
              </div>
              <h4 className="font-black text-slate-900 text-sm sm:text-base">Sample Collected</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                When patient arrives, lab technician marks sample collected with a single tap in operational management.
              </p>
            </div>

            <div className="liquid-glass-subtle p-5 sm:p-6 rounded-2xl border border-white/70 shadow-glass-sm space-y-2 hover:bg-white/80 transition-all">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-cyan-100/80 text-cyan-800 border border-cyan-200/50 flex items-center justify-center font-bold text-sm shadow-xs">
                2
              </div>
              <h4 className="font-black text-slate-900 text-sm sm:text-base">Processing in Lab</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Patient tracking updates automatically to 'Processing'. Real-time progress is shown without calling the lab.
              </p>
            </div>

            <div className="liquid-glass-subtle p-5 sm:p-6 rounded-2xl border border-white/70 shadow-glass-sm space-y-2 hover:bg-white/80 transition-all">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-100/80 text-emerald-800 border border-emerald-200/50 flex items-center justify-center font-bold text-sm shadow-xs">
                3
              </div>
              <h4 className="font-black text-slate-900 text-sm sm:text-base">Prepared & Uploaded</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Lab technician marks prepared and uploads report. Patient unlocks the file with their verified full name.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* DEDICATED HEALTHCARE PORTALS SECTION */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-5 sm:space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600 liquid-glass-subtle px-3 py-1 rounded-full border border-brand-200/60 shadow-xs">
            Dedicated Role Desks
          </span>
          <h2 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Dactor Healthcare Portals
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Separate, secure portals for patients, licensed medical doctors, and healthcare facilities. Strict single-role account exclusivity guaranteed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {/* 1. Patient Portal Card */}
          <div className="liquid-glass-card rounded-3xl p-5 sm:p-8 border border-white/80 shadow-glass-md hover:shadow-glass-lg transition-all flex flex-col justify-between space-y-5 sm:space-y-6 group">
            <div className="space-y-3 sm:space-y-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-brand-50/80 text-brand-700 flex items-center justify-center font-bold shadow-glass-sm border border-brand-200/50 group-hover:scale-105 transition-transform backdrop-blur-md">
                <User className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
                  Patients & Citizens
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 tracking-tight">
                  Patient Health Portal
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Track live OPD queue tokens in real time, view appointment schedules, and download name-verified diagnostic lab reports.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('patient-portal')}
              className="w-full py-3 sm:py-3.5 bg-gradient-to-r from-brand-600 via-sky-600 to-cyan-500 hover:brightness-105 text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center space-x-2 shadow-glass-brand border border-white/30 cursor-pointer active:scale-[0.98]"
            >
              <span>Enter Patient Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* 2. Doctor Portal Card */}
          <div className="liquid-glass-card rounded-3xl p-5 sm:p-8 border border-white/80 shadow-glass-md hover:shadow-glass-lg transition-all flex flex-col justify-between space-y-5 sm:space-y-6 group">
            <div className="space-y-3 sm:space-y-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-50/80 text-emerald-700 flex items-center justify-center font-bold shadow-glass-sm border border-emerald-200/50 group-hover:scale-105 transition-transform backdrop-blur-md">
                <Stethoscope className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  Medical Practitioners
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 tracking-tight">
                  Doctor Consultation Desk
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Live in-cabin physical presence toggle, calling waiting patients, token queue status updates, push alerts, and direct consultation records with NMC credentials.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('doctor-portal')}
              className="w-full py-3 sm:py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-105 text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center space-x-2 shadow-md shadow-emerald-600/20 border border-white/30 cursor-pointer active:scale-[0.98]"
            >
              <span>Enter Doctor Desk</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* 3. Clinic & Lab Portal Card */}
          <div className="liquid-glass-card rounded-3xl p-5 sm:p-8 border border-white/80 shadow-glass-md hover:shadow-glass-lg transition-all flex flex-col justify-between space-y-5 sm:space-y-6 group">
            <div className="space-y-3 sm:space-y-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-50/80 text-indigo-700 flex items-center justify-center font-bold shadow-glass-sm border border-indigo-200/50 group-hover:scale-105 transition-transform backdrop-blur-md">
                <Building2 className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                  Clinics, Hospitals & Labs
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 tracking-tight">
                  Clinic & Lab Center
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Reception walk-in token generation with 10-digit codes, doctor rosters, patient directories, 3-stage pathology pipelines, and billing invoice printing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('portal')}
              className="w-full py-3 sm:py-3.5 bg-gradient-to-r from-indigo-600 to-brand-700 hover:brightness-105 text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center space-x-2 shadow-md shadow-indigo-600/20 border border-white/30 cursor-pointer active:scale-[0.98]"
            >
              <span>Enter Clinic Center</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* PROVIDER ONBOARDING CTA BANNER */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden bg-slate-950/90 backdrop-blur-2xl text-white rounded-3xl p-6 sm:p-12 shadow-glass-modal border border-white/20 flex flex-col lg:flex-row items-center justify-between gap-6 sm:gap-8">
          {/* Specular Perimeter Line */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] rounded-t-3xl bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" aria-hidden="true" />

          <div className="space-y-2 sm:space-y-3 max-w-xl text-left">
            <h2 className="text-xl sm:text-3xl font-black tracking-tight">
              Empower Your Medical Practice with Dactor
            </h2>
            <p className="text-xs sm:text-sm text-cyan-100 font-medium leading-relaxed">
              Connect your clinic or join as an accredited doctor. Real-time token synchronization, zero waiting room clutter, and name-verified lab delivery with pure Google authentication.
            </p>
          </div>

          <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => onNavigate('doctor-portal')}
              className="w-full sm:w-auto justify-center px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-105 text-white font-black rounded-2xl shadow-md border border-white/30 transition-transform active:scale-95 flex items-center space-x-2 text-xs cursor-pointer"
            >
              <Stethoscope className="w-4 h-4" />
              <span>Doctor Portal</span>
            </button>

            <button
              onClick={() => onNavigate('portal')}
              className="w-full sm:w-auto justify-center px-6 py-3.5 bg-white/95 text-brand-900 hover:bg-white font-black rounded-2xl shadow-glass-md border border-white/80 transition-transform active:scale-95 flex items-center space-x-2 text-xs cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>Clinic Portal</span>
            </button>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* FREQUENTLY ASKED QUESTIONS (FAQ ACCORDION) */}
      {/* ========================================================= */}
      <section className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="liquid-glass-elevated border border-white/80 rounded-3xl p-6 sm:p-10 shadow-glass-sm space-y-6 text-left">
          <div className="text-center max-w-xl mx-auto space-y-1">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-100">
              Clear Answers
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Everything you need to know about Dactor's real-time OPD tracking and medical portal.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {[
              {
                q: 'Do I need to download an app to track my OPD queue token?',
                a: 'No! You can track your turn directly on this website using your 10-digit code received on your receipt or SMS. However, installing the Dactor Android app enables rich lock-screen notifications and audio alarm alerts when you are 2 patients away.',
              },
              {
                q: 'How accurate is the estimated consultation arrival time (±15 min)?',
                a: "The estimated time is dynamically calculated using the doctor's real-time average consultation duration and the number of active patients ahead of you. It updates dynamically if an emergency consultation takes longer, keeping you informed in real time.",
              },
              {
                q: 'How do 3-stage diagnostic pathology lab reports work?',
                a: 'When you take a lab test (blood, urine, imaging) at any Dactor partner clinic or diagnostic center, you can track the status through 3 stages: Sample Collected → Processing in Lab → Doctor Certified. Once certified, you can view or download the signed PDF report directly with your phone number and patient name.',
              },
              {
                q: 'How can a polyclinic, hospital, or diagnostic lab join Dactor?',
                a: 'Clinics can digitize their OPD in under 5 minutes without purchasing special hardware. Simply click Clinic Portal to register, set up doctor rosters, issue live SMS tokens, and manage patient queues with zero waiting room congestion.',
              },
            ].map((faq, idx) => {
              const isOpen = openFaqIndex === idx
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200/80 bg-white/70 overflow-hidden shadow-xs transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-4 sm:p-5 flex items-center justify-between gap-4 text-left font-bold text-xs sm:text-sm text-slate-900 hover:text-brand-600 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-brand-600' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-xs text-slate-600 leading-relaxed font-medium animate-in fade-in duration-150 border-t border-slate-100 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 5. DOCTOR PROFILE DETAIL MODAL (Parity with Mobile Search) */}
      {/* ========================================================= */}
      {selectedDoctorForModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedDoctorForModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 p-5 sm:p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Close */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3.5">
                {selectedDoctorForModal.doctor.profilePictureUrl ? (
                  <img
                    src={selectedDoctorForModal.doctor.profilePictureUrl}
                    alt={selectedDoctorForModal.doctor.fullName}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-brand-500 shadow-md"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-500 text-white font-black text-2xl flex items-center justify-center shadow-md">
                    {selectedDoctorForModal.doctor.fullName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Verified Specialist
                    </span>
                    {selectedDoctorForModal.hasDocInClinic && (
                      <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        In Clinic Now
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                    Dr. {selectedDoctorForModal.doctor.fullName}
                  </h2>
                  <p className="text-sm font-bold text-brand-600">
                    {selectedDoctorForModal.doctor.specialty || 'General Practitioner'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDoctorForModal(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Qualifications & License Info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Degrees</span>
                <span className="font-extrabold text-slate-800">{selectedDoctorForModal.doctor.education || 'MBBS'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">NMC Number</span>
                <span className="font-extrabold text-slate-800">{selectedDoctorForModal.doctor.nmcLicenseNumber || 'NMC-Verified'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Experience</span>
                <span className="font-extrabold text-slate-800">{selectedDoctorForModal.doctor.experienceYears || 5}+ Years</span>
              </div>
            </div>

            {/* Bio / Description */}
            {selectedDoctorForModal.doctor.bio && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">About Doctor</h4>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {selectedDoctorForModal.doctor.bio}
                </p>
              </div>
            )}

            {/* Practicing Clinics Section */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center justify-between">
                <span>Practicing Clinics & Hospital OPDs</span>
                <span className="text-[11px] font-bold text-brand-600">
                  {selectedDoctorForModal.practicingClinics.length} Available
                </span>
              </h4>

              {selectedDoctorForModal.practicingClinics.length === 0 ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
                  <p className="font-bold">No active clinic schedules listed.</p>
                  <p className="text-amber-700">Dr. {selectedDoctorForModal.doctor.fullName} is available for private appointments or upcoming roster assignments.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedDoctorForModal.practicingClinics.map((clinic) => (
                    <div
                      key={clinic.id}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-brand-500 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                    >
                      <div>
                        <h5 className="text-sm font-black text-slate-900">{clinic.name}</h5>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{clinic.addressText || clinic.city || 'Nepal'}</span>
                        </p>
                        <p className="text-[11px] font-bold text-emerald-600 mt-1">
                          Fee: Rs. {selectedDoctorForModal.doctor.consultationFee || 500}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const docId = selectedDoctorForModal.doctor.id
                          setSelectedDoctorForModal(null)
                          onNavigate('clinic-detail', {
                            clinicId: clinic.id,
                            doctorId: docId,
                            action: 'book',
                          })
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-brand-600 to-sky-600 hover:from-brand-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center space-x-1 cursor-pointer shrink-0"
                      >
                        <span>Book at this Clinic</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. PRACTICING CLINIC PICKER MODAL (Parity with Mobile Booking) */}
      {/* ========================================================= */}
      {selectedDoctorForClinicPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedDoctorForClinicPicker(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 p-5 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100">
                  Select Practice Location
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
                  Choose Clinic for Dr. {selectedDoctorForClinicPicker.doctor.fullName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  This doctor practices across {selectedDoctorForClinicPicker.practicingClinics.length} locations. Select your preferred clinic to check calendar slots:
                </p>
              </div>

              <button
                onClick={() => setSelectedDoctorForClinicPicker(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 pt-2">
              {selectedDoctorForClinicPicker.practicingClinics.map((clinic) => (
                <div
                  key={clinic.id}
                  onClick={() => {
                    const docId = selectedDoctorForClinicPicker.doctor.id
                    setSelectedDoctorForClinicPicker(null)
                    onNavigate('clinic-detail', {
                      clinicId: clinic.id,
                      doctorId: docId,
                      action: 'book',
                    })
                  }}
                  className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-slate-900 group-hover:text-brand-600 transition-colors">
                      {clinic.name}
                    </h4>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{clinic.addressText || clinic.city || 'Nepal'}</span>
                    </p>
                    <div className="flex items-center space-x-2 text-[11px] font-bold">
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        Fee: Rs. {selectedDoctorForClinicPicker.doctor.consultationFee || 500}
                      </span>
                      <span className="text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                        {clinic.type === 'diagnostic_lab' ? 'Lab OPD' : 'OPD Clinic'}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <div className="w-8 h-8 rounded-xl bg-brand-50 group-hover:bg-brand-600 text-brand-600 group-hover:text-white flex items-center justify-center transition-all shadow-xs">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
