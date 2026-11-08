export type ClinicType = 'single_visit' | 'multi_visit' | 'diagnostic_lab'
export type VerificationStatus = 'pending' | 'approved' | 'rejected'
export type KycStatus = 'pending' | 'approved' | 'rejected'
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'not_required'
export type CheckinStatus = 'not_checked_in' | 'checked_in'
export type QueueStatus = 'waiting' | 'inside' | 'done' | 'no_show' | 'sample_collected' | 'processing' | 'report_prepared'
export type LabStage = 'sample_collected' | 'processing' | 'prepared'
export type UserRole = 'patient' | 'doctor' | 'clinic_admin' | 'super_admin' | 'lab_technician'
export type TargetAudience = 'all_users' | 'all_doctors' | 'all_clinics' | 'specific'

export interface Profile {
  id: string
  auth_uid?: string
  full_name: string
  email: string
  role: UserRole
  phone?: string
  gender?: string
  age?: number
  is_archived?: boolean
  archived_at?: string | null
  deletion_scheduled_at?: string | null
  created_at: string
  updated_at?: string
}

export interface Clinic {
  id: string
  name: string
  type: ClinicType
  address_text: string
  contact_phone: string
  contact_email: string
  latitude: number
  longitude: number
  geohash?: string
  verification_status: VerificationStatus
  auto_notify_threshold: number
  description?: string
  logo_url?: string
  registration_doc_url?: string
  pan_number?: string
  manager_phone?: string
  pictures?: string[]
  specialties?: string[]
  is_archived?: boolean
  archived_at?: string | null
  deletion_scheduled_at?: string | null
  payment_gateway_provider?: string
  payment_api_key?: string
  payment_secret_key?: string
  merchant_id?: string
  is_direct_payment_enabled?: boolean
  is_activated?: boolean
  activation_expires_at?: string | null
  activation_plan?: string
  activation_paid_amount?: number
  activation_notes?: string | null
  activation_payment_proof_url?: string | null
  created_at: string
  updated_at?: string
}

export interface ClinicService {
  id: string
  clinic_id: string
  service_name: string
  description?: string
  price: number
  created_at: string
}

export interface Doctor {
  id: string
  user_id?: string
  clinic_id?: string
  full_name: string
  email: string
  gender?: string
  age?: number
  starting_practicing_year?: number
  profile_picture_url?: string
  specialty: string
  specialties?: string[]
  education?: string
  nmc_license_number: string
  personal_mobile_number?: string
  public_mobile_number?: string
  description?: string
  license_doc_url?: string
  certificates_doc_url?: string
  kyc_status: KycStatus
  is_in_clinic: boolean
  consultation_fee: number
  created_at: string
  updated_at?: string
  clinic?: Clinic
}

export interface Slot {
  id: string
  clinic_id: string
  doctor_id: string
  slot_date: string
  start_time: string
  end_time: string
  max_capacity: number
  booked_count: number
  is_published: boolean
  created_at: string
}

export interface Appointment {
  id: string
  tracking_code_10_digit: string
  slot_id?: string
  clinic_id: string
  doctor_id?: string
  user_id?: string
  patient_name: string
  patient_age: number
  patient_gender: string
  patient_mobile: string
  patient_email?: string
  payment_status: PaymentStatus
  checkin_status: CheckinStatus
  appointment_date: string
  appointment_time: string
  fee_amount: number
  is_walkin: boolean
  created_at: string
}

export interface QueueEntry {
  id: string
  appointment_id: string
  clinic_id: string
  doctor_id?: string
  queue_position: number
  status: QueueStatus
  called_at?: string
  inside_at?: string
  completed_at?: string
  created_at: string
}

export interface CatalogItem {
  id: string
  clinic_id: string
  item_name: string
  category: string
  price: number
  created_at: string
}

export interface BillingInvoice {
  id: string
  appointment_id: string
  clinic_id: string
  items: any[]
  total_amount: number
  paid_amount: number
  balance_due: number
  payment_status: PaymentStatus
  paid_at?: string
  remarks?: string
  created_at: string
}

export interface LabReport {
  id: string
  appointment_id: string
  clinic_id: string
  test_name: string
  stage: LabStage
  file_url?: string
  file_name?: string
  file_type?: string
  patient_name_verification: string
  sample_collected_at: string
  prepared_at?: string
  created_at: string
}

export interface ClinicInvitation {
  id: string
  clinic_id: string
  email: string
  role: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

export interface DactorNotification {
  id: string
  user_id?: string
  appointment_id?: string
  title: string
  message: string
  type: string
  target_audience: TargetAudience
  is_read: boolean
  created_at: string
}

export interface MedicalSpecialty {
  id: string
  name: string
  category: string
  description?: string
  search_keywords: string
  icon?: string
  is_active: boolean
  created_at: string
  updated_at?: string
}

export interface MedicalQualification {
  id: string
  degree_name: string
  level: string
  field_of_study: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at?: string
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
