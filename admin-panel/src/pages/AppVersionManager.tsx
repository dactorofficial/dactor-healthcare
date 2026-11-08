import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  ArrowUpCircle,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Building2
} from 'lucide-react'

interface AppVersionManagerProps {
  onNavigate?: (path: string) => void
}

export default function AppVersionManager({ onNavigate: _onNavigate }: AppVersionManagerProps) {
  // Patient App Compulsory Update states
  const [patientAppMinCode, setPatientAppMinCode] = useState<number>(110)
  const [patientAppLatestCode, setPatientAppLatestCode] = useState<number>(110)
  const [patientAppVersionName, setPatientAppVersionName] = useState<string>('1.0.10')
  const [patientAppUpdateUrl, setPatientAppUpdateUrl] = useState<string>(
    'https://play.google.com/store/apps/details?id=com.dactor.patient'
  )
  const [patientAppReleaseNotes, setPatientAppReleaseNotes] = useState<string>(
    'Critical security enhancements, live OPD queue tracking stability, and doctor presence alerts.'
  )
  const [patientAppIsCompulsory, setPatientAppIsCompulsory] = useState<boolean>(true)
  const [patientSaving, setPatientSaving] = useState<boolean>(false)
  const [patientStatusMessage, setPatientStatusMessage] = useState<string>('')

  // Clinic App Compulsory Update states
  const [clinicAppMinCode, setClinicAppMinCode] = useState<number>(64)
  const [clinicAppLatestCode, setClinicAppLatestCode] = useState<number>(64)
  const [clinicAppVersionName, setClinicAppVersionName] = useState<string>('1.0.64')
  const [clinicAppUpdateUrl, setClinicAppUpdateUrl] = useState<string>(
    'https://play.google.com/store/apps/details?id=com.dactor.clinic'
  )
  const [clinicAppReleaseNotes, setClinicAppReleaseNotes] = useState<string>(
    'Critical patient queue synchronization, appointment security, and live clinic workflows.'
  )
  const [clinicAppIsCompulsory, setClinicAppIsCompulsory] = useState<boolean>(true)
  const [clinicSaving, setClinicSaving] = useState<boolean>(false)
  const [clinicStatusMessage, setClinicStatusMessage] = useState<string>('')

  const [loading, setLoading] = useState<boolean>(true)
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    fetchVersions()
  }, [])

  const fetchVersions = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      // 1. Try querying app_versions table
      try {
        const { data: pData } = await supabase
          .from('app_versions')
          .select('*')
          .eq('app_name', 'patient_app')
          .maybeSingle()

        if (pData) {
          if (pData.min_version_code) setPatientAppMinCode(pData.min_version_code)
          if (pData.latest_version_code) setPatientAppLatestCode(pData.latest_version_code)
          if (pData.latest_version_name) setPatientAppVersionName(pData.latest_version_name)
          if (pData.update_url) setPatientAppUpdateUrl(pData.update_url)
          if (pData.release_notes) setPatientAppReleaseNotes(pData.release_notes)
          if (typeof pData.is_compulsory === 'boolean') setPatientAppIsCompulsory(pData.is_compulsory)
        }

        const { data: cData } = await supabase
          .from('app_versions')
          .select('*')
          .eq('app_name', 'clinic_app')
          .maybeSingle()

        if (cData) {
          if (cData.min_version_code) setClinicAppMinCode(cData.min_version_code)
          if (cData.latest_version_code) setClinicAppLatestCode(cData.latest_version_code)
          if (cData.latest_version_name) setClinicAppVersionName(cData.latest_version_name)
          if (cData.update_url) setClinicAppUpdateUrl(cData.update_url)
          if (cData.release_notes) setClinicAppReleaseNotes(cData.release_notes)
          if (typeof cData.is_compulsory === 'boolean') setClinicAppIsCompulsory(cData.is_compulsory)
        }
      } catch (_e) {
        // ignore table-not-found, fallback to medical_specialties
      }

      // 2. Query medical_specialties (system_config fallback)
      const { data: specData } = await supabase
        .from('medical_specialties')
        .select('*')
        .eq('category', 'system_config')

      if (specData && specData.length > 0) {
        specData.forEach(row => {
          if (row.name === 'system_config:patient_app_min_version' && row.search_keywords)
            setPatientAppMinCode(parseInt(row.search_keywords) || 110)
          if (row.name === 'system_config:patient_app_latest_version' && row.search_keywords)
            setPatientAppLatestCode(parseInt(row.search_keywords) || 110)
          if (row.name === 'system_config:patient_app_version_name' && row.search_keywords)
            setPatientAppVersionName(row.search_keywords)
          if (row.name === 'system_config:patient_app_update_url' && row.search_keywords)
            setPatientAppUpdateUrl(row.search_keywords)
          if (row.name === 'system_config:patient_app_release_notes' && row.search_keywords)
            setPatientAppReleaseNotes(row.search_keywords)
          if (row.name === 'system_config:patient_app_is_compulsory' && row.search_keywords)
            setPatientAppIsCompulsory(row.search_keywords === 'true')

          if ((row.name === 'system_config:clinic_app_min_version' || row.name === 'system_config:clinic_min_version_code') && row.search_keywords)
            setClinicAppMinCode(parseInt(row.search_keywords) || 64)
          if ((row.name === 'system_config:clinic_app_latest_version' || row.name === 'system_config:clinic_latest_version_code') && row.search_keywords)
            setClinicAppLatestCode(parseInt(row.search_keywords) || 64)
          if ((row.name === 'system_config:clinic_app_version_name' || row.name === 'system_config:clinic_latest_version_name') && row.search_keywords)
            setClinicAppVersionName(row.search_keywords)
          if ((row.name === 'system_config:clinic_app_update_url' || row.name === 'system_config:clinic_update_url') && row.search_keywords)
            setClinicAppUpdateUrl(row.search_keywords)
          if ((row.name === 'system_config:clinic_app_release_notes' || row.name === 'system_config:clinic_update_notes') && row.search_keywords)
            setClinicAppReleaseNotes(row.search_keywords)
          if ((row.name === 'system_config:clinic_app_is_compulsory' || row.name === 'system_config:clinic_force_update') && row.search_keywords)
            setClinicAppIsCompulsory(row.search_keywords === 'true')
        })
      }
    } catch (err: any) {
      console.warn('Error reading app version settings:', err)
      setErrorMessage(err.message || 'Could not load version settings.')
    } finally {
      setLoading(false)
    }
  }

  const handleSavePatientApp = async (e: React.FormEvent) => {
    e.preventDefault()
    setPatientSaving(true)
    setPatientStatusMessage('')
    setErrorMessage('')

    try {
      // 1. Dual-layer upsert to medical_specialties
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

      setPatientStatusMessage(`✓ Patient App Version Code ${patientAppLatestCode} (v${patientAppVersionName}) successfully saved and enforced across the network!`)
      setTimeout(() => setPatientStatusMessage(''), 5000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to publish Patient App version settings.')
    } finally {
      setPatientSaving(false)
    }
  }

  const handleSaveClinicApp = async (e: React.FormEvent) => {
    e.preventDefault()
    setClinicSaving(true)
    setClinicStatusMessage('')
    setErrorMessage('')

    try {
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

      setClinicStatusMessage(`✓ Clinic App Version Code ${clinicAppLatestCode} (v${clinicAppVersionName}) successfully saved!`)
      setTimeout(() => setClinicStatusMessage(''), 5000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to publish Clinic App version settings.')
    } finally {
      setClinicSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ArrowUpCircle className="w-6 h-6 text-emerald-400" />
            App Version & Compulsory Update Control
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Dedicated portal to set minimum and latest build version codes for Patient and Clinic apps.
          </p>
        </div>

        <button
          onClick={fetchVersions}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-2 border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Versions</span>
        </button>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: Patient App on Left, Clinic App on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PATIENT APP CARD */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 relative">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Dactor Patient App</h2>
                <p className="text-xs text-slate-400">Play Store Android App</p>
              </div>
            </div>

            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              patientAppIsCompulsory
                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {patientAppIsCompulsory ? 'Compulsory Lockout Active' : 'Optional Updates'}
            </span>
          </div>

          {patientStatusMessage && (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{patientStatusMessage}</span>
            </div>
          )}

          <form onSubmit={handleSavePatientApp} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Min Version Code *
                </label>
                <input
                  type="number"
                  value={patientAppMinCode}
                  onChange={e => setPatientAppMinCode(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-emerald-500 font-bold"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">Below this is blocked.</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Latest Version Code *
                </label>
                <input
                  type="number"
                  value={patientAppLatestCode}
                  onChange={e => setPatientAppLatestCode(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-emerald-500 font-bold text-emerald-400"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">Target active code (110).</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Version Name
                </label>
                <input
                  type="text"
                  value={patientAppVersionName}
                  onChange={e => setPatientAppVersionName(e.target.value)}
                  placeholder="1.0.10"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-emerald-500 font-bold"
                />
                <p className="text-[10px] text-slate-500 mt-1">e.g. 1.0.10</p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Play Store / Update URL *
              </label>
              <input
                type="text"
                value={patientAppUpdateUrl}
                onChange={e => setPatientAppUpdateUrl(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Release Notes / Notice Message
              </label>
              <textarea
                rows={2}
                value={patientAppReleaseNotes}
                onChange={e => setPatientAppReleaseNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={patientAppIsCompulsory}
                  onChange={e => setPatientAppIsCompulsory(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 bg-slate-950 border-slate-700"
                />
                <span className="text-xs font-bold text-slate-300">Compulsory Lockout</span>
              </label>

              <button
                type="submit"
                disabled={patientSaving}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition disabled:opacity-50"
              >
                {patientSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save Patient Version (110)</span>
              </button>
            </div>
          </form>
        </div>

        {/* CLINIC APP CARD */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 relative">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Dactor Clinic & Doctor App</h2>
                <p className="text-xs text-slate-400">Clinic Portal & OPD App</p>
              </div>
            </div>

            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              clinicAppIsCompulsory
                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {clinicAppIsCompulsory ? 'Compulsory Lockout Active' : 'Optional Updates'}
            </span>
          </div>

          {clinicStatusMessage && (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
              <span>{clinicStatusMessage}</span>
            </div>
          )}

          <form onSubmit={handleSaveClinicApp} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Min Version Code *
                </label>
                <input
                  type="number"
                  value={clinicAppMinCode}
                  onChange={e => setClinicAppMinCode(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-sky-500 font-bold"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">Below this is blocked.</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Latest Version Code *
                </label>
                <input
                  type="number"
                  value={clinicAppLatestCode}
                  onChange={e => setClinicAppLatestCode(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-sky-500 font-bold text-sky-400"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">Current clinic code (64).</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Version Name
                </label>
                <input
                  type="text"
                  value={clinicAppVersionName}
                  onChange={e => setClinicAppVersionName(e.target.value)}
                  placeholder="1.0.64"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-sky-500 font-bold"
                />
                <p className="text-[10px] text-slate-500 mt-1">e.g. 1.0.64</p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Play Store / Update URL *
              </label>
              <input
                type="text"
                value={clinicAppUpdateUrl}
                onChange={e => setClinicAppUpdateUrl(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Release Notes / Notice Message
              </label>
              <textarea
                rows={2}
                value={clinicAppReleaseNotes}
                onChange={e => setClinicAppReleaseNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500 resize-none"
              />
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={clinicAppIsCompulsory}
                  onChange={e => setClinicAppIsCompulsory(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-600 bg-slate-950 border-slate-700"
                />
                <span className="text-xs font-bold text-slate-300">Compulsory Lockout</span>
              </label>

              <button
                type="submit"
                disabled={clinicSaving}
                className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg shadow-sky-600/30 flex items-center gap-2 transition disabled:opacity-50"
              >
                {clinicSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save Clinic Version</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
