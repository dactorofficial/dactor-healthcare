import React, { useState } from 'react'
import {
  Compass,
  Home,
  ArrowLeft,
  Search,
  Building2,
  Activity,
  FileText,
  Clock,
  User,
  Headphones,
  Copy,
  Check,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react'
import { GlassCard, GlassButton, GlassBadge, GlassInput } from '../components/glass'

interface NotFoundProps {
  attemptedPath?: string
  onNavigate: (tab: string, params?: any) => void
  onOpenTrackerModal?: () => void
  onOpenReportModal?: () => void
}

export const NotFound: React.FC<NotFoundProps> = ({
  attemptedPath,
  onNavigate,
  onOpenTrackerModal,
  onOpenReportModal,
}) => {
  const [copied, setCopied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const displayPath =
    attemptedPath ||
    (typeof window !== 'undefined'
      ? window.location.pathname + window.location.hash + window.location.search
      : '')

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      onNavigate('clinics', { search: searchQuery.trim() })
    } else {
      onNavigate('clinics')
    }
  }

  return (
    <div className="min-h-[80vh] py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center">
      <div className="w-full max-w-4xl space-y-8 animate-fadeIn">
        {/* Top Hero Glass Card */}
        <GlassCard variant="elevated" className="p-8 sm:p-12 text-center relative overflow-hidden">
          {/* Ambient decorative glow */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center">
            {/* 404 Status Pill */}
            <div className="flex items-center gap-2 mb-4">
              <GlassBadge variant="danger" size="md" className="font-mono tracking-wider font-extrabold px-3 py-1 text-sm">
                HTTP 404 • NOT FOUND
              </GlassBadge>
              <GlassBadge variant="neutral" size="md" className="text-xs font-semibold">
                खोजीएको पृष्ठ भेटिएन
              </GlassBadge>
            </div>

            {/* Glowing Refractive Icon */}
            <div className="relative my-4">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-rose-500/20 via-amber-500/10 to-sky-500/20 border border-white/60 dark:border-white/10 shadow-glass-md flex items-center justify-center backdrop-blur-xl">
                <Compass className="w-12 h-12 text-rose-600 dark:text-rose-400 animate-pulse" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-amber-500/90 text-white flex items-center justify-center shadow-md">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>

            {/* Main Headings */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight mt-2 mb-3">
              Page or Link Not Found
            </h1>
            <p className="max-w-2xl text-base sm:text-lg text-slate-600 font-medium leading-relaxed">
              The healthcare route, booking link, or page you are trying to visit has been moved, expired, or does not exist.
            </p>

            {/* Diagnostic attempted URL snippet */}
            {displayPath && displayPath !== '/' && (
              <div className="mt-5 w-full max-w-xl p-3 rounded-2xl bg-slate-100/90 border border-slate-200/90 flex items-center justify-between gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">
                    Attempted Location
                  </span>
                  <code className="text-xs sm:text-sm font-mono text-rose-600 truncate block font-semibold">
                    {displayPath}
                  </code>
                </div>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyLink}
                  className="shrink-0 flex items-center gap-1.5 text-xs py-1.5 px-3"
                  title="Copy link"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </GlassButton>
              </div>
            )}

            {/* Quick In-Page Search */}
            <form onSubmit={handleSearchSubmit} className="mt-6 w-full max-w-lg">
              <div className="flex gap-2 items-center">
                <div className="flex-1 relative">
                  <GlassInput
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search clinics, doctors, pathology tests..."
                    className="w-full pl-10"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <GlassButton variant="primary" type="submit" size="md">
                  Search
                </GlassButton>
              </div>
            </form>

            {/* Direct Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <GlassButton
                variant="primary"
                size="lg"
                onClick={() => onNavigate('home')}
                className="flex items-center gap-2 font-bold px-6"
              >
                <Home className="w-4 h-4" />
                <span>Return to Home</span>
              </GlassButton>

              <GlassButton
                variant="secondary"
                size="lg"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.history.length > 1) {
                    window.history.back()
                  } else {
                    onNavigate('home')
                  }
                }}
                className="flex items-center gap-2 font-bold px-6"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Go Back</span>
              </GlassButton>

              <GlassButton
                variant="ghost"
                size="lg"
                onClick={() => onNavigate('support')}
                className="flex items-center gap-2 font-bold px-6 text-brand-600 dark:text-brand-400 border border-brand-500/30"
              >
                <Headphones className="w-4 h-4" />
                <span>Contact Support</span>
              </GlassButton>
            </div>
          </div>
        </GlassCard>

        {/* Popular Valid Destinations Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-brand-500" />
              <span>Looking for one of these active healthcare services?</span>
            </h2>
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">
              All routes fully operational
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card 1: Clinics */}
            <GlassCard
              interactive
              onClick={() => onNavigate('clinics')}
              className="p-5 text-left group transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                Find Clinics & Polyclinics
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Browse verified specialist doctors, check NMC licenses, and reserve OPD appointment slots.
              </p>
            </GlassCard>

            {/* Card 2: Live Queue */}
            <GlassCard
              interactive
              onClick={() => {
                if (onOpenTrackerModal) {
                  onOpenTrackerModal()
                } else {
                  onNavigate('live-queue')
                }
              }}
              className="p-5 text-left group transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Activity className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Live OPD Queue Tracker
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Track your active token number, real-time wait minutes, and doctor physical presence.
              </p>
            </GlassCard>

            {/* Card 3: Lab Reports */}
            <GlassCard
              interactive
              onClick={() => {
                if (onOpenReportModal) {
                  onOpenReportModal()
                } else {
                  onNavigate('lab-reports')
                }
              }}
              className="p-5 text-left group transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                Diagnostic Lab Reports
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Check 3-stage specimen progress and download verified pathology PDF test reports.
              </p>
            </GlassCard>

            {/* Card 4: Wait Times */}
            <GlassCard
              interactive
              onClick={() => onNavigate('average-time')}
              className="p-5 text-left group transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                Clinic Wait Times & Hours
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                View Sunday–Saturday clinic operating hours, doctor consultation pace, and holidays.
              </p>
            </GlassCard>

            {/* Card 5: Patient Portal */}
            <GlassCard
              interactive
              onClick={() => onNavigate('patient-portal')}
              className="p-5 text-left group transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <User className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                Patient Health Portal
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Sign in to manage past visits, stored tracking tokens, prescriptions, and health profile.
              </p>
            </GlassCard>

            {/* Card 6: Support */}
            <GlassCard
              interactive
              onClick={() => onNavigate('support')}
              className="p-5 text-left group transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Headphones className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                Dactor Support & Helpdesk
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Need assistance with a broken booking or clinic? Chat with our team or send an inquiry.
              </p>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  )
}
