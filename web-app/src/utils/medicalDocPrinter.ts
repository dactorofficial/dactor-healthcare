import {
  Appointment,
  BillingInvoice,
  getEffectiveInvoiceItems,
  getEffectiveInvoiceTotal,
} from '../types'
import { parsePaymentRecords, extractCleanClinicalRemarks } from './paymentLedger'
import { getInvoiceForAppointment } from '../services/db'
import { escapeHtml } from './html'

/**
 * Universal printer for official medical appointment invoice & bill receipt.
 * Itemizes services, procedural additions, payment logs, and remaining balance.
 */
export async function printAppointmentBill(appt: Appointment, invoice?: BillingInvoice | null): Promise<void> {
  const win = window.open('', '_blank', 'width=800,height=750')
  if (!win) return

  const clinicTitle = appt.clinic?.name || 'Dactor Certified Healthcare Center'
  const clinicAddr = appt.clinic?.addressText || 'Kathmandu, Nepal'
  const docTitle = appt.doctor?.fullName || 'General OPD Specialist'
  const docSpec = appt.doctor?.specialty || 'General Medicine'

  let inv = invoice
  if (!inv && appt.id) {
    try {
      inv = await getInvoiceForAppointment(appt.id)
    } catch (e) {
      console.warn('Could not load invoice for printAppointmentBill', e)
    }
  }
  const effectiveTotal = getEffectiveInvoiceTotal(appt, inv)
  const rawPaid = inv ? Number(inv.paidAmount || 0) : 0
  const effectivePaid =
    inv?.paymentStatus === 'paid' || appt.paymentStatus === 'paid'
      ? Math.max(rawPaid, effectiveTotal)
      : rawPaid
  const effectiveBalance = Math.max(0, effectiveTotal - effectivePaid)
  const isPaid = effectiveBalance <= 0 && effectiveTotal > 0

  const isPad = String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK'
  const rawPaymentLogs = parsePaymentRecords(inv?.remarks, effectivePaid, inv?.paidAt)
  const paymentLogs =
    isPad && rawPaymentLogs.length === 1 && effectivePaid >= effectiveTotal && rawPaymentLogs[0].amount < effectiveTotal
      ? [{ ...rawPaymentLogs[0], amount: effectiveTotal }]
      : rawPaymentLogs
  const cleanRemarks = extractCleanClinicalRemarks(inv?.remarks)

  const items = getEffectiveInvoiceItems(appt, inv?.items)

  const itemsRowsHtml = items
    .map(
      (it, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${escapeHtml(it.name)}</strong></td>
        <td style="text-align:center;">${escapeHtml(it.quantity)}</td>
        <td style="text-align:right;">Rs. ${escapeHtml(it.price)}</td>
        <td style="text-align:right;font-weight:700;">Rs. ${escapeHtml(it.total)}</td>
      </tr>`
    )
    .join('')

  const paymentLogsHtml = paymentLogs.length > 0
    ? `
      <div style="margin-top:20px;">
        <h4 style="margin:0 0 8px;font-size:12px;color:#166534;text-transform:uppercase;letter-spacing:0.5px;">Payment Receipts & Time Log</h4>
        <table style="width:100%;border-collapse:collapse;border:1px solid #bbf7d0;">
          <thead>
            <tr style="background:#dcfce7;color:#14532d;font-size:10px;text-transform:uppercase;">
              <th style="padding:6px;">Date & Time Log</th>
              <th style="padding:6px;">Note / Mode</th>
              <th style="padding:6px;text-align:right;">Paid (NPR)</th>
            </tr>
          </thead>
          <tbody>
            ${paymentLogs
              .map(
                (p) => `
              <tr style="font-size:12px;border-bottom:1px solid #e2e8f0;">
                <td style="padding:6px;font-family:monospace;">${escapeHtml(p.dateTime)}</td>
                <td style="padding:6px;color:#475569;">${escapeHtml(p.note || 'Payment Received')}</td>
                <td style="padding:6px;text-align:right;font-weight:700;color:#15803d;">Rs. ${escapeHtml(p.amount)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`
    : ''

  const cleanRemarksHtml = cleanRemarks
    ? `
      <div style="margin-top:14px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:11px;">
        <strong style="color:#0f172a;">Doctor Clinical Remarks & Prescriptions:</strong>
        <p style="margin:4px 0 0;color:#334155;white-space:pre-wrap;">${escapeHtml(cleanRemarks)}</p>
      </div>`
    : ''

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Dactor Official Bill - #${escapeHtml(appt.trackingCode10Digit)}</title>
        <style>
          body { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; padding: 28px; color: #0f172a; background: #fff; }
          .box { max-width: 680px; margin: 0 auto; border: 2px solid #0d9488; border-radius: 16px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f0fdfa; padding-bottom: 14px; margin-bottom: 14px; }
          .badge { background: ${isPaid ? '#ecfdf5' : '#fffbeb'}; color: ${isPaid ? '#047857' : '#b45309'}; border: 1px solid ${isPaid ? '#a7f3d0' : '#fde68a'}; padding: 5px 12px; border-radius: 999px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
          .code-box { background: #f0fdf4; border: 1px dashed #14b8a6; border-radius: 12px; padding: 10px 14px; margin: 12px 0; text-align: center; }
          .code { font-family: monospace; font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #0f766e; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
          th { color: #64748b; text-transform: uppercase; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
          .footer { margin-top: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 12px; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="header">
            <div>
              <h2 style="margin:0;font-size:20px;color:#0f172a;">${escapeHtml(clinicTitle)}</h2>
              <p style="margin:3px 0 0;font-size:12px;color:#64748b;">${escapeHtml(clinicAddr)}</p>
              <p style="margin:2px 0 0;font-size:11px;font-weight:700;color:#0d9488;">Official Medical Invoice & OPD Receipt</p>
            </div>
            <span class="badge">${isPaid ? 'PAID FULL' : (effectivePaid > 0 ? 'PARTIAL PAID' : 'PAYABLE AT CLINIC')}</span>
          </div>

          <div class="code-box">
            <div style="font-size:10px;text-transform:uppercase;color:#0f766e;font-weight:800;letter-spacing:1px;">10-Digit Live OPD Queue Token</div>
            <div class="code">#${escapeHtml(appt.trackingCode10Digit)}</div>
            <div style="font-size:11px;color:#475569;margin-top:2px;">Present this token at the reception desk for instant check-in</div>
          </div>

          <table style="margin-bottom:16px;">
            <tr><th style="width:30%;">Patient Name</th><td><strong>${escapeHtml(appt.patientName)}</strong> (${escapeHtml(appt.patientAge || '–')} Yrs, ${escapeHtml(appt.patientGender || '–')})</td></tr>
            <tr><th>Attending Doctor</th><td>Dr. ${escapeHtml(docTitle)} (${escapeHtml(docSpec)})</td></tr>
            <tr><th>Date & Time</th><td><strong>${escapeHtml(appt.appointmentDate)}</strong> • ${escapeHtml(appt.appointmentTime)}</td></tr>
            <tr><th>Contact Phone</th><td><span style="font-family:monospace;">${escapeHtml(appt.patientMobile || '–')}</span></td></tr>
          </table>

          <div style="margin-top:10px;">
            <h4 style="margin:0 0 6px;font-size:11px;color:#334155;text-transform:uppercase;letter-spacing:0.5px;">Services & Procedures</h4>
            <table style="border:1px solid #e2e8f0;">
              <thead style="background:#f8fafc;">
                <tr>
                  <th style="width:30px;">#</th>
                  <th>Description</th>
                  <th style="text-align:center;">Qty</th>
                  <th style="text-align:right;">Rate</th>
                  <th style="text-align:right;">Total (NPR)</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRowsHtml}
              </tbody>
            </table>
          </div>

          ${paymentLogsHtml}

          <div style="margin-top:16px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px;padding:12px;font-size:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="color:#475569;">Total Combined Bill:</span>
              <strong style="font-size:14px;color:#0f172a;">Rs. ${escapeHtml(effectiveTotal)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#15803d;font-weight:700;">
              <span>Total Paid to Date:</span>
              <span>Rs. ${escapeHtml(effectivePaid)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px dashed #99f6e4;color:#b91c1c;font-weight:800;font-size:13px;">
              <span>Balance Due:</span>
              <span>Rs. ${escapeHtml(effectiveBalance)}</span>
            </div>
          </div>

          ${cleanRemarksHtml}

          <div class="footer">
            <p style="margin:0;font-weight:700;color:#334155;">Verified by Dactor Unified Health Cloud Network • Computer Generated Official Receipt</p>
            <p style="margin:3px 0 0;font-size:10px;">Printed on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
          </div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
    </html>
  `)
  win.document.close()
}

/**
 * Universal printer for official clinical prescription (Rx) document.
 * Parses diagnosis, medicine table, clinical remarks, and triggers print.
 */
export function printPrescription(appt: Appointment): void {
  const win = window.open('', '_blank', 'width=800,height=750')
  if (!win) return

  let parsedRx: {
    diagnosis?: string
    medicines?: Array<{ name: string; dosage?: string; frequency?: string; duration?: string; instructions?: string }>
    advice?: string
  } | null = null

  try {
    if (appt.notes && (appt.notes.trim().startsWith('{') || appt.notes.trim().startsWith('['))) {
      parsedRx = JSON.parse(appt.notes)
    }
  } catch {}

  const diagnosisText = parsedRx?.diagnosis || appt.notes || 'Routine Clinical Consultation'
  const adviceText = parsedRx?.advice || ''
  const medicines = parsedRx?.medicines || []

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>℞ Prescription - #${escapeHtml(appt.trackingCode10Digit)}</title>
        <style>
          body { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; padding: 28px; color: #0f172a; background: #fff; }
          .box { max-width: 680px; margin: 0 auto; border: 2px solid #2563eb; border-radius: 16px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eff6ff; padding-bottom: 14px; margin-bottom: 14px; }
          .rx-title { color: #2563eb; font-size: 24px; font-weight: 900; margin: 0; }
          .tag { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 4px 10px; border-radius: 999px; font-weight: 800; font-size: 11px; }
          .token-bar { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 8px 12px; margin: 12px 0; display: flex; justify-content: space-between; font-size: 12px; }
          .section { margin-top: 16px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 12px; }
          .section-title { font-weight: 800; color: #1e293b; margin-bottom: 6px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
          th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #e2e8f0; }
          th { font-size: 10px; text-transform: uppercase; color: #64748b; background: #f1f5f9; }
          .footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; color: #64748b; }
          .signature { border-top: 1px solid #94a3b8; width: 140px; text-align: center; padding-top: 4px; font-weight: 700; color: #0f172a; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="header">
            <div>
              <h1 class="rx-title">℞ PRESCRIPTION</h1>
              <p style="margin: 3px 0 0; font-size: 12px; color: #64748b; font-weight: 600;">Dactor Medical Network Record</p>
            </div>
            <span class="tag">OFFICIAL DIGITAL RX</span>
          </div>

          <div class="token-bar">
            <span><strong>Token:</strong> #${escapeHtml(appt.trackingCode10Digit)}</span>
            <span><strong>Date:</strong> ${escapeHtml(appt.appointmentDate)} (${escapeHtml(appt.appointmentTime || 'OPD')})</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; margin-bottom: 12px;">
            <div style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #f1f5f9;">
              <span style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; display: block;">Attending Doctor</span>
              <strong style="color: #0f172a;">${escapeHtml(appt.doctor?.fullName || 'OPD Specialist')}</strong>
              <span style="display: block; color: #2563eb; font-size: 11px;">${escapeHtml(appt.doctor?.specialty || 'General Medicine')}</span>
            </div>
            <div style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #f1f5f9;">
              <span style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; display: block;">Patient Details</span>
              <strong style="color: #0f172a;">${escapeHtml(appt.patientName)}</strong>
              <span style="display: block; color: #64748b; font-size: 11px;">${escapeHtml(appt.patientAge || '-')} Yrs • ${escapeHtml(appt.patientGender || '-')} • ${escapeHtml(appt.patientMobile || '')}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Clinical Diagnosis / Impression</div>
            <div style="font-weight: 600; color: #0f172a;">${escapeHtml(diagnosisText)}</div>
          </div>

          ${
            medicines.length > 0
              ? `
              <div class="section" style="padding: 6px 12px;">
                <div class="section-title" style="margin-top: 6px;">Prescribed Medicines (Rx)</div>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Medicine</th>
                      <th>Dosage</th>
                      <th>Frequency</th>
                      <th>Duration</th>
                      <th>Instructions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${medicines
                      .map(
                        (m, i) => `
                      <tr>
                        <td>${i + 1}</td>
                        <td style="font-weight: 700; color: #0f172a;">${escapeHtml(m.name)}</td>
                        <td>${escapeHtml(m.dosage || '-')}</td>
                        <td>${escapeHtml(m.frequency || '-')}</td>
                        <td>${escapeHtml(m.duration || '-')}</td>
                        <td style="color: #2563eb;">${escapeHtml(m.instructions || '-')}</td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
              : ''
          }

          ${
            adviceText
              ? `
              <div class="section">
                <div class="section-title">Special Advice / Clinical Instructions</div>
                <div style="color: #334155;">${escapeHtml(adviceText)}</div>
              </div>
            `
              : ''
          }

          <div class="footer">
            <div>
              <p style="margin: 0; font-weight: 600;">Clinic: ${escapeHtml(appt.clinic?.name || 'Dactor Clinic')}</p>
              <p style="margin: 2px 0 0;">Validated via Dactor Electronic Health Record</p>
            </div>
            <div class="signature">
              Doctor's Signature
            </div>
          </div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
    </html>
  `)
  win.document.close()
}

/**
 * Generates an official, printable A4 Clinic Payment & Financial Audit Statement.
 */
export function printClinicPaymentReportPdf(
  clinic: any,
  periodLabel: string,
  summary: {
    netCollection: number
    grossCollected?: number
    onlineAmount: number
    deskAmount: number
    pendingDue: number
    totalPatients: number
    newPatients: number
    followupPatients: number
    platformFee: number
    totalExpenses?: number
    netClinicProfit?: number
  },
  doctorStats: any[] = [],
  logs: any[] = [],
  expenses: any[] = []
): void {
  const win = window.open('', '_blank', 'width=900,height=800')
  if (!win) return

  const clinicName = clinic?.name || 'Dactor Certified Healthcare Center'
  const clinicAddress = clinic?.addressText || 'Nepal Healthcare Operations'
  const panNo = clinic?.panNumber ? `PAN: ${clinic.panNumber}` : ''
  const phone = clinic?.contactPhone ? `Phone: ${clinic.contactPhone}` : ''

  const gross = summary.grossCollected !== undefined ? summary.grossCollected : summary.netCollection
  const totalExpenses = summary.totalExpenses !== undefined
    ? summary.totalExpenses
    : expenses.reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0)
  const deskCommission = summary.platformFee || 0
  const netProfit = summary.netClinicProfit !== undefined
    ? summary.netClinicProfit
    : (gross - deskCommission - totalExpenses)

  const doctorRowsHtml = doctorStats
    .map(
      (doc, i) => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:11px;">${i + 1}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:11px;"><strong>${escapeHtml(doc.doctorName)}</strong><br><span style="color:#64748b;font-size:10px;">${escapeHtml(doc.specialty)}</span></td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:11px;text-align:center;"><span style="background:#dcfce7;color:#15803d;padding:2px 6px;border-radius:6px;font-weight:700;">${doc.newPatientsCount}</span></td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:11px;text-align:center;">${doc.followupPatientsCount}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:11px;text-align:center;font-weight:700;">${doc.totalPatientsCount}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:11px;text-align:right;">Rs. ${doc.consultationRevenue.toLocaleString()}</td>
      <td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:11px;text-align:right;font-weight:700;color:#0f172a;">Rs. ${doc.totalRevenue.toLocaleString()}</td>
    </tr>`
    )
    .join('')

  const topLogs = logs.slice(0, 100)
  const logRowsHtml = topLogs
    .map(
      (l, idx) => `
    <tr>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;">${idx + 1}</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;">${escapeHtml(l.date)} ${escapeHtml(l.time)}</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;"><strong>${escapeHtml(l.patientName)}</strong><br><span style="color:#64748b;">${escapeHtml(l.trackingCode)}</span></td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;">${escapeHtml(l.doctorName || 'N/A')}</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:center;">${l.isNewPatientForDoctor ? '<span style="color:#15803d;font-weight:700;">NEW</span>' : '<span style="color:#0284c7;">FOL-UP</span>'}</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;">${escapeHtml(l.paymentMethod)}</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:right;font-weight:700;">Rs. ${l.amount.toLocaleString()}</td>
    </tr>`
    )
    .join('')

  const expensesRowsHtml = (expenses || [])
    .map(
      (exp, idx) => `
    <tr>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;">${idx + 1}</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;">${escapeHtml(exp.expense_date)} ${escapeHtml(exp.expense_time || '')}</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;"><strong>${escapeHtml(exp.title)}</strong><br><span style="color:#64748b;">${escapeHtml(exp.voucher_number || '')}</span></td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;">${escapeHtml(exp.category)}</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;">${escapeHtml(exp.payment_method)}</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:right;font-weight:700;color:#e11d48;">- Rs. ${Number(exp.amount || 0).toLocaleString()}</td>
    </tr>`
    )
    .join('')

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Payment & Financial Audit Statement - ${escapeHtml(clinicName)}</title>
        <style>
          @page { size: A4; margin: 15mm 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; color: #0f172a; line-height: 1.4; }
          .header { border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
          .title { font-size: 20px; font-weight: 800; color: #0f766e; margin: 0; }
          .sub { font-size: 11px; color: #475569; margin: 2px 0 0; }
          .meta-box { text-align: right; font-size: 11px; color: #334155; }
          .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
          .kpi-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; text-align: center; }
          .kpi-title { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
          .kpi-val { font-size: 16px; font-weight: 800; color: #0f172a; }
          .section-title { font-size: 13px; font-weight: 700; color: #0f766e; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 18px 0 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th { background: #f1f5f9; color: #334155; font-size: 10px; text-transform: uppercase; padding: 6px 8px; border: 1px solid #cbd5e1; }
          .footer { margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${escapeHtml(clinicName)}</div>
            <div class="sub">${escapeHtml(clinicAddress)}</div>
            <div class="sub">${escapeHtml(phone)} ${escapeHtml(panNo)}</div>
          </div>
          <div class="meta-box">
            <div style="font-weight:700;font-size:12px;color:#0f766e;">OFFICIAL FINANCIAL STATEMENT</div>
            <div><strong>Period:</strong> ${escapeHtml(periodLabel)}</div>
            <div><strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">New: +${summary.newPatients} • Free Follow-ups: ${summary.followupPatients}</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-title">Gross Collections</div>
            <div class="kpi-val" style="color:#0f766e;">Rs. ${gross.toLocaleString()}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Clinic Expenses</div>
            <div class="kpi-val" style="color:${totalExpenses > 0 ? '#e11d48' : '#0f172a'};">Rs. ${totalExpenses.toLocaleString()}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Desk Commission</div>
            <div class="kpi-val" style="color:#334155;">Rs. ${deskCommission.toLocaleString()}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Net Clinic Profit</div>
            <div class="kpi-val" style="color:#0f766e;font-weight:900;">Rs. ${netProfit.toLocaleString()}</div>
          </div>
        </div>

        ${
          doctorStats.length > 0
            ? `
          <div class="section-title">Doctor Consultation & New Patient Growth Breakdown</div>
          <table>
            <thead>
              <tr>
                <th style="width:30px;">#</th>
                <th style="text-align:left;">Doctor & Specialty</th>
                <th>New Seen</th>
                <th>Follow-up</th>
                <th>Total Seen</th>
                <th style="text-align:right;">Consultation Fee</th>
                <th style="text-align:right;">Total Revenue</th>
              </tr>
            </thead>
            <tbody>
              ${doctorRowsHtml}
            </tbody>
          </table>
        `
            : ''
        }

        ${
          expenses.length > 0
            ? `
          <div class="section-title">Clinic Expenses Log (${expenses.length} Records)</div>
          <table>
            <thead>
              <tr>
                <th style="width:25px;">#</th>
                <th>Date & Time</th>
                <th>Title & Ref</th>
                <th>Category</th>
                <th>Payment Method</th>
                <th style="text-align:right;">Amount (NPR)</th>
              </tr>
            </thead>
            <tbody>
              ${expensesRowsHtml}
            </tbody>
          </table>
        `
            : ''
        }

        <div class="section-title">Itemized Payment & Receipt Log (${logs.length} Transactions)</div>
        <table>
          <thead>
            <tr>
              <th style="width:25px;">#</th>
              <th>Date & Time</th>
              <th>Patient & Code</th>
              <th>Doctor</th>
              <th>Type</th>
              <th>Method</th>
              <th style="text-align:right;">Amount (NPR)</th>
            </tr>
          </thead>
          <tbody>
            ${logRowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>Generated by Dactor Platform • System Verified Audit Copy • Pay-at-Desk Commission Accrual: Rs. ${deskCommission.toLocaleString()}</div>
          <div>Authorized Clinic Accountant / Manager Sign: _____________________</div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
    </html>
  `)
  win.document.close()
}
