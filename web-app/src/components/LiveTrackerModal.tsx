import React, { useState } from 'react'
import {
  X,
  Search,
  Activity,
  CheckCircle2,
  Clock,
  Building2,
  User,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Copy,
  Headphones,
  LifeBuoy,
  Check,
  Calendar,
  MessageSquare,
  ShieldCheck,
  Receipt,
  Stethoscope,
  Phone,
  Download,
} from 'lucide-react'
import {
  getAppointmentByTrackingCode,
  getSupportTicketByCodeOrContact,
  getLinkedConsultations,
  LinkedConsultationsResult,
} from '../services/db'
import { printAppointmentBill, printPrescription } from '../utils/medicalDocPrinter'
import { Appointment, SupportTicket } from '../types'
import { supabase } from '../lib/supabase'
import dactorLogo from '../assets/logo.svg'

interface LiveTrackerModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenFullQueue: (trackingCode: string) => void
  onNavigate?: (tab: string, params?: any) => void
  onNavigateSupport?: (trackingCode?: string) => void
}

export const LiveTrackerModal: React.FC<LiveTrackerModalProps> = ({
  isOpen,
  onClose,
  onOpenFullQueue,
  onNavigate,
  onNavigateSupport,
}) => {
  const [tab, setTab] = useState<'opd' | 'ticket'>('opd')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [linkedConsultations, setLinkedConsultations] = useState<LinkedConsultationsResult | null>(null)
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [searched, setSearched] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [copiedCode, setCopiedCode] = useState(false)

  if (!isOpen) return null

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const handleOpenSupportView = (ticketCode?: string) => {
    if (onNavigateSupport) {
      onNavigateSupport(ticketCode)
    } else {
      window.location.hash = ticketCode
        ? `#support?track=${encodeURIComponent(ticketCode)}`
        : '#support?view=track'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    }
    onClose()
  }

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const query = code.trim()
    if (!query) {
      setErrorMsg('Please enter a tracking code, ticket ID, phone number, or email.')
      return
    }

    const isExplicitTicket =
      tab === 'ticket' ||
      query.toUpperCase().includes('DAC') ||
      query.toUpperCase().includes('TKT') ||
      query.includes('@') ||
      query.startsWith('#')

    setLoading(true)
    setErrorMsg('')
    setAppointment(null)
    setTicket(null)
    setSearched(true)

    try {
      if (isExplicitTicket) {
        setTab('ticket')
        const foundTicket = await getSupportTicketByCodeOrContact(query)
        if (foundTicket) {
          setTicket(foundTicket)
        } else {
          setErrorMsg(
            'No support ticket found matching this Ticket ID, phone, or Gmail. Please check the details.'
          )
        }
      } else {
        const clean = query.replace(/\D/g, '')
        if (clean.length >= 5) {
          const [data, linked] = await Promise.all([
            getAppointmentByTrackingCode(clean),
            getLinkedConsultations(clean),
          ])
          const effective = data || linked?.targetAppointment || null
          if (effective) {
            setAppointment(effective)
            setLinkedConsultations(linked)
            return
          }

          // If tracking code is 10 digits, query minimal public operational queue status
          if (clean.length === 10) {
            const { data: publicRows } = await supabase.rpc('get_public_queue_status', {
              p_tracking_code: clean,
            })
            const publicStatus = Array.isArray(publicRows) && publicRows.length > 0 ? publicRows[0] : null
            if (publicStatus) {
              setAppointment({
                id: '',
                trackingCode10Digit: publicStatus.tracking_code_10_digit,
                patientName: 'Confidential Patient',
                queueNumber: publicStatus.token_number,
                status: publicStatus.status,
                appointmentDate: publicStatus.appointment_date,
                appointmentTime: publicStatus.appointment_time,
                clinic: {
                  id: publicStatus.clinic_id,
                  name: publicStatus.clinic_name,
                } as any,
                doctor: publicStatus.doctor_name
                  ? ({
                      id: publicStatus.doctor_id,
                      fullName: publicStatus.doctor_name,
                      specialty: publicStatus.doctor_specialty,
                    } as any)
                  : null,
              } as any)
              return
            }
          }
        }

        // Fallback: check if the digits match a support ticket phone number
        const fallbackTicket = await getSupportTicketByCodeOrContact(query)
        if (fallbackTicket) {
          setTab('ticket')
          setTicket(fallbackTicket)
        } else {
          setErrorMsg(
            'No active appointment or support ticket found with this code. Please verify and try again.'
          )
        }
      }
    } catch {
      setErrorMsg('Failed to check live status. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_consultation':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 animate-pulse">
            <Activity className="w-3.5 h-3.5 mr-1" />
            Inside Doctor's Cabin
          </span>
        )
      case 'completed':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Consultation Completed
          </span>
        )
      case 'waiting':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300">
            <Clock className="w-3.5 h-3.5 mr-1" />
            In Waiting Queue
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {status.toUpperCase()}
          </span>
        )
    }
  }

  const getTicketStatusBadge = (status: SupportTicket['status']) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600 dark:text-emerald-400" />
            Resolved
          </span>
        )
      case 'in_progress':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/60 animate-pulse">
            <Clock className="w-3.5 h-3.5 mr-1 text-amber-600 dark:text-amber-400" />
            In Review / Active
          </span>
        )
      case 'closed':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60">
            Closed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-300/60">
            <Clock className="w-3.5 h-3.5 mr-1 text-sky-600 dark:text-sky-400" />
            Open & In Queue
          </span>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/50 backdrop-blur-md animate-in fade-in duration-200">
      <div className="liquid-glass-modal rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-8 shadow-glass-modal border border-white/80 dark:border-white/10 relative max-h-[92vh] overflow-y-auto">
        {/* Specular Perimeter Line */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] rounded-t-3xl bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent"
          aria-hidden="true"
        />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 sm:top-5 right-4 sm:right-5 p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-white/60 dark:bg-slate-800/60 hover:bg-white/90 dark:hover:bg-slate-800 border border-white/60 dark:border-white/10 rounded-full transition-colors cursor-pointer shadow-glass-sm"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Dual Tab Mode Switcher */}
        <div className="flex items-center p-1 bg-slate-100/90 dark:bg-slate-800/90 rounded-2xl border border-white/40 dark:border-white/10 mb-5 max-w-sm">
          <button
            type="button"
            onClick={() => {
              setTab('opd')
              setErrorMsg('')
            }}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'opd'
                ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-cyan-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>OPD Queue</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('ticket')
              setErrorMsg('')
            }}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'ticket'
                ? 'bg-gradient-to-r from-indigo-600 to-sky-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Help Request</span>
          </button>
        </div>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-5 sm:mb-6 pr-8">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-brand-50/80 dark:bg-slate-800 text-brand-600 flex items-center justify-center border border-brand-200/50 dark:border-white/10 shadow-glass-sm backdrop-blur-md shrink-0">
            {tab === 'ticket' ? (
              <LifeBuoy className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <img src={dactorLogo} alt="Dactor" className="w-6 h-6 sm:w-7 sm:h-7 object-contain" />
            )}
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
              {tab === 'ticket' ? 'Check Help Request Status' : 'Live OPD Queue Tracker'}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
              {tab === 'ticket'
                ? 'Enter Ticket Code (#DAC-TKT-...), contact phone, or registered Gmail'
                : 'Enter your 10-digit appointment code to see live queue position'}
            </p>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSearch} className="space-y-3 sm:space-y-4">
          <div className="relative">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={
                tab === 'ticket'
                  ? 'e.g. #DAC-TKT-1082 or 98XXXXXXXX or email'
                  : 'e.g. 9812345678 or #DAC-TKT-...'
              }
              maxLength={tab === 'ticket' ? 60 : 25}
              className="w-full px-4 py-3 sm:py-3.5 pl-11 text-sm sm:text-base font-bold text-slate-900 dark:text-white liquid-glass-input rounded-2xl transition-all placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 shadow-glass-sm"
              autoFocus
            />
            <Search className="w-5 h-5 text-brand-600 dark:text-cyan-400 absolute left-3.5 top-3.5 sm:top-4" />
          </div>

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full py-3 sm:py-3.5 bg-gradient-to-r from-brand-600 via-sky-600 to-cyan-500 hover:brightness-105 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-glass-brand border border-white/30 flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.98] text-xs sm:text-sm"
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <Activity className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                <span>Checking Status...</span>
              </span>
            ) : (
              <span>
                {tab === 'ticket' ? 'Track Help Request Status' : 'Check Live OPD Status'}
              </span>
            )}
          </button>
        </form>

        {errorMsg && (
          <div className="mt-3 sm:mt-4 p-3 bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center space-x-2 backdrop-blur-md shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* OPD Appointment Result Card */}
        {searched && appointment && (
          <div className="mt-4 sm:mt-6 p-4 sm:p-5 liquid-glass-base border border-white/80 dark:border-white/10 rounded-2xl sm:rounded-3xl space-y-3.5 sm:space-y-4 animate-in slide-in-from-bottom duration-200 shadow-glass-md">
            <div className="text-center py-1 sm:py-2 space-y-1.5 sm:space-y-2">
              <div className="inline-flex flex-col items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-brand-600 via-sky-500 to-cyan-400 text-white shadow-glass-brand border border-white/40">
                <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase text-cyan-100">TOKEN</span>
                <span className="text-xl sm:text-2xl font-black">#{(appointment as any).queuePosition || 1}</span>
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-300">
                You are in Live OPD Queue
              </h4>
              <div className="inline-flex items-center gap-2">
                <div className="inline-block px-3 py-1 rounded-full bg-brand-50/80 dark:bg-slate-800 text-brand-900 dark:text-cyan-300 border border-brand-200/60 dark:border-white/10 font-mono font-bold text-[11px] sm:text-xs backdrop-blur-xs break-all">
                  10-DIGIT CODE: #{appointment.trackingCode10Digit}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(appointment.trackingCode10Digit)}
                  className="p-1.5 rounded-lg liquid-glass-subtle hover:bg-white/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                  title="Copy 10-Digit Code"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-white/10">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Status</span>
              <div>{getStatusBadge(appointment.checkinStatus)}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 pt-1 text-xs">
              <div>
                <span className="text-slate-400 font-medium text-[11px]">Patient</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm">{appointment.patientName === 'Confidential Patient' ? `Token #${appointment.queueNumber || 1}` : appointment.patientName}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium text-[11px]">Clinic</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm truncate">
                  {appointment.clinic?.name || 'OPD Clinic'}
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-medium text-[11px]">Doctor</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm">
                  {appointment.doctor?.fullName || 'Assigned Specialist'}
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-medium text-[11px]">Slot Time</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm">
                  {appointment.appointmentDate} • {appointment.appointmentTime}
                </p>
              </div>
            </div>

            {/* DUAL CONSULTATION BADGES & SUMMARY */}
            {linkedConsultations && linkedConsultations.isLinked && (
              <div className="p-3 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-teal-900 dark:text-teal-200 flex items-center gap-1">
                    <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                    Dual-Consultation Journey
                  </span>
                  <span className="text-[10px] bg-teal-200/80 dark:bg-teal-900/60 text-teal-900 dark:text-teal-200 font-bold px-2 py-0.5 rounded-full">
                    2 Visits Linked
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-800/80 border border-teal-200/60 dark:border-teal-800">
                    <p className="font-bold text-blue-900 dark:text-blue-300">1. Initial Visit</p>
                    <p className="text-slate-600 dark:text-slate-400">
                      {linkedConsultations.initialAppointment?.appointmentDate || 'Earlier'} • Rs.{' '}
                      {linkedConsultations.initialAppointment?.feeAmount || 500}
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-800/80 border border-teal-200/60 dark:border-teal-800">
                    <p className="font-bold text-teal-900 dark:text-teal-300">2. Follow-Up</p>
                    <p className="text-slate-600 dark:text-slate-400">
                      {linkedConsultations.followupAppointment?.appointmentDate || 'Today'} • Rs. 0 Free
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* QUICK PATIENT ACTION BUTTONS */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-white/10 grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => printAppointmentBill(appointment)}
                className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
              >
                <Receipt className="w-3.5 h-3.5 text-teal-400" />
                <span>Download Bill</span>
              </button>
              <button
                type="button"
                onClick={() => printPrescription(appointment)}
                className="py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
              >
                <Stethoscope className="w-3.5 h-3.5 text-white" />
                <span>Download Rx</span>
              </button>
              {onNavigate && appointment.clinicId && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onNavigate('clinic-detail', {
                      clinicId: appointment.clinicId,
                      doctorId: appointment.doctorId,
                      trackingCode: appointment.trackingCode10Digit,
                      isReschedule: true,
                    })
                  }}
                  className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Reschedule Visit</span>
                </button>
              )}
              {appointment.clinic?.contactPhone && (
                <a
                  href={`tel:${appointment.clinic.contactPhone}`}
                  className="py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-700 transition flex items-center justify-center space-x-1.5 text-center active:scale-95"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Call Reception</span>
                </a>
              )}
            </div>

            <button
              onClick={() => {
                onClose()
                onOpenFullQueue(appointment.trackingCode10Digit)
              }}
              className="w-full mt-2 py-3 bg-gradient-to-r from-slate-900 to-brand-900 hover:from-brand-600 hover:to-cyan-600 text-white text-xs font-bold rounded-xl sm:rounded-2xl transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-glass-sm border border-white/20 active:scale-[0.98]"
            >
              <span>View Full Live Queue Board</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Support Ticket Result Card */}
        {searched && ticket && (
          <div className="mt-4 sm:mt-6 p-4 sm:p-5 liquid-glass-base border border-indigo-200/80 dark:border-indigo-500/30 rounded-2xl sm:rounded-3xl space-y-3.5 sm:space-y-4 animate-in slide-in-from-bottom duration-200 shadow-glass-md">
            {/* Header info */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200/60 dark:border-white/10">
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-xs sm:text-sm text-indigo-700 dark:text-indigo-300">
                  {ticket.ticketCode}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(ticket.ticketCode)}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                  title="Copy Ticket ID"
                >
                  {copiedCode ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              {getTicketStatusBadge(ticket.status)}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold">Category</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {(ticket as any).reasonCategory || ticket.category || 'General Inquiry'}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold">Submitted</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : 'Recent'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-white/10 text-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Your Inquiry Message
              </span>
              <p className="text-slate-700 dark:text-slate-300 line-clamp-3 italic">
                "{ticket.message}"
              </p>
            </div>

            {ticket.adminNotes && (
              <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/70 dark:border-emerald-800 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Official Resolution Notes:</span>
                </div>
                <p className="text-emerald-900 dark:text-emerald-200 leading-relaxed font-medium">
                  {ticket.adminNotes}
                </p>
              </div>
            )}

            <button
              onClick={() => handleOpenSupportView(ticket.ticketCode)}
              className="w-full mt-2 py-3 bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-500 hover:brightness-105 text-white text-xs font-bold rounded-xl sm:rounded-2xl transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-glass-sm border border-white/20 active:scale-[0.98]"
            >
              <span>View Full Ticket Details & Chat Support</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Footer Shortcut to Support */}
        <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-white/10 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Need help with a different request?</span>
          <button
            type="button"
            onClick={() => handleOpenSupportView()}
            className="text-brand-600 dark:text-cyan-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Open Helpdesk</span>
          </button>
        </div>
      </div>
    </div>
  )
}
