import { AppLanguage } from './i18n'

export function localizedStatus(status: string | null | undefined, language: AppLanguage): string {
  const isNe = language === 'ne'
  switch (status?.trim()?.toLowerCase()) {
    case 'waiting':
      return isNe ? 'प्रतीक्षारत' : 'Waiting'
    case 'in_consultation':
    case 'in-consultation':
    case 'serving':
      return isNe ? 'परामर्श कक्षमा' : 'In Consultation'
    case 'completed':
    case 'done':
      return isNe ? 'सम्पन्न' : 'Completed'
    case 'cancelled':
    case 'canceled':
      return isNe ? 'रद्द गरिएको' : 'Cancelled'
    case 'no_show':
    case 'no-show':
      return isNe ? 'अनुपस्थित (No-Show)' : 'No-Show'
    case 'pending':
      return isNe ? 'प्रतीक्षारत' : 'Pending'
    case 'approved':
      return isNe ? 'स्वीकृत' : 'Approved'
    case 'rejected':
      return isNe ? 'अस्वीकार गरिएको' : 'Rejected'
    default:
      return status || ''
  }
}

export function localizedPaymentStatus(status: string | null | undefined, language: AppLanguage): string {
  const isNe = language === 'ne'
  switch (status?.trim()?.toLowerCase()) {
    case 'paid':
    case 'completed':
    case 'success':
      return isNe ? 'भुक्तान भइसकेको' : 'Paid'
    case 'pending':
      return isNe ? 'भुक्तानी बाँकी' : 'Pending'
    case 'failed':
      return isNe ? 'असफल भयो' : 'Failed'
    case 'refunded':
      return isNe ? 'फिर्ता गरिएको' : 'Refunded'
    default:
      return status || ''
  }
}

export function localizedPaymentMode(mode: string | null | undefined, language: AppLanguage): string {
  const isNe = language === 'ne'
  switch (mode?.trim()?.toLowerCase()) {
    case 'cash':
      return isNe ? 'नगद (Cash)' : 'Cash at Counter'
    case 'esewa':
      return isNe ? 'ईसेवा (eSewa)' : 'eSewa'
    case 'khalti':
      return isNe ? 'खल्ती (Khalti)' : 'Khalti'
    case 'card':
      return isNe ? 'कार्ड (Card)' : 'Credit / Debit Card'
    case 'pay_at_desk':
    case 'desk':
      return isNe ? 'काउन्टर भुक्तानी (Pay at Desk)' : 'Pay at Desk'
    default:
      return mode || ''
  }
}

export function localizedBookingType(type: string | null | undefined, language: AppLanguage): string {
  const isNe = language === 'ne'
  switch (type?.trim()?.toLowerCase()) {
    case 'walkin':
    case 'walk_in':
    case 'walk-in':
      return isNe ? 'वाक-इन (काउन्टर)' : 'Walk-In'
    case 'online':
    case 'app':
      return isNe ? 'अनलाइन बुकिङ' : 'Online Booking'
    default:
      return type || ''
  }
}

export function localizedDurationMinutes(minutes: number, language: AppLanguage): string {
  return language === 'ne' ? `~ ${minutes} मिनेट` : `~ ${minutes} min`
}

export function formatPrice(amount: number, language: AppLanguage): string {
  const formatted = amount % 1 === 0 ? amount.toString() : amount.toFixed(2)
  const prefix = language === 'ne' ? 'रु. ' : 'Rs. '
  return `${prefix}${formatted}`
}
