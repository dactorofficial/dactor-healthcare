import React, { useState } from 'react'
import {
  Activity,
  Bell,
  LogIn,
  LogOut,
  Menu,
  X,
  Stethoscope,
  Clock,
  FileText,
  Building2,
  Sparkles,
  User,
  Ticket,
  ShieldCheck,
  Headphones,
  Home,
} from 'lucide-react'
import dactorLogo from '../assets/logo.svg'

interface NavbarProps {
  activeTab: string
  setActiveTab: (tab: string, params?: any) => void
  onOpenTrackerModal: () => void
  onOpenReportModal: () => void
  onOpenNotificationModal: () => void
  unreadNotificationsCount?: number
  isLoggedIn?: boolean
  currentUserEmail?: string | null
  authRole?: 'clinic_manager' | 'doctor' | 'patient' | null
  onLogout?: () => void
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenTrackerModal,
  onOpenReportModal,
  onOpenNotificationModal,
  unreadNotificationsCount = 0,
  isLoggedIn = false,
  currentUserEmail,
  authRole,
  onLogout,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Explicit landing page navigation handler that avoids auto-redirection loop
  const navigateToHomeExplicitly = () => {
    try {
      sessionStorage.setItem('dactor_explicit_home', 'true')
      sessionStorage.setItem('dactor_allow_home', 'true')
    } catch {}
    setActiveTab('home', { intentionalHome: true })
    setMobileMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Determine if user is actively in any specific portal workspace
  const isInsidePortal =
    activeTab === 'portal' ||
    activeTab === 'clinic-portal' ||
    activeTab === 'admin-portal' ||
    activeTab === 'doctor-portal' ||
    activeTab === 'patient-portal' ||
    activeTab === 'my-health' ||
    activeTab === 'records' ||
    activeTab === 'account' ||
    activeTab === 'book'

  // Role association logic:
  // If actively in a portal tab, strictly associate with that portal
  // Otherwise fallback to logged-in authRole
  const activePortalRole: 'clinic_manager' | 'doctor' | 'patient' | null =
    activeTab === 'portal' || activeTab === 'clinic-portal' || activeTab === 'admin-portal'
      ? 'clinic_manager'
      : activeTab === 'doctor-portal'
      ? 'doctor'
      : activeTab === 'patient-portal' ||
        activeTab === 'my-health' ||
        activeTab === 'records' ||
        activeTab === 'account' ||
        activeTab === 'book'
      ? 'patient'
      : isLoggedIn
      ? authRole || null
      : null

  // Portal badge metadata for header
  const portalBadge = isInsidePortal
    ? activePortalRole === 'clinic_manager'
      ? {
          label: 'Clinic Center',
          icon: Building2,
          className:
            'bg-brand-50 text-brand-700 border-brand-200/80 dark:bg-brand-950/50 dark:text-brand-300 dark:border-brand-800',
        }
      : activePortalRole === 'doctor'
      ? {
          label: 'Doctor Desk',
          icon: Stethoscope,
          className:
            'bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
        }
      : {
          label: 'Patient Portal',
          icon: User,
          className:
            'bg-sky-50 text-sky-800 border-sky-200/80 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
        }
    : null

  // 1:1 Parity with Android App Navigation (PatientMainScreen.kt)
  const allNavLinks = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'live-queue', label: 'Track / Queue', icon: Activity },
    { id: 'records', label: 'Records', icon: FileText },
    { id: 'account', label: 'Account', icon: User },
    { id: 'clinics', label: 'Find Clinics', icon: Stethoscope },
  ]

  // Strictly remove unassociated portal links from navigation on public pages
  const navLinks = allNavLinks.filter((item) => {
    if (activePortalRole === 'clinic_manager' || activePortalRole === 'doctor') {
      return item.id !== 'records' && item.id !== 'account'
    }
    return true
  })

  return (
    <header className="sticky top-0 z-50 liquid-glass-elevated border-b border-white/60 shadow-glass-md">
      {/* Specular Perimeter Line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 to-transparent" aria-hidden="true" />
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Brand Logo with Real App Icon */}
          <div
            className="flex items-center space-x-2 sm:space-x-3 cursor-pointer group select-none shrink-0"
            onClick={navigateToHomeExplicitly}
          >
            <img
              src={dactorLogo}
              alt="Dactor Logo"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl object-contain shadow-glass-sm group-hover:scale-105 transition-transform duration-200 bg-white/90 backdrop-blur-md border border-white/80 p-0.5"
            />
            <div>
              <div className="flex items-center space-x-1 sm:space-x-1.5 flex-wrap gap-y-1">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 group-hover:text-brand-600 transition-colors">
                  Dactor
                </span>
                <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-brand-100/80 text-brand-800 border border-brand-200/50 shadow-xs tracking-wide uppercase backdrop-blur-xs">
                  Live
                </span>
                {portalBadge && (
                  <span
                    className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold border shadow-xs backdrop-blur-xs transition-all shrink-0 ${portalBadge.className}`}
                  >
                    <portalBadge.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span>{portalBadge.label}</span>
                  </span>
                )}
              </div>
              <p className="hidden sm:block text-[11px] font-medium text-slate-500 tracking-tight leading-none">
                Nepal OPD Queue & Healthcare Ecosystem
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links (Visible only on public pages, completely hidden when inside a portal) */}
          {!isInsidePortal && (
            <nav className="hidden lg:flex items-center space-x-1 p-1 rounded-2xl liquid-glass-subtle border border-white/50">
              {navLinks.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'home') {
                        navigateToHomeExplicitly()
                      } else {
                        setActiveTab(item.id)
                      }
                    }}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-white/95 text-brand-700 font-bold shadow-glass-sm border border-white/80'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </nav>
          )}

          {/* Right Action Buttons */}
          <div className="hidden sm:flex items-center space-x-2.5">
            {/* Quick 10-Digit Code Tracker Button (Hidden when inside any portal) */}
            {!isInsidePortal && (
              <button
                onClick={onOpenTrackerModal}
                className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-brand-700 bg-brand-50/80 hover:bg-brand-100/90 border border-brand-200/80 rounded-xl transition-all duration-150 shadow-glass-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer backdrop-blur-md"
                title="Track live token queue by 10-digit code"
              >
                <Sparkles className="w-3.5 h-3.5 text-brand-600 animate-pulse" />
                <span>Track 10-Digit Code</span>
              </button>
            )}

            {/* Notification Bell (Always accessible in both public and portal views) */}
            <button
              onClick={onOpenNotificationModal}
              className="relative p-2.5 text-slate-600 hover:text-brand-600 bg-white/60 hover:bg-white/90 border border-white/60 rounded-xl shadow-glass-sm transition-colors duration-150 cursor-pointer backdrop-blur-md"
              title="View clinic announcements & notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>

            {/* ========================================================= */}
            {/* PORTAL ACTIONS & AUTH                                     */}
            {/* ========================================================= */}
            {isInsidePortal ? (
              /* CLEAN PORTAL HEADER (No redundant self-navigating launch buttons) */
              <div className="flex items-center space-x-2">
                {currentUserEmail && (
                  <span
                    className="hidden md:inline-flex items-center px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 rounded-xl border border-slate-200 truncate max-w-[170px]"
                    title={currentUserEmail}
                  >
                    {currentUserEmail}
                  </span>
                )}

                {isLoggedIn && onLogout && (
                  <button
                    onClick={onLogout}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </button>
                )}

                <button
                  onClick={navigateToHomeExplicitly}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white/60 hover:bg-white/90 border border-white/60 rounded-xl shadow-glass-sm transition-all cursor-pointer backdrop-blur-md"
                  title="Return to Main Website"
                >
                  <Home className="w-3.5 h-3.5 text-slate-500" />
                  <span className="inline">Main Site</span>
                </button>
              </div>
            ) : activePortalRole === 'clinic_manager' ? (
              /* PUBLIC VIEW: Logged-in Clinic Manager Desk View */
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('portal')}
                  className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-brand-600 text-white shadow-sm border border-brand-600 cursor-pointer"
                  title="Active Clinic & Diagnostic Facility Center"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Clinic Center</span>
                </button>

                {currentUserEmail && (
                  <span
                    className="hidden xl:inline-flex items-center px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-700 rounded-xl border border-slate-200 truncate max-w-[150px]"
                    title={currentUserEmail}
                  >
                    {currentUserEmail}
                  </span>
                )}

                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-xs font-bold cursor-pointer"
                    title="Sign Out of Clinic Center"
                  >
                    Logout
                  </button>
                )}
              </div>
            ) : activePortalRole === 'doctor' ? (
              /* PUBLIC VIEW: Logged-in Doctor Desk View */
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('doctor-portal')}
                  className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white shadow-sm border border-emerald-600 cursor-pointer"
                  title="Active Doctor Consultation Desk"
                >
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>Doctor Desk</span>
                </button>

                {currentUserEmail && (
                  <span
                    className="hidden xl:inline-flex items-center px-2.5 py-1 text-[11px] font-bold bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 truncate max-w-[150px]"
                    title={currentUserEmail}
                  >
                    {currentUserEmail}
                  </span>
                )}

                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-xs font-bold cursor-pointer"
                    title="Sign Out of Doctor Desk"
                  >
                    Logout
                  </button>
                )}
              </div>
            ) : activePortalRole === 'patient' && isLoggedIn ? (
              /* PUBLIC VIEW: Logged-in Patient View */
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('patient-portal')}
                  className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-brand-600 text-white shadow-sm border border-brand-600 cursor-pointer"
                  title="Open Patient Portal"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>My Health</span>
                </button>

                {currentUserEmail && (
                  <span
                    className="hidden xl:inline-flex items-center px-2.5 py-1 text-[11px] font-bold bg-brand-50 text-brand-800 rounded-xl border border-brand-200 truncate max-w-[170px]"
                    title={currentUserEmail}
                  >
                    {currentUserEmail}
                  </span>
                )}

                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-xs font-bold cursor-pointer"
                    title="Sign Out"
                  >
                    Logout
                  </button>
                )}
              </div>
            ) : (
              /* PUBLIC VISITOR VIEW: Standard Portal Choice Buttons */
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('patient-portal')}
                  className={`flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all duration-200 cursor-pointer shadow-glass-sm ${
                    activeTab === 'patient-portal'
                      ? 'bg-gradient-to-r from-brand-600 to-cyan-600 text-white border-white/40 shadow-glass-brand'
                      : 'bg-white/70 text-slate-800 border-white/60 hover:bg-white/90 hover:text-brand-700'
                  }`}
                  title="Open Patient Portal (Appointments, Lab Reports & Bills)"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>My Health</span>
                </button>

                <button
                  onClick={() => setActiveTab('doctor-portal')}
                  className={`flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all duration-200 cursor-pointer shadow-glass-sm ${
                    activeTab === 'doctor-portal'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-white/40 shadow-md shadow-emerald-600/20'
                      : 'bg-white/70 text-emerald-800 border-white/60 hover:bg-white/90'
                  }`}
                  title="Open Doctor Consultation Desk"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Doctor Desk</span>
                </button>

                <button
                  onClick={() => setActiveTab('portal')}
                  className={`flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all duration-200 cursor-pointer shadow-glass-sm ${
                    activeTab === 'portal'
                      ? 'bg-gradient-to-r from-brand-700 to-brand-900 text-white border-white/40 shadow-glass-brand'
                      : 'bg-white/70 text-slate-800 border-white/60 hover:bg-white/90 hover:text-brand-700'
                  }`}
                  title="Open Clinic & Diagnostic Facility Portal"
                >
                  <Building2 className="w-3.5 h-3.5 text-brand-600" />
                  <span>Clinic Center</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile menu button & top-right notification icon */}
          <div className="flex lg:hidden items-center space-x-1.5 sm:space-x-2">
            {!isInsidePortal && (
              <button
                onClick={onOpenTrackerModal}
                className="flex items-center space-x-1 px-3 py-1.5 text-brand-700 bg-brand-50/80 hover:bg-brand-100 border border-brand-200/80 rounded-xl text-xs font-bold cursor-pointer shadow-glass-sm active:scale-95 backdrop-blur-md"
                title="Track live queue"
              >
                <Sparkles className="w-3.5 h-3.5 text-brand-600 animate-pulse" />
                <span>Track</span>
              </button>
            )}

            <button
              onClick={onOpenNotificationModal}
              className="relative p-2 text-slate-600 hover:text-brand-600 bg-white/60 border border-white/60 rounded-xl shadow-glass-sm transition-colors cursor-pointer backdrop-blur-md"
              title="Notifications"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>

            {isInsidePortal && isLoggedIn && onLogout && (
              <button
                onClick={onLogout}
                className="p-2 text-rose-600 hover:text-rose-700 bg-rose-50/80 border border-rose-200/80 rounded-xl shadow-glass-sm transition-colors cursor-pointer"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-700 hover:text-slate-900 bg-white/60 border border-white/60 rounded-xl shadow-glass-sm transition-colors cursor-pointer backdrop-blur-md"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 sm:w-6 sm:h-6" /> : <Menu className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-white/60 liquid-glass-elevated rounded-2xl my-2 p-3 shadow-glass-lg space-y-2 animate-in slide-in-from-top duration-200 max-h-[calc(100vh-5rem)] overflow-y-auto">
            {isInsidePortal ? (
              /* PORTAL VIEW IN MOBILE MENU: Clean, focused portal navigation */
              <div className="space-y-2">
                {currentUserEmail && (
                  <div className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100/90 rounded-xl border border-slate-200/70 truncate flex items-center space-x-2">
                    <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">Signed in: {currentUserEmail}</span>
                  </div>
                )}

                <button
                  onClick={navigateToHomeExplicitly}
                  className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <Home className="w-5 h-5 text-brand-600 shrink-0" />
                  <span>Back to Main Website</span>
                </button>

                {isLoggedIn && onLogout && (
                  <button
                    onClick={() => {
                      onLogout()
                      setMobileMenuOpen(false)
                    }}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            ) : (
              /* PUBLIC VIEW IN MOBILE MENU: Full public links and portal options */
              <>
                {navLinks.map((item) => {
                  const Icon = item.icon
                  const isActive = activeTab === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.id === 'home') {
                          navigateToHomeExplicitly()
                        } else {
                          setActiveTab(item.id)
                          setMobileMenuOpen(false)
                        }
                      }}
                      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-5 h-5 text-brand-600" />
                      <span>{item.label}</span>
                    </button>
                  )
                })}

                <div className="pt-3 border-t border-slate-100 flex flex-col space-y-2">
                  <button
                    onClick={() => {
                      onOpenReportModal()
                      setMobileMenuOpen(false)
                    }}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold text-brand-800 bg-brand-50 border border-brand-200"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Verify & View Lab Report</span>
                  </button>

                  {/* STRICT ROLE-SPECIFIC MOBILE PORTAL BUTTONS */}
                  {activePortalRole === 'clinic_manager' ? (
                    <>
                      <button
                        onClick={() => {
                          setActiveTab('portal')
                          setMobileMenuOpen(false)
                        }}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-600 shadow-sm"
                      >
                        <Building2 className="w-4 h-4" />
                        <span>Clinic & Lab Center</span>
                      </button>
                      {onLogout && (
                        <button
                          onClick={() => {
                            onLogout()
                            setMobileMenuOpen(false)
                          }}
                          className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out from Clinic Center</span>
                        </button>
                      )}
                    </>
                  ) : activePortalRole === 'doctor' ? (
                    <>
                      <button
                        onClick={() => {
                          setActiveTab('doctor-portal')
                          setMobileMenuOpen(false)
                        }}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 shadow-sm"
                      >
                        <Stethoscope className="w-4 h-4" />
                        <span>Doctor Consultation Desk</span>
                      </button>
                      {onLogout && (
                        <button
                          onClick={() => {
                            onLogout()
                            setMobileMenuOpen(false)
                          }}
                          className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out from Doctor Desk</span>
                        </button>
                      )}
                    </>
                  ) : activePortalRole === 'patient' && isLoggedIn ? (
                    <>
                      <button
                        onClick={() => {
                          setActiveTab('patient-portal')
                          setMobileMenuOpen(false)
                        }}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-600 shadow-sm"
                      >
                        <User className="w-4 h-4" />
                        <span>Patient Portal</span>
                      </button>
                      {currentUserEmail && (
                        <div className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-50 rounded-xl truncate">
                          Signed in as: <span className="text-brand-700">{currentUserEmail}</span>
                        </div>
                      )}
                      {onLogout && (
                        <button
                          onClick={() => {
                            onLogout()
                            setMobileMenuOpen(false)
                          }}
                          className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setActiveTab('patient-portal')
                          setMobileMenuOpen(false)
                        }}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-800 bg-slate-100 border border-slate-200"
                      >
                        <User className="w-4 h-4 text-brand-600" />
                        <span>Patient Health Portal</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab('doctor-portal')
                          setMobileMenuOpen(false)
                        }}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        <Stethoscope className="w-4 h-4" />
                        <span>Doctor Consultation Desk</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab('portal')
                          setMobileMenuOpen(false)
                        }}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-brand-600 transition-colors shadow-sm"
                      >
                        <Building2 className="w-4 h-4" />
                        <span>Clinic & Lab Management Portal</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
