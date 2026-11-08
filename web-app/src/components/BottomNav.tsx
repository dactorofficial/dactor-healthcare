import React from 'react'
import {
  Home,
  Activity,
  FileText,
  User,
  Building2,
  Stethoscope,
  Sparkles,
} from 'lucide-react'

interface BottomNavProps {
  activeTab: string
  setActiveTab: (tab: string, params?: any) => void
  onOpenTrackerModal: () => void
  authRole?: 'clinic_manager' | 'doctor' | 'patient' | null
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenTrackerModal,
  authRole,
}) => {
  // Completely hide mobile bottom navigation bar when inside any specific portal
  if (
    [
      'portal',
      'clinic-portal',
      'admin-portal',
      'doctor-portal',
      'patient-portal',
      'my-health',
      'records',
      'account',
      'book',
    ].includes(activeTab)
  ) {
    return null
  }

  interface NavItem {
    id: string
    label: string
    icon: any
    isAction?: boolean
  }

  // 1:1 Parity with Android App Navigation (PatientMainScreen.kt)
  const navItems: NavItem[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'live-queue', label: 'Track / Queue', icon: Activity },
    { id: 'track-action', label: 'Track', icon: Sparkles, isAction: true },
    { id: 'records', label: 'Records', icon: FileText },
    authRole === 'clinic_manager'
      ? { id: 'portal', label: 'Clinic', icon: Building2 }
      : authRole === 'doctor'
      ? { id: 'doctor-portal', label: 'Doctor', icon: Stethoscope }
      : { id: 'account', label: 'Account', icon: User },
  ]

  return (
    <nav
      className="lg:hidden fixed bottom-2 left-2 right-2 z-40 max-w-md mx-auto liquid-glass-elevated border border-white/80 rounded-3xl shadow-glass-modal pb-safe transition-all duration-200"
      aria-label="Mobile Bottom Navigation"
    >
      {/* Specular Edge Line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] rounded-t-3xl bg-gradient-to-r from-transparent via-white/80 to-transparent" aria-hidden="true" />

      <div className="grid grid-cols-5 items-center px-1.5 py-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          if (item.isAction) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={onOpenTrackerModal}
                className="flex flex-col items-center justify-center -mt-5 group cursor-pointer"
                title="Track Live 10-Digit Token"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-brand-600 via-sky-500 to-cyan-400 text-white shadow-glass-brand border border-white/50 flex items-center justify-center transform active:scale-95 transition-transform">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <span className="text-[10px] font-extrabold text-brand-700 mt-0.5">
                  {item.label}
                </span>
              </button>
            )
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'home') {
                  setActiveTab('home', { intentionalHome: true })
                } else {
                  setActiveTab(item.id)
                }
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all cursor-pointer ${
                isActive
                  ? 'text-brand-700 font-bold bg-white/70 shadow-glass-sm border border-white/60'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-110 stroke-[2.5] text-brand-600' : 'stroke-[1.75]'
                  }`}
                />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-brand-600 shadow-xs shadow-brand-500/50" />
                )}
              </div>
              <span
                className={`text-[10px] mt-0.5 tracking-tight truncate max-w-[58px] ${
                  isActive ? 'font-black text-brand-800' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
