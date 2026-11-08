import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Building2, UserCog, Activity, CheckCircle, Clock, ArrowRight, Trash2, Headphones, DollarSign, Banknote } from 'lucide-react'

interface DashboardProps {
  onNavigate?: (path: string) => void
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState({
    totalClinics: 0,
    pendingClinics: 0,
    totalDoctors: 0,
    pendingDoctors: 0,
    totalAppointments: 0,
    totalServices: 0,
    archivedClinics: 0,
    openTickets: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      setLoading(true)
      const [
        { count: totalClinics },
        { count: pendingClinics },
        { count: totalDoctors },
        { count: pendingDoctors },
        { count: totalAppointments },
        { count: totalServices },
        { count: archivedClinics },
        { count: openTickets }
      ] = await Promise.all([
        supabase.from('clinics').select('*', { count: 'exact', head: true }).or('is_archived.is.null,is_archived.eq.false'),
        supabase.from('clinics').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending').or('is_archived.is.null,is_archived.eq.false'),
        supabase.from('doctors').select('*', { count: 'exact', head: true }),
        supabase.from('doctors').select('*', { count: 'exact', head: true }).eq('kyc_status', 'pending'),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('clinic_services').select('*', { count: 'exact', head: true }),
        supabase.from('clinics').select('*', { count: 'exact', head: true }).eq('is_archived', true),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).or('type.eq.support_ticket,title.ilike.%[Support%').eq('is_read', false),
      ])

      setStats({
        totalClinics: totalClinics ?? 0,
        pendingClinics: pendingClinics ?? 0,
        totalDoctors: totalDoctors ?? 0,
        pendingDoctors: pendingDoctors ?? 0,
        totalAppointments: totalAppointments ?? 0,
        totalServices: totalServices ?? 0,
        archivedClinics: archivedClinics ?? 0,
        openTickets: openTickets ?? 0,
      })
    } catch (e) {
      console.error('Error fetching dashboard stats:', e)
      setStats({
        totalClinics: 0,
        pendingClinics: 0,
        totalDoctors: 0,
        pendingDoctors: 0,
        totalAppointments: 0,
        totalServices: 0,
        archivedClinics: 0,
        openTickets: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">System Overview</h1>
        <p className="text-slate-400 text-sm mt-1">Real-time status of clinics, doctor KYC, queues, and appointments across Nepal.</p>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Clinics</p>
              <h3 className="text-3xl font-extrabold text-white mt-1.5">{loading ? '...' : stats.totalClinics}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Building2 className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-amber-400 flex items-center gap-1 font-medium">
              <Clock className="w-3.5 h-3.5" /> {stats.pendingClinics} Pending Verification
            </span>
            <div className="flex items-center gap-3">
              {stats.archivedClinics > 0 && onNavigate && (
                <button
                  onClick={() => onNavigate('/recycle-bin')}
                  className="text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1"
                  title="View Recycle Bin"
                >
                  <Trash2 className="w-3 h-3" /> {stats.archivedClinics} Archived
                </button>
              )}
              {onNavigate && (
                <button onClick={() => onNavigate('/clinics')} className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                  Review <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Registered Doctors</p>
              <h3 className="text-3xl font-extrabold text-white mt-1.5">{loading ? '...' : stats.totalDoctors}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <UserCog className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-amber-400 flex items-center gap-1 font-medium">
              <Clock className="w-3.5 h-3.5" /> {stats.pendingDoctors} Pending KYC & NMC
            </span>
            {onNavigate && (
              <button onClick={() => onNavigate('/doctors')} className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                Verify <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Services</p>
              <h3 className="text-3xl font-extrabold text-white mt-1.5">{loading ? '...' : stats.totalServices}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Activity className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle className="w-3.5 h-3.5" /> {stats.totalAppointments} Total Appointments
            </span>
            {onNavigate && (
              <button onClick={() => onNavigate('/editor')} className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                Manage <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Access Action Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-gradient-to-br from-indigo-900/40 to-slate-800 border border-indigo-500/20 p-6 rounded-2xl">
          <h3 className="font-bold text-base text-white">Clinic Onboarding Gatekeeper</h3>
          <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
            Verify new clinic applications, inspect location coordinates in Nepal, and assign operational types (Single-Visit, Multi-Visit, or Diagnostic Lab).
          </p>
          {onNavigate && (
            <button
              onClick={() => onNavigate('/clinics')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
            >
              Open Clinic Verification <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="bg-gradient-to-br from-emerald-900/40 to-slate-800 border border-emerald-500/20 p-6 rounded-2xl">
          <h3 className="font-bold text-base text-white">Doctor KYC & NMC License Center</h3>
          <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
            Examine doctor Nepal Medical Council (NMC) license documents and medical degrees stored in Supabase before approving them for clinic listings.
          </p>
          {onNavigate && (
            <button
              onClick={() => onNavigate('/doctors')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition"
            >
              Review Doctor KYC <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="bg-gradient-to-br from-purple-900/40 to-slate-800 border border-purple-500/20 p-6 rounded-2xl md:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-white">Clinic Activations & Subscription Management</h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed max-w-2xl">
                Track remaining days of clinic licenses, grant 1-month or 12-month activation periods, notify clinics, inspect real-time patient traffic breakdown (today, week, month, total), and manage 30-day archive deletions.
              </p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('/activation')}
                className="whitespace-nowrap px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-md shadow-purple-600/20"
              >
                Manage Activations & Subscriptions <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-950/40 to-slate-800 border border-purple-500/30 p-6 rounded-2xl md:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Headphones className="w-5 h-5 text-purple-400" />
                <span>Support Tickets Desk</span>
                {stats.openTickets > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {stats.openTickets} Pending Triage
                  </span>
                )}
              </h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed max-w-2xl">
                Resolve live patient inquiries, appointment issues, clinic onboarding questions, and diagnostic tracking queries in real time with custom administrator resolution notes.
              </p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('/tickets')}
                className="whitespace-nowrap px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-md shadow-purple-600/20"
              >
                Open Tickets Desk <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-950/40 to-slate-800 border border-amber-500/30 p-6 rounded-2xl md:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Banknote className="w-5 h-5 text-amber-400" />
                <span>Pay at Desk Revenue Tracker & Settlements</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  5% Commission Clearing House
                </span>
              </h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed max-w-2xl">
                Monitor desk-collected counter revenue across all registered clinics in Nepal, track Dactor's 5% platform commission accruals, inspect patient bookings, and issue verified settlement clearing vouchers.
              </p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('/pay-at-desk')}
                className="whitespace-nowrap px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition flex items-center gap-2 shadow-md shadow-amber-500/20"
              >
                Open Desk Settlements <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-950/40 to-slate-800 border border-indigo-500/30 p-6 rounded-2xl md:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <span>Financial & Payment Logs Ledger</span>
              </h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed max-w-2xl">
                Audit clinic subscription renewals (1M &amp; 12M plans), reconcile 5% Pay-at-Desk platform commissions, and track doctor OPD new-patient volume per day and month with one-click CSV and printable reports.
              </p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('/payments')}
                className="whitespace-nowrap px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-md shadow-indigo-600/20"
              >
                Open Payment Logs <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-950/40 to-slate-800 border border-blue-500/30 p-6 rounded-2xl md:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <span>Support Website & Helpdesk Publisher</span>
              </h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed max-w-2xl">
                Configure and publish the official support URL. When doctors and clinics are awaiting verification, or when patients/staff tap &ldquo;Contact Us&rdquo; in settings, they will automatically be routed to your published support site.
              </p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('/support-settings')}
                className="whitespace-nowrap px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-md shadow-blue-600/20"
              >
                Configure Support Website <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
