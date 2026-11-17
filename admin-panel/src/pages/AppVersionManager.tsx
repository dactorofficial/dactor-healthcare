import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  ArrowUpCircle,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Building2,
  Globe,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  X,
  ShieldAlert
} from 'lucide-react'

interface AppVersionManagerProps {
  onNavigate?: (path: string) => void
}

interface ClosureModalState {
  isOpen: boolean
  appName: 'patient_app' | 'clinic_app' | 'web_app'
  appDisplayName: string
  action: 'close' | 'reopen'
  title: string
  message: string
}

export default function AppVersionManager({ onNavigate: _onNavigate }: AppVersionManagerProps) {
  // Patient App states
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
  const [patientAppIsClosed, setPatientAppIsClosed] = useState<boolean>(false)
  const [patientAppClosureTitle, setPatientAppClosureTitle] = useState<string>('Service Temporarily Paused')
  const [patientAppClosureMessage, setPatientAppClosureMessage] = useState<string>(
    'Dactor Patient App is temporarily closed for scheduled maintenance. Please check back shortly.'
  )
  const [patientSaving, setPatientSaving] = useState<boolean>(false)
  const [patientStatusMessage, setPatientStatusMessage] = useState<string>('')

  // Clinic App states
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
  const [clinicAppIsClosed, setClinicAppIsClosed] = useState<boolean>(false)
  const [clinicAppClosureTitle, setClinicAppClosureTitle] = useState<string>('Clinic Portal Temporarily Closed')
  const [clinicAppClosureMessage, setClinicAppClosureMessage] = useState<string>(
    'Dactor Clinic & Doctor App is temporarily closed for scheduled maintenance. Please check back shortly.'
  )
  const [clinicSaving, setClinicSaving] = useState<boolean>(false)
  const [clinicStatusMessage, setClinicStatusMessage] = useState<string>('')

  // Web App states
  const [webAppUrl, setWebAppUrl] = useState<string>('https://dactor.com')
  const [webAppIsClosed, setWebAppIsClosed] = useState<boolean>(false)
  const [webAppClosureTitle, setWebAppClosureTitle] = useState<string>('Web Portal Temporarily Closed')
  const [webAppClosureMessage, setWebAppClosureMessage] = useState<string>(
    'Dactor Web Portal is temporarily closed for scheduled maintenance. Please check back shortly.'
  )
  const [webSaving, setWebSaving] = useState<boolean>(false)
  const [webStatusMessage, setWebStatusMessage] = useState<string>('')

  const [loading, setLoading] = useState<boolean>(true)
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Modal State for Temporary Close Confirmation
  const [modalState, setModalState] = useState<ClosureModalState>({
    isOpen: false,
    appName: 'patient_app',
    appDisplayName: 'Patient App',
    action: 'close',
    title: '',
    message: ''
  })
  const [modalProcessing, setModalProcessing] = useState<boolean>(false)

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
          if (typeof pData.is_temporarily_closed === 'boolean') setPatientAppIsClosed(pData.is_temporarily_closed)
          if (pData.closure_title) setPatientAppClosureTitle(pData.closure_title)
          if (pData.closure_message) setPatientAppClosureMessage(pData.closure_message)
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
          if (typeof cData.is_temporarily_closed === 'boolean') setClinicAppIsClosed(cData.is_temporarily_closed)
          if (cData.closure_title) setClinicAppClosureTitle(cData.closure_title)
          if (cData.closure_message) setClinicAppClosureMessage(cData.closure_message)
        }

        const { data: wData } = await supabase
          .from('app_versions')
          .select('*')
          .eq('app_name', 'web_app')
          .maybeSingle()

        if (wData) {
          if (wData.update_url) setWebAppUrl(wData.update_url)
          if (typeof wData.is_temporarily_closed === 'boolean') setWebAppIsClosed(wData.is_temporarily_closed)
          if (wData.closure_title) setWebAppClosureTitle(wData.closure_title)
          if (wData.closure_message) setWebAppClosureMessage(wData.closure_message)
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
          if (row.name === 'system_config:patient_app_temporarily_closed' && row.search_keywords)
            setPatientAppIsClosed(row.search_keywords === 'true')
          if (row.name === 'system_config:patient_app_closure_title')
            setPatientAppClosureTitle(row.description || row.search_keywords || 'Service Temporarily Paused')
          if (row.name === 'system_config:patient_app_closure_message')
            setPatientAppClosureMessage(row.description || row.search_keywords || 'Dactor Patient App is temporarily closed for scheduled maintenance.')

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
          if (row.name === 'system_config:clinic_app_temporarily_closed' && row.search_keywords)
            setClinicAppIsClosed(row.search_keywords === 'true')
          if (row.name === 'system_config:clinic_app_closure_title')
            setClinicAppClosureTitle(row.description || row.search_keywords || 'Clinic Portal Temporarily Closed')
          if (row.name === 'system_config:clinic_app_closure_message')
            setClinicAppClosureMessage(row.description || row.search_keywords || 'Dactor Clinic & Doctor App is temporarily closed for scheduled maintenance.')

          if (row.name === 'system_config:web_app_temporarily_closed' && row.search_keywords)
            setWebAppIsClosed(row.search_keywords === 'true')
          if (row.name === 'system_config:web_app_closure_title')
            setWebAppClosureTitle(row.description || row.search_keywords || 'Web Portal Temporarily Closed')
          if (row.name === 'system_config:web_app_closure_message')
            setWebAppClosureMessage(row.description || row.search_keywords || 'Dactor Web Portal is temporarily closed for scheduled maintenance.')
        })
      }
    } catch (err: any) {
      console.warn('Error reading app version settings:', err)
      setErrorMessage(err.message || 'Could not load version settings.')
    } finally {
      setLoading(false)
    }
  }

  // Open Closure Confirmation Modal
  const handleOpenClosureModal = (appName: 'patient_app' | 'clinic_app' | 'web_app', action: 'close' | 'reopen') => {
    let appDisplayName = 'Patient App'
    let title = ''
    let message = ''

    if (appName === 'patient_app') {
      appDisplayName = 'Dactor Patient App'
      title = patientAppClosureTitle || 'Service Temporarily Paused'
      message = patientAppClosureMessage || 'Dactor Patient App is temporarily closed for scheduled maintenance. Please check back shortly.'
    } else if (appName === 'clinic_app') {
      appDisplayName = 'Dactor Clinic & Doctor App'
      title = clinicAppClosureTitle || 'Clinic Portal Temporarily Closed'
      message = clinicAppClosureMessage || 'Dactor Clinic & Doctor App is temporarily closed for scheduled maintenance. Please check back shortly.'
    } else {
      appDisplayName = 'Dactor Web Portal'
      title = webAppClosureTitle || 'Web Portal Temporarily Closed'
      message = webAppClosureMessage || 'Dactor Web Portal is temporarily closed for scheduled maintenance. Please check back shortly.'
    }

    setModalState({
      isOpen: true,
      appName,
      appDisplayName,
      action,
      title,
      message
    })
  }

  // Execute Toggle App Closure (Close or Reopen)
  const handleConfirmToggleClosure = async () => {
    setModalProcessing(true)
    setErrorMessage('')

    const isClosed = modalState.action === 'close'
    const { appName, title, message, appDisplayName } = modalState

    try {
      // 1. Dual-layer upsert to medical_specialties (system_config)
      const configs = [
        {
          name: `system_config:${appName}_temporarily_closed`,
          category: 'system_config',
          description: `${appDisplayName} Temporary Closure Status`,
          search_keywords: String(isClosed),
          is_active: true
        },
        {
          name: `system_config:${appName}_closure_title`,
          category: 'system_config',
          description: title.trim(),
          search_keywords: title.trim(),
          is_active: true
        },
        {
          name: `system_config:${appName}_closure_message`,
          category: 'system_config',
          description: message.trim(),
          search_keywords: message.trim(),
          is_active: true
        }
      ]
      await supabase.from('medical_specialties').upsert(configs, { onConflict: 'name' })

      // 2. Upsert to app_versions table
      try {
        await supabase.from('app_versions').upsert({
          app_name: appName,
          is_temporarily_closed: isClosed,
          closure_title: title.trim(),
          closure_message: message.trim(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'app_name' })
      } catch (_e) {}

      // Update local React state
      if (appName === 'patient_app') {
        setPatientAppIsClosed(isClosed)
        setPatientAppClosureTitle(title)
        setPatientAppClosureMessage(message)
        setPatientStatusMessage(
          isClosed
            ? '✓ Dactor Patient App is now TEMPORARILY CLOSED. All patient devices are locked with maintenance notice.'
            : '✓ Dactor Patient App has been REOPENED. All patient features are now active.'
        )
        setTimeout(() => setPatientStatusMessage(''), 6000)
      } else if (appName === 'clinic_app') {
        setClinicAppIsClosed(isClosed)
        setClinicAppClosureTitle(title)
        setClinicAppClosureMessage(message)
        setClinicStatusMessage(
          isClosed
            ? '✓ Dactor Clinic App is now TEMPORARILY CLOSED. Clinic portals are locked with maintenance notice.'
            : '✓ Dactor Clinic App has been REOPENED. All clinic workflows are active.'
        )
        setTimeout(() => setClinicStatusMessage(''), 6000)
      } else {
        setWebAppIsClosed(isClosed)
        setWebAppClosureTitle(title)
        setWebAppClosureMessage(message)
        setWebStatusMessage(
          isClosed
            ? '✓ Dactor Web Portal is now TEMPORARILY CLOSED. Visitors will see maintenance view.'
            : '✓ Dactor Web Portal has been REOPENED. Web visitors can now access the portal.'
        )
        setTimeout(() => setWebStatusMessage(''), 6000)
      }

      setModalState(prev => ({ ...prev, isOpen: false }))
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to update status for ${appDisplayName}.`)
    } finally {
      setModalProcessing(false)
    }
  }

  // Save Patient App Version Settings
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
        },
        {
          name: 'system_config:patient_app_temporarily_closed',
          category: 'system_config',
          description: 'Patient App Temporary Closure Status',
          search_keywords: String(patientAppIsClosed),
          is_active: true
        },
        {
          name: 'system_config:patient_app_closure_title',
          category: 'system_config',
          description: patientAppClosureTitle.trim(),
          search_keywords: patientAppClosureTitle.trim(),
          is_active: true
        },
        {
          name: 'system_config:patient_app_closure_message',
          category: 'system_config',
          description: patientAppClosureMessage.trim(),
          search_keywords: patientAppClosureMessage.trim(),
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
          is_temporarily_closed: patientAppIsClosed,
          closure_title: patientAppClosureTitle.trim(),
          closure_message: patientAppClosureMessage.trim(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'app_name' })
      } catch (_e) {}

      setPatientStatusMessage(`✓ Patient App settings & Version Code ${patientAppLatestCode} (v${patientAppVersionName}) saved successfully!`)
      setTimeout(() => setPatientStatusMessage(''), 5000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to publish Patient App version settings.')
    } finally {
      setPatientSaving(false)
    }
  }

  // Save Clinic App Version Settings
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
        },
        {
          name: 'system_config:clinic_app_temporarily_closed',
          category: 'system_config',
          description: 'Clinic App Temporary Closure Status',
          search_keywords: String(clinicAppIsClosed),
          is_active: true
        },
        {
          name: 'system_config:clinic_app_closure_title',
          category: 'system_config',
          description: clinicAppClosureTitle.trim(),
          search_keywords: clinicAppClosureTitle.trim(),
          is_active: true
        },
        {
          name: 'system_config:clinic_app_closure_message',
          category: 'system_config',
          description: clinicAppClosureMessage.trim(),
          search_keywords: clinicAppClosureMessage.trim(),
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
          is_temporarily_closed: clinicAppIsClosed,
          closure_title: clinicAppClosureTitle.trim(),
          closure_message: clinicAppClosureMessage.trim(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'app_name' })
      } catch (_e) {}

      setClinicStatusMessage(`✓ Clinic App settings & Version Code ${clinicAppLatestCode} (v${clinicAppVersionName}) saved successfully!`)
      setTimeout(() => setClinicStatusMessage(''), 5000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to publish Clinic App version settings.')
    } finally {
      setClinicSaving(false)
    }
  }

  // Save Web App Settings
  const handleSaveWebApp = async (e: React.FormEvent) => {
    e.preventDefault()
    setWebSaving(true)
    setWebStatusMessage('')
    setErrorMessage('')

    try {
      const configs = [
        {
          name: 'system_config:web_app_update_url',
          category: 'system_config',
          description: 'Web Portal URL',
          search_keywords: webAppUrl.trim(),
          is_active: true
        },
        {
          name: 'system_config:web_app_temporarily_closed',
          category: 'system_config',
          description: 'Web App Temporary Closure Status',
          search_keywords: String(webAppIsClosed),
          is_active: true
        },
        {
          name: 'system_config:web_app_closure_title',
          category: 'system_config',
          description: webAppClosureTitle.trim(),
          search_keywords: webAppClosureTitle.trim(),
          is_active: true
        },
        {
          name: 'system_config:web_app_closure_message',
          category: 'system_config',
          description: webAppClosureMessage.trim(),
          search_keywords: webAppClosureMessage.trim(),
          is_active: true
        }
      ]
      await supabase.from('medical_specialties').upsert(configs, { onConflict: 'name' })

      try {
        await supabase.from('app_versions').upsert({
          app_name: 'web_app',
          update_url: webAppUrl.trim(),
          is_temporarily_closed: webAppIsClosed,
          closure_title: webAppClosureTitle.trim(),
          closure_message: webAppClosureMessage.trim(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'app_name' })
      } catch (_e) {}

      setWebStatusMessage(`✓ Web Portal operational settings saved successfully!`)
      setTimeout(() => setWebStatusMessage(''), 5000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to publish Web App settings.')
    } finally {
      setWebSaving(false)
    }
  }

  const anyAppClosed = patientAppIsClosed || clinicAppIsClosed || webAppIsClosed

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ArrowUpCircle className="w-6 h-6 text-emerald-400" />
            App Control & Temporary Closure Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Superadmin master switches to temporarily close specific apps for maintenance, enforce compulsory updates, and set release versions.
          </p>
        </div>

        <button
          onClick={fetchVersions}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-2 border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh All Status</span>
        </button>
      </div>

      {/* Global Notice if Any App is Temporarily Closed */}
      {anyAppClosed && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />
          <div className="flex-1">
            <span className="font-bold">Operational Alert:</span> One or more applications are currently{' '}
            <span className="font-bold underline text-amber-200">TEMPORARILY CLOSED</span>. Users accessing closed apps will be presented with maintenance screens.
          </div>
        </div>
      )}

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: 3 Cards (Patient App, Clinic App, Web Portal) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ========================================================= */}
        {/* 1. PATIENT APP CARD */}
        {/* ========================================================= */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 flex flex-col justify-between relative">
          <div className="space-y-4">
            {/* Card Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Dactor Patient App</h2>
                  <p className="text-xs text-slate-400">Play Store Android Mobile App</p>
                </div>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  patientAppIsClosed
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                }`}
              >
                {patientAppIsClosed ? 'PAUSED / CLOSED' : 'OPERATIONAL'}
              </span>
            </div>

            {/* Temporary Closure Action Box & Button */}
            <div
              className={`p-4 rounded-2xl border transition-all ${
                patientAppIsClosed
                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  : 'bg-slate-950/80 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      patientAppIsClosed ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {patientAppIsClosed ? 'App Currently Closed' : 'App Currently Live'}
                  </span>
                </div>

                {/* THE PRIMARY BUTTON TO TEMPORARILY CLOSE / REOPEN PATIENT APP */}
                {patientAppIsClosed ? (
                  <button
                    type="button"
                    onClick={() => handleOpenClosureModal('patient_app', 'reopen')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95"
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>Reopen Patient App</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenClosureModal('patient_app', 'close')}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition active:scale-95"
                  >
                    <PauseCircle className="w-4 h-4" />
                    <span>Temporarily Close App</span>
                  </button>
                )}
              </div>

              {/* Notice Title & Message for Patient App */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Closure Notice Title
                  </label>
                  <input
                    type="text"
                    value={patientAppClosureTitle}
                    onChange={e => setPatientAppClosureTitle(e.target.value)}
                    placeholder="Service Temporarily Paused"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs font-semibold focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Notice Description
                  </label>
                  <textarea
                    rows={2}
                    value={patientAppClosureMessage}
                    onChange={e => setPatientAppClosureMessage(e.target.value)}
                    placeholder="Enter reason for temporary closure..."
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-emerald-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {patientStatusMessage && (
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{patientStatusMessage}</span>
              </div>
            )}

            {/* Version & Lockout Form */}
            <form onSubmit={handleSavePatientApp} className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Min Code *
                  </label>
                  <input
                    type="number"
                    value={patientAppMinCode}
                    onChange={e => setPatientAppMinCode(parseInt(e.target.value) || 1)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono font-bold focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Target Code *
                  </label>
                  <input
                    type="number"
                    value={patientAppLatestCode}
                    onChange={e => setPatientAppLatestCode(parseInt(e.target.value) || 1)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 text-xs font-mono font-bold focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Version Name
                </label>
                <input
                  type="text"
                  value={patientAppVersionName}
                  onChange={e => setPatientAppVersionName(e.target.value)}
                  placeholder="1.0.10"
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Play Store URL
                </label>
                <input
                  type="text"
                  value={patientAppUpdateUrl}
                  onChange={e => setPatientAppUpdateUrl(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-[11px] font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Release Notes
                </label>
                <textarea
                  rows={2}
                  value={patientAppReleaseNotes}
                  onChange={e => setPatientAppReleaseNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={patientAppIsCompulsory}
                    onChange={e => setPatientAppIsCompulsory(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-emerald-600 bg-slate-950 border-slate-700"
                  />
                  <span className="text-[11px] font-bold text-slate-300">Compulsory Lockout</span>
                </label>

                <button
                  type="submit"
                  disabled={patientSaving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {patientSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 2. CLINIC APP CARD */}
        {/* ========================================================= */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 flex flex-col justify-between relative">
          <div className="space-y-4">
            {/* Card Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Dactor Clinic & Doctor App</h2>
                  <p className="text-xs text-slate-400">Reception & Doctor OPD Mobile App</p>
                </div>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  clinicAppIsClosed
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                    : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                }`}
              >
                {clinicAppIsClosed ? 'PAUSED / CLOSED' : 'OPERATIONAL'}
              </span>
            </div>

            {/* Temporary Closure Action Box & Button */}
            <div
              className={`p-4 rounded-2xl border transition-all ${
                clinicAppIsClosed
                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  : 'bg-slate-950/80 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      clinicAppIsClosed ? 'bg-rose-500 animate-ping' : 'bg-sky-500'
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {clinicAppIsClosed ? 'App Currently Closed' : 'App Currently Live'}
                  </span>
                </div>

                {/* THE PRIMARY BUTTON TO TEMPORARILY CLOSE / REOPEN CLINIC APP */}
                {clinicAppIsClosed ? (
                  <button
                    type="button"
                    onClick={() => handleOpenClosureModal('clinic_app', 'reopen')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95"
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>Reopen Clinic App</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenClosureModal('clinic_app', 'close')}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition active:scale-95"
                  >
                    <PauseCircle className="w-4 h-4" />
                    <span>Temporarily Close App</span>
                  </button>
                )}
              </div>

              {/* Notice Title & Message for Clinic App */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Closure Notice Title
                  </label>
                  <input
                    type="text"
                    value={clinicAppClosureTitle}
                    onChange={e => setClinicAppClosureTitle(e.target.value)}
                    placeholder="Clinic Portal Temporarily Closed"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs font-semibold focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Notice Description
                  </label>
                  <textarea
                    rows={2}
                    value={clinicAppClosureMessage}
                    onChange={e => setClinicAppClosureMessage(e.target.value)}
                    placeholder="Enter reason for clinic app temporary closure..."
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-sky-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {clinicStatusMessage && (
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
                <span>{clinicStatusMessage}</span>
              </div>
            )}

            {/* Version & Lockout Form */}
            <form onSubmit={handleSaveClinicApp} className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Min Code *
                  </label>
                  <input
                    type="number"
                    value={clinicAppMinCode}
                    onChange={e => setClinicAppMinCode(parseInt(e.target.value) || 1)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono font-bold focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Target Code *
                  </label>
                  <input
                    type="number"
                    value={clinicAppLatestCode}
                    onChange={e => setClinicAppLatestCode(parseInt(e.target.value) || 1)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-sky-400 text-xs font-mono font-bold focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Version Name
                </label>
                <input
                  type="text"
                  value={clinicAppVersionName}
                  onChange={e => setClinicAppVersionName(e.target.value)}
                  placeholder="1.0.64"
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Play Store URL
                </label>
                <input
                  type="text"
                  value={clinicAppUpdateUrl}
                  onChange={e => setClinicAppUpdateUrl(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-[11px] font-mono focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Release Notes
                </label>
                <textarea
                  rows={2}
                  value={clinicAppReleaseNotes}
                  onChange={e => setClinicAppReleaseNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500 resize-none"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={clinicAppIsCompulsory}
                    onChange={e => setClinicAppIsCompulsory(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-sky-600 bg-slate-950 border-slate-700"
                  />
                  <span className="text-[11px] font-bold text-slate-300">Compulsory Lockout</span>
                </label>

                <button
                  type="submit"
                  disabled={clinicSaving}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md shadow-sky-600/30 flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {clinicSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 3. WEB APP CARD */}
        {/* ========================================================= */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 flex flex-col justify-between relative">
          <div className="space-y-4">
            {/* Card Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Globe className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Dactor Web Portal</h2>
                  <p className="text-xs text-slate-400">Patient & Clinic Browser Portal</p>
                </div>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  webAppIsClosed
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                    : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                }`}
              >
                {webAppIsClosed ? 'PAUSED / CLOSED' : 'OPERATIONAL'}
              </span>
            </div>

            {/* Temporary Closure Action Box & Button */}
            <div
              className={`p-4 rounded-2xl border transition-all ${
                webAppIsClosed
                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  : 'bg-slate-950/80 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      webAppIsClosed ? 'bg-rose-500 animate-ping' : 'bg-indigo-500'
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {webAppIsClosed ? 'Portal Currently Closed' : 'Portal Currently Live'}
                  </span>
                </div>

                {/* THE PRIMARY BUTTON TO TEMPORARILY CLOSE / REOPEN WEB PORTAL */}
                {webAppIsClosed ? (
                  <button
                    type="button"
                    onClick={() => handleOpenClosureModal('web_app', 'reopen')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95"
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>Reopen Web Portal</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenClosureModal('web_app', 'close')}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition active:scale-95"
                  >
                    <PauseCircle className="w-4 h-4" />
                    <span>Temporarily Close Web</span>
                  </button>
                )}
              </div>

              {/* Notice Title & Message for Web Portal */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Closure Notice Title
                  </label>
                  <input
                    type="text"
                    value={webAppClosureTitle}
                    onChange={e => setWebAppClosureTitle(e.target.value)}
                    placeholder="Web Portal Temporarily Closed"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Notice Description
                  </label>
                  <textarea
                    rows={2}
                    value={webAppClosureMessage}
                    onChange={e => setWebAppClosureMessage(e.target.value)}
                    placeholder="Enter reason for web portal temporary closure..."
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {webStatusMessage && (
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>{webStatusMessage}</span>
              </div>
            )}

            {/* Web App Config Form */}
            <form onSubmit={handleSaveWebApp} className="space-y-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Web Portal Domain URL
                </label>
                <input
                  type="text"
                  value={webAppUrl}
                  onChange={e => setWebAppUrl(e.target.value)}
                  placeholder="https://dactor.com"
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                When closed, browser visitors navigating to the web portal will see the maintenance screen with real-time status retry.
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={webSaving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {webSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Web Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* CONFIRMATION MODAL FOR TEMPORARY CLOSURE / REOPEN */}
      {/* ========================================================= */}
      {modalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-2xl ${
                    modalState.action === 'close'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {modalState.action === 'close' ? (
                    <ShieldAlert className="w-6 h-6" />
                  ) : (
                    <PlayCircle className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {modalState.action === 'close'
                      ? `Temporarily Close ${modalState.appDisplayName}?`
                      : `Reopen ${modalState.appDisplayName}?`}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {modalState.action === 'close'
                      ? 'App will immediately lock for all users until reopened.'
                      : 'Restore full operational service for all users.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notice Fields in Modal */}
            <div className="space-y-3 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Notice Headline
                </label>
                <input
                  type="text"
                  value={modalState.title}
                  onChange={e => setModalState(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Notice Message
                </label>
                <textarea
                  rows={3}
                  value={modalState.message}
                  onChange={e => setModalState(prev => ({ ...prev, message: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                disabled={modalProcessing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmToggleClosure}
                disabled={modalProcessing}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-lg ${
                  modalState.action === 'close'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                }`}
              >
                {modalProcessing && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>
                  {modalState.action === 'close'
                    ? 'Confirm & Temporarily Close'
                    : 'Confirm & Reopen App'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
