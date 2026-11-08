import type { FC } from 'react'
import { AlertCircle, LayoutDashboard, Building2, UserCog, Globe, ArrowLeft } from 'lucide-react'

interface NotFoundProps {
  currentPath?: string
  onNavigate: (path: string) => void
}

export const NotFound: FC<NotFoundProps> = ({ currentPath, onNavigate }) => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-800/90 border border-slate-700/80 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono font-bold uppercase tracking-wider mb-4">
            404 • Admin Route Not Found
          </div>

          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-700 text-rose-400 flex items-center justify-center my-2 shadow-inner">
            <AlertCircle className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight mt-3 mb-2">
            Console Page Not Found
          </h2>

          <p className="text-sm text-slate-300 max-w-md leading-relaxed mb-4">
            The administrative console route you attempted to access does not exist or has been relocated.
          </p>

          {currentPath && (
            <div className="w-full p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-mono text-slate-400 mb-6">
              Path: <span className="text-indigo-400 font-bold">{currentPath}</span>
            </div>
          )}

          {/* Direct Back / Dashboard Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 w-full">
            <button
              onClick={() => onNavigate('/dashboard')}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/20 transition"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </button>

            <button
              onClick={() => window.history.back()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-600/50 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go Back</span>
            </button>
          </div>

          {/* Quick Shortcuts */}
          <div className="w-full mt-8 pt-6 border-t border-slate-700/70">
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 block mb-3">
              Quick Admin Shortcuts
            </span>
            <div className="grid grid-cols-2 gap-2 text-left">
              <button
                onClick={() => onNavigate('/clinics')}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white transition"
              >
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="truncate">Clinic Verification</span>
              </button>
              <button
                onClick={() => onNavigate('/doctors')}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white transition"
              >
                <UserCog className="w-3.5 h-3.5 text-indigo-400" />
                <span className="truncate">Doctor KYC</span>
              </button>
              <button
                onClick={() => onNavigate('/support-settings')}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white transition col-span-2"
              >
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span className="truncate">Support Website & Helpdesk Publisher</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
export default NotFound
