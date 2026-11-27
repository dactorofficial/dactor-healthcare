import React, { useState, useEffect, useMemo } from 'react'
import {
  Calendar,
  Download,
  Printer,
  Search,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Trash2,
  Receipt,
  SlidersHorizontal,
  Phone,
  CheckCircle2,
} from 'lucide-react'
import {
  UnifiedPaymentLogEntry,
  PendingBillEntry,
  ClinicExpense,
  PaymentPeriodScope,
  buildUnifiedClinicPaymentLogs,
  buildPendingBills,
  computePaymentPeriodSummary,
  computeDoctorPeriodStats,
  computeTestPeriodStats,
  computeDoctorDailyAndMonthlyStats,
  exportPaymentLogsToCsv,
  formatNPR,
  formatListDayHeader,
  formatRowTime,
  extractLocalDate,
  isDiagnosticLabClinic,
} from '../utils/paymentLedger'
import { printClinicPaymentReportPdf } from '../utils/medicalDocPrinter'
import {
  getClinicInvoiceTransactions,
  getClinicSubscriptionPayments,
  getPlatformCommissionSettlements,
  getClinicExpenses,
  addClinicExpense,
  deleteClinicExpense,
  getClinicServices,
} from '../services/db'

interface ClinicPaymentLogsViewProps {
  clinic: any
  appointments?: any[]
  invoices?: any[]
  doctors?: any[]
  onOpenPatientBill?: (appointmentId: string) => void
}

function stepDay(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function stepMonth(ymStr: string, delta: number): string {
  const [y, m] = ymStr.split('-').map(Number)
  const d = new Date(y, (m || 1) - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMethodLabel(raw: string): string {
  switch (raw.trim().toUpperCase()) {
    case 'ALL':
      return 'All'
    case 'CASH':
      return 'Cash'
    case 'FONEPAY':
    case 'FONEPAY_QR':
    case 'QR':
      return 'Fonepay'
    case 'ESEWA':
      return 'eSewa'
    case 'KHALTI':
      return 'Khalti'
    case 'CONNECTIPS':
      return 'ConnectIPS'
    case 'PAY_AT_DESK':
      return 'Pay at Desk'
    case 'ONLINE':
      return 'Online'
    case 'FREE':
      return 'Free'
    case 'BANK_TRANSFER':
      return 'Bank'
    case 'REFUND':
      return 'Refund'
    default:
      return raw.replace(/_/g, ' ')
  }
}

function getMethodBadgeClasses(method: string): string {
  switch (method.trim().toUpperCase()) {
    case 'CASH':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    case 'FONEPAY':
    case 'FONEPAY_QR':
    case 'QR':
      return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    case 'ESEWA':
      return 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    case 'KHALTI':
      return 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
    case 'PAY_AT_DESK':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
    case 'ONLINE':
    case 'CONNECTIPS':
    case 'BANK_TRANSFER':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  }
}

function matchesMethodFilter(log: UnifiedPaymentLogEntry, filter: string): boolean {
  if (!filter || filter === 'all') return true
  const target = filter.trim().toUpperCase()
  const m = (log.paymentMethod || '').trim().toUpperCase()
  const mode = (log.paymentMode || '').trim().toUpperCase()
  if (target === 'PAY_AT_DESK') return mode === 'PAY_AT_DESK' || m === 'PAY_AT_DESK'
  if (target === 'ONLINE') return mode === 'ONLINE' || ['ESEWA', 'KHALTI', 'FONEPAY', 'FONEPAY_QR', 'CONNECTIPS', 'ONLINE'].includes(m)
  if (target === 'FREE') return log.amount === 0 || m === 'FREE'
  return m === target
}

export const ClinicPaymentLogsView: React.FC<ClinicPaymentLogsViewProps> = ({
  clinic,
  appointments = [],
  invoices = [],
  doctors = [],
  onOpenPatientBill,
}) => {
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const yesterdayStr = useMemo(() => stepDay(todayStr, -1), [todayStr])
  const currentMonthStr = useMemo(() => todayStr.slice(0, 7), [todayStr])
  const currentYearStr = useMemo(() => todayStr.slice(0, 4), [todayStr])

  const [activeTab, setActiveTab] = useState<'payments' | 'pending' | 'breakdown' | 'expenses' | 'fees'>('payments')

  // Period selector state
  const [periodScope, setPeriodScope] = useState<PaymentPeriodScope>('day')
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr)
  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr)
  const [customStartDate, setCustomStartDate] = useState<string>(stepDay(todayStr, -6))
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr)

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedMethod, setSelectedMethod] = useState<string>('all')
  const [selectedVisitType, setSelectedVisitType] = useState<string>('all')
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all')
  const [selectedTestName, setSelectedTestName] = useState<string>('all')
  const [selectedPendingStatus, setSelectedPendingStatus] = useState<string>('all')
  const [showFiltersModal, setShowFiltersModal] = useState<boolean>(false)

  // Remote state
  const [invoiceTransactions, setInvoiceTransactions] = useState<any[]>([])
  const [subscriptionPayments, setSubscriptionPayments] = useState<any[]>([])
  const [commissionSettlements, setCommissionSettlements] = useState<any[]>([])
  const [expenses, setExpenses] = useState<ClinicExpense[]>([])
  const [clinicServices, setClinicServices] = useState<any[]>([])
  const [isLoadingRemote, setIsLoadingRemote] = useState<boolean>(true)

  // Modals
  const [detailTarget, setDetailTarget] = useState<{ kind: 'log'; entry: UnifiedPaymentLogEntry } | { kind: 'pending'; bill: PendingBillEntry } | null>(null)
  const [showAddExpenseModal, setShowAddExpenseModal] = useState<boolean>(false)
  const [expenseToDelete, setExpenseToDelete] = useState<ClinicExpense | null>(null)
  const [isSavingExpense, setIsSavingExpense] = useState<boolean>(false)

  const isLabClinic = useMemo(() => isDiagnosticLabClinic(clinic), [clinic])

  useEffect(() => {
    let isMounted = true
    const loadLedgers = async () => {
      if (!clinic?.id) {
        setIsLoadingRemote(false)
        return
      }
      setIsLoadingRemote(true)
      try {
        const [txs, subs, coms, exps, srvs] = await Promise.all([
          getClinicInvoiceTransactions(clinic.id),
          getClinicSubscriptionPayments(clinic.id),
          getPlatformCommissionSettlements(clinic.id),
          getClinicExpenses(clinic.id),
          getClinicServices(clinic.id).catch(() => []),
        ])
        if (isMounted) {
          setInvoiceTransactions(txs)
          setSubscriptionPayments(subs)
          setCommissionSettlements(coms)
          setExpenses(exps)
          setClinicServices(srvs)
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

  const rawLogs = useMemo(
    () => buildUnifiedClinicPaymentLogs(appointments, invoices, invoiceTransactions, doctors, isLabClinic, clinicServices),
    [appointments, invoices, invoiceTransactions, doctors, isLabClinic, clinicServices]
  )

  const isDateInPeriod = useMemo(() => {
    return (raw?: string | null) => {
      const d = extractLocalDate(raw) || String(raw || '').slice(0, 10)
      if (!d) return false
      if (periodScope === 'day') return d === selectedDate
      if (periodScope === 'month') return d.startsWith(selectedMonth)
      if (periodScope === 'year') return d.startsWith(selectedYear)
      const s = customStartDate <= customEndDate ? customStartDate : customEndDate
      const e = customStartDate <= customEndDate ? customEndDate : customStartDate
      return d >= s && d <= e
    }
  }, [periodScope, selectedDate, selectedMonth, selectedYear, customStartDate, customEndDate])

  const periodLogs = useMemo(() => rawLogs.filter((l) => isDateInPeriod(l.dateTime)), [rawLogs, isDateInPeriod])

  const periodPendingBills = useMemo(
    () => buildPendingBills(appointments, invoices, doctors, isLabClinic, clinicServices, (d) => isDateInPeriod(d)),
    [appointments, invoices, doctors, isLabClinic, clinicServices, isDateInPeriod]
  )

  const periodExpenses = useMemo(
    () =>
      expenses
        .filter((e) => isDateInPeriod(e.expense_date))
        .sort((a, b) => (b.expense_date || '').localeCompare(a.expense_date || '')),
    [expenses, isDateInPeriod]
  )

  const periodAppointments = useMemo(
    () => (appointments || []).filter((a) => isDateInPeriod(a.appointmentDate)),
    [appointments, isDateInPeriod]
  )

  const periodSubscriptions = useMemo(
    () => (subscriptionPayments || []).filter((s) => isDateInPeriod(s.created_at)),
    [subscriptionPayments, isDateInPeriod]
  )

  const summary = useMemo(
    () => computePaymentPeriodSummary(periodLogs, periodPendingBills, periodExpenses, periodSubscriptions),
    [periodLogs, periodPendingBills, periodExpenses, periodSubscriptions]
  )

  const doctorStats = useMemo(
    () => (isLabClinic ? [] : computeDoctorPeriodStats(periodLogs, periodAppointments, appointments, doctors)),
    [isLabClinic, periodLogs, periodAppointments, appointments, doctors]
  )

  const testStats = useMemo(
    () => (isLabClinic ? computeTestPeriodStats(periodLogs, appointments, invoices, clinicServices) : []),
    [isLabClinic, periodLogs, appointments, invoices, clinicServices]
  )

  const availableMethods = useMemo(() => {
    const base = ['all', 'CASH', 'FONEPAY', 'ESEWA', 'KHALTI', 'PAY_AT_DESK', 'ONLINE', 'FREE']
    const seen = new Set(base)
    const extra: string[] = []
    for (const l of periodLogs) {
      const code = (l.paymentMethod || '').trim().toUpperCase()
      if (code && !seen.has(code)) {
        seen.add(code)
        extra.push(code)
      }
    }
    return [...base, ...extra]
  }, [periodLogs])

  const availableTests = useMemo(() => {
    const set = new Set<string>()
    testStats.forEach((t) => set.add(t.testName))
    clinicServices.forEach((s) => {
      const n = String(s.service_name || s.serviceName || '').trim()
      if (n) set.add(n)
    })
    periodLogs.forEach((l) => l.testNames.forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [testStats, clinicServices, periodLogs])

  const filteredLogs = useMemo(() => {
    return periodLogs.filter((log) => {
      if (!matchesMethodFilter(log, selectedMethod)) return false
      if (!isLabClinic && selectedVisitType !== 'all' && log.visitType !== selectedVisitType) return false
      if (!isLabClinic && selectedDoctorId !== 'all' && log.doctorId !== selectedDoctorId) return false
      if (isLabClinic && selectedTestName !== 'all' && !log.testNames.some((t) => t.toLowerCase() === selectedTestName.toLowerCase())) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const hit =
          log.patientName.toLowerCase().includes(q) ||
          log.patientPhone.includes(q) ||
          log.trackingCode.toLowerCase().includes(q) ||
          (log.referenceId || '').toLowerCase().includes(q) ||
          (isLabClinic
            ? log.testNames.some((t) => t.toLowerCase().includes(q))
            : (log.doctorName || '').toLowerCase().includes(q))
        if (!hit) return false
      }
      return true
    })
  }, [periodLogs, selectedMethod, selectedVisitType, selectedDoctorId, selectedTestName, searchQuery, isLabClinic])

  const filteredPendingBills = useMemo(() => {
    return periodPendingBills.filter((bill) => {
      if (selectedMethod !== 'all') {
        const target = selectedMethod.toUpperCase()
        const mode = (bill.paymentMode || '').toUpperCase()
        if (target === 'PAY_AT_DESK' && mode !== 'PAY_AT_DESK') return false
        if (target === 'ONLINE' && mode === 'PAY_AT_DESK') return false
        if (target !== 'PAY_AT_DESK' && target !== 'ONLINE' && mode !== target) return false
      }
      if (!isLabClinic && selectedVisitType !== 'all' && bill.visitType !== selectedVisitType) return false
      if (!isLabClinic && selectedDoctorId !== 'all' && bill.doctorId !== selectedDoctorId) return false
      if (isLabClinic && selectedTestName !== 'all' && !bill.testNames.some((t) => t.toLowerCase() === selectedTestName.toLowerCase())) {
        return false
      }
      if (selectedPendingStatus === 'unpaid' && bill.isPartlyPaid) return false
      if (selectedPendingStatus === 'partial' && !bill.isPartlyPaid) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const hit =
          bill.patientName.toLowerCase().includes(q) ||
          bill.patientPhone.includes(q) ||
          bill.trackingCode.toLowerCase().includes(q) ||
          (isLabClinic
            ? bill.testNames.some((t) => t.toLowerCase().includes(q))
            : (bill.doctorName || '').toLowerCase().includes(q))
        if (!hit) return false
      }
      return true
    })
  }, [periodPendingBills, selectedMethod, selectedVisitType, selectedDoctorId, selectedTestName, selectedPendingStatus, searchQuery, isLabClinic])

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = []
    if (selectedMethod !== 'all') {
      chips.push({ key: 'method', label: formatMethodLabel(selectedMethod), clear: () => setSelectedMethod('all') })
    }
    if (!isLabClinic && selectedVisitType !== 'all') {
      chips.push({
        key: 'visit',
        label: selectedVisitType === 'new' ? 'New' : 'Follow-up',
        clear: () => setSelectedVisitType('all'),
      })
    }
    if (!isLabClinic && selectedDoctorId !== 'all') {
      const doc = doctors.find((d) => d.id === selectedDoctorId)
      chips.push({
        key: 'doc',
        label: doc?.fullName || doc?.name || 'Doctor',
        clear: () => setSelectedDoctorId('all'),
      })
    }
    if (isLabClinic && selectedTestName !== 'all') {
      chips.push({ key: 'test', label: selectedTestName, clear: () => setSelectedTestName('all') })
    }
    if (activeTab === 'pending' && selectedPendingStatus !== 'all') {
      chips.push({
        key: 'status',
        label: selectedPendingStatus === 'unpaid' ? 'Unpaid' : 'Partly paid',
        clear: () => setSelectedPendingStatus('all'),
      })
    }
    return chips
  }, [selectedMethod, isLabClinic, selectedVisitType, selectedDoctorId, doctors, selectedTestName, activeTab, selectedPendingStatus])

  const resetFilters = () => {
    setSelectedMethod('all')
    setSelectedVisitType('all')
    setSelectedDoctorId('all')
    setSelectedTestName('all')
    setSelectedPendingStatus('all')
    setSearchQuery('')
  }

  const periodStepperLabel = useMemo(() => {
    if (periodScope === 'day') {
      const d = new Date(`${selectedDate}T00:00:00`)
      const base = isNaN(d.getTime())
        ? selectedDate
        : d.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
      if (selectedDate === todayStr) return `Today, ${base}`
      if (selectedDate === yesterdayStr) return `Yesterday, ${base}`
      return base
    }
    if (periodScope === 'month') {
      const [y, m] = selectedMonth.split('-').map(Number)
      const d = new Date(y, (m || 1) - 1, 1)
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    if (periodScope === 'year') return selectedYear
    return `${customStartDate} – ${customEndDate}`
  }, [periodScope, selectedDate, selectedMonth, selectedYear, customStartDate, customEndDate, todayStr, yesterdayStr])

  const canStepNext =
    (periodScope === 'day' && selectedDate < todayStr) ||
    (periodScope === 'month' && selectedMonth < currentMonthStr) ||
    (periodScope === 'year' && selectedYear < currentYearStr)

  const handleStep = (delta: number) => {
    if (periodScope === 'day') setSelectedDate((prev) => stepDay(prev, delta))
    else if (periodScope === 'month') setSelectedMonth((prev) => stepMonth(prev, delta))
    else if (periodScope === 'year') setSelectedYear((prev) => String((Number(prev) || new Date().getFullYear()) + delta))
  }

  const handleExportCsv = () => {
    const csvContent = exportPaymentLogsToCsv(filteredLogs, clinic?.name || 'Clinic', periodExpenses, periodStepperLabel, isLabClinic)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Dactor_Payment_Logs_${todayStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handlePrintPdf = () => {
    const legacySummary = {
      netCollection: summary.collected,
      grossCollected: summary.collected,
      onlineAmount: periodLogs.filter((l) => (l.paymentMode || '').toUpperCase() === 'ONLINE').reduce((a, b) => a + b.amount, 0),
      deskAmount: periodLogs.filter((l) => (l.paymentMode || '').toUpperCase() !== 'ONLINE').reduce((a, b) => a + b.amount, 0),
      pendingDue: summary.pendingTotal,
      totalPatients: periodLogs.length,
      newPatients: periodLogs.filter((l) => l.visitType === 'new').length,
      followupPatients: periodLogs.filter((l) => l.visitType === 'follow_up').length,
      platformFee: summary.platformFees,
      totalExpenses: summary.expenses,
      netClinicProfit: summary.net,
    }
    const legacyDocs = computeDoctorDailyAndMonthlyStats(appointments, invoices, doctors)
    printClinicPaymentReportPdf(clinic, periodStepperLabel, legacySummary, legacyDocs, filteredLogs, periodExpenses)
  }

  // Group payments by date
  const groupedLogs = useMemo(() => {
    const map = new Map<string, UnifiedPaymentLogEntry[]>()
    for (const log of filteredLogs) {
      const k = extractLocalDate(log.dateTime) || log.date || 'other'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(log)
    }
    return Array.from(map.entries())
  }, [filteredLogs])

  // Group pending bills by visitDate (already oldest-first)
  const groupedPending = useMemo(() => {
    const map = new Map<string, PendingBillEntry[]>()
    for (const b of filteredPendingBills) {
      const k = b.visitDate || 'other'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(b)
    }
    return Array.from(map.entries())
  }, [filteredPendingBills])

  // Group expenses by date
  const groupedExpenses = useMemo(() => {
    const map = new Map<string, ClinicExpense[]>()
    for (const exp of periodExpenses) {
      const k = (exp.expense_date || '').slice(0, 10) || 'other'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(exp)
    }
    return Array.from(map.entries())
  }, [periodExpenses])

  const detailAppt = useMemo(() => {
    if (!detailTarget) return undefined
    const aId = detailTarget.kind === 'log' ? detailTarget.entry.appointmentId : detailTarget.bill.appointmentId
    return (appointments || []).find((a) => a.id === aId)
  }, [detailTarget, appointments])

  const detailInv = useMemo(() => {
    if (!detailTarget) return undefined
    const aId = detailTarget.kind === 'log' ? detailTarget.entry.appointmentId : detailTarget.bill.appointmentId
    const iId = detailTarget.kind === 'log' ? detailTarget.entry.invoiceId : detailTarget.bill.invoiceId
    return (invoices || []).find((inv) => (iId && inv.id === iId) || (aId && (inv.appointmentId === aId || inv.appointment_id === aId)))
  }, [detailTarget, invoices])

  const detailPayments = useMemo(() => {
    if (!detailTarget) return []
    const aId = detailTarget.kind === 'log' ? detailTarget.entry.appointmentId : detailTarget.bill.appointmentId
    const iId = detailTarget.kind === 'log' ? detailTarget.entry.invoiceId : detailTarget.bill.invoiceId
    return rawLogs
      .filter((l) => (aId && l.appointmentId === aId) || (iId && l.invoiceId === iId))
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  }, [detailTarget, rawLogs])

  return (
    <div className="space-y-4">
      {/* 1. Top Bar & Period Selector */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Payment Logs</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5 text-teal-600" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PDF Summary</span>
            </button>
            <button
              onClick={() => setShowAddExpenseModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Expense</span>
            </button>
          </div>
        </div>

        {/* Segmented Period Selector */}
        <div className="grid grid-cols-4 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800/60">
          {(['day', 'month', 'year', 'custom'] as PaymentPeriodScope[]).map((scope) => (
            <button
              key={scope}
              onClick={() => setPeriodScope(scope)}
              className={`py-2 text-xs font-semibold capitalize transition ${
                periodScope === scope
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {scope}
            </button>
          ))}
        </div>

        {/* Stepper / Custom Range Row */}
        {periodScope !== 'custom' ? (
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => handleStep(-1)}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              <span>{periodStepperLabel}</span>
            </div>
            <button
              onClick={() => handleStep(1)}
              disabled={!canStepNext}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
        )}
      </div>

      {/* 2. Summary Grid (2x2) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          onClick={() => setActiveTab('payments')}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-teal-500/50 transition"
        >
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Collected</div>
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 truncate">
            {formatNPR(summary.collected)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {summary.collectedCount} {summary.collectedCount === 1 ? 'payment' : 'payments'}
          </div>
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-amber-500/50 transition"
        >
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending</div>
          <div className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-0.5 truncate">
            {formatNPR(summary.pendingTotal)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {summary.pendingCount} {summary.pendingCount === 1 ? 'bill' : 'bills'}
          </div>
        </button>

        <button
          onClick={() => setActiveTab('expenses')}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-rose-500/50 transition"
        >
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Expenses</div>
          <div className="text-xl font-bold text-rose-700 dark:text-rose-400 mt-0.5 truncate">
            {formatNPR(summary.expenses)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {summary.expensesCount} {summary.expensesCount === 1 ? 'entry' : 'entries'}
          </div>
        </button>

        <button
          onClick={() => setActiveTab('fees')}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-violet-500/50 transition"
        >
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Net</div>
          <div
            className={`text-xl font-bold mt-0.5 truncate ${
              summary.net < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-violet-800 dark:text-violet-400'
            }`}
          >
            {formatNPR(summary.net)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">after fees &amp; expenses</div>
        </button>
      </div>

      {/* 3. Sticky Tabs + Search/Filters + Content Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex overflow-x-auto px-4 gap-4 border-b border-slate-100 dark:border-slate-800">
            {(
              [
                ['payments', `Payments (${filteredLogs.length})`],
                ['pending', `Pending (${filteredPendingBills.length})`],
                ['breakdown', isLabClinic ? `Tests (${testStats.length})` : `Doctors (${doctorStats.length})`],
                ['expenses', `Expenses (${periodExpenses.length})`],
                ['fees', 'Fees'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`py-3 text-[13px] font-semibold whitespace-nowrap border-b-2 transition ${
                  activeTab === key
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {(activeTab === 'payments' || activeTab === 'pending') && (
            <div className="p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, phone, code"
                    className="w-full pl-9 pr-8 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setShowFiltersModal(true)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition ${
                    activeChips.length > 0
                      ? 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/30 dark:border-teal-800 dark:text-teal-300'
                      : 'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Filters{activeChips.length > 0 ? ` (${activeChips.length})` : ''}</span>
                </button>
              </div>

              {activeChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {activeChips.map((chip) => (
                    <button
                      key={chip.key}
                      onClick={chip.clear}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border border-teal-200 dark:border-teal-800"
                    >
                      <span>{chip.label}</span>
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Body Content */}
        {isLoadingRemote ? (
          <div className="p-4 space-y-2.5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-18 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse p-3" />
            ))}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {/* TAB: PAYMENTS */}
            {activeTab === 'payments' &&
              (groupedLogs.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {activeChips.length > 0 || searchQuery ? 'No payments match your filters' : `No payments for ${periodStepperLabel}`}
                  </div>
                  <div className="text-xs text-slate-500">
                    {activeChips.length > 0 || searchQuery
                      ? 'Try clearing active filters or search text.'
                      : 'Payments you collect will appear here.'}
                  </div>
                  {(activeChips.length > 0 || searchQuery) && (
                    <button onClick={resetFilters} className="text-xs font-bold text-teal-600 hover:underline pt-1">
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                groupedLogs.map(([dateKey, dayLogs]) => {
                  const dayTotal = dayLogs.reduce((acc, l) => acc + l.amount, 0)
                  return (
                    <div key={dateKey} className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg">
                        <span>{formatListDayHeader(dateKey, todayStr, yesterdayStr)}</span>
                        <span>
                          {formatNPR(dayTotal)} · {dayLogs.length}
                        </span>
                      </div>
                      {dayLogs.map((log) => {
                        const subtitleParts = [`#${log.trackingCode || '–'}`]
                        if (isLabClinic) {
                          if (log.testNames.length > 0) subtitleParts.push(log.testNames.join(', '))
                        } else if (log.doctorName) {
                          subtitleParts.push(log.doctorName)
                        }
                        return (
                          <div
                            key={log.id}
                            onClick={() => setDetailTarget({ kind: 'log', entry: log })}
                            className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 hover:border-teal-500/40 cursor-pointer transition space-y-1.5 bg-white dark:bg-slate-900"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{log.patientName}</div>
                              <div
                                className={`text-sm font-bold shrink-0 ${
                                  log.isRefund || log.amount < 0
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : log.amount === 0
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                {log.amount === 0 && !log.isRefund ? 'Free' : formatNPR(log.amount)}
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <div className="truncate">{subtitleParts.join(' · ')}</div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${getMethodBadgeClasses(log.paymentMethod)}`}>
                                  {formatMethodLabel(log.paymentMethod)}
                                </span>
                                <span>{log.time}</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {!isLabClinic && log.visitType === 'new' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#D1FAE5] text-[#065F46]">NEW</span>
                              )}
                              {!isLabClinic && log.visitType === 'follow_up' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#DBEAFE] text-[#1E40AF]">FOLLOW-UP</span>
                              )}
                              {log.amount === 0 && !log.isRefund && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EFF6FF] text-[#2563EB]">FREE</span>
                              )}
                              {log.paymentPart && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FEF3C7] text-[#92400E]">
                                  PART {log.paymentPart[0]}/{log.paymentPart[1]}
                                </span>
                              )}
                              {log.paymentMode === 'PAY_AT_DESK' && (log.serviceChargeAmount || 0) > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EDE9FE] text-[#5B21B6]">PAY AT DESK +5%</span>
                              )}
                              {(log.isRefund || log.amount < 0) && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FFE4E6] text-[#9F1239]">REFUND</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              ))}

            {/* TAB: PENDING */}
            {activeTab === 'pending' &&
              (groupedPending.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto" />
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">No pending bills</div>
                  <div className="text-xs text-slate-500">Unpaid and partly paid bills for visits in this period appear here.</div>
                </div>
              ) : (
                groupedPending.map(([dateKey, dayBills]) => {
                  const dayDue = dayBills.reduce((acc, b) => acc + b.balanceDue, 0)
                  return (
                    <div key={dateKey} className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg">
                        <span>{formatListDayHeader(dateKey, todayStr, yesterdayStr)}</span>
                        <span>
                          {formatNPR(dayDue)} due · {dayBills.length}
                        </span>
                      </div>
                      {dayBills.map((bill) => {
                        const sub = [`#${bill.trackingCode}`]
                        if (isLabClinic && bill.testNames.length > 0) sub.push(bill.testNames.join(', '))
                        else if (!isLabClinic && bill.doctorName) sub.push(bill.doctorName)
                        sub.push(`of ${formatNPR(bill.totalAmount)}`)
                        return (
                          <div
                            key={bill.appointmentId}
                            onClick={() => setDetailTarget({ kind: 'pending', bill })}
                            className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 hover:border-amber-500/40 cursor-pointer transition space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{bill.patientName}</div>
                              <div className="text-sm font-bold text-amber-700 dark:text-amber-400 shrink-0">
                                {formatNPR(bill.balanceDue)} due
                              </div>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{sub.join(' · ')}</div>
                            <div className="flex items-center justify-between pt-0.5">
                              <div className="flex flex-wrap gap-1.5">
                                {bill.isPartlyPaid ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FFEDD5] text-[#9A3412]">PARTLY PAID</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FEF3C7] text-[#92400E]">UNPAID</span>
                                )}
                                {bill.paymentMode === 'PAY_AT_DESK' && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EDE9FE] text-[#5B21B6]">PAY AT DESK</span>
                                )}
                              </div>
                              {onOpenPatientBill && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onOpenPatientBill(bill.appointmentId)
                                  }}
                                  className="text-xs font-bold text-teal-600 hover:text-teal-500 px-2 py-1 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/20"
                                >
                                  Collect
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              ))}

            {/* TAB: DOCTORS (OPD) OR TESTS (LAB) */}
            {activeTab === 'breakdown' && !isLabClinic && (
              <div className="space-y-3">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Visits {doctorStats.reduce((a, d) => a + d.totalVisits, 0)} · New{' '}
                  {doctorStats.reduce((a, d) => a + d.newPatients, 0)} · Follow-ups{' '}
                  {doctorStats.reduce((a, d) => a + d.followupPatients, 0)}
                </div>
                {doctorStats.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">No doctor activity in this period.</div>
                ) : (
                  doctorStats.map((doc) => (
                    <div
                      key={doc.doctorId}
                      onClick={() => {
                        setSelectedDoctorId(doc.doctorId)
                        setActiveTab('payments')
                      }}
                      className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-teal-500/40 cursor-pointer space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{doc.doctorName}</div>
                        <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatNPR(doc.collectedAmount)}</div>
                      </div>
                      <div className="text-xs text-slate-500">
                        {doc.specialty} · Fee {formatNPR(doc.consultationFee)}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-white">{doc.totalVisits}</strong> visits &nbsp;&nbsp;
                        <strong className="text-slate-900 dark:text-white">{doc.newPatients}</strong> new &nbsp;&nbsp;
                        <strong className="text-slate-900 dark:text-white">{doc.followupPatients}</strong> follow-ups
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-teal-100 dark:bg-teal-900/30 overflow-hidden">
                          <div
                            className="h-full bg-teal-600 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, Math.round(doc.sharePercent)))}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-slate-500">{Math.round(doc.sharePercent)}% of income</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'breakdown' && isLabClinic && (
              <div className="space-y-3">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Tests done {testStats.reduce((a, t) => a + t.count, 0)} · Bills{' '}
                  {new Set(periodLogs.map((l) => l.appointmentId || l.invoiceId).filter(Boolean)).size}
                </div>
                {testStats.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">No paid test collections in this period.</div>
                ) : (
                  <>
                    {testStats.map((st) => (
                      <div
                        key={st.testName}
                        onClick={() => {
                          setSelectedTestName(st.testName)
                          setActiveTab('payments')
                        }}
                        className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 hover:border-teal-500/40 cursor-pointer space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{st.testName}</div>
                          <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatNPR(st.collectedIncome)}</div>
                        </div>
                        <div className="text-xs text-slate-500">
                          {st.count} {st.count === 1 ? 'test' : 'tests'} · {formatNPR(st.unitPrice)} each
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 rounded-full bg-teal-100 dark:bg-teal-900/30 overflow-hidden">
                            <div
                              className="h-full bg-teal-600 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(0, Math.round(st.sharePercent)))}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500">{Math.round(st.sharePercent)}% of income</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">Total</span>
                      <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        {formatNPR(testStats.reduce((a, t) => a + t.collectedIncome, 0))}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB: EXPENSES */}
            {activeTab === 'expenses' &&
              (groupedExpenses.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">No expenses for this period</div>
                  <div className="text-xs text-slate-500">Click Add Expense above to record clinic costs.</div>
                </div>
              ) : (
                groupedExpenses.map(([dateKey, dayExps]) => {
                  const daySum = dayExps.reduce((a, e) => a + (Number(e.amount) || 0), 0)
                  return (
                    <div key={dateKey} className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg">
                        <span>{formatListDayHeader(dateKey, todayStr, yesterdayStr)}</span>
                        <span>
                          {formatNPR(-daySum)} · {dayExps.length}
                        </span>
                      </div>
                      {dayExps.map((exp) => {
                        const isAutoSettled = Boolean(exp.settlement_id) || String(exp.category || '').toUpperCase() === 'PLATFORM_COMMISSION'
                        return (
                        <div
                          key={exp.id}
                          className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{exp.title}</div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isAutoSettled
                                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                                    : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                                }`}
                              >
                                {String(exp.category || 'OTHER').replace(/_/g, ' ')}
                              </span>
                              {isAutoSettled && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  Auto-settled
                                </span>
                              )}
                              <span>{formatMethodLabel(exp.payment_method || 'CASH')}</span>
                              {exp.expense_time && <span>· {formatRowTime(`2026-01-01 ${exp.expense_time}`)}</span>}
                              {(exp.voucher_number || exp.receipt_no) && <span>· Voucher #{exp.voucher_number || exp.receipt_no}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-rose-700 dark:text-rose-400">
                              {formatNPR(-Number(exp.amount || 0))}
                            </span>
                            {!isAutoSettled && (
                              <button
                                onClick={() => setExpenseToDelete(exp)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                                title="Delete Expense"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  )
                })
              ))}

            {/* TAB: FEES */}
            {activeTab === 'fees' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Platform fee (5% on Pay-at-Desk)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                      <div className="text-xs text-slate-500">Due</div>
                      <div className="text-lg font-bold text-amber-700 dark:text-amber-400">{formatNPR(summary.platformFees)}</div>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                      <div className="text-xs text-slate-500">Settled</div>
                      <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                        {formatNPR(
                          commissionSettlements
                            .filter((s) => String(s.status || '').toLowerCase() === 'settled')
                            .reduce((a, s) => a + Number(s.commission_amount_npr || 0), 0)
                        )}
                      </div>
                    </div>
                  </div>
                  {commissionSettlements.length === 0 ? (
                    <div className="text-xs text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                      No platform settlements recorded yet.
                    </div>
                  ) : (
                    commissionSettlements.map((s) => (
                      <div
                        key={s.id}
                        className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {s.period_start} → {s.period_end}
                          </div>
                          <div className="text-slate-500">Ref: {s.transaction_reference || '–'}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-teal-600">{formatNPR(Number(s.commission_amount_npr || 0))}</div>
                          <span className="text-[10px] font-bold uppercase text-emerald-600">{s.status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-teal-600" />
                    <span>Subscription</span>
                  </h3>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {String(clinic?.activation_plan || '').includes('12') ? 'Annual Plan' : 'Monthly Plan'}
                      </div>
                      <div className="text-slate-500">
                        Next due / expires: {clinic?.activation_expires_at ? String(clinic.activation_expires_at).slice(0, 10) : 'Active'}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                      {clinic?.is_activated !== false ? 'ACTIVE' : 'EXPIRED'}
                    </span>
                  </div>
                  {subscriptionPayments.map((sub) => (
                    <div
                      key={sub.id}
                      className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white uppercase">{sub.plan_type}</div>
                        <div className="text-slate-500">
                          {sub.created_at ? String(sub.created_at).slice(0, 10) : '–'} · {formatMethodLabel(sub.payment_method || 'ESEWA')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-700">{formatNPR(Number(sub.amount_npr || 0))}</div>
                        <span className="text-[10px] font-bold uppercase text-slate-500">{sub.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters Modal */}
      {showFiltersModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold">Filters</h3>
              <button onClick={resetFilters} className="text-xs font-semibold text-teal-600 hover:underline">
                Reset
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500">Payment method</div>
              <div className="flex flex-wrap gap-1.5">
                {availableMethods.map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedMethod(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      selectedMethod.toLowerCase() === m.toLowerCase()
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {formatMethodLabel(m)}
                  </button>
                ))}
              </div>
            </div>

            {!isLabClinic && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500">Visit type</div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ['all', 'All'],
                    ['new', 'New'],
                    ['follow_up', 'Follow-up'],
                  ].map(([k, l]) => (
                    <button
                      key={k}
                      onClick={() => setSelectedVisitType(k)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        selectedVisitType === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isLabClinic && doctors.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500">Doctor</div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedDoctorId('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      selectedDoctorId === 'all' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    All doctors
                  </button>
                  {doctors.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDoctorId(d.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        selectedDoctorId === d.id ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {d.fullName || d.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isLabClinic && availableTests.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500">Tests</div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedTestName('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      selectedTestName === 'all' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    All tests
                  </button>
                  {availableTests.map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedTestName(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        selectedTestName === t ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'pending' && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500">Status</div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ['all', 'All'],
                    ['unpaid', 'Unpaid'],
                    ['partial', 'Partly paid'],
                  ].map(([k, l]) => (
                    <button
                      key={k}
                      onClick={() => setSelectedPendingStatus(k)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        selectedPendingStatus === k ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setShowFiltersModal(false)}
              className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold"
            >
              Show {activeTab === 'pending' ? filteredPendingBills.length : filteredLogs.length} results
            </button>
          </div>
        </div>
      )}

      {/* Payment Detail Drawer */}
      {detailTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {detailTarget.kind === 'log' ? detailTarget.entry.patientName : detailTarget.bill.patientName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  #{detailTarget.kind === 'log' ? detailTarget.entry.trackingCode || '–' : detailTarget.bill.trackingCode}{' '}
                  · {detailTarget.kind === 'log' ? detailTarget.entry.dateTime : `${detailTarget.bill.visitDate} ${detailTarget.bill.visitTime}`}
                </p>
              </div>
              <button onClick={() => setDetailTarget(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-500">Bill</div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 space-y-1.5">
                {detailInv?.items && detailInv.items.length > 0 ? (
                  detailInv.items.map((it: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span>{it.itemName || it.item_name || it.name}</span>
                      <span className="font-semibold">{formatNPR(Number(it.total || it.price || 0))}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between">
                    <span>{isLabClinic ? 'Diagnostic Lab Order' : 'OPD Consultation'}</span>
                    <span className="font-semibold">
                      {formatNPR(
                        detailTarget.kind === 'log' ? detailTarget.entry.invoiceTotal || detailTarget.entry.amount : detailTarget.bill.totalAmount
                      )}
                    </span>
                  </div>
                )}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5 flex justify-between font-semibold">
                  <span>Paid</span>
                  <span className="text-emerald-700">{formatNPR(detailPayments.reduce((a, p) => a + p.amount, 0))}</span>
                </div>
                {((detailTarget.kind === 'pending' && detailTarget.bill.balanceDue > 0) ||
                  (detailTarget.kind === 'log' && (detailTarget.entry.balanceDue || 0) > 0)) && (
                  <div className="flex justify-between font-bold text-amber-700">
                    <span>Balance due</span>
                    <span>
                      {formatNPR(detailTarget.kind === 'pending' ? detailTarget.bill.balanceDue : detailTarget.entry.balanceDue || 0)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {detailPayments.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <div className="font-bold text-slate-500">Payments</div>
                {detailPayments.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">
                      {p.date} {p.time} · {formatMethodLabel(p.paymentMethod)}
                    </span>
                    <span className="font-bold text-emerald-700">{p.amount === 0 ? 'Free' : formatNPR(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              {onOpenPatientBill && detailAppt && (
                <button
                  onClick={() => {
                    onOpenPatientBill(detailAppt.id)
                    setDetailTarget(null)
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold"
                >
                  Open / Collect Bill
                </button>
              )}
              {(detailTarget.kind === 'log' ? detailTarget.entry.patientPhone : detailTarget.bill.patientPhone) && (
                <a
                  href={`tel:${detailTarget.kind === 'log' ? detailTarget.entry.patientPhone : detailTarget.bill.patientPhone}`}
                  className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  <Phone className="w-3.5 h-3.5 text-teal-600" />
                  <span>Call</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold">Log Clinic Expense</h3>
              <button onClick={() => setShowAddExpenseModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const title = String(fd.get('title') || '').trim()
                const amount = parseFloat(String(fd.get('amount') || '0'))
                if (!title || isNaN(amount) || amount <= 0) return
                setIsSavingExpense(true)
                try {
                  const saved = await addClinicExpense({
                    clinic_id: clinic.id,
                    title,
                    amount,
                    category: String(fd.get('category') || 'OTHER'),
                    payment_method: String(fd.get('payment_method') || 'CASH'),
                    expense_date: String(fd.get('expense_date') || todayStr),
                    expense_time: String(fd.get('expense_time') || '').trim() || undefined,
                    voucher_number: String(fd.get('voucher_number') || '').trim() || undefined,
                    remarks: String(fd.get('remarks') || '').trim() || undefined,
                  })
                  if (saved) {
                    setExpenses((prev) => [saved, ...prev])
                    setShowAddExpenseModal(false)
                  }
                } finally {
                  setIsSavingExpense(false)
                }
              }}
              className="space-y-3 text-xs"
            >
              <input
                type="text"
                name="title"
                required
                placeholder="Expense Title *"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  name="amount"
                  step="0.01"
                  min="1"
                  required
                  placeholder="Amount (NPR) *"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
                <select
                  name="category"
                  defaultValue="PETTY_CASH"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="PETTY_CASH">Petty Cash</option>
                  <option value="MEDICAL_SUPPLIES">Medical Supplies</option>
                  <option value="RENT">Rent</option>
                  <option value="SALARIES">Salaries</option>
                  <option value="UTILITIES">Utilities</option>
                  <option value="EQUIPMENT">Equipment</option>
                  <option value="REFRESHMENTS">Refreshments</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  name="payment_method"
                  defaultValue="CASH"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="CASH">Cash</option>
                  <option value="FONEPAY">Fonepay</option>
                  <option value="ESEWA">eSewa</option>
                  <option value="KHALTI">Khalti</option>
                  <option value="BANK_TRANSFER">Bank</option>
                </select>
                <input
                  type="text"
                  name="voucher_number"
                  placeholder="Voucher / Bill #"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  name="expense_date"
                  defaultValue={periodScope === 'day' ? selectedDate : todayStr}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
                <input
                  type="time"
                  name="expense_time"
                  defaultValue={new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <textarea
                name="remarks"
                rows={2}
                placeholder="Remarks / Vendor"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddExpenseModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingExpense}
                  className="px-5 py-2 rounded-xl bg-rose-600 text-white font-semibold disabled:opacity-50"
                >
                  {isSavingExpense ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Expense Confirm */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <h3 className="text-base font-bold">Delete Expense?</h3>
            <p className="text-xs text-slate-500">
              Delete "{expenseToDelete.title}" ({formatNPR(Number(expenseToDelete.amount || 0))})?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setExpenseToDelete(null)} className="w-1/2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteClinicExpense(expenseToDelete.id)
                    setExpenses((prev) => prev.filter((e) => e.id !== expenseToDelete.id))
                  } finally {
                    setExpenseToDelete(null)
                  }
                }}
                className="w-1/2 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClinicPaymentLogsView
