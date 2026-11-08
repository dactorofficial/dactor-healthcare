import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Clinic } from '../lib/types'
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Building2,
  MapPin,
  Phone,
  Mail,
  Clock,
  Search,
  RefreshCw,
  CheckCircle2,
  X,
  AlertCircle,
  ShieldAlert
} from 'lucide-react'

export default function RecycleBin() {
  const [archivedClinics, setArchivedClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'within_retention' | 'overdue'>('all')

  // Modals
  const [confirmDeleteClinic, setConfirmDeleteClinic] = useState<Clinic | null>(null)
  const [confirmRestoreClinic, setConfirmRestoreClinic] = useState<Clinic | null>(null)
  const [confirmPurgeExpiredModal, setConfirmPurgeExpiredModal] = useState(false)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetchArchivedClinics()
  }, [])

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 4000)
  }

  const fetchArchivedClinics = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      setIsRefreshing(true)

      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .eq('is_archived', true)
        .order('archived_at', { ascending: false })

      if (error) {
        console.error('Error fetching archived clinics:', error)
        showToast(`Failed to fetch archived clinics: ${error.message}`, 'error')
      } else if (data) {
        setArchivedClinics(data as Clinic[])
      }
    } catch (e: any) {
      console.error('Fetch archived exception:', e)
      showToast(e?.message || 'Error connecting to database', 'error')
    } finally {
      if (showLoading) setLoading(false)
      setIsRefreshing(false)
    }
  }

  const calculateDaysLeft = (scheduledDate?: string | null) => {
    if (!scheduledDate) return 0
    const diffTime = new Date(scheduledDate).getTime() - new Date().getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  // Restore clinic back to active status
  const handleRestore = async (clinic: Clinic) => {
    setActionInProgress(true)
    try {
      const updates = {
        is_archived: false,
        archived_at: null,
        deletion_scheduled_at: null,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('clinics')
        .update(updates)
        .eq('id', clinic.id)

      if (error) {
        console.error('Error restoring clinic:', error)
        showToast(`Failed to restore: ${error.message}`, 'error')
      } else {
        setArchivedClinics(prev => prev.filter(c => c.id !== clinic.id))
        showToast(`"${clinic.name}" successfully restored to active clinics!`, 'success')
        setConfirmRestoreClinic(null)
      }
    } catch (e: any) {
      showToast(e?.message || 'Restore failed', 'error')
    } finally {
      setActionInProgress(false)
    }
  }

  // Hard delete clinic permanently
  const handlePermanentDelete = async (clinic: Clinic) => {
    setActionInProgress(true)
    try {
      const { error } = await supabase
        .from('clinics')
        .delete()
        .eq('id', clinic.id)

      if (error) {
        console.error('Error permanently deleting clinic:', error)
        showToast(`Failed to delete: ${error.message}`, 'error')
      } else {
        setArchivedClinics(prev => prev.filter(c => c.id !== clinic.id))
        showToast(`"${clinic.name}" permanently purged from database.`, 'success')
        setConfirmDeleteClinic(null)
      }
    } catch (e: any) {
      showToast(e?.message || 'Delete failed', 'error')
    } finally {
      setActionInProgress(false)
    }
  }

  // Purge all clinics past retention period
  const handlePurgeAllExpired = async () => {
    setActionInProgress(true)
    try {
      const overdueClinics = archivedClinics.filter(c => calculateDaysLeft(c.deletion_scheduled_at) <= 0)
      if (overdueClinics.length === 0) {
        showToast('No overdue clinics to purge.', 'error')
        setConfirmPurgeExpiredModal(false)
        setActionInProgress(false)
        return
      }

      const ids = overdueClinics.map(c => c.id)
      const { error } = await supabase
        .from('clinics')
        .delete()
        .in('id', ids)

      if (error) {
        showToast(`Purge failed: ${error.message}`, 'error')
      } else {
        setArchivedClinics(prev => prev.filter(c => !ids.includes(c.id)))
        showToast(`Successfully purged ${ids.length} expired clinics.`, 'success')
        setConfirmPurgeExpiredModal(false)
      }
    } catch (e: any) {
      showToast(e?.message || 'Bulk purge error', 'error')
    } finally {
      setActionInProgress(false)
    }
  }

  // Filtered clinics
  const filteredClinics = archivedClinics.filter(clinic => {
    const matchesSearch =
      clinic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clinic.address_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clinic.contact_phone.includes(searchQuery) ||
      clinic.contact_email.toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    const daysLeft = calculateDaysLeft(clinic.deletion_scheduled_at)
    if (filterType === 'within_retention') return daysLeft > 0
    if (filterType === 'overdue') return daysLeft <= 0
    return true
  })

  const totalArchived = archivedClinics.length
  const withinRetentionCount = archivedClinics.filter(c => calculateDaysLeft(c.deletion_scheduled_at) > 0).length
  const overdueCount = archivedClinics.filter(c => calculateDaysLeft(c.deletion_scheduled_at) <= 0).length

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border text-sm font-semibold transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                Recycle Bin & Data Retention
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {totalArchived} Archived
                </span>
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">
                Archived clinics held in 30-day retention prior to permanent purge. Restore or hard delete records.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {overdueCount > 0 && (
            <button
              onClick={() => setConfirmPurgeExpiredModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition"
            >
              <Trash2 className="w-4 h-4" />
              Purge All Expired ({overdueCount})
            </button>
          )}

          <button
            onClick={() => fetchArchivedClinics(true)}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition disabled:opacity-50"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-slate-700/60 flex items-center justify-center text-slate-300">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{totalArchived}</div>
            <div className="text-xs text-slate-400 font-medium">Total In Recycle Bin</div>
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-300">{withinRetentionCount}</div>
            <div className="text-xs text-slate-400 font-medium">Within 30-Day Retention</div>
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-rose-400">{overdueCount}</div>
            <div className="text-xs text-slate-400 font-medium">Overdue / Ready for Purge</div>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search archived clinics..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filterType === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({totalArchived})
          </button>
          <button
            onClick={() => setFilterType('within_retention')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filterType === 'within_retention'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            In Retention ({withinRetentionCount})
          </button>
          <button
            onClick={() => setFilterType('overdue')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filterType === 'overdue'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            Overdue Purge ({overdueCount})
          </button>
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-400" />
          <p className="text-sm">Loading archived clinics from database...</p>
        </div>
      ) : filteredClinics.length === 0 ? (
        <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4 text-slate-500">
            <Trash2 className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">Recycle Bin is Empty</h3>
          <p className="text-slate-400 text-xs max-w-sm mx-auto">
            {searchQuery
              ? 'No archived clinics matched your current search filters.'
              : 'There are currently no archived clinics scheduled for deletion.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredClinics.map(clinic => {
            const daysLeft = calculateDaysLeft(clinic.deletion_scheduled_at)
            const isOverdue = daysLeft <= 0
            const archivedDateStr = clinic.archived_at
              ? new Date(clinic.archived_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
              : 'N/A'
            const scheduledDateStr = clinic.deletion_scheduled_at
              ? new Date(clinic.deletion_scheduled_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
              : '30 days after archive'

            // Progress bar (0% to 100% of 30 days)
            const daysElapsed = Math.max(0, 30 - Math.max(0, daysLeft))
            const percentElapsed = Math.min(100, Math.round((daysElapsed / 30) * 100))

            return (
              <div
                key={clinic.id}
                className="bg-slate-800/90 border border-slate-700/80 hover:border-slate-600 rounded-2xl p-5 transition shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-5"
              >
                {/* Clinic Info */}
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-base text-white">{clinic.name}</span>
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-700 text-indigo-300 border border-slate-600">
                      {clinic.type === 'single_visit'
                        ? 'Single Visit'
                        : clinic.type === 'multi_visit'
                        ? 'Multi Visit'
                        : 'Diagnostic Lab'}
                    </span>
                    {isOverdue ? (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Purge Overdue
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {daysLeft} Days Remaining
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      {clinic.address_text || 'No address specified'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      {clinic.contact_phone || 'N/A'}
                    </span>
                    {clinic.contact_email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                        {clinic.contact_email}
                      </span>
                    )}
                  </div>

                  {/* Retention Timeline bar */}
                  <div className="mt-3 pt-3 border-t border-slate-700/60 max-w-xl">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 font-medium">
                      <span>Archived: <strong className="text-slate-300">{archivedDateStr}</strong></span>
                      <span>Purge Date: <strong className={isOverdue ? 'text-rose-400 font-bold' : 'text-slate-300'}>{scheduledDateStr}</strong></span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isOverdue ? 'bg-rose-500' : percentElapsed > 75 ? 'bg-amber-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${percentElapsed}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-700/60">
                  <button
                    onClick={() => setConfirmRestoreClinic(clinic)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white transition shadow border border-slate-600"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                    Restore Clinic
                  </button>

                  <button
                    onClick={() => setConfirmDeleteClinic(clinic)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600/90 hover:bg-rose-600 text-white transition shadow-lg shadow-rose-600/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Permanently Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {confirmRestoreClinic && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <RotateCcw className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Restore Clinic to Active Operations?</h3>
              <p className="text-xs text-slate-400 mt-1">
                You are about to restore <strong className="text-white">"{confirmRestoreClinic.name}"</strong>. It will be removed from the Recycle Bin and return to the active platform registry immediately.
              </p>
            </div>

            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 text-xs text-slate-300 space-y-1">
              <div>📍 <strong>Address:</strong> {confirmRestoreClinic.address_text}</div>
              <div>📞 <strong>Phone:</strong> {confirmRestoreClinic.contact_phone}</div>
              <div>🏷️ <strong>Category:</strong> {confirmRestoreClinic.type}</div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmRestoreClinic(null)}
                disabled={actionInProgress}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRestore(confirmRestoreClinic)}
                disabled={actionInProgress}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition flex items-center gap-1.5"
              >
                {actionInProgress && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {confirmDeleteClinic && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Permanently Delete Clinic?</h3>
              <p className="text-xs text-rose-300 font-semibold mt-1">
                ⚠️ THIS ACTION IS IRREVERSIBLE AND CANNOT BE UNDONE.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Permanently deleting <strong className="text-white">"{confirmDeleteClinic.name}"</strong> will purge all associated services, slots, booked appointments, patient records, and queue entries from the database.
              </p>
            </div>

            <div className="p-3 bg-rose-950/30 border border-rose-800/40 rounded-xl text-xs text-rose-200">
              <div>Clinic ID: <code className="text-[11px] font-mono text-rose-300">{confirmDeleteClinic.id}</code></div>
              <div>Archived on: {confirmDeleteClinic.archived_at ? new Date(confirmDeleteClinic.archived_at).toLocaleString() : 'N/A'}</div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDeleteClinic(null)}
                disabled={actionInProgress}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handlePermanentDelete(confirmDeleteClinic)}
                disabled={actionInProgress}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5"
              >
                {actionInProgress && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Yes, Purge Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purge All Expired Confirmation Modal */}
      {confirmPurgeExpiredModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Purge All Expired Retention Clinics?</h3>
              <p className="text-xs text-slate-400 mt-1">
                You are about to permanently delete <strong className="text-rose-400 font-bold">{overdueCount} clinic(s)</strong> whose 30-day retention period has expired. All their data will be purged immediately.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmPurgeExpiredModal(false)}
                disabled={actionInProgress}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePurgeAllExpired}
                disabled={actionInProgress}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5"
              >
                {actionInProgress && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Purge {overdueCount} Clinics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
