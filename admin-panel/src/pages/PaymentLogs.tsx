import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Building2,
  Download,
  Printer,
  Search,
  CheckCircle2,
  Clock,
  UserCheck,
  RefreshCw,
  Plus,
  X,
  Stethoscope,
  ShieldCheck,
  Check,
  Ban,
  ExternalLink,
} from 'lucide-react'

interface PaymentLogsProps {
  onNavigate?: (path: string) => void
}

interface SubscriptionPayment {
  id: string
  clinic_id: string
  amount: number
  payment_method: string
  reference_id: string | null
  receipt_url: string | null
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REFUNDED'
  duration_months: number
  notes: string | null
  metadata: any
  created_at: string
  clinic?: {
    name: string
    email: string
    phone: string
  }
}

interface CommissionSettlement {
  id: string
  clinic_id: string
  period_start: string
  period_end: string
  total_pay_at_desk_amount: number
  platform_fee_amount: number
  commission_rate: number
  status: 'PENDING' | 'INVOICED' | 'SETTLED'
  settled_at: string | null
  settlement_reference: string | null
  notes: string | null
  created_at: string
  clinic?: {
    name: string
    email: string
    phone: string
  }
}

interface AppointmentRow {
  id: string
  clinic_id: string
  doctor_id: string
  patient_name: string
  patient_phone: string
  user_id: string | null
  date: string
  time: string
  status: string
  created_at: string
  clinic?: any
  doctor?: any
}

export default function PaymentLogs({ onNavigate: _onNavigate }: PaymentLogsProps) {
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'commissions' | 'doctors'>('subscriptions')
  const [loading, setLoading] = useState(true)

  // Data
  const [subscriptions, setSubscriptions] = useState<SubscriptionPayment[]>([])
  const [settlements, setSettlements] = useState<CommissionSettlement[]>([])
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [clinics, setClinics] = useState<any[]>([])
  const [doctors, setDoctors] = useState<any[]>([])

  // Filters
  const [selectedClinicId, setSelectedClinicId] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'month' | 'custom'>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modals
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualClinicId, setManualClinicId] = useState('')
  const [manualAmount, setManualAmount] = useState('1500')
  const [manualMonths, setManualMonths] = useState('1')
  const [manualMethod, setManualMethod] = useState('ESEWA')
  const [manualRef, setManualRef] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [submittingManual, setSubmittingManual] = useState(false)

  // Settle modal
  const [settleTarget, setSettleTarget] = useState<CommissionSettlement | null>(null)
  const [settleRef, setSettleRef] = useState('')
  const [settleNotes, setSettleNotes] = useState('')
  const [submittingSettle, setSubmittingSettle] = useState(false)

  // Doctor audit drilldown
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all')

  useEffect(() => {
    fetchInitialData()
  }, [])

  const fetchInitialData = async () => {
    try {
      setLoading(true)

      // Fetch clinics
      const { data: clinicsData } = await supabase
        .from('clinics')
        .select('id, name, email, phone, is_activated, activation_plan, activation_expires_at')
        .order('name', { ascending: true })

      setClinics(clinicsData || [])

      // Fetch doctors
      const { data: doctorsData } = await supabase
        .from('doctors')
        .select('id, name, specialty, consultation_fee, clinic_id')
        .order('name', { ascending: true })

      setDoctors(doctorsData || [])

      // Fetch subscription payments
      const { data: subsData, error: subsErr } = await supabase
        .from('clinic_subscription_payments')
        .select(`
          *,
          clinic:clinics(name, email, phone)
        `)
        .order('created_at', { ascending: false })

      if (subsErr) {
        console.warn('Could not fetch clinic_subscription_payments:', subsErr.message)
      } else {
        setSubscriptions(subsData || [])
      }

      // Fetch commission settlements
      const { data: setsData, error: setsErr } = await supabase
        .from('platform_commission_settlements')
        .select(`
          *,
          clinic:clinics(name, email, phone)
        `)
        .order('created_at', { ascending: false })

      if (setsErr) {
        console.warn('Could not fetch platform_commission_settlements:', setsErr.message)
      } else {
        setSettlements(setsData || [])
      }

      // Fetch appointments for doctor visit analytics
      const { data: apptsData, error: apptsErr } = await supabase
        .from('appointments')
        .select(`
          id, clinic_id, doctor_id, patient_name, patient_phone, user_id, date, time, status, created_at,
          clinic:clinics(name),
          doctor:doctors(name, specialty, consultation_fee)
        `)
        .order('date', { ascending: true })
        .limit(2500)

      if (apptsErr) {
        console.warn('Could not fetch appointments:', apptsErr.message)
      } else {
        setAppointments((apptsData as any[]) || [])
      }
    } catch (err) {
      console.error('Error fetching admin payment logs data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Derive unique patient identifier (Nepal family-phone safe)
  const derivePatientKey = (appt: AppointmentRow): string => {
    if (appt.user_id && appt.user_id.trim()) return appt.user_id.trim()
    const cleanPhone = (appt.patient_phone || '').replace(/\D/g, '')
    const cleanName = (appt.patient_name || '').trim().toLowerCase()
    if (cleanPhone.length >= 7) {
      return `${cleanPhone}|${cleanName}`
    }
    return cleanName || appt.id
  }

  // Filter subscriptions
  const filteredSubscriptions = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const curMonthStr = todayStr.substring(0, 7)

    return subscriptions.filter((sub) => {
      // Clinic filter
      if (selectedClinicId !== 'all' && sub.clinic_id !== selectedClinicId) return false

      // Status filter
      if (statusFilter !== 'all' && sub.status !== statusFilter) return false

      // Date filter
      const subDate = sub.created_at ? sub.created_at.split('T')[0] : ''
      if (dateFilter === 'today' && subDate !== todayStr) return false
      if (dateFilter === 'month' && !subDate.startsWith(curMonthStr)) return false
      if (dateFilter === 'custom') {
        if (startDate && subDate < startDate) return false
        if (endDate && subDate > endDate) return false
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const clinicName = (sub.clinic?.name || '').toLowerCase()
        const ref = (sub.reference_id || '').toLowerCase()
        const notes = (sub.notes || '').toLowerCase()
        if (!clinicName.includes(q) && !ref.includes(q) && !notes.includes(q)) return false
      }

      return true
    })
  }, [subscriptions, selectedClinicId, statusFilter, dateFilter, startDate, endDate, searchQuery])

  // Filter settlements
  const filteredSettlements = useMemo(() => {
    return settlements.filter((settle) => {
      if (selectedClinicId !== 'all' && settle.clinic_id !== selectedClinicId) return false
      if (statusFilter !== 'all' && settle.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const clinicName = (settle.clinic?.name || '').toLowerCase()
        const ref = (settle.settlement_reference || '').toLowerCase()
        if (!clinicName.includes(q) && !ref.includes(q)) return false
      }
      return true
    })
  }, [settlements, selectedClinicId, statusFilter, searchQuery])

  // Doctor visit & new patient analytics
  const doctorAnalytics = useMemo(() => {
    const validAppts = appointments
      .filter((a) => a.status !== 'cancelled' && a.status !== 'rejected')
      .sort((a, b) => {
        const dateA = a.date || a.created_at || ''
        const dateB = b.date || b.created_at || ''
        return dateA.localeCompare(dateB)
      })

    // Track first-seen patient per doctor
    const seenByDoctor = new Map<string, Set<string>>()
    // Map: doctorId -> { doctor, clinic, total, new, followup, revenue, daily: Map<day, {new, followup, revenue}>, monthly: Map<month, {new, followup, revenue}> }
    const docMap = new Map<string, any>()

    for (const appt of validAppts) {
      if (!appt.doctor_id) continue
      if (selectedClinicId !== 'all' && appt.clinic_id !== selectedClinicId) continue

      const pKey = derivePatientKey(appt)
      if (!seenByDoctor.has(appt.doctor_id)) {
        seenByDoctor.set(appt.doctor_id, new Set())
      }
      const seenSet = seenByDoctor.get(appt.doctor_id)!
      const isNew = !seenSet.has(pKey)
      seenSet.add(pKey)

      const docInfo = doctors.find((d) => d.id === appt.doctor_id) || appt.doctor || { name: 'Unknown Doctor', specialty: 'General' }
      const clinicInfo = clinics.find((c) => c.id === appt.clinic_id) || appt.clinic || { name: 'Clinic' }
      const fee = Number(docInfo.consultationFee || docInfo.consultation_fee || 500)

      const apptDate = appt.date || (appt.created_at ? appt.created_at.split('T')[0] : '2026-01-01')
      const apptMonth = apptDate.substring(0, 7)

      if (!docMap.has(appt.doctor_id)) {
        docMap.set(appt.doctor_id, {
          doctorId: appt.doctor_id,
          doctorName: docInfo.name,
          specialty: docInfo.specialty || 'General',
          clinicName: clinicInfo.name,
          clinicId: appt.clinic_id,
          consultationFee: fee,
          totalPatients: 0,
          newPatients: 0,
          followupPatients: 0,
          totalRevenue: 0,
          daily: new Map<string, { newPatients: number; followupPatients: number; revenue: number }>(),
          monthly: new Map<string, { newPatients: number; followupPatients: number; revenue: number }>(),
        })
      }

      const entry = docMap.get(appt.doctor_id)
      entry.totalPatients += 1
      entry.totalRevenue += fee
      if (isNew) {
        entry.newPatients += 1
      } else {
        entry.followupPatients += 1
      }

      // Daily
      if (!entry.daily.has(apptDate)) {
        entry.daily.set(apptDate, { newPatients: 0, followupPatients: 0, revenue: 0 })
      }
      const d = entry.daily.get(apptDate)!
      d.revenue += fee
      if (isNew) d.newPatients += 1
      else d.followupPatients += 1

      // Monthly
      if (!entry.monthly.has(apptMonth)) {
        entry.monthly.set(apptMonth, { newPatients: 0, followupPatients: 0, revenue: 0 })
      }
      const m = entry.monthly.get(apptMonth)!
      m.revenue += fee
      if (isNew) m.newPatients += 1
      else m.followupPatients += 1
    }

    return Array.from(docMap.values())
  }, [appointments, doctors, clinics, selectedClinicId])

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const verifiedSubs = subscriptions.filter((s) => s.status === 'VERIFIED')
    const totalSubRevenue = verifiedSubs.reduce((acc, s) => acc + (Number(s.amount) || 0), 0)

    const pendingSubsCount = subscriptions.filter((s) => s.status === 'PENDING').length

    const totalCommissionSettled = settlements
      .filter((st) => st.status === 'SETTLED')
      .reduce((acc, st) => acc + (Number(st.platform_fee_amount) || 0), 0)

    const totalCommissionPending = settlements
      .filter((st) => st.status !== 'SETTLED')
      .reduce((acc, st) => acc + (Number(st.platform_fee_amount) || 0), 0)

    const grossVolumeTracked = settlements.reduce(
      (acc, st) => acc + (Number(st.total_pay_at_desk_amount) || 0),
      0
    )

    return {
      totalSubRevenue,
      pendingSubsCount,
      totalCommissionSettled,
      totalCommissionPending,
      grossVolumeTracked,
    }
  }, [subscriptions, settlements])

  // Handle Verify Subscription
  const handleVerifySubscription = async (sub: SubscriptionPayment) => {
    if (!confirm(`Verify payment of Rs. ${sub.amount} from ${sub.clinic?.name || 'Clinic'}? This will confirm license activation.`)) return
    try {
      const { error } = await supabase
        .from('clinic_subscription_payments')
        .update({ status: 'VERIFIED', updated_at: new Date().toISOString() })
        .eq('id', sub.id)

      if (error) throw error

      // Extend clinic activation
      const daysToAdd = sub.duration_months === 12 ? 365 : 30
      const newExpiry = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString()

      await supabase
        .from('clinics')
        .update({
          is_activated: true,
          activation_plan: sub.duration_months === 12 ? '12m' : '1m',
          activation_expires_at: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.clinic_id)

      setSubscriptions((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, status: 'VERIFIED' } : s))
      )
      alert(`Payment verified! Clinic license extended for ${daysToAdd} days.`)
    } catch (err: any) {
      console.error('Error verifying payment:', err)
      alert('Verification failed: ' + (err.message || 'Unknown error'))
    }
  }

  // Handle Reject Subscription
  const handleRejectSubscription = async (sub: SubscriptionPayment) => {
    const reason = prompt('Enter rejection reason (e.g. Invalid reference ID, chargeback):')
    if (reason === null) return

    try {
      const { error } = await supabase
        .from('clinic_subscription_payments')
        .update({
          status: 'REJECTED',
          notes: sub.notes ? `${sub.notes} | Rejected: ${reason}` : `Rejected: ${reason}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id)

      if (error) throw error

      setSubscriptions((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, status: 'REJECTED' } : s))
      )
      alert('Subscription payment marked as REJECTED.')
    } catch (err: any) {
      console.error('Error rejecting payment:', err)
      alert('Rejection failed: ' + (err.message || 'Unknown error'))
    }
  }

  // Handle Manual Subscription Creation
  const handleCreateManualSubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualClinicId) {
      alert('Please select a clinic.')
      return
    }

    setSubmittingManual(true)
    try {
      const months = parseInt(manualMonths, 10) || 1
      const amount = parseFloat(manualAmount) || 1500

      const { data, error } = await supabase
        .from('clinic_subscription_payments')
        .insert({
          clinic_id: manualClinicId,
          amount,
          duration_months: months,
          payment_method: manualMethod,
          reference_id: manualRef.trim() || `MANUAL-${Date.now().toString(36).toUpperCase()}`,
          status: 'VERIFIED',
          notes: manualNotes.trim() || 'Super Admin manual license activation',
          metadata: { admin_manual: true, recorded_at: new Date().toISOString() },
        })
        .select(`
          *,
          clinic:clinics(name, email, phone)
        `)
        .single()

      if (error) throw error

      // Auto-extend clinic activation
      const daysToAdd = months === 12 ? 365 : months * 30
      const newExpiry = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString()

      await supabase
        .from('clinics')
        .update({
          is_activated: true,
          activation_plan: months === 12 ? '12m' : '1m',
          activation_paid_amount: amount,
          activation_expires_at: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq('id', manualClinicId)

      setSubscriptions((prev) => [data, ...prev])
      setShowManualModal(false)
      setManualRef('')
      setManualNotes('')
      alert(`Manual payment logged and license renewed for ${daysToAdd} days!`)
    } catch (err: any) {
      console.error('Error saving manual subscription:', err)
      alert('Failed to log payment: ' + (err.message || 'Unknown error'))
    } finally {
      setSubmittingManual(false)
    }
  }

  // Handle Settle Commission
  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settleTarget) return

    setSubmittingSettle(true)
    try {
      const { error } = await supabase
        .from('platform_commission_settlements')
        .update({
          status: 'SETTLED',
          settled_at: new Date().toISOString(),
          settlement_reference: settleRef.trim() || `SETTLE-${Date.now().toString(36).toUpperCase()}`,
          notes: settleNotes.trim() || '5% Platform commission settled with clinic',
          updated_at: new Date().toISOString(),
        })
        .eq('id', settleTarget.id)

      if (error) throw error

      setSettlements((prev) =>
        prev.map((s) =>
          s.id === settleTarget.id
            ? {
                ...s,
                status: 'SETTLED',
                settled_at: new Date().toISOString(),
                settlement_reference: settleRef.trim(),
              }
            : s
        )
      )

      setSettleTarget(null)
      setSettleRef('')
      setSettleNotes('')
      alert('Commission settlement successfully recorded!')
    } catch (err: any) {
      console.error('Error settling commission:', err)
      alert('Settlement failed: ' + (err.message || 'Unknown error'))
    } finally {
      setSubmittingSettle(false)
    }
  }

  // CSV Export for Subscriptions
  const exportSubscriptionsCsv = () => {
    const headers = ['Payment Date', 'Clinic Name', 'Plan', 'Amount (NPR)', 'Method', 'Reference ID', 'Status', 'Notes']
    const rows = filteredSubscriptions.map((s) => [
      s.created_at ? s.created_at.split('T')[0] : '',
      `"${(s.clinic?.name || 'Clinic').replace(/"/g, '""')}"`,
      `${s.duration_months} Month(s)`,
      s.amount,
      s.payment_method,
      `"${(s.reference_id || '').replace(/"/g, '""')}"`,
      s.status,
      `"${(s.notes || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Dactor-Subscription-Payments-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // CSV Export for Doctor Patient Audit
  const exportDoctorAuditCsv = () => {
    const headers = [
      'Doctor Name',
      'Specialty',
      'Clinic Name',
      'Consultation Fee',
      'Total Patients',
      'New Patients',
      'Follow-Up Patients',
      'Total OPD Revenue (NPR)',
    ]
    const rows = doctorAnalytics.map((d) => [
      `"${d.doctorName.replace(/"/g, '""')}"`,
      `"${d.specialty.replace(/"/g, '""')}"`,
      `"${d.clinicName.replace(/"/g, '""')}"`,
      d.consultationFee,
      d.totalPatients,
      d.newPatients,
      d.followupPatients,
      d.totalRevenue,
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Dactor-Doctor-Patient-Analytics-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Printable Financial Audit Statement
  const handlePrintAuditStatement = () => {
    window.print()
  }

  return (
    <div className="space-y-7">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <CreditCard className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Financial & Payment Logs Ledger
            </h1>
          </div>
          <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
            Centralized platform revenue tracking: 1M/12M clinic subscription renewals, 5% pay-at-desk platform commissions, and doctor new-patient OPD audit metrics across Nepal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowManualModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Subscription</span>
          </button>

          <button
            onClick={activeTab === 'doctors' ? exportDoctorAuditCsv : exportSubscriptionsCsv}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrintAuditStatement}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
            title="Print Audit Statement"
          >
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            <span>Print Report</span>
          </button>

          <button
            onClick={fetchInitialData}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 rounded-xl transition disabled:opacity-50"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Subscription Revenue */}
        <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-2xl relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Subscription Revenue
              </p>
              <h3 className="text-2xl font-black text-white mt-1">
                Rs. {summaryMetrics.totalSubRevenue.toLocaleString()}
              </h3>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">1M (Rs 1,500) & 12M (Rs 15,000)</span>
            {summaryMetrics.pendingSubsCount > 0 ? (
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <Clock className="w-3 h-3" /> {summaryMetrics.pendingSubsCount} Pending
              </span>
            ) : (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> All Verified
              </span>
            )}
          </div>
        </div>

        {/* 5% Platform Commission Settled */}
        <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-2xl relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                5% Commission Settled
              </p>
              <h3 className="text-2xl font-black text-indigo-400 mt-1">
                Rs. {summaryMetrics.totalCommissionSettled.toLocaleString()}
              </h3>
            </div>
            <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Pay-at-Desk OPD cut</span>
            <span className="text-amber-400 font-bold">
              Rs. {summaryMetrics.totalCommissionPending.toLocaleString()} Accrued Due
            </span>
          </div>
        </div>

        {/* Gross OPD GMV Tracked */}
        <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-2xl relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Gross OPD Volume
              </p>
              <h3 className="text-2xl font-black text-white mt-1">
                Rs. {summaryMetrics.grossVolumeTracked.toLocaleString()}
              </h3>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Clinic billing throughput</span>
            <span className="text-blue-400 font-bold">{clinics.length} Clinics Active</span>
          </div>
        </div>

        {/* Doctor OPD Patient Count */}
        <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-2xl relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Patients Tracked
              </p>
              <h3 className="text-2xl font-black text-emerald-400 mt-1">
                {appointments.length.toLocaleString()}
              </h3>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Stethoscope className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">First-Visit vs Follow-Up</span>
            <span className="text-slate-300 font-bold">{doctors.length} Doctors</span>
          </div>
        </div>
      </div>

      {/* Tabs & Filters Navigation */}
      <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
          {/* Main Navigation Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'subscriptions'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Clinic Subscriptions ({subscriptions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('commissions')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'commissions'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>5% Pay-at-Desk Settlements ({settlements.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('doctors')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'doctors'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Doctor Daily / Monthly Patient Tracker</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          {/* Clinic Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Filter by Clinic
            </label>
            <select
              value={selectedClinicId}
              onChange={(e) => setSelectedClinicId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Clinics ({clinics.length})</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Search Reference / Notes
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ref ID or notes..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="VERIFIED">Verified / Settled</option>
              <option value="PENDING">Pending Verification</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Date Period
            </label>
            <select
              value={dateFilter}
              onChange={(e: any) => setDateFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Recorded Dates</option>
              <option value="today">Today Only</option>
              <option value="month">This Month</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>
        </div>

        {/* Custom Date Inputs if selected */}
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-3 pt-2 border-t border-slate-700/40">
            <div>
              <span className="text-[10px] text-slate-400 block mb-0.5">From Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block mb-0.5">To Date</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: CLINIC SUBSCRIPTIONS & LICENSE RENEWALS */}
      {activeTab === 'subscriptions' && (
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-4 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Clinic Subscription & License Renewal Payments</span>
            </h2>
            <span className="text-xs text-slate-400">
              Showing {filteredSubscriptions.length} of {subscriptions.length} entries
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 border-b border-slate-700/80 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Clinic Name</th>
                  <th className="py-3 px-4">Plan / Duration</th>
                  <th className="py-3 px-4">Amount (NPR)</th>
                  <th className="py-3 px-4">Method & Ref ID</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Notes / Metadata</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredSubscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                      No subscription payment logs match the active filters.
                    </td>
                  </tr>
                ) : (
                  filteredSubscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4 text-slate-300 font-mono">
                        {sub.created_at ? sub.created_at.split('T')[0] : '–'}
                      </td>
                      <td className="py-3 px-4 font-bold text-white">
                        <div>{sub.clinic?.name || 'Clinic'}</div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {sub.clinic?.phone || sub.clinic?.email || ''}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {sub.duration_months === 12 ? '12 Months (Annual)' : `${sub.duration_months} Month(s)`}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-black text-emerald-400 font-mono text-sm">
                        Rs. {sub.amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{sub.payment_method}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {sub.reference_id || '–'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            sub.status === 'VERIFIED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : sub.status === 'PENDING'
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 max-w-xs truncate" title={sub.notes || ''}>
                        {sub.notes || '–'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {sub.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleVerifySubscription(sub)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 shadow-sm"
                                title="Verify & Extend License"
                              >
                                <Check className="w-3 h-3" />
                                <span>Verify</span>
                              </button>
                              <button
                                onClick={() => handleRejectSubscription(sub)}
                                className="px-2 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                                title="Reject"
                              >
                                <Ban className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          {sub.receipt_url && (
                            <a
                              href={sub.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-indigo-400 hover:text-indigo-300 transition"
                              title="View Receipt Attachment"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: 5% PAY-AT-DESK COMMISSION SETTLEMENTS */}
      {activeTab === 'commissions' && (
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg space-y-4">
          <div className="p-4 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                <span>5% Pay-at-Desk Platform Service Charge Ledger</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Per-clinic platform commission accruals calculated at 5% on patient Pay-at-Desk bills.
              </p>
            </div>
            <span className="text-xs text-slate-400">
              Showing {filteredSettlements.length} settlement periods
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 border-b border-slate-700/80 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Billing Period</th>
                  <th className="py-3 px-4">Clinic Name</th>
                  <th className="py-3 px-4">Gross OPD Volume</th>
                  <th className="py-3 px-4">Platform Fee (5%)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Settled At / Ref</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredSettlements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                      No platform commission settlement records found.
                    </td>
                  </tr>
                ) : (
                  filteredSettlements.map((setRow) => (
                    <tr key={setRow.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {setRow.period_start} → {setRow.period_end}
                      </td>
                      <td className="py-3 px-4 font-bold text-white">
                        {setRow.clinic?.name || 'Clinic'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-300">
                        Rs. {setRow.total_pay_at_desk_amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono font-black text-indigo-400 text-sm">
                        Rs. {setRow.platform_fee_amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            setRow.status === 'SETTLED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {setRow.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {setRow.settled_at ? (
                          <div>
                            <span className="text-slate-200 font-mono">{setRow.settled_at.split('T')[0]}</span>
                            {setRow.settlement_reference && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                Ref: {setRow.settlement_reference}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">–</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-300 max-w-xs truncate" title={setRow.notes || ''}>
                        {setRow.notes || '–'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {setRow.status !== 'SETTLED' ? (
                          <button
                            onClick={() => {
                              setSettleTarget(setRow)
                              setSettleRef('')
                              setSettleNotes('')
                            }}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold transition shadow-sm"
                          >
                            Mark Settled
                          </button>
                        ) : (
                          <span className="text-emerald-400 font-bold text-[10px] flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Settled
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DOCTOR DAILY & MONTHLY NEW PATIENT TRACKER */}
      {activeTab === 'doctors' && (
        <div className="space-y-6">
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-700/60">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span>Doctor OPD Visit & New Patient Audit Tracker</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Tracks how many <strong>New Patients</strong> (first time visiting this doctor) vs <strong>Follow-up Patients</strong> every doctor has consulted on each day and month.
                </p>
              </div>

              {/* Doctor filter dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Dr:</span>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Doctors ({doctorAnalytics.length})</option>
                  {doctorAnalytics.map((d) => (
                    <option key={d.doctorId} value={d.doctorId}>
                      {d.doctorName} ({d.clinicName})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Doctor Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
              {doctorAnalytics
                .filter((doc) => (selectedDoctorId === 'all' ? true : doc.doctorId === selectedDoctorId))
                .map((doc) => (
                  <div
                    key={doc.doctorId}
                    className="bg-slate-900/80 border border-slate-700/70 p-4 rounded-xl space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-white text-sm">{doc.doctorName}</h3>
                        <p className="text-[11px] text-indigo-300 font-medium">{doc.specialty}</p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3" /> {doc.clinicName}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                        Rs. {doc.consultationFee} OPD
                      </span>
                    </div>

                    {/* Patient Ratio Breakdown */}
                    <div className="grid grid-cols-3 gap-2 py-2 bg-slate-800/60 rounded-xl px-3 text-center border border-slate-700/40">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">Total Visits</span>
                        <span className="text-base font-black text-white">{doc.totalPatients}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-emerald-400 block font-bold">New Patients</span>
                        <span className="text-base font-black text-emerald-400">{doc.newPatients}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-blue-400 block font-bold">Follow-Up</span>
                        <span className="text-base font-black text-blue-400">{doc.followupPatients}</span>
                      </div>
                    </div>

                    {/* Total Estimated Revenue */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                      <span className="text-slate-400 font-medium">Estimated OPD GMV:</span>
                      <span className="font-mono font-black text-white text-sm">
                        Rs. {doc.totalRevenue.toLocaleString()}
                      </span>
                    </div>

                    {/* Daily & Monthly Summary Accordion */}
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Recent Daily Breakdowns:
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                        {Array.from(doc.daily.entries())
                          .slice(-5)
                          .reverse()
                          .map((entry: any) => {
                            const [day, stats] = entry;
                            return (
                            <div
                              key={day}
                              className="flex items-center justify-between text-[11px] bg-slate-800/40 px-2.5 py-1 rounded-lg"
                            >
                              <span className="font-mono text-slate-300">{day}</span>
                              <div className="flex items-center gap-2 font-mono">
                                <span className="text-emerald-400 font-bold" title="New patients seen on this day">
                                  +{stats.newPatients} New
                                </span>
                                <span className="text-slate-500">•</span>
                                <span className="text-blue-400" title="Follow-up visits">
                                  {stats.followupPatients} F/U
                                </span>
                                <span className="text-slate-500">•</span>
                                <span className="text-white font-bold">Rs. {stats.revenue}</span>
                              </div>
                            </div>
                          )})}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL SUBSCRIPTION ENTRY */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">Record Clinic Subscription Payment</h3>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateManualSubscription} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Select Clinic
                </label>
                <select
                  value={manualClinicId}
                  onChange={(e) => setManualClinicId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                >
                  <option value="">-- Choose Clinic --</option>
                  {clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone || c.email || 'No contact'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Plan Duration
                  </label>
                  <select
                    value={manualMonths}
                    onChange={(e) => {
                      setManualMonths(e.target.value)
                      if (e.target.value === '12') setManualAmount('15000')
                      else setManualAmount('1500')
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="1">1 Month (30 Days)</option>
                    <option value="12">12 Months (1 Year)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Amount (NPR)
                  </label>
                  <input
                    type="number"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Payment Method
                  </label>
                  <select
                    value={manualMethod}
                    onChange={(e) => setManualMethod(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="ESEWA">eSewa Wallet</option>
                    <option value="KHALTI">Khalti Wallet</option>
                    <option value="FONEPAY">Fonepay QR / Direct Banking</option>
                    <option value="CONNECTIPS">ConnectIPS Direct Bank</option>
                    <option value="BANK_TRANSFER">Direct Bank Deposit / QR</option>
                    <option value="CASH">Cash / Offline Handover</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Transaction Ref / Code
                  </label>
                  <input
                    type="text"
                    value={manualRef}
                    onChange={(e) => setManualRef(e.target.value)}
                    placeholder="e.g. ESW-8472910"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Notes / Audit Remarks
                </label>
                <textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="e.g. Clinic renewal approved by Super Admin after bank statement verification"
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingManual}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {submittingManual ? 'Recording & Extending...' : 'Save & Renew License'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SETTLE COMMISSION */}
      {settleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <h3 className="text-base font-bold text-white">Confirm Commission Settlement</h3>
              <button
                onClick={() => setSettleTarget(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/60 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Clinic:</span>
                <span className="font-bold text-white">{settleTarget.clinic?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Period:</span>
                <span className="font-mono text-slate-300">{settleTarget.period_start} → {settleTarget.period_end}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Gross OPD Pay-at-Desk:</span>
                <span className="font-mono text-slate-300">Rs. {settleTarget.total_pay_at_desk_amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800">
                <span className="text-slate-400 font-bold">5% Platform Commission:</span>
                <span className="font-mono font-black text-emerald-400 text-sm">
                  Rs. {settleTarget.platform_fee_amount.toLocaleString()}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmSettlement} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Settlement Transaction Reference
                </label>
                <input
                  type="text"
                  value={settleRef}
                  onChange={(e) => setSettleRef(e.target.value)}
                  placeholder="e.g. BANK-TRF-902148"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Settlement Remarks / Receipt Note
                </label>
                <textarea
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="e.g. Received via clinic monthly reconciliation invoice"
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setSettleTarget(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSettle}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {submittingSettle ? 'Recording Settlement...' : 'Confirm Settled'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
