import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Clinic, ClinicType, ClinicService, MedicalSpecialty, Doctor } from '../lib/types'
import { uploadImageFile, resolveImageUrl } from '../lib/storage'
import DoctorImageModal from '../components/DoctorImageModal'
import {
  Building,
  Save,
  Plus,
  Trash2,
  Check,
  Image as ImageIcon,
  FileText,
  ExternalLink,
  X,
  Camera,
  Upload,
  Star,
  Eye,
  User,
  Link as LinkIcon,
  RefreshCw,
  AlertCircle
} from 'lucide-react'

function resolvePictures(clinic: Clinic): string[] {
  let pics = clinic.pictures || []
  if (clinic.description && clinic.description.trim().startsWith('{')) {
    try {
      const meta = JSON.parse(clinic.description)
      if (meta.pictures && meta.pictures.length > 0) pics = meta.pictures
    } catch (e) {}
  }
  if (typeof pics === 'string') {
    try {
      if ((pics as string).startsWith('[')) pics = JSON.parse(pics)
      else if ((pics as string).startsWith('{')) {
        pics = (pics as string).slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean)
      } else {
        pics = [(pics as string).trim()].filter(Boolean)
      }
    } catch (e) {
      pics = []
    }
  }
  if (!Array.isArray(pics)) return []
  return pics.map(p => resolveImageUrl(p, 'clinic_photos')).filter(Boolean)
}

export default function ClinicEditor() {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)
  const [availableSpecialties, setAvailableSpecialties] = useState<MedicalSpecialty[]>([])
  const [services, setServices] = useState<ClinicService[]>([])
  const [clinicDoctors, setClinicDoctors] = useState<Doctor[]>([])
  const [loadingDoctors, setLoadingDoctors] = useState(false)
  const [selectedDoctorForPhoto, setSelectedDoctorForPhoto] = useState<Doctor | null>(null)

  const [newServiceName, setNewServiceName] = useState('')
  const [newServicePrice, setNewServicePrice] = useState('')
  const [newServiceDesc, setNewServiceDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  // Image editing states
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [logoUrlInput, setLogoUrlInput] = useState('')
  const [galleryUrlInput, setGalleryUrlInput] = useState('')
  const [imageErrorMsg, setImageErrorMsg] = useState<string | null>(null)

  const logoFileRef = useRef<HTMLInputElement>(null)
  const galleryFilesRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchClinics()
    fetchAvailableSpecialties()
  }, [])

  const fetchAvailableSpecialties = async () => {
    try {
      const { data } = await supabase.from('medical_specialties').select('*').eq('is_active', true).order('name')
      if (data) setAvailableSpecialties(data as MedicalSpecialty[])
    } catch (e) {
      console.warn('Failed to fetch specialties:', e)
    }
  }

  const fetchClinics = async () => {
    try {
      const { data, error } = await supabase.from('clinics').select('*').order('name')
      if (!error && data && data.length > 0) {
        setClinics(data as Clinic[])
        const activeClinics = (data as Clinic[]).filter(c => !c.is_archived)
        const initialClinic = activeClinics[0] || (data[0] as Clinic)
        const normalized = {
          ...initialClinic,
          pictures: resolvePictures(initialClinic),
          logo_url: initialClinic.logo_url ? resolveImageUrl(initialClinic.logo_url, 'clinic_photos') : ''
        }
        setSelectedClinic(normalized)
        fetchServices(initialClinic.id)
        fetchClinicDoctors(initialClinic.id)
      } else {
        setClinics([])
        setSelectedClinic(null)
        setServices([])
        setClinicDoctors([])
      }
    } catch {
      setClinics([])
      setSelectedClinic(null)
      setServices([])
      setClinicDoctors([])
    }
  }

  const fetchServices = async (clinicId: string) => {
    try {
      const { data } = await supabase.from('clinic_services').select('*').eq('clinic_id', clinicId)
      if (data) {
        setServices(data as ClinicService[])
      } else {
        setServices([])
      }
    } catch {
      setServices([])
    }
  }

  const fetchClinicDoctors = async (clinicId: string) => {
    try {
      setLoadingDoctors(true)
      const { data } = await supabase.from('doctors').select('*').eq('clinic_id', clinicId).order('full_name')
      if (data) {
        setClinicDoctors(data as Doctor[])
      } else {
        setClinicDoctors([])
      }
    } catch (e) {
      console.warn('Error fetching clinic doctors:', e)
      setClinicDoctors([])
    } finally {
      setLoadingDoctors(false)
    }
  }

  const handleSelectClinic = (clinic: Clinic) => {
    const normalized = {
      ...clinic,
      pictures: resolvePictures(clinic),
      logo_url: clinic.logo_url ? resolveImageUrl(clinic.logo_url, 'clinic_photos') : ''
    }
    setSelectedClinic(normalized)
    setSaveSuccess(false)
    setImageErrorMsg(null)
    setLogoUrlInput('')
    setGalleryUrlInput('')
    fetchServices(clinic.id)
    fetchClinicDoctors(clinic.id)
  }

  // Clinic Logo Handlers
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClinic) return

    setUploadingLogo(true)
    setImageErrorMsg(null)
    try {
      const publicUrl = await uploadImageFile(file, 'clinic_logos')
      setSelectedClinic({ ...selectedClinic, logo_url: publicUrl })
    } catch (err: any) {
      console.error('Logo upload error:', err)
      setImageErrorMsg(err?.message || 'Failed to upload clinic logo')
    } finally {
      setUploadingLogo(false)
      if (logoFileRef.current) logoFileRef.current.value = ''
    }
  }

  const handleApplyLogoUrl = () => {
    if (!selectedClinic || !logoUrlInput.trim()) return
    setSelectedClinic({ ...selectedClinic, logo_url: logoUrlInput.trim() })
    setLogoUrlInput('')
  }

  const handleRemoveLogo = () => {
    if (!selectedClinic) return
    setSelectedClinic({ ...selectedClinic, logo_url: '' })
  }

  // Clinic Gallery Handlers
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !selectedClinic) return

    setUploadingGallery(true)
    setImageErrorMsg(null)
    const newPics: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith('image/')) continue
      try {
        const publicUrl = await uploadImageFile(file, 'clinic_photos')
        newPics.push(publicUrl)
      } catch (err) {
        console.error('Gallery file upload failed:', err)
      }
    }

    if (newPics.length > 0) {
      const current = selectedClinic.pictures || []
      setSelectedClinic({ ...selectedClinic, pictures: [...current, ...newPics] })
    }
    setUploadingGallery(false)
    if (galleryFilesRef.current) galleryFilesRef.current.value = ''
  }

  const handleAddGalleryUrl = () => {
    if (!selectedClinic || !galleryUrlInput.trim()) return
    const current = selectedClinic.pictures || []
    setSelectedClinic({ ...selectedClinic, pictures: [...current, galleryUrlInput.trim()] })
    setGalleryUrlInput('')
  }

  const handleRemoveGalleryPic = (indexToRemove: number) => {
    if (!selectedClinic) return
    const current = selectedClinic.pictures || []
    setSelectedClinic({
      ...selectedClinic,
      pictures: current.filter((_, idx) => idx !== indexToRemove)
    })
  }

  const handleSetGalleryAsLogo = (picUrl: string) => {
    if (!selectedClinic) return
    setSelectedClinic({ ...selectedClinic, logo_url: picUrl })
  }

  const handleSaveClinic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClinic) return
    setSaving(true)
    setSaveSuccess(false)
    setImageErrorMsg(null)

    try {
      const finalLogo = selectedClinic.logo_url?.trim() || null
      const finalPics = selectedClinic.pictures || []

      // If description had JSON metadata, keep pictures updated inside it as well
      let updatedDesc = selectedClinic.description
      if (selectedClinic.description && selectedClinic.description.trim().startsWith('{')) {
        try {
          const meta = JSON.parse(selectedClinic.description)
          meta.pictures = finalPics
          updatedDesc = JSON.stringify(meta)
        } catch (err) {}
      }

      const updates = {
        name: selectedClinic.name,
        type: selectedClinic.type,
        address_text: selectedClinic.address_text,
        contact_phone: selectedClinic.contact_phone,
        contact_email: selectedClinic.contact_email,
        latitude: selectedClinic.latitude,
        longitude: selectedClinic.longitude,
        auto_notify_threshold: selectedClinic.auto_notify_threshold,
        description: updatedDesc,
        pan_number: selectedClinic.pan_number,
        manager_phone: selectedClinic.manager_phone,
        is_direct_payment_enabled: selectedClinic.is_direct_payment_enabled,
        payment_gateway_provider: selectedClinic.payment_gateway_provider,
        payment_api_key: selectedClinic.payment_api_key,
        payment_secret_key: selectedClinic.payment_secret_key,
        merchant_id: selectedClinic.merchant_id,
        specialties: selectedClinic.specialties || [],
        logo_url: finalLogo,
        pictures: finalPics,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase.from('clinics').update(updates).eq('id', selectedClinic.id)
      if (error) throw error

      setClinics(prev => prev.map(c => c.id === selectedClinic.id ? { ...c, ...updates } as Clinic : c))
      setSelectedClinic(prev => prev ? { ...prev, ...updates } as Clinic : null)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      console.error('Error saving clinic:', err)
      setImageErrorMsg(err?.message || 'Failed to save clinic changes')
    } finally {
      setSaving(false)
    }
  }

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClinic || !newServiceName || !newServicePrice) return
    const newService: ClinicService = {
      id: 'srv_' + Math.random().toString(36).substring(2, 9),
      clinic_id: selectedClinic.id,
      service_name: newServiceName.trim(),
      description: newServiceDesc.trim() || undefined,
      price: parseFloat(newServicePrice),
      created_at: new Date().toISOString()
    }

    try {
      await supabase.from('clinic_services').insert([{
        clinic_id: newService.clinic_id,
        service_name: newService.service_name,
        description: newService.description,
        price: newService.price
      }])
    } catch (e) {
      console.warn('Added locally:', e)
    }

    setServices(prev => [...prev, newService])
    setNewServiceName('')
    setNewServicePrice('')
    setNewServiceDesc('')
  }

  const handleDeleteService = async (serviceId: string) => {
    try {
      await supabase.from('clinic_services').delete().eq('id', serviceId)
    } catch (e) {
      console.warn('Deleted locally:', e)
    }
    setServices(prev => prev.filter(s => s.id !== serviceId))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Master Clinic & Services Editor</h1>
        <p className="text-slate-400 text-sm mt-1">
          Super Admin master access to modify clinic attributes, official logo, picture gallery, affiliated doctors, and services.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Clinic Selector Column */}
        <div className="lg:col-span-4 bg-slate-800 border border-slate-700 p-4 rounded-2xl h-fit">
          <div className="flex items-center justify-between mb-3 px-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Select Clinic</h2>
            {clinics.some(c => c.is_archived) && (
              <button
                type="button"
                onClick={() => setShowArchived(prev => !prev)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition ${
                  showArchived
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-300'
                }`}
              >
                {showArchived ? 'Hide Archived' : `Show Archived (${clinics.filter(c => c.is_archived).length})`}
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-[72vh] overflow-y-auto pr-1">
            {clinics.filter(c => showArchived ? true : !c.is_archived).map(clinic => (
              <button
                key={clinic.id}
                onClick={() => handleSelectClinic(clinic)}
                className={`w-full text-left p-3 rounded-xl transition flex items-center justify-between gap-2 ${
                  selectedClinic?.id === clinic.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-900/60 text-slate-300 hover:bg-slate-700/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                    {clinic.logo_url ? (
                      <img
                        src={resolveImageUrl(clinic.logo_url, 'clinic_photos')}
                        alt={clinic.name}
                        className="w-full h-full object-cover"
                        onError={e => {
                          (e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <Building className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-1.5 truncate">
                      <span className="truncate">{clinic.name}</span>
                      {clinic.is_archived && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                          ARCHIVED
                        </span>
                      )}
                    </div>
                    <div className={`text-xs ${selectedClinic?.id === clinic.id ? 'text-indigo-200' : 'text-slate-400'} truncate max-w-[170px]`}>
                      {clinic.address_text}
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  selectedClinic?.id === clinic.id ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {clinic.type.replace('_', ' ')}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Editor Form Column */}
        {selectedClinic && (
          <div className="lg:col-span-8 space-y-6">
            {/* Main Clinic Profile Editor */}
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 overflow-hidden shrink-0 shadow-sm">
                    {selectedClinic.logo_url ? (
                      <img
                        src={resolveImageUrl(selectedClinic.logo_url, 'clinic_photos')}
                        alt={selectedClinic.name}
                        className="w-full h-full object-cover"
                        onError={e => {
                          (e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <Building className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h2 className="font-bold text-lg text-white">{selectedClinic.name}</h2>
                    <p className="text-xs text-slate-400">ID: {selectedClinic.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {saveSuccess && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                      <Check className="w-4 h-4" /> Changes Saved
                    </span>
                  )}
                  {!selectedClinic.is_archived && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Move "${selectedClinic.name}" to the Recycle Bin? It will be held for 30 days before permanent deletion.`)) return
                        const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                        const updates = {
                          is_archived: true,
                          archived_at: new Date().toISOString(),
                          deletion_scheduled_at: scheduledDate,
                          updated_at: new Date().toISOString()
                        }
                        await supabase.from('clinics').update(updates).eq('id', selectedClinic.id)
                        setSelectedClinic({ ...selectedClinic, ...updates })
                        setClinics(prev => prev.map(c => c.id === selectedClinic.id ? { ...c, ...updates } : c))
                      }}
                      className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20 transition"
                      title="Archive clinic to Recycle Bin"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Move to Recycle Bin
                    </button>
                  )}
                </div>
              </div>

              {imageErrorMsg && (
                <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{imageErrorMsg}</span>
                </div>
              )}

              {selectedClinic.is_archived && (
                <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between">
                  <div className="text-xs text-rose-300">
                    <span className="font-bold">⚠️ Clinic Scheduled for Deletion (30-Day Archive):</span> Purge scheduled for {selectedClinic.deletion_scheduled_at ? new Date(selectedClinic.deletion_scheduled_at).toLocaleDateString() : 'within 30 days'}. Expiration will permanently purge all patient appointments and records.
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.from('clinics').update({
                        is_archived: false,
                        archived_at: null,
                        deletion_scheduled_at: null
                      }).eq('id', selectedClinic.id)
                      setSelectedClinic({ ...selectedClinic, is_archived: false, archived_at: undefined, deletion_scheduled_at: undefined })
                      setClinics(prev => prev.map(c => c.id === selectedClinic.id ? { ...c, is_archived: false } : c))
                    }}
                    className="text-xs bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1 rounded-lg transition"
                  >
                    Restore Clinic
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveClinic} className="space-y-5">
                {/* 1. Official Clinic Logo Editor */}
                <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-700/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-amber-400" />
                      Clinic Official Logo
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Brand icon shown on patient searches & appointments
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {/* Logo Preview */}
                    <div className="relative w-20 h-20 rounded-2xl border-2 border-indigo-500/40 bg-slate-950 overflow-hidden flex items-center justify-center shrink-0 shadow-md">
                      {selectedClinic.logo_url ? (
                        <img
                          src={resolveImageUrl(selectedClinic.logo_url, 'clinic_photos')}
                          alt="Clinic Logo"
                          className="w-full h-full object-cover"
                          onError={e => {
                            (e.target as HTMLElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <Building className="w-8 h-8 text-slate-600" />
                      )}
                      {uploadingLogo && (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1">
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                          <span className="text-[9px] text-white">Uploading...</span>
                        </div>
                      )}
                    </div>

                    {/* Logo Controls */}
                    <div className="flex-1 space-y-2 w-full">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => logoFileRef.current?.click()}
                          disabled={uploadingLogo}
                          className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        >
                          <Upload className="w-3.5 h-3.5" /> Upload Logo File
                        </button>
                        {selectedClinic.logo_url && (
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            className="text-xs bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove Logo
                          </button>
                        )}
                        <input
                          type="file"
                          ref={logoFileRef}
                          onChange={handleLogoUpload}
                          accept="image/*"
                          className="hidden"
                        />
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={logoUrlInput}
                          onChange={e => setLogoUrlInput(e.target.value)}
                          placeholder="Or paste direct logo URL (https://...)"
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={handleApplyLogoUrl}
                          disabled={!logoUrlInput.trim()}
                          className="bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs px-3 py-1.5 rounded-xl transition disabled:opacity-50 flex items-center gap-1"
                        >
                          <LinkIcon className="w-3 h-3" /> Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Basic Clinic Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Clinic Name</label>
                    <input
                      type="text"
                      value={selectedClinic.name}
                      onChange={e => setSelectedClinic({ ...selectedClinic, name: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Clinic Type</label>
                    <select
                      value={selectedClinic.type}
                      onChange={e => setSelectedClinic({ ...selectedClinic, type: e.target.value as ClinicType })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    >
                      <option value="single_visit">Single Visit (Consultation)</option>
                      <option value="multi_visit">Multi Visit (Follow-up Care)</option>
                      <option value="diagnostic_lab">Diagnostic / Lab Center</option>
                    </select>
                  </div>
                </div>

                {/* Multi-Select Clinical Specialties */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Medical Specialties Offered (Select Multiple)
                    </label>
                    <span className="text-[11px] text-indigo-400 font-semibold">
                      {(selectedClinic.specialties || []).length} Selected
                    </span>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 max-h-44 overflow-y-auto flex flex-wrap gap-1.5">
                    {availableSpecialties.map(spec => {
                      const isSelected = (selectedClinic.specialties || []).includes(spec.name)
                      return (
                        <button
                          key={spec.id}
                          type="button"
                          onClick={() => {
                            const current = selectedClinic.specialties || []
                            const updated = isSelected 
                              ? current.filter(s => s !== spec.name)
                              : [...current, spec.name]
                            setSelectedClinic({ ...selectedClinic, specialties: updated })
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-500 text-white font-semibold shadow-sm'
                              : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                          <span>{spec.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Patients searching for problems (e.g. eye, teeth, skin, heart) matching these specialties will discover this clinic.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Physical Address</label>
                  <input
                    type="text"
                    value={selectedClinic.address_text}
                    onChange={e => setSelectedClinic({ ...selectedClinic, address_text: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Contact Phone</label>
                    <input
                      type="text"
                      value={selectedClinic.contact_phone}
                      onChange={e => setSelectedClinic({ ...selectedClinic, contact_phone: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={selectedClinic.contact_email}
                      onChange={e => setSelectedClinic({ ...selectedClinic, contact_email: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">PAN Number (9 Digits)</label>
                    <input
                      type="text"
                      maxLength={9}
                      value={selectedClinic.pan_number || ''}
                      onChange={e => setSelectedClinic({ ...selectedClinic, pan_number: e.target.value.replace(/\D/g, '') })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                      placeholder="e.g. 601234567"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Manager Phone (+977)</label>
                    <input
                      type="text"
                      value={selectedClinic.manager_phone || ''}
                      onChange={e => setSelectedClinic({ ...selectedClinic, manager_phone: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                      placeholder="+977 98xxxxxxxx"
                    />
                  </div>
                </div>

                {/* Direct Payment Gateway & API Keys */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">Direct Payment Merchant Gateway</h4>
                      <p className="text-xs text-slate-400">Receive patient payments directly into this clinic's merchant account</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedClinic.is_direct_payment_enabled || false}
                        onChange={e => setSelectedClinic({ ...selectedClinic, is_direct_payment_enabled: e.target.checked })}
                        className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <span className="text-xs font-semibold text-slate-300">Enabled</span>
                    </label>
                  </div>

                  {selectedClinic.is_direct_payment_enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Payment Provider</label>
                        <select
                          value={selectedClinic.payment_gateway_provider || 'esewa'}
                          onChange={e => setSelectedClinic({ ...selectedClinic, payment_gateway_provider: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs"
                        >
                          <option value="esewa">eSewa</option>
                          <option value="khalti">Khalti</option>
                          <option value="fonepay">Fonepay</option>
                          <option value="connectips">ConnectIPS</option>
                          <option value="custom">Custom Merchant API</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Merchant ID / Code</label>
                        <input
                          type="text"
                          value={selectedClinic.merchant_id || ''}
                          onChange={e => setSelectedClinic({ ...selectedClinic, merchant_id: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs font-mono"
                          placeholder="e.g. EPAYTEST"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1">API Public Key</label>
                        <input
                          type="text"
                          value={selectedClinic.payment_api_key || ''}
                          onChange={e => setSelectedClinic({ ...selectedClinic, payment_api_key: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs font-mono"
                          placeholder="Live or sandbox public API key"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1">API Secret Key</label>
                        <input
                          type="password"
                          value={selectedClinic.payment_secret_key || ''}
                          onChange={e => setSelectedClinic({ ...selectedClinic, payment_secret_key: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs font-mono"
                          placeholder="Secret / hash private key"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={selectedClinic.latitude}
                      onChange={e => setSelectedClinic({ ...selectedClinic, latitude: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={selectedClinic.longitude}
                      onChange={e => setSelectedClinic({ ...selectedClinic, longitude: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Auto-Alert Threshold</label>
                    <input
                      type="number"
                      value={selectedClinic.auto_notify_threshold}
                      onChange={e => setSelectedClinic({ ...selectedClinic, auto_notify_threshold: parseInt(e.target.value) || 2 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Description / Notes</label>
                  <textarea
                    rows={2}
                    value={selectedClinic.description || ''}
                    onChange={e => setSelectedClinic({ ...selectedClinic, description: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* 3. Clinic Picture Gallery Editor */}
                <div className="space-y-3 pt-3 border-t border-slate-700/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-indigo-400" />
                        Clinic Picture Gallery ({(selectedClinic.pictures || []).length})
                      </label>
                      <p className="text-[11px] text-slate-400">
                        Facility rooms, waiting area, exterior pictures shown to patients
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedClinic.registration_doc_url && (
                        selectedClinic.registration_doc_url.startsWith('http') ? (
                          <a
                            href={selectedClinic.registration_doc_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold mr-2"
                          >
                            <FileText className="w-3.5 h-3.5" /> Registration Doc <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-amber-400 flex items-center gap-1 mr-2">
                            <FileText className="w-3.5 h-3.5" /> Registration Doc
                          </span>
                        )
                      )}

                      <button
                        type="button"
                        onClick={() => galleryFilesRef.current?.click()}
                        disabled={uploadingGallery}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {uploadingGallery ? 'Uploading...' : 'Upload Photos'}
                      </button>
                      <input
                        type="file"
                        ref={galleryFilesRef}
                        onChange={handleGalleryUpload}
                        accept="image/*"
                        multiple
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Add Picture by URL */}
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={galleryUrlInput}
                      onChange={e => setGalleryUrlInput(e.target.value)}
                      placeholder="Add photo by URL (https://...)"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddGalleryUrl}
                      disabled={!galleryUrlInput.trim()}
                      className="bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs px-3 py-1.5 rounded-xl transition disabled:opacity-50 flex items-center gap-1"
                    >
                      <LinkIcon className="w-3 h-3" /> Add Link
                    </button>
                  </div>

                  {/* Photo Cards Grid */}
                  {(!selectedClinic.pictures || selectedClinic.pictures.length === 0) ? (
                    <div className="text-xs text-slate-500 bg-slate-900/40 p-4 rounded-xl border border-slate-700/50 text-center">
                      No clinic photos added yet. Upload pictures or paste image URLs above!
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {selectedClinic.pictures.map((picUrl, idx) => (
                        <div
                          key={idx}
                          className="group relative rounded-xl border border-slate-700 overflow-hidden bg-slate-900 aspect-square flex items-center justify-center shadow-sm"
                        >
                          <img
                            src={picUrl}
                            alt={`Clinic ${idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none'
                            }}
                          />
                          <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 p-1">
                            <button
                              type="button"
                              onClick={() => setPreviewImage(picUrl)}
                              title="Full Screen Preview"
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg shadow"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetGalleryAsLogo(picUrl)}
                              title="Set as Clinic Logo"
                              className="p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow"
                            >
                              <Star className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveGalleryPic(idx)}
                              title="Delete Photo"
                              className="p-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="submit"
                    disabled={saving || uploadingLogo || uploadingGallery}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-xl transition flex items-center gap-2 text-sm shadow-md shadow-indigo-600/20 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Clinic Information'}
                  </button>
                </div>
              </form>
            </div>

            {/* Doctors at this Clinic (with Photo Edit) */}
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-indigo-400" />
                    Doctors Affiliated with {selectedClinic.name} ({clinicDoctors.length})
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    View registered physicians and update their profile photos directly from this clinic view.
                  </p>
                </div>
                {loadingDoctors && <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />}
              </div>

              {clinicDoctors.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500 bg-slate-900/40 rounded-xl border border-slate-700/50">
                  No doctors currently linked to this clinic ID. Doctors can also be managed and authorized in the Doctor KYC portal.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {clinicDoctors.map(doc => (
                    <div
                      key={doc.id}
                      className="p-3.5 rounded-xl bg-slate-900 border border-slate-700/70 flex items-center justify-between gap-3 shadow-sm hover:border-slate-600 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Doctor Avatar with quick click to edit photo */}
                        <div
                          onClick={() => setSelectedDoctorForPhoto(doc)}
                          className="relative group w-12 h-12 rounded-xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold overflow-hidden shrink-0 cursor-pointer shadow-sm hover:border-indigo-500 transition"
                          title="Click to edit doctor photo"
                        >
                          {doc.profile_picture_url ? (
                            <img
                              src={resolveImageUrl(doc.profile_picture_url, 'doctor_photos')}
                              alt={doc.full_name}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                              onError={e => {
                                (e.target as HTMLElement).style.display = 'none'
                              }}
                            />
                          ) : (
                            <User className="w-6 h-6 text-emerald-400" />
                          )}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <Camera className="w-4 h-4 text-white" />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-white truncate">{doc.full_name}</div>
                          <div className="text-xs text-indigo-400 truncate">{doc.specialty}</div>
                          <div className="text-[11px] text-slate-400 font-mono truncate">
                            NMC: {doc.nmc_license_number || 'N/A'} • Rs. {doc.consultation_fee}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedDoctorForPhoto(doc)}
                        className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 shrink-0"
                        title="Edit Doctor Photo"
                      >
                        <Camera className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Edit Photo</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Services & Pricing Manager */}
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-sm">
              <h3 className="font-bold text-lg text-white mb-2">Services & Pricing Catalog</h3>
              <p className="text-xs text-slate-400 mb-4">
                Manage the full list of clinical services, diagnostic tests, and procedures offered by {selectedClinic.name}.
              </p>

              {/* Add Service Form */}
              <form onSubmit={handleAddService} className="bg-slate-900/80 p-4 rounded-xl border border-slate-700 mb-5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <input
                      type="text"
                      placeholder="Service name (e.g., Blood Sugar Fasting)"
                      value={newServiceName}
                      onChange={e => setNewServiceName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={newServiceDesc}
                      onChange={e => setNewServiceDesc(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <input
                      type="number"
                      placeholder="Price (Rs.)"
                      value={newServicePrice}
                      onChange={e => setNewServicePrice(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Service to Clinic
                  </button>
                </div>
              </form>

              {/* Services List */}
              <div className="space-y-2">
                {services.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500 bg-slate-900/40 rounded-xl border border-slate-700/50">
                    No services configured for this clinic yet. Add one above!
                  </div>
                ) : (
                  services.map(service => (
                    <div
                      key={service.id}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-700/60"
                    >
                      <div>
                        <div className="font-semibold text-sm text-white">{service.service_name}</div>
                        {service.description && (
                          <div className="text-xs text-slate-400 mt-0.5">{service.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-sm text-emerald-400">
                          Rs. {service.price?.toLocaleString()}
                        </span>
                        <button
                          onClick={() => handleDeleteService(service.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                          title="Remove Service"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full-screen Photo Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Photo Preview</span>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center max-h-[80vh]">
              <img src={previewImage} alt="Full preview" className="max-h-[75vh] max-w-full object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}

      {/* Doctor Image Edit Modal */}
      {selectedDoctorForPhoto && (
        <DoctorImageModal
          doctor={selectedDoctorForPhoto}
          isOpen={!!selectedDoctorForPhoto}
          onClose={() => setSelectedDoctorForPhoto(null)}
          onSuccess={(updatedDoc) => {
            setClinicDoctors(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d))
          }}
        />
      )}
    </div>
  )
}
