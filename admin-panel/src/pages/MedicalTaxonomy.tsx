import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { MedicalSpecialty, MedicalQualification } from '../lib/types'
import { 
  Stethoscope, 
  GraduationCap, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Check, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Eye,
  HeartPulse,
  Smile,
  Baby,
  Activity,
  Layers,
  Brain,
  Droplets,
  Wind,
  FlaskConical,
  Dumbbell,
  Leaf,
  ShieldAlert,
  Scale,
  MapPin,
  Navigation,
  X
} from 'lucide-react'

const renderSpecialtyIcon = (iconName?: string) => {
  switch (iconName?.toLowerCase()) {
    case 'eye': return <Eye className="w-4 h-4" />
    case 'smile': return <Smile className="w-4 h-4" />
    case 'sparkles': return <Sparkles className="w-4 h-4" />
    case 'heartpulse': return <HeartPulse className="w-4 h-4" />
    case 'baby': return <Baby className="w-4 h-4" />
    case 'brain': return <Brain className="w-4 h-4" />
    case 'wind': return <Wind className="w-4 h-4" />
    case 'droplets': return <Droplets className="w-4 h-4" />
    case 'layers': return <Layers className="w-4 h-4" />
    case 'flaskconical': return <FlaskConical className="w-4 h-4" />
    case 'dumbbell': return <Dumbbell className="w-4 h-4" />
    case 'leaf': return <Leaf className="w-4 h-4" />
    case 'shieldalert': return <ShieldAlert className="w-4 h-4" />
    case 'scale': return <Scale className="w-4 h-4" />
    case 'activity': return <Activity className="w-4 h-4" />
    default: return <Stethoscope className="w-4 h-4" />
  }
}

export default function MedicalTaxonomy({ initialTab = 'specialties' }: { initialTab?: 'specialties' | 'qualifications' | 'locations' }) {
  const [activeTab, setActiveTab] = useState<'specialties' | 'qualifications' | 'locations'>(initialTab)
  
  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  // Data state
  const [specialties, setSpecialties] = useState<MedicalSpecialty[]>([])
  const [qualifications, setQualifications] = useState<MedicalQualification[]>([])
  const [loading, setLoading] = useState(true)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedLevel, setSelectedLevel] = useState<string>('all')

  // Specialty Modal
  const [showSpecialtyModal, setShowSpecialtyModal] = useState(false)
  const [editingSpecialty, setEditingSpecialty] = useState<MedicalSpecialty | null>(null)
  const [specialtyForm, setSpecialtyForm] = useState({
    name: '',
    category: 'Specialized Care',
    search_keywords: '',
    description: '',
    icon: 'Stethoscope',
    is_active: true
  })

  // Qualification Modal
  const [showQualModal, setShowQualModal] = useState(false)
  const [editingQual, setEditingQual] = useState<MedicalQualification | null>(null)
  const [qualForm, setQualForm] = useState({
    degree_name: '',
    level: 'Postgraduate',
    field_of_study: 'Medicine',
    description: '',
    is_active: true
  })

  // Location Option Modal (Patient App Top Location Selector)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [editingLocation, setEditingLocation] = useState<MedicalQualification | null>(null)
  const [locationForm, setLocationForm] = useState({
    city_name: '',
    coordinates: '27.7172, 85.3240',
    aliases: '',
    is_active: true
  })

  // Patient Symptom Simulator
  const [simQuery, setSimQuery] = useState('')

  useEffect(() => {
    fetchTaxonomyData()
  }, [])

  const fetchTaxonomyData = async () => {
    setLoading(true)
    try {
      const [specRes, qualRes] = await Promise.all([
        supabase.from('medical_specialties').select('*').order('name'),
        supabase.from('medical_qualifications').select('*').order('degree_name')
      ])

      if (specRes.data) setSpecialties((specRes.data as MedicalSpecialty[]).filter(s => s.category !== 'system_config'))
      if (qualRes.data) setQualifications(qualRes.data as MedicalQualification[])
    } catch (err: any) {
      console.error('Failed to load taxonomy data:', err)
      setActionError('Failed to load taxonomy from database')
    } finally {
      setLoading(false)
    }
  }

  const showNotification = (msg: string, isErr = false) => {
    if (isErr) {
      setActionError(msg)
      setTimeout(() => setActionError(null), 4000)
    } else {
      setActionSuccess(msg)
      setTimeout(() => setActionSuccess(null), 4000)
    }
  }

  // Specialty Operations
  const openAddSpecialty = () => {
    setEditingSpecialty(null)
    setSpecialtyForm({
      name: '',
      category: 'Specialized Care',
      search_keywords: '',
      description: '',
      icon: 'Stethoscope',
      is_active: true
    })
    setShowSpecialtyModal(true)
  }

  const openEditSpecialty = (spec: MedicalSpecialty) => {
    setEditingSpecialty(spec)
    setSpecialtyForm({
      name: spec.name,
      category: spec.category || 'Specialized Care',
      search_keywords: spec.search_keywords || '',
      description: spec.description || '',
      icon: spec.icon || 'Stethoscope',
      is_active: spec.is_active
    })
    setShowSpecialtyModal(true)
  }

  const handleSaveSpecialty = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!specialtyForm.name.trim() || !specialtyForm.search_keywords.trim()) {
      showNotification('Specialty name and keywords are required.', true)
      return
    }

    try {
      if (editingSpecialty) {
        const { error } = await supabase
          .from('medical_specialties')
          .update({
            name: specialtyForm.name.trim(),
            category: specialtyForm.category.trim(),
            search_keywords: specialtyForm.search_keywords.trim(),
            description: specialtyForm.description.trim(),
            icon: specialtyForm.icon,
            is_active: specialtyForm.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingSpecialty.id)

        if (error) throw error
        showNotification(`Specialty "${specialtyForm.name}" updated successfully`)
      } else {
        const { error } = await supabase
          .from('medical_specialties')
          .insert([{
            name: specialtyForm.name.trim(),
            category: specialtyForm.category.trim(),
            search_keywords: specialtyForm.search_keywords.trim(),
            description: specialtyForm.description.trim(),
            icon: specialtyForm.icon,
            is_active: specialtyForm.is_active
          }])

        if (error) throw error
        showNotification(`New specialty "${specialtyForm.name}" added to registry`)
      }

      setShowSpecialtyModal(false)
      fetchTaxonomyData()
    } catch (err: any) {
      showNotification(err.message || 'Error saving specialty', true)
    }
  }

  const handleDeleteSpecialty = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete specialty "${name}"?`)) return
    try {
      const { error } = await supabase.from('medical_specialties').delete().eq('id', id)
      if (error) throw error
      showNotification(`Deleted specialty "${name}"`)
      fetchTaxonomyData()
    } catch (err: any) {
      showNotification(err.message || 'Error deleting specialty', true)
    }
  }

  const toggleSpecialtyActive = async (spec: MedicalSpecialty) => {
    try {
      const { error } = await supabase
        .from('medical_specialties')
        .update({ is_active: !spec.is_active })
        .eq('id', spec.id)
      if (error) throw error
      setSpecialties(prev => prev.map(s => s.id === spec.id ? { ...s, is_active: !s.is_active } : s))
    } catch (err: any) {
      showNotification(err.message || 'Error toggling status', true)
    }
  }

  // Qualification Operations
  const openAddQualification = () => {
    setEditingQual(null)
    setQualForm({
      degree_name: '',
      level: 'Postgraduate',
      field_of_study: 'Medicine',
      description: '',
      is_active: true
    })
    setShowQualModal(true)
  }

  const openEditQualification = (qual: MedicalQualification) => {
    setEditingQual(qual)
    setQualForm({
      degree_name: qual.degree_name,
      level: qual.level || 'Postgraduate',
      field_of_study: qual.field_of_study || 'Medicine',
      description: qual.description || '',
      is_active: qual.is_active
    })
    setShowQualModal(true)
  }

  const handleSaveQualification = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!qualForm.degree_name.trim()) {
      showNotification('Degree/Qualification name is required.', true)
      return
    }

    try {
      if (editingQual) {
        const { error } = await supabase
          .from('medical_qualifications')
          .update({
            degree_name: qualForm.degree_name.trim(),
            level: qualForm.level.trim(),
            field_of_study: qualForm.field_of_study.trim(),
            description: qualForm.description.trim(),
            is_active: qualForm.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingQual.id)

        if (error) throw error
        showNotification(`Qualification "${qualForm.degree_name}" updated successfully`)
      } else {
        const { error } = await supabase
          .from('medical_qualifications')
          .insert([{
            degree_name: qualForm.degree_name.trim(),
            level: qualForm.level.trim(),
            field_of_study: qualForm.field_of_study.trim(),
            description: qualForm.description.trim(),
            is_active: qualForm.is_active
          }])

        if (error) throw error
        showNotification(`New degree "${qualForm.degree_name}" added to registry`)
      }

      setShowQualModal(false)
      fetchTaxonomyData()
    } catch (err: any) {
      showNotification(err.message || 'Error saving qualification', true)
    }
  }

  const handleDeleteQualification = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete degree "${name}"?`)) return
    try {
      const { error } = await supabase.from('medical_qualifications').delete().eq('id', id)
      if (error) throw error
      showNotification(`Deleted qualification "${name}"`)
      fetchTaxonomyData()
    } catch (err: any) {
      showNotification(err.message || 'Error deleting qualification', true)
    }
  }

  const toggleQualActive = async (qual: MedicalQualification) => {
    try {
      const { error } = await supabase
        .from('medical_qualifications')
        .update({ is_active: !qual.is_active })
        .eq('id', qual.id)
      if (error) throw error
      setQualifications(prev => prev.map(q => q.id === qual.id ? { ...q, is_active: !q.is_active } : q))
    } catch (err: any) {
      showNotification(err.message || 'Error toggling status', true)
    }
  }

  // Location Option Operations (Patient App Top Location Selector)
  const openAddLocation = () => {
    setEditingLocation(null)
    setLocationForm({
      city_name: '',
      coordinates: '27.7172, 85.3240',
      aliases: '',
      is_active: true
    })
    setShowLocationModal(true)
  }

  const openEditLocation = (loc: MedicalQualification) => {
    setEditingLocation(loc)
    setLocationForm({
      city_name: loc.degree_name,
      coordinates: loc.field_of_study || '27.7172, 85.3240',
      aliases: loc.description || loc.degree_name.toLowerCase(),
      is_active: loc.is_active
    })
    setShowLocationModal(true)
  }

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanCity = locationForm.city_name.trim()
    if (!cleanCity) {
      showNotification('City / Location name is required.', true)
      return
    }
    const cleanAliases = locationForm.aliases.trim() || cleanCity.toLowerCase()
    const cleanCoords = locationForm.coordinates.trim() || '27.7172, 85.3240'

    try {
      if (editingLocation) {
        const { error } = await supabase
          .from('medical_qualifications')
          .update({
            degree_name: cleanCity,
            level: 'LOCATION_OPTION',
            field_of_study: cleanCoords,
            description: cleanAliases,
            is_active: locationForm.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingLocation.id)

        if (error) throw error
        showNotification(`City "${cleanCity}" updated in dropdown list`)
        setQualifications(prev => prev.map(q => q.id === editingLocation.id ? {
          ...q,
          degree_name: cleanCity,
          field_of_study: cleanCoords,
          description: cleanAliases,
          is_active: locationForm.is_active,
          updated_at: new Date().toISOString()
        } : q))
      } else {
        const { data, error } = await supabase
          .from('medical_qualifications')
          .insert([{
            degree_name: cleanCity,
            level: 'LOCATION_OPTION',
            field_of_study: cleanCoords,
            description: cleanAliases,
            is_active: locationForm.is_active
          }])
          .select()

        if (error) throw error
        showNotification(`New city "${cleanCity}" added to dropdown list`)
        if (data && data[0]) {
          setQualifications(prev => [data[0] as MedicalQualification, ...prev])
        }
      }

      setShowLocationModal(false)
      fetchTaxonomyData()
    } catch (err: any) {
      showNotification(err.message || 'Error saving city option', true)
    }
  }

  const handleDeleteLocation = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete city "${name}" from the location dropdown?`)) return
    try {
      // Optimistic instant removal from UI
      setQualifications(prev => prev.filter(q => q.id !== id))
      const { error } = await supabase.from('medical_qualifications').delete().eq('id', id)
      if (error) throw error
      showNotification(`City "${name}" deleted from dropdown list`)
      fetchTaxonomyData()
    } catch (err: any) {
      showNotification(err.message || 'Error deleting city option', true)
      fetchTaxonomyData()
    }
  }

  // Filtering
  const doctorDegrees = qualifications.filter(q => q.level !== 'LOCATION_OPTION' && q.level !== 'PLATFORM_PAYMENT_CONFIG')
  const locationOptions = qualifications.filter(q => q.level === 'LOCATION_OPTION')

  const categories = Array.from(new Set(specialties.map(s => s.category || 'Specialized Care'))).filter(Boolean)
  const levels = Array.from(new Set(doctorDegrees.map(q => q.level || 'Postgraduate'))).filter(Boolean)

  const filteredSpecialties = specialties.filter(spec => {
    const q = searchQuery.toLowerCase().trim()
    const matchesSearch = !q || 
      spec.name.toLowerCase().includes(q) ||
      spec.category.toLowerCase().includes(q) ||
      spec.search_keywords.toLowerCase().includes(q)
    const matchesCat = selectedCategory === 'all' || spec.category === selectedCategory
    return matchesSearch && matchesCat
  })

  const filteredQualifications = doctorDegrees.filter(qual => {
    const q = searchQuery.toLowerCase().trim()
    const matchesSearch = !q || 
      qual.degree_name.toLowerCase().includes(q) ||
      qual.field_of_study.toLowerCase().includes(q) ||
      (qual.description && qual.description.toLowerCase().includes(q))
    const matchesLevel = selectedLevel === 'all' || qual.level === selectedLevel
    return matchesSearch && matchesLevel
  })

  const filteredLocations = locationOptions.filter(loc => {
    const q = searchQuery.toLowerCase().trim()
    return !q ||
      loc.degree_name.toLowerCase().includes(q) ||
      (loc.description && loc.description.toLowerCase().includes(q)) ||
      (loc.field_of_study && loc.field_of_study.toLowerCase().includes(q))
  })

  // Simulated symptom match for admin feedback
  const simulatedMatches = simQuery.trim() ? specialties.filter(s => {
    const terms = simQuery.toLowerCase().split(/[,\s]+/).filter(Boolean)
    return terms.some(t => s.search_keywords.toLowerCase().includes(t) || s.name.toLowerCase().includes(t))
  }) : []

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              {activeTab === 'locations' ? <MapPin className="w-5 h-5" /> : <Stethoscope className="w-5 h-5" />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {activeTab === 'locations' ? 'Patient App Locations & Cities' : 'Medical Taxonomy & Master Registry'}
              </h1>
              <p className="text-xs text-slate-400">
                {activeTab === 'locations'
                  ? 'Manage the location dropdown options shown at the top of the Patient App when viewing the clinic list.'
                  : 'Clinic types, symptom search keywords, doctor qualifications, and patient app locations synced in real time.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchTaxonomyData}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {activeTab === 'specialties' ? (
            <button
              onClick={openAddSpecialty}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-indigo-600/30 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Clinic Specialty</span>
            </button>
          ) : activeTab === 'qualifications' ? (
            <button
              onClick={openAddQualification}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-indigo-600/30 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Doctor Degree</span>
            </button>
          ) : (
            <button
              onClick={openAddLocation}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-emerald-600/30 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add City to Dropdown</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Interactive Symptom Simulator Card */}
      {activeTab !== 'locations' && (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider">Patient Symptom Search Simulator</div>
                <div className="text-[11px] text-slate-400">Test how patient search terms (e.g. &quot;eye&quot;, &quot;teeth&quot;, &quot;skin&quot;, &quot;heart attack&quot;) match medical specialties</div>
              </div>
            </div>
            <div className="w-full md:w-80 relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={simQuery}
                onChange={e => setSimQuery(e.target.value)}
                placeholder="Try: eye, tooth, fever, knee, rash..."
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {simQuery.trim() && (
            <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400 font-medium">Matching Specialties:</span>
              {simulatedMatches.length > 0 ? (
                simulatedMatches.map(m => (
                  <span key={m.id} className="inline-flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 text-[11px] font-semibold px-2.5 py-1 rounded-lg">
                    <Check className="w-3 h-3 text-indigo-400" />
                    {m.name}
                    <span className="text-[9px] text-indigo-300/70">({m.category})</span>
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-rose-400 italic">No specialty match for &quot;{simQuery}&quot;. Add this symptom to the keywords of an appropriate specialty!</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-800">
        <button
          onClick={() => { setActiveTab('specialties'); setSearchQuery('') }}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'specialties'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          <span>Clinic Specialties & Types</span>
          <span className="ml-1 px-2 py-0.5 text-[10px] rounded-full bg-indigo-500/20 text-indigo-300 font-bold">
            {specialties.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('qualifications'); setSearchQuery('') }}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'qualifications'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Doctor Degrees & Qualifications</span>
          <span className="ml-1 px-2 py-0.5 text-[10px] rounded-full bg-indigo-500/20 text-indigo-300 font-bold">
            {doctorDegrees.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('locations'); setSearchQuery('') }}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'locations'
              ? 'border-emerald-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MapPin className="w-4 h-4 text-emerald-400" />
          <span>Cities & Locations Dropdown</span>
          <span className="ml-1 px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
            {locationOptions.length}
          </span>
        </button>
      </div>

      {/* Controls: Search & Category Filter */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'specialties'
                ? 'Filter by specialty name, keyword...'
                : activeTab === 'qualifications'
                ? 'Filter by degree name, field...'
                : 'Filter by city name, district alias...'
            }
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {activeTab === 'specialties' ? (
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <span className="text-xs text-slate-400 font-medium shrink-0">Category:</span>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Categories ({specialties.length})</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ) : activeTab === 'qualifications' ? (
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <span className="text-xs text-slate-400 font-medium shrink-0">Level:</span>
            <select
              value={selectedLevel}
              onChange={e => setSelectedLevel(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Degree Levels ({doctorDegrees.length})</option>
              {levels.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Navigation className="w-3.5 h-3.5 text-emerald-400" />
            <span>Active in Patient App Dropdown: <strong className="text-white">All Nepal + {locationOptions.filter(l => l.is_active).length} Cities</strong></span>
          </div>
        )}
      </div>

      {/* Main Content: Tab 1 (Specialties) */}
      {activeTab === 'specialties' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSpecialties.map(spec => (
              <div
                key={spec.id}
                className={`bg-slate-800/80 border rounded-2xl p-4 transition shadow-sm hover:border-slate-600 flex flex-col justify-between ${
                  spec.is_active ? 'border-slate-700' : 'border-slate-800 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        {renderSpecialtyIcon(spec.icon)}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-white">{spec.name}</h3>
                        <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">
                          {spec.category}
                        </span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => toggleSpecialtyActive(spec)}
                      title={spec.is_active ? 'Specialty Active (Click to Disable)' : 'Specialty Disabled (Click to Enable)'}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        spec.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {spec.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </div>

                  {spec.description && (
                    <p className="text-xs text-slate-300/80 line-clamp-2 mb-3">
                      {spec.description}
                    </p>
                  )}

                  {/* Keywords chips */}
                  <div className="space-y-1 mb-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Search Keywords:</div>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {spec.search_keywords.split(',').map((kw, idx) => {
                        const trimmed = kw.trim()
                        if (!trimmed) return null
                        const isMatch = searchQuery && trimmed.toLowerCase().includes(searchQuery.toLowerCase())
                        return (
                          <span
                            key={idx}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isMatch
                                ? 'bg-indigo-500 text-white font-bold'
                                : 'bg-slate-900 text-slate-400 border border-slate-700/60'
                            }`}
                          >
                            {trimmed}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-700/60 mt-2">
                  <button
                    onClick={() => openEditSpecialty(spec)}
                    className="p-1.5 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDeleteSpecialty(spec.id, spec.name)}
                    className="p-1.5 hover:bg-rose-500/10 text-rose-400 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredSpecialties.length === 0 && !loading && (
            <div className="text-center py-12 text-slate-400 bg-slate-800/40 rounded-2xl border border-slate-800">
              No medical specialties found matching your filter.
            </div>
          )}
        </div>
      )}

      {/* Main Content: Tab 2 (Qualifications) */}
      {activeTab === 'qualifications' && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-700 text-slate-400 uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-4">Degree / Qualification</th>
                  <th className="py-3 px-4">Degree Level</th>
                  <th className="py-3 px-4">Field of Study</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {filteredQualifications.map(qual => (
                  <tr key={qual.id} className="hover:bg-slate-750/50 transition">
                    <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>{qual.degree_name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        qual.level === 'Super Specialization'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : qual.level === 'Postgraduate'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : qual.level === 'Undergraduate'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {qual.level}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-300">
                      {qual.field_of_study}
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                      {qual.description || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => toggleQualActive(qual)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          qual.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {qual.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditQualification(qual)}
                          className="p-1 hover:bg-slate-700 text-slate-300 rounded transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteQualification(qual.id, qual.degree_name)}
                          className="p-1 hover:bg-rose-500/10 text-rose-400 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredQualifications.length === 0 && !loading && (
            <div className="text-center py-12 text-slate-400">
              No doctor qualifications found matching your filter.
            </div>
          )}
        </div>
      )}

      {/* Main Content: Tab 3 (Patient App Locations) */}
      {activeTab === 'locations' && (
        <div className="space-y-4">
          {/* Live Patient App Top Location Selector Preview */}
          <div className="bg-gradient-to-r from-slate-900 to-emerald-950/30 border border-emerald-500/30 rounded-2xl p-4 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white uppercase tracking-wider">
                    Live App & Website City Dropdown Preview
                  </div>
                  <div className="text-[11px] text-slate-400">
                    These active cities appear in the location dropdown across the Patient App and Website.
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                Real-Time Sync Active
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
              <span className="inline-flex items-center gap-1.5 bg-indigo-600/20 border border-indigo-500/40 text-indigo-200 text-xs font-bold px-3 py-1.5 rounded-xl">
                <Navigation className="w-3 h-3 text-indigo-400" />
                Use Current Location (GPS)
              </span>
              <span className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-sm">
                <MapPin className="w-3 h-3" />
                All Nepal (Default)
              </span>
              {locationOptions.filter(l => l.is_active).map(loc => (
                <button
                  key={loc.id}
                  onClick={() => openEditLocation(loc)}
                  title="Click to edit this location option"
                  className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl transition"
                >
                  <MapPin className="w-3 h-3 text-emerald-400" />
                  <span>{loc.degree_name}</span>
                  <Edit2 className="w-3 h-3 text-slate-400 ml-0.5" />
                </button>
              ))}
            </div>
          </div>

          {/* Locations Table */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/70 border-b border-slate-700 text-slate-400 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Location / City Name</th>
                    <th className="py-3 px-4">Matched District & Area Keywords</th>
                    <th className="py-3 px-4">GPS Center Coordinates</th>
                    <th className="py-3 px-4">Patient App Visibility</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {filteredLocations.map(loc => (
                    <tr key={loc.id} className="hover:bg-slate-750/50 transition">
                      <td className="py-3.5 px-4 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                            <MapPin className="w-3.5 h-3.5" />
                          </div>
                          <span>{loc.degree_name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {(loc.description || loc.degree_name.toLowerCase()).split(',').map((alias, i) => {
                            const trimmed = alias.trim()
                            if (!trimmed) return null
                            return (
                              <span
                                key={i}
                                className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-700/70"
                              >
                                {trimmed}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                        {loc.field_of_study || '27.7172, 85.3240'}
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => toggleQualActive(loc)}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition ${
                            loc.is_active
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                          }`}
                        >
                          {loc.is_active ? 'Shown in App' : 'Hidden'}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditLocation(loc)}
                            className="px-2.5 py-1 bg-slate-700/70 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteLocation(loc.id, loc.degree_name)}
                            className="p-1.5 hover:bg-rose-500/10 text-rose-400 rounded-lg transition"
                            title="Delete Location"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredLocations.length === 0 && !loading && (
              <div className="text-center py-12 text-slate-400">
                No location options found matching your filter. Click &quot;Add Location Option&quot; to add one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Specialty Add/Edit Modal */}
      {showSpecialtyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative">
            <button
              onClick={() => setShowSpecialtyModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-white mb-1">
              {editingSpecialty ? 'Edit Clinic Specialty' : 'Add New Clinic Specialty'}
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Configure clinic type and patient symptom search keywords.
            </p>

            <form onSubmit={handleSaveSpecialty} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Specialty Name *</label>
                <input
                  type="text"
                  value={specialtyForm.name}
                  onChange={e => setSpecialtyForm({ ...specialtyForm, name: e.target.value })}
                  placeholder="e.g. Ophthalmology (Eye Care) or Dental Care"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <input
                    type="text"
                    value={specialtyForm.category}
                    onChange={e => setSpecialtyForm({ ...specialtyForm, category: e.target.value })}
                    placeholder="e.g. Eye & Vision, Dental & Oral"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Icon Representation</label>
                  <select
                    value={specialtyForm.icon}
                    onChange={e => setSpecialtyForm({ ...specialtyForm, icon: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Stethoscope">Stethoscope (General)</option>
                    <option value="Eye">Eye (Vision / Ophthalmology)</option>
                    <option value="Smile">Smile (Dentistry / Oral)</option>
                    <option value="Sparkles">Sparkles (Dermatology / Skin)</option>
                    <option value="HeartPulse">HeartPulse (Cardiology)</option>
                    <option value="Bone">Bone (Orthopedics)</option>
                    <option value="Baby">Baby (Pediatrics)</option>
                    <option value="Brain">Brain (Neurology)</option>
                    <option value="Wind">Wind (Pulmonology)</option>
                    <option value="Activity">Activity (ENT)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Search Keywords & Symptoms * (Comma-separated)
                </label>
                <textarea
                  value={specialtyForm.search_keywords}
                  onChange={e => setSpecialtyForm({ ...specialtyForm, search_keywords: e.target.value })}
                  placeholder="e.g. eye, vision, sight, cataract, spectacles, glasses, glaucoma, red eye, lasik"
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  When patients search for any of these words in the mobile app, this specialty and its clinics/doctors will be returned.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  value={specialtyForm.description}
                  onChange={e => setSpecialtyForm({ ...specialtyForm, description: e.target.value })}
                  placeholder="Clinical scope, diagnostic capabilities, typical procedures..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="specActive"
                  checked={specialtyForm.is_active}
                  onChange={e => setSpecialtyForm({ ...specialtyForm, is_active: e.target.checked })}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="specActive" className="text-xs text-slate-300">
                  Visible & selectable in mobile apps registration and search
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSpecialtyModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-md shadow-indigo-600/30"
                >
                  {editingSpecialty ? 'Update Specialty' : 'Save Specialty'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Qualification Add/Edit Modal */}
      {showQualModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative">
            <button
              onClick={() => setShowQualModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-white mb-1">
              {editingQual ? 'Edit Doctor Degree' : 'Add Doctor Degree / Qualification'}
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Configure medical qualifications available for doctors during KYC and settings.
            </p>

            <form onSubmit={handleSaveQualification} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Degree Name *</label>
                <input
                  type="text"
                  value={qualForm.degree_name}
                  onChange={e => setQualForm({ ...qualForm, degree_name: e.target.value })}
                  placeholder="e.g. MBBS, MD - Internal Medicine, DM - Cardiology"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Level</label>
                  <select
                    value={qualForm.level}
                    onChange={e => setQualForm({ ...qualForm, level: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Undergraduate">Undergraduate (MBBS, BDS, BAMS)</option>
                    <option value="Postgraduate">Postgraduate (MD, MS, MDS, DNB)</option>
                    <option value="Super Specialization">Super Specialization (DM, MCh)</option>
                    <option value="Fellowship">Fellowship / Post-Doctoral</option>
                    <option value="Diploma">Diploma / Allied Health</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Field of Study</label>
                  <input
                    type="text"
                    value={qualForm.field_of_study}
                    onChange={e => setQualForm({ ...qualForm, field_of_study: e.target.value })}
                    placeholder="e.g. Cardiology, Surgery, Pediatrics"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  value={qualForm.description}
                  onChange={e => setQualForm({ ...qualForm, description: e.target.value })}
                  placeholder="Scope of credential, recognized regulatory authority, etc."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="qualActive"
                  checked={qualForm.is_active}
                  onChange={e => setQualForm({ ...qualForm, is_active: e.target.checked })}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="qualActive" className="text-xs text-slate-300">
                  Visible in doctor registration & KYC dropdowns
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowQualModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-md shadow-indigo-600/30"
                >
                  {editingQual ? 'Update Degree' : 'Save Degree'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Location Option Add/Edit Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative">
            <button
              onClick={() => setShowLocationModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <MapPin className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-white">
                {editingLocation ? 'Edit City in Location Dropdown' : 'Add New City to Location Dropdown'}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Configure the city name and area search keywords shown in the location dropdown on the website and mobile app.
            </p>

            <form onSubmit={handleSaveLocation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  City Name * (Shown in Location Dropdown)
                </label>
                <input
                  type="text"
                  value={locationForm.city_name}
                  onChange={e => setLocationForm({ ...locationForm, city_name: e.target.value })}
                  placeholder="e.g. Kathmandu, Pokhara, Janakpur, Itahari, Birtamode, Butwal..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  District & Area Search Keywords (Comma-separated)
                </label>
                <textarea
                  value={locationForm.aliases}
                  onChange={e => setLocationForm({ ...locationForm, aliases: e.target.value })}
                  placeholder="e.g. kathmandu, ktm, bagmati, thamel, baneshwor, chabahil, maharajgunj, kalanki"
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  When a patient selects this city, clinics whose address or name contains any of these keywords will be matched.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  GPS Center Coordinates (Latitude, Longitude)
                </label>
                <input
                  type="text"
                  value={locationForm.coordinates}
                  onChange={e => setLocationForm({ ...locationForm, coordinates: e.target.value })}
                  placeholder="e.g. 27.7172, 85.3240"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Used when the patient taps &quot;Use Current Location (GPS)&quot; to determine the closest city in Nepal.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="locActive"
                  checked={locationForm.is_active}
                  onChange={e => setLocationForm({ ...locationForm, is_active: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="locActive" className="text-xs text-slate-300">
                  Show this city in the location dropdown (Website & Mobile App)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md shadow-emerald-600/30"
                >
                  {editingLocation ? 'Update City' : 'Add City to Dropdown'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
