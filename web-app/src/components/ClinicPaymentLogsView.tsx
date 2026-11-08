import React, { useState, useEffect, useMemo } from 'react'
import {
  DollarSign,
  Calendar,
  Filter,
  Download,
  Printer,
  Search,
  UserCheck,
  UserPlus,
  CreditCard,
  Wallet,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
  TrendingUp,
  X,
  Stethoscope,
  Activity,
  ShieldCheck,
  Layers,
  Sparkles,
} from 'lucide-react'
import {
  UnifiedPaymentLogEntry,
  DoctorVisitAnalytics,
  buildUnifiedClinicPaymentLogs,
  computeDoctorDailyAndMonthlyStats,
  exportPaymentLogsToCsv,
} from '../utils/paymentLedger'
import { printClinicPaymentReportPdf } from '../utils/medicalDocPrinter'
import {
  getClinicInvoiceTransactions,
  getClinicSubscriptionPayments,
  getPlatformCommissionSettlements,
  getClinicPaymentAttempts,
} from '../services/db'

interface ClinicPaymentLogsViewProps {
  clinic: any
  appointments?: any[]
  invoices?: any[]
  doctors?: any[]
  onOpenPatientBill?: (appointmentId: string) => void
}

export const ClinicPaymentLogsView: React.FC<ClinicPaymentLogsViewProps> = ({
  clinic,
  appointments = [],
  invoices = [],
  doctors = [],
  onOpenPatientBill,
}) => {
  const [activeTab, setActiveTab] = useState<'ledger' | 'doctor_stats' | 'services' | 'platform_and_license'>('ledger')

  // Date & Multi-dimensional filters
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'>('today')
  const [customStartDate, setCustomStartDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [customEndDate, setCustomEndDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all')
  const [selectedMethod, setSelectedMethod] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Doctor Analytics sub-controls
  const [doctorAnalyticsMode, setDoctorAnalyticsMode] = useState<'daily' | 'monthly'>('daily')
  const [doctorAnalyticsPeriod, setDoctorAnalyticsPeriod] = useState<string>(new Date().toISOString().slice(0, 10))
  const [inspectedDoctorDetail, setInspectedDoctorDetail] = useState<DoctorVisitAnalytics | null>(null)

  // Drawer / Receipt inspection
  const [selectedLogDrawer, setSelectedLogDrawer] = useState<UnifiedPaymentLogEntry | null>(null)

  // Remote ledger data
  const [invoiceTransactions, setInvoiceTransactions] = useState<any[]>([])
  const [subscriptionPayments, setSubscriptionPayments] = useState<any[]>([])
  const [commissionSettlements, setCommissionSettlements] = useState<any[]>([])
  const [paymentAttempts, setPaymentAttempts] = useState<any[]>([])
  const [isLoadingRemote, setIsLoadingRemote] = useState<boolean>(true)

  useEffect(() => {
    let isMounted = true
    const loadLedgers = async () => {
      if (!clinic?.id) return
      setIsLoadingRemote(true)
      try {
        const [txs, subs, coms, atts] = await Promise.all([
          getClinicInvoiceTransactions(clinic.id),
          getClinicSubscriptionPayments(clinic.id),
          getPlatformCommissionSettlements(clinic.id),
          getClinicPaymentAttempts(clinic.id),
        ])
        if (isMounted) {
          setInvoiceTransactions(txs)
          setSubscriptionPayments(subs)
          setCommissionSettlements(coms)
          setPaymentAttempts(atts)
        }
      } catch (err) {
        console.warn('Error loading clinic financial records:', err)
      } finally {
        if (isMounted) setIsLoadingRemote(false)
      }
    }
    loadLedgers()
    return () => {
      isMounted = false
    }
  }, [clinic?.id])

  // 1. Build Master Chronological Log Entries
  const rawLogs = useMemo(() => {
    return buildUnifiedClinicPaymentLogs(appointments, invoices, invoiceTransactions, doctors)
  }, [appointments, invoices, invoiceTransactions, doctors])

  // 2. Date Filtering Bounds
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const yesterdayStr = useMemo(() => {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    return y.toISOString().slice(0, 10)
  }, [])
  const weekStartStr = useMemo(() => {
    const w = new Date()
    w.setDate(w.getDate() - 7)
    return w.toISOString().slice(0, 10)
  }, [])
  const monthStartStr = useMemo(() => new Date().toISOString().slice(0, 7) + '-01', [])

  // 3. Filtered Logs
  const filteredLogs = useMemo(() => {
    return rawLogs.filter((item) => {
      // Date bounds
      const itemDate = item.date || item.dateTime.slice(0, 10)
      if (dateFilter === 'today' && itemDate !== todayStr) return false
      if (dateFilter === 'yesterday' && itemDate !== yesterdayStr) return false
      if (dateFilter === 'week' && itemDate < weekStartStr) return false
      if (dateFilter === 'month' && itemDate < monthStartStr) return false
      if (dateFilter === 'custom') {
        if (customStartDate && itemDate < customStartDate) return false
        if (customEndDate && itemDate > customEndDate) return false
      }

      // Doctor filter
      if (selectedDoctorId !== 'all' && item.doctorId !== selectedDoctorId) return false

      // Method filter
      if (selectedMethod !== 'all') {
        const m = item.paymentMethod.toUpperCase()
        if (selectedMethod === 'ESEWA' && !m.includes('ESEWA')) return false
        if (selectedMethod === 'CASH' && !m.includes('CASH')) return false
        if (selectedMethod === 'PAY_AT_DESK' && !m.includes('DESK')) return false
        if (selectedMethod === 'FONEPAY' && !m.includes('QR') && !m.includes('FONEPAY')) return false
        if (selectedMethod === 'QR' && !m.includes('QR') && !m.includes('FONEPAY')) return false
        if (selectedMethod === 'CARD' && !m.includes('CARD')) return false
        if (selectedMethod === 'KHALTI' && !m.includes('KHALTI')) return false
        if (selectedMethod === 'CONNECTIPS' && !m.includes('CONNECTIPS')) return false
      }

      // Category filter
      if (selectedCategory !== 'all' && item.category.toUpperCase() !== selectedCategory.toUpperCase()) return false

      // Status filter
      if (selectedStatus !== 'all' && (item.paymentStatus || 'paid').toLowerCase() !== selectedStatus.toLowerCase())
        return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matches =
          item.patientName.toLowerCase().includes(q) ||
          item.patientPhone.includes(q) ||
          item.trackingCode.includes(q) ||
          (item.doctorName && item.doctorName.toLowerCase().includes(q)) ||
          (item.referenceId && item.referenceId.toLowerCase().includes(q)) ||
          (item.note && item.note.toLowerCase().includes(q))
        if (!matches) return false
      }

      return true
    })
  }, [
    rawLogs,
    dateFilter,
    todayStr,
    yesterdayStr,
    weekStartStr,
    monthStartStr,
    customStartDate,
    customEndDate,
    selectedDoctorId,
    selectedMethod,
    selectedCategory,
    selectedStatus,
    searchQuery,
  ])

  // 4. Executive KPI Summary Math
  const summaryKpis = useMemo(() => {
    let grossCollected = 0
    let refunds = 0
    let onlineAmount = 0
    let deskAmount = 0
    let pendingDue = 0

    const visitedPatientKeys = new Set<string>()
    const newPatientKeys = new Set<string>()

    for (const log of filteredLogs) {
      if (log.type === 'REFUND') {
        refunds += log.amount
      } else {
        grossCollected += log.amount
        const m = log.paymentMethod.toUpperCase()
        if (m.includes('ESEWA') || m.includes('ONLINE') || m.includes('KHALTI') || m.includes('FONEPAY') || m.includes('CONNECTIPS')) {
          onlineAmount += log.amount
        } else {
          deskAmount += log.amount
        }
      }

      if (log.balanceDue && log.balanceDue > 0) {
        pendingDue += log.balanceDue
      }

      if (log.trackingCode) {
        visitedPatientKeys.add(log.trackingCode)
        if (log.isNewPatientForDoctor) {
          newPatientKeys.add(log.trackingCode)
        }
      }
    }

    // 5% Pay at Desk calculations for approved desk visits in period
    let platformFee = 0
    for (const a of (appointments || [])) {
      if (a.paymentMode === 'PAY_AT_DESK' && (a.status || 'APPROVED') === 'APPROVED') {
        const d = a.appointmentDate || ''
        const inPeriod =
          (dateFilter === 'today' && d === todayStr) ||
          (dateFilter === 'yesterday' && d === yesterdayStr) ||
          (dateFilter === 'week' && d >= weekStartStr) ||
          (dateFilter === 'month' && d >= monthStartStr) ||
          (dateFilter === 'custom' && d >= customStartDate && d <= customEndDate) ||
          dateFilter === 'all'
        if (inPeriod) {
          platformFee += Number(a.serviceChargeAmount || 0)
        }
      }
    }

    const netCollection = Math.max(0, grossCollected - refunds)
    const newPatients = newPatientKeys.size
    const totalPatients = visitedPatientKeys.size
    const followupPatients = Math.max(0, totalPatients - newPatients)

    return {
      netCollection,
      grossCollected,
      refunds,
      onlineAmount,
      deskAmount,
      pendingDue,
      totalPatients,
      newPatients,
      followupPatients,
      platformFee,
    }
  }, [
    filteredLogs,
    appointments,
    dateFilter,
    todayStr,
    yesterdayStr,
    weekStartStr,
    monthStartStr,
    customStartDate,
    customEndDate,
  ])

  // 5. Doctor Daily & Monthly Stats
  const doctorAnalytics = useMemo(() => {
    return computeDoctorDailyAndMonthlyStats(
      appointments,
      invoices,
      doctors,
      doctorAnalyticsMode,
      selectedDoctorId === 'all' ? undefined : selectedDoctorId,
      doctorAnalyticsPeriod || undefined
    )
  }, [appointments, invoices, doctors, doctorAnalyticsMode, selectedDoctorId, doctorAnalyticsPeriod])

  // 6. Department / Services Breakdown Math
  const serviceBreakdown = useMemo(() => {
    const categories: Record<string, { count: number; total: number; items: Record<string, { count: number; total: number }> }> = {
      'OPD Consultation': { count: 0, total: 0, items: {} },
      'Laboratory & Diagnostics': { count: 0, total: 0, items: {} },
      'Procedures & Services': { count: 0, total: 0, items: {} },
      'Other Clinical Charges': { count: 0, total: 0, items: {} },
    }

    for (const log of filteredLogs) {
      if (log.items && log.items.length > 0) {
        for (const it of log.items) {
          const name = it.name || 'General OPD'
          const lower = name.toLowerCase()
          let cat = 'Other Clinical Charges'
          if (lower.includes('consultation') || lower.includes('opd') || lower.includes('doctor')) {
            cat = 'OPD Consultation'
          } else if (lower.includes('lab') || lower.includes('blood') || lower.includes('test') || lower.includes('cbc') || lower.includes('urine') || lower.includes('x-ray') || lower.includes('lipid')) {
            cat = 'Laboratory & Diagnostics'
          } else if (lower.includes('procedure') || lower.includes('dressing') || lower.includes('injection') || lower.includes('ecg') || lower.includes('ultrasound')) {
            cat = 'Procedures & Services'
          }

          const lineTot = Number(it.price || 0) * (it.quantity || 1)
          categories[cat].count += it.quantity || 1
          categories[cat].total += lineTot

          if (!categories[cat].items[name]) {
            categories[cat].items[name] = { count: 0, total: 0 }
          }
          categories[cat].items[name].count += it.quantity || 1
          categories[cat].items[name].total += lineTot
        }
      } else {
        const cat = log.category === 'LAB' ? 'Laboratory & Diagnostics' : 'OPD Consultation'
        categories[cat].count += 1
        categories[cat].total += log.amount
      }
    }

    const grandTotal = Object.values(categories).reduce((acc, c) => acc + c.total, 0) || 1
    return { categories, grandTotal }
  }, [filteredLogs])

  // 7. Export Handlers
  const handleExportCsv = () => {
    const csvContent = exportPaymentLogsToCsv(filteredLogs, clinic?.name || 'Clinic')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Dactor_Payment_Logs_${(clinic?.name || 'Clinic').replace(/\s+/g, '_')}_${todayStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handlePrintPdf = () => {
    printClinicPaymentReportPdf(
      clinic,
      dateFilter === 'custom'
        ? `${customStartDate} to ${customEndDate}`
        : dateFilter.toUpperCase(),
      summaryKpis,
      doctorAnalytics,
      filteredLogs
    )
  }

  return (
    <div className="space-y-6">
      {/* =========================================================================
          ZONE A: CONTROL BAR & QUICK FILTERS
          ========================================================================= */}
      <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <DollarSign className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Clinic Payment Logs & Revenue Ledger
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Audit-grade financial ledger tracking online eSewa checkout, Pay-at-Desk cash, walk-in receipts, and daily/monthly doctor patient growth.
            </p>
          </div>

          {/* Action Export Buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition"
              title="Download Excel / Tally compatible CSV file"
            >
              <Download className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white shadow-sm shadow-teal-600/30 transition"
              title="Generate printable official A4 clinic statement"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Statement</span>
            </button>
          </div>
        </div>

        {/* Date Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mr-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>Period:</span>
          </div>
          {(['today', 'yesterday', 'week', 'month', 'all', 'custom'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setDateFilter(period)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                dateFilter === period
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {period === 'today' && 'Today'}
              {period === 'yesterday' && 'Yesterday'}
              {period === 'week' && 'Last 7 Days'}
              {period === 'month' && 'This Month'}
              {period === 'all' && 'All Time'}
              {period === 'custom' && 'Custom Date Range'}
            </button>
          ))}

          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 pl-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
          )}
        </div>

        {/* Multi-Dimensional Filter Dropdowns & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search patient, 10-digit code, ref #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Doctor Dropdown */}
          <select
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">All Doctors & Specialists</option>
            {(doctors || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName || d.name} ({d.specialty || 'General'})
              </option>
            ))}
          </select>

          {/* Payment Method Dropdown */}
          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">All Payment Methods</option>
            <option value="ESEWA">Online eSewa Mobile Wallet</option>
            <option value="KHALTI">Online Khalti Wallet</option>
            <option value="FONEPAY">Online Fonepay / Dynamic QR</option>
            <option value="CONNECTIPS">Online ConnectIPS Direct Bank</option>
            <option value="PAY_AT_DESK">Pay-at-Desk (Online Booking)</option>
            <option value="CASH">Cash at Reception Desk</option>
            <option value="CARD">Debit / Credit Card POS</option>
          </select>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">All Service Categories</option>
            <option value="CONSULTATION">OPD Doctor Consultations</option>
            <option value="LAB">Laboratory & Diagnostics</option>
            <option value="PROCEDURE">Clinical Procedures & Services</option>
          </select>
        </div>
      </div>

      {/* =========================================================================
          ZONE B: 5 EXECUTIVE SUMMARY KPI CARDS
          ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Net Collection */}
        <div className="bg-gradient-to-br from-teal-500/10 via-white/80 to-white/50 dark:via-slate-900/80 dark:to-slate-900/50 backdrop-blur-md p-4 rounded-2xl border border-teal-500/30 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Net Collections
            </span>
            <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
            Rs. {summaryKpis.netCollection.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <span>{filteredLogs.length} receipts</span>
            {summaryKpis.refunds > 0 && (
              <span className="text-rose-500">(-Rs. {summaryKpis.refunds.toLocaleString()} ref)</span>
            )}
          </div>
        </div>

        {/* Card 2: Online vs Desk Split */}
        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Online vs Desk
            </span>
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900 dark:text-white truncate">
            Rs. {summaryKpis.onlineAmount.toLocaleString()}{' '}
            <span className="text-xs text-slate-400 font-normal">/ {summaryKpis.deskAmount.toLocaleString()}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <span className="text-teal-600 dark:text-teal-400 font-semibold">
              {summaryKpis.grossCollected > 0
                ? Math.round((summaryKpis.onlineAmount / summaryKpis.grossCollected) * 100)
                : 0}
              % Online
            </span>
            <span className="text-slate-400 font-semibold">
              {summaryKpis.grossCollected > 0
                ? Math.round((summaryKpis.deskAmount / summaryKpis.grossCollected) * 100)
                : 0}
              % Desk
            </span>
          </div>
        </div>

        {/* Card 3: Pending Balance Due */}
        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Pending Dues
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
            Rs. {summaryKpis.pendingDue.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Uncollected balance on open bills
          </div>
        </div>

        {/* Card 4: Patients Seen (New vs Follow-up) */}
        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Patients Seen
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white flex items-baseline gap-1.5">
            <span className="text-emerald-600 dark:text-emerald-400">{summaryKpis.newPatients} New</span>
            <span className="text-xs text-slate-400 font-medium">/ {summaryKpis.totalPatients} Total</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {summaryKpis.followupPatients} follow-up consultations
          </div>
        </div>

        {/* Card 5: 5% Platform Fee */}
        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              5% Desk Service Fee
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-purple-600 dark:text-purple-400">
            Rs. {summaryKpis.platformFee.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Accrued on Pay-at-Desk bookings
          </div>
        </div>
      </div>

      {/* =========================================================================
          ZONE C: 4 OPERATIONAL SUB-TABS
          ========================================================================= */}
      <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
        {/* Navigation Tabs Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 pt-3 flex flex-wrap gap-2 sm:gap-6">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'ledger'
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Chronological Ledger</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {filteredLogs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('doctor_stats')}
            className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'doctor_stats'
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            <span>Doctor Revenue & New Patient Growth</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              Daily & Monthly
            </span>
          </button>

          <button
            onClick={() => setActiveTab('services')}
            className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'services'
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Department & Services</span>
          </button>

          <button
            onClick={() => setActiveTab('platform_and_license')}
            className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'platform_and_license'
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>5% Fee & License History</span>
          </button>
        </div>

        {/* Tab 1: Chronological Ledger */}
        {activeTab === 'ledger' && (
          <div className="overflow-x-auto">
            {filteredLogs.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No payment transactions found matching the selected period and filters.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/40">
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Patient / Tracking Code</th>
                    <th className="py-3 px-4">Doctor & Specialty</th>
                    <th className="py-3 px-4 text-center">Visit Tag</th>
                    <th className="py-3 px-4">Method & Ref</th>
                    <th className="py-3 px-4 text-right">Amount (NPR)</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLogDrawer(log)}
                      className="hover:bg-teal-50/40 dark:hover:bg-slate-800/50 transition cursor-pointer"
                    >
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-white">{log.date}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{log.time}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{log.patientName}</div>
                        <div className="text-[11px] text-teal-600 dark:text-teal-400 font-mono font-semibold">
                          #{log.trackingCode || 'NO-CODE'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {log.doctorName || 'General OPD'}
                        </div>
                        <div className="text-[11px] text-slate-400">{log.specialty || 'General Practice'}</div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {log.isNewPatientForDoctor ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>NEW</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                            FOLLOW-UP
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                            log.paymentMethod.includes('ESEWA')
                              ? 'bg-green-600 text-white'
                              : log.paymentMethod.includes('KHALTI')
                              ? 'bg-purple-700 text-white'
                              : log.paymentMethod.includes('CONNECTIPS')
                              ? 'bg-indigo-600 text-white'
                              : log.paymentMethod.includes('FONEPAY') || log.paymentMethod.includes('QR')
                              ? 'bg-rose-600 text-white'
                              : log.paymentMethod.includes('DESK')
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {log.paymentMethod}
                        </span>
                        {log.referenceId && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[130px]" title={log.referenceId}>
                            Ref: {log.referenceId}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div
                          className={`font-black text-sm ${
                            log.type === 'REFUND'
                              ? 'text-rose-500'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {log.type === 'REFUND' ? '-' : '+'}Rs. {log.amount.toLocaleString()}
                        </div>
                        {log.balanceDue && log.balanceDue > 0 ? (
                          <div className="text-[10px] text-amber-500 font-bold">
                            Due: Rs. {log.balanceDue.toLocaleString()}
                          </div>
                        ) : (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-end gap-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Paid
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedLogDrawer(log)
                          }}
                          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition"
                          title="View receipt & audit details"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Doctor Revenue & New Patient Growth (Daily & Monthly) */}
        {activeTab === 'doctor_stats' && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">View Mode:</span>
                <div className="inline-flex rounded-lg bg-slate-200 dark:bg-slate-700 p-0.5">
                  <button
                    onClick={() => {
                      setDoctorAnalyticsMode('daily')
                      setDoctorAnalyticsPeriod(todayStr)
                    }}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                      doctorAnalyticsMode === 'daily'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Daily Tracker
                  </button>
                  <button
                    onClick={() => {
                      setDoctorAnalyticsMode('monthly')
                      setDoctorAnalyticsPeriod(todayStr.slice(0, 7))
                    }}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                      doctorAnalyticsMode === 'monthly'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Monthly Tracker
                  </button>
                </div>
              </div>

              {/* Target Period Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Select {doctorAnalyticsMode === 'daily' ? 'Date' : 'Month'}:</span>
                {doctorAnalyticsMode === 'daily' ? (
                  <input
                    type="date"
                    value={doctorAnalyticsPeriod}
                    onChange={(e) => setDoctorAnalyticsPeriod(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                  />
                ) : (
                  <input
                    type="month"
                    value={doctorAnalyticsPeriod}
                    onChange={(e) => setDoctorAnalyticsPeriod(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                  />
                )}
              </div>
            </div>

            {doctorAnalytics.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No doctor consultations recorded for {doctorAnalyticsPeriod}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 dark:border-slate-800/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/40">
                      <th className="py-3 px-4">Doctor & Specialty</th>
                      <th className="py-3 px-4 text-center">New Patients Seen</th>
                      <th className="py-3 px-4 text-center">Follow-up Patients</th>
                      <th className="py-3 px-4 text-center">Total Patients</th>
                      <th className="py-3 px-4 text-right">Consultation Fee</th>
                      <th className="py-3 px-4 text-right">Total Revenue (NPR)</th>
                      <th className="py-3 px-4 text-center">Drill-Down</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {doctorAnalytics.map((doc) => {
                      const newPct = doc.totalPatientsCount > 0 ? Math.round((doc.newPatientsCount / doc.totalPatientsCount) * 100) : 0
                      return (
                        <tr
                          key={`${doc.doctorId}_${doc.periodLabel}`}
                          onClick={() => setInspectedDoctorDetail(doc)}
                          className="hover:bg-teal-50/40 dark:hover:bg-slate-800/50 transition cursor-pointer"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Stethoscope className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                              <span>{doc.doctorName}</span>
                            </div>
                            <div className="text-[11px] text-slate-400">{doc.specialty}</div>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                              <Sparkles className="w-3 h-3" />
                              <span>{doc.newPatientsCount} New</span>
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-center font-semibold text-slate-600 dark:text-slate-300">
                            {doc.followupPatientsCount}
                          </td>

                          <td className="py-3.5 px-4 text-center font-bold text-slate-900 dark:text-white">
                            {doc.totalPatientsCount}{' '}
                            <span className="text-[10px] text-slate-400 font-normal">({newPct}% new)</span>
                          </td>

                          <td className="py-3.5 px-4 text-right font-medium text-slate-600 dark:text-slate-300">
                            Rs. {doc.consultationRevenue.toLocaleString()}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="font-black text-sm text-slate-900 dark:text-white">
                              Rs. {doc.totalRevenue.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Online: Rs. {doc.onlineRevenue.toLocaleString()} • Desk: Rs. {doc.deskRevenue.toLocaleString()}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setInspectedDoctorDetail(doc)
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold text-teal-600 hover:text-teal-500 bg-teal-500/10 hover:bg-teal-500/20 rounded-lg transition"
                            >
                              Patient List ({doc.patients.length})
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Department & Services Breakdown */}
        {activeTab === 'services' && (
          <div className="p-4 sm:p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(serviceBreakdown.categories).map(([catName, catData]) => {
                const sharePct = Math.round((catData.total / serviceBreakdown.grandTotal) * 100)
                return (
                  <div
                    key={catName}
                    className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4.5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                        {catName}
                      </span>
                      <span className="text-xs font-extrabold text-teal-600 dark:text-teal-400">
                        {sharePct}%
                      </span>
                    </div>

                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      Rs. {catData.total.toLocaleString()}
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-teal-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(5, sharePct))}%` }}
                      />
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                      <strong>{catData.count}</strong> bill items delivered
                    </div>

                    {/* Item list */}
                    {Object.keys(catData.items).length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {Object.entries(catData.items)
                          .slice(0, 4)
                          .map(([itName, itStats]) => (
                            <div key={itName} className="flex justify-between text-[11px] text-slate-600 dark:text-slate-300">
                              <span className="truncate max-w-[170px]">{itName}</span>
                              <span className="font-semibold">Rs. {itStats.total.toLocaleString()}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tab 4: 5% Platform Fees & Subscription History */}
        {activeTab === 'platform_and_license' && (
          <div className="p-4 sm:p-6 space-y-8">
            {/* 5% Pay at Desk Platform Fee Ledger */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>5% Pay-at-Desk Platform Service Charge Ledger</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Service charge breakdown collected on Pay-at-Desk bookings and settlement records with Dactor Platform.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Total Accrued (Period):</div>
                  <div className="text-base font-extrabold text-purple-600 dark:text-purple-400">
                    Rs. {summaryKpis.platformFee.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Settlement History Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {commissionSettlements.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No settlements recorded yet. 5% fees accrue automatically as Pay-at-Desk consultations are completed.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 uppercase">
                        <th className="py-2.5 px-3">Settlement Date</th>
                        <th className="py-2.5 px-3">Period</th>
                        <th className="py-2.5 px-3">Appointments</th>
                        <th className="py-2.5 px-3">Method / Ref</th>
                        <th className="py-2.5 px-3 text-right">Settled Amount (NPR)</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(commissionSettlements || []).map((s) => (
                        <tr key={s.id}>
                          <td className="py-2 px-3">{s.settled_at ? s.settled_at.slice(0, 10) : 'N/A'}</td>
                          <td className="py-2 px-3">
                            {s.period_start} to {s.period_end}
                          </td>
                          <td className="py-2 px-3">{s.appointments_count} visits</td>
                          <td className="py-2 px-3 font-mono">{s.payment_method} ({s.transaction_reference || 'REF-N/A'})</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900 dark:text-white">
                            Rs. {Number(s.commission_amount_npr || 0).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-600 font-bold">
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Clinic License Renewal & Subscription Receipts */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>Dactor License & Subscription Renewal Receipts</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Append-only record of license subscription fees paid to Dactor Admin for active software licensing.
                </p>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {subscriptionPayments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No renewal receipts on file. When license renewals are completed, they appear here permanently.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 uppercase">
                        <th className="py-2.5 px-3">Payment Date</th>
                        <th className="py-2.5 px-3">Plan</th>
                        <th className="py-2.5 px-3">Method & Txn Ref</th>
                        <th className="py-2.5 px-3">Valid Until</th>
                        <th className="py-2.5 px-3 text-right">Fee (NPR)</th>
                        <th className="py-2.5 px-3 text-center">Verification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(subscriptionPayments || []).map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 px-3">{p.created_at ? p.created_at.slice(0, 10) : 'N/A'}</td>
                          <td className="py-2 px-3 font-semibold uppercase">{p.plan_type}</td>
                          <td className="py-2 px-3 font-mono">{p.payment_method} ({p.transaction_reference || 'REF-N/A'})</td>
                          <td className="py-2 px-3">{p.period_end ? p.period_end.slice(0, 10) : 'Active'}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900 dark:text-white">
                            Rs. {Number(p.amount_npr || 0).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                p.status === 'verified'
                                  ? 'bg-emerald-500/10 text-emerald-600'
                                  : 'bg-amber-500/10 text-amber-600'
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL A: EXPANDABLE RECEIPT & AUDIT DRAWER
          ========================================================================= */}
      {selectedLogDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <FileText className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">Receipt & Transaction Audit</h3>
                  <p className="text-xs text-slate-400 font-mono">ID: {selectedLogDrawer.id.slice(0, 18)}...</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLogDrawer(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Patient</span>
                  <div className="font-bold text-slate-900 dark:text-white">{selectedLogDrawer.patientName}</div>
                  <div className="text-slate-400">{selectedLogDrawer.patientPhone}</div>
                  <div className="text-teal-600 dark:text-teal-400 font-mono font-bold mt-1">
                    Code: #{selectedLogDrawer.trackingCode}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Consulting Doctor</span>
                  <div className="font-bold text-slate-900 dark:text-white">{selectedLogDrawer.doctorName || 'General OPD'}</div>
                  <div className="text-slate-400">{selectedLogDrawer.specialty || 'General Practice'}</div>
                  <div className="mt-1">
                    {selectedLogDrawer.isNewPatientForDoctor ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                        NEW PATIENT VISIT
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-700 dark:text-sky-300">
                        FOLLOW-UP VISIT
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-400">Date & Time:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {selectedLogDrawer.date} at {selectedLogDrawer.time}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment Method:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedLogDrawer.paymentMethod}</span>
                </div>
                {selectedLogDrawer.referenceId && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Reference / Gateway Ref:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">{selectedLogDrawer.referenceId}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-slate-900 dark:text-white">Amount Paid:</span>
                  <span className="font-black text-base text-teal-600 dark:text-teal-400">
                    Rs. {selectedLogDrawer.amount.toLocaleString()}
                  </span>
                </div>
              </div>

              {selectedLogDrawer.note && (
                <div className="bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-xl text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Note: </span>
                  {selectedLogDrawer.note}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              {onOpenPatientBill && selectedLogDrawer.appointmentId && (
                <button
                  onClick={() => {
                    onOpenPatientBill(selectedLogDrawer.appointmentId!)
                    setSelectedLogDrawer(null)
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                >
                  Edit Invoice in Billing Tab
                </button>
              )}
              <button
                onClick={() => setSelectedLogDrawer(null)}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL B: DOCTOR PATIENT GROWTH DRILL-DOWN MODAL
          ========================================================================= */}
      {inspectedDoctorDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Stethoscope className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {inspectedDoctorDetail.doctorName} — Patient Growth Breakdown
                  </h3>
                  <p className="text-xs text-slate-400">
                    Period: <strong>{inspectedDoctorDetail.periodLabel}</strong> • {inspectedDoctorDetail.specialty}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectedDoctorDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl shrink-0 text-center">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">New Patients</div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {inspectedDoctorDetail.newPatientsCount}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">Follow-up Seen</div>
                <div className="text-xl font-bold text-slate-700 dark:text-slate-300">
                  {inspectedDoctorDetail.followupPatientsCount}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">Total Revenue</div>
                <div className="text-xl font-black text-slate-900 dark:text-white">
                  Rs. {inspectedDoctorDetail.totalRevenue.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Patient List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {(inspectedDoctorDetail.patients || []).map((p, idx) => (
                <div
                  key={`${p.trackingCode}_${idx}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{p.patientName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      #{p.trackingCode} • {p.dateTime}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-right">
                    {p.isNew ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/20">
                        FIRST VISIT
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/10 text-sky-600 border border-sky-500/20">
                        FOLLOW-UP
                      </span>
                    )}
                    <div className="font-black text-slate-900 dark:text-white">
                      Rs. {p.amount.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                onClick={() => setInspectedDoctorDetail(null)}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default ClinicPaymentLogsView
