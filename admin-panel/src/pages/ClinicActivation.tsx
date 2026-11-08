import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Clinic, ClinicType } from '../lib/types'
import {
  Clock,
  AlertTriangle,
  Send,
  Edit,
  Trash2,
  RotateCcw,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  CreditCard,
  X,
  Save,
  Check,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck
} from 'lucide-react'

interface PatientStats {
  today: number
  week: number
  month: number
  total: number
}

interface GatewayCredentialItem {
  enabled: boolean
  provider_name: string
  environment: 'live' | 'test'
  merchant_id: string
  public_key: string
  secret_key: string
  account_number: string
  callback_url: string
}

interface PaymentGatewaysConfig {
  primary_gateway: 'esewa' | 'khalti' | 'fonepay' | 'connectips' | 'custom'
  esewa: GatewayCredentialItem
  khalti: GatewayCredentialItem
  fonepay: GatewayCredentialItem
  connectips: GatewayCredentialItem
  custom: GatewayCredentialItem
}

const DEFAULT_GATEWAYS_CONFIG: PaymentGatewaysConfig = {
  primary_gateway: 'esewa',
  esewa: {
    enabled: true,
    provider_name: 'eSewa Mobile Wallet',
    environment: 'live',
    merchant_id: '',
    public_key: '',
    secret_key: '',
    account_number: '',
    callback_url: 'https://dactor.np/payment/esewa/callback'
  },
  khalti: {
    enabled: false,
    provider_name: 'Khalti Digital Wallet',
    environment: 'live',
    merchant_id: '',
    public_key: '',
    secret_key: '',
    account_number: '',
    callback_url: 'https://dactor.np/payment/khalti/callback'
  },
  fonepay: {
    enabled: false,
    provider_name: 'Fonepay Dynamic QR',
    environment: 'live',
    merchant_id: '',
    public_key: '',
    secret_key: '',
    account_number: '',
    callback_url: 'https://dactor.np/payment/fonepay/callback'
  },
  connectips: {
    enabled: false,
    provider_name: 'ConnectIPS Direct Bank',
    environment: 'live',
    merchant_id: '',
    public_key: '',
    secret_key: '',
    account_number: '',
    callback_url: 'https://dactor.np/payment/connectips/callback'
  },
  custom: {
    enabled: false,
    provider_name: 'Custom Bank / Merchant API',
    environment: 'live',
    merchant_id: '',
    public_key: '',
    secret_key: '',
    account_number: '',
    callback_url: ''
  }
}

export default function ClinicActivation() {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [patientStats, setPatientStats] = useState<Record<string, PatientStats>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'expiring_soon' | 'expired' | 'archived'>('all')

  // Platform Payment Gateway APIs & Keys (Clinics Pay Admin)
  const [showPlatformPaymentPanel, setShowPlatformPaymentPanel] = useState(false)
  const [platformConfigRowId, setPlatformConfigRowId] = useState<string | null>(null)
  const [platformGateways, setPlatformGateways] = useState<PaymentGatewaysConfig>(DEFAULT_GATEWAYS_CONFIG)
  const [activeGatewayTab, setActiveGatewayTab] = useState<'esewa' | 'khalti' | 'fonepay' | 'connectips' | 'custom'>('esewa')
  const [showPlatformSecret, setShowPlatformSecret] = useState(false)
  const [savingPlatformKeys, setSavingPlatformKeys] = useState(false)
  const [platformKeysMessage, setPlatformKeysMessage] = useState<{ text: string; isError: boolean } | null>(null)

  // Modals state
  const [activeModalClinic, setActiveModalClinic] = useState<Clinic | null>(null)
  const [modalType, setModalType] = useState<'activation' | 'notify' | 'edit_clinic' | 'delete_archive' | null>(null)

  // Activation edit form state
  const [actPlan, setActPlan] = useState<'1_month' | '12_month' | 'custom'>('1_month')
  const [actExpiresAt, setActExpiresAt] = useState<string>('')
  const [actPaidAmount, setActPaidAmount] = useState<string>('1500')
  const [actNotes, setActNotes] = useState<string>('')
  const [actIsEnabled, setActIsEnabled] = useState<boolean>(true)
  const [savingActivation, setSavingActivation] = useState(false)
  const [saveError, setSaveError] = useState<string>('')

  // Notify form state
  const [notifyTitle, setNotifyTitle] = useState('')
  const [notifyMessage, setNotifyMessage] = useState('')
  const [sendingNotification, setSendingNotification] = useState(false)
  const [notifySuccess, setNotifySuccess] = useState(false)

  // Edit clinic form state
  const [editClinicData, setEditClinicData] = useState<Partial<Clinic>>({})
  const [editClinicGateways, setEditClinicGateways] = useState<PaymentGatewaysConfig>(DEFAULT_GATEWAYS_CONFIG)
  const [editClinicGatewayTab, setEditClinicGatewayTab] = useState<'esewa' | 'khalti' | 'fonepay' | 'connectips' | 'custom'>('esewa')
  const [showClinicSecret, setShowClinicSecret] = useState(false)
  const [savingClinic, setSavingClinic] = useState(false)
  const [archivingClinic, setArchivingClinic] = useState(false)

  useEffect(() => {
    fetchClinicsAndStats()
    fetchPlatformPaymentKeys()
  }, [])

  const fetchPlatformPaymentKeys = async () => {
    try {
      const { data } = await supabase
        .from('medical_qualifications')
        .select('*')
        .eq('level', 'PLATFORM_PAYMENT_CONFIG')
        .limit(1)
      const row = data?.[0]
      if (row) {
        setPlatformConfigRowId(row.id)
        if (row.description && row.description.trim().startsWith('{')) {
          const parsed = JSON.parse(row.description)
          setPlatformGateways({
            ...DEFAULT_GATEWAYS_CONFIG,
            ...parsed,
            esewa: { ...DEFAULT_GATEWAYS_CONFIG.esewa, ...(parsed.esewa || {}) },
            khalti: { ...DEFAULT_GATEWAYS_CONFIG.khalti, ...(parsed.khalti || {}) },
            fonepay: { ...DEFAULT_GATEWAYS_CONFIG.fonepay, ...(parsed.fonepay || {}) },
            connectips: { ...DEFAULT_GATEWAYS_CONFIG.connectips, ...(parsed.connectips || {}) },
            custom: { ...DEFAULT_GATEWAYS_CONFIG.custom, ...(parsed.custom || {}) }
          })
        }
      }
    } catch (e) {
      console.error('Error loading platform payment keys:', e)
    }
  }

  const handleSavePlatformPaymentKeys = async () => {
    if (savingPlatformKeys) return
    setSavingPlatformKeys(true)
    setPlatformKeysMessage(null)
    try {
      const serialized = JSON.stringify(platformGateways)
      if (platformConfigRowId) {
        const { error } = await supabase
          .from('medical_qualifications')
          .update({
            degree_name: 'ADMIN_PAYMENT_GATEWAYS',
            level: 'PLATFORM_PAYMENT_CONFIG',
            field_of_study: platformGateways.primary_gateway,
            description: serialized,
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', platformConfigRowId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('medical_qualifications')
          .insert([{
            degree_name: 'ADMIN_PAYMENT_GATEWAYS',
            level: 'PLATFORM_PAYMENT_CONFIG',
            field_of_study: platformGateways.primary_gateway,
            description: serialized,
            is_active: true
          }])
          .select()
          .single()
        if (error) throw error
        if (data?.id) setPlatformConfigRowId(data.id)
      }
      setPlatformKeysMessage({ text: 'Platform Payment Gateway APIs & Keys saved to Supabase! Clinics can now pay you using these keys.', isError: false })
      setTimeout(() => setPlatformKeysMessage(null), 4000)
    } catch (err: any) {
      setPlatformKeysMessage({ text: err?.message || 'Failed to save platform payment keys', isError: true })
    } finally {
      setSavingPlatformKeys(false)
    }
  }

  const updateCurrentPlatformGatewayField = (field: keyof GatewayCredentialItem, value: any) => {
    setPlatformGateways(prev => ({
      ...prev,
      [activeGatewayTab]: {
        ...prev[activeGatewayTab],
        [field]: value
      }
    }))
  }

  const calculateDaysLeft = (expiresAt?: string | null): number => {
    if (!expiresAt) return 0
    try {
      const exp = new Date(expiresAt).getTime()
      const now = new Date().getTime()
      const diff = exp - now
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
      return days > 0 ? days : 0
    } catch {
      return 0
    }
  }

  const fetchClinicsAndStats = async () => {
    try {
      setLoading(true)
      const { data: clinicsData, error } = await supabase
        .from('clinics')
        .select('*')
        .order('name', { ascending: true })

      if (!error && clinicsData) {
        setClinics(clinicsData as Clinic[])

        // Fetch patient count analytics for all clinics
        const { data: apptsData } = await supabase
          .from('appointments')
          .select('id, clinic_id, appointment_date, created_at')

        if (apptsData) {
          const todayStr = new Date().toISOString().slice(0, 10)
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

          const statsMap: Record<string, PatientStats> = {}

          clinicsData.forEach(c => {
            const clinicAppts = apptsData.filter(a => a.clinic_id === c.id)
            statsMap[c.id] = {
              today: clinicAppts.filter(a => a.appointment_date === todayStr).length,
              week: clinicAppts.filter(a => a.appointment_date >= weekAgo).length,
              month: clinicAppts.filter(a => a.appointment_date >= monthAgo).length,
              total: clinicAppts.length
            }
          })
          setPatientStats(statsMap)
        }
      }
    } catch (e) {
      console.error('Error fetching clinics:', e)
    } finally {
      setLoading(false)
    }
  }

  // Open Activation Modal
  const openActivationModal = (clinic: Clinic) => {
    setActiveModalClinic(clinic)
    setModalType('activation')
    setSaveError('')
    setActIsEnabled(true)
    setActPlan('1_month')
    setActPaidAmount('1500')
    setActNotes(clinic.activation_notes || '')

    // Auto-calculate new expiration date (+30 days added)
    const hasValidFutureExpiry = clinic.activation_expires_at && new Date(clinic.activation_expires_at).getTime() > Date.now()
    const baseDate = hasValidFutureExpiry ? new Date(clinic.activation_expires_at!) : new Date()
    const defaultNewExp = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000)
    setActExpiresAt(defaultNewExp.toISOString().slice(0, 10))
  }

  const handleApplyPresetDays = (days: number, planName: '1_month' | '12_month' | 'custom', price: string) => {
    setActPlan(planName)
    setActPaidAmount(price)
    setActIsEnabled(true)
    const hasValidFutureExpiry = activeModalClinic?.activation_expires_at && new Date(activeModalClinic.activation_expires_at).getTime() > Date.now()
    const baseDate = hasValidFutureExpiry ? new Date(activeModalClinic!.activation_expires_at!) : new Date()
    const newDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000)
    setActExpiresAt(newDate.toISOString().slice(0, 10))
  }

  const handleSaveActivation = async () => {
    if (!activeModalClinic) return
    setSavingActivation(true)
    setSaveError('')
    try {
      const expDateStr = actExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const finalExpiresAt = new Date(expDateStr + 'T23:59:59Z').toISOString()
      const updates: any = {
        is_activated: actIsEnabled,
        activation_expires_at: finalExpiresAt,
        activation_plan: actPlan,
        activation_paid_amount: parseFloat(actPaidAmount) || 0,
        activation_notes: actNotes.trim(),
        updated_at: new Date().toISOString()
      }

      // Sync description JSON if it exists to maintain parity with legacy mobile clients
      if (activeModalClinic.description && activeModalClinic.description.trim().startsWith('{')) {
        try {
          const meta = JSON.parse(activeModalClinic.description)
          meta.is_activated = actIsEnabled
          meta.activation_expires_at = finalExpiresAt
          meta.activation_plan = actPlan
          meta.activation_paid_amount = parseFloat(actPaidAmount) || 0
          meta.activation_notes = actNotes.trim()
          updates.description = JSON.stringify(meta)
        } catch (ignored) {}
      }

      const { error: updateError } = await supabase.from('clinics').update(updates).eq('id', activeModalClinic.id)

      if (updateError) {
        console.error('Error updating activation:', updateError)
        setSaveError(updateError.message || 'Failed to update activation')
        return
      }

      setClinics(prev => prev.map(c => c.id === activeModalClinic.id ? { ...c, ...updates } : c))

      // Central financial ledger audit record
      const paidAmt = parseFloat(actPaidAmount) || 0
      if (paidAmt > 0 || actIsEnabled) {
        supabase
          .from('clinic_subscription_payments')
          .insert({
            clinic_id: activeModalClinic.id,
            amount: paidAmt,
            payment_method: 'MANUAL_SUPERADMIN',
            status: actIsEnabled ? 'VERIFIED' : 'PENDING',
            duration_months: actPlan === '12_month' ? 12 : 1,
            notes: actNotes.trim() || `Admin activation renewal: ${actPlan || 'custom'} plan`,
            metadata: {
              admin_action: true,
              expires_at: finalExpiresAt,
              plan: actPlan,
            },
          })
          .then(({ error: logErr }) => {
            if (logErr) console.warn('Could not record subscription payment audit log:', logErr.message)
          })
      }

      setModalType(null)
      setActiveModalClinic(null)
      fetchClinicsAndStats()
    } catch (e: any) {
      console.error('Error updating activation:', e)
      setSaveError(e?.message || 'Unexpected error while saving activation')
    } finally {
      setSavingActivation(false)
    }
  }

  // Open Notify Modal
  const openNotifyModal = (clinic: Clinic) => {
    setActiveModalClinic(clinic)
    setModalType('notify')
    setNotifySuccess(false)
    const days = calculateDaysLeft(clinic.activation_expires_at)
    if (days <= 0) {
      setNotifyTitle(`Subscription Expired: ${clinic.name}`)
      setNotifyMessage(`Notice for ${clinic.name}: Your clinic portal license has expired. Normal OPD bookings and live queues are locked. Please renew with 1 Month (Rs 1,500) or 12 Months (Rs 15,000) to resume operations.`)
    } else if (days <= 7) {
      setNotifyTitle(`License Expiring Soon: ${days} Days Remaining`)
      setNotifyMessage(`Reminder for ${clinic.name}: Your clinic subscription will expire in ${days} days on ${new Date(clinic.activation_expires_at!).toLocaleDateString()}. Please renew promptly to avoid queue interruption.`)
    } else {
      setNotifyTitle(`Clinic License Active: ${clinic.name}`)
      setNotifyMessage(`Your clinic license for ${clinic.name} is active with ${days} days remaining. Thank you for partnering with Dactor Nepal.`)
    }
  }

  const handleSendNotification = async () => {
    if (!activeModalClinic || !notifyTitle.trim() || !notifyMessage.trim()) return
    setSendingNotification(true)
    try {
      const clinicId = activeModalClinic.id
      const cleanTitle = notifyTitle.trim()
      const cleanMessage = notifyMessage.trim()
      const notifsToInsert: any[] = [{
        title: cleanTitle,
        message: cleanMessage,
        type: 'activation_alert',
        target_audience: 'specific',
        user_id: clinicId,
        is_read: false,
        created_at: new Date().toISOString()
      }]

      // Also lookup any associated profiles by clinic contact email / phone so mobile sessions signed in via personal profile also receive it
      const email = activeModalClinic.contact_email?.trim()
      const phone = activeModalClinic.contact_phone?.trim()
      if (email || phone) {
        try {
          const conditions: string[] = []
          if (email) conditions.push(`email.eq.${email}`)
          if (phone) conditions.push(`phone.eq.${phone}`)
          const { data: matchedProfiles } = await supabase
            .from('profiles')
            .select('id')
            .or(conditions.join(','))

          if (matchedProfiles && matchedProfiles.length > 0) {
            for (const prof of matchedProfiles) {
              if (prof.id && prof.id !== clinicId) {
                notifsToInsert.push({
                  title: cleanTitle,
                  message: cleanMessage,
                  type: 'activation_alert',
                  target_audience: 'specific',
                  user_id: prof.id,
                  is_read: false,
                  created_at: new Date().toISOString()
                })
              }
            }
          }
        } catch (profileErr) {
          console.warn('Profile lookup for clinic notification:', profileErr)
        }
      }

      await supabase.from('notifications').insert(notifsToInsert)
      setNotifySuccess(true)
      setTimeout(() => {
        setModalType(null)
        setActiveModalClinic(null)
        setNotifySuccess(false)
      }, 1500)
    } catch (e) {
      console.error('Error sending notification:', e)
    } finally {
      setSendingNotification(false)
    }
  }

  // Open Edit Clinic Modal
  const openEditClinicModal = (clinic: Clinic) => {
    setActiveModalClinic(clinic)
    let cleanDescription = clinic.description || ''
    let parsedGateways: PaymentGatewaysConfig = {
      ...DEFAULT_GATEWAYS_CONFIG,
      primary_gateway: (clinic.payment_gateway_provider as any) || 'esewa'
    }

    if (clinic.description && clinic.description.trim().startsWith('{')) {
      try {
        const meta = JSON.parse(clinic.description)
        cleanDescription = meta.desc || ''
        if (meta.payment_gateways_json && typeof meta.payment_gateways_json === 'string' && meta.payment_gateways_json.trim().startsWith('{')) {
          const gw = JSON.parse(meta.payment_gateways_json)
          parsedGateways = {
            ...DEFAULT_GATEWAYS_CONFIG,
            ...gw,
            esewa: { ...DEFAULT_GATEWAYS_CONFIG.esewa, ...(gw.esewa || {}) },
            khalti: { ...DEFAULT_GATEWAYS_CONFIG.khalti, ...(gw.khalti || {}) },
            fonepay: { ...DEFAULT_GATEWAYS_CONFIG.fonepay, ...(gw.fonepay || {}) },
            connectips: { ...DEFAULT_GATEWAYS_CONFIG.connectips, ...(gw.connectips || {}) },
            custom: { ...DEFAULT_GATEWAYS_CONFIG.custom, ...(gw.custom || {}) }
          }
        } else {
          const prov = ((meta.payment_gateway_provider || clinic.payment_gateway_provider || 'esewa') as 'esewa' | 'khalti' | 'fonepay' | 'connectips' | 'custom')
          parsedGateways = {
            ...DEFAULT_GATEWAYS_CONFIG,
            primary_gateway: prov,
            [prov]: {
              ...DEFAULT_GATEWAYS_CONFIG[prov],
              enabled: true,
              merchant_id: meta.merchant_id || clinic.merchant_id || '',
              public_key: meta.payment_api_key || clinic.payment_api_key || '',
              secret_key: meta.payment_secret_key || clinic.payment_secret_key || ''
            }
          }
        }
        setEditClinicData({
          ...clinic,
          description: cleanDescription,
          is_direct_payment_enabled: meta.is_direct_payment_enabled ?? clinic.is_direct_payment_enabled ?? false,
          payment_gateway_provider: meta.payment_gateway_provider || clinic.payment_gateway_provider || 'esewa'
        })
      } catch {
        setEditClinicData({ ...clinic })
      }
    } else {
      const prov = ((clinic.payment_gateway_provider || 'esewa') as 'esewa' | 'khalti' | 'fonepay' | 'connectips' | 'custom')
      parsedGateways = {
        ...DEFAULT_GATEWAYS_CONFIG,
        primary_gateway: prov,
        [prov]: {
          ...DEFAULT_GATEWAYS_CONFIG[prov],
          enabled: true,
          merchant_id: clinic.merchant_id || '',
          public_key: clinic.payment_api_key || '',
          secret_key: clinic.payment_secret_key || ''
        }
      }
      setEditClinicData({ ...clinic })
    }

    setEditClinicGateways(parsedGateways)
    setEditClinicGatewayTab(parsedGateways.primary_gateway || 'esewa')
    setModalType('edit_clinic')
  }

  const updateCurrentClinicGatewayField = (field: keyof GatewayCredentialItem, value: any) => {
    setEditClinicGateways(prev => ({
      ...prev,
      [editClinicGatewayTab]: {
        ...prev[editClinicGatewayTab],
        [field]: value
      }
    }))
  }

  const handleSaveFullClinic = async () => {
    if (!activeModalClinic || savingClinic) return
    setSavingClinic(true)
    try {
      const primaryProv = editClinicGateways.primary_gateway || 'esewa'
      const primaryItem = editClinicGateways[primaryProv]
      const gatewaysJsonStr = JSON.stringify(editClinicGateways)

      let packedDescription = editClinicData.description || ''
      try {
        const existingMeta = activeModalClinic.description && activeModalClinic.description.trim().startsWith('{')
          ? JSON.parse(activeModalClinic.description)
          : {}
        const updatedMeta = {
          ...existingMeta,
          desc: editClinicData.description || '',
          pan_number: editClinicData.pan_number || existingMeta.pan_number,
          manager_phone: editClinicData.manager_phone || existingMeta.manager_phone,
          is_activated: editClinicData.is_activated ?? existingMeta.is_activated ?? true,
          activation_expires_at: editClinicData.activation_expires_at || existingMeta.activation_expires_at,
          is_direct_payment_enabled: editClinicData.is_direct_payment_enabled ?? false,
          payment_gateway_provider: primaryProv,
          merchant_id: primaryItem.merchant_id || null,
          payment_api_key: primaryItem.public_key || null,
          payment_secret_key: primaryItem.secret_key || null,
          payment_gateways_json: gatewaysJsonStr
        }
        packedDescription = JSON.stringify(updatedMeta)
      } catch {
        packedDescription = editClinicData.description || ''
      }

      const updatePayload: any = {
        name: editClinicData.name,
        type: editClinicData.type,
        address_text: editClinicData.address_text,
        contact_phone: editClinicData.contact_phone,
        contact_email: editClinicData.contact_email,
        pan_number: editClinicData.pan_number,
        manager_phone: editClinicData.manager_phone,
        latitude: editClinicData.latitude,
        longitude: editClinicData.longitude,
        auto_notify_threshold: editClinicData.auto_notify_threshold,
        description: packedDescription,
        is_activated: editClinicData.is_activated,
        activation_expires_at: editClinicData.activation_expires_at,
        is_direct_payment_enabled: editClinicData.is_direct_payment_enabled ?? false,
        payment_gateway_provider: primaryProv,
        merchant_id: primaryItem.merchant_id || null,
        payment_api_key: primaryItem.public_key || null,
        payment_secret_key: primaryItem.secret_key || null,
        updated_at: new Date().toISOString()
      }

      const { error: editError } = await supabase.from('clinics').update(updatePayload).eq('id', activeModalClinic.id)

      if (editError) {
        console.error('Error editing clinic:', editError)
        alert('Failed to save clinic changes: ' + editError.message)
        return
      }

      setClinics(prev => prev.map(c => c.id === activeModalClinic.id ? { ...c, ...updatePayload } as Clinic : c))
      setModalType(null)
      setActiveModalClinic(null)
    } catch (e) {
      console.error('Error editing clinic:', e)
    } finally {
      setSavingClinic(false)
    }
  }

  // Delete Clinic (30-Day Archive)
  const openDeleteArchiveModal = (clinic: Clinic) => {
    setActiveModalClinic(clinic)
    setModalType('delete_archive')
  }

  const handleConfirmArchiveDeletion = async () => {
    if (!activeModalClinic || archivingClinic) return
    setArchivingClinic(true)
    try {
      const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const updates = {
        is_archived: true,
        archived_at: new Date().toISOString(),
        deletion_scheduled_at: scheduledDate,
        updated_at: new Date().toISOString()
      }
      await supabase.from('clinics').update(updates).eq('id', activeModalClinic.id)
      setClinics(prev => prev.map(c => c.id === activeModalClinic.id ? { ...c, ...updates } : c))
      setModalType(null)
      setActiveModalClinic(null)
    } catch (e) {
      console.error('Error archiving clinic:', e)
    } finally {
      setArchivingClinic(false)
    }
  }

  const handleRestoreClinic = async (clinic: Clinic) => {
    try {
      const updates = {
        is_archived: false,
        archived_at: null,
        deletion_scheduled_at: null,
        updated_at: new Date().toISOString()
      }
      await supabase.from('clinics').update(updates).eq('id', clinic.id)
      setClinics(prev => prev.map(c => c.id === clinic.id ? { ...c, ...updates } : c))
    } catch (e) {
      console.error('Error restoring clinic:', e)
    }
  }

  // Filtered List
  const filteredClinics = clinics.filter(clinic => {
    const matchesSearch =
      clinic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clinic.address_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clinic.contact_phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (clinic.pan_number || '').includes(searchQuery)

    if (!matchesSearch) return false

    const daysLeft = calculateDaysLeft(clinic.activation_expires_at)
    const isAct = clinic.is_activated !== false && daysLeft > 0

    if (filterTab === 'active') return isAct && !clinic.is_archived
    if (filterTab === 'expiring_soon') return isAct && daysLeft <= 7 && !clinic.is_archived
    if (filterTab === 'expired') return (!isAct || daysLeft <= 0) && !clinic.is_archived
    if (filterTab === 'archived') return clinic.is_archived === true
    return true
  })

  // Counters
  const totalCount = clinics.length
  const activeCount = clinics.filter(c => !c.is_archived && c.is_activated !== false && calculateDaysLeft(c.activation_expires_at) > 0).length
  const expiringSoonCount = clinics.filter(c => !c.is_archived && c.is_activated !== false && calculateDaysLeft(c.activation_expires_at) <= 7 && calculateDaysLeft(c.activation_expires_at) > 0).length
  const expiredCount = clinics.filter(c => !c.is_archived && (c.is_activated === false || calculateDaysLeft(c.activation_expires_at) <= 0)).length
  const archivedCount = clinics.filter(c => c.is_archived === true).length

  const currentPlatformGw = platformGateways[activeGatewayTab]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <CreditCard className="w-6 h-6 text-indigo-400" />
            Clinic Activation & Subscription Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Monitor clinic portal validity, configure Platform Payment Gateway APIs/Keys so clinics can pay you, and manage clinic licenses.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowPlatformPaymentPanel(prev => !prev)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2 shrink-0"
        >
          <KeyRound className="w-4 h-4" />
          {showPlatformPaymentPanel ? 'Hide Platform Payment APIs & Keys' : 'Platform Payment APIs & Keys (Clinics Pay Admin)'}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* PLATFORM PAYMENT GATEWAY APIs & KEYS PANEL (CLINICS PAY ADMIN)            */}
      {/* ========================================================================= */}
      {showPlatformPaymentPanel && (
        <div className="bg-slate-800 border border-indigo-500/40 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-700 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Admin / Platform Payment Gateway APIs & Keys (For Clinic Subscription Payments)
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter your real eSewa, Khalti, Fonepay, ConnectIPS, or Custom Bank API keys. Clinics use these configured credentials in the Clinic App to pay you for 1-Month / 12-Month portal activation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Primary Gateway:</span>
              <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {platformGateways.primary_gateway}
              </span>
            </div>
          </div>

          {platformKeysMessage && (
            <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
              platformKeysMessage.isError
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}>
              {platformKeysMessage.isError ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>{platformKeysMessage.text}</span>
            </div>
          )}

          {/* Gateway Selector Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: 'esewa', label: 'eSewa Wallet' },
              { id: 'khalti', label: 'Khalti Digital Wallet' },
              { id: 'fonepay', label: 'Fonepay Dynamic QR' },
              { id: 'connectips', label: 'ConnectIPS Bank' },
              { id: 'custom', label: 'Custom / Bank API' }
            ] as const).map(tab => {
              const gw = platformGateways[tab.id]
              const isSelected = activeGatewayTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveGatewayTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <span>{tab.label}</span>
                  {gw.enabled && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" title="Enabled" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Active Gateway Credentials Form */}
          <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentPlatformGw.enabled}
                  onChange={e => updateCurrentPlatformGatewayField('enabled', e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-bold text-white">
                  Enable {activeGatewayTab.toUpperCase()} for Clinic Subscription Payments
                </span>
              </label>

              <div className="flex items-center gap-3">
                <select
                  value={currentPlatformGw.environment}
                  onChange={e => updateCurrentPlatformGatewayField('environment', e.target.value as 'live' | 'test')}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-semibold"
                >
                  <option value="live">LIVE (Production Mode)</option>
                  <option value="test">TEST (Sandbox Mode)</option>
                </select>

                <button
                  type="button"
                  onClick={() => setPlatformGateways(prev => ({ ...prev, primary_gateway: activeGatewayTab }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    platformGateways.primary_gateway === activeGatewayTab
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  {platformGateways.primary_gateway === activeGatewayTab ? '✓ Primary Default' : 'Set as Primary'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Merchant ID / Product Code (SCD / PID)
                </label>
                <input
                  type="text"
                  value={currentPlatformGw.merchant_id}
                  onChange={e => updateCurrentPlatformGatewayField('merchant_id', e.target.value)}
                  placeholder={activeGatewayTab === 'esewa' ? 'e.g. EPAYTEST or live merchant code' : 'Merchant ID / Code'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  API Public Key / Client ID / App ID
                </label>
                <input
                  type="text"
                  value={currentPlatformGw.public_key}
                  onChange={e => updateCurrentPlatformGatewayField('public_key', e.target.value)}
                  placeholder={activeGatewayTab === 'khalti' ? 'live_public_key_...' : 'Public API Key / Client ID'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  API Secret Key / Private HMAC Key
                </label>
                <div className="relative">
                  <input
                    type={showPlatformSecret ? 'text' : 'password'}
                    value={currentPlatformGw.secret_key}
                    onChange={e => updateCurrentPlatformGatewayField('secret_key', e.target.value)}
                    placeholder="Secret Key / HMAC Hash Key"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-3.5 pr-9 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPlatformSecret(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPlatformSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Settlement Bank Account / Terminal ID
                </label>
                <input
                  type="text"
                  value={currentPlatformGw.account_number}
                  onChange={e => updateCurrentPlatformGatewayField('account_number', e.target.value)}
                  placeholder="Account No / Fonepay Terminal / IBAN"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Payment Callback / Webhook / Checkout Endpoint URL
                </label>
                <input
                  type="text"
                  value={currentPlatformGw.callback_url}
                  onChange={e => updateCurrentPlatformGatewayField('callback_url', e.target.value)}
                  placeholder="https://dactor.np/payment/callback"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={handleSavePlatformPaymentKeys}
                disabled={savingPlatformKeys}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-2 shadow-md"
              >
                <Save className="w-4 h-4" />
                {savingPlatformKeys ? 'Saving to Supabase...' : 'Save Platform Payment APIs & Keys'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Enlisted</div>
          <div className="text-2xl font-black text-white mt-1">{totalCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Registered healthcare facilities</div>
        </div>

        <div className="bg-slate-800 border border-emerald-500/30 p-4 rounded-2xl bg-emerald-500/5">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Active Licenses
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{activeCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Valid & operational licenses</div>
        </div>

        <div className="bg-slate-800 border border-amber-500/30 p-4 rounded-2xl bg-amber-500/5">
          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Expiring Soon
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1">{expiringSoonCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">&le; 7 days left to renew</div>
        </div>

        <div className="bg-slate-800 border border-rose-500/30 p-4 rounded-2xl bg-rose-500/5">
          <div className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Expired / Inactive
          </div>
          <div className="text-2xl font-black text-rose-400 mt-1">{expiredCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Portal operations locked</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-700/80 text-xs font-semibold w-full md:w-auto">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg transition ${filterTab === 'all' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            All Clinics ({totalCount})
          </button>
          <button
            onClick={() => setFilterTab('active')}
            className={`px-3 py-1.5 rounded-lg transition ${filterTab === 'active' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setFilterTab('expiring_soon')}
            className={`px-3 py-1.5 rounded-lg transition ${filterTab === 'expiring_soon' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Expiring Soon ({expiringSoonCount})
          </button>
          <button
            onClick={() => setFilterTab('expired')}
            className={`px-3 py-1.5 rounded-lg transition ${filterTab === 'expired' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Expired ({expiredCount})
          </button>
          <button
            onClick={() => setFilterTab('archived')}
            className={`px-3 py-1.5 rounded-lg transition ${filterTab === 'archived' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            30-Day Archive ({archivedCount})
          </button>
        </div>

        {/* Search Field */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search clinic name, phone, PAN..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Main Clinics Activation Table / Cards */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 bg-slate-800 rounded-2xl border border-slate-700">
          Loading clinic activation rosters and patient statistics...
        </div>
      ) : filteredClinics.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-slate-800 rounded-2xl border border-slate-700">
          No clinics match the current filter or search criteria.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredClinics.map(clinic => {
            const daysLeft = calculateDaysLeft(clinic.activation_expires_at)
            const isAct = clinic.is_activated !== false && daysLeft > 0
            const stats = patientStats[clinic.id] || { today: 0, week: 0, month: 0, total: 0 }

            return (
              <div
                key={clinic.id}
                className={`bg-slate-800 border rounded-2xl p-5 shadow-sm transition hover:border-slate-600 ${
                  clinic.is_archived
                    ? 'border-rose-500/40 bg-rose-950/10'
                    : !isAct
                    ? 'border-rose-500/30'
                    : daysLeft <= 7
                    ? 'border-amber-500/30'
                    : 'border-slate-700'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  {/* Clinic Identification */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-bold text-lg text-white">{clinic.name}</h3>
                      <span className="text-[11px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-slate-700 text-slate-300">
                        {clinic.type.replace('_', ' ')}
                      </span>

                      {/* Activation Status Badge */}
                      {clinic.is_archived ? (
                        <span className="text-xs font-bold px-3 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                          <Trash2 className="w-3.5 h-3.5" /> 30-Day Archive Holding
                        </span>
                      ) : isAct ? (
                        <span
                          className={`text-xs font-bold px-3 py-1 rounded-xl flex items-center gap-1.5 ${
                            daysLeft <= 7
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          {daysLeft} Days Left
                          {daysLeft <= 7 && ' (Expiring Soon)'}
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-3 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Expired / Inactive (0 Days)
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Address: <strong className="text-slate-300">{clinic.address_text}</strong></span>
                      <span>•</span>
                      <span>Phone: <strong className="text-slate-300">{clinic.contact_phone}</strong></span>
                      {clinic.pan_number && (
                        <>
                          <span>•</span>
                          <span>PAN: <strong className="text-slate-300 font-mono">{clinic.pan_number}</strong></span>
                        </>
                      )}
                      <span>•</span>
                      <span>Plan: <strong className="text-indigo-400 uppercase">{clinic.activation_plan?.replace('_', ' ') || '1 Month'}</strong></span>
                      <span>•</span>
                      <span>Expires: <strong className="text-slate-300">{clinic.activation_expires_at ? new Date(clinic.activation_expires_at).toLocaleDateString() : 'N/A'}</strong></span>
                    </div>

                    {clinic.activation_notes && (
                      <div className="text-[11px] bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700/60 text-slate-300 inline-block">
                        <span className="text-slate-400 font-semibold">Payment / Activation Note:</span> {clinic.activation_notes}
                      </div>
                    )}
                  </div>

                  {/* Patient Count Analytics (Today, Week, Month, Total) */}
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700/80 flex items-center gap-4 text-center">
                    <div className="px-2">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Today</div>
                      <div className="text-base font-extrabold text-indigo-400 mt-0.5">{stats.today}</div>
                    </div>
                    <div className="h-7 w-px bg-slate-700" />
                    <div className="px-2">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">In a Week</div>
                      <div className="text-base font-extrabold text-blue-400 mt-0.5">{stats.week}</div>
                    </div>
                    <div className="h-7 w-px bg-slate-700" />
                    <div className="px-2">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">In a Month</div>
                      <div className="text-base font-extrabold text-emerald-400 mt-0.5">{stats.month}</div>
                    </div>
                    <div className="h-7 w-px bg-slate-700" />
                    <div className="px-2">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Patients</div>
                      <div className="text-base font-black text-white mt-0.5">{stats.total}</div>
                    </div>
                  </div>

                  {/* Management Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 justify-end">
                    {/* Add / Edit Activation Button */}
                    <button
                      onClick={() => openActivationModal(clinic)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add / Edit Activation
                    </button>

                    {/* Notify Clinic Button */}
                    <button
                      onClick={() => openNotifyModal(clinic)}
                      className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5 text-indigo-400" /> Notify Clinic
                    </button>

                    {/* Edit Full Clinic Info */}
                    <button
                      onClick={() => openEditClinicModal(clinic)}
                      className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                    >
                      <Edit className="w-3.5 h-3.5 text-slate-300" /> Edit Clinic
                    </button>

                    {/* Delete Clinic (30-Day Archive) or Restore */}
                    {clinic.is_archived ? (
                      <button
                        onClick={() => handleRestoreClinic(clinic)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Restore Clinic
                      </button>
                    ) : (
                      <button
                        onClick={() => openDeleteArchiveModal(clinic)}
                        className="bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete (Archive)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. ADD / EDIT ACTIVATION PERIOD MODAL                                      */}
      {/* ========================================================================= */}
      {modalType === 'activation' && activeModalClinic && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl space-y-4">
            <div className="p-5 border-b border-slate-700 flex items-center justify-between bg-slate-900/80">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                  Add / Edit Activation Period
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{activeModalClinic.name}</p>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {saveError && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs p-3 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{saveError}</span>
                </div>
              )}

              {/* Current Validity vs New Validity Overview */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Current Validity:</span>
                  <span className="font-semibold text-slate-200">
                    {activeModalClinic.activation_expires_at
                      ? `${new Date(activeModalClinic.activation_expires_at).toLocaleDateString()} (${calculateDaysLeft(activeModalClinic.activation_expires_at)} days left)`
                      : 'Expired / Not Activated (0 days)'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                  <span className="text-indigo-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> New Expiry (After Saving):
                  </span>
                  <span className="font-bold text-emerald-400">
                    {actExpiresAt ? new Date(actExpiresAt + 'T23:59:59Z').toLocaleDateString() : 'N/A'} 
                    {' '}({calculateDaysLeft(actExpiresAt ? actExpiresAt + 'T23:59:59Z' : '')} days total)
                  </span>
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-700">
                <div>
                  <div className="text-xs font-bold text-white">License Activation Status</div>
                  <div className="text-[11px] text-slate-400">Controls whether clinic portal and patient bookings are unlocked</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={actIsEnabled}
                    onChange={e => setActIsEnabled(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className={`text-xs font-bold ${actIsEnabled ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {actIsEnabled ? 'Active (Operational)' : 'Disabled / Suspended'}
                  </span>
                </label>
              </div>

              {/* Quick Preset Packages */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Select Period to Add
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleApplyPresetDays(30, '1_month', '1500')}
                    className={`p-3 rounded-xl border text-left transition ${
                      actPlan === '1_month'
                        ? 'border-indigo-500 bg-indigo-600/15 text-white ring-1 ring-indigo-500'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-bold text-xs">+30 Days</div>
                    <div className="text-[11px] text-indigo-400 font-bold mt-0.5">Rs. 1,500</div>
                    <div className="text-[10px] text-slate-400 mt-1">1 Month Plan</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPresetDays(90, 'custom', '4500')}
                    className={`p-3 rounded-xl border text-left transition ${
                      actPlan === 'custom' && actPaidAmount === '4500'
                        ? 'border-indigo-500 bg-indigo-600/15 text-white ring-1 ring-indigo-500'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-bold text-xs">+90 Days</div>
                    <div className="text-[11px] text-blue-400 font-bold mt-0.5">Rs. 4,500</div>
                    <div className="text-[10px] text-slate-400 mt-1">3 Months Plan</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPresetDays(365, '12_month', '15000')}
                    className={`p-3 rounded-xl border text-left transition ${
                      actPlan === '12_month'
                        ? 'border-emerald-500 bg-emerald-600/15 text-white ring-1 ring-emerald-500'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-bold text-xs">+365 Days</div>
                    <div className="text-[11px] text-emerald-400 font-bold mt-0.5">Rs. 15,000</div>
                    <div className="text-[10px] text-slate-400 mt-1">1 Year Plan</div>
                  </button>
                </div>
              </div>

              {/* Expiry Date & Amount Paid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Target Expiration Date</label>
                  <input
                    type="date"
                    value={actExpiresAt}
                    onChange={e => {
                      setActExpiresAt(e.target.value)
                      setActPlan('custom')
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Fee Recorded (NPR)</label>
                  <input
                    type="number"
                    value={actPaidAmount}
                    onChange={e => setActPaidAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="1500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Payment Reference / Remarks</label>
                <input
                  type="text"
                  value={actNotes}
                  onChange={e => setActNotes(e.target.value)}
                  placeholder="e.g. Received via eSewa Txn #EPAY-98410291"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-900 border-t border-slate-700 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveActivation}
                disabled={savingActivation}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {savingActivation ? 'Saving...' : 'Apply & Save Activation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. NOTIFY CLINIC MODAL                                                    */}
      {/* ========================================================================= */}
      {modalType === 'notify' && activeModalClinic && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl space-y-4">
            <div className="p-5 border-b border-slate-700 flex items-center justify-between bg-slate-900/80">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Send className="w-5 h-5 text-indigo-400" />
                  Send Notification to Clinic
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{activeModalClinic.name}</p>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {notifySuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                  <Check className="w-4 h-4" /> Notification delivered successfully!
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Notification Title</label>
                <input
                  type="text"
                  value={notifyTitle}
                  onChange={e => setNotifyTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Notification Message</label>
                <textarea
                  rows={4}
                  value={notifyMessage}
                  onChange={e => setNotifyMessage(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div className="p-4 bg-slate-900 border-t border-slate-700 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSendNotification}
                disabled={sendingNotification || notifySuccess}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingNotification ? 'Sending...' : 'Send Notification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. EDIT FULL CLINIC INFORMATION MODAL                                     */}
      {/* ========================================================================= */}
      {modalType === 'edit_clinic' && activeModalClinic && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 max-w-2xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-700 flex items-center justify-between bg-slate-900/80">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Edit className="w-5 h-5 text-indigo-400" />
                  Edit Clinic Information
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">ID: {activeModalClinic.id}</p>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Clinic Name</label>
                  <input
                    type="text"
                    value={editClinicData.name || ''}
                    onChange={e => setEditClinicData({ ...editClinicData, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Operational Type</label>
                  <select
                    value={editClinicData.type || 'single_visit'}
                    onChange={e => setEditClinicData({ ...editClinicData, type: e.target.value as ClinicType })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="single_visit">Single Visit Consultation</option>
                    <option value="multi_visit">Multi Visit Follow-Up</option>
                    <option value="diagnostic_lab">Diagnostic / Lab Center</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Physical Address</label>
                <input
                  type="text"
                  value={editClinicData.address_text || ''}
                  onChange={e => setEditClinicData({ ...editClinicData, address_text: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Contact Phone (+977)</label>
                  <input
                    type="text"
                    value={editClinicData.contact_phone || ''}
                    onChange={e => setEditClinicData({ ...editClinicData, contact_phone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={editClinicData.contact_email || ''}
                    onChange={e => setEditClinicData({ ...editClinicData, contact_email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">PAN Number (9 Digits)</label>
                  <input
                    type="text"
                    maxLength={9}
                    value={editClinicData.pan_number || ''}
                    onChange={e => setEditClinicData({ ...editClinicData, pan_number: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500 font-mono"
                    placeholder="e.g. 601234567"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Manager Contact Number (+977)</label>
                  <input
                    type="text"
                    value={editClinicData.manager_phone || ''}
                    onChange={e => setEditClinicData({ ...editClinicData, manager_phone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="+977 98xxxxxxxx"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={editClinicData.latitude || 27.7052}
                    onChange={e => setEditClinicData({ ...editClinicData, latitude: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={editClinicData.longitude || 85.3193}
                    onChange={e => setEditClinicData({ ...editClinicData, longitude: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Auto-Alert Threshold</label>
                  <input
                    type="number"
                    value={editClinicData.auto_notify_threshold || 2}
                    onChange={e => setEditClinicData({ ...editClinicData, auto_notify_threshold: parseInt(e.target.value) || 2 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Activation Expiration Date</label>
                <input
                  type="date"
                  value={editClinicData.activation_expires_at ? new Date(editClinicData.activation_expires_at).toISOString().slice(0, 10) : ''}
                  onChange={e => setEditClinicData({ ...editClinicData, activation_expires_at: new Date(e.target.value + 'T23:59:59Z').toISOString() })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  value={editClinicData.description || ''}
                  onChange={e => setEditClinicData({ ...editClinicData, description: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>

              {/* Clinic Direct Payment Gateway APIs & Keys (Patients Pay Clinic) */}
              <div className="p-4 rounded-xl bg-slate-900 border border-indigo-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                      Clinic Direct Payment Gateway APIs & Keys (Patients Pay Clinic)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Configure real payment API keys for this clinic so patients pay consultation fees directly to the clinic
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editClinicData.is_direct_payment_enabled ?? false}
                      onChange={e => setEditClinicData({ ...editClinicData, is_direct_payment_enabled: e.target.checked })}
                      className="w-4 h-4 rounded bg-slate-800 text-indigo-600"
                    />
                    <span className="text-xs font-bold text-emerald-400">Enabled</span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(['esewa', 'khalti', 'fonepay', 'connectips', 'custom'] as const).map(gwId => (
                    <button
                      key={gwId}
                      type="button"
                      onClick={() => {
                        setEditClinicGatewayTab(gwId)
                        setEditClinicGateways(prev => ({ ...prev, primary_gateway: gwId }))
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase border transition ${
                        editClinicGatewayTab === gwId
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {gwId}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                      {editClinicGatewayTab.toUpperCase()} Merchant ID / Product Code
                    </label>
                    <input
                      type="text"
                      value={editClinicGateways[editClinicGatewayTab].merchant_id}
                      onChange={e => updateCurrentClinicGatewayField('merchant_id', e.target.value)}
                      placeholder="Merchant ID / SCD / PID"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                      {editClinicGatewayTab.toUpperCase()} Public API Key / Client ID
                    </label>
                    <input
                      type="text"
                      value={editClinicGateways[editClinicGatewayTab].public_key}
                      onChange={e => updateCurrentClinicGatewayField('public_key', e.target.value)}
                      placeholder="Public API Key / App ID"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                      {editClinicGatewayTab.toUpperCase()} Secret Key / HMAC Key
                    </label>
                    <div className="relative">
                      <input
                        type={showClinicSecret ? 'text' : 'password'}
                        value={editClinicGateways[editClinicGatewayTab].secret_key}
                        onChange={e => updateCurrentClinicGatewayField('secret_key', e.target.value)}
                        placeholder="Secret Key"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-8 py-1.5 text-white text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowClinicSecret(s => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showClinicSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                      {editClinicGatewayTab.toUpperCase()} Callback URL / Account No
                    </label>
                    <input
                      type="text"
                      value={editClinicGateways[editClinicGatewayTab].callback_url}
                      onChange={e => updateCurrentClinicGatewayField('callback_url', e.target.value)}
                      placeholder="https://dactor.np/payment/callback"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-900 border-t border-slate-700 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveFullClinic}
                disabled={savingClinic}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {savingClinic ? 'Saving...' : 'Save All Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. DELETE CLINIC (30-DAY ARCHIVE) CONFIRMATION MODAL                      */}
      {/* ========================================================================= */}
      {modalType === 'delete_archive' && activeModalClinic && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 max-w-md w-full rounded-2xl overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="font-bold text-white text-lg">Send Clinic to 30-Day Archive?</h3>
              <p className="text-xs text-slate-400 mt-1">{activeModalClinic.name}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-2">
              <p className="font-semibold">⚠️ 30-Day Holding & Permanent Patient Data Purge Policy:</p>
              <p className="text-[11px] leading-relaxed text-rose-200">
                This clinic will be suspended and placed into 30 days archive holding. If the deletion is not cancelled within 30 days, <strong>all patient appointments, diagnostic lab tests, invoices, and queue records under this clinic will be permanently deleted from the database.</strong>
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalType(null)}
                disabled={archivingClinic}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmArchiveDeletion}
                disabled={archivingClinic}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-md shadow-rose-600/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> {archivingClinic ? 'Archiving...' : 'Confirm 30-Day Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
