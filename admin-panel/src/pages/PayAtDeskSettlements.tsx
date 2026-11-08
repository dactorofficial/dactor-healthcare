import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  Banknote,
  Search,
  RefreshCw,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Download,
  Printer,
  X,
  Receipt,
  Check,
  Percent,
  Calendar,
  Phone,
  MapPin,
  Info
} from 'lucide-react'

interface PayAtDeskSettlementsProps {
  onNavigate?: (path: string) => void
}

interface Clinic {
  id: string
  name: string
  city?: string
  address?: string
  phone?: string
  contact_email?: string
  email?: string
  clinic_type?: string
  is_activated?: boolean
  code?: string
}

interface DeskAppointment {
  id: string
  tracking_code_10_digit: string
  clinic_id: string
  doctor_id?: string | null
  patient_name: string
  patient_mobile: string
  fee_amount: number
  service_charge_amount: number
  total_amount: number
  appointment_date: string
  appointment_time: string
  status: string
  payment_mode: string
  payment_status?: string | null
  checkin_status?: string | null
  created_at: string
  doctor_name?: string
  doctor_specialty?: string
  clinic_name?: string
}

interface PlatformSettlement {
  id: string
  clinic_id: string
  period_start: string
  period_end: string
  appointments_count: number
  gross_desk_amount_npr: number
  commission_amount_npr: number
  payment_method: string
  transaction_reference: string | null
  status: string
  notes: string | null
  recorded_by_email: string | null
  settled_at: string
  created_at: string
  clinic?: any
}

interface ClinicDeskAggregation {
  clinic: Clinic
  totalDeskAppointments: number
  grossDeskRevenue: number
  accruedCommission5Pct: number
  settledCommission: number
  balanceDue: number
  status: 'PENDING_SETTLEMENT' | 'FULLY_SETTLED' | 'NO_ACTIVITY'
  lastSettledAt: string | null
  settlementsCount: number
}

export default function PayAtDeskSettlements({ onNavigate: _onNavigate }: PayAtDeskSettlementsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'vouchers' | 'bookings'>('overview')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [adminUserEmail, setAdminUserEmail] = useState<string>('')

  // Data
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [deskAppointments, setDeskAppointments] = useState<DeskAppointment[]>([])
  const [settlements, setSettlements] = useState<PlatformSettlement[]>([])

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SETTLED' | 'NO_ACTIVITY'>('ALL')
  const [dateRangeFilter, setDateRangeFilter] = useState<'ALL' | 'TODAY' | 'THIS_MONTH' | 'LAST_30_DAYS' | 'CUSTOM'>('ALL')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Settle Modal state
  const [showSettleModal, setShowSettleModal] = useState(false)
  const [settleClinicId, setSettleClinicId] = useState<string>('')
  const [settlePeriodStart, setSettlePeriodStart] = useState<string>('')
  const [settlePeriodEnd, setSettlePeriodEnd] = useState<string>('')
  const [settleGrossAmount, setSettleGrossAmount] = useState<number>(0)
  const [settleCommissionAmount, setSettleCommissionAmount] = useState<number>(0)
  const [settleBookingsCount, setSettleBookingsCount] = useState<number>(0)
  const [settlePaymentMethod, setSettlePaymentMethod] = useState<string>('BANK_TRANSFER')
  const [settleReference, setSettleReference] = useState<string>('')
  const [settleStatus, setSettleStatus] = useState<string>('settled')
  const [settleNotes, setSettleNotes] = useState<string>('')
  const [isSubmittingSettle, setIsSubmittingSettle] = useState(false)

  // Clinic Bookings Drilldown Modal state
  const [selectedClinicForDrilldown, setSelectedClinicForDrilldown] = useState<Clinic | null>(null)
  const [drilldownSearch, setDrilldownSearch] = useState('')

  // Printable Voucher Receipt Modal state
  const [activeVoucherForPrint, setActiveVoucherForPrint] = useState<PlatformSettlement | null>(null)

  useEffect(() => {
    loadAllData()
    // Fetch logged in admin email
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.email) {
        setAdminUserEmail(data.session.user.email)
      }
    })
  }, [])

  const loadAllData = async () => {
    try {
      setLoading(true)

      // 1. Fetch clinics
      const { data: clinicsData, error: clinicErr } = await supabase
        .from('clinics')
        .select('id, name, city, address, phone, contact_email, email, clinic_type, is_activated, code')
        .eq('is_archived', false)
        .order('name', { ascending: true })

      if (clinicErr) throw clinicErr
      setClinics(clinicsData || [])

      // 2. Fetch doctors for quick lookup
      const { data: docsData } = await supabase
        .from('doctors')
        .select('id, name, full_name, specialty')
      const docLookup = new Map<string, { name: string; specialty: string }>()
      if (docsData) {
        docsData.forEach((d: any) => {
          docLookup.set(d.id, {
            name: d.full_name || d.name || 'Doctor',
            specialty: d.specialty || 'General',
          })
        })
      }

      // 3. Fetch all PAY_AT_DESK appointments
      const { data: apptsData, error: apptErr } = await supabase
        .from('appointments')
        .select(`
          id,
          tracking_code_10_digit,
          clinic_id,
          doctor_id,
          patient_name,
          patient_mobile,
          fee_amount,
          service_charge_amount,
          total_amount,
          appointment_date,
          appointment_time,
          status,
          payment_mode,
          payment_status,
          checkin_status,
          created_at
        `)
        .eq('payment_mode', 'PAY_AT_DESK')
        .order('appointment_date', { ascending: false })

      if (apptErr) throw apptErr

      const mappedAppts: DeskAppointment[] = (apptsData || []).map((a: any) => {
        const doc = a.doctor_id ? docLookup.get(a.doctor_id) : undefined
        const cln = clinicsData?.find((c) => c.id === a.clinic_id)
        const fee = Number(a.fee_amount) || 0
        // Service charge is 5% platform fee
        let sCharge = Number(a.service_charge_amount) || 0
        if (sCharge === 0 && fee > 0) {
          sCharge = Math.round(fee * 0.05 * 100) / 100
        }
        const tot = Number(a.total_amount) || (fee + sCharge)

        return {
          id: a.id,
          tracking_code_10_digit: a.tracking_code_10_digit || a.id.substring(0, 10).toUpperCase(),
          clinic_id: a.clinic_id,
          doctor_id: a.doctor_id,
          patient_name: a.patient_name || 'Walk-in Patient',
          patient_mobile: a.patient_mobile || '',
          fee_amount: fee,
          service_charge_amount: sCharge,
          total_amount: tot,
          appointment_date: a.appointment_date || (a.created_at ? a.created_at.split('T')[0] : ''),
          appointment_time: a.appointment_time || '',
          status: a.status || 'APPROVED',
          payment_mode: a.payment_mode || 'PAY_AT_DESK',
          payment_status: a.payment_status || 'unpaid',
          checkin_status: a.checkin_status || 'not_checked_in',
          created_at: a.created_at || new Date().toISOString(),
          doctor_name: doc?.name,
          doctor_specialty: doc?.specialty,
          clinic_name: cln?.name || 'Clinic',
        }
      })
      setDeskAppointments(mappedAppts)

      // 4. Fetch platform commission settlements
      const { data: setsData, error: setsErr } = await supabase
        .from('platform_commission_settlements')
        .select(`
          id,
          clinic_id,
          period_start,
          period_end,
          appointments_count,
          gross_desk_amount_npr,
          commission_amount_npr,
          payment_method,
          transaction_reference,
          status,
          notes,
          recorded_by_email,
          settled_at,
          created_at,
          clinic:clinics(name, city, phone, email, contact_email)
        `)
        .order('settled_at', { ascending: false })

      if (setsErr) {
        console.warn('Could not fetch settlements:', setsErr.message)
      } else {
        setSettlements((setsData as any[]) || [])
      }
    } catch (err) {
      console.error('Error loading Pay at Desk settlements data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleManualRefresh = () => {
    setRefreshing(true)
    loadAllData()
  }

  // Filter appointments by selected date range
  const dateFilteredAppointments = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const curMonthStr = todayStr.substring(0, 7)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    return deskAppointments.filter((appt) => {
      const d = appt.appointment_date
      if (!d) return true
      if (dateRangeFilter === 'TODAY') return d === todayStr
      if (dateRangeFilter === 'THIS_MONTH') return d.startsWith(curMonthStr)
      if (dateRangeFilter === 'LAST_30_DAYS') return d >= thirtyDaysAgo
      if (dateRangeFilter === 'CUSTOM') {
        if (customStartDate && d < customStartDate) return false
        if (customEndDate && d > customEndDate) return false
      }
      return true
    })
  }, [deskAppointments, dateRangeFilter, customStartDate, customEndDate])

  // Aggregated data per clinic
  const clinicAggregations: ClinicDeskAggregation[] = useMemo(() => {
    return clinics.map((clinic) => {
      // Find appointments for this clinic in the active date filter
      const appts = dateFilteredAppointments.filter((a) => a.clinic_id === clinic.id)
      const validAppts = appts.filter((a) => a.status !== 'CANCELLED' && a.status !== 'REJECTED')

      const totalDeskAppointments = validAppts.length
      const grossDeskRevenue = validAppts.reduce((sum, a) => sum + (a.total_amount || (a.fee_amount + a.service_charge_amount)), 0)
      const accruedCommission5Pct = validAppts.reduce((sum, a) => sum + a.service_charge_amount, 0)

      // Settlements for this clinic
      const clinicSettlements = settlements.filter(
        (s) => s.clinic_id === clinic.id && (s.status === 'settled' || s.status === 'SETTLED')
      )
      const settledCommission = clinicSettlements.reduce(
        (sum, s) => sum + (Number(s.commission_amount_npr) || 0),
        0
      )

      const balanceDue = Math.max(0, Math.round((accruedCommission5Pct - settledCommission) * 100) / 100)

      let status: 'PENDING_SETTLEMENT' | 'FULLY_SETTLED' | 'NO_ACTIVITY' = 'NO_ACTIVITY'
      if (balanceDue > 0) {
        status = 'PENDING_SETTLEMENT'
      } else if (accruedCommission5Pct > 0 && balanceDue <= 0) {
        status = 'FULLY_SETTLED'
      }

      const lastSettled = clinicSettlements.length > 0 ? clinicSettlements[0].settled_at : null

      return {
        clinic,
        totalDeskAppointments,
        grossDeskRevenue,
        accruedCommission5Pct,
        settledCommission,
        balanceDue,
        status,
        lastSettledAt: lastSettled,
        settlementsCount: clinicSettlements.length,
      }
    })
  }, [clinics, dateFilteredAppointments, settlements])

  // Overall Executive KPI Metrics
  const executiveMetrics = useMemo(() => {
    let totalGrossDeskVolume = 0
    let totalCommissionAccrued = 0
    let totalCommissionSettled = 0
    let totalOutstandingDue = 0
    let totalDeskBookingsCount = 0
    let clinicsWithPendingDuesCount = 0

    clinicAggregations.forEach((agg) => {
      totalGrossDeskVolume += agg.grossDeskRevenue
      totalCommissionAccrued += agg.accruedCommission5Pct
      totalCommissionSettled += agg.settledCommission
      totalOutstandingDue += agg.balanceDue
      totalDeskBookingsCount += agg.totalDeskAppointments
      if (agg.balanceDue > 0) {
        clinicsWithPendingDuesCount += 1
      }
    })

    return {
      totalGrossDeskVolume: Math.round(totalGrossDeskVolume * 100) / 100,
      totalCommissionAccrued: Math.round(totalCommissionAccrued * 100) / 100,
      totalCommissionSettled: Math.round(totalCommissionSettled * 100) / 100,
      totalOutstandingDue: Math.round(totalOutstandingDue * 100) / 100,
      totalDeskBookingsCount,
      clinicsWithPendingDuesCount,
    }
  }, [clinicAggregations])

  // Filtered clinic aggregations based on search and status
  const filteredClinicAggregations = useMemo(() => {
    return clinicAggregations.filter((item) => {
      // Status filter
      if (statusFilter === 'PENDING' && item.balanceDue <= 0) return false
      if (statusFilter === 'SETTLED' && (item.status !== 'FULLY_SETTLED' || item.balanceDue > 0)) return false
      if (statusFilter === 'NO_ACTIVITY' && item.totalDeskAppointments > 0) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const cName = (item.clinic.name || '').toLowerCase()
        const cCity = (item.clinic.city || '').toLowerCase()
        const cPhone = (item.clinic.phone || '').toLowerCase()
        const cCode = (item.clinic.code || '').toLowerCase()
        if (!cName.includes(q) && !cCity.includes(q) && !cPhone.includes(q) && !cCode.includes(q)) {
          return false
        }
      }

      return true
    })
  }, [clinicAggregations, statusFilter, searchQuery])

  // Prepare Settlement Modal for specific clinic
  const openSettlementModalForClinic = (agg?: ClinicDeskAggregation) => {
    const todayStr = new Date().toISOString().split('T')[0]
    const firstDayOfMonth = todayStr.substring(0, 8) + '01'

    if (agg) {
      setSettleClinicId(agg.clinic.id)
      setSettlePeriodStart(firstDayOfMonth)
      setSettlePeriodEnd(todayStr)
      setSettleGrossAmount(agg.grossDeskRevenue)
      setSettleCommissionAmount(agg.balanceDue > 0 ? agg.balanceDue : agg.accruedCommission5Pct)
      setSettleBookingsCount(agg.totalDeskAppointments)
    } else {
      setSettleClinicId(clinics[0]?.id || '')
      setSettlePeriodStart(firstDayOfMonth)
      setSettlePeriodEnd(todayStr)
      setSettleGrossAmount(0)
      setSettleCommissionAmount(0)
      setSettleBookingsCount(0)
    }

    setSettlePaymentMethod('BANK_TRANSFER')
    setSettleReference('')
    setSettleStatus('settled')
    setSettleNotes('')
    setShowSettleModal(true)
  }

  // When clinic changes in settlement modal, recalculate period figures
  const handleSettleClinicChange = (targetClinicId: string) => {
    setSettleClinicId(targetClinicId)
    const targetAgg = clinicAggregations.find((a) => a.clinic.id === targetClinicId)
    if (targetAgg) {
      setSettleGrossAmount(targetAgg.grossDeskRevenue)
      setSettleCommissionAmount(targetAgg.balanceDue > 0 ? targetAgg.balanceDue : targetAgg.accruedCommission5Pct)
      setSettleBookingsCount(targetAgg.totalDeskAppointments)
    }
  }

  // Submit Settlement
  const handleSubmitSettlement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settleClinicId) {
      alert('Please select a clinic.')
      return
    }

    const commAmt = parseFloat(settleCommissionAmount.toString()) || 0
    if (commAmt <= 0 && settleStatus !== 'waived') {
      alert('Settlement commission amount must be greater than NPR 0 unless status is waived.')
      return
    }

    setIsSubmittingSettle(true)
    try {
      const generatedRef = settleReference.trim() || `DESK-SETTLE-${Date.now().toString(36).toUpperCase()}`
      const targetClinic = clinics.find((c) => c.id === settleClinicId)

      const payload = {
        clinic_id: settleClinicId,
        period_start: settlePeriodStart || new Date().toISOString().split('T')[0],
        period_end: settlePeriodEnd || new Date().toISOString().split('T')[0],
        appointments_count: parseInt(settleBookingsCount.toString(), 10) || 0,
        gross_desk_amount_npr: parseFloat(settleGrossAmount.toString()) || 0,
        commission_amount_npr: commAmt,
        payment_method: settlePaymentMethod,
        transaction_reference: generatedRef,
        status: settleStatus,
        notes: settleNotes.trim() || `5% Platform Desk Settlement for ${targetClinic?.name || 'Clinic'}`,
        recorded_by_email: adminUserEmail || 'admin@dactor.app',
        settled_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('platform_commission_settlements')
        .insert(payload)
        .select(`
          id,
          clinic_id,
          period_start,
          period_end,
          appointments_count,
          gross_desk_amount_npr,
          commission_amount_npr,
          payment_method,
          transaction_reference,
          status,
          notes,
          recorded_by_email,
          settled_at,
          created_at,
          clinic:clinics(name, city, phone, email, contact_email)
        `)
        .single()

      if (error) throw error

      setSettlements((prev) => [data as any, ...prev])
      setShowSettleModal(false)
      alert(`Settlement of NPR ${commAmt.toLocaleString()} successfully recorded for ${targetClinic?.name || 'Clinic'}! Voucher Ref: ${generatedRef}`)
      loadAllData()
    } catch (err: any) {
      console.error('Error saving settlement:', err)
      alert('Failed to record settlement: ' + (err.message || 'Unknown error'))
    } finally {
      setIsSubmittingSettle(false)
    }
  }

  // Export clinic overview to CSV
  const handleExportCSV = () => {
    const headers = [
      'Clinic Name',
      'Clinic City',
      'Phone',
      'Pay at Desk Bookings',
      'Gross Desk Volume (NPR)',
      '5% Commission Accrued (NPR)',
      'Settled Commission (NPR)',
      'Outstanding Due (NPR)',
      'Settlement Status',
      'Last Settled Date'
    ]

    const rows = filteredClinicAggregations.map((a) => [
      `"${a.clinic.name.replace(/"/g, '""')}"`,
      `"${(a.clinic.city || '').replace(/"/g, '""')}"`,
      `"${(a.clinic.phone || '').replace(/"/g, '""')}"`,
      a.totalDeskAppointments,
      a.grossDeskRevenue.toFixed(2),
      a.accruedCommission5Pct.toFixed(2),
      a.settledCommission.toFixed(2),
      a.balanceDue.toFixed(2),
      a.status,
      a.lastSettledAt ? a.lastSettledAt.split('T')[0] : 'Never'
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Dactor_PayAtDesk_Settlements_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Format currency
  const formatNPR = (num: number) => {
    return 'Rs. ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-md shadow-amber-500/10">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                Pay at Desk Revenue & Settlements
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                  5% Platform Commission
                </span>
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">
                Monitor counter-collected appointment volume across all registered clinics and record 5% platform fee settlements.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => openSettlementModalForClinic()}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 transition"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Record Settlement</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Gross Desk Volume */}
        <div className="bg-slate-800/90 border border-slate-700/80 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gross Desk Volume</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Banknote className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-white mt-2">
            {loading ? '...' : formatNPR(executiveMetrics.totalGrossDeskVolume)}
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1">
            <span>Collected at clinic counters</span>
          </div>
        </div>

        {/* Card 2: 5% Dactor Platform Fee Accrued */}
        <div className="bg-slate-800/90 border border-slate-700/80 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Dactor 5% Accrued</span>
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Percent className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-indigo-400 mt-2">
            {loading ? '...' : formatNPR(executiveMetrics.totalCommissionAccrued)}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Total platform commission earned
          </div>
        </div>

        {/* Card 3: Realized / Settled Commission */}
        <div className="bg-slate-800/90 border border-slate-700/80 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Total Settled</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-2">
            {loading ? '...' : formatNPR(executiveMetrics.totalCommissionSettled)}
          </div>
          <div className="mt-2 text-[11px] text-emerald-500 font-medium flex items-center gap-1">
            <span>{settlements.filter((s) => s.status === 'settled').length} vouchers settled</span>
          </div>
        </div>

        {/* Card 4: Outstanding Balance Due */}
        <div className="bg-gradient-to-br from-amber-950/40 to-slate-800 border border-amber-500/30 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">Outstanding Due</span>
            <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-amber-300 mt-2">
            {loading ? '...' : formatNPR(executiveMetrics.totalOutstandingDue)}
          </div>
          <div className="mt-2 text-[11px] text-amber-400 font-medium">
            {executiveMetrics.clinicsWithPendingDuesCount} clinic(s) pending settlement
          </div>
        </div>

        {/* Card 5: Total Desk Bookings Count */}
        <div className="bg-slate-800/90 border border-slate-700/80 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Desk Bookings</span>
            <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-white mt-2">
            {loading ? '...' : executiveMetrics.totalDeskBookingsCount}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Across {clinics.length} registered clinics
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
            activeTab === 'overview'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Clinic Balances & Dues Tracker</span>
          {executiveMetrics.clinicsWithPendingDuesCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-400 text-slate-950 font-black">
              {executiveMetrics.clinicsWithPendingDuesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('vouchers')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
            activeTab === 'vouchers'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Settlement Vouchers Ledger</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-700 text-slate-300">
            {settlements.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('bookings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
            activeTab === 'bookings'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>All Desk Bookings Master List</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-700 text-slate-300">
            {deskAppointments.length}
          </span>
        </button>
      </div>

      {/* TAB 1: Clinic Overview & Dues */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-slate-800/60 border border-slate-700/60 p-3.5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search clinic by name, city, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl p-0.5">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    statusFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({clinicAggregations.length})
                </button>
                <button
                  onClick={() => setStatusFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    statusFilter === 'PENDING' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pending Due ({clinicAggregations.filter((a) => a.balanceDue > 0).length})
                </button>
                <button
                  onClick={() => setStatusFilter('SETTLED')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    statusFilter === 'SETTLED' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Fully Settled
                </button>
              </div>

              {/* Date Filter Dropdown */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={dateRangeFilter}
                  onChange={(e) => setDateRangeFilter(e.target.value as any)}
                  className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900">All Time</option>
                  <option value="TODAY" className="bg-slate-900">Today</option>
                  <option value="THIS_MONTH" className="bg-slate-900">This Month</option>
                  <option value="LAST_30_DAYS" className="bg-slate-900">Last 30 Days</option>
                  <option value="CUSTOM" className="bg-slate-900">Custom Range</option>
                </select>
              </div>

              {dateRangeFilter === 'CUSTOM' && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                  />
                  <span className="text-slate-500 text-xs">to</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-700/80">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Clinic Name & Info</th>
                    <th className="py-3.5 px-3 font-semibold text-center">Desk Bookings</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Gross Desk Volume</th>
                    <th className="py-3.5 px-4 font-semibold text-right text-indigo-300">5% Platform Fee</th>
                    <th className="py-3.5 px-4 font-semibold text-right text-emerald-400">Total Settled</th>
                    <th className="py-3.5 px-4 font-semibold text-right text-amber-300">Net Due (NPR)</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Status</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                        Loading clinic balances and desk revenues...
                      </td>
                    </tr>
                  ) : filteredClinicAggregations.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <Info className="w-6 h-6 mx-auto mb-2 text-slate-500" />
                        No clinic desk revenue records matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredClinicAggregations.map((item) => (
                      <tr key={item.clinic.id} className="hover:bg-slate-750/50 transition">
                        {/* Clinic Info */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-white text-sm truncate flex items-center gap-1.5">
                                {item.clinic.name}
                                {item.clinic.clinic_type && (
                                  <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-slate-700 text-slate-300">
                                    {item.clinic.clinic_type}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                {item.clinic.city && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-slate-500" />
                                    {item.clinic.city}
                                  </span>
                                )}
                                {item.clinic.phone && (
                                  <span className="flex items-center gap-1 text-slate-400">
                                    <Phone className="w-3 h-3 text-slate-500" />
                                    {item.clinic.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Desk Bookings */}
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => setSelectedClinicForDrilldown(item.clinic)}
                            className="font-mono font-bold text-slate-200 hover:text-indigo-400 underline decoration-dotted transition"
                            title="Click to view all desk bookings"
                          >
                            {item.totalDeskAppointments}
                          </button>
                        </td>

                        {/* Gross Desk Volume */}
                        <td className="py-3 px-4 text-right font-medium text-slate-200">
                          {formatNPR(item.grossDeskRevenue)}
                        </td>

                        {/* 5% Platform Fee */}
                        <td className="py-3 px-4 text-right font-semibold text-indigo-300">
                          {formatNPR(item.accruedCommission5Pct)}
                        </td>

                        {/* Settled Commission */}
                        <td className="py-3 px-4 text-right font-medium text-emerald-400">
                          {formatNPR(item.settledCommission)}
                        </td>

                        {/* Net Due */}
                        <td className="py-3 px-4 text-right">
                          {item.balanceDue > 0 ? (
                            <span className="font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                              {formatNPR(item.balanceDue)}
                            </span>
                          ) : item.accruedCommission5Pct > 0 ? (
                            <span className="text-emerald-400 font-semibold flex items-center justify-end gap-1">
                              <Check className="w-3.5 h-3.5" /> Rs. 0.00
                            </span>
                          ) : (
                            <span className="text-slate-500 font-mono">Rs. 0.00</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center">
                          {item.status === 'PENDING_SETTLEMENT' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <Clock className="w-3 h-3" /> Due Pending
                            </span>
                          ) : item.status === 'FULLY_SETTLED' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" /> Fully Settled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-normal px-2.5 py-1 rounded-full bg-slate-700/50 text-slate-400 border border-slate-700">
                              No Activity
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedClinicForDrilldown(item.clinic)}
                              className="px-2.5 py-1 bg-slate-700/80 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-medium transition"
                              title="View individual Pay at Desk appointments"
                            >
                              Bookings
                            </button>

                            <button
                              onClick={() => openSettlementModalForClinic(item)}
                              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                                item.balanceDue > 0
                                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm shadow-amber-500/20'
                                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                              }`}
                            >
                              <Receipt className="w-3 h-3" />
                              <span>Settle</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Settlement Vouchers Ledger */}
      {activeTab === 'vouchers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-base">Platform Commission Settlement History</h3>
              <p className="text-slate-400 text-xs">Immutable audit trail of all recorded 5% service charge settlements.</p>
            </div>
            <button
              onClick={() => openSettlementModalForClinic()}
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Record New Settlement</span>
            </button>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-700/80">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Voucher / Ref ID</th>
                    <th className="py-3.5 px-4 font-semibold">Clinic</th>
                    <th className="py-3.5 px-3 font-semibold text-center">Period Covered</th>
                    <th className="py-3.5 px-3 font-semibold text-center">Bookings</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Gross Desk Vol</th>
                    <th className="py-3.5 px-4 font-semibold text-right text-emerald-400">Commission Settled</th>
                    <th className="py-3.5 px-3 font-semibold text-center">Payment Method</th>
                    <th className="py-3.5 px-3 font-semibold text-center">Status</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Settled At</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {settlements.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        No commission settlements recorded yet.
                      </td>
                    </tr>
                  ) : (
                    settlements.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-750/50 transition">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-300">
                          {st.transaction_reference || st.id.substring(0, 12).toUpperCase()}
                        </td>
                        <td className="py-3 px-4 font-medium text-white">
                          {st.clinic?.name || 'Clinic'}
                          {st.clinic?.city && (
                            <span className="block text-[11px] text-slate-400">{st.clinic.city}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                          {st.period_start} → {st.period_end}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-slate-200">
                          {st.appointments_count || '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-300">
                          {st.gross_desk_amount_npr ? formatNPR(Number(st.gross_desk_amount_npr)) : '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">
                          {formatNPR(Number(st.commission_amount_npr) || 0)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px] font-mono font-bold">
                            {st.payment_method || 'BANK'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              st.status === 'settled' || st.status === 'SETTLED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : st.status === 'waived' || st.status === 'WAIVED'
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {st.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-400 text-[11px]">
                          {st.settled_at ? new Date(st.settled_at).toLocaleDateString() : '-'}
                          {st.recorded_by_email && (
                            <span className="block text-[10px] text-slate-500 truncate max-w-[130px] ml-auto">
                              {st.recorded_by_email}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setActiveVoucherForPrint(st)}
                            className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition inline-flex items-center gap-1"
                            title="Print Voucher Receipt"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: All Desk Bookings Master List */}
      {activeTab === 'bookings' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-white text-base">Pay at Desk Appointments Across All Clinics</h3>
              <p className="text-slate-400 text-xs">Total: {deskAppointments.length} counter-booked appointments.</p>
            </div>
            <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search patient, code, or clinic..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-700/80">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">10-Digit Code</th>
                    <th className="py-3.5 px-4 font-semibold">Date & Time</th>
                    <th className="py-3.5 px-4 font-semibold">Clinic</th>
                    <th className="py-3.5 px-4 font-semibold">Patient Name</th>
                    <th className="py-3.5 px-4 font-semibold">Doctor</th>
                    <th className="py-3.5 px-3 font-semibold text-right">Fee (NPR)</th>
                    <th className="py-3.5 px-3 font-semibold text-right text-indigo-300">5% Charge</th>
                    <th className="py-3.5 px-3 font-semibold text-right font-bold text-white">Total Bill</th>
                    <th className="py-3.5 px-3 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {deskAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        No Pay at Desk appointments recorded yet.
                      </td>
                    </tr>
                  ) : (
                    deskAppointments
                      .filter((a) => {
                        if (!searchQuery.trim()) return true
                        const q = searchQuery.toLowerCase()
                        return (
                          a.tracking_code_10_digit.toLowerCase().includes(q) ||
                          a.patient_name.toLowerCase().includes(q) ||
                          a.patient_mobile.includes(q) ||
                          (a.clinic_name && a.clinic_name.toLowerCase().includes(q))
                        )
                      })
                      .map((appt) => (
                        <tr key={appt.id} className="hover:bg-slate-750/50 transition">
                          <td className="py-3 px-4 font-mono font-bold text-amber-400">
                            {appt.tracking_code_10_digit}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {appt.appointment_date} {appt.appointment_time}
                          </td>
                          <td className="py-3 px-4 font-medium text-white">
                            {appt.clinic_name}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">{appt.patient_name}</div>
                            {appt.patient_mobile && (
                              <div className="text-[10px] text-slate-400 font-mono">{appt.patient_mobile}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {appt.doctor_name || 'General Doctor'}
                            {appt.doctor_specialty && (
                              <span className="block text-[10px] text-slate-500">{appt.doctor_specialty}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-slate-300">
                            {appt.fee_amount.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-indigo-400">
                            {appt.service_charge_amount.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-white">
                            {appt.total_amount.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                appt.status === 'APPROVED' || appt.status === 'COMPLETED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : appt.status === 'WAITING_FOR_APPROVAL'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-700 text-slate-400'
                              }`}
                            >
                              {appt.status}
                            </span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Record Commission Settlement Modal */}
      {showSettleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Record Commission Settlement</h3>
                  <p className="text-xs text-slate-400">Super Admin Desk Revenue Clearance</p>
                </div>
              </div>
              <button
                onClick={() => setShowSettleModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSettlement} className="mt-5 space-y-4">
              {/* Select Clinic */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Select Clinic <span className="text-rose-400">*</span>
                </label>
                <select
                  value={settleClinicId}
                  onChange={(e) => handleSettleClinicChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                >
                  {clinics.map((c) => {
                    const agg = clinicAggregations.find((a) => a.clinic.id === c.id)
                    const pendingDue = agg ? agg.balanceDue : 0
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.city ? `(${c.city})` : ''} — {pendingDue > 0 ? `Due: Rs. ${pendingDue.toFixed(2)}` : 'Fully Settled'}
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Settlement Period Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Period From</label>
                  <input
                    type="date"
                    value={settlePeriodStart}
                    onChange={(e) => setSettlePeriodStart(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Period To</label>
                  <input
                    type="date"
                    value={settlePeriodEnd}
                    onChange={(e) => setSettlePeriodEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              {/* Volume & Revenue Inputs */}
              <div className="grid grid-cols-3 gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Bookings Count</label>
                  <input
                    type="number"
                    min="0"
                    value={settleBookingsCount}
                    onChange={(e) => setSettleBookingsCount(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Gross Desk Vol (NPR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settleGrossAmount}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0
                      setSettleGrossAmount(v)
                      setSettleCommissionAmount(Math.round(v * 0.05 * 100) / 100)
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-300 mb-1">5% Due (NPR) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settleCommissionAmount}
                    onChange={(e) => setSettleCommissionAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-amber-500/50 rounded-lg text-xs text-amber-400 font-mono font-bold"
                    required
                  />
                </div>
              </div>

              {/* Payment Method & Reference */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Payment Method</label>
                  <select
                    value={settlePaymentMethod}
                    onChange={(e) => setSettlePaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer (NPR)</option>
                    <option value="CONNECTIPS">ConnectIPS</option>
                    <option value="ESEWA">eSewa Merchant</option>
                    <option value="KHALTI">Khalti Pay</option>
                    <option value="FONEPAY">FonePay QR</option>
                    <option value="CASH">Cash at Office</option>
                    <option value="CHEQUE">Bank Cheque</option>
                    <option value="ADMIN_ADJUSTMENT">Admin Waiver / Discount</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Bank Ref / Voucher No</label>
                  <input
                    type="text"
                    placeholder="e.g. NBL-98234827"
                    value={settleReference}
                    onChange={(e) => setSettleReference(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Settlement Status & Notes */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Settlement Status</label>
                  <select
                    value={settleStatus}
                    onChange={(e) => setSettleStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="settled">Settled (Paid)</option>
                    <option value="pending">Pending Verification</option>
                    <option value="waived">Waived / Forgiven</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Notes / Remarks</label>
                  <input
                    type="text"
                    placeholder="e.g. Paid via Nabil Bank counter voucher #4928"
                    value={settleNotes}
                    onChange={(e) => setSettleNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSettle}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {isSubmittingSettle ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Settlement...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Record & Settle Balance</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Clinic Desk Bookings Drilldown Modal */}
      {selectedClinicForDrilldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-4xl w-full p-6 shadow-2xl relative flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {selectedClinicForDrilldown.name}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-normal">
                      Pay at Desk Bookings
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {selectedClinicForDrilldown.city || 'Nepal'} • Phone: {selectedClinicForDrilldown.phone || 'N/A'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedClinicForDrilldown(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drilldown Search */}
            <div className="my-3 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter by tracking code, patient name, or phone..."
                value={drilldownSearch}
                onChange={(e) => setDrilldownSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none"
              />
            </div>

            {/* Bookings List Table */}
            <div className="flex-1 overflow-y-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/90 text-slate-400 uppercase tracking-wider text-[11px] sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Tracking Code</th>
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Patient</th>
                    <th className="py-2.5 px-3">Doctor</th>
                    <th className="py-2.5 px-3 text-right">Fee (NPR)</th>
                    <th className="py-2.5 px-3 text-right text-indigo-400">5% Charge</th>
                    <th className="py-2.5 px-3 text-right font-bold text-white">Total</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {deskAppointments
                    .filter((a) => a.clinic_id === selectedClinicForDrilldown.id)
                    .filter((a) => {
                      if (!drilldownSearch.trim()) return true
                      const q = drilldownSearch.toLowerCase()
                      return (
                        a.tracking_code_10_digit.toLowerCase().includes(q) ||
                        a.patient_name.toLowerCase().includes(q) ||
                        a.patient_mobile.includes(q)
                      )
                    })
                    .map((appt) => (
                      <tr key={appt.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                          {appt.tracking_code_10_digit}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">
                          {appt.appointment_date} {appt.appointment_time}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-white">{appt.patient_name}</span>
                          <span className="block text-[10px] text-slate-400 font-mono">{appt.patient_mobile}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {appt.doctor_name || 'General Doctor'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">
                          {appt.fee_amount.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-indigo-400">
                          {appt.service_charge_amount.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">
                          {appt.total_amount.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              appt.status === 'APPROVED' || appt.status === 'COMPLETED'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            {appt.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="pt-4 mt-3 border-t border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                Showing{' '}
                {deskAppointments.filter((a) => a.clinic_id === selectedClinicForDrilldown.id).length}{' '}
                total desk bookings for this clinic.
              </div>
              <button
                onClick={() => {
                  const agg = clinicAggregations.find((a) => a.clinic.id === selectedClinicForDrilldown.id)
                  setSelectedClinicForDrilldown(null)
                  if (agg) openSettlementModalForClinic(agg)
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Settle This Clinic's Dues</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Printable Settlement Voucher Receipt Modal */}
      {activeVoucherForPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:p-0 print:bg-white">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative print:border-none print:shadow-none print:bg-white print:text-black print:max-w-none">
            {/* Action Bar (hidden on print) */}
            <div className="flex items-center justify-between pb-6 border-b border-slate-800 print:hidden">
              <h3 className="font-bold text-white text-base">Official Settlement Voucher</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Voucher</span>
                </button>
                <button
                  onClick={() => setActiveVoucherForPrint(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Receipt Body */}
            <div className="mt-6 space-y-6 text-slate-100 print:text-black">
              {/* Receipt Header */}
              <div className="flex items-start justify-between border-b border-slate-800 print:border-slate-300 pb-5">
                <div>
                  <h2 className="text-xl font-black text-indigo-400 print:text-indigo-800">DACTOR HEALTHCARE PLATFORM</h2>
                  <p className="text-xs text-slate-400 print:text-slate-600">Platform Commission Settlement Clearing House</p>
                  <p className="text-xs text-slate-400 print:text-slate-600 mt-1">Kathmandu, Nepal • support@dactor.app</p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 print:border-emerald-600 print:text-emerald-800">
                    {activeVoucherForPrint.status}
                  </span>
                  <div className="mt-2 text-xs font-mono text-slate-300 print:text-slate-700">
                    Voucher: {activeVoucherForPrint.transaction_reference || activeVoucherForPrint.id.substring(0, 10).toUpperCase()}
                  </div>
                  <div className="text-xs text-slate-400 print:text-slate-500">
                    Date: {new Date(activeVoucherForPrint.settled_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Clinic & Period Details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-800/60 print:bg-slate-100 p-4 rounded-xl">
                  <span className="font-semibold text-slate-400 print:text-slate-600 uppercase text-[10px]">Settled With Clinic</span>
                  <div className="font-bold text-sm text-white print:text-black mt-1">
                    {activeVoucherForPrint.clinic?.name || 'Clinic'}
                  </div>
                  <div className="text-slate-400 print:text-slate-600 mt-0.5">
                    {activeVoucherForPrint.clinic?.city || 'Nepal'}
                  </div>
                  <div className="text-slate-400 print:text-slate-600">
                    Phone: {activeVoucherForPrint.clinic?.phone || 'N/A'}
                  </div>
                </div>

                <div className="bg-slate-800/60 print:bg-slate-100 p-4 rounded-xl">
                  <span className="font-semibold text-slate-400 print:text-slate-600 uppercase text-[10px]">Settlement Period</span>
                  <div className="font-bold text-sm text-white print:text-black mt-1">
                    {activeVoucherForPrint.period_start} to {activeVoucherForPrint.period_end}
                  </div>
                  <div className="text-slate-400 print:text-slate-600 mt-0.5">
                    Payment Mode: {activeVoucherForPrint.payment_method}
                  </div>
                  <div className="text-slate-400 print:text-slate-600">
                    Bookings Covered: {activeVoucherForPrint.appointments_count || 0}
                  </div>
                </div>
              </div>

              {/* Breakdown Table */}
              <div className="border border-slate-800 print:border-slate-300 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 print:bg-slate-200 text-slate-400 print:text-slate-700">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Description</th>
                      <th className="py-2.5 px-4 text-center font-semibold">Rate</th>
                      <th className="py-2.5 px-4 text-right font-semibold">Volume (NPR)</th>
                      <th className="py-2.5 px-4 text-right font-semibold">Settled (NPR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 print:divide-slate-200">
                    <tr>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white print:text-black">
                          Dactor 5% Pay at Desk Platform Service Charge
                        </div>
                        <div className="text-[11px] text-slate-400 print:text-slate-500">
                          {activeVoucherForPrint.notes || 'Full commission clearance'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono">5.00%</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {activeVoucherForPrint.gross_desk_amount_npr
                          ? Number(activeVoucherForPrint.gross_desk_amount_npr).toFixed(2)
                          : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 print:text-emerald-800">
                        {Number(activeVoucherForPrint.commission_amount_npr).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-slate-800/40 print:bg-slate-100 font-bold border-t border-slate-700 print:border-slate-300">
                    <tr>
                      <td colSpan={3} className="py-3 px-4 text-right text-slate-300 print:text-black uppercase text-[11px]">
                        Total Platform Fee Realized:
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-emerald-400 print:text-emerald-800 font-black">
                        Rs. {Number(activeVoucherForPrint.commission_amount_npr).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Signatures */}
              <div className="pt-8 border-t border-slate-800 print:border-slate-300 grid grid-cols-2 gap-8 text-xs text-slate-400 print:text-slate-600">
                <div>
                  <div className="border-b border-slate-700 print:border-slate-400 pb-1 font-mono text-slate-300 print:text-black">
                    {activeVoucherForPrint.recorded_by_email || 'Dactor Super Admin'}
                  </div>
                  <div className="mt-1 text-[11px]">Authorized Dactor Clearing Officer</div>
                </div>
                <div className="text-right">
                  <div className="border-b border-slate-700 print:border-slate-400 pb-1 font-mono text-slate-300 print:text-black">
                    {activeVoucherForPrint.clinic?.name || 'Clinic Representative'}
                  </div>
                  <div className="mt-1 text-[11px]">Authorized Clinic Stamp / Signature</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
