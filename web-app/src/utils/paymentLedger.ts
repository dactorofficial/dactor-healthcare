import { getEffectiveAppointmentTotal, getEffectiveInvoiceItems, getEffectiveInvoiceTotal } from '../types'

export interface WebPaymentRecord {
  id?: string
  amount: number
  dateTime: string
  note?: string
  paymentMethod?: 'CASH' | 'ESEWA' | 'KHALTI' | 'FONEPAY_QR' | 'CARD' | 'CONNECTIPS' | 'PAY_AT_DESK' | 'FREE' | string
  referenceId?: string
  category?: string
}

export type PaymentPeriodScope = 'day' | 'month' | 'year' | 'custom'

export interface UnifiedPaymentLogEntry {
  id: string
  invoiceId?: string
  appointmentId?: string
  clinicId: string
  dateTime: string
  date: string
  time: string
  patientName: string
  patientPhone: string
  trackingCode: string
  followUpOfAppointmentId?: string
  followUpOfTrackingCode?: string
  doctorId?: string
  doctorName?: string
  specialty?: string
  isNewPatientForDoctor: boolean
  visitType: 'new' | 'follow_up' | 'unknown' | ''
  testNames: string[]
  paymentPart?: [number, number]
  isRefund: boolean
  type: 'PAYMENT' | 'REFUND' | 'DISCOUNT' | 'CORRECTION'
  amount: number
  paymentMethod: string
  paymentMode?: string
  referenceId?: string
  category: string
  note?: string
  invoiceTotal?: number
  balanceDue?: number
  paymentStatus?: string
  items?: Array<{ name: string; price: number; quantity: number }>
  serviceChargeAmount?: number
}

export interface PendingBillEntry {
  invoiceId?: string
  appointmentId: string
  trackingCode: string
  patientName: string
  patientPhone: string
  doctorId?: string
  doctorName?: string
  testNames: string[]
  visitDate: string
  visitTime: string
  visitType: 'new' | 'follow_up' | 'unknown' | ''
  paymentMode: string
  totalAmount: number
  paidAmount: number
  balanceDue: number
  isPartlyPaid: boolean
}

export interface DoctorPeriodStat {
  doctorId: string
  doctorName: string
  specialty: string
  consultationFee: number
  totalVisits: number
  newPatients: number
  followupPatients: number
  collectedAmount: number
  sharePercent: number
}

export interface LabTestPeriodStat {
  testName: string
  count: number
  unitPrice: number
  collectedIncome: number
  sharePercent: number
}

export interface PaymentPeriodSummary {
  collected: number
  collectedCount: number
  pendingTotal: number
  pendingCount: number
  expenses: number
  expensesCount: number
  platformFees: number
  subscriptionDue: number
  net: number
}

export interface ClinicExpense {
  id: string
  clinic_id: string
  title: string
  category: string
  amount: number
  payment_method: string
  expense_date: string
  expense_time?: string
  voucher_number?: string
  receipt_no?: string
  remarks?: string
  notes?: string
  payee_name?: string
  receipt_url?: string
  settlement_id?: string | null
  created_at?: string
  updated_at?: string
}

export function isPlatformCommissionExpense(expense: ClinicExpense): boolean {
  return Boolean(expense.settlement_id) || String(expense.category || '').toUpperCase() === 'PLATFORM_COMMISSION'
}

export interface DoctorVisitAnalytics {
  doctorId: string
  doctorName: string
  specialty: string
  periodLabel: string
  periodDate?: string
  periodMonth?: string
  newPatientsCount: number
  followupPatientsCount: number
  totalPatientsCount: number
  consultationRevenue: number
  ancillaryRevenue: number
  totalRevenue: number
  onlineRevenue: number
  deskRevenue: number
  patients: Array<{
    patientName: string
    trackingCode: string
    dateTime: string
    isNew: boolean
    amount: number
    paymentMethod: string
  }>
}

const START_TAG = '<!--PAYMENT_LOG_START-->'
const END_TAG = '<!--PAYMENT_LOG_END-->'

/**
 * Nepali currency formatting (`Rs. 1,25,000`, omitting decimals unless non-zero paisa,
 * negative amounts prefixed with `− Rs. `).
 */
export function formatNPR(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0
  const totalPaisa = Math.round(Math.abs(safe) * 100)
  const isNeg = safe < -0.004 && totalPaisa > 0
  const whole = Math.floor(totalPaisa / 100)
  const paisa = totalPaisa % 100
  const digits = String(whole)
  let grouped = digits
  if (digits.length > 3) {
    const last3 = digits.slice(-3)
    const rem = digits.slice(0, -3)
    const chunks: string[] = []
    for (let i = rem.length; i > 0; i -= 2) {
      chunks.unshift(rem.slice(Math.max(0, i - 2), i))
    }
    grouped = `${chunks.join(',')},${last3}`
  }
  const numStr = paisa > 0 ? `${grouped}.${String(paisa).padStart(2, '0')}` : grouped
  return isNeg ? `− Rs. ${numStr}` : `Rs. ${numStr}`
}

const EXPLICIT_OPD_CLINIC_TYPES = new Set([
  'multi_visit',
  'single_visit',
  'single_doctor',
  'polyclinic',
  'opd',
  'opd_clinic',
  'general_clinic',
])

const LAB_WORKFLOW_ONLY_STATUSES = new Set([
  'sample_collected',
  'processing',
  'in_lab',
  'prepared',
  'report_prepared',
  'delivered',
])

export function isDiagnosticLabClinic(
  clinic?: any,
  doctor?: any,
  appt?: any
): boolean {
  if (doctor?.isLabTechnician || doctor?.practitionerRole === 'lab_technician') {
    return true
  }
  if (appt?.selectedTests && Array.isArray(appt.selectedTests) && appt.selectedTests.length > 0) {
    return true
  }
  if (typeof appt?.selectedLabTests === 'string' && appt.selectedLabTests.trim().length > 0) {
    return true
  }
  if (Array.isArray(appt?.selectedLabTests) && appt.selectedLabTests.length > 0) {
    return true
  }
  const cStatus = String(appt?.checkinStatus || '').trim().toLowerCase()
  const qStatus = String(appt?.queueStatus || '').trim().toLowerCase()
  if (LAB_WORKFLOW_ONLY_STATUSES.has(cStatus) || LAB_WORKFLOW_ONLY_STATUSES.has(qStatus)) {
    return true
  }

  if (!clinic) return false
  const t = String(clinic.type || '').trim().toLowerCase()
  if (t) {
    if (EXPLICIT_OPD_CLINIC_TYPES.has(t)) return false
    if (t === 'diagnostic_lab' || t.includes('diagnostic') || t.includes('lab') || t.includes('patholog') || t.includes('imaging')) {
      return true
    }
  }

  const n = String(clinic.name || '').toLowerCase()
  const specs = Array.isArray(clinic.specialties) ? clinic.specialties : []
  return (
    n.includes('diagnostic') ||
    n.includes('lab') ||
    specs.some((s: string) => {
      const sl = String(s || '').toLowerCase()
      return sl.includes('lab') || sl.includes('patholog') || sl.includes('diagnostic') || sl.includes('radiolog') || sl.includes('scan')
    })
  )
}

export function formatDoctorDisplayName(rawName?: string | null): string {
  const clean = (rawName || '').trim()
  if (!clean || clean.toLowerCase() === 'doctor' || clean.toLowerCase() === 'clinic doctor') return ''
  const stripped = clean.replace(/^dr\.?\s*/i, '').trim()
  return stripped ? `Dr. ${stripped}` : ''
}

export function extractLocalDate(raw?: string | null): string {
  if (!raw) return ''
  const trimmed = String(raw).trim()
  if (trimmed.includes('T')) {
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
  }
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : ''
}

export function formatRowTime(raw?: string | null): string {
  if (!raw) return ''
  const trimmed = String(raw).trim()
  if (trimmed.includes('T')) {
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    }
  }
  const slice = /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(10) : trimmed
  const match = slice.match(/(\d{1,2}:\d{2})(?::\d{2})?\s*([APap][Mm])?/)
  if (match) {
    const [hStr, mStr] = match[1].split(':')
    const min = Number(mStr)
    const ampm = (match[2] || '').toUpperCase()
    if (ampm) {
      const h = Number(hStr) || 12
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} ${ampm}`
    }
    const h24 = Number(hStr)
    if (!isNaN(h24) && h24 >= 0 && h24 <= 23) {
      const suffix = h24 >= 12 ? 'PM' : 'AM'
      const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
      return `${String(h12).padStart(2, '0')}:${String(min).padStart(2, '0')} ${suffix}`
    }
  }
  return ''
}

export function formatListDayHeader(dateStr: string, todayStr: string, yesterdayStr: string): string {
  const clean = dateStr.slice(0, 10)
  if (clean === todayStr) return 'TODAY'
  if (clean === yesterdayStr) return 'YESTERDAY'
  const d = new Date(`${clean}T00:00:00`)
  if (isNaN(d.getTime())) return clean.toUpperCase()
  return d.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
}

export function inferPaymentMethodFromText(
  text?: string | null,
  paymentMode?: string | null,
  fallbackMethod?: string | null
): string {
  const lower = String(text || '').toLowerCase()
  if (lower.includes('esewa')) return 'ESEWA'
  if (lower.includes('khalti')) return 'KHALTI'
  if (lower.includes('fonepay')) return 'FONEPAY'
  if (lower.includes('connectips')) return 'CONNECTIPS'
  if (lower.includes('pay at desk') || lower.includes('pay_at_desk') || lower.includes('desk')) return 'PAY_AT_DESK'
  if (lower.includes('bank') || lower.includes('qr')) return 'BANK_TRANSFER'
  if (lower.includes('free follow') || lower.includes('waived')) return 'FREE'
  if (lower.includes('cash')) return 'CASH'

  const modeUpper = String(paymentMode || '').trim().toUpperCase()
  if (modeUpper === 'PAY_AT_DESK' || modeUpper === 'DESK') return 'PAY_AT_DESK'
  if (modeUpper === 'FREE') return 'FREE'
  if (modeUpper === 'ONLINE') return 'ONLINE'
  if (modeUpper === 'CASH') return 'CASH'

  const fb = String(fallbackMethod || '').trim().toUpperCase()
  return fb || 'CASH'
}

export function extractProviderReference(rawRemarks?: string | null): string | undefined {
  const txt = String(rawRemarks || '')
  const m = txt.match(/(?:provider\s*reference|reference|ref|txn)\s*[:#]\s*([A-Za-z0-9_-]+)/i)
  return m?.[1]?.trim() || undefined
}

export function formatPaymentTimestampKathmandu(raw?: string | null): string {
  if (!raw) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kathmandu',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  }
  const trimmed = String(raw).trim()
  if (!trimmed) return 'Recorded'
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const d = new Date(trimmed)
    if (!Number.isNaN(d.getTime())) {
      const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kathmandu',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d)
      const timeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kathmandu',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(d)
      return `${dateStr} ${timeStr}`
    }
  }
  return trimmed.replace('T', ' ')
}

export function parsePaymentRecords(
  rawRemarks?: string | null,
  fallbackPaidAmount = 0,
  fallbackDate?: string | null,
  fallbackMethod?: string | null,
  defaultNote?: string | null
): WebPaymentRecord[] {
  if (rawRemarks && rawRemarks.includes(START_TAG) && rawRemarks.includes(END_TAG)) {
    try {
      const jsonStr = rawRemarks.split(START_TAG)[1].split(END_TAG)[0].trim()
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => ({
            id: item.id || undefined,
            amount: Number(item.amount || 0),
            dateTime: formatPaymentTimestampKathmandu(item.dateTime || item.date_time) || 'Recorded',
            note: item.note || 'Payment Received',
            paymentMethod: item.paymentMethod || item.payment_method || inferPaymentMethodFromText(item.note, undefined, fallbackMethod || 'CASH'),
            referenceId: item.referenceId || item.reference_id || undefined,
            category: item.category || 'CONSULTATION',
          }))
        }
      }
    } catch (e) {
      console.error('Error parsing payment records from remarks:', e)
    }
  }

  if (rawRemarks && rawRemarks.includes('[PAYMENT_LOGS]') && rawRemarks.includes('[/PAYMENT_LOGS]')) {
    try {
      const jsonStr = rawRemarks.split('[PAYMENT_LOGS]')[1].split('[/PAYMENT_LOGS]')[0].trim()
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => ({
            id: item.id || undefined,
            amount: Number(item.amount || 0),
            dateTime: formatPaymentTimestampKathmandu(item.dateTime || item.date_time) || 'Recorded',
            note: item.note || 'Payment Received',
            paymentMethod: item.paymentMethod || item.payment_method || inferPaymentMethodFromText(item.note, undefined, fallbackMethod || 'CASH'),
            referenceId: item.referenceId || item.reference_id || undefined,
            category: item.category || 'CONSULTATION',
          }))
        }
      }
    } catch (e) {
      console.error('Error parsing payment records from [PAYMENT_LOGS]:', e)
    }
  }

  if (fallbackPaidAmount > 0) {
    const dStr = formatPaymentTimestampKathmandu(fallbackDate)
    const inferredMethod = inferPaymentMethodFromText(rawRemarks, undefined, fallbackMethod || 'CASH')
    const refId = extractProviderReference(rawRemarks)
    const cleanNote = rawRemarks && /paid\s+via|esewa|khalti|fonepay|connectips|desk/i.test(rawRemarks)
      ? rawRemarks.trim()
      : (defaultNote || 'Payment Received')
    return [
      {
        id: 'initial',
        amount: fallbackPaidAmount,
        dateTime: dStr,
        note: cleanNote,
        paymentMethod: inferredMethod,
        referenceId: refId,
        category: 'CONSULTATION',
      },
    ]
  }
  return []
}

export function extractCleanClinicalRemarks(rawRemarks?: string | null): string {
  if (!rawRemarks) return ''
  let text = rawRemarks

  if (text.includes(START_TAG)) {
    const before = text.split(START_TAG)[0].trim()
    const after = text.includes(END_TAG) ? text.split(END_TAG)[1].trim() : ''
    text = [before, after].filter(Boolean).join('\n').trim()
  }

  if (text.includes('[PAYMENT_LOGS]')) {
    const before = text.split('[PAYMENT_LOGS]')[0].trim()
    const after = text.includes('[/PAYMENT_LOGS]') ? text.split('[/PAYMENT_LOGS]')[1].trim() : ''
    text = [before, after].filter(Boolean).join('\n').trim()
  }

  text = text.replace(/<!--[\s\S]*?-->/g, '').trim()
  text = text.replace(/\[\[META:[\s\S]*?\]\]/g, '').trim()
  text = text.replace(/\[\[[\s\S]*?\]\]/g, '').trim()
  text = text.replace(/\[[A-Z0-9_]+:[^\]]*\]/gi, '').trim()
  text = text.replace(/\[\s*\{[\s\S]*?\}\s*\]/g, '').trim()
  text = text.replace(/\{\s*"[a-zA-Z0-9_]+"\s*:[\s\S]*?\}/g, '').trim()

  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        Boolean(l) &&
        !l.startsWith('<!--') &&
        !l.endsWith('-->') &&
        !l.startsWith('[PAYMENT_LOGS]') &&
        !l.endsWith('[/PAYMENT_LOGS]') &&
        !l.startsWith('[[') &&
        !l.startsWith('{"') &&
        !l.startsWith('[{"')
    )
    .join('\n')
    .trim()
}

export function buildCombinedRemarks(cleanRemarks: string, paymentRecords: WebPaymentRecord[]): string {
  const trimmed = cleanRemarks.trim()
  if (!paymentRecords || paymentRecords.length === 0) return trimmed
  const recordsToSerialize = paymentRecords.map((r) => ({
    id: r.id,
    amount: r.amount,
    date_time: r.dateTime,
    note: r.note || 'Payment Received',
    payment_method: r.paymentMethod || inferPaymentMethodFromText(r.note, undefined, 'CASH'),
    reference_id: r.referenceId || '',
    category: r.category || 'CONSULTATION',
  }))
  const recordsJson = JSON.stringify(recordsToSerialize)
  const logBlock = `${START_TAG}\n${recordsJson}\n${END_TAG}`
  return trimmed ? `${trimmed}\n\n${logBlock}` : logBlock
}

export function derivePatientKey(appt?: {
  userId?: string | null
  patientEmail?: string | null
  patientMobile?: string | null
  patientName?: string | null
} | null): string {
  if (!appt) return 'unknown_patient'
  const cleanEmail = (appt.patientEmail || '').trim().toLowerCase()
  const cleanName = (appt.patientName || '').trim().toLowerCase()
  const cleanPhone = (appt.patientMobile || '').replace(/\D/g, '').slice(-10)
  const cleanUserId = (appt.userId || '').trim()

  if (cleanPhone && cleanPhone.length >= 7) return `${cleanPhone}|${cleanName}`
  if (cleanUserId && cleanName) return `${cleanUserId}|${cleanName}`
  if (cleanUserId) return cleanUserId
  if (cleanEmail) return `${cleanEmail}|${cleanName}`
  return cleanName || 'unknown_patient'
}

export function parseLabTestItems(
  appt: any,
  inv: any,
  clinicServices: any[] = []
): Array<{ name: string; price: number }> {
  const catalogByLower = new Map<string, { name: string; price: number }>()
  for (const s of clinicServices || []) {
    const sName = String(s.service_name || s.serviceName || '').trim()
    if (sName) catalogByLower.set(sName.toLowerCase(), { name: sName, price: Number(s.price || 0) })
  }

  const results: Array<{ name: string; price: number }> = []
  const addToken = (rawToken: string, explicitPrice?: number) => {
    const trimmed = String(rawToken || '').trim()
    if (!trimmed) return
    const priceMatch = trimmed.match(/\(Rs\.?\s*([0-9.,]+)\)\s*$/i)
    const embeddedPrice = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : undefined
    const rawName = trimmed.replace(/\s*\(Rs\.?[^)]*\)\s*$/i, '').trim()
    if (!rawName) return
    const cat = catalogByLower.get(rawName.toLowerCase())
    const canonicalName = cat?.name || rawName
    const weight = (explicitPrice && explicitPrice > 0 ? explicitPrice : undefined) ||
      (embeddedPrice && embeddedPrice > 0 ? embeddedPrice : undefined) ||
      (cat && cat.price > 0 ? cat.price : 0)
    results.push({ name: canonicalName, price: weight })
  }

  const rawSelected = appt?.selectedLabTests || appt?.selected_lab_tests || ''
  if (String(rawSelected).trim()) {
    String(rawSelected).split(',').forEach((t) => addToken(t))
  }

  if (results.length === 0 && inv?.items && Array.isArray(inv.items)) {
    for (const item of inv.items) {
      const name = String(item.itemName || item.item_name || item.name || '').trim()
      const lower = name.toLowerCase()
      if (
        !name ||
        lower.startsWith('payment received') ||
        lower.includes('pay at desk') ||
        lower.includes('service charge') ||
        lower.includes('consultation') ||
        lower.includes('opd doctor')
      ) {
        continue
      }
      const amt = Number(item.total || 0) > 0 ? Number(item.total) : Number(item.price || 0) * Number(item.quantity || 1)
      addToken(name, amt)
    }
  }

  if (results.length === 0 && appt?.notes && String(appt.notes).toLowerCase().includes('lab tests:')) {
    const part = String(appt.notes).replace(/^.*lab tests:\s*/i, '').trim()
    part.split(',').forEach((t) => addToken(t))
  }

  return results
}

function isValidClinicalVisitForHistory(appt: any): boolean {
  if (!appt) return false
  const st = String(appt.status || '').toLowerCase()
  const ck = String(appt.checkinStatus || appt.checkin_status || '').toLowerCase()
  if (['cancelled', 'rejected', 'pending_payment', 'waiting_for_approval', 'unapproved', 'expired'].includes(st)) {
    return false
  }
  if (ck === 'cancelled' || (ck === 'no_show' && String(appt.paymentStatus || '').toLowerCase() !== 'paid')) {
    return false
  }
  return true
}

function resolveVisitType(
  appt: any,
  earliestVisitsByDoctor: Map<string, string>,
  isLabClinic: boolean
): 'new' | 'follow_up' | 'unknown' | '' {
  if (isLabClinic || !appt || !appt.id) return ''
  const explicit = String(appt.visitType || appt.visit_type || '').trim().toLowerCase()
  if (explicit) {
    if (explicit.includes('follow')) return 'follow_up'
    if (explicit === 'new') return 'new'
    return 'unknown'
  }
  if (appt.followUpOfAppointmentId || appt.follow_up_of_appointment_id || Number(appt.attemptNumber || 1) > 1) {
    return 'follow_up'
  }
  const notesLower = String(appt.notes || '').toLowerCase()
  if (notesLower.includes('follow-up') || notesLower.includes('followup')) {
    return 'follow_up'
  }
  if (Number(appt.feeAmount || 0) > 0 && Number(appt.attemptNumber || 1) === 1) {
    return 'new'
  }
  if (appt.doctorId) {
    const pKey = derivePatientKey(appt)
    const firstId = earliestVisitsByDoctor.get(`${appt.doctorId}::${pKey}`)
    if (firstId === appt.id) {
      return Number(appt.feeAmount || 0) > 0 ? 'new' : 'follow_up'
    }
    return 'follow_up'
  }
  return Number(appt.feeAmount || 0) <= 0 ? 'follow_up' : 'unknown'
}

/**
 * Builds one ledger row per payment transaction (plus a Rs. 0 FREE row for zero-fee
 * visits with no transaction). Annotates multi-part payments (`paymentPart: [k, n]`)
 * and extracts lab tests for diagnostic labs.
 */
export function buildUnifiedClinicPaymentLogs(
  appointments: any[] = [],
  invoices: any[] = [],
  invoiceTransactions: any[] = [],
  doctors: any[] = [],
  isLabClinic = false,
  clinicServices: any[] = []
): UnifiedPaymentLogEntry[] {
  const safeAppts = Array.isArray(appointments) ? appointments : []
  const safeInvs = Array.isArray(invoices) ? invoices : []
  const safeTxs = Array.isArray(invoiceTransactions) ? invoiceTransactions : []
  const safeDocs = Array.isArray(doctors) ? doctors : []

  const apptMap = new Map<string, any>()
  safeAppts.forEach((a) => {
    if (a.id) apptMap.set(a.id, a)
  })

  const invByApptMap = new Map<string, any>()
  safeInvs.forEach((inv) => {
    const aId = inv.appointmentId || inv.appointment_id
    if (aId) invByApptMap.set(aId, inv)
  })

  const docMap = new Map<string, any>()
  safeDocs.forEach((d) => {
    if (d.id) docMap.set(d.id, d)
  })

  const earliestVisitsByDoctor = new Map<string, string>()
  const validAppts = [...safeAppts]
    .filter((a) => isValidClinicalVisitForHistory(a))
    .sort((a, b) => {
      const d1 = `${a.appointmentDate || '1970-01-01'} ${a.appointmentTime || '00:00'}`
      const d2 = `${b.appointmentDate || '1970-01-01'} ${b.appointmentTime || '00:00'}`
      return d1.localeCompare(d2)
    })

  for (const a of validAppts) {
    if (!a.doctorId) continue
    const pKey = derivePatientKey(a)
    const comboKey = `${a.doctorId}::${pKey}`
    if (!earliestVisitsByDoctor.has(comboKey)) {
      earliestVisitsByDoctor.set(comboKey, a.id)
    }
  }

  const entries: UnifiedPaymentLogEntry[] = []
  const recordedTxnKeys = new Set<string>()
  const processedInvoiceIds = new Set<string>()
  const processedApptIdsFromTx = new Set<string>()
  const assignedCommissionApptIds = new Set<string>()

  // 1. Structured invoice_transactions (1 row per payment)
  for (const tx of safeTxs) {
    if (tx.is_deleted) continue
    const appt = apptMap.get(tx.appointment_id) || {}
    const inv = safeInvs.find((i) => i.id === tx.invoice_id) || invByApptMap.get(tx.appointment_id)
    const doc = docMap.get(appt.doctorId || '') || {}
    const visitType = resolveVisitType(appt, earliestVisitsByDoctor, isLabClinic)
    const isFollowUp = visitType === 'follow_up'
    const isConsultationTx = String(tx.category || 'CONSULTATION').toUpperCase() === 'CONSULTATION'
    const isPad = String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK'
    const isFreeFollowUpConsult = isFollowUp && isConsultationTx && Number(appt.feeAmount || 0) <= 0

    const rawTime = tx.transaction_time || tx.created_at || inv?.paidAt || new Date().toISOString()
    const dStr = extractLocalDate(rawTime) || rawTime.slice(0, 10)
    const tStr = formatRowTime(rawTime) || rawTime.slice(11, 16)

    const uniqueKey = `tx_${tx.id || `${tx.invoice_id}_${tx.amount}_${rawTime}`}`
    if (recordedTxnKeys.has(uniqueKey)) continue
    recordedTxnKeys.add(uniqueKey)

    const rawTxAmount = Number(tx.amount || 0)
    const isRefundTx = rawTxAmount < 0 || String(tx.transaction_type || tx.category || '').toUpperCase() === 'REFUND'
    const expectedPadTotal = isPad && !isFreeFollowUpConsult ? getEffectiveAppointmentTotal(appt) : 0
    const baseTxAmount = isFreeFollowUpConsult ? 0 : rawTxAmount
    const effectiveTxAmount =
      !isRefundTx && isPad && !isFreeFollowUpConsult && isConsultationTx && expectedPadTotal > 0 && baseTxAmount > 0 && baseTxAmount < expectedPadTotal
        ? expectedPadTotal
        : baseTxAmount

    const effInvTotal = isFreeFollowUpConsult
      ? Number(inv?.totalAmount || 0)
      : isPad
      ? Math.max(Number(inv?.totalAmount || appt.totalAmount || 0), expectedPadTotal, effectiveTxAmount)
      : Number(inv?.totalAmount || appt.totalAmount || appt.feeAmount || Math.abs(effectiveTxAmount) || 0)

    const rawApptServiceCharge = Number(appt.serviceChargeAmount || 0)
    const serviceCharge =
      !isRefundTx && isPad && !isFreeFollowUpConsult && isConsultationTx && appt.id && !assignedCommissionApptIds.has(appt.id)
        ? rawApptServiceCharge > 0
          ? rawApptServiceCharge
          : Math.round(Number(appt.feeAmount || 0) * 0.05)
        : 0
    if (serviceCharge > 0 && appt.id) assignedCommissionApptIds.add(appt.id)

    const tests = isLabClinic ? parseLabTestItems(appt, inv, clinicServices).map((t) => t.name) : []
    const followUpOrigId = appt.followUpOfAppointmentId || appt.follow_up_of_appointment_id
    const followUpOrig = followUpOrigId ? apptMap.get(followUpOrigId) : undefined
    const txMethodUpper = String(tx.payment_method || '').trim().toUpperCase()
    const isOnlineMode = String(appt.paymentMode || '').toUpperCase() === 'ONLINE'
    const inferredOnlineMethod = isOnlineMode
      ? inferPaymentMethodFromText(inv?.remarks || tx.notes, appt.paymentMode, 'ONLINE')
      : ''
    const methodUpper = isRefundTx
      ? String(tx.payment_method || 'REFUND').toUpperCase()
      : effectiveTxAmount === 0
      ? 'FREE'
      : isPad && txMethodUpper === 'CASH'
      ? 'PAY_AT_DESK'
      : isOnlineMode && (txMethodUpper === '' || txMethodUpper === 'CASH')
      ? inferredOnlineMethod
      : String(tx.payment_method || (isPad ? 'PAY_AT_DESK' : isOnlineMode ? 'ONLINE' : 'CASH')).toUpperCase()

    entries.push({
      id: tx.id || uniqueKey,
      invoiceId: tx.invoice_id || inv?.id,
      appointmentId: tx.appointment_id || inv?.appointmentId,
      clinicId: tx.clinic_id || appt.clinicId || '',
      dateTime: rawTime,
      date: dStr,
      time: tStr,
      patientName: appt.patientName || 'Patient',
      patientPhone: appt.patientMobile || '',
      trackingCode: appt.trackingCode10Digit || '',
      followUpOfAppointmentId: followUpOrigId,
      followUpOfTrackingCode: followUpOrig?.trackingCode10Digit,
      doctorId: isLabClinic ? undefined : appt.doctorId,
      doctorName: isLabClinic ? '' : formatDoctorDisplayName(doc.fullName || doc.name),
      specialty: isLabClinic ? '' : doc.specialty || '',
      isNewPatientForDoctor: visitType === 'new',
      visitType,
      testNames: tests,
      isRefund: isRefundTx,
      type: isRefundTx ? 'REFUND' : ((tx.transaction_type as any) || 'PAYMENT'),
      amount: effectiveTxAmount,
      paymentMethod: methodUpper,
      paymentMode: appt.paymentMode || (effectiveTxAmount === 0 ? 'FREE' : 'ONLINE'),
      referenceId: tx.reference_id || (effectiveTxAmount === 0 && !isRefundTx ? 'FOLLOWUP-WAIVED' : undefined),
      category: isRefundTx ? 'REFUND' : isFreeFollowUpConsult ? 'FREE_FOLLOWUP' : tx.category || 'CONSULTATION',
      note: tx.notes || (isFreeFollowUpConsult ? 'Follow-up Consultation (Free)' : isLabClinic ? 'Diagnostic Lab Tests' : 'OPD Consultation'),
      invoiceTotal: effInvTotal,
      balanceDue: Number(inv?.balanceDue || 0),
      paymentStatus: inv?.paymentStatus || 'paid',
      serviceChargeAmount: serviceCharge,
    })

    if (inv?.id) processedInvoiceIds.add(inv.id)
    if (tx.appointment_id || inv?.appointmentId) processedApptIdsFromTx.add(tx.appointment_id || inv?.appointmentId)
  }

  // 2. Fallback / Merge from billing_invoices & embedded remark logs
  for (const inv of safeInvs) {
    if (inv.is_deleted) continue
    const apptId = inv.appointmentId || inv.appointment_id
    if (processedInvoiceIds.has(inv.id) || (apptId && processedApptIdsFromTx.has(apptId))) continue

    const appt = apptMap.get(apptId) || {}
    const doc = docMap.get(appt.doctorId || '') || {}
    const visitType = resolveVisitType(appt, earliestVisitsByDoctor, isLabClinic)
    const isFollowUp = visitType === 'follow_up'
    const isPad = String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK'
    const effInvTotal = getEffectiveInvoiceTotal(appt, inv)
    const effItems = getEffectiveInvoiceItems(appt, inv.items)
    const effectivePaidAmt =
      inv.paymentStatus === 'paid' || appt.paymentStatus === 'paid'
        ? Math.max(Number(inv.paidAmount || 0), effInvTotal)
        : Number(inv.paidAmount || 0)

    const defaultInvMethod = isPad ? 'PAY_AT_DESK' : String(appt.paymentMode || '').toUpperCase() === 'ONLINE' ? 'ONLINE' : 'CASH'
    const parsedRecords = parsePaymentRecords(inv.remarks, effectivePaidAmt, inv.paidAt || inv.updatedAt, defaultInvMethod)
    const tests = isLabClinic ? parseLabTestItems(appt, inv, clinicServices).map((t) => t.name) : []
    const followUpOrigId = appt.followUpOfAppointmentId || appt.follow_up_of_appointment_id
    const followUpOrig = followUpOrigId ? apptMap.get(followUpOrigId) : undefined

    for (const pr of parsedRecords) {
      const rawTime = pr.dateTime || inv.paidAt || inv.updatedAt || new Date().toISOString()
      const dStr = extractLocalDate(rawTime) || rawTime.slice(0, 10)
      const uniqueKey = `inv_${inv.id}_${pr.id || pr.amount}_${dStr}`
      if (recordedTxnKeys.has(uniqueKey)) continue
      recordedTxnKeys.add(uniqueKey)

      const rawPrAmt = Number(pr.amount || 0)
      const isRefundRec = rawPrAmt < 0 || String(pr.category || '').toUpperCase() === 'REFUND'
      const isConsultationPr = String(pr.category || 'CONSULTATION').toUpperCase() === 'CONSULTATION'
      const effPrAmt =
        !isRefundRec && isPad && isConsultationPr && parsedRecords.length === 1 && effInvTotal > 0 && rawPrAmt > 0 && rawPrAmt < effInvTotal
          ? effInvTotal
          : rawPrAmt
      const effBalance = inv.paymentStatus === 'paid' ? 0 : Math.max(0, effInvTotal - effectivePaidAmt)

      const rawApptServiceCharge = Number(appt.serviceChargeAmount || 0)
      const serviceCharge =
        !isRefundRec && isPad && !(isFollowUp && Number(appt.feeAmount || 0) <= 0) && isConsultationPr && appt.id && !assignedCommissionApptIds.has(appt.id)
          ? rawApptServiceCharge > 0
            ? rawApptServiceCharge
            : Math.round(Number(appt.feeAmount || 0) * 0.05)
          : 0
      if (serviceCharge > 0 && appt.id) assignedCommissionApptIds.add(appt.id)

      entries.push({
        id: pr.id || uniqueKey,
        invoiceId: inv.id,
        appointmentId: apptId,
        clinicId: inv.clinicId || appt.clinicId || '',
        dateTime: rawTime,
        date: dStr,
        time: formatRowTime(rawTime) || rawTime.slice(11, 16) || '12:00',
        patientName: appt.patientName || 'Patient',
        patientPhone: appt.patientMobile || '',
        trackingCode: appt.trackingCode10Digit || '',
        followUpOfAppointmentId: followUpOrigId,
        followUpOfTrackingCode: followUpOrig?.trackingCode10Digit,
        doctorId: isLabClinic ? undefined : appt.doctorId,
        doctorName: isLabClinic ? '' : formatDoctorDisplayName(doc.fullName || doc.name),
        specialty: isLabClinic ? '' : doc.specialty || '',
        isNewPatientForDoctor: visitType === 'new',
        visitType,
        testNames: tests,
        isRefund: isRefundRec,
        type: isRefundRec ? 'REFUND' : 'PAYMENT',
        amount: effPrAmt,
        paymentMethod: isRefundRec
          ? 'REFUND'
          : effPrAmt === 0
          ? 'FREE'
          : inferPaymentMethodFromText(
              pr.note || inv.remarks,
              appt.paymentMode,
              pr.paymentMethod || (isPad ? 'PAY_AT_DESK' : String(appt.paymentMode || '').toUpperCase() === 'ONLINE' ? 'ONLINE' : 'CASH')
            ),
        paymentMode: appt.paymentMode || (effPrAmt === 0 ? 'FREE' : 'CASH'),
        referenceId: pr.referenceId,
        category: isRefundRec ? 'REFUND' : pr.category || 'CONSULTATION',
        note: pr.note || (isLabClinic ? 'Diagnostic Lab Tests' : 'Payment Received'),
        invoiceTotal: effInvTotal,
        balanceDue: effBalance,
        paymentStatus: inv.paymentStatus || 'paid',
        items: effItems,
        serviceChargeAmount: serviceCharge,
      })
    }
  }

  // 3. Fallback for paid or Rs. 0 free visits not covered above
  const processedApptIds = new Set<string>()
  for (const e of entries) {
    if (e.appointmentId) processedApptIds.add(e.appointmentId)
  }
  for (const appt of validAppts) {
    if (!appt.id || processedApptIds.has(appt.id)) continue
    const isPaid = String(appt.paymentStatus || '').toLowerCase() === 'paid'
    const isFree =
      Number(appt.feeAmount || 0) <= 0 &&
      (isPaid || String(appt.paymentMode || '').toUpperCase() === 'FREE' || String(appt.status || '').toUpperCase() === 'APPROVED')
    if (!isPaid && !isFree) continue

    const doc = docMap.get(appt.doctorId || '') || {}
    const visitType = resolveVisitType(appt, earliestVisitsByDoctor, isLabClinic)
    const isFollowUp = visitType === 'follow_up'
    const isPad = String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK'
    const rawTime = appt.approvedAt || appt.createdAt || `${appt.appointmentDate || new Date().toISOString().slice(0, 10)} ${appt.appointmentTime || '10:00'}`
    const dStr = extractLocalDate(rawTime) || rawTime.slice(0, 10)
    const effTotal =
      Number(appt.feeAmount || 0) <= 0 && Number(appt.totalAmount || 0) <= 0
        ? 0
        : isPad
        ? getEffectiveAppointmentTotal(appt)
        : Number(appt.totalAmount || appt.feeAmount || 0)

    const rawApptServiceCharge = Number(appt.serviceChargeAmount || 0)
    const serviceCharge =
      isPad && effTotal > 0 && appt.id && !assignedCommissionApptIds.has(appt.id)
        ? rawApptServiceCharge > 0
          ? rawApptServiceCharge
          : Math.round(Number(appt.feeAmount || 0) * 0.05)
        : 0
    if (serviceCharge > 0 && appt.id) assignedCommissionApptIds.add(appt.id)

    const tests = isLabClinic ? parseLabTestItems(appt, null, clinicServices).map((t) => t.name) : []
    const followUpOrigId = appt.followUpOfAppointmentId || appt.follow_up_of_appointment_id
    const followUpOrig = followUpOrigId ? apptMap.get(followUpOrigId) : undefined

    entries.push({
      id: `appt_${appt.id}`,
      appointmentId: appt.id,
      clinicId: appt.clinicId || '',
      dateTime: rawTime,
      date: dStr,
      time: formatRowTime(rawTime) || '10:00 AM',
      patientName: appt.patientName || 'Patient',
      patientPhone: appt.patientMobile || '',
      trackingCode: appt.trackingCode10Digit || '',
      followUpOfAppointmentId: followUpOrigId,
      followUpOfTrackingCode: followUpOrig?.trackingCode10Digit,
      doctorId: isLabClinic ? undefined : appt.doctorId,
      doctorName: isLabClinic ? '' : formatDoctorDisplayName(doc.fullName || doc.name),
      specialty: isLabClinic ? '' : doc.specialty || '',
      isNewPatientForDoctor: visitType === 'new',
      visitType,
      testNames: tests,
      isRefund: false,
      type: 'PAYMENT',
      amount: effTotal,
      paymentMethod: effTotal === 0
        ? 'FREE'
        : inferPaymentMethodFromText(
            appt.notes,
            appt.paymentMode,
            isPad ? 'PAY_AT_DESK' : appt.paymentMethod || appt.paymentMode || 'CASH'
          ),
      paymentMode: effTotal === 0 ? 'FREE' : appt.paymentMode || 'ONLINE',
      referenceId: effTotal === 0 ? 'FOLLOWUP-WAIVED' : undefined,
      category: isFollowUp && effTotal === 0 ? 'FREE_FOLLOWUP' : 'CONSULTATION',
      note: isFollowUp && effTotal === 0 ? 'Follow-up Consultation (Free)' : isLabClinic ? 'Diagnostic Lab Tests' : 'OPD Consultation',
      invoiceTotal: effTotal,
      balanceDue: 0,
      paymentStatus: 'paid',
      serviceChargeAmount: serviceCharge,
    })
  }

  // Assign PART k/n for bills with > 1 positive payment
  const groups = new Map<string, UnifiedPaymentLogEntry[]>()
  for (const e of entries) {
    if (e.isRefund || e.amount <= 0) continue
    const key = e.invoiceId || e.appointmentId
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }
  groups.forEach((group) => {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) => a.dateTime.localeCompare(b.dateTime) || a.id.localeCompare(b.id))
      sorted.forEach((item, idx) => {
        item.paymentPart = [idx + 1, sorted.length]
      })
    }
  })

  return entries.sort((a, b) => b.dateTime.localeCompare(a.dateTime))
}

export function buildPendingBills(
  appointments: any[] = [],
  invoices: any[] = [],
  doctors: any[] = [],
  isLabClinic = false,
  clinicServices: any[] = [],
  periodPredicate: (dateStr: string) => boolean
): PendingBillEntry[] {
  const docMap = new Map<string, any>()
  doctors.forEach((d) => {
    if (d.id) docMap.set(d.id, d)
  })
  const invMap = new Map<string, any>()
  invoices.forEach((inv) => {
    const aId = inv.appointmentId || inv.appointment_id
    if (aId) invMap.set(aId, inv)
  })

  const validAppts = [...appointments]
    .filter((a) => isValidClinicalVisitForHistory(a))
    .sort((a, b) => `${a.appointmentDate || ''} ${a.appointmentTime || ''}`.localeCompare(`${b.appointmentDate || ''} ${b.appointmentTime || ''}`))

  const earliestVisitsByDoctor = new Map<string, string>()
  for (const a of validAppts) {
    if (!a.doctorId) continue
    const combo = `${a.doctorId}::${derivePatientKey(a)}`
    if (!earliestVisitsByDoctor.has(combo)) earliestVisitsByDoctor.set(combo, a.id)
  }

  const pending: PendingBillEntry[] = []
  const covered = new Set<string>()

  for (const appt of validAppts) {
    const visitDate = String(appt.appointmentDate || '').slice(0, 10) || extractLocalDate(appt.createdAt)
    if (!periodPredicate(visitDate)) continue

    const inv = invMap.get(appt.id)
    const doc = docMap.get(appt.doctorId || '')
    const visitType = resolveVisitType(appt, earliestVisitsByDoctor, isLabClinic)
    const tests = isLabClinic ? parseLabTestItems(appt, inv, clinicServices).map((t) => t.name) : []
    const isPad = String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK'

    let totalAmt = 0
    let paidAmt = 0
    let dueAmt = 0

    if (inv) {
      if (String(inv.paymentStatus || '').toLowerCase() === 'paid' && Number(inv.balanceDue || 0) <= 0.01) {
        covered.add(appt.id)
        continue
      }
      const baseTotal = Number(inv.totalAmount || 0) > 0 ? Number(inv.totalAmount) : getEffectiveAppointmentTotal(appt)
      totalAmt = isPad ? Math.max(baseTotal, getEffectiveAppointmentTotal(appt)) : baseTotal
      paidAmt = Number(inv.paidAmount || 0)
      dueAmt = Number(inv.balanceDue || 0) > 0.01 ? Number(inv.balanceDue) : Math.max(0, totalAmt - paidAmt)
    } else {
      const apptPaid = String(appt.paymentStatus || '').toLowerCase() === 'paid'
      const effTotal = isPad ? getEffectiveAppointmentTotal(appt) : Number(appt.totalAmount || appt.feeAmount || 0)
      if (apptPaid || effTotal <= 0 || String(appt.paymentMode || '').toUpperCase() === 'FREE') {
        covered.add(appt.id)
        continue
      }
      totalAmt = effTotal
      paidAmt = 0
      dueAmt = totalAmt
    }

    if (dueAmt > 0.01) {
      covered.add(appt.id)
      pending.push({
        invoiceId: inv?.id,
        appointmentId: appt.id,
        trackingCode: appt.trackingCode10Digit || '–',
        patientName: appt.patientName || 'Patient',
        patientPhone: appt.patientMobile || '',
        doctorId: isLabClinic ? undefined : appt.doctorId,
        doctorName: isLabClinic ? '' : formatDoctorDisplayName(doc?.fullName || doc?.name),
        testNames: tests,
        visitDate,
        visitTime: formatRowTime(appt.appointmentTime),
        visitType,
        paymentMode: appt.paymentMode || 'ONLINE',
        totalAmount: totalAmt,
        paidAmount: paidAmt,
        balanceDue: dueAmt,
        isPartlyPaid: paidAmt > 0.01 && dueAmt > 0.01,
      })
    }
  }

  return pending.sort((a, b) => a.visitDate.localeCompare(b.visitDate) || a.patientName.localeCompare(b.patientName))
}

export function computePaymentPeriodSummary(
  periodLogs: UnifiedPaymentLogEntry[],
  periodPendingBills: PendingBillEntry[],
  periodExpenses: ClinicExpense[],
  subscriptionsInPeriod: any[] = []
): PaymentPeriodSummary {
  const collected = periodLogs.reduce((acc, l) => acc + (Number(l.amount) || 0), 0)
  const pendingTotal = periodPendingBills.reduce((acc, b) => acc + (Number(b.balanceDue) || 0), 0)
  const expenses = periodExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0)
  // Exclude auto-settled 5% commission expenses from net deduction because platformFees already deducts the 5% fee
  const operationalExpenses = periodExpenses
    .filter((e) => !isPlatformCommissionExpense(e))
    .reduce((acc, e) => acc + (Number(e.amount) || 0), 0)
  const platformFees = periodLogs.reduce((acc, l) => acc + (Number(l.serviceChargeAmount) || 0), 0)
  const subscriptionDue = subscriptionsInPeriod
    .filter((s) => {
      const st = String(s.status || '').toLowerCase()
      return st.includes('due') || st.includes('unpaid')
    })
    .reduce((acc, s) => acc + (Number(s.amount_npr || s.amount) || 0), 0)
  const net = collected - operationalExpenses - platformFees - subscriptionDue
  return {
    collected,
    collectedCount: periodLogs.length,
    pendingTotal,
    pendingCount: periodPendingBills.length,
    expenses,
    expensesCount: periodExpenses.length,
    platformFees,
    subscriptionDue,
    net,
  }
}

export function computeDoctorPeriodStats(
  periodLogs: UnifiedPaymentLogEntry[],
  periodAppointments: any[],
  allAppointments: any[],
  doctors: any[]
): DoctorPeriodStat[] {
  const docMap = new Map<string, any>()
  doctors.forEach((d) => {
    if (d.id) docMap.set(d.id, d)
  })

  const earliestVisitsByDoctor = new Map<string, string>()
  const validAll = [...allAppointments]
    .filter((a) => isValidClinicalVisitForHistory(a))
    .sort((a, b) => `${a.appointmentDate || ''} ${a.appointmentTime || ''}`.localeCompare(`${b.appointmentDate || ''} ${b.appointmentTime || ''}`))

  for (const a of validAll) {
    if (!a.doctorId) continue
    const combo = `${a.doctorId}::${derivePatientKey(a)}`
    if (!earliestVisitsByDoctor.has(combo)) earliestVisitsByDoctor.set(combo, a.id)
  }

  const visitsByDoc = new Map<string, { total: number; newCount: number; followupCount: number }>()
  for (const a of periodAppointments) {
    if (
      !a.doctorId ||
      String(a.status || '').toLowerCase() === 'cancelled' ||
      String(a.status || '').toLowerCase() === 'rejected' ||
      String(a.checkinStatus || '').toLowerCase() === 'cancelled'
    ) {
      continue
    }
    const vType = resolveVisitType(a, earliestVisitsByDoctor, false)
    const cur = visitsByDoc.get(a.doctorId) || { total: 0, newCount: 0, followupCount: 0 }
    cur.total += 1
    if (vType === 'new') cur.newCount += 1
    else if (vType === 'follow_up') cur.followupCount += 1
    visitsByDoc.set(a.doctorId, cur)
  }

  const collectedByDoc = new Map<string, number>()
  for (const l of periodLogs) {
    if (!l.doctorId) continue
    collectedByDoc.set(l.doctorId, (collectedByDoc.get(l.doctorId) || 0) + l.amount)
  }

  const docIds = new Set([...visitsByDoc.keys(), ...collectedByDoc.keys()])
  const totalCollected = Array.from(collectedByDoc.values()).reduce((a, b) => a + b, 0)

  const results: DoctorPeriodStat[] = []
  docIds.forEach((docId) => {
    const doc = docMap.get(docId)
    if (!doc) return
    const v = visitsByDoc.get(docId) || { total: 0, newCount: 0, followupCount: 0 }
    const collected = collectedByDoc.get(docId) || 0
    results.push({
      doctorId: docId,
      doctorName: formatDoctorDisplayName(doc.fullName || doc.name) || doc.fullName || doc.name,
      specialty: doc.specialty || 'General Practice',
      consultationFee: Number(doc.consultationFee || 0),
      totalVisits: v.total,
      newPatients: v.newCount,
      followupPatients: v.followupCount,
      collectedAmount: collected,
      sharePercent: totalCollected > 0 ? (collected / totalCollected) * 100 : 0,
    })
  })
  return results.sort((a, b) => b.collectedAmount - a.collectedAmount)
}

export function computeTestPeriodStats(
  periodLogs: UnifiedPaymentLogEntry[],
  appointments: any[],
  invoices: any[],
  clinicServices: any[]
): LabTestPeriodStat[] {
  const apptMap = new Map<string, any>()
  appointments.forEach((a) => {
    if (a.id) apptMap.set(a.id, a)
  })
  const invByAppt = new Map<string, any>()
  invoices.forEach((i) => {
    const aid = i.appointmentId || i.appointment_id
    if (aid) invByAppt.set(aid, i)
  })
  const catalogByLower = new Map<string, number>()
  clinicServices.forEach((s) => {
    const n = String(s.service_name || s.serviceName || '').trim().toLowerCase()
    if (n) catalogByLower.set(n, Number(s.price || 0))
  })

  const incomeByTestPaisa = new Map<string, number>()
  const countByTest = new Map<string, number>()
  const unitPriceByTest = new Map<string, number>()
  const counted = new Set<string>()

  for (const log of periodLogs) {
    const appt = log.appointmentId ? apptMap.get(log.appointmentId) : undefined
    const inv = (log.invoiceId && invoices.find((i) => i.id === log.invoiceId)) || (log.appointmentId ? invByAppt.get(log.appointmentId) : undefined)
    let parsed = parseLabTestItems(appt, inv, clinicServices)
    if (parsed.length === 0 && log.testNames.length > 0) {
      parsed = log.testNames.map((n) => ({ name: n, price: catalogByLower.get(n.toLowerCase()) || 0 }))
    }
    if (parsed.length === 0) parsed = [{ name: 'Lab Service', price: 1 }]

    const keyPrefix = log.appointmentId || log.invoiceId || log.id
    for (const item of parsed) {
      if (item.price > 0 && !unitPriceByTest.has(item.name)) unitPriceByTest.set(item.name, item.price)
      const dedupKey = `${keyPrefix}|${item.name}`
      if (!counted.has(dedupKey)) {
        counted.add(dedupKey)
        countByTest.set(item.name, (countByTest.get(item.name) || 0) + 1)
      }
    }

    const totalPaisa = Math.round(log.amount * 100)
    const totalWeight = parsed.reduce((acc, p) => acc + p.price, 0)
    let distributed = 0
    parsed.forEach((item, idx) => {
      const share =
        idx === parsed.length - 1
          ? totalPaisa - distributed
          : totalWeight > 0
          ? Math.round(log.amount * (item.price / totalWeight) * 100)
          : Math.floor(totalPaisa / parsed.length)
      distributed += share
      incomeByTestPaisa.set(item.name, (incomeByTestPaisa.get(item.name) || 0) + share)
    })
  }

  let totalIncome = 0
  incomeByTestPaisa.forEach((p) => {
    totalIncome += p / 100
  })

  const stats: LabTestPeriodStat[] = []
  incomeByTestPaisa.forEach((paisa, name) => {
    const income = paisa / 100
    const cnt = countByTest.get(name) || 1
    const unitPrice = unitPriceByTest.get(name) || catalogByLower.get(name.toLowerCase()) || income / cnt
    stats.push({
      testName: name,
      count: cnt,
      unitPrice,
      collectedIncome: income,
      sharePercent: totalIncome > 0 ? (income / totalIncome) * 100 : 0,
    })
  })
  return stats.sort((a, b) => b.collectedIncome - a.collectedIncome)
}

export function computeDoctorDailyAndMonthlyStats(
  appointments: any[] = [],
  invoices: any[] = [],
  doctors: any[] = [],
  mode: 'daily' | 'monthly' = 'daily',
  selectedDoctorId?: string,
  selectedPeriod?: string
): DoctorVisitAnalytics[] {
  const safeAppts = Array.isArray(appointments) ? appointments : []
  const safeDocs = Array.isArray(doctors) ? doctors : []

  const docMap = new Map<string, any>()
  safeDocs.forEach((d) => {
    if (d.id) docMap.set(d.id, d)
  })

  const earliestVisitsByDoctor = new Map<string, string>()
  const validAppts = [...safeAppts]
    .filter((a) => a.doctorId && (a.status || 'APPROVED') === 'APPROVED' && (a.checkinStatus || '') !== 'cancelled')
    .sort((a, b) => `${a.appointmentDate || '1970-01-01'} ${a.appointmentTime || '00:00'}`.localeCompare(`${b.appointmentDate || '1970-01-01'} ${b.appointmentTime || '00:00'}`))

  for (const a of validAppts) {
    const comboKey = `${a.doctorId}::${derivePatientKey(a)}`
    if (!earliestVisitsByDoctor.has(comboKey)) earliestVisitsByDoctor.set(comboKey, a.id)
  }

  const filteredAppts = validAppts.filter((a) => {
    if (selectedDoctorId && a.doctorId !== selectedDoctorId) return false
    const dateStr = a.appointmentDate || ''
    if (selectedPeriod) {
      if (mode === 'daily' && dateStr !== selectedPeriod) return false
      if (mode === 'monthly' && !dateStr.startsWith(selectedPeriod)) return false
    }
    return true
  })

  const groups = new Map<string, any[]>()
  for (const a of filteredAppts) {
    const dStr = a.appointmentDate || '1970-01-01'
    const periodKey = mode === 'daily' ? dStr : dStr.slice(0, 7)
    const groupKey = `${a.doctorId}::${periodKey}`
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey)!.push(a)
  }

  const safeInvs = Array.isArray(invoices) ? invoices : []
  const invMap = new Map<string, any>()
  safeInvs.forEach((inv) => {
    if (inv.appointmentId) invMap.set(inv.appointmentId, inv)
    else if (inv.appointment_id) invMap.set(inv.appointment_id, inv)
  })

  const results: DoctorVisitAnalytics[] = []
  groups.forEach((appts, key) => {
    const [docId, periodKey] = key.split('::')
    const doc = docMap.get(docId) || {}
    let newCount = 0
    let followupCount = 0
    let consultationRev = 0
    let totalRev = 0
    let onlineRev = 0
    let deskRev = 0
    const patientList: any[] = []

    for (const a of appts) {
      const isNew = earliestVisitsByDoctor.get(`${a.doctorId}::${derivePatientKey(a)}`) === a.id
      if (isNew) newCount++
      else followupCount++

      const docFee = doc.consultationFee || Number(a.feeAmount || 0) || 0
      const isFreeFollowUp = !isNew && Number(a.feeAmount || 0) <= 0
      const fee = !isFreeFollowUp ? docFee : 0
      const inv = invMap.get(a.id)

      let followupBillAdded = 0
      if (isFreeFollowUp && inv) {
        const nonConsultationItemsTotal = (inv.items || [])
          .filter((it: any) => {
            const n = (it.name || it.itemName || it.item_name || '').toLowerCase()
            return !n.includes('consultation') && !n.includes('opd doctor')
          })
          .reduce((sum: number, it: any) => sum + Number(it.price || it.total || 0), 0)
        followupBillAdded =
          nonConsultationItemsTotal > 0
            ? nonConsultationItemsTotal
            : Number(inv.paidAmount || 0) > 0
            ? Number(inv.paidAmount || 0)
            : Number(inv.totalAmount || 0)
      }

      const apptRevenue = !isFreeFollowUp ? (Number(a.totalAmount || 0) > 0 ? Number(a.totalAmount) : fee) : followupBillAdded
      consultationRev += fee
      totalRev += apptRevenue
      if ((a.paymentMode || '').toUpperCase() === 'ONLINE' || (a.paymentStatus || '').toLowerCase() === 'paid') {
        onlineRev += apptRevenue
      } else {
        deskRev += apptRevenue
      }
      patientList.push({
        patientName: a.patientName || 'Patient',
        trackingCode: a.trackingCode10Digit || '',
        dateTime: `${a.appointmentDate} ${a.appointmentTime || ''}`.trim(),
        isNew,
        amount: apptRevenue,
        paymentMethod: a.paymentMode || 'DESK',
      })
    }

    results.push({
      doctorId: docId,
      doctorName: formatDoctorDisplayName(doc.fullName || doc.name) || 'Doctor',
      specialty: doc.specialty || 'General OPD',
      periodLabel: periodKey,
      periodDate: mode === 'daily' ? periodKey : undefined,
      periodMonth: mode === 'monthly' ? periodKey : undefined,
      newPatientsCount: newCount,
      followupPatientsCount: followupCount,
      totalPatientsCount: appts.length,
      consultationRevenue: consultationRev,
      ancillaryRevenue: Math.max(0, totalRev - consultationRev),
      totalRevenue: totalRev,
      onlineRevenue: onlineRev,
      deskRevenue: deskRev,
      patients: patientList,
    })
  })

  return results.sort((a, b) => b.periodLabel.localeCompare(a.periodLabel) || a.doctorName.localeCompare(b.doctorName))
}

export function exportPaymentLogsToCsv(
  logs: UnifiedPaymentLogEntry[],
  clinicName = 'Clinic',
  expenses: ClinicExpense[] = [],
  periodLabel = 'All Time',
  isLabClinic = false
): string {
  const headers = [
    'Date',
    'Time',
    'Receipt/Ref #',
    'Patient Name',
    'Patient Phone',
    '10-Digit Tracking Code',
    isLabClinic ? 'Tests' : 'Doctor Name',
    isLabClinic ? 'Type' : 'Specialty',
    'Visit Type',
    'Category',
    'Payment Method',
    'Amount (NPR)',
    'Payment Status',
    'Remarks/Notes',
  ]

  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return '""'
    return `"${String(val).replace(/"/g, '""')}"`
  }

  const grossCollections = logs.reduce((acc, l) => acc + (l.amount || 0), 0)
  const platformCommission = logs.reduce((acc, l) => acc + (l.serviceChargeAmount || 0), 0)
  const netPayout = grossCollections - platformCommission
  const totalExpenses = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0)
  const netProfit = netPayout - totalExpenses
  const followupCount = logs.filter((l) => l.visitType === 'follow_up').length
  const newPatientCount = logs.filter((l) => l.visitType === 'new').length

  const rows: string[] = []
  rows.push('"DACTOR PLATFORM FINANCIAL & AUDIT STATEMENT"')
  rows.push(`"Clinic Name","${clinicName.replace(/"/g, '""')}"`)
  rows.push(`"Audit Scope Period","${periodLabel.replace(/"/g, '""')}"`)
  rows.push(`"Gross Collections (NPR)","${grossCollections.toFixed(2)}"`)
  rows.push(`"Dactor Pay-at-Desk Platform Commission (NPR)","${platformCommission.toFixed(2)}"`)
  rows.push(`"Net Clinic OPD Payout (NPR)","${netPayout.toFixed(2)}"`)
  rows.push(`"Total Clinic Expenses (NPR)","${totalExpenses.toFixed(2)}"`)
  rows.push(`"Net Clinic Profit / Cash Flow (NPR)","${netProfit.toFixed(2)}"`)
  if (!isLabClinic) {
    rows.push(`"Free Follow-up Consultations (0 NPR)","${followupCount} Patients (Fee Waived)"`)
    rows.push(`"New Patients Seen","${newPatientCount} Patients"`)
  }
  rows.push(`"Total Audit Records","${logs.length}"`)
  rows.push(`"Generated On: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' })}"`)
  rows.push('')
  rows.push(headers.map(escapeCell).join(','))

  for (const log of logs) {
    const vType = log.isRefund
      ? 'REFUND'
      : isLabClinic
      ? log.amount === 0
        ? 'FREE'
        : 'LAB_ORDER'
      : log.visitType === 'follow_up'
      ? 'FOLLOW-UP'
      : log.visitType === 'new'
      ? 'NEW PATIENT'
      : 'VISIT'
    const row = [
      log.date,
      log.time,
      log.referenceId || log.id.slice(0, 8),
      log.patientName,
      log.patientPhone,
      log.trackingCode,
      isLabClinic ? log.testNames.join('; ') : log.doctorName || '',
      isLabClinic ? 'Diagnostic Lab' : log.specialty || '',
      vType,
      log.category,
      log.paymentMethod,
      log.amount.toFixed(2),
      log.paymentStatus || 'PAID',
      log.note || '',
    ]
    rows.push(row.map(escapeCell).join(','))
  }

  if (expenses.length > 0) {
    rows.push('')
    rows.push('"CLINIC EXPENSES LOG"')
    const expHeaders = ['Date', 'Time', 'Title', 'Category', 'Payment Method', 'Amount (NPR)', 'Voucher/Bill #', 'Remarks']
    rows.push(expHeaders.map(escapeCell).join(','))
    for (const exp of expenses) {
      rows.push(
        [
          exp.expense_date,
          exp.expense_time || '',
          exp.title,
          exp.category,
          exp.payment_method,
          Number(exp.amount).toFixed(2),
          exp.voucher_number || '',
          exp.remarks || '',
        ]
          .map(escapeCell)
          .join(',')
      )
    }
  }

  return '\uFEFF' + rows.join('\r\n')
}

export interface CombinedBillingSummary {
  visitsCount: number
  totalBill: number
  totalPaid: number
  balanceDue: number
  items: Array<{ name: string; itemName: string; quantity: number; price: number; total: number }>
  paymentRecords: WebPaymentRecord[]
  cleanRemarks: string
}

export function computeCombinedBillingSummary(
  visits: any[],
  invoicesByApptId: Record<string, any>
): CombinedBillingSummary {
  if (!visits || visits.length === 0) {
    return { visitsCount: 0, totalBill: 0, totalPaid: 0, balanceDue: 0, items: [], paymentRecords: [], cleanRemarks: '' }
  }
  const seen = new Set<string>()
  const sortedVisits = visits
    .filter((v) => {
      if (!v || !v.id || seen.has(v.id)) return false
      seen.add(v.id)
      return true
    })
    .sort((a, b) => {
      const attDiff = Number(a.attemptNumber || 1) - Number(b.attemptNumber || 1)
      if (attDiff !== 0) return attDiff
      const dCmp = String(a.appointmentDate || '').localeCompare(String(b.appointmentDate || ''))
      if (dCmp !== 0) return dCmp
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    })

  const isMultiVisit = sortedVisits.length > 1
  const allItems: Array<{ name: string; itemName: string; quantity: number; price: number; total: number }> = []
  const allPayments: WebPaymentRecord[] = []
  const allRemarks: string[] = []
  let grandTotal = 0

  for (const v of sortedVisits) {
    const inv = invoicesByApptId[v.id] || null
    const st = String(v.status || '').toLowerCase()
    const cs = String(v.checkinStatus || '').toLowerCase()
    const isCancelled = st === 'cancelled' || st === 'rejected' || cs === 'cancelled'
    if (isCancelled && (!inv || (Number(inv.totalAmount || 0) <= 0 && Number(inv.paidAmount || 0) <= 0))) {
      continue
    }

    const isFollowUp =
      Number(v.attemptNumber || 1) > 1 ||
      String(v.visitType || '').toLowerCase().includes('follow') ||
      Boolean(v.followUpOfAppointmentId) ||
      (Number(v.feeAmount || 0) <= 0 &&
        Number(v.totalAmount || 0) <= 0 &&
        (String(v.paymentMode || '').toUpperCase() === 'FREE' || String(v.notes || '').toLowerCase().includes('follow')))

    const rawItems = Array.isArray(inv?.items) ? inv.items : []
    const cleanInvItems = rawItems
      .filter((it: any) => !String(it?.itemName || it?.name || '').toLowerCase().startsWith('payment received'))
      .map((it: any) => {
        const name = String(it?.itemName || it?.name || 'Clinical Service')
        const qty = Math.max(1, Number(it?.quantity || 1))
        const price = Number(it?.price || 0)
        const total = Number(it?.total || price * qty)
        return { name, itemName: name, quantity: qty, price, total }
      })

    const isPad = String(v.paymentMode || '').toUpperCase() === 'PAY_AT_DESK'
    const fee = Number(v.feeAmount || 0)
    const serviceCharge = isPad && fee > 0 ? Number(v.serviceChargeAmount || Math.round(fee * 0.05 * 100) / 100) : 0
    const apptEffectiveTotal = isPad
      ? Math.max(Number(v.totalAmount || 0), fee + serviceCharge)
      : Number(v.totalAmount || 0) > 0
      ? Number(v.totalAmount)
      : fee

    let visitItems = cleanInvItems
    if (visitItems.length > 0) {
      if (!isFollowUp && isPad && serviceCharge > 0) {
        const hasSc = visitItems.some((it: any) => {
          const l = it.name.toLowerCase()
          return l.includes('service charge') || l.includes('5%') || l.includes('+5%')
        })
        if (!hasSc) {
          visitItems = [...visitItems, { name: 'Pay at Desk Service Charge (5%)', itemName: 'Pay at Desk Service Charge (5%)', quantity: 1, price: serviceCharge, total: serviceCharge }]
        }
      }
    } else if (inv && Number(inv.totalAmount || 0) > 0) {
      const invT = Number(inv.totalAmount)
      visitItems = [{ name: `OPD Consultation & Services (${v.appointmentDate || ''})`, itemName: `OPD Consultation & Services (${v.appointmentDate || ''})`, quantity: 1, price: invT, total: invT }]
    } else if (!isFollowUp && apptEffectiveTotal > 0) {
      if (isPad && serviceCharge > 0) {
        visitItems = [
          { name: `OPD Consultation (${v.appointmentDate || ''})`, itemName: `OPD Consultation (${v.appointmentDate || ''})`, quantity: 1, price: fee, total: fee },
          { name: 'Pay at Desk Service Charge (5%)', itemName: 'Pay at Desk Service Charge (5%)', quantity: 1, price: serviceCharge, total: serviceCharge },
        ]
      } else {
        visitItems = [{ name: `OPD Consultation (${v.appointmentDate || ''})`, itemName: `OPD Consultation (${v.appointmentDate || ''})`, quantity: 1, price: apptEffectiveTotal, total: apptEffectiveTotal }]
      }
    }

    const visitTotal =
      visitItems.length > 0
        ? visitItems.reduce((acc: number, it: any) => acc + (Number(it.total) > 0 ? Number(it.total) : Number(it.price) * Number(it.quantity || 1)), 0)
        : inv && Number(inv.totalAmount || 0) > 0
        ? Number(inv.totalAmount)
        : !isFollowUp
        ? apptEffectiveTotal
        : 0

    grandTotal += visitTotal
    for (const it of visitItems) {
      const tagged = isMultiVisit && !it.name.startsWith('Visit #')
        ? `Visit #${v.attemptNumber || 1} (${v.appointmentDate || ''}) • ${it.name}`
        : it.name
      allItems.push({ ...it, name: tagged, itemName: tagged })
    }

    const parsedLogs = parsePaymentRecords(inv?.remarks, 0, inv?.paidAt)
    if (parsedLogs.length > 0) {
      allPayments.push(...parsedLogs)
    } else {
      const explicitPaid = Number(inv?.paidAmount || 0) > 0
        ? Number(inv.paidAmount)
        : inv?.paymentStatus === 'paid' && Number(inv?.totalAmount || 0) > 0
        ? Number(inv.totalAmount)
        : 0
      const synthPaid = explicitPaid > 0
        ? explicitPaid
        : !isFollowUp && v.paymentStatus === 'paid' && visitTotal > 0
        ? visitTotal
        : 0
      if (synthPaid > 0) {
        const rawStamp = inv?.paidAt || v.approvedAt
        allPayments.push({
          id: `pay_${v.id}`,
          amount: synthPaid,
          dateTime: rawStamp
            ? formatPaymentTimestampKathmandu(rawStamp)
            : `${v.appointmentDate || ''} ${v.appointmentTime || '10:00 AM'}`.trim(),
          note: isPad ? 'Pay at Desk Collection' : 'Consultation Payment',
        })
      }
    }

    const cleanRem = extractCleanClinicalRemarks(inv?.remarks)
    if (cleanRem) {
      allRemarks.push(isMultiVisit ? `[${v.appointmentDate || ''}] ${cleanRem}` : cleanRem)
    }
  }

  const totalPaid = allPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
  return {
    visitsCount: sortedVisits.length,
    totalBill: grandTotal,
    totalPaid,
    balanceDue: Math.max(0, grandTotal - totalPaid),
    items: allItems,
    paymentRecords: allPayments,
    cleanRemarks: allRemarks.join('\n'),
  }
}
