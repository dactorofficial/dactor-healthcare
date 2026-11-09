import React, { useState, useEffect, useMemo } from 'react'
import {
  Search,
  Building2,
  Stethoscope,
  FlaskConical,
  MapPin,
  Phone,
  Clock,
  ArrowRight,
  Filter,
  CheckCircle2,
  ShieldCheck,
  Star,
  Users,
  Sparkles,
  X,
  History,
} from 'lucide-react'
import { Clinic, Doctor } from '../types'
import { getClinics, getDoctors, resolveClinicCoverUrl } from '../services/db'
import {
  matchClinic,
  QUICK_SPECIALTY_SUGGESTIONS,
  getRecentSearches,
  saveRecentSearch,
} from '../utils/searchEngine'
import { updatePageSEO } from '../utils/seo'
import { MapLibreLocationViewer } from '../components/MapLibreLocationViewer'

interface FindClinicsProps {
  onSelectClinic: (clinicId: string, initialTab?: string) => void
  initialFilter?: string
}

export const FindClinics: React.FC<FindClinicsProps> = ({
  onSelectClinic,
  initialFilter = 'all',
}) => {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMapClinic, setSelectedMapClinic] = useState<Clinic | null>(null)
  const [searchTerm, setSearchTerm] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      return p.get('q') || p.get('search') || p.get('doctor') || p.get('specialty') || p.get('test') || ''
    } catch {
      return ''
    }
  })
  const [filterType, setFilterType] = useState(initialFilter)
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getRecentSearches())

  const clinicDoctorsMap = useMemo(() => {
    const map: Record<string, Doctor[]> = {}
    for (const doc of allDoctors) {
      const cids = [doc.clinicId, (doc as any).primaryClinicId, (doc as any).activeClinicId].filter(Boolean) as string[]
      for (const cid of new Set(cids)) {
        if (!map[cid]) map[cid] = []
        map[cid].push(doc)
      }
    }
    return map
  }, [allDoctors])

  useEffect(() => {
    async function load() {
      try {
        const [data, docList] = await Promise.all([getClinics(), getDoctors()])
        setClinics(data)
        setAllDoctors(docList)
      } catch (err) {
        console.error('Failed to load clinics', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const termClean = searchTerm.trim()
    const title = termClean
      ? `Find ${termClean} in Nepal • Book Online | Dactor`
      : filterType === 'diagnostic_lab'
      ? 'Find Diagnostic Pathology Labs & Scans in Nepal | Dactor'
      : 'Find Clinics & Specialist Doctors in Nepal • Book Online | Dactor'
    const desc = termClean
      ? `Search and book verified ${termClean} specialist doctors, OPD clinics, and diagnostic centers in Kathmandu, Lalitpur, and across Nepal.`
      : 'Browse verified polyclinics, OPD medical centers, and diagnostic laboratories in Nepal. View consultation fees, live queue status, and book appointments online.'
    updatePageSEO({
      title,
      description: desc,
      canonicalUrl: typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}?tab=clinics${termClean ? `&q=${encodeURIComponent(termClean)}` : ''}` : undefined,
    })
  }, [searchTerm, filterType])

  const handleSearchChange = (term: string) => {
    setSearchTerm(term)
    if (term.trim().length >= 3) {
      saveRecentSearch(term)
      setRecentSearches(getRecentSearches())
    }
  }

  const handleSelectQuickSuggestion = (suggestion: string) => {
    // Extract base keyword e.g. "Skin" from "Skin / Dermatologist"
    const keyword = suggestion.split('/')[0].split('&')[0].replace(/\(.*\)/, '').trim()
    setSearchTerm(keyword)
    saveRecentSearch(keyword)
    setRecentSearches(getRecentSearches())
  }

  // Filter and score clinics with MedicalSearchEngine
  const scoredClinics = useMemo(() => {
    return clinics
      .map((clinic) => {
        const t = (clinic.type || '').toLowerCase()
        const n = (clinic.name || '').toLowerCase()
        const isLab =
          t === 'diagnostic_lab' ||
          t.includes('lab') ||
          n.includes('lab') ||
          (clinic.specialties?.some(
            (s) => s.toLowerCase().includes('lab') || s.toLowerCase().includes('patholog')
          ) ?? false)

        const isSingle = !isLab && (t === 'single_visit' || t === 'single_doctor')
        const isPoly = !isLab && !isSingle

        // Category filter check
        if (filterType === 'diagnostic_lab' && !isLab) return null
        if (filterType === 'single_doctor' && !isSingle) return null
        if (filterType === 'polyclinic' && !isPoly) return null

        const clinicDocs = clinicDoctorsMap[clinic.id] || []
        const hasDoctorInClinic = clinicDocs.some(
          (d) => d.isInClinic !== false && (!d.activeClinicId || d.activeClinicId === clinic.id)
        )
        const inClinicDocsCount = clinicDocs.filter(
          (d) => d.isInClinic !== false && (!d.activeClinicId || d.activeClinicId === clinic.id)
        ).length

        // Category / In-Clinic Availability filter check
        if (filterType === 'doctor_in_clinic' && !hasDoctorInClinic) return null
        if (filterType === 'diagnostic_lab' && !isLab) return null
        if (filterType === 'single_doctor' && !isSingle) return null
        if (filterType === 'polyclinic' && !isPoly) return null

        if (!searchTerm.trim()) {
          const baseScore = hasDoctorInClinic ? 30 + inClinicDocsCount * 5 : 10
          return {
            clinic,
            score: baseScore,
            isLab,
            isSingle,
            isPoly,
            matchReason: undefined,
            matchedDoctor:
              clinicDocs.find(
                (d) => d.isInClinic !== false && (!d.activeClinicId || d.activeClinicId === clinic.id)
              ) || clinicDocs[0],
            hasDoctorInClinic,
            inClinicDocsCount,
          }
        }

        const match = matchClinic(clinic, clinicDocs, [], searchTerm)
        if (!match.isMatch) return null

        return {
          clinic,
          score: match.score,
          isLab,
          isSingle,
          isPoly,
          matchReason: match.matchHighlightReason,
          matchedDoctor: match.matchedDoctors?.[0] || clinicDocs[0],
          hasDoctorInClinic,
          inClinicDocsCount,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b?.score || 0) - (a?.score || 0))
  }, [clinics, searchTerm, filterType])

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
      {/* Page Header */}
      <div className="space-y-2 sm:space-y-3">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-teal-500/10 dark:bg-teal-400/10 border border-teal-500/20 text-teal-800 dark:text-teal-300 text-[11px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
          <span>Intelligent Medical Search</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
          Verified Clinics & Diagnostic Labs
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium max-w-2xl">
          Search polyclinics for specialist OPD consultations, single-doctor chambers, or diagnostic pathology labs for tests and packages.
        </p>
      </div>

      {/* Filter and Search Bar Container */}
      <div className="liquid-glass-elevated p-4 sm:p-6 rounded-3xl space-y-4">
        {/* Search Input */}
        <div className="relative w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search symptoms (skin, heart, fever), doctors, or labs..."
            className="w-full px-4 py-3 sm:py-3.5 pl-11 pr-10 liquid-glass-input rounded-2xl text-sm sm:text-base font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all placeholder:font-normal placeholder:text-slate-400"
          />
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 absolute right-3 top-1/2 -translate-y-1/2 rounded-full cursor-pointer transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Recent Search Chips (if available) */}
        {recentSearches.length > 0 && (
          <div className="flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto pb-1 text-xs text-slate-500 scrollbar-none -mx-1 px-1 sm:mx-0 sm:px-0">
            <span className="font-bold flex items-center space-x-1 shrink-0 text-slate-400">
              <History className="w-3.5 h-3.5" />
              <span>Recent:</span>
            </span>
            {recentSearches.map((keyword) => (
              <button
                key={keyword}
                onClick={() => handleSearchChange(keyword)}
                className="px-2.5 py-1 rounded-xl liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 font-semibold shrink-0 cursor-pointer transition text-[11px] active:scale-95"
              >
                {keyword}
              </button>
            ))}
          </div>
        )}

        {/* Quick Specialty Suggestions Chips */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto pb-1 text-xs scrollbar-none -mx-1 px-1 sm:mx-0 sm:px-0">
          <span className="font-bold text-slate-400 dark:text-slate-500 shrink-0 text-[10px] sm:text-[11px] uppercase tracking-wider">
            Quick Symptoms:
          </span>
          {QUICK_SPECIALTY_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => handleSelectQuickSuggestion(suggestion)}
              className="px-2.5 sm:px-3 py-1 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-800 dark:text-teal-300 font-semibold shrink-0 cursor-pointer transition border border-teal-500/20 text-[11px] active:scale-95 backdrop-blur-sm"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* 5 Clinic Category & Availability Filter Tabs */}
        <div className="pt-2 border-t border-slate-200/40 dark:border-white/10 flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1 sm:mx-0 sm:px-0">
          {[
            { id: 'all', label: `All Centers (${clinics.length})`, icon: Building2 },
            { id: 'doctor_in_clinic', label: 'Doctor In Clinic Now', icon: Stethoscope },
            { id: 'single_doctor', label: 'Single-Visit OPD Clinics', icon: Stethoscope },
            { id: 'polyclinic', label: 'Multi-Specialty Polyclinics', icon: Users },
            { id: 'diagnostic_lab', label: 'Diagnostic Pathology Labs', icon: FlaskConical },
          ].map((pill) => {
            const Icon = pill.icon
            const isSelected = filterType === pill.id
            return (
              <button
                key={pill.id}
                onClick={() => setFilterType(pill.id)}
                className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center space-x-1.5 cursor-pointer active:scale-95 ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-glass-base dark:bg-white dark:text-slate-950 border border-slate-700/50 dark:border-white'
                    : 'liquid-glass-subtle text-slate-700 dark:text-slate-300 hover:text-slate-900 hover:bg-white/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{pill.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Clinics Directory Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-72 liquid-glass-card rounded-3xl animate-pulse" />
          ))}
        </div>
      ) : scoredClinics.length === 0 ? (
        <div className="p-12 text-center liquid-glass-card rounded-3xl space-y-3">
          <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">No medical centers matched</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Try adjusting your symptom keyword or clearing category filters.
          </p>
          <button
            onClick={() => {
              setSearchTerm('')
              setFilterType('all')
            }}
            className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl text-xs font-bold hover:shadow-glass-brand active:scale-95 transition cursor-pointer"
          >
            Reset Search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scoredClinics.map((item) => {
            if (!item) return null
            const { clinic, isLab, isSingle, isPoly, matchReason, matchedDoctor } = item

            let hoursText = `Avg ~${clinic.avgConsultationTimeMinutes || 10} min / token`
            if (clinic.weeklyScheduleJson) {
              try {
                const parsed = JSON.parse(clinic.weeklyScheduleJson)
                if (Array.isArray(parsed) && parsed.length > 0) {
                  const openDays = parsed.filter((d: any) => d.isOpen !== false)
                  if (openDays.length > 0) {
                    const first = openDays[0]
                    hoursText = `${first.openTime || '09:00 AM'} – ${first.closeTime || '05:00 PM'}${
                      first.breakStart && first.breakEnd ? ` (Break: ${first.breakStart} – ${first.breakEnd})` : ''
                    }`
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
                className="group liquid-glass-card rounded-3xl flex flex-col justify-between overflow-hidden transition-all duration-300 hover:-translate-y-1"
              >
                <div>
                  {/* Clinic Photo Banner */}
                  <div className="relative w-full h-44 bg-slate-900/10 overflow-hidden">
                    {coverPhoto ? (
                      <img
                        src={coverPhoto}
                        alt={clinic.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          ;(e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-tr from-teal-800 via-teal-700 to-cyan-700 flex items-center justify-center text-white">
                        <div className="text-center space-y-1">
                          <Building2 className="w-10 h-10 mx-auto opacity-80" />
                          <span className="text-xs font-bold tracking-wider uppercase opacity-90">
                            Dactor Healthcare Center
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Gradient Overlay for Legibility */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-black/25" />

                    {/* Top Overlay Badges */}
                    <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 right-2.5 sm:right-3 flex flex-wrap items-center justify-between gap-1.5">
                      <span
                        className={`px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider backdrop-blur-md border border-white/20 shadow-glass-sm ${
                          isLab
                            ? 'bg-purple-600/90 text-white'
                            : isSingle
                            ? 'bg-emerald-600/90 text-white'
                            : 'bg-teal-600/90 text-white'
                        }`}
                      >
                        {isLab
                          ? 'Diagnostic Lab'
                          : isSingle
                          ? 'Single-Visit'
                          : 'Multi-Specialty'}
                      </span>

                      <div className="flex items-center space-x-1.5">
                        {item.hasDoctorInClinic && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-emerald-600/90 text-white shadow-glass-sm border border-white/20 backdrop-blur-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 mr-1 animate-ping" />
                            Doctor In Clinic
                          </span>
                        )}
                        {clinic.isOnBreak && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/90 text-white shadow-glass-sm border border-white/20 backdrop-blur-md">
                            On Break
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-emerald-500/90 text-white shadow-glass-sm border border-white/20 backdrop-blur-md">
                          <ShieldCheck className="w-3 sm:w-3.5 h-3 sm:h-3.5 mr-1" />
                          Verified
                        </span>
                      </div>
                    </div>

                    {/* Bottom Left Photo Count Indicator */}
                    {clinic.pictures && clinic.pictures.length > 1 && (
                      <div className="absolute bottom-2.5 right-3 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white flex items-center space-x-1">
                        <span>📷 {clinic.pictures.length} Photos</span>
                      </div>
                    )}
                  </div>

                  {/* Card Content */}
                  <div className="p-4 sm:p-6 space-y-2.5 sm:space-y-3">
                    {/* Match Reason Highlight Pill */}
                    {matchReason && (
                      <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center space-x-1.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 backdrop-blur-sm">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="truncate">{matchReason}</span>
                      </div>
                    )}

                    {!isLab && matchedDoctor && (
                      <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-xl flex items-center justify-between text-[11px] font-bold text-teal-800 dark:text-teal-300 backdrop-blur-sm">
                        <div className="flex items-center space-x-1.5 truncate">
                          <Stethoscope className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                          <span className="truncate">Attending Doctor: Dr. {matchedDoctor.fullName} ({matchedDoctor.specialty || 'Specialist'})</span>
                        </div>
                        {matchedDoctor.isInClinic !== false && (!matchedDoctor.activeClinicId || matchedDoctor.activeClinicId === clinic.id) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 shrink-0 ml-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-ping" />
                            In Clinic
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold liquid-glass-subtle text-slate-500 shrink-0 ml-1.5">
                            Away
                          </span>
                        )}
                      </div>
                    )}

                    <div>
                      <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors line-clamp-1">
                        {clinic.name}
                      </h3>

                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <div className="flex items-center space-x-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{clinic.addressText || 'Nepal'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedMapClinic(clinic)
                          }}
                          className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline shrink-0 ml-2 cursor-pointer"
                        >
                          View Map
                        </button>
                      </div>
                    </div>

                    {/* Operational Hours Strip */}
                    <div className="p-2 sm:p-2.5 liquid-glass-subtle rounded-xl text-[11px] text-slate-700 dark:text-slate-300 flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span className="truncate font-medium">{hoursText}</span>
                    </div>

                    {/* Specialties Pills */}
                    {clinic.specialties && clinic.specialties.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {clinic.specialties.slice(0, 3).map((s, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-0.5 rounded-lg liquid-glass-subtle text-slate-700 dark:text-slate-300 text-[10px] sm:text-[11px] font-semibold"
                          >
                            {s}
                          </span>
                        ))}
                        {clinic.specialties.length > 3 && (
                          <span className="px-2 py-0.5 rounded-lg liquid-glass-subtle text-slate-500 dark:text-slate-400 text-[10px] sm:text-[11px] font-medium">
                            +{clinic.specialties.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Distinct Action Buttons for the 3 Clinic Types */}
                <div className="p-4 sm:p-6 pt-0 space-y-2">
                  {isLab ? (
                    <div className="space-y-2">
                      <button
                        onClick={() => onSelectClinic(clinic.id, 'lab')}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-bold transition shadow-glass-base active:scale-[0.98] flex items-center justify-center space-x-2 cursor-pointer border-t border-white/20"
                      >
                        <FlaskConical className="w-4 h-4" />
                        <span>Book Lab Tests (No Doctor Required)</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onSelectClinic(clinic.id, 'lab')}
                        className="w-full py-2 liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 rounded-xl text-[11px] font-bold transition cursor-pointer active:scale-[0.98]"
                      >
                        View Test Catalog & Prices
                      </button>
                    </div>
                  ) : isSingle ? (
                    <div className="space-y-2">
                      <button
                        onClick={() => onSelectClinic(clinic.id, 'opd')}
                        className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-bold transition shadow-glass-base active:scale-[0.98] flex items-center justify-center space-x-2 cursor-pointer border-t border-white/20"
                      >
                        <Stethoscope className="w-4 h-4" />
                        <span>Book Specialist Consultation</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onSelectClinic(clinic.id, 'opd')}
                        className="w-full py-2 liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 rounded-xl text-[11px] font-bold transition cursor-pointer active:scale-[0.98]"
                      >
                        Single OPD Token
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        onClick={() => onSelectClinic(clinic.id, 'opd')}
                        className="w-full py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-2xl text-xs font-bold transition shadow-glass-base active:scale-[0.98] flex items-center justify-center space-x-2 cursor-pointer border-t border-white/20"
                      >
                        <Users className="w-4 h-4" />
                        <span>Consult Specialists (Choose Doctor)</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onSelectClinic(clinic.id, 'opd')}
                        className="w-full py-2 liquid-glass-subtle hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 rounded-xl text-[11px] font-bold transition cursor-pointer active:scale-[0.98]"
                      >
                        Follow-Up Visit (FREE with Code)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {/* Clinic Location Viewer Modal */}
      {selectedMapClinic && (
        <MapLibreLocationViewer
          mode="modal"
          isOpen={!!selectedMapClinic}
          onClose={() => setSelectedMapClinic(null)}
          lat={selectedMapClinic.latitude || 27.7052}
          lng={selectedMapClinic.longitude || 85.3193}
          clinicName={selectedMapClinic.name}
          addressText={selectedMapClinic.addressText || 'Nepal'}
        />
      )}
    </div>
  )
}
