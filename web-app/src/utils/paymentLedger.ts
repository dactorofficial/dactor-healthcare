export interface WebPaymentRecord {
  id?: string
  amount: number
  dateTime: string
  note?: string
  paymentMethod?: 'CASH' | 'ESEWA' | 'KHALTI' | 'FONEPAY_QR' | 'CARD' | 'CONNECTIPS' | 'PAY_AT_DESK' | string
  referenceId?: string
  category?: string
}

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
  doctorId?: string
  doctorName?: string
  specialty?: string
  isNewPatientForDoctor: boolean
  type: 'PAYMENT' | 'REFUND' | 'DISCOUNT' | 'CORRECTION'
  amount: number
  paymentMethod: string
  referenceId?: string
  category: string
  note?: string
  invoiceTotal?: number
  balanceDue?: number
  paymentStatus?: string
  items?: Array<{ name: string; price: number; quantity: number }>
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

export function parsePaymentRecords(
  rawRemarks?: string | null,
  fallbackPaidAmount = 0,
  fallbackDate?: string | null
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
            dateTime: item.dateTime || item.date_time || 'Recorded',
            note: item.note || 'Payment Received',
            paymentMethod: item.paymentMethod || item.payment_method || 'CASH',
            referenceId: item.referenceId || item.reference_id || undefined,
            category: item.category || 'CONSULTATION',
          }))
        }
      }
    } catch (e) {
      console.error('Error parsing payment records from remarks:', e)
    }
  }

  if (fallbackPaidAmount > 0) {
    const dStr = fallbackDate ? fallbackDate.slice(0, 16).replace('T', ' ') : new Date().toISOString().slice(0, 10)
    return [
      {
        id: 'initial',
        amount: fallbackPaidAmount,
        dateTime: dStr,
        note: 'Payment Received',
        paymentMethod: 'CASH',
        category: 'CONSULTATION',
      },
    ]
  }
  return []
}

export function extractCleanClinicalRemarks(rawRemarks?: string | null): string {
  if (!rawRemarks) return ''
  let text = rawRemarks

  // 1. Strip <!--PAYMENT_LOG_START--> ... <!--PAYMENT_LOG_END-->
  if (text.includes(START_TAG)) {
    const before = text.split(START_TAG)[0].trim()
    const after = text.includes(END_TAG) ? text.split(END_TAG)[1].trim() : ''
    text = [before, after].filter(Boolean).join('\n').trim()
  }

  // 2. Strip any other HTML comments <!-- ... -->
  text = text.replace(/<!--[\s\S]*?-->/g, '').trim()

  // 3. Strip [[META:...]] tags
  text = text.replace(/\[\[META:[\s\S]*?\]\]/g, '').trim()

  // 4. Strip any generic [[...]] tags
  text = text.replace(/\[\[[\s\S]*?\]\]/g, '').trim()

  // 5. Strip [CLINIC_ID:...] bracket tags
  text = text.replace(/\[[A-Z0-9_]+:[^\]]*\]/gi, '').trim()

  // 6. Strip raw JSON arrays or objects
  text = text.replace(/\[\s*\{[\s\S]*?\}\s*\]/g, '').trim()
  text = text.replace(/\{\s*"[a-zA-Z0-9_]+"\s*:[\s\S]*?\}/g, '').trim()

  // 7. Clean up lines
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        Boolean(l) &&
        !l.startsWith('<!--') &&
        !l.endsWith('-->') &&
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
    payment_method: r.paymentMethod || 'CASH',
    reference_id: r.referenceId || '',
    category: r.category || 'CONSULTATION',
  }))
  const recordsJson = JSON.stringify(recordsToSerialize)
  const logBlock = `${START_TAG}\n${recordsJson}\n${END_TAG}`
  return trimmed ? `${trimmed}\n\n${logBlock}` : logBlock
}

/**
 * Derives a canonical patient key per clinic (Nepal family-phone safe):
 * If a family shares a 10-digit phone, the patient name is combined to distinguish
 * separate family members (e.g., Parent vs Child).
 */
export function derivePatientKey(appt?: {
  userId?: string | null
  patientEmail?: string | null
  patientMobile?: string | null
  patientName?: string | null
} | null): string {
  if (!appt) return 'unknown_patient'
  if (appt.userId && appt.userId.trim()) return appt.userId.trim()
  const cleanEmail = (appt.patientEmail || '').trim().toLowerCase()
  const cleanName = (appt.patientName || '').trim().toLowerCase()
  const cleanPhone = (appt.patientMobile || '').replace(/\D/g, '').slice(-10)

  if (cleanEmail) return `${cleanEmail}|${cleanName}`
  if (cleanPhone) return `${cleanPhone}|${cleanName}`
  return cleanName || 'unknown_patient'
}

/**
 * Builds a chronological list of all payment events for a clinic,
 * merging invoice_transactions, legacy remark logs, and online payment attempts.
 */
export function buildUnifiedClinicPaymentLogs(
  appointments: any[] = [],
  invoices: any[] = [],
  invoiceTransactions: any[] = [],
  doctors: any[] = []
): UnifiedPaymentLogEntry[] {
  const safeAppts = Array.isArray(appointments) ? appointments : []
  const safeInvs = Array.isArray(invoices) ? invoices : []
  const safeTxs = Array.isArray(invoiceTransactions) ? invoiceTransactions : []
  const safeDocs = Array.isArray(doctors) ? doctors : []

  const apptMap = new Map<string, any>()
  safeAppts.forEach((a) => {
    if (a.id) apptMap.set(a.id, a)
  })

  const docMap = new Map<string, any>()
  safeDocs.forEach((d) => {
    if (d.id) docMap.set(d.id, d)
  })

  // 1. Precalculate earliest visit for each (doctor_id, patient_key)
  const earliestVisitsByDoctor = new Map<string, string>() // `${doctorId}::${patientKey}` -> earliest appointmentId
  const sortedAppts = [...safeAppts]
    .filter((a) => a.doctorId && (a.status || 'APPROVED') === 'APPROVED' && (a.checkinStatus || '') !== 'cancelled')
    .sort((a, b) => {
      const d1 = `${a.appointmentDate || '1970-01-01'} ${a.appointmentTime || '00:00'}`
      const d2 = `${b.appointmentDate || '1970-01-01'} ${b.appointmentTime || '00:00'}`
      return d1.localeCompare(d2)
    })

  for (const a of sortedAppts) {
    const pKey = derivePatientKey(a)
    const comboKey = `${a.doctorId}::${pKey}`
    if (!earliestVisitsByDoctor.has(comboKey)) {
      earliestVisitsByDoctor.set(comboKey, a.id)
    }
  }

  const entries: UnifiedPaymentLogEntry[] = []
  const recordedTxnKeys = new Set<string>()

  // 2. Add structured invoice_transactions
  for (const tx of invoiceTransactions) {
    if (tx.is_deleted) continue
    const appt = apptMap.get(tx.appointment_id) || {}
    const doc = docMap.get(appt.doctorId || '') || {}
    const pKey = derivePatientKey(appt)
    const isNew = Boolean(appt.doctorId && earliestVisitsByDoctor.get(`${appt.doctorId}::${pKey}`) === appt.id)

    const rawTime = tx.transaction_time || tx.created_at || new Date().toISOString()
    const dStr = rawTime.slice(0, 10)
    const tStr = rawTime.slice(11, 16)

    const uniqueKey = `tx_${tx.id || `${tx.invoice_id}_${tx.amount}_${rawTime}`}`
    if (recordedTxnKeys.has(uniqueKey)) continue
    recordedTxnKeys.add(uniqueKey)

    entries.push({
      id: tx.id || uniqueKey,
      invoiceId: tx.invoice_id,
      appointmentId: tx.appointment_id,
      clinicId: tx.clinic_id,
      dateTime: rawTime,
      date: dStr,
      time: tStr,
      patientName: appt.patientName || 'Patient',
      patientPhone: appt.patientMobile || '',
      trackingCode: appt.trackingCode10Digit || '',
      doctorId: appt.doctorId,
      doctorName: doc.fullName || (doc.name ? `Dr. ${doc.name}` : undefined),
      specialty: doc.specialty,
      isNewPatientForDoctor: isNew,
      type: (tx.transaction_type as any) || 'PAYMENT',
      amount: Number(tx.amount || 0),
      paymentMethod: (tx.payment_method || 'CASH').toUpperCase(),
      referenceId: tx.reference_id || undefined,
      category: tx.category || 'CONSULTATION',
      note: tx.notes || 'Payment Received',
      invoiceTotal: appt.totalAmount || appt.feeAmount || 0,
      balanceDue: 0,
      paymentStatus: 'paid',
    })
  }

  // 3. Fallback / Merge from billing_invoices & legacy remarks logs
  for (const inv of invoices) {
    if (inv.is_deleted) continue
    const appt = apptMap.get(inv.appointmentId) || {}
    const doc = docMap.get(appt.doctorId || '') || {}
    const pKey = derivePatientKey(appt)
    const isNew = Boolean(appt.doctorId && earliestVisitsByDoctor.get(`${appt.doctorId}::${pKey}`) === appt.id)

    const parsedRecords = parsePaymentRecords(inv.remarks, inv.paidAmount, inv.paidAt || inv.updatedAt)

    if (parsedRecords.length > 0) {
      for (const pr of parsedRecords) {
        const rawTime = pr.dateTime.includes('T') ? pr.dateTime : `${inv.paidAt || inv.updatedAt || new Date().toISOString()}`
        const dStr = pr.dateTime.slice(0, 10) || (inv.paidAt ? inv.paidAt.slice(0, 10) : '')
        const uniqueKey = `inv_${inv.id}_${pr.id || pr.amount}_${dStr}`
        if (recordedTxnKeys.has(uniqueKey)) continue
        recordedTxnKeys.add(uniqueKey)

        entries.push({
          id: pr.id || uniqueKey,
          invoiceId: inv.id,
          appointmentId: inv.appointmentId,
          clinicId: inv.clinicId,
          dateTime: rawTime,
          date: dStr || new Date().toISOString().slice(0, 10),
          time: rawTime.slice(11, 16) || '12:00',
          patientName: appt.patientName || 'Patient',
          patientPhone: appt.patientMobile || '',
          trackingCode: appt.trackingCode10Digit || '',
          doctorId: appt.doctorId,
          doctorName: doc.fullName || (doc.name ? `Dr. ${doc.name}` : undefined),
          specialty: doc.specialty,
          isNewPatientForDoctor: isNew,
          type: 'PAYMENT',
          amount: Number(pr.amount || 0),
          paymentMethod: (pr.paymentMethod || (appt.paymentMode === 'PAY_AT_DESK' ? 'PAY_AT_DESK' : 'CASH')).toUpperCase(),
          referenceId: pr.referenceId,
          category: pr.category || 'CONSULTATION',
          note: pr.note || 'Payment Received',
          invoiceTotal: Number(inv.totalAmount || 0),
          balanceDue: Number(inv.balanceDue || 0),
          paymentStatus: inv.paymentStatus || 'paid',
          items: Array.isArray(inv.items) ? inv.items : [],
        })
      }
    } else if (Number(inv.paidAmount || 0) > 0) {
      const rawTime = inv.paidAt || inv.updatedAt || new Date().toISOString()
      const dStr = rawTime.slice(0, 10)
      const uniqueKey = `inv_flat_${inv.id}`
      if (!recordedTxnKeys.has(uniqueKey)) {
        recordedTxnKeys.add(uniqueKey)
        entries.push({
          id: uniqueKey,
          invoiceId: inv.id,
          appointmentId: inv.appointmentId,
          clinicId: inv.clinicId,
          dateTime: rawTime,
          date: dStr,
          time: rawTime.slice(11, 16),
          patientName: appt.patientName || 'Patient',
          patientPhone: appt.patientMobile || '',
          trackingCode: appt.trackingCode10Digit || '',
          doctorId: appt.doctorId,
          doctorName: doc.fullName || (doc.name ? `Dr. ${doc.name}` : undefined),
          specialty: doc.specialty,
          isNewPatientForDoctor: isNew,
          type: 'PAYMENT',
          amount: Number(inv.paidAmount || 0),
          paymentMethod: (appt.paymentMode === 'PAY_AT_DESK' ? 'PAY_AT_DESK' : 'CASH').toUpperCase(),
          category: 'CONSULTATION',
          note: 'Full Bill Payment',
          invoiceTotal: Number(inv.totalAmount || 0),
          balanceDue: Number(inv.balanceDue || 0),
          paymentStatus: inv.paymentStatus || 'paid',
          items: Array.isArray(inv.items) ? inv.items : [],
        })
      }
    }
  }

  // Sort descending by date & time
  return entries.sort((a, b) => b.dateTime.localeCompare(a.dateTime))
}

/**
 * Computes Doctor Daily and Monthly patient counts (New vs Follow-up) and revenues.
 */
export function computeDoctorDailyAndMonthlyStats(
  appointments: any[] = [],
  invoices: any[] = [],
  doctors: any[] = [],
  mode: 'daily' | 'monthly' = 'daily',
  selectedDoctorId?: string,
  selectedPeriod?: string // "YYYY-MM-DD" for daily, "YYYY-MM" for monthly
): DoctorVisitAnalytics[] {
  const safeAppts = Array.isArray(appointments) ? appointments : []
  const safeDocs = Array.isArray(doctors) ? doctors : []

  const docMap = new Map<string, any>()
  safeDocs.forEach((d) => {
    if (d.id) docMap.set(d.id, d)
  })

  // 1. Identify first visit for every patient per doctor
  const earliestVisitsByDoctor = new Map<string, string>()
  const validAppts = [...safeAppts]
    .filter((a) => a.doctorId && (a.status || 'APPROVED') === 'APPROVED' && (a.checkinStatus || '') !== 'cancelled')
    .sort((a, b) => {
      const d1 = `${a.appointmentDate || '1970-01-01'} ${a.appointmentTime || '00:00'}`
      const d2 = `${b.appointmentDate || '1970-01-01'} ${b.appointmentTime || '00:00'}`
      return d1.localeCompare(d2)
    })

  for (const a of validAppts) {
    const pKey = derivePatientKey(a)
    const comboKey = `${a.doctorId}::${pKey}`
    if (!earliestVisitsByDoctor.has(comboKey)) {
      earliestVisitsByDoctor.set(comboKey, a.id)
    }
  }

  // 2. Filter by doctor and period
  const filteredAppts = validAppts.filter((a) => {
    if (selectedDoctorId && a.doctorId !== selectedDoctorId) return false
    const dateStr = a.appointmentDate || ''
    if (selectedPeriod) {
      if (mode === 'daily') {
        if (dateStr !== selectedPeriod) return false
      } else {
        if (!dateStr.startsWith(selectedPeriod)) return false
      }
    }
    return true
  })

  // 3. Group by Doctor + Period
  const groups = new Map<string, any[]>()
  for (const a of filteredAppts) {
    const dStr = a.appointmentDate || '1970-01-01'
    const periodKey = mode === 'daily' ? dStr : dStr.slice(0, 7)
    const groupKey = `${a.doctorId}::${periodKey}`
    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey)!.push(a)
  }

  // 4. Map to DoctorVisitAnalytics
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
      const pKey = derivePatientKey(a)
      const isNew = earliestVisitsByDoctor.get(`${a.doctorId}::${pKey}`) === a.id
      if (isNew) newCount++
      else followupCount++

      const docFee = doc.consultationFee || Number(a.feeAmount || 0) || 0
      const fee = isNew ? docFee : 0
      const inv = invMap.get(a.id)

      let followupBillAdded = 0
      if (!isNew && inv) {
        const nonConsultationItemsTotal = (inv.items || [])
          .filter((it: any) => {
            const n = (it.name || it.itemName || it.item_name || '').toLowerCase()
            return !n.includes('consultation') && !n.includes('opd doctor')
          })
          .reduce((sum: number, it: any) => sum + Number(it.price || it.total || 0), 0)

        followupBillAdded = nonConsultationItemsTotal > 0
          ? nonConsultationItemsTotal
          : Number(inv.paidAmount || 0) > 0
          ? Number(inv.paidAmount || 0)
          : (inv.items && inv.items.length > 0 && Number(inv.totalAmount || 0) > 0)
          ? Number(inv.totalAmount || 0)
          : 0
      }

      const apptRevenue = isNew ? (Number(a.totalAmount || 0) > 0 ? Number(a.totalAmount) : fee) : followupBillAdded

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
      doctorName: doc.fullName || (doc.name ? `Dr. ${doc.name}` : 'Doctor'),
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

  // Sort by period descending, then doctor name ascending
  return results.sort((a, b) => {
    const cmp = b.periodLabel.localeCompare(a.periodLabel)
    if (cmp !== 0) return cmp
    return a.doctorName.localeCompare(b.doctorName)
  })
}

/**
 * Generates an RFC 4180 compliant CSV string with UTF-8 BOM for Microsoft Excel.
 */
export function exportPaymentLogsToCsv(
  logs: UnifiedPaymentLogEntry[],
  clinicName = 'Clinic'
): string {
  const headers = [
    'Date',
    'Time',
    'Receipt/Ref #',
    'Patient Name',
    'Patient Phone',
    '10-Digit Tracking Code',
    'Doctor Name',
    'Specialty',
    'Visit Type',
    'Category',
    'Payment Method',
    'Amount (NPR)',
    'Payment Status',
    'Remarks/Notes',
  ]

  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return '""'
    const s = String(val).replace(/"/g, '""')
    return `"${s}"`
  }

  const rows: string[] = []
  rows.push(`"DACTOR CLINIC PAYMENT LOGS REPORT - ${clinicName.replace(/"/g, '""')}"`)
  rows.push(`"Generated On: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' })}"`)
  rows.push('')
  rows.push(headers.map(escapeCell).join(','))

  for (const log of logs) {
    const row = [
      log.date,
      log.time,
      log.referenceId || log.id.slice(0, 8),
      log.patientName,
      log.patientPhone,
      log.trackingCode,
      log.doctorName || 'N/A',
      log.specialty || 'N/A',
      log.isNewPatientForDoctor ? 'NEW PATIENT' : 'FOLLOW-UP',
      log.category,
      log.paymentMethod,
      log.amount.toFixed(2),
      log.paymentStatus || 'PAID',
      log.note || '',
    ]
    rows.push(row.map(escapeCell).join(','))
  }

  // Prepend UTF-8 Byte Order Mark (BOM) so Excel opens UTF-8 cleanly
  return '\uFEFF' + rows.join('\r\n')
}
