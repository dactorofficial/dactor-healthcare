import React, { useState, useEffect } from 'react'
import {
  Clock,
  Activity,
  Users,
  Building2,
  MapPin,
  ArrowRight,
  RefreshCw,
  Stethoscope,
} from 'lucide-react'
import { Clinic, Doctor, Appointment } from '../types'
import { getClinics, getDoctors, getAppointmentsByClinic } from '../services/db'
import { supabase } from '../lib/supabase'

interface AverageTimeProps {
  onSelectClinic?: (clinicId: string) => void
}

interface ClinicWaitTelemetry {
  clinic: Clinic
  doctors: Doctor[]
  waitingCount: number
  insideCount: number
  completedTodayCount: number
  avgMinutesPerPatient: number
  estimatedNewTokenWaitMins: number
}

export const AverageTime: React.FC<AverageTimeProps> = ({ onSelectClinic }) => {
  const [telemetry, setTelemetry] = useState<ClinicWaitTelemetry[]>([])
  const [loading, setLoading] = useState(true)

  const loadLiveTelemetry = async () => {
    setLoading(true)
    try {
      const todayIso = new Date().toISOString().split('T')[0]
      const [clinicsList, doctorsList] = await Promise.all([getClinics(), getDoctors()])
      const activeClinics = clinicsList.filter((c) => !c.isArchived)

      const entries: ClinicWaitTelemetry[] = await Promise.all(
        activeClinics.map(async (c) => {
          const appts: Appointment[] = await getAppointmentsByClinic(c.id, todayIso)
          const waitingCount = appts.filter((a) => a.checkinStatus === 'waiting').length
          const insideCount = appts.filter((a) => a.checkinStatus === 'in_consultation').length
          const completedTodayCount = appts.filter((a) => a.checkinStatus === 'completed').length
          const clinicDocs = doctorsList.filter(
            (d) => d.clinicId === c.id || d.activeClinicId === c.id
          )
          const avgMins =
            c.avgTimeMode === 'manual'
              ? c.manualAvgConsultationTimeMinutes || c.avgConsultationTimeMinutes || 10
              : c.calculatedAvgConsultationTimeMinutes || c.avgConsultationTimeMinutes || 10

          return {
            clinic: c,
            doctors: clinicDocs,
            waitingCount,
            insideCount,
            completedTodayCount,
            avgMinutesPerPatient: avgMins,
            estimatedNewTokenWaitMins: waitingCount * avgMins + (c.isOnBreak ? 20 : 0),
          }
        })
      )

      setTelemetry(entries)
    } catch (err) {
      console.error('Error loading live wait telemetry:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLiveTelemetry()

    const channel = supabase
      .channel('avg-wait-time-telemetry')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clinics' }, () => loadLiveTelemetry())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doctors' }, () => loadLiveTelemetry())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => loadLiveTelemetry())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, () => loadLiveTelemetry())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const totalWaitingAllClinics = telemetry.reduce((acc, t) => acc + t.waitingCount, 0)
  const totalDoctorsInClinicNow = telemetry.reduce(
    (acc, t) => acc + t.doctors.filter((d) => d.isInClinic).length,
    0
  )
  const overallAvgMins =
    telemetry.length > 0
      ? Math.round(
          telemetry.reduce((acc, t) => acc + t.avgMinutesPerPatient, 0) / telemetry.length
        )
      : 0

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-500/10 dark:bg-teal-400/10 text-teal-800 dark:text-teal-300 text-[11px] sm:text-xs font-bold uppercase tracking-wider border border-teal-500/20 backdrop-blur-md">
            <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>Live Queue Telemetry</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
            Real-Time Clinic Wait Times & Queue Speed
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium max-w-2xl leading-relaxed">
            Live consultation speed, waiting queue length, break status, and doctor physical presence synced directly from cloud records.
          </p>
        </div>

        <button
          onClick={loadLiveTelemetry}
          className="w-full sm:w-auto justify-center px-4 py-2.5 liquid-glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-2 shadow-glass-sm cursor-pointer active:scale-95 transition"
        >
          <RefreshCw className={`w-4 h-4 text-teal-600 dark:text-teal-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Telemetry</span>
        </button>
      </div>

      {/* 3 Live Aggregate Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        <div className="liquid-glass-card p-4 sm:p-6 rounded-3xl space-y-2">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 flex items-center justify-center">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {telemetry.length > 0 ? `${overallAvgMins} min` : '—'}
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Live Avg Consultation Time</h3>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Calculated across {telemetry.length} registered clinic{telemetry.length === 1 ? '' : 's'}.
          </p>
        </div>

        <div className="liquid-glass-card p-4 sm:p-6 rounded-3xl space-y-2">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{totalDoctorsInClinicNow}</div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Doctors In Clinic Now</h3>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Real-time physical presence toggled by doctors and clinic desks.
          </p>
        </div>

        <div className="liquid-glass-card p-4 sm:p-6 rounded-3xl space-y-2 sm:col-span-2 lg:col-span-1">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{totalWaitingAllClinics}</div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Patients Waiting Today</h3>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Live queue count across all active OPD and diagnostic centers today.
          </p>
        </div>
      </div>

      {/* Live Per-Clinic Wait Time Breakdown */}
      <div className="space-y-4">
        <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
          Per-Clinic Live Queue & Consultation Pace
        </h2>

        {loading && telemetry.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="h-44 liquid-glass-card rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : telemetry.length === 0 ? (
          <div className="p-8 sm:p-12 liquid-glass-card rounded-3xl text-center space-y-2">
            <Building2 className="w-8 h-8 sm:w-10 sm:h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">No Active Clinics in Database</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Registered clinics will display their live queue speed and wait telemetry here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {telemetry.map((item) => {
              const {
                clinic,
                doctors,
                waitingCount,
                insideCount,
                completedTodayCount,
                avgMinutesPerPatient,
                estimatedNewTokenWaitMins,
              } = item
              const docsInClinic = doctors.filter((d) => d.isInClinic)

              return (
                <div
                  key={clinic.id}
                  className="liquid-glass-card rounded-3xl p-4 sm:p-6 transition-all flex flex-col justify-between space-y-4 sm:space-y-5 hover:-translate-y-1"
                >
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">{clinic.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{clinic.addressText || 'Nepal'}</span>
                        </p>
                      </div>

                      {clinic.isOnBreak ? (
                        <span className="px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 shrink-0 backdrop-blur-sm">
                          On Break
                        </span>
                      ) : docsInClinic.length > 0 ? (
                        <span className="px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 shrink-0 backdrop-blur-sm">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                          Doctor In Clinic
                        </span>
                      ) : (
                        <span className="px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold liquid-glass-subtle text-slate-700 dark:text-slate-300 shrink-0">
                          Open
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 sm:gap-3 text-center">
                      <div className="p-2 sm:p-3 rounded-2xl liquid-glass-subtle border-teal-500/20 min-w-0">
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase text-teal-700 dark:text-teal-300 block truncate">
                          Avg / Patient
                        </span>
                        <span className="text-sm sm:text-lg font-black text-slate-900 dark:text-white block mt-0.5">
                          ~{avgMinutesPerPatient}m
                        </span>
                      </div>
                      <div className="p-2 sm:p-3 rounded-2xl liquid-glass-subtle border-amber-500/20 min-w-0">
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block truncate">
                          In Queue
                        </span>
                        <span className="text-sm sm:text-lg font-black text-slate-900 dark:text-white block mt-0.5">{waitingCount}</span>
                      </div>
                      <div className="p-2 sm:p-3 rounded-2xl liquid-glass-subtle border-emerald-500/20 min-w-0">
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block truncate">
                          Est. Wait
                        </span>
                        <span className="text-sm sm:text-lg font-black text-emerald-700 dark:text-emerald-300 block mt-0.5 truncate">
                          {estimatedNewTokenWaitMins === 0 ? '0m' : `~${estimatedNewTokenWaitMins}m`}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 pt-1 border-t sm:border-0 border-slate-200/50 dark:border-white/10">
                      <span>
                        In Consultation: <strong className="text-slate-800 dark:text-slate-200">{insideCount}</strong>
                      </span>
                      <span>
                        Completed Today: <strong className="text-slate-800 dark:text-slate-200">{completedTodayCount}</strong>
                      </span>
                      <span>
                        Mode:{' '}
                        <strong className="text-slate-800 dark:text-slate-200 uppercase">
                          {clinic.avgTimeMode || 'auto'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {onSelectClinic && (
                    <div className="pt-2 sm:pt-3 border-t border-slate-200/50 dark:border-white/10 flex justify-end">
                      <button
                        onClick={() => onSelectClinic(clinic.id)}
                        className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-glass-sm cursor-pointer active:scale-95 border-t border-white/20"
                      >
                        <span className="truncate">Book Slot at {clinic.name}</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
