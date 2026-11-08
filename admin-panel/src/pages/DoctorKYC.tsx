import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Doctor, KycStatus } from '../lib/types'
import { uploadImageFile, resolveImageUrl } from '../lib/storage'
import DoctorImageModal from '../components/DoctorImageModal'
import {
  CheckCircle2,
  XCircle,
  FileText,
  ExternalLink,
  Award,
  ShieldAlert,
  X,
  Edit,
  Save,
  RefreshCw,
  Camera,
  Upload,
  Trash2,
  User,
  Link as LinkIcon
} from 'lucide-react'

function parseDoctorMeta(doc: Doctor): Doctor {
  let gender = doc.gender
  let age = doc.age
  let startingYear = doc.starting_practicing_year
  let photo = doc.profile_picture_url
  let education = doc.education
  let personalPhone = doc.personal_mobile_number
  let publicPhone = doc.public_mobile_number
  let desc = doc.description
  let certDoc = doc.certificates_doc_url

  if (doc.certificates_doc_url && doc.certificates_doc_url.trim().startsWith('{')) {
    try {
      const meta = JSON.parse(doc.certificates_doc_url)
      gender = gender || meta.gender
      age = age || meta.age
      startingYear = startingYear || meta.starting_practicing_year
      photo = photo || meta.profile_picture_url
      education = education || meta.education
      personalPhone = personalPhone || meta.personal_mobile_number
      publicPhone = publicPhone || meta.public_mobile_number
      desc = desc || meta.description
      certDoc = meta.original_certificates_doc_url || null
    } catch (e) {}
  }
  return {
    ...doc,
    gender,
    age,
    starting_practicing_year: startingYear,
    profile_picture_url: photo,
    education,
    personal_mobile_number: personalPhone,
    public_mobile_number: publicPhone,
    description: desc,
    certificates_doc_url: certDoc
  }
}

export default function DoctorKYC() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string } | null>(null)

  // Quick Photo Edit Modal state
  const [photoModalDoctor, setPhotoModalDoctor] = useState<Doctor | null>(null)

  // Edit Doctor Modal state
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null)
  const [editDocForm, setEditDocForm] = useState<Partial<Doctor>>({})
  const [savingDoctor, setSavingDoctor] = useState(false)
  const [uploadingEditPhoto, setUploadingEditPhoto] = useState(false)
  const [editPhotoUrlInput, setEditPhotoUrlInput] = useState('')
  const editPhotoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchDoctors()
    const interval = setInterval(() => {
      fetchDoctors(false)
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  const fetchDoctors = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      setIsRefreshing(true)
      const { data, error } = await supabase.from('doctors').select('*').order('created_at', { ascending: false })
      if (!error && data) {
        const parsedDocs = (data as Doctor[]).map(parseDoctorMeta)
        const doctorsData = await Promise.all(parsedDocs.map(async (doc) => {
          let picUrl = doc.profile_picture_url || ''
          if (picUrl) {
            picUrl = resolveImageUrl(picUrl, 'doctor_photos')
          }

          let licUrl = doc.license_doc_url || ''
          if (licUrl && !licUrl.startsWith('content://')) {
            let cleanPath = licUrl.split('?')[0]
            cleanPath = cleanPath.replace(/^https?:\/\/[^\/]+\/storage\/v1\/object\/(public|sign)\/[^\/]+\//, '')
            cleanPath = cleanPath.replace(/^(doctor-kyc|doctor-kyc-private|doctor_photos)\//, '')
            cleanPath = cleanPath.replace(/^\//, '')
            if (cleanPath) {
              try {
                const { data: signData, error: signErr } = await supabase.storage
                  .from('doctor-kyc-private')
                  .createSignedUrl(cleanPath, 900)
                if (!signErr && signData?.signedUrl) {
                  licUrl = signData.signedUrl
                }
              } catch (err) {
                console.warn('Error generating signed URL for doctor license doc:', err)
              }
            }
          }

          let certUrl = doc.certificates_doc_url || ''
          if (certUrl && !certUrl.startsWith('content://') && !certUrl.startsWith('{')) {
            let cleanPath = certUrl.split('?')[0]
            cleanPath = cleanPath.replace(/^https?:\/\/[^\/]+\/storage\/v1\/object\/(public|sign)\/[^\/]+\//, '')
            cleanPath = cleanPath.replace(/^(doctor-kyc|doctor-kyc-private|doctor_photos)\//, '')
            cleanPath = cleanPath.replace(/^\//, '')
            if (cleanPath) {
              try {
                const { data: signData, error: signErr } = await supabase.storage
                  .from('doctor-kyc-private')
                  .createSignedUrl(cleanPath, 900)
                if (!signErr && signData?.signedUrl) {
                  certUrl = signData.signedUrl
                }
              } catch (err) {
                console.warn('Error generating signed URL for doctor certificates doc:', err)
              }
            }
          }

          return {
            ...doc,
            profile_picture_url: picUrl,
            license_doc_url: licUrl,
            certificates_doc_url: certUrl
          }
        }))
        setDoctors(doctorsData)
      } else {
        setDoctors([])
      }
    } catch {
      setDoctors([])
    } finally {
      if (showLoading) setLoading(false)
      setIsRefreshing(false)
    }
  }

  const openPreviewDoc = async (title: string, rawUrl: string) => {
    if (!rawUrl) return
    if (rawUrl.startsWith('content://')) {
      alert('This document is stored as a local phone URI from an older build.')
      return
    }
    let finalUrl = rawUrl
    let cleanPath = rawUrl.split('?')[0]
    cleanPath = cleanPath.replace(/^https?:\/\/[^\/]+\/storage\/v1\/object\/(public|sign)\/[^\/]+\//, '')
    cleanPath = cleanPath.replace(/^(doctor-kyc|doctor-kyc-private|doctor_photos)\//, '')
    cleanPath = cleanPath.replace(/^\//, '')

    if (cleanPath && !rawUrl.includes('/sign/')) {
      try {
        const { data: signData } = await supabase.storage
          .from('doctor-kyc-private')
          .createSignedUrl(cleanPath, 900)
        if (signData?.signedUrl) {
          finalUrl = signData.signedUrl
        }
      } catch (err) {
        console.warn('Error generating signed URL on inspect:', err)
      }
    }
    setPreviewDoc({ title, url: finalUrl })
  }

  const updateStatus = async (id: string, status: KycStatus) => {
    try {
      await supabase.from('doctors').update({ kyc_status: status }).eq('id', id)
    } catch (e) {
      console.warn('Updated locally:', e)
    }
    setDoctors(prev => prev.map(d => d.id === id ? { ...d, kyc_status: status } : d))
  }

  const openEditDoctor = (doctor: Doctor) => {
    setEditingDoctor(doctor)
    setEditDocForm({ ...doctor })
    setEditPhotoUrlInput('')
  }

  const handleSaveDoctor = async () => {
    if (!editingDoctor) return
    setSavingDoctor(true)
    try {
      const updates = {
        full_name: editDocForm.full_name,
        email: editDocForm.email,
        specialty: editDocForm.specialty,
        nmc_license_number: editDocForm.nmc_license_number,
        consultation_fee: editDocForm.consultation_fee,
        gender: editDocForm.gender,
        age: editDocForm.age,
        starting_practicing_year: editDocForm.starting_practicing_year,
        personal_mobile_number: editDocForm.personal_mobile_number,
        public_mobile_number: editDocForm.public_mobile_number,
        education: editDocForm.education,
        description: editDocForm.description,
        kyc_status: editDocForm.kyc_status,
        profile_picture_url: editDocForm.profile_picture_url || null,
        updated_at: new Date().toISOString()
      }

      await supabase.from('doctors').update(updates).eq('id', editingDoctor.id)

      setDoctors(prev => prev.map(d => d.id === editingDoctor.id ? { ...d, ...updates } as Doctor : d))
      setEditingDoctor(null)
    } catch (e) {
      console.error('Error saving doctor:', e)
    } finally {
      setSavingDoctor(false)
    }
  }

  const filteredDoctors = doctors.filter(d => {
    if (filter === 'all') return true
    return d.kyc_status === filter
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Doctor KYC & NMC License Verification</h1>
            <button
              onClick={() => fetchDoctors(true)}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition disabled:opacity-50"
              title="Refresh doctor list"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Carefully verify Nepal Medical Council (NMC) registration, edit qualifications, profile photos, and manage clinic listing authorizations.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-semibold">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition ${filter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            All ({doctors.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-lg transition ${filter === 'pending' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Pending ({doctors.filter(d => d.kyc_status === 'pending').length})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1.5 rounded-lg transition ${filter === 'approved' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Approved ({doctors.filter(d => d.kyc_status === 'approved').length})
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg transition ${filter === 'rejected' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Rejected ({doctors.filter(d => d.kyc_status === 'rejected').length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
          <span>Loading doctor KYC applications...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredDoctors.map(doctor => (
            <div key={doctor.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-3">
                  {/* Doctor Profile Picture / Avatar with Click-to-Edit Photo */}
                  <div
                    onClick={() => setPhotoModalDoctor(doctor)}
                    className="relative group w-14 h-14 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold overflow-hidden shrink-0 cursor-pointer shadow-md hover:border-indigo-500 transition"
                    title="Click to edit doctor profile photo"
                  >
                    {doctor.profile_picture_url ? (
                      <img
                        src={resolveImageUrl(doctor.profile_picture_url, 'doctor_photos')}
                        alt={doctor.full_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <User className="w-7 h-7 text-emerald-400" />
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-0.5">
                      <Camera className="w-4 h-4 text-white" />
                      <span className="text-[8px] text-white font-bold uppercase tracking-wider">Edit</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg text-white">{doctor.full_name}</h3>
                      <button
                        onClick={() => setPhotoModalDoctor(doctor)}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
                        title="Edit Doctor Photo"
                      >
                        <Camera className="w-3 h-3" /> Edit Photo
                      </button>
                    </div>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="text-indigo-400 font-medium">{doctor.specialty}</span>
                      <span>•</span>
                      <span>{doctor.email}</span>
                      <span>•</span>
                      <span>Fee: Rs. {doctor.consultation_fee}</span>
                      {doctor.starting_practicing_year && (
                        <>
                          <span>•</span>
                          <span>Practicing Since: {doctor.starting_practicing_year}</span>
                        </>
                      )}
                      {doctor.education && (
                        <>
                          <span>•</span>
                          <span>{doctor.education}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* NMC License Verification Badge */}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                  <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
                    <ShieldAlert className="w-4 h-4 text-indigo-400" />
                    <span className="text-slate-400">NMC License:</span>
                    <span className="font-mono font-bold text-white tracking-wide">{doctor.nmc_license_number}</span>
                  </div>

                  {doctor.personal_mobile_number && (
                    <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700 text-slate-300">
                      <span>Personal:</span>
                      <strong className="text-white font-mono">{doctor.personal_mobile_number}</strong>
                    </div>
                  )}

                  {doctor.public_mobile_number && (
                    <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700 text-slate-300">
                      <span>Public:</span>
                      <strong className="text-white font-mono">{doctor.public_mobile_number}</strong>
                    </div>
                  )}

                  {doctor.license_doc_url && (
                    <button
                      onClick={() => openPreviewDoc(`NMC License — ${doctor.full_name}`, doctor.license_doc_url!)}
                      className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-700 text-indigo-300 font-medium transition cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Inspect License File</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </button>
                  )}

                  {doctor.certificates_doc_url && (
                    <button
                      onClick={() => openPreviewDoc(`Degree / Certificates — ${doctor.full_name}`, doctor.certificates_doc_url!)}
                      className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-700 text-slate-300 font-medium transition cursor-pointer"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>Medical Degree</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>

              {/* Status & Review Actions */}
              <div className="flex flex-wrap items-center gap-2.5 min-w-[200px] justify-end">
                {/* Edit Photo Action */}
                <button
                  onClick={() => setPhotoModalDoctor(doctor)}
                  className="bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 hover:border-indigo-500/40 px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
                  title="Change doctor photo"
                >
                  <Camera className="w-3.5 h-3.5 text-indigo-400" /> Photo
                </button>

                {/* Edit Doctor Info Button */}
                <button
                  onClick={() => openEditDoctor(doctor)}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
                >
                  <Edit className="w-3.5 h-3.5" /> Edit Doctor
                </button>

                {doctor.kyc_status === 'approved' ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-4 h-4" /> Authorized
                    </span>
                    <button
                      onClick={() => updateStatus(doctor.id, 'rejected')}
                      className="px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl transition"
                    >
                      Revoke
                    </button>
                  </div>
                ) : doctor.kyc_status === 'rejected' ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <XCircle className="w-4 h-4" /> Rejected
                    </span>
                    <button
                      onClick={() => updateStatus(doctor.id, 'approved')}
                      className="px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition"
                    >
                      Re-Authorize
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateStatus(doctor.id, 'approved')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Authorize
                    </button>
                    <button
                      onClick={() => updateStatus(doctor.id, 'rejected')}
                      className="bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md shadow-rose-600/20 transition flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Doctor Full Modal */}
      {editingDoctor && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 max-w-2xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-900/80">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Edit className="w-5 h-5 text-indigo-400" />
                  Edit Doctor Information
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">ID: {editingDoctor.id}</p>
              </div>
              <button onClick={() => setEditingDoctor(null)} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* Profile Photo Editor Section in Modal */}
              <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-700/80 space-y-3">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-indigo-400" />
                  Doctor Profile Photo
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="relative w-20 h-20 rounded-2xl border-2 border-indigo-500/40 bg-slate-950 overflow-hidden flex items-center justify-center shrink-0 shadow-md">
                    {editDocForm.profile_picture_url ? (
                      <img
                        src={resolveImageUrl(editDocForm.profile_picture_url, 'doctor_photos')}
                        alt={editDocForm.full_name || 'Doctor'}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <User className="w-8 h-8 text-slate-600" />
                    )}
                    {uploadingEditPhoto && (
                      <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1">
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                        <span className="text-[9px] text-white">Uploading...</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2 w-full">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => editPhotoInputRef.current?.click()}
                        disabled={uploadingEditPhoto}
                        className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" /> Upload Photo File
                      </button>
                      {editDocForm.profile_picture_url && (
                        <button
                          type="button"
                          onClick={() => setEditDocForm({ ...editDocForm, profile_picture_url: '' })}
                          className="text-xs bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove Photo
                        </button>
                      )}
                      <input
                        type="file"
                        ref={editPhotoInputRef}
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setUploadingEditPhoto(true)
                          try {
                            const publicUrl = await uploadImageFile(file, 'doctor_photos')
                            setEditDocForm(prev => ({ ...prev, profile_picture_url: publicUrl }))
                          } catch (err: any) {
                            alert(err?.message || 'Failed to upload photo')
                          } finally {
                            setUploadingEditPhoto(false)
                            if (editPhotoInputRef.current) editPhotoInputRef.current.value = ''
                          }
                        }}
                        accept="image/*"
                        className="hidden"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={editPhotoUrlInput}
                        onChange={e => setEditPhotoUrlInput(e.target.value)}
                        placeholder="Or enter direct photo URL (https://...)"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!editPhotoUrlInput.trim()) return
                          setEditDocForm(prev => ({ ...prev, profile_picture_url: editPhotoUrlInput.trim() }))
                          setEditPhotoUrlInput('')
                        }}
                        disabled={!editPhotoUrlInput.trim()}
                        className="bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs px-3 py-1.5 rounded-xl transition disabled:opacity-50 flex items-center gap-1"
                      >
                        <LinkIcon className="w-3 h-3" /> Apply
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Doctor Full Name</label>
                  <input
                    type="text"
                    value={editDocForm.full_name || ''}
                    onChange={e => setEditDocForm({ ...editDocForm, full_name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Specialization</label>
                  <input
                    type="text"
                    value={editDocForm.specialty || ''}
                    onChange={e => setEditDocForm({ ...editDocForm, specialty: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Cardiologist, Pediatrician"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">NMC License ID</label>
                  <input
                    type="text"
                    value={editDocForm.nmc_license_number || ''}
                    onChange={e => setEditDocForm({ ...editDocForm, nmc_license_number: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Consultation Fee (NPR)</label>
                  <input
                    type="number"
                    value={editDocForm.consultation_fee || 500}
                    onChange={e => setEditDocForm({ ...editDocForm, consultation_fee: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Email</label>
                  <input
                    type="email"
                    value={editDocForm.email || ''}
                    onChange={e => setEditDocForm({ ...editDocForm, email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">KYC Status</label>
                  <select
                    value={editDocForm.kyc_status || 'pending'}
                    onChange={e => setEditDocForm({ ...editDocForm, kyc_status: e.target.value as KycStatus })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="approved">Approved / Authorized</option>
                    <option value="pending">Pending Review</option>
                    <option value="rejected">Rejected / Revoked</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Personal Mobile (+977)</label>
                  <input
                    type="text"
                    value={editDocForm.personal_mobile_number || ''}
                    onChange={e => setEditDocForm({ ...editDocForm, personal_mobile_number: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                    placeholder="98xxxxxxxx"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Public OPD Mobile (+977)</label>
                  <input
                    type="text"
                    value={editDocForm.public_mobile_number || ''}
                    onChange={e => setEditDocForm({ ...editDocForm, public_mobile_number: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono"
                    placeholder="98xxxxxxxx"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Gender</label>
                  <select
                    value={editDocForm.gender || 'Male'}
                    onChange={e => setEditDocForm({ ...editDocForm, gender: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Age</label>
                  <input
                    type="number"
                    value={editDocForm.age || ''}
                    onChange={e => setEditDocForm({ ...editDocForm, age: parseInt(e.target.value) || undefined })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                    placeholder="e.g. 38"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Starting Year</label>
                  <input
                    type="number"
                    value={editDocForm.starting_practicing_year || ''}
                    onChange={e => setEditDocForm({ ...editDocForm, starting_practicing_year: parseInt(e.target.value) || undefined })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                    placeholder="e.g. 2018"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Education / Degrees</label>
                <input
                  type="text"
                  value={editDocForm.education || ''}
                  onChange={e => setEditDocForm({ ...editDocForm, education: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  placeholder="e.g. MBBS, MD (Tribhuvan University / IOM)"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Description / Bio</label>
                <textarea
                  rows={2}
                  value={editDocForm.description || ''}
                  onChange={e => setEditDocForm({ ...editDocForm, description: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  placeholder="Special clinical interests, OPD availability notes..."
                />
              </div>
            </div>

            <div className="p-4 bg-slate-900 border-t border-slate-700 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingDoctor(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDoctor}
                disabled={savingDoctor}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {savingDoctor ? 'Saving...' : 'Save Doctor Info'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Doctor Photo Edit Modal */}
      {photoModalDoctor && (
        <DoctorImageModal
          doctor={photoModalDoctor}
          isOpen={!!photoModalDoctor}
          onClose={() => setPhotoModalDoctor(null)}
          onSuccess={(updatedDoctor) => {
            setDoctors(prev => prev.map(d => d.id === updatedDoctor.id ? updatedDoctor : d))
          }}
        />
      )}

      {/* Document Inspector Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 max-w-2xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-900/80">
              <h3 className="font-semibold text-white text-sm">{previewDoc.title}</h3>
              <button onClick={() => setPreviewDoc(null)} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-slate-950 flex-1">
              <img src={previewDoc.url} alt="License Proof" className="max-h-[60vh] object-contain rounded-lg" />
            </div>
            <div className="p-3 bg-slate-900 border-t border-slate-700 flex justify-end">
              <a
                href={previewDoc.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
              >
                Open Original File in New Window <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
