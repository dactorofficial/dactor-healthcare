export interface Clinic {
  id: string
  name: string
  type?: string // polyclinic, diagnostic_lab, opd_clinic, single_visit, multi_visit, etc.
  verificationStatus?: string // approved, pending, rejected
  contactPhone?: string
  contactEmail?: string
  addressText?: string
  latitude?: number
  longitude?: number
  geohash?: string
  distanceKm?: number
  city?: string
  autoNotifyThreshold?: number
  description?: string
  panNumber?: string
  managerPhone?: string
  registrationDocUrl?: string
  pictures?: string[]
  specialties?: string[]
  createdAt?: string
  updatedAt?: string
  isArchived?: boolean
  archivedAt?: string
  deletionScheduledAt?: string
  logoUrl?: string
  photoUrl?: string
  isOnBreak?: boolean
  breakUpdatedAt?: string
  weeklyScheduleJson?: string
  declaredHolidays?: string[]
  avgConsultationTimeMinutes?: number
  averageConsultationMinutes?: number
  manualAvgConsultationTimeMinutes?: number
  calculatedAvgConsultationTimeMinutes?: number
  avgTimeMode?: string
  // Subscription & Activation fields
  isActivated?: boolean
  activationExpiresAt?: string
  activationPlan?: string
  activationPaidAmount?: number
  activationNotes?: string
  activationPaymentProofUrl?: string
  // Payment Gateway Config fields
  paymentGatewayProvider?: string
  paymentApiKey?: string
  paymentSecretKey?: string
  merchantId?: string
  isDirectPaymentEnabled?: boolean
}

export interface ClinicInvitation {
  id: string
  clinicId: string
  clinicName?: string
  doctorId?: string
  email?: string
  invitedEmail: string
  invitedName: string
  role: 'doctor' | 'lab_technician'
  specialty?: string
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  createdAt: string
}

export interface DayScheduleInfo {
  day: string
  isOpen: boolean
  openTime: string
  closeTime: string
  hasBreak: boolean
  breakStart: string
  breakEnd: string
}

export interface Doctor {
  id: string
  fullName: string
  email: string
  specialty?: string
  specialties?: string[]
  education?: string
  nmcLicenseNumber?: string
  experienceYears?: number
  startingPracticingYear?: number
  gender?: string
  age?: number
  personalMobileNumber?: string
  publicMobileNumber?: string
  consultationFee?: number
  isInClinic?: boolean
  clinicId?: string
  activeClinicId?: string
  primaryClinicId?: string
  kycStatus?: string // approved, pending, rejected
  profilePictureUrl?: string
  licenseDocUrl?: string
  certificatesDocUrl?: string
  description?: string
  bio?: string
  practitionerRole?: string // doctor or lab_technician
  isLabTechnician?: boolean
  practicingClinics?: Clinic[]
  isArchived?: boolean
  archivedAt?: string
  deletionScheduledAt?: string
}

export interface DoctorHomeItem {
  doctor: Doctor
  practicingClinics: Clinic[]
  hasDocInClinic: boolean
}

export interface Slot {
  id: string
  clinicId: string
  doctorId?: string | null
  slotDate: string
  startTime: string
  endTime: string
  maxCapacity: number
  bookedCount: number
  isAvailable?: boolean
  isBreak?: boolean
  isPublished?: boolean
}

export interface MultiSlotPositionResult {
  cumulativePosition: number
  patientsAheadInDay: number
  positionInSlot: number
  slotStartTimeText: string
  slotEndTimeText: string
  approxAppointmentTimeText: string
  timeWindowText: string
  dateLabel: string
  isToday: boolean
  isTomorrow: boolean
  isFutureDate: boolean
}

export interface ClinicService {
  id: string
  clinicId: string
  serviceName: string
  price: number
  category?: string
  description?: string
  isAvailable?: boolean
}

export interface Appointment {
  id: string
  trackingCode10Digit: string
  userId?: string | null
  clinicId: string
  doctorId?: string | null
  slotId?: string | null
  patientName: string
  patientAge?: number | null
  patientGender?: string | null
  patientMobile?: string | null
  patientEmail?: string | null
  appointmentDate: string
  appointmentTime: string
  checkinStatus: string // booked, waiting, in_consultation, completed, cancelled, no_show
  paymentStatus: string // unpaid, paid, partial
  paymentMethod?: string
  feeAmount: number
  queueNumber?: number
  queuePosition?: number
  notes?: string
  isWalkin?: boolean
  optInEarlyCall?: boolean
  createdAt?: string
  updatedAt?: string
  selectedTests?: string[]
  selectedLabTests?: string[] | string
  // Pay at Desk properties
  paymentMode?: string
  status?: string // WAITING_FOR_APPROVAL, APPROVED, UNAPPROVED, EXPIRED
  attemptNumber?: number
  serviceChargeAmount?: number
  totalAmount?: number
  expiresAt?: string | null
  approvedAt?: string | null
  rejectedAt?: string | null
  // Joined fields for display
  clinic?: Clinic
  doctor?: Doctor
}

// Configurable constant for Pay at Desk service charge (Spec Rule 1)
export const PAY_AT_DESK_SERVICE_CHARGE_PERCENT = 5


export interface LabReport {
  id: string
  appointmentId?: string
  trackingCode10Digit: string
  patientName: string
  clinicId: string
  testName: string
  reportFileUrl?: string
  reportFileType?: string // pdf, image
  status: 'sample_collected' | 'processing' | 'prepared' | 'delivered'
  uploadedAt?: string
  sampleCollectedAt?: string
  preparedAt?: string
  technicianNotes?: string
}

export interface DactorNotification {
  id: string
  userId?: string
  clinicId?: string
  title: string
  message: string
  type: string // queue_update, lab_report, appointment_reminder, clinic_broadcast
  metaJson?: string
  isRead: boolean
  createdAt: string
  // Parsed template metadata
  leftLabel?: string
  leftValue?: string
  rightLabel?: string
  rightValue?: string
  trackingCode?: string
}

export interface MedicalSpecialty {
  id: string
  name: string
  description?: string
  iconName?: string
}

export interface MedicalQualification {
  id: string
  degreeName: string
  fullTitle?: string
}

export interface BillingInvoice {
  id: string
  appointmentId: string
  clinicId: string
  totalAmount: number
  paidAmount: number
  balanceDue: number
  paymentStatus: string // paid, partial, unpaid
  paidAt?: string
  remarks?: string
  receiptUrl?: string
  items?: { id?: string; itemName?: string; name?: string; quantity: number; price: number; total?: number }[]
  createdAt?: string
  updatedAt?: string
}

export interface QueueEntry {
  id: string
  appointmentId: string
  clinicId: string
  doctorId?: string
  queuePosition: number
  status: string // waiting, inside, completed, no_show
  calledAt?: string
  insideAt?: string
  completedAt?: string
}

export interface PatientProfile {
  id: string
  authUid?: string
  email: string
  fullName?: string
  role?: string
  phone?: string
  gender?: string
  age?: number
  city?: string
  photoUrl?: string
  isArchived?: boolean
  archivedAt?: string
  deletionScheduledAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface PatientTransactionRecord {
  id: string
  appointmentId: string
  trackingCode: string
  clinicName: string
  doctorName: string
  patientName: string
  appointmentDate: string
  appointmentTime: string
  amount: number
  paymentStatus: string // "paid", "failed", "pending", "bypassed", "free"
  paymentMethod: string // "esewa", "khalti", "fonepay", "connectips", "bypass", "cash"
  transactionId: string
  createdAt: string
}

export type OnlineGatewayId = 'esewa' | 'khalti' | 'fonepay' | 'connectips'

export interface PublicPaymentMethod {
  id: OnlineGatewayId | 'pay_at_desk'
  name: string
  subtitle?: string
  environment?: 'test' | 'live' | string
  merchant_display_id?: string
  is_verified: boolean
  requires_keys?: boolean
  requires_desk_approval?: boolean
}

export interface ClinicGatewaySetupStatus {
  is_direct_payment_enabled: boolean
  callbackBaseUrl?: string
  esewa: {
    enabled: boolean
    is_verified: boolean
    verified_at?: string | null
    environment: 'test' | 'live'
    merchant_id: string
    has_secret_key: boolean
  }
  khalti: {
    enabled: boolean
    is_verified: boolean
    verified_at?: string | null
    environment: 'test' | 'live'
    public_key: string
    has_secret_key: boolean
  }
  fonepay: {
    enabled: boolean
    is_verified: boolean
    verified_at?: string | null
    environment: 'test' | 'live'
    merchant_code: string
    username: string
    has_secret_key: boolean
    has_password: boolean
  }
  connectips: {
    enabled: boolean
    is_verified: boolean
    verified_at?: string | null
    environment: 'test' | 'live'
    merchant_id: string
    app_id: string
    app_name: string
    has_app_password: boolean
    has_private_key: boolean
  }
}

export interface GatewayCredentialItem {
  id: string
  title: string
  subtitle?: string
  accountIdentifier: string
  merchantCode?: string
  merchant_id?: string
  qrImageUrl?: string
  testBypassEnabled?: boolean
  isEnabled: boolean
  enabled?: boolean
  is_verified?: boolean
  environment?: string
}

export interface PaymentGatewaysConfig {
  esewa?: GatewayCredentialItem
  khalti?: GatewayCredentialItem
  fonepay?: GatewayCredentialItem
  connectips?: GatewayCredentialItem
  directBank?: GatewayCredentialItem
  availableMethods?: PublicPaymentMethod[]
  testBypassAllowed?: boolean
}

export interface SupportTicket {
  id: string
  ticketCode: string
  name?: string
  email: string
  phone: string
  role: 'clinic' | 'doctor' | 'patient' | 'other'
  category: string
  customReason?: string
  message?: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  createdAt: string
  resolvedAt?: string
  adminNotes?: string
}

export interface CityLocation {
  id: string
  name: string
  coordinates?: string
  aliases?: string
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}
