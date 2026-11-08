import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Doctor } from '../lib/types'
import { uploadImageFile, resolveImageUrl } from '../lib/storage'
import { X, Upload, Link as LinkIcon, Trash2, Check, AlertCircle, RefreshCw, User } from 'lucide-react'

interface DoctorImageModalProps {
  doctor: Doctor | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (updatedDoctor: Doctor) => void
}

export default function DoctorImageModal({ doctor, isOpen, onClose, onSuccess }: DoctorImageModalProps) {
  const [currentUrl, setCurrentUrl] = useState<string>('')
  const [urlInput, setUrlInput] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (doctor) {
      const resolved = resolveImageUrl(doctor.profile_picture_url, 'doctor_photos')
      setCurrentUrl(resolved)
      setUrlInput('')
      setErrorMsg(null)
      setSuccessMsg(null)
    }
  }, [doctor, isOpen])

  if (!isOpen || !doctor) return null

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (PNG, JPG, WEBP, etc.)')
      return
    }

    setUploading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const publicUrl = await uploadImageFile(file, 'doctor_photos')
      setCurrentUrl(publicUrl)
      setSuccessMsg('Image uploaded successfully! Click "Save Photo" to apply.')
    } catch (err: any) {
      console.error('Doctor image upload error:', err)
      setErrorMsg(err.message || 'Failed to upload image. Please try pasting a direct URL.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleApplyUrl = () => {
    if (!urlInput.trim()) return
    setCurrentUrl(urlInput.trim())
    setUrlInput('')
    setSuccessMsg('URL applied! Click "Save Photo" to save changes.')
    setErrorMsg(null)
  }

  const handleRemovePhoto = () => {
    setCurrentUrl('')
    setSuccessMsg('Photo removed. Click "Save Photo" to confirm removal.')
    setErrorMsg(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setErrorMsg(null)
    try {
      const finalUrl = currentUrl ? currentUrl : null
      const updates = {
        profile_picture_url: finalUrl,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('doctors')
        .update(updates)
        .eq('id', doctor.id)

      if (error) throw error

      const updatedDoc: Doctor = {
        ...doctor,
        profile_picture_url: currentUrl || undefined,
        updated_at: updates.updated_at
      }

      onSuccess(updatedDoc)
      onClose()
    } catch (err: any) {
      console.error('Error saving doctor image:', err)
      setErrorMsg(err.message || 'Failed to save doctor photo to database.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-slate-800 border border-slate-700 max-w-md w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-900/80">
          <div>
            <h3 className="font-bold text-white text-base">Edit Doctor Profile Photo</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {doctor.full_name} • NMC: {doctor.nmc_license_number || 'N/A'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Photo Preview Card */}
          <div className="flex flex-col items-center justify-center p-4 bg-slate-900/60 rounded-2xl border border-slate-700/80">
            <div className="relative group w-32 h-32 rounded-2xl border-2 border-indigo-500/40 bg-slate-950 overflow-hidden flex items-center justify-center shadow-lg">
              {currentUrl ? (
                <img
                  src={currentUrl}
                  alt={doctor.full_name}
                  className="w-full h-full object-cover"
                  onError={() => {
                    setErrorMsg('Unable to render image from the current URL.')
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500">
                  <User className="w-12 h-12 text-slate-600 mb-1" />
                  <span className="text-[11px] font-medium">No Photo</span>
                </div>
              )}

              {uploading && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1.5">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-[10px] text-white font-semibold">Uploading...</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" /> Upload File
              </button>

              {currentUrl && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="text-xs bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Paste Image URL section */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-indigo-400" />
              Or Enter Image URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://example.com/doctor-photo.jpg"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleApplyUrl}
                disabled={!urlInput.trim()}
                className="bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs px-3 py-2 rounded-xl transition disabled:opacity-50"
              >
                Apply
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              Supports Supabase storage URLs, CDN links, and HTTPS web images.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-700 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" /> Save Photo
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
