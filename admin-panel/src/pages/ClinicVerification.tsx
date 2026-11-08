import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Clinic, ClinicType, VerificationStatus } from '../lib/types'
import { resolveImageUrl } from '../lib/storage'
import ClinicImageModal from '../components/ClinicImageModal'
import {
  CheckCircle2,
  X,
  XCircle,
  MapPin,
  Phone,
  Mail,
  Building,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Shield,
  AlertCircle,
  Trash2,
  Edit,
  Camera
} from 'lucide-react'

async function parseClinicMeta(clinic: Clinic): Promise<Clinic> {
  let pan = clinic.pan_number || ''
  let managerPhone = clinic.manager_phone || ''
  let pictures = clinic.pictures || []
  let regDoc = clinic.registration_doc_url || ''
  let cleanDesc = clinic.description || ''

  if (clinic.description && clinic.description.trim().startsWith('{')) {
    try {
      const meta = JSON.parse(clinic.description)
      pan = pan || meta.pan_number || meta.pan || ''
      managerPhone = managerPhone || meta.manager_phone || meta.managerPhone || ''
      pictures = (pictures && pictures.length > 0) ? pictures : (meta.pictures || [])
      regDoc = regDoc || meta.registration_doc_url || meta.regDoc || ''
      cleanDesc = meta.desc || meta.description || ''
    } catch (e) {
      console.warn('Error parsing clinic description JSON:', e)
    }
  }

  // Handle postgres string array or json string format
  if (typeof pictures === 'string') {
    try {
      if ((pictures as string).startsWith('[')) {
        pictures = JSON.parse(pictures)
      } else if ((pictures as string).startsWith('{')) {
        pictures = (pictures as string).slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean)
      } else {
        pictures = [(pictures as string).trim()].filter(Boolean)
      }
    } catch (e) {
      pictures = []
    }
  }

  // Resolve pictures: if relative storage path, convert to public Supabase Storage URL
  if (Array.isArray(pictures)) {
    pictures = pictures.map((pic: string) => {
      if (!pic) return ''
      if (pic.startsWith('content://')) return pic
      if (pic.startsWith('http')) return pic
      const clean = pic.replace(/^clinic_photos\//, '').replace(/^\//, '')
      const { data } = supabase.storage.from('clinic_photos').getPublicUrl(clean)
      return data?.publicUrl || pic
    }).filter(Boolean)
  }

  // Resolve registration document URL via short-lived signed URL from clinic-docs-private (900s expiry)
  if (regDoc && !regDoc.startsWith('content://')) {
    let clean = regDoc.split('?')[0]
    clean = clean.replace(/^https?:\/\/[^\/]+\/storage\/v1\/object\/(public|sign)\/[^\/]+\//, '')
    clean = clean.replace(/^(clinic_photos|clinic-docs-private|clinic_files)\//, '')
    clean = clean.replace(/^\//, '')

    if (clean) {
      try {
        const { data: signedData, error: signErr } = await supabase.storage
          .from('clinic-docs-private')
          .createSignedUrl(clean, 900)
        if (!signErr && signedData?.signedUrl) {
          regDoc = signedData.signedUrl
        }
      } catch (err) {
        console.warn('Error generating signed URL for clinic registration doc:', err)
      }
    }
  }

  return {
    ...clinic,
    pan_number: pan,
    manager_phone: managerPhone,
    pictures,
    registration_doc_url: regDoc,
    description: cleanDesc
  }
}

export default function ClinicVerification() {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null)
  const [editingImagesClinic, setEditingImagesClinic] = useState<Clinic | null>(null)

  useEffect(() => {
    fetchClinics()
    // Auto-refresh every 8 seconds to catch incoming submissions in real time
    const interval = setInterval(() => {
      fetchClinics(false)
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  const fetchClinics = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      setIsRefreshing(true)
      setErrorMsg(null)

      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase fetch clinics error:', error)
        setErrorMsg(error.message)
      } else if (data) {
        const enriched = await Promise.all((data as Clinic[]).map(parseClinicMeta))
        setClinics(enriched)
      }
    } catch (e: any) {
      console.error('Fetch clinics exception:', e)
      setErrorMsg(e?.message || 'Network error fetching clinics')
    } finally {
      if (showLoading) setLoading(false)
      setIsRefreshing(false)
    }
  }

  const updateStatus = async (id: string, status: VerificationStatus) => {
    try {
      const updates: any = { verification_status: status }
      if (status === 'approved') {
        const existing = clinics.find(c => c.id === id)
        if (!existing?.activation_expires_at) {
          updates.is_activated = true
          updates.activation_expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      }
      const { error } = await supabase.from('clinics').update(updates).eq('id', id)
      if (error) {
        console.error('Error updating status in Supabase:', error)
        alert(`Failed to update status in Supabase: ${error.message}`)
        return
      }
      setClinics(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    } catch (e: any) {
      console.warn('Update status error:', e)
      alert(`Error updating clinic status: ${e?.message || e}`)
    }
  }

  const updateType = async (id: string, type: ClinicType) => {
    try {
      const { error } = await supabase.from('clinics').update({ type }).eq('id', id)
      if (error) {
        console.error('Error updating clinic type in Supabase:', error)
      }
      setClinics(prev => prev.map(c => c.id === id ? { ...c, type } : c))
    } catch (e) {
      console.warn('Updated locally:', e)
    }
  }

  const archiveClinic = async (id: string, name: string) => {
    if (!window.confirm(`Move "${name}" to the Recycle Bin? It will be archived for 30 days before permanent deletion.`)) return
    try {
      const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const updates = {
        is_archived: true,
        archived_at: new Date().toISOString(),
        deletion_scheduled_at: scheduledDate,
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase.from('clinics').update(updates).eq('id', id)
      if (error) {
        alert(`Failed to archive clinic: ${error.message}`)
      } else {
        setClinics(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
      }
    } catch (e: any) {
      alert(`Error archiving clinic: ${e?.message || e}`)
    }
  }

  const filteredClinics = clinics.filter(c => {
    if (c.is_archived) return false
    if (filter === 'all') return true
    return c.verification_status === filter
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Clinic Verification & Categorization</h1>
            <button
              onClick={() => fetchClinics(true)}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition disabled:opacity-50"
              title="Refresh clinic list"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
          <p className="text-slate-400 text-sm mt-1">Review incoming registrations, inspect documents & pictures, and grant clinic operational access.</p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-semibold">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition ${filter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            All ({clinics.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-lg transition ${filter === 'pending' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Pending ({clinics.filter(c => c.verification_status === 'pending').length})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1.5 rounded-lg transition ${filter === 'approved' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Approved ({clinics.filter(c => c.verification_status === 'approved').length})
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg transition ${filter === 'rejected' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Rejected ({clinics.filter(c => c.verification_status === 'rejected').length})
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Error loading clinic records: {errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
          <span>Loading clinic records from database...</span>
        </div>
      ) : filteredClinics.length === 0 ? (
        <div className="bg-slate-800/60 border border-slate-700 p-12 text-center rounded-2xl text-slate-400">
          No clinics found in this filter category.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredClinics.map(clinic => (
            <div key={clinic.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row lg:items-start justify-between gap-6">
              <div className="space-y-4 flex-1">
                {/* Header Row */}
                <div className="flex items-start gap-3">
                  <div
                    onClick={() => setEditingImagesClinic(clinic)}
                    className="relative group w-14 h-14 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5 overflow-hidden cursor-pointer shadow-sm hover:border-indigo-400 transition"
                    title="Click to edit clinic logo & pictures"
                  >
                    {clinic.logo_url ? (
                      <img
                        src={resolveImageUrl(clinic.logo_url, 'clinic_photos')}
                        alt={clinic.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                        onError={e => {
                          (e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <Building className="w-6 h-6" />
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-0.5">
                      <Camera className="w-4 h-4 text-white" />
                      <span className="text-[8px] text-white font-bold uppercase tracking-wider">Logo</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-lg text-white">{clinic.name}</h3>
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                        clinic.verification_status === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : clinic.verification_status === 'rejected'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {clinic.verification_status ? clinic.verification_status.toUpperCase() : 'PENDING'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1">
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-500" /> {clinic.address_text || 'Nepal'}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-500" /> Clinic: {clinic.contact_phone}</span>
                      <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-slate-500" /> {clinic.contact_email}</span>
                    </div>
                  </div>
                </div>

                {/* Badges / Key Metadata */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {clinic.pan_number && (
                    <span className="flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700 text-indigo-300 font-mono font-semibold">
                      <Shield className="w-3.5 h-3.5 text-indigo-400" /> PAN: {clinic.pan_number}
                    </span>
                  )}
                  {clinic.manager_phone && (
                    <span className="flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700 text-slate-300">
                      <Phone className="w-3.5 h-3.5 text-slate-400" /> Manager: {clinic.manager_phone}
                    </span>
                  )}
                  {clinic.registration_doc_url && (
                    clinic.registration_doc_url.startsWith('content://') ? (
                      <span
                        title="Uploaded from older mobile build (local phone URI). Requires updated mobile build to upload to Supabase Storage."
                        className="flex items-center gap-1 bg-amber-950/40 text-amber-400 px-2.5 py-1 rounded-lg border border-amber-700/50 font-semibold"
                      >
                        <FileText className="w-3.5 h-3.5" /> Registration Paper (Old Mobile URI)
                      </span>
                    ) : (
                      <a
                        href={clinic.registration_doc_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={async (e) => {
                          if (!clinic.registration_doc_url || clinic.registration_doc_url.startsWith('content://')) return
                          let clean = clinic.registration_doc_url.split('?')[0]
                          clean = clean.replace(/^https?:\/\/[^\/]+\/storage\/v1\/object\/(public|sign)\/[^\/]+\//, '')
                          clean = clean.replace(/^(clinic_photos|clinic-docs-private|clinic_files)\//, '')
                          clean = clean.replace(/^\//, '')
                          if (clean && !clinic.registration_doc_url.includes('/sign/')) {
                            e.preventDefault()
                            try {
                              const { data: signData } = await supabase.storage.from('clinic-docs-private').createSignedUrl(clean, 900)
                              if (signData?.signedUrl) {
                                window.open(signData.signedUrl, '_blank')
                              }
                            } catch (err) {
                              console.warn('Failed to generate signed URL on click:', err)
                            }
                          }
                        }}
                        className="flex items-center gap-1 bg-emerald-950/40 hover:bg-emerald-950/70 text-emerald-400 px-2.5 py-1 rounded-lg border border-emerald-700/50 transition font-semibold"
                      >
                        <FileText className="w-3.5 h-3.5" /> View Registration Paper
                      </a>
                    )
                  )}
                </div>

                {/* Pictures Gallery */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5" /> Clinic Pictures ({(clinic.pictures || []).length})
                    </span>
                    <button
                      onClick={() => setEditingImagesClinic(clinic)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition"
                    >
                      <Edit className="w-3 h-3" /> Edit Photos & Logo
                    </button>
                  </div>

                  {(!clinic.pictures || clinic.pictures.length === 0) ? (
                    <div className="text-xs text-slate-500 bg-slate-900/40 p-2.5 rounded-xl border border-slate-700/40 flex items-center justify-between">
                      <span>No facility photos attached yet.</span>
                      <button
                        onClick={() => setEditingImagesClinic(clinic)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline"
                      >
                        + Add Photos
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {clinic.pictures.map((picUrl, idx) => (
                        picUrl.startsWith('content://') ? (
                          <div
                            key={idx}
                            title="Uploaded from older mobile build (local phone URI). Requires updated mobile build to upload to Supabase Storage."
                            className="w-16 h-16 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-col items-center justify-center p-1 text-center"
                          >
                            <ImageIcon className="w-4 h-4 text-amber-400 mb-0.5" />
                            <span className="text-[9px] text-amber-300 font-semibold leading-none">Old Mobile URI</span>
                          </div>
                        ) : (
                          <div
                            key={idx}
                            onClick={() => setSelectedPreviewImage(picUrl)}
                            className="w-16 h-16 rounded-xl border border-slate-700 overflow-hidden bg-slate-900 cursor-pointer hover:border-indigo-500 transition group relative"
                          >
                            <img
                              src={picUrl}
                              alt={`Clinic photo ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none'
                              }}
                            />
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent" />
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>

                {/* Description */}
                {clinic.description && (
                  <p className="text-xs text-slate-400 bg-slate-900/60 p-3 rounded-xl border border-slate-700/50">
                    {clinic.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                  <span className="font-mono bg-slate-900 px-2 py-1 rounded-md border border-slate-700">
                    GPS: {clinic.latitude?.toFixed(4)}, {clinic.longitude?.toFixed(4)}
                  </span>
                  <span className="bg-slate-900 px-2 py-1 rounded-md border border-slate-700">
                    Auto-Alert Threshold: {clinic.auto_notify_threshold} patients away
                  </span>
                </div>
              </div>

              {/* Categorization & Approval Controls */}
              <div className="flex flex-col sm:flex-row lg:flex-col items-end gap-3 min-w-[240px] w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-700/60">
                <div className="w-full">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Operational Category
                  </label>
                  <select
                    value={clinic.type || 'single_visit'}
                    onChange={(e) => updateType(clinic.id, e.target.value as ClinicType)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-indigo-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="single_visit">Single Visit (Consultation)</option>
                    <option value="multi_visit">Multi Visit (Follow-up Care)</option>
                    <option value="diagnostic_lab">Diagnostic / Lab Center</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 w-full pt-1">
                  {clinic.verification_status === 'approved' ? (
                    <div className="flex items-center justify-between w-full">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-4 h-4" /> Approved
                      </span>
                      <button
                        onClick={() => updateStatus(clinic.id, 'rejected')}
                        className="px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl transition"
                      >
                        Revoke
                      </button>
                    </div>
                  ) : clinic.verification_status === 'rejected' ? (
                    <div className="flex items-center justify-between w-full">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <XCircle className="w-4 h-4" /> Rejected
                      </span>
                      <button
                        onClick={() => updateStatus(clinic.id, 'approved')}
                        className="px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition"
                      >
                        Re-Approve
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 w-full">
                      <button
                        onClick={() => updateStatus(clinic.id, 'approved')}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => updateStatus(clinic.id, 'rejected')}
                        className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2 rounded-xl text-xs font-semibold shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between w-full pt-1">
                  <button
                    onClick={() => setEditingImagesClinic(clinic)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-2.5 py-1 rounded-lg transition border border-indigo-500/20"
                    title="Edit Clinic Logo and Pictures"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Edit Images</span>
                  </button>
                  <button
                    onClick={() => archiveClinic(clinic.id, clinic.name)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 px-2 py-1 rounded-lg transition"
                    title="Archive clinic to Recycle Bin"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Move to Recycle Bin</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Picture Fullscreen Preview Modal */}
      {selectedPreviewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Photo Preview</span>
              <button
                onClick={() => setSelectedPreviewImage(null)}
                className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center max-h-[80vh]">
              <img src={selectedPreviewImage} alt="Full preview" className="max-h-[75vh] max-w-full object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}

      {/* Edit Clinic Images Modal */}
      {editingImagesClinic && (
        <ClinicImageModal
          clinic={editingImagesClinic}
          isOpen={!!editingImagesClinic}
          onClose={() => setEditingImagesClinic(null)}
          onSuccess={(updatedClinic) => {
            setClinics(prev => prev.map(c => c.id === updatedClinic.id ? updatedClinic : c))
          }}
        />
      )}
    </div>
  )
}
