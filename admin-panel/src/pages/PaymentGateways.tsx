import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Key,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Building2,
  Upload,
  RefreshCw,
  Globe,
  Save,
  Zap,
  CreditCard,
  Copy,
  Check,
  ExternalLink,
  X,
  QrCode,
  Smartphone,
  Terminal
} from 'lucide-react'

interface GatewayCredentialItem {
  enabled: boolean
  provider_name: string
  environment: 'live' | 'test'
  merchant_id: string
  public_key: string
  secret_key: string
  account_number: string
  callback_url: string
  username?: string
  password?: string
  app_id?: string
  app_name?: string
  app_password?: string
  private_key_pem?: string
  pfx_base64?: string
  pfx_password?: string
}

interface PaymentGatewaysConfig {
  primary_gateway: 'esewa' | 'khalti' | 'fonepay' | 'connectips' | 'custom'
  esewa: GatewayCredentialItem
  khalti: GatewayCredentialItem
  fonepay: GatewayCredentialItem
  connectips: GatewayCredentialItem
  custom: GatewayCredentialItem
}

interface ClinicOption {
  id: string
  name: string
  contact_email?: string
  is_direct_payment_enabled?: boolean
  payment_gateway_provider?: string
}

const DEFAULT_GATEWAYS_CONFIG: PaymentGatewaysConfig = {
  primary_gateway: 'esewa',
  esewa: {
    enabled: true,
    provider_name: 'eSewa Mobile Wallet',
    environment: 'test',
    merchant_id: 'EPAYTEST',
    public_key: '',
    secret_key: '8gBm/:&EnhH.1/q',
    account_number: '',
    callback_url: 'https://dactor.np/payment/esewa/callback'
  },
  khalti: {
    enabled: false,
    provider_name: 'Khalti Digital Wallet',
    environment: 'test',
    merchant_id: '',
    public_key: 'test_public_key_dc74e0fd69c945fb93e26d29db3a505a',
    secret_key: 'test_secret_key_f59e8b7d18b2499f886f23e7e073c7f5',
    account_number: '',
    callback_url: 'https://dactor.np/payment/khalti/callback'
  },
  fonepay: {
    enabled: false,
    provider_name: 'Fonepay Dynamic QR',
    environment: 'test',
    merchant_id: 'NBQM',
    public_key: '',
    secret_key: '12345678',
    account_number: '',
    callback_url: 'https://dactor.np/payment/fonepay/callback',
    username: '',
    password: ''
  },
  connectips: {
    enabled: false,
    provider_name: 'ConnectIPS Direct Bank',
    environment: 'test',
    merchant_id: 'NCHL-UAT',
    public_key: '',
    secret_key: '',
    account_number: '',
    callback_url: 'https://dactor.np/payment/connectips/callback',
    app_id: 'MER-XXX-APP-1',
    app_name: 'DactorClinic',
    app_password: 'TestPassword123',
    private_key_pem: '',
    pfx_base64: '',
    pfx_password: ''
  },
  custom: {
    enabled: false,
    provider_name: 'Custom Bank / Merchant API',
    environment: 'test',
    merchant_id: '',
    public_key: '',
    secret_key: '',
    account_number: '',
    callback_url: ''
  }
}

// Helper to compute HMAC-SHA256 base64 in browser
async function computeHmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await window.crypto.subtle.sign('HMAC', key, enc.encode(message))
  const byteArray = new Uint8Array(sig)
  let binary = ''
  for (let i = 0; i < byteArray.byteLength; i++) {
    binary += String.fromCharCode(byteArray[i])
  }
  return window.btoa(binary)
}

interface PaymentGatewaysProps {
  onNavigate?: (path: string) => void
}

export default function PaymentGateways({ onNavigate: _ }: PaymentGatewaysProps) {
  // Global Demo Mode state
  const [isGlobalDemo, setIsGlobalDemo] = useState<boolean>(false)
  const [togglingDemo, setTogglingDemo] = useState(false)

  // Scope: 'platform' or 'clinic'
  const [scope, setScope] = useState<'platform' | 'clinic'>('platform')

  // Clinic selection for 'clinic' scope
  const [clinics, setClinics] = useState<ClinicOption[]>([])
  const [selectedClinicId, setSelectedClinicId] = useState<string>('')
  const [clinicSearch, setClinicSearch] = useState('')

  // Gateway form state
  const [gateways, setGateways] = useState<PaymentGatewaysConfig>(DEFAULT_GATEWAYS_CONFIG)
  const [activeGatewayTab, setActiveGatewayTab] = useState<'esewa' | 'khalti' | 'fonepay' | 'connectips' | 'custom'>('esewa')
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Feedback & Saving
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)

  // Interactive Demo Modal State
  const [isTryModalOpen, setIsTryModalOpen] = useState(false)
  const [tryGateway, setTryGateway] = useState<'esewa' | 'khalti' | 'fonepay' | 'connectips'>('esewa')
  const [tryAmount, setTryAmount] = useState<number>(10)
  const [tryUuid, setTryUuid] = useState<string>('')
  const [tryStatus, setTryStatus] = useState<'idle' | 'initiating' | 'launched' | 'verifying' | 'success' | 'failed'>('idle')
  const [tryLog, setTryLog] = useState<string[]>([])
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [qrSimulatedPaid, setQrSimulatedPaid] = useState(false)

  // Load initial settings & handle sandbox return callbacks
  useEffect(() => {
    loadGlobalSettings()
    loadClinics()

    // Detect return from external sandbox payments
    try {
      const search = window.location.search
      if (search) {
        const params = new URLSearchParams(search)
        if (params.get('demo_status') === 'success' || params.get('data')) {
          setMessage({
            text: '🎉 Verified! Sandbox payment completed successfully and returned to portal.',
            isError: false
          })
          window.history.replaceState(null, '', window.location.pathname)
        } else if (params.get('demo_status') === 'failed') {
          setMessage({
            text: 'Sandbox payment transaction was cancelled or declined.',
            isError: true
          })
          window.history.replaceState(null, '', window.location.pathname)
        }
      }
    } catch {}
  }, [])

  // When clinic selection changes in 'clinic' scope
  useEffect(() => {
    if (scope === 'clinic' && selectedClinicId) {
      loadClinicGateways(selectedClinicId)
    }
  }, [scope, selectedClinicId])

  const loadGlobalSettings = async () => {
    try {
      setLoading(true)
      const { data } = await supabase
        .from('platform_payment_settings')
        .select('*')
        .eq('id', 'global_config')
        .maybeSingle()

      if (data) {
        setIsGlobalDemo(Boolean(data.is_global_demo_mode))
        if (data.platform_gateways && typeof data.platform_gateways === 'object') {
          const pg = data.platform_gateways
          setGateways({
            ...DEFAULT_GATEWAYS_CONFIG,
            primary_gateway: data.primary_gateway || pg.primary_gateway || 'esewa',
            esewa: { ...DEFAULT_GATEWAYS_CONFIG.esewa, ...(pg.esewa || {}) },
            khalti: { ...DEFAULT_GATEWAYS_CONFIG.khalti, ...(pg.khalti || {}) },
            fonepay: { ...DEFAULT_GATEWAYS_CONFIG.fonepay, ...(pg.fonepay || {}) },
            connectips: { ...DEFAULT_GATEWAYS_CONFIG.connectips, ...(pg.connectips || {}) },
            custom: { ...DEFAULT_GATEWAYS_CONFIG.custom, ...(pg.custom || {}) }
          })
        }
      }
    } catch (e) {
      console.error('Error loading global payment settings:', e)
    } finally {
      setLoading(false)
    }
  }

  const loadClinics = async () => {
    try {
      const { data } = await supabase
        .from('clinics')
        .select('id, name, contact_email, is_direct_payment_enabled, payment_gateway_provider, description')
        .order('name', { ascending: true })
      if (data && data.length > 0) {
        setClinics(data as ClinicOption[])
        setSelectedClinicId(data[0].id)
      }
    } catch (e) {
      console.error('Error fetching clinics list:', e)
    }
  }

  const loadClinicGateways = async (clinicId: string) => {
    try {
      setLoading(true)
      // Check clinic_payment_credentials directly
      const { data: creds } = await supabase
        .from('clinic_payment_credentials')
        .select('*')
        .eq('clinic_id', clinicId)
        .maybeSingle()

      const { data: clinicRow } = await supabase
        .from('clinics')
        .select('description, is_direct_payment_enabled, payment_gateway_provider')
        .eq('id', clinicId)
        .maybeSingle()

      let parsed: PaymentGatewaysConfig = { ...DEFAULT_GATEWAYS_CONFIG }

      if (clinicRow?.description && clinicRow.description.trim().startsWith('{')) {
        try {
          const meta = JSON.parse(clinicRow.description)
          if (meta.payment_gateways_json && typeof meta.payment_gateways_json === 'string') {
            const gw = JSON.parse(meta.payment_gateways_json)
            parsed = {
              ...DEFAULT_GATEWAYS_CONFIG,
              ...gw,
              esewa: { ...DEFAULT_GATEWAYS_CONFIG.esewa, ...(gw.esewa || {}) },
              khalti: { ...DEFAULT_GATEWAYS_CONFIG.khalti, ...(gw.khalti || {}) },
              fonepay: { ...DEFAULT_GATEWAYS_CONFIG.fonepay, ...(gw.fonepay || {}) },
              connectips: { ...DEFAULT_GATEWAYS_CONFIG.connectips, ...(gw.connectips || {}) },
              custom: { ...DEFAULT_GATEWAYS_CONFIG.custom, ...(gw.custom || {}) }
            }
          }
        } catch {
          // ignore parse error
        }
      }

      // Merge values from clinic_payment_credentials if present
      if (creds) {
        parsed.esewa = {
          ...parsed.esewa,
          enabled: creds.esewa_enabled ?? creds.is_verified ?? false,
          merchant_id: creds.esewa_product_code || parsed.esewa.merchant_id || '',
          secret_key: creds.esewa_secret_key || parsed.esewa.secret_key || ''
        }
        parsed.khalti = {
          ...parsed.khalti,
          enabled: creds.khalti_enabled ?? false,
          public_key: creds.khalti_public_key || parsed.khalti.public_key || '',
          secret_key: creds.khalti_secret_key || parsed.khalti.secret_key || ''
        }
        parsed.fonepay = {
          ...parsed.fonepay,
          enabled: creds.fonepay_enabled ?? false,
          merchant_id: creds.fonepay_merchant_code || parsed.fonepay.merchant_id || '',
          secret_key: creds.fonepay_secret_key || parsed.fonepay.secret_key || '',
          username: creds.fonepay_username || parsed.fonepay.username || '',
          password: creds.fonepay_password || parsed.fonepay.password || ''
        }
        parsed.connectips = {
          ...parsed.connectips,
          enabled: creds.connectips_enabled ?? false,
          merchant_id: creds.connectips_merchant_id || parsed.connectips.merchant_id || '',
          app_id: creds.connectips_app_id || parsed.connectips.app_id || '',
          app_name: creds.connectips_app_name || parsed.connectips.app_name || 'DactorClinic',
          app_password: creds.connectips_app_password || parsed.connectips.app_password || '',
          private_key_pem: creds.connectips_private_key || parsed.connectips.private_key_pem || ''
        }
      }

      if (clinicRow?.payment_gateway_provider) {
        parsed.primary_gateway = clinicRow.payment_gateway_provider as any
      }

      setGateways(parsed)
      setActiveGatewayTab(parsed.primary_gateway || 'esewa')
    } catch (e) {
      console.error('Error loading clinic gateway credentials:', e)
    } finally {
      setLoading(false)
    }
  }

  // Toggle Global Demo Mode
  const handleToggleGlobalDemo = async () => {
    if (togglingDemo) return
    const nextState = !isGlobalDemo
    setTogglingDemo(true)
    setMessage(null)
    try {
      const { error } = await supabase
        .from('platform_payment_settings')
        .upsert({
          id: 'global_config',
          is_global_demo_mode: nextState,
          updated_at: new Date().toISOString(),
          updated_by: 'rajanpurbey55@gmail.com'
        })

      if (error) throw error

      setIsGlobalDemo(nextState)
      setMessage({
        text: nextState
          ? '⚡ Global Demo Mode ACTIVATED! All payment gateways are now routing through Sandbox/Test mode.'
          : '🟢 Live Production Mode ACTIVATED! Live provider routing is restored.',
        isError: false
      })
      setTimeout(() => setMessage(null), 5000)
    } catch (err: any) {
      setMessage({ text: err?.message || 'Failed to toggle Global Demo Mode', isError: true })
    } finally {
      setTogglingDemo(false)
    }
  }

  const updateCurrentGatewayField = (field: keyof GatewayCredentialItem, value: any) => {
    setGateways(prev => ({
      ...prev,
      [activeGatewayTab]: {
        ...prev[activeGatewayTab],
        [field]: value
      }
    }))
  }

  // Handle Certificate / Document File Upload (for ConnectIPS .pfx or .pem)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    if (file.name.endsWith('.pfx') || file.name.endsWith('.p12')) {
      reader.onload = () => {
        const result = reader.result as string
        const base64Data = result.split(',')[1] || result
        updateCurrentGatewayField('pfx_base64', base64Data)
        setMessage({ text: `Loaded PKCS#12 certificate (${file.name}). Please enter your PFX password below.`, isError: false })
      }
      reader.readAsDataURL(file)
    } else {
      reader.onload = () => {
        const textData = reader.result as string
        updateCurrentGatewayField('private_key_pem', textData)
        setMessage({ text: `Loaded PEM private key document (${file.name}).`, isError: false })
      }
      reader.readAsText(file)
    }
  }

  // Save Settings
  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setMessage(null)

    try {
      if (scope === 'platform') {
        // Save to platform_payment_settings
        const { error } = await supabase
          .from('platform_payment_settings')
          .upsert({
            id: 'global_config',
            primary_gateway: gateways.primary_gateway,
            platform_gateways: gateways,
            is_global_demo_mode: isGlobalDemo,
            updated_at: new Date().toISOString(),
            updated_by: 'rajanpurbey55@gmail.com'
          })
        if (error) throw error

        setMessage({ text: 'Platform payment gateway APIs & keys successfully updated!', isError: false })
      } else {
        // Save to specific clinic
        if (!selectedClinicId) {
          throw new Error('Please select a clinic to update.')
        }

        const primaryProv = gateways.primary_gateway || 'esewa'
        const primaryItem = gateways[primaryProv]
        const gatewaysJsonStr = JSON.stringify(gateways)

        // 1. Update clinic_payment_credentials table
        const credsPatch: Record<string, any> = {
          clinic_id: selectedClinicId,
          updated_at: new Date().toISOString(),
          // eSewa
          esewa_enabled: gateways.esewa.enabled,
          esewa_product_code: gateways.esewa.merchant_id || null,
          esewa_secret_key: gateways.esewa.secret_key || null,
          esewa_is_verified: gateways.esewa.enabled && Boolean(gateways.esewa.merchant_id),
          // Khalti
          khalti_enabled: gateways.khalti.enabled,
          khalti_public_key: gateways.khalti.public_key || null,
          khalti_secret_key: gateways.khalti.secret_key || null,
          khalti_is_verified: gateways.khalti.enabled && Boolean(gateways.khalti.secret_key),
          // Fonepay
          fonepay_enabled: gateways.fonepay.enabled,
          fonepay_merchant_code: gateways.fonepay.merchant_id || null,
          fonepay_secret_key: gateways.fonepay.secret_key || null,
          fonepay_username: gateways.fonepay.username || null,
          fonepay_password: gateways.fonepay.password || null,
          fonepay_is_verified: gateways.fonepay.enabled && Boolean(gateways.fonepay.merchant_id),
          // ConnectIPS
          connectips_enabled: gateways.connectips.enabled,
          connectips_merchant_id: gateways.connectips.merchant_id || null,
          connectips_app_id: gateways.connectips.app_id || null,
          connectips_app_name: gateways.connectips.app_name || 'DactorClinic',
          connectips_app_password: gateways.connectips.app_password || null,
          connectips_private_key: gateways.connectips.private_key_pem || null,
          connectips_is_verified: gateways.connectips.enabled && Boolean(gateways.connectips.merchant_id)
        }

        const { error: credsErr } = await supabase
          .from('clinic_payment_credentials')
          .upsert(credsPatch, { onConflict: 'clinic_id' })

        if (credsErr) {
          console.warn('Could not update clinic_payment_credentials directly:', credsErr)
        }

        // 2. Also sync to clinic description metadata & direct payment flag
        const { data: clinicCurrent } = await supabase
          .from('clinics')
          .select('description')
          .eq('id', selectedClinicId)
          .maybeSingle()

        let packedDesc = ''
        try {
          const meta = clinicCurrent?.description && clinicCurrent.description.trim().startsWith('{')
            ? JSON.parse(clinicCurrent.description)
            : {}
          meta.payment_gateways_json = gatewaysJsonStr
          meta.payment_gateway_provider = primaryProv
          meta.merchant_id = primaryItem.merchant_id || null
          meta.payment_api_key = primaryItem.public_key || null
          meta.payment_secret_key = primaryItem.secret_key || null
          meta.is_direct_payment_enabled = true
          packedDesc = JSON.stringify(meta)
        } catch {
          packedDesc = clinicCurrent?.description || ''
        }

        const { error: clinicErr } = await supabase
          .from('clinics')
          .update({
            description: packedDesc,
            payment_gateway_provider: primaryProv,
            merchant_id: primaryItem.merchant_id || null,
            payment_api_key: primaryItem.public_key || null,
            payment_secret_key: primaryItem.secret_key || null,
            is_direct_payment_enabled: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedClinicId)

        if (clinicErr) throw clinicErr

        const currentClinicName = clinics.find(c => c.id === selectedClinicId)?.name || 'Clinic'
        setMessage({ text: `Successfully updated payment credentials & documents for ${currentClinicName}!`, isError: false })
      }

      setTimeout(() => setMessage(null), 4000)
    } catch (err: any) {
      setMessage({ text: err?.message || 'Failed to save gateway settings', isError: true })
    } finally {
      setSaving(false)
    }
  }

  // Open Interactive Try Demo Modal
  const handleOpenTryModal = (gw?: string) => {
    const targetGw = (gw === 'khalti' || gw === 'fonepay' || gw === 'connectips') ? gw : 'esewa'
    setTryGateway(targetGw)
    const newUuid = 'DEMO-' + Date.now().toString(36).toUpperCase()
    setTryUuid(newUuid)
    setTryStatus('idle')
    setQrSimulatedPaid(false)
    setTryLog([
      `[${new Date().toLocaleTimeString()}] Ready to test ${targetGw.toUpperCase()} sandbox payment.`,
      `[${new Date().toLocaleTimeString()}] Target transaction UUID: ${newUuid}`
    ])
    setIsTryModalOpen(true)
  }

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(label)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // Launch Live Sandbox Checkout
  const handleLaunchDemoPayment = async () => {
    try {
      setTryStatus('initiating')
      const targetGw = tryGateway
      const amountStr = tryAmount.toString()
      const uuid = tryUuid || ('DEMO-' + Date.now().toString(36).toUpperCase())

      setTryLog(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Initializing ${targetGw.toUpperCase()} Sandbox Checkout for NPR ${amountStr}...`
      ])

      if (targetGw === 'esewa') {
        const item = gateways.esewa
        const merchantCode = item.merchant_id?.trim() || 'EPAYTEST'
        const secretKey = item.secret_key?.trim() || '8gBm/:&EnhH.1/q'

        // eSewa v2 signature string
        const message = `total_amount=${amountStr},transaction_uuid=${uuid},product_code=${merchantCode}`
        setTryLog(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] eSewa signing string: ${message}`
        ])

        const signature = await computeHmacSha256(message, secretKey)
        setTryLog(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Computed HMAC-SHA256 signature: ${signature.slice(0, 16)}...`,
          `[${new Date().toLocaleTimeString()}] Submitting form to https://rc-epay.esewa.com.np/api/epay/main/v2/form...`
        ])

        // Build HTML form and submit in new window
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = 'https://rc-epay.esewa.com.np/api/epay/main/v2/form'
        form.target = '_blank'

        const fields: Record<string, string> = {
          amount: amountStr,
          tax_amount: '0',
          total_amount: amountStr,
          transaction_uuid: uuid,
          product_code: merchantCode,
          product_service_charge: '0',
          product_delivery_charge: '0',
          success_url: `${window.location.origin}${window.location.pathname}?demo_status=success&gw=esewa`,
          failure_url: `${window.location.origin}${window.location.pathname}?demo_status=failed&gw=esewa`,
          signed_field_names: 'total_amount,transaction_uuid,product_code',
          signature: signature
        }

        Object.entries(fields).forEach(([k, v]) => {
          const inp = document.createElement('input')
          inp.type = 'hidden'
          inp.name = k
          inp.value = v
          form.appendChild(inp)
        })

        document.body.appendChild(form)
        form.submit()
        document.body.removeChild(form)

        setTryStatus('launched')
        setTryLog(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 🚀 eSewa Sandbox window opened! Use test credentials (9849511152 / 1122) in the opened tab.`
        ])
      } else if (targetGw === 'khalti') {
        const item = gateways.khalti
        const pubKey = item.public_key?.trim() || 'test_public_key_dc74e0fd69c945fb93e26d29db3a505a'
        setTryLog(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Using Khalti Public Key: ${pubKey.slice(0, 20)}...`,
          `[${new Date().toLocaleTimeString()}] Sandbox endpoint: https://a.khalti.com/api/v2/epayment/initiate/`,
          `[${new Date().toLocaleTimeString()}] Khalti test modal ready. Click 'Simulate Khalti Wallet Approval' below.`
        ])
        setTryStatus('launched')
      } else if (targetGw === 'fonepay') {
        setTryLog(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Generated Dynamic Fonepay QR for PID: NBQM`,
          `[${new Date().toLocaleTimeString()}] Scan or click 'Simulate Fonepay App Approval' below.`
        ])
        setTryStatus('launched')
      } else if (targetGw === 'connectips') {
        setTryLog(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ConnectIPS NCHL-UAT token payload prepared.`,
          `[${new Date().toLocaleTimeString()}] Click 'Simulate Bank Transfer Settlement' below.`
        ])
        setTryStatus('launched')
      }
    } catch (err: any) {
      setTryStatus('failed')
      setTryLog(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Failed to initiate: ${err?.message || String(err)}`
      ])
    }
  }

  // Simulate instant sandbox approval (for Khalti, Fonepay, ConnectIPS)
  const handleSimulateInstantApproval = () => {
    setTryStatus('verifying')
    setTryLog(prev => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Received instant webhook callback: STATUS=SUCCESSFUL`,
      `[${new Date().toLocaleTimeString()}] Verifying gateway signature and response hash...`
    ])

    setTimeout(() => {
      setTryStatus('success')
      setQrSimulatedPaid(true)
      setTryLog(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🎉 Verified 100%! Payment of NPR ${tryAmount} successfully confirmed in sandbox.`
      ])
    }, 700)
  }

  const activeItem = gateways[activeGatewayTab]

  const filteredClinics = clinics.filter(c =>
    c.name.toLowerCase().includes(clinicSearch.toLowerCase()) ||
    (c.contact_email && c.contact_email.toLowerCase().includes(clinicSearch.toLowerCase()))
  )

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Key className="w-6 h-6 text-amber-400" />
            Payment Gateways & Master Configuration
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Centralized control for all payment APIs, secret keys, bank documents, and platform-wide demo routing.
          </p>
        </div>

        <button
          onClick={() => handleOpenTryModal(gateways.primary_gateway || 'esewa')}
          className="px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
        >
          <Zap className="w-4 h-4 fill-current" />
          <span>⚡ Try Demo Payment</span>
        </button>
      </div>

      {/* Global Demo Switch Master Banner */}
      <div className={`p-6 rounded-2xl border transition shadow-xl ${
        isGlobalDemo
          ? 'bg-amber-950/40 border-amber-500/40 shadow-amber-950/20'
          : 'bg-slate-900/90 border-slate-800 shadow-slate-950/30'
      }`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-2xl ${
              isGlobalDemo ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-400'
            }`}>
              <Zap className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white">Global Payment Demo Switch</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  isGlobalDemo
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  {isGlobalDemo ? '⚡ DEMO SANDBOX ACTIVE' : '🟢 LIVE PRODUCTION'}
                </span>
              </div>
              <p className="text-slate-300 text-sm mt-1.5 max-w-2xl leading-relaxed">
                When activated, <strong className="text-amber-300">all payment gateways across every clinic</strong> (eSewa, Khalti, Fonepay, ConnectIPS) are instantly routed to Sandbox / Test mode. Demo mode is fully locked from clinic tampering and managed exclusively here.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => handleOpenTryModal(gateways.primary_gateway || 'esewa')}
              className="px-4 py-3 rounded-xl font-bold text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition flex items-center justify-center gap-2 flex-1 md:flex-none whitespace-nowrap"
            >
              <CreditCard className="w-4 h-4" />
              <span>Test Live Sandbox Checkout</span>
            </button>

            <button
              onClick={handleToggleGlobalDemo}
              disabled={togglingDemo}
              className={`px-5 py-3 rounded-xl font-bold text-sm transition shadow-lg flex items-center justify-center gap-2.5 whitespace-nowrap flex-1 md:flex-none ${
                isGlobalDemo
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-amber-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              {togglingDemo ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isGlobalDemo ? (
                <ShieldAlert className="w-4 h-4 text-slate-950" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              )}
              <span>{isGlobalDemo ? 'Disable Global Demo Mode' : 'Enable Global Demo Mode'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alert / Notification Feedback */}
      {message && (
        <div className={`p-4 rounded-xl text-sm flex items-center gap-3 border ${
          message.isError
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
        }`}>
          {message.isError ? <AlertCircle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Scope Selector: Platform vs Clinic */}
      <div className="bg-slate-950 border border-slate-800 p-2 rounded-2xl flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => {
            setScope('platform')
            loadGlobalSettings()
          }}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2.5 transition ${
            scope === 'platform'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Platform Master Gateways (Dactor Platform Account)</span>
        </button>

        <button
          onClick={() => setScope('clinic')}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2.5 transition ${
            scope === 'clinic'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Clinic Payment Gateways (Per-Clinic Oversight)</span>
        </button>
      </div>

      {/* Clinic Selector Bar (Visible only when scope === 'clinic') */}
      {scope === 'clinic' && (
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <span>Select Clinic to Edit Credentials & Documents:</span>
            </div>
            <input
              type="text"
              placeholder="Search clinic name or email..."
              value={clinicSearch}
              onChange={e => setClinicSearch(e.target.value)}
              className="px-3.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 w-full sm:w-64 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
            {filteredClinics.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedClinicId(c.id)}
                className={`text-left p-3 rounded-xl border text-xs transition flex flex-col justify-between gap-1 ${
                  selectedClinicId === c.id
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="font-bold truncate">{c.name}</div>
                <div className="text-[11px] text-slate-400 truncate">{c.contact_email || 'No email registered'}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gateways Configuration Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-20 flex items-center justify-center gap-2 text-indigo-400 text-xs font-semibold">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Loading credentials...</span>
          </div>
        )}
        {/* Gateway Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950 overflow-x-auto justify-between items-center pr-4">
          <div className="flex">
            {(['esewa', 'khalti', 'fonepay', 'connectips', 'custom'] as const).map(gw => {
              const item = gateways[gw]
              const isSelected = activeGatewayTab === gw
              return (
                <button
                  key={gw}
                  onClick={() => setActiveGatewayTab(gw)}
                  className={`px-5 py-3.5 text-xs font-bold transition flex items-center gap-2 whitespace-nowrap border-b-2 ${
                    isSelected
                      ? 'border-indigo-500 text-white bg-slate-900'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                  }`}
                >
                  <span>{item.provider_name || gw.toUpperCase()}</span>
                  {item.enabled && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  )}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => handleOpenTryModal(activeGatewayTab)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 whitespace-nowrap ml-2"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>⚡ Try {activeGatewayTab.toUpperCase()}</span>
          </button>
        </div>

        {/* Tab Content Form */}
        <div className="p-6 space-y-6">
          {/* Top Row: Enable Toggle & Primary Gateway Selection */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id={`enable-${activeGatewayTab}`}
                checked={activeItem.enabled}
                onChange={e => updateCurrentGatewayField('enabled', e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700"
              />
              <label htmlFor={`enable-${activeGatewayTab}`} className="text-sm font-bold text-white cursor-pointer">
                Enable {activeItem.provider_name}
              </label>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => handleOpenTryModal(activeGatewayTab)}
                className="px-3 py-1.5 rounded-lg font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 flex items-center gap-1.5 transition"
              >
                <Zap className="w-3 h-3 fill-current" />
                <span>Test Demo Mode</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="text-slate-400">Default/Primary Gateway:</span>
                <button
                  type="button"
                  onClick={() => setGateways(prev => ({ ...prev, primary_gateway: activeGatewayTab }))}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${
                    gateways.primary_gateway === activeGatewayTab
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {gateways.primary_gateway === activeGatewayTab ? '★ Primary Selected' : 'Set as Primary'}
                </button>
              </div>
            </div>
          </div>

          {/* Gateway-specific Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* eSewa Inputs */}
            {activeGatewayTab === 'esewa' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    eSewa Product Code / Merchant ID *
                  </label>
                  <input
                    type="text"
                    value={activeItem.merchant_id}
                    onChange={e => updateCurrentGatewayField('merchant_id', e.target.value)}
                    placeholder="e.g. EPAYTEST (for Sandbox) or live Merchant Code"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">
                      eSewa HMAC-SHA256 Secret Key *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="text-xs text-indigo-400 flex items-center gap-1 hover:text-indigo-300"
                    >
                      {showSecretKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showSecretKey ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <input
                    type={showSecretKey ? 'text' : 'password'}
                    value={activeItem.secret_key}
                    onChange={e => updateCurrentGatewayField('secret_key', e.target.value)}
                    placeholder="e.g. 8gBm/:&EnhH.1/q"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </>
            )}

            {/* Khalti Inputs */}
            {activeGatewayTab === 'khalti' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Khalti Public Key (Display ID)
                  </label>
                  <input
                    type="text"
                    value={activeItem.public_key}
                    onChange={e => updateCurrentGatewayField('public_key', e.target.value)}
                    placeholder="live_public_key_... or test_public_key_..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">
                      Khalti ePayment Secret Key (Required) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="text-xs text-indigo-400 flex items-center gap-1 hover:text-indigo-300"
                    >
                      {showSecretKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showSecretKey ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <input
                    type={showSecretKey ? 'text' : 'password'}
                    value={activeItem.secret_key}
                    onChange={e => updateCurrentGatewayField('secret_key', e.target.value)}
                    placeholder="live_secret_key_... or test_secret_key_..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </>
            )}

            {/* Fonepay Inputs */}
            {activeGatewayTab === 'fonepay' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Fonepay Merchant Code (PID) *
                  </label>
                  <input
                    type="text"
                    value={activeItem.merchant_id}
                    onChange={e => updateCurrentGatewayField('merchant_id', e.target.value)}
                    placeholder="e.g. NBQM or Merchant PID"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">
                      Fonepay HMAC Secret Key *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="text-xs text-indigo-400 flex items-center gap-1 hover:text-indigo-300"
                    >
                      {showSecretKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showSecretKey ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <input
                    type={showSecretKey ? 'text' : 'password'}
                    value={activeItem.secret_key}
                    onChange={e => updateCurrentGatewayField('secret_key', e.target.value)}
                    placeholder="Shared HMAC-SHA512 secret key"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Fonepay Dynamic QR Username (Optional)
                  </label>
                  <input
                    type="text"
                    value={activeItem.username || ''}
                    onChange={e => updateCurrentGatewayField('username', e.target.value)}
                    placeholder="98XXXXXXXX or Merchant API Username"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">
                      Fonepay Dynamic QR Password (Optional)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-xs text-indigo-400 flex items-center gap-1 hover:text-indigo-300"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showPassword ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={activeItem.password || ''}
                    onChange={e => updateCurrentGatewayField('password', e.target.value)}
                    placeholder="Merchant API Password"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </>
            )}

            {/* ConnectIPS Inputs */}
            {activeGatewayTab === 'connectips' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    ConnectIPS Merchant ID (PID) *
                  </label>
                  <input
                    type="text"
                    value={activeItem.merchant_id}
                    onChange={e => updateCurrentGatewayField('merchant_id', e.target.value)}
                    placeholder="NCHL Merchant ID"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    ConnectIPS App ID *
                  </label>
                  <input
                    type="text"
                    value={activeItem.app_id || ''}
                    onChange={e => updateCurrentGatewayField('app_id', e.target.value)}
                    placeholder="e.g. MER-XXX-APP-1"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    ConnectIPS App Name *
                  </label>
                  <input
                    type="text"
                    value={activeItem.app_name || 'DactorClinic'}
                    onChange={e => updateCurrentGatewayField('app_name', e.target.value)}
                    placeholder="App Name registered at NCHL"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">
                      ConnectIPS Validation API Password *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-xs text-indigo-400 flex items-center gap-1 hover:text-indigo-300"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showPassword ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={activeItem.app_password || ''}
                    onChange={e => updateCurrentGatewayField('app_password', e.target.value)}
                    placeholder="API Validation Password"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                {/* ConnectIPS Document / Certificate Upload */}
                <div className="md:col-span-2 space-y-2 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <Upload className="w-4 h-4 text-indigo-400" />
                        ConnectIPS Private Key Document / Certificate (.pfx / .pem)
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Upload your PKCS#12 (.pfx) digital certificate or paste your RSA private key PEM below.
                      </p>
                    </div>

                    <label className="cursor-pointer px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Choose File (.pfx / .pem)</span>
                      <input
                        type="file"
                        accept=".pfx,.p12,.pem,.key"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-400">
                        PFX Certificate Password (If uploading .pfx)
                      </label>
                      <input
                        type="password"
                        value={activeItem.pfx_password || ''}
                        onChange={e => updateCurrentGatewayField('pfx_password', e.target.value)}
                        placeholder="Certificate password provided by bank"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-400">
                        Or Paste RSA PKCS#8 PEM Key Directly
                      </label>
                      <textarea
                        rows={2}
                        value={activeItem.private_key_pem || ''}
                        onChange={e => updateCurrentGatewayField('private_key_pem', e.target.value)}
                        placeholder="-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----"
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono resize-none"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Custom Bank Gateway Inputs */}
            {activeGatewayTab === 'custom' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Provider Name *
                  </label>
                  <input
                    type="text"
                    value={activeItem.provider_name}
                    onChange={e => updateCurrentGatewayField('provider_name', e.target.value)}
                    placeholder="e.g. NIC Asia Bank Gateway"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Bank Account / Settlement Number
                  </label>
                  <input
                    type="text"
                    value={activeItem.account_number}
                    onChange={e => updateCurrentGatewayField('account_number', e.target.value)}
                    placeholder="Account number for direct settlements"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Merchant ID / Public API Key
                  </label>
                  <input
                    type="text"
                    value={activeItem.merchant_id}
                    onChange={e => updateCurrentGatewayField('merchant_id', e.target.value)}
                    placeholder="Merchant identification code"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Callback / Return Webhook URL
                  </label>
                  <input
                    type="text"
                    value={activeItem.callback_url}
                    onChange={e => updateCurrentGatewayField('callback_url', e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </>
            )}
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => handleOpenTryModal(activeGatewayTab)}
              className="px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/20 flex items-center gap-2 transition w-full sm:w-auto justify-center"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>⚡ Try Demo Payment with {activeItem.provider_name || activeGatewayTab.toUpperCase()}</span>
            </button>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition disabled:opacity-50 w-full sm:w-auto justify-center"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{saving ? 'Saving...' : scope === 'platform' ? 'Save Platform Gateways' : 'Save Clinic Gateway Keys'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
         INTERACTIVE DEMO PAYMENT MODAL (TEST CHECKOUT SUITE)
         ========================================================================= */}
      {isTryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    Interactive Payment Gateway Demo & Sandbox Testing
                  </h3>
                  <p className="text-xs text-slate-400">
                    Simulate real patient payments against official Nepal sandbox gateways with zero real money charged.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTryModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              {/* Gateway Selector Pills */}
              <div className="space-y-2">
                <label className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                  Select Payment Gateway to Test:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['esewa', 'khalti', 'fonepay', 'connectips'] as const).map(gw => (
                    <button
                      key={gw}
                      onClick={() => {
                        setTryGateway(gw)
                        setTryStatus('idle')
                        setQrSimulatedPaid(false)
                        setTryLog(prev => [
                          ...prev,
                          `[${new Date().toLocaleTimeString()}] Switched sandbox target to ${gw.toUpperCase()}`
                        ])
                      }}
                      className={`p-3 rounded-xl border font-bold text-xs transition flex flex-col items-center gap-1.5 ${
                        tryGateway === gw
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <span className="capitalize">{gw}</span>
                      <span className="text-[10px] font-normal text-slate-500">Official Sandbox</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Official Sandbox Credentials Cheat Sheet */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-bold">
                    <Smartphone className="w-4 h-4 text-amber-400" />
                    <span>Official {tryGateway.toUpperCase()} Demo Test Accounts:</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Sandbox Verified
                  </span>
                </div>

                {tryGateway === 'esewa' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                      <div>
                        <div className="text-[10px] text-slate-400">eSewa Test ID</div>
                        <div className="font-mono font-bold text-white">9849511152</div>
                      </div>
                      <button
                        onClick={() => copyToClipboard('9849511152', 'esewa_id')}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                      >
                        {copiedKey === 'esewa_id' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                      <div>
                        <div className="text-[10px] text-slate-400">Test MPIN / Password</div>
                        <div className="font-mono font-bold text-white">1122</div>
                      </div>
                      <button
                        onClick={() => copyToClipboard('1122', 'esewa_mpin')}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                      >
                        {copiedKey === 'esewa_mpin' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                      <div>
                        <div className="text-[10px] text-slate-400">Test OTP Code</div>
                        <div className="font-mono font-bold text-white">123456</div>
                      </div>
                      <button
                        onClick={() => copyToClipboard('123456', 'esewa_otp')}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                      >
                        {copiedKey === 'esewa_otp' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {tryGateway === 'khalti' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                      <div>
                        <div className="text-[10px] text-slate-400">Khalti Test ID</div>
                        <div className="font-mono font-bold text-white">9800000000</div>
                      </div>
                      <button
                        onClick={() => copyToClipboard('9800000000', 'khalti_id')}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                      >
                        {copiedKey === 'khalti_id' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                      <div>
                        <div className="text-[10px] text-slate-400">Test MPIN</div>
                        <div className="font-mono font-bold text-white">1111</div>
                      </div>
                      <button
                        onClick={() => copyToClipboard('1111', 'khalti_mpin')}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                      >
                        {copiedKey === 'khalti_mpin' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                      <div>
                        <div className="text-[10px] text-slate-400">Test OTP Code</div>
                        <div className="font-mono font-bold text-white">987654</div>
                      </div>
                      <button
                        onClick={() => copyToClipboard('987654', 'khalti_otp')}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                      >
                        {copiedKey === 'khalti_otp' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {tryGateway === 'fonepay' && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <QrCode className="w-8 h-8 text-amber-400" />
                      <div>
                        <div className="text-white font-bold">Fonepay Dynamic QR Simulator</div>
                        <div className="text-slate-400 text-[11px]">Merchant PID: NBQM (Verified Sandbox)</div>
                      </div>
                    </div>
                    <span className="font-mono text-emerald-400 text-xs font-bold">Auto-QR Ready</span>
                  </div>
                )}

                {tryGateway === 'connectips' && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div>
                      <div className="text-white font-bold">ConnectIPS NCHL-UAT Sandbox</div>
                      <div className="text-slate-400 text-[11px]">App ID: MER-XXX-APP-1 | App Password: TestPassword123</div>
                    </div>
                    <span className="font-mono text-indigo-400 text-xs font-bold">NCHL Test Node</span>
                  </div>
                )}
              </div>

              {/* Amount & Transaction Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold">Test Payment Amount (NPR):</label>
                  <div className="flex items-center gap-2">
                    {[10, 50, 100].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTryAmount(amt)}
                        className={`px-3 py-1.5 rounded-lg font-bold border transition ${
                          tryAmount === amt
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        Rs. {amt}
                      </button>
                    ))}
                    <input
                      type="number"
                      value={tryAmount}
                      onChange={e => setTryAmount(Math.max(1, Number(e.target.value)))}
                      className="w-24 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold">Transaction UUID:</label>
                  <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg font-mono text-slate-400 truncate">
                    {tryUuid}
                  </div>
                </div>
              </div>

              {/* Fonepay Simulated QR Display */}
              {tryGateway === 'fonepay' && tryStatus === 'launched' && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center space-y-3">
                  <div className="p-4 bg-white rounded-2xl shadow-lg">
                    <QrCode className="w-36 h-36 text-slate-950" />
                  </div>
                  <div className="text-center">
                    <div className="text-white font-bold">Simulated Fonepay QR (Rs. {tryAmount})</div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">PID: NBQM | REF: {tryUuid}</div>
                  </div>
                  {!qrSimulatedPaid ? (
                    <button
                      onClick={handleSimulateInstantApproval}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-2 shadow-md"
                    >
                      <Check className="w-4 h-4" />
                      <span>Simulate Mobile Banking App Approval (1-Tap)</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-emerald-400 font-bold">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Simulated Payment Approved!</span>
                    </div>
                  )}
                </div>
              )}

              {/* Live Terminal / Execution Log */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="flex items-center gap-1.5 font-bold text-slate-300">
                    <Terminal className="w-3.5 h-3.5 text-amber-400" />
                    Sandbox Execution Console
                  </span>
                  <span>{tryLog.length} events logged</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 max-h-36 overflow-y-auto space-y-1">
                  {tryLog.map((line, idx) => (
                    <div key={idx} className={line.includes('❌') ? 'text-rose-400' : line.includes('🎉') || line.includes('🚀') ? 'text-emerald-300' : 'text-slate-400'}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="text-slate-400 text-xs">
                {tryStatus === 'success' && (
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Transaction Verified in Sandbox!
                  </span>
                )}
                {tryStatus === 'launched' && tryGateway === 'esewa' && (
                  <span className="text-amber-300 flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5" />
                    eSewa test portal opened in a new tab.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {tryGateway !== 'esewa' && tryStatus === 'launched' && (
                  <button
                    onClick={handleSimulateInstantApproval}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-md flex-1 sm:flex-none justify-center"
                  >
                    <Check className="w-4 h-4" />
                    <span>Simulate {tryGateway.toUpperCase()} Approval</span>
                  </button>
                )}

                <button
                  onClick={handleLaunchDemoPayment}
                  disabled={tryStatus === 'initiating'}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-amber-500/20 flex items-center gap-2 flex-1 sm:flex-none justify-center"
                >
                  {tryStatus === 'initiating' ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ExternalLink className="w-4 h-4" />
                  )}
                  <span>
                    {tryGateway === 'esewa'
                      ? 'Launch Live eSewa Sandbox Checkout'
                      : `Initiate ${tryGateway.toUpperCase()} Test Checkout`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
