import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Clinic } from '../lib/types'
import { uploadImageFile, resolveImageUrl } from '../lib/storage'
import {
  X,
  Upload,
  Link as LinkIcon,
  Trash2,
  Check,
  AlertCircle,
  RefreshCw,
  Building,
  Image as ImageIcon,
  Star,
  Eye
} from 'lucide-react'

interface ClinicImageModalProps {
  clinic: Clinic | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (updatedClinic: Clinic) => void
}

function resolveClinicPictures(clinic: Clinic): string[] {
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

export default function ClinicImageModal({ clinic, isOpen, onClose, onSuccess }: ClinicImageModalProps) {
  const [logoUrl, setLogoUrl] = useState<string>('')
  const [pictures, setPictures] = useState<string[]>([])
  const [logoInput, setLogoInput] = useState<string>('')
  const [pictureInput, setPictureInput] = useState<string>('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const logoFileRef = useRef<HTMLInputElement>(null)
  const galleryFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (clinic) {
      setLogoUrl(resolveImageUrl(clinic.logo_url, 'clinic_photos'))
      setPictures(resolveClinicPictures(clinic))
      setLogoInput('')
      setPictureInput('')
      setErrorMsg(null)
      setSuccessMsg(null)
    }
  }, [clinic, isOpen])

  if (!isOpen || !clinic) return null

  // Logo upload
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file for the clinic logo.')
      return
    }

    setUploadingLogo(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const publicUrl = await uploadImageFile(file, 'clinic_photos')
      setLogoUrl(publicUrl)
      setSuccessMsg('Clinic logo uploaded! Click "Save Images" to apply.')
    } catch (err: any) {
      console.error('Logo upload error:', err)
      setErrorMsg(err.message || 'Failed to upload clinic logo.')
    } finally {
      setUploadingLogo(false)
      if (logoFileRef.current) logoFileRef.current.value = ''
    }
  }

  // Gallery multiple files upload
  const handleGalleryFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploadingGallery(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    const newUrls: string[] = []
    let failedCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith('image/')) continue

      try {
        const publicUrl = await uploadImageFile(file, 'clinic_photos')
        newUrls.push(publicUrl)
      } catch (err) {
        console.error('Gallery file upload error:', err)
        failedCount++
      }
    }

    if (newUrls.length > 0) {
      setPictures(prev => [...prev, ...newUrls])
      setSuccessMsg(`Added ${newUrls.length} picture${newUrls.length > 1 ? 's' : ''}! Click "Save Images" to apply.`)
    }
    if (failedCount > 0) {
      setErrorMsg(`Failed to upload ${failedCount} picture(s).`)
    }

    setUploadingGallery(false)
    if (galleryFileRef.current) galleryFileRef.current.value = ''
  }

  const handleApplyLogoUrl = () => {
    if (!logoInput.trim()) return
    setLogoUrl(logoInput.trim())
    setLogoInput('')
    setSuccessMsg('Logo URL applied! Remember to save.')
  }

  const handleAddPictureUrl = () => {
    if (!pictureInput.trim()) return
    const url = pictureInput.trim()
    setPictures(prev => [...prev, url])
    setPictureInput('')
    setSuccessMsg('Picture added! Remember to save.')
  }

  const handleRemovePicture = (idxToRemove: number) => {
    setPictures(prev => prev.filter((_, idx) => idx !== idxToRemove))
    setSuccessMsg('Picture removed. Click "Save Images" to confirm.')
  }

  const handleSetAsLogo = (picUrl: string) => {
    setLogoUrl(picUrl)
    setSuccessMsg('Selected picture set as Clinic Logo!')
  }

  const handleSave = async () => {
    setSaving(true)
    setErrorMsg(null)
    try {
      const finalLogo = logoUrl.trim() || null
      const finalPics = pictures.filter(Boolean)

      // If description had JSON metadata, keep pictures updated inside it as well
      let updatedDesc = clinic.description
      if (clinic.description && clinic.description.trim().startsWith('{')) {
        try {
          const meta = JSON.parse(clinic.description)
          meta.pictures = finalPics
          updatedDesc = JSON.stringify(meta)
        } catch (e) {}
      }

      const updates: any = {
        logo_url: finalLogo,
        pictures: finalPics,
        description: updatedDesc,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('clinics')
        .update(updates)
        .eq('id', clinic.id)

      if (error) throw error

      const updatedClinic: Clinic = {
        ...clinic,
        logo_url: finalLogo || undefined,
        pictures: finalPics,
        description: updatedDesc,
        updated_at: updates.updated_at
      }

      onSuccess(updatedClinic)
      onClose()
    } catch (err: any) {
      console.error('Error saving clinic images:', err)
      setErrorMsg(err.message || 'Failed to save clinic images to database.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-slate-800 border border-slate-700 max-w-2xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Edit Clinic Images & Logo</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {clinic.name} • {clinic.address_text}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
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

          {/* Section 1: Clinic Logo */}
          <div className="bg-slate-900/70 border border-slate-700/80 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" /> Clinic Official Logo
                </h4>
                <p className="text-xs text-slate-400">
                  Brand icon displayed in patient search, appointments, and headers
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Logo Preview */}
              <div className="relative w-24 h-24 rounded-2xl border-2 border-indigo-500/40 bg-slate-950 overflow-hidden flex items-center justify-center shrink-0 shadow-md">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Clinic Logo"
                    className="w-full h-full object-cover"
                    onError={() => setErrorMsg('Unable to render logo from current URL')}
                  />
                ) : (
                  <Building className="w-10 h-10 text-slate-600" />
                )}

                {uploadingLogo && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1">
                    <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                    <span className="text-[9px] text-white">Uploading...</span>
                  </div>
                )}
              </div>

              {/* Logo Actions */}
              <div className="flex-1 space-y-2.5 w-full">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => logoFileRef.current?.click()}
                    disabled={uploadingLogo}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload Logo File
                  </button>

                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="text-xs bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove Logo
                    </button>
                  )}
                  <input
                    type="file"
                    ref={logoFileRef}
                    onChange={handleLogoFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={logoInput}
                    onChange={e => setLogoInput(e.target.value)}
                    placeholder="Or paste direct logo URL (https://...)"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleApplyLogoUrl}
                    disabled={!logoInput.trim()}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs px-3 py-1.5 rounded-xl transition disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Clinic Picture Gallery */}
          <div className="bg-slate-900/70 border border-slate-700/80 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-indigo-400" />
                  Clinic Facility Pictures ({pictures.length})
                </h4>
                <p className="text-xs text-slate-400">
                  OPD rooms, reception, building exterior, and diagnostic facilities
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => galleryFileRef.current?.click()}
                  disabled={uploadingGallery}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingGallery ? 'Uploading...' : 'Upload Photos'}
                </button>
                <input
                  type="file"
                  ref={galleryFileRef}
                  onChange={handleGalleryFilesChange}
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
                value={pictureInput}
                onChange={e => setPictureInput(e.target.value)}
                placeholder="Add photo by URL (https://...)"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleAddPictureUrl}
                disabled={!pictureInput.trim()}
                className="bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs px-3 py-1.5 rounded-xl transition disabled:opacity-50 flex items-center gap-1"
              >
                <LinkIcon className="w-3 h-3" /> Add Link
              </button>
            </div>

            {/* Pictures Grid */}
            {pictures.length === 0 ? (
              <div className="text-center py-8 bg-slate-950/60 rounded-xl border border-slate-800 text-slate-500 text-xs">
                No clinic facility photos added yet. Upload images above to showcase the clinic!
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-60 overflow-y-auto p-1">
                {pictures.map((picUrl, idx) => (
                  <div
                    key={idx}
                    className="group relative rounded-xl border border-slate-700 overflow-hidden bg-slate-950 aspect-video flex items-center justify-center shadow-sm"
                  >
                    <img
                      src={picUrl}
                      alt={`Clinic photo ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                      onError={e => {
                        (e.target as HTMLElement).style.display = 'none'
                      }}
                    />
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 p-1">
                      <button
                        type="button"
                        onClick={() => setPreviewImage(picUrl)}
                        title="View Full Preview"
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg shadow"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetAsLogo(picUrl)}
                        title="Set as Clinic Logo"
                        className="p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow"
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePicture(idx)}
                        title="Delete Picture"
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
            disabled={saving || uploadingLogo || uploadingGallery}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" /> Save Clinic Images
              </>
            )}
          </button>
        </div>
      </div>

      {/* Full-screen Photo Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
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
    </div>
  )
}
