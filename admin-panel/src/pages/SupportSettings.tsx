import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  HelpCircle,
  Globe,
  ExternalLink,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Phone,
  Mail,
  Clock,
  Sparkles,
  Smartphone,
  UserCheck,
  ArrowUpCircle,
  ShieldAlert
} from 'lucide-react'

export default function SupportSettings() {
  const [supportUrl, setSupportUrl] = useState('https://rajanpurbe.github.io/Dactor/support')
  const [supportPhone, setSupportPhone] = useState('+977 9800000000')
  const [supportEmail, setSupportEmail] = useState('dactorofficial@gmail.com')
  const [supportHours, setSupportHours] = useState('24/7 Regulatory & Onboarding Helpdesk')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  // Patient App Compulsory Update states
  const [patientAppMinCode, setPatientAppMinCode] = useState(110)
  const [patientAppLatestCode, setPatientAppLatestCode] = useState(110)
  const [patientAppVersionName, setPatientAppVersionName] = useState('1.0.10')
  const [patientAppUpdateUrl, setPatientAppUpdateUrl] = useState('https://play.google.com/store/apps/details?id=com.dactor.patient')
  const [patientAppReleaseNotes, setPatientAppReleaseNotes] = useState('Critical security enhancements, live OPD queue tracking stability, and doctor presence alerts.')
  const [patientAppIsCompulsory, setPatientAppIsCompulsory] = useState(true)
  const [updateSaving, setUpdateSaving] = useState(false)
  const [updateStatusMessage, setUpdateStatusMessage] = useState('')

  // Clinic & Doctor App Compulsory Update states
  const [clinicAppMinCode, setClinicAppMinCode] = useState(64)
  const [clinicAppLatestCode, setClinicAppLatestCode] = useState(64)
  const [clinicAppVersionName, setClinicAppVersionName] = useState('1.0.64')
  const [clinicAppUpdateUrl, setClinicAppUpdateUrl] = useState('https://play.google.com/store/apps/details?id=com.dactor.clinic')
  const [clinicAppReleaseNotes, setClinicAppReleaseNotes] = useState('Critical patient queue synchronization, appointment security, and live clinic workflows.')
  const [clinicAppIsCompulsory, setClinicAppIsCompulsory] = useState(true)
  const [clinicUpdateSaving, setClinicUpdateSaving] = useState(false)
  const [clinicUpdateStatusMessage, setClinicUpdateStatusMessage] = useState('')


  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      // 1. Try system_settings table
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .in('key', ['support_url', 'support_phone', 'support_email', 'support_hours'])

      if (!error && data && data.length > 0) {
        data.forEach(item => {
          if (item.key === 'support_url' && item.value) setSupportUrl(item.value)
          if (item.key === 'support_phone' && item.value) setSupportPhone(item.value)
          if (item.key === 'support_email' && item.value) setSupportEmail(item.value)
          if (item.key === 'support_hours' && item.value) setSupportHours(item.value)
          if (item.updated_at) setLastUpdated(item.updated_at)
        })
      } else {
        // 2. Query medical_specialties for system_config rows
        const { data: specData } = await supabase
          .from('medical_specialties')
          .select('*')
          .eq('category', 'system_config')

        if (specData && specData.length > 0) {
          specData.forEach(row => {
            if (row.name === 'system_config:support_url' && row.search_keywords) setSupportUrl(row.search_keywords)
            if (row.name === 'system_config:support_phone' && row.search_keywords) setSupportPhone(row.search_keywords)
            if (row.name === 'system_config:support_email' && row.search_keywords) setSupportEmail(row.search_keywords)
            if (row.name === 'system_config:support_hours' && row.search_keywords) setSupportHours(row.search_keywords)
            if (row.updated_at) setLastUpdated(row.updated_at)
            if (row.name === 'system_config:patient_app_min_version' && row.search_keywords) setPatientAppMinCode(parseInt(row.search_keywords) || 110)
            if (row.name === 'system_config:patient_app_version_name' && row.search_keywords) setPatientAppVersionName(row.search_keywords)
            if (row.name === 'system_config:patient_app_update_url' && row.search_keywords) setPatientAppUpdateUrl(row.search_keywords)
            if (row.name === 'system_config:patient_app_release_notes' && row.search_keywords) setPatientAppReleaseNotes(row.search_keywords)
            if (row.name === 'system_config:patient_app_is_compulsory' && row.search_keywords) setPatientAppIsCompulsory(row.search_keywords === 'true')
            if ((row.name === 'system_config:clinic_app_min_version' || row.name === 'system_config:clinic_min_version_code') && row.search_keywords) setClinicAppMinCode(parseInt(row.search_keywords) || 64)
            if ((row.name === 'system_config:clinic_app_latest_version' || row.name === 'system_config:clinic_latest_version_code') && row.search_keywords) setClinicAppLatestCode(parseInt(row.search_keywords) || 64)
            if ((row.name === 'system_config:clinic_app_version_name' || row.name === 'system_config:clinic_latest_version_name') && row.search_keywords) setClinicAppVersionName(row.search_keywords)
            if ((row.name === 'system_config:clinic_app_update_url' || row.name === 'system_config:clinic_update_url') && row.search_keywords) setClinicAppUpdateUrl(row.search_keywords)
            if ((row.name === 'system_config:clinic_app_release_notes' || row.name === 'system_config:clinic_update_notes') && row.search_keywords) setClinicAppReleaseNotes(row.search_keywords)
            if ((row.name === 'system_config:clinic_app_is_compulsory' || row.name === 'system_config:clinic_force_update') && row.search_keywords) setClinicAppIsCompulsory(row.search_keywords === 'true')
          })
        }
      }
      // 3. Fetch Patient App Version settings
      try {
        const { data: appVerData } = await supabase
          .from('app_versions')
          .select('*')
          .eq('app_name', 'patient_app')
          .single()

        if (appVerData) {
          if (appVerData.min_version_code) setPatientAppMinCode(appVerData.min_version_code)
          if (appVerData.latest_version_code) setPatientAppLatestCode(appVerData.latest_version_code)
          if (appVerData.latest_version_name) setPatientAppVersionName(appVerData.latest_version_name)
          if (appVerData.update_url) setPatientAppUpdateUrl(appVerData.update_url)
          if (appVerData.release_notes) setPatientAppReleaseNotes(appVerData.release_notes)
          if (typeof appVerData.is_compulsory === 'boolean') setPatientAppIsCompulsory(appVerData.is_compulsory)
        }
      } catch (_e) {}

      // 4. Fetch Clinic App Version settings
      try {
        const { data: clinicVerData } = await supabase
          .from('app_versions')
          .select('*')
          .eq('app_name', 'clinic_app')
          .single()

        if (clinicVerData) {
          if (clinicVerData.min_version_code) setClinicAppMinCode(clinicVerData.min_version_code)
          if (clinicVerData.latest_version_code) setClinicAppLatestCode(clinicVerData.latest_version_code)
          if (clinicVerData.latest_version_name) setClinicAppVersionName(clinicVerData.latest_version_name)
          if (clinicVerData.update_url) setClinicAppUpdateUrl(clinicVerData.update_url)
          if (clinicVerData.release_notes) setClinicAppReleaseNotes(clinicVerData.release_notes)
          if (typeof clinicVerData.is_compulsory === 'boolean') setClinicAppIsCompulsory(clinicVerData.is_compulsory)
        }
      } catch (_e) {}

    } catch (err: any) {
      console.warn('Error reading system settings:', err)
    } finally {
      setLoading(false)
    }
  }

  
  const handlePublishAppUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setUpdateSaving(true)
    setUpdateStatusMessage('')
    try {
      // 1. Upsert to medical_specialties (category = 'system_config')
      const configs = [
        {
          name: 'system_config:patient_app_min_version',
          category: 'system_config',
          description: 'Patient App Minimum Required Version Code',
          search_keywords: String(patientAppMinCode),
          is_active: true
        },
        {
          name: 'system_config:patient_app_latest_version',
          category: 'system_config',
          description: 'Patient App Latest Version Code',
          search_keywords: String(patientAppLatestCode),
          is_active: true
        },
        {
          name: 'system_config:patient_app_version_name',
          category: 'system_config',
          description: 'Patient App Latest Version Name',
          search_keywords: patientAppVersionName.trim(),
          is_active: true
        },
        {
          name: 'system_config:patient_app_update_url',
          category: 'system_config',
          description: 'Patient App Play Store / Download URL',
          search_keywords: patientAppUpdateUrl.trim(),
          is_active: true
        },
        {
          name: 'system_config:patient_app_release_notes',
          category: 'system_config',
          description: 'Patient App Release Notes',
          search_keywords: patientAppReleaseNotes.trim(),
          is_active: true
        },
        {
          name: 'system_config:patient_app_is_compulsory',
          category: 'system_config',
          description: 'Whether Patient App Update is Compulsory',
          search_keywords: String(patientAppIsCompulsory),
          is_active: true
        }
      ]
      await supabase.from('medical_specialties').upsert(configs, { onConflict: 'name' })

      // 2. Also upsert to app_versions table if created
      try {
        await supabase.from('app_versions').upsert({
          app_name: 'patient_app',
          min_version_code: patientAppMinCode,
          latest_version_code: patientAppLatestCode,
          latest_version_name: patientAppVersionName.trim(),
          update_url: patientAppUpdateUrl.trim(),
          release_notes: patientAppReleaseNotes.trim(),
          is_compulsory: patientAppIsCompulsory,
          updated_at: new Date().toISOString()
        }, { onConflict: 'app_name' })
      } catch (_e) {}

      setUpdateStatusMessage('✓ Patient App Compulsory Update settings successfully published to network!')
      setTimeout(() => setUpdateStatusMessage(''), 5000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to publish app version settings.')
    } finally {
      setUpdateSaving(false)
    }
  }

  const handlePublishClinicAppUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setClinicUpdateSaving(true)
    setClinicUpdateStatusMessage('')
    try {
      // 1. Upsert to medical_specialties (category = 'system_config')
      const configs = [
        {
          name: 'system_config:clinic_app_min_version',
          category: 'system_config',
          description: 'Clinic App Minimum Required Version Code',
          search_keywords: String(clinicAppMinCode),
          is_active: true
        },
        {
          name: 'system_config:clinic_app_latest_version',
          category: 'system_config',
          description: 'Clinic App Latest Version Code',
          search_keywords: String(clinicAppLatestCode),
          is_active: true
        },
        {
          name: 'system_config:clinic_app_version_name',
          category: 'system_config',
          description: 'Clinic App Latest Version Name',
          search_keywords: clinicAppVersionName.trim(),
          is_active: true
        },
        {
          name: 'system_config:clinic_app_update_url',
          category: 'system_config',
          description: 'Clinic App Play Store / Download URL',
          search_keywords: clinicAppUpdateUrl.trim(),
          is_active: true
        },
        {
          name: 'system_config:clinic_app_release_notes',
          category: 'system_config',
          description: 'Clinic App Release Notes',
          search_keywords: clinicAppReleaseNotes.trim(),
          is_active: true
        },
        {
          name: 'system_config:clinic_app_is_compulsory',
          category: 'system_config',
          description: 'Whether Clinic App Update is Compulsory',
          search_keywords: String(clinicAppIsCompulsory),
          is_active: true
        }
      ]
      await supabase.from('medical_specialties').upsert(configs, { onConflict: 'name' })

      // 2. Also upsert to app_versions table if created
      try {
        await supabase.from('app_versions').upsert({
          app_name: 'clinic_app',
          min_version_code: clinicAppMinCode,
          latest_version_code: clinicAppLatestCode,
          latest_version_name: clinicAppVersionName.trim(),
          update_url: clinicAppUpdateUrl.trim(),
          release_notes: clinicAppReleaseNotes.trim(),
          is_compulsory: clinicAppIsCompulsory,
          updated_at: new Date().toISOString()
        }, { onConflict: 'app_name' })
      } catch (_e) {}

      // 3. Also upsert to system_settings if created
      try {
        const sysSettings = [
          { key: 'clinic_app_min_version_code', value: String(clinicAppMinCode), updated_at: new Date().toISOString() },
          { key: 'clinic_app_latest_version_code', value: String(clinicAppLatestCode), updated_at: new Date().toISOString() },
          { key: 'clinic_app_latest_version_name', value: clinicAppVersionName.trim(), updated_at: new Date().toISOString() },
          { key: 'clinic_app_force_update', value: String(clinicAppIsCompulsory), updated_at: new Date().toISOString() },
          { key: 'clinic_app_update_url', value: clinicAppUpdateUrl.trim(), updated_at: new Date().toISOString() },
          { key: 'clinic_app_update_notes', value: clinicAppReleaseNotes.trim(), updated_at: new Date().toISOString() }
        ]
        await supabase.from('system_settings').upsert(sysSettings, { onConflict: 'key' })
      } catch (_e) {}

      setClinicUpdateStatusMessage('✓ Clinic App Compulsory Update settings successfully published to network!')
      setTimeout(() => setClinicUpdateStatusMessage(''), 5000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to publish clinic app version settings.')
    } finally {
      setClinicUpdateSaving(false)
    }
  }

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setStatusMessage('')
    setErrorMessage('')

    const cleanUrl = supportUrl.trim()
    if (!cleanUrl) {
      setErrorMessage('Please provide a valid support website URL.')
      setSaving(false)
      return
    }

    try {
      // 1. Persist to medical_specialties with category='system_config'
      const specConfigs = [
        {
          name: 'system_config:support_url',
          category: 'system_config',
          description: 'Official Dactor Support Website Destination URL',
          search_keywords: cleanUrl,
          icon: 'Globe',
          is_active: true,
          updated_at: new Date().toISOString()
        },
        {
          name: 'system_config:support_phone',
          category: 'system_config',
          description: 'Support Helpline Phone',
          search_keywords: supportPhone.trim(),
          icon: 'Phone',
          is_active: true,
          updated_at: new Date().toISOString()
        },
        {
          name: 'system_config:support_email',
          category: 'system_config',
          description: 'Support Contact Email',
          search_keywords: supportEmail.trim(),
          icon: 'Mail',
          is_active: true,
          updated_at: new Date().toISOString()
        },
        {
          name: 'system_config:support_hours',
          category: 'system_config',
          description: 'Support Operating Hours',
          search_keywords: supportHours.trim(),
          icon: 'Clock',
          is_active: true,
          updated_at: new Date().toISOString()
        }
      ]

      await supabase.from('medical_specialties').upsert(specConfigs, { onConflict: 'name' })

      // 2. Also attempt writing to system_settings if available
      try {
        const rows = [
          { key: 'support_url', value: cleanUrl, description: 'Official Dactor support URL', updated_at: new Date().toISOString() },
          { key: 'support_phone', value: supportPhone.trim(), description: 'Support phone', updated_at: new Date().toISOString() },
          { key: 'support_email', value: supportEmail.trim(), description: 'Support email', updated_at: new Date().toISOString() },
          { key: 'support_hours', value: supportHours.trim(), description: 'Support hours', updated_at: new Date().toISOString() }
        ]
        await supabase.from('system_settings').upsert(rows, { onConflict: 'key' })
      } catch {}

      // 3. LocalStorage cache for instant fallback
      try {
        localStorage.setItem('dactor_support_url', cleanUrl)
        localStorage.setItem('dactor_support_phone', supportPhone.trim())
        localStorage.setItem('dactor_support_email', supportEmail.trim())
      } catch {}

      setLastUpdated(new Date().toISOString())
      setStatusMessage('Support URL and helpdesk details published successfully to all portals & apps!')
      setTimeout(() => setStatusMessage(''), 6000)
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to publish support URL to Supabase.')
    } finally {
      setSaving(false)
    }
  }

  const applyPreset = (presetUrl: string) => {
    setSupportUrl(presetUrl)
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Support Website & Helpdesk Publisher
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Publish or redirect the official support website URL dynamically across all Clinic, Doctor, and Patient portals.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchSettings}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload Config</span>
          </button>

          {supportUrl && (
            <a
              href={supportUrl.startsWith('http') || supportUrl.startsWith('mailto:') ? supportUrl : `https://${supportUrl}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Test Live URL</span>
            </a>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      
      {/* Clinic & Doctor App Compulsory Update Manager Card */}
      <div className="bg-slate-950/70 border border-sky-900/40 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-sky-400" />
              <span>Clinic & Doctor App — Compulsory Update Enforcer</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              When enabled, any clinic receptionist or doctor running a version code lower than the Minimum Required Version will be immediately and non-dismissibly locked out with a compulsory update screen directing them to the Google Play Store or APK destination.
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
            clinicAppIsCompulsory 
              ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' 
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{clinicAppIsCompulsory ? 'Compulsory Lockout Active' : 'Optional Updates'}</span>
          </span>
        </div>

        {clinicUpdateStatusMessage && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-semibold animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
            <span>{clinicUpdateStatusMessage}</span>
          </div>
        )}

        <form onSubmit={handlePublishClinicAppUpdate} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Minimum Version Code <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                value={clinicAppMinCode}
                onChange={(e) => setClinicAppMinCode(parseInt(e.target.value) || 1)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-sky-500 font-bold"
                required
              />
              <p className="text-[10px] text-slate-500 mt-1">Clinic apps with build code below this are blocked.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Latest Version Code
              </label>
              <input
                type="number"
                value={clinicAppLatestCode}
                onChange={(e) => setClinicAppLatestCode(parseInt(e.target.value) || 1)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-sky-500 font-bold"
              />
              <p className="text-[10px] text-slate-500 mt-1">Current latest build code on store.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Latest Version Name
              </label>
              <input
                type="text"
                value={clinicAppVersionName}
                onChange={(e) => setClinicAppVersionName(e.target.value)}
                placeholder="e.g. 1.0.64"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-sky-500 font-bold"
              />
              <p className="text-[10px] text-slate-500 mt-1">Displayed to doctors & staff (e.g. v1.0.64).</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Google Play Store or Direct APK URL <span className="text-sky-400">*</span>
            </label>
            <input
              type="text"
              value={clinicAppUpdateUrl}
              onChange={(e) => setClinicAppUpdateUrl(e.target.value)}
              placeholder="https://play.google.com/store/apps/details?id=com.dactor.clinic"
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-sky-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Update Notice & Release Notes
            </label>
            <textarea
              rows={2}
              value={clinicAppReleaseNotes}
              onChange={(e) => setClinicAppReleaseNotes(e.target.value)}
              placeholder="Explain the critical improvements in this update..."
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500 resize-none leading-relaxed"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-850">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={clinicAppIsCompulsory}
                onChange={(e) => setClinicAppIsCompulsory(e.target.checked)}
                className="w-4 h-4 rounded text-sky-600 bg-slate-900 border-slate-700 focus:ring-sky-500"
              />
              <span className="text-xs font-bold text-slate-200">
                Make update strictly compulsory (blocks clinic app access until updated)
              </span>
            </label>

            <button
              type="submit"
              disabled={clinicUpdateSaving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-600/25 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
            >
              {clinicUpdateSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Enforcing Network Update...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save & Enforce Clinic App Version</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Patient App Compulsory Update Manager Card */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5 text-emerald-400" />
              <span>Patient App — Compulsory Update Enforcer</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              When enabled, any patient running a version code lower than the Minimum Required Version will be immediately and non-dismissibly blocked with an update screen directing them to the Google Play Store or APK destination.
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
            patientAppIsCompulsory 
              ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' 
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{patientAppIsCompulsory ? 'Compulsory Lockout Active' : 'Optional Updates'}</span>
          </span>
        </div>

        {updateStatusMessage && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{updateStatusMessage}</span>
          </div>
        )}

        <form onSubmit={handlePublishAppUpdate} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Minimum Version Code <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                value={patientAppMinCode}
                onChange={(e) => setPatientAppMinCode(parseInt(e.target.value) || 1)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-emerald-500 font-bold"
                required
              />
              <p className="text-[10px] text-slate-500 mt-1">Apps with code below this are blocked.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Latest Version Code
              </label>
              <input
                type="number"
                value={patientAppLatestCode}
                onChange={(e) => setPatientAppLatestCode(parseInt(e.target.value) || 1)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-emerald-500 font-bold"
              />
              <p className="text-[10px] text-slate-500 mt-1">Current latest build code on store.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Latest Version Name
              </label>
              <input
                type="text"
                value={patientAppVersionName}
                onChange={(e) => setPatientAppVersionName(e.target.value)}
                placeholder="e.g. 1.0.10"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-emerald-500 font-bold"
              />
              <p className="text-[10px] text-slate-500 mt-1">Displayed to users (e.g. v1.0.10).</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Google Play Store or Direct APK URL <span className="text-emerald-400">*</span>
            </label>
            <input
              type="text"
              value={patientAppUpdateUrl}
              onChange={(e) => setPatientAppUpdateUrl(e.target.value)}
              placeholder="https://play.google.com/store/apps/details?id=com.dactor.patient"
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Update Notice & Release Notes
            </label>
            <textarea
              rows={2}
              value={patientAppReleaseNotes}
              onChange={(e) => setPatientAppReleaseNotes(e.target.value)}
              placeholder="Explain the critical improvements in this update..."
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-850">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={patientAppIsCompulsory}
                onChange={(e) => setPatientAppIsCompulsory(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700 focus:ring-emerald-500"
              />
              <span className="text-xs font-bold text-slate-200">
                Make update strictly compulsory (blocks app access until updated)
              </span>
            </label>

            <button
              type="submit"
              disabled={updateSaving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
            >
              {updateSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Enforcing Network Update...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save & Enforce Version Settings</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Publisher Form */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handlePublish} className="bg-slate-950/70 border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-6 shadow-xl">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Publish Target Support Website URL</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                When clinics or doctors are awaiting verification, or when users tap &ldquo;Contact Us&rdquo; in Profile Settings, they will immediately be directed to this destination.
              </p>
            </div>

            {/* Support URL Input */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Official Support Website URL <span className="text-indigo-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Globe className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={supportUrl}
                  onChange={(e) => setSupportUrl(e.target.value)}
                  placeholder="https://rajanpurbe.github.io/Dactor/support or https://wa.me/..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-2xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Can be a standalone website, GitHub Pages site, WhatsApp business link, or custom Zendesk/Intercom portal.
              </p>
            </div>

            {/* Quick URL Presets */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Quick URL Presets
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset('https://rajanpurbe.github.io/Dactor/support')}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 text-left transition text-xs group"
                >
                  <div className="font-bold text-white group-hover:text-indigo-300">GitHub Pages Site</div>
                  <div className="text-[10px] text-slate-500 truncate font-mono">dactorofficial.github.io/support</div>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('https://wa.me/9779800000000?text=Hello%20Dactor%20Support')}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-left transition text-xs group"
                >
                  <div className="font-bold text-white group-hover:text-emerald-300">WhatsApp Helpdesk</div>
                  <div className="text-[10px] text-slate-500 truncate font-mono">wa.me/9779800000000</div>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('mailto:dactorofficial@gmail.com?subject=Dactor%20Verification%20Support')}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 text-left transition text-xs group"
                >
                  <div className="font-bold text-white group-hover:text-sky-300">Email Direct</div>
                  <div className="text-[10px] text-slate-500 truncate font-mono">dactorofficial@gmail.com</div>
                </button>
              </div>
            </div>

            {/* Secondary Contact Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-850">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>Support Helpline Phone</span>
                </label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="+977 9800000000"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>Official Support Email</span>
                </label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="dactorofficial@gmail.com"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Operating Hours Banner</span>
              </label>
              <input
                type="text"
                value={supportHours}
                onChange={(e) => setSupportHours(e.target.value)}
                placeholder="24/7 Regulatory & Onboarding Helpdesk"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Action Bar */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                {lastUpdated ? `Last published: ${new Date(lastUpdated).toLocaleDateString()} ${new Date(lastUpdated).toLocaleTimeString()}` : 'Not yet saved to database'}
              </span>

              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Publishing to Network...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Publish Support URL Directly</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Live Preview & Verification Integration Details */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Preview Card */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-indigo-400" />
                <span>Live Action Preview</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Connected
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Here is how the newly configured Support link appears inside the app verification screens and profile settings:
            </p>

            {/* Mock Pending Verification Card */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>While Profile Is Being Verified</span>
              </div>
              <p className="text-[11px] text-amber-200/80">
                &ldquo;Your medical credentials or clinic registration are under regulatory review...&rdquo;
              </p>
              <div className="pt-1">
                <a
                  href={supportUrl.startsWith('http') || supportUrl.startsWith('mailto:') ? supportUrl : `https://${supportUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:brightness-110 transition"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Contact Dactor Support & Onboarding Desk</span>
                  <ExternalLink className="w-3 h-3 ml-auto opacity-70" />
                </a>
              </div>
            </div>

            {/* Mock Profile Settings Card */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-slate-300 text-xs font-bold">
                <UserCheck className="w-4 h-4 text-indigo-400" />
                <span>Inside Profile & Clinic Settings</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <HelpCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Contact Us & Support</div>
                    <div className="text-[10px] text-slate-400">Helpdesk • FAQs • Regulatory Onboarding</div>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            {/* Deployment Targets Checklist */}
            <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
              <div className="text-slate-400 font-bold text-[11px] uppercase tracking-wider mb-2">
                Automatic Network Targets:
              </div>
              <div className="flex items-center gap-2 text-slate-300 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Clinic Portal (Web & App) Pending Review Screen</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Doctor Portal (Web & App) KYC Pending Screen</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Clinic Settings Screen & Doctor Profile modal</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Patient Portal & Mobile App Profile Settings</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
