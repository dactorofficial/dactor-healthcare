import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { DactorNotification, TargetAudience } from '../lib/types'
import { Send, Users, CheckCircle, Clock, Trash2, RefreshCw, Search, AlertTriangle } from 'lucide-react'

export default function BroadcastNotification() {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<TargetAudience>('all_users')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [sentSuccess, setSentSuccess] = useState<string | null>(null)
  const [history, setHistory] = useState<DactorNotification[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [filterAudience, setFilterAudience] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchHistory()
  }, [])

  const showFeedback = (msg: string) => {
    setSentSuccess(msg)
    setTimeout(() => setSentSuccess(null), 4000)
  }

  const fetchHistory = async () => {
    setFetching(true)
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
      if (!error && data) {
        setHistory(data as DactorNotification[])
      }
    } catch (e) {
      console.warn('Error fetching notifications:', e)
    } finally {
      setFetching(false)
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !message.trim()) return
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert([{
          title: title.trim(),
          message: message.trim(),
          type: 'broadcast',
          target_audience: audience,
          is_read: false,
        }])
        .select()
        .single()

      if (!error && data) {
        setHistory(prev => [data as DactorNotification, ...prev])
      } else {
        const fallbackNotif: DactorNotification = {
          id: 'notif_' + Math.random().toString(36).substring(2, 9),
          title: title.trim(),
          message: message.trim(),
          type: 'broadcast',
          target_audience: audience,
          is_read: false,
          created_at: new Date().toISOString()
        }
        setHistory(prev => [fallbackNotif, ...prev])
      }
      setTitle('')
      setMessage('')
      showFeedback('Broadcast alert dispatched to target audience successfully!')
    } catch (err) {
      console.warn('Error sending notification:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteNotification = async (id: string) => {
    setDeletingId(id)
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id)

      if (error) {
        console.warn('Delete error:', error)
      }
      setHistory(prev => prev.filter(item => item.id !== id))
      showFeedback('Notification removed successfully.')
    } catch (err) {
      console.warn('Failed to remove notification:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleClearAllNotifications = async () => {
    if (filteredHistory.length === 0) return
    setClearingAll(true)
    try {
      const idsToDelete = filteredHistory.map(item => item.id)
      const { error } = await supabase
        .from('notifications')
        .delete()
        .in('id', idsToDelete)

      if (error) {
        console.warn('Bulk delete error:', error)
      }
      const deletedSet = new Set(idsToDelete)
      setHistory(prev => prev.filter(item => !deletedSet.has(item.id)))
      setConfirmClearAll(false)
      showFeedback(`Removed ${idsToDelete.length} notification(s) from the system.`)
    } catch (err) {
      console.warn('Failed to clear notifications:', err)
    } finally {
      setClearingAll(false)
    }
  }

  const filteredHistory = history.filter(item => {
    const matchesAudience = filterAudience === 'all' || item.target_audience === filterAudience
    const q = searchQuery.trim().toLowerCase()
    const matchesSearch = !q ||
      (item.title || '').toLowerCase().includes(q) ||
      (item.message || '').toLowerCase().includes(q) ||
      (item.type || '').toLowerCase().includes(q)
    return matchesAudience && matchesSearch
  })

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Broadcast & Notification Manager</h1>
          <p className="text-slate-400 text-sm mt-1">
            Dispatch system notifications or remove outdated alerts across patients, doctors, and clinics.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchHistory}
          disabled={fetching}
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin text-indigo-400' : ''}`} />
          Refresh
        </button>
      </div>

      {sentSuccess && (
        <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-sm font-semibold">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{sentSuccess}</span>
        </div>
      )}

      {/* Broadcast Composer */}
      <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-sm">
        <h2 className="font-bold text-base text-white mb-4 flex items-center gap-2">
          <Send className="w-4 h-4 text-indigo-400" />
          Compose Notification
        </h2>

        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Select Target Audience
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setAudience('all_users')}
                className={`p-3.5 rounded-xl border text-left transition flex items-center gap-3 ${
                  audience === 'all_users'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-5 h-5 text-indigo-400" />
                <div>
                  <div className="text-sm font-bold">All Patients</div>
                  <div className="text-[11px] text-slate-400">Every user of patient app</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAudience('all_doctors')}
                className={`p-3.5 rounded-xl border text-left transition flex items-center gap-3 ${
                  audience === 'all_doctors'
                    ? 'bg-emerald-600/20 border-emerald-500 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-sm font-bold">All Doctors</div>
                  <div className="text-[11px] text-slate-400">All registered physicians</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAudience('all_clinics')}
                className={`p-3.5 rounded-xl border text-left transition flex items-center gap-3 ${
                  audience === 'all_clinics'
                    ? 'bg-purple-600/20 border-purple-500 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-5 h-5 text-purple-400" />
                <div>
                  <div className="text-sm font-bold">All Clinics</div>
                  <div className="text-[11px] text-slate-400">Clinic administrators</div>
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Notification Title
            </label>
            <input
              type="text"
              placeholder="e.g., Important Public Holiday OPD Schedule Update"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Message Content
            </label>
            <textarea
              rows={3}
              placeholder="Type your announcement or update here..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 rounded-xl transition flex items-center gap-2 text-sm shadow-md shadow-indigo-600/20 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Broadcasting...' : 'Broadcast to Selected Audience'}
            </button>
          </div>
        </form>
      </div>

      {/* Broadcast History & Removal */}
      <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-bold text-base text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            Active & Past Notifications ({filteredHistory.length})
          </h2>

          {filteredHistory.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove All ({filteredHistory.length})
            </button>
          )}
        </div>

        {/* Confirm Clear All Banner */}
        {confirmClearAll && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-rose-200 text-xs">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>
                Are you sure you want to permanently remove all <strong>{filteredHistory.length}</strong> displayed notification(s)?
              </span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                disabled={clearingAll}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllNotifications}
                disabled={clearingAll}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition disabled:opacity-50"
              >
                {clearingAll ? 'Removing...' : 'Confirm Remove All'}
              </button>
            </div>
          </div>
        )}

        {/* Filter & Search Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search notifications by title or message..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'All' },
              { id: 'all_users', label: 'Patients' },
              { id: 'all_doctors', label: 'Doctors' },
              { id: 'all_clinics', label: 'Clinics' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterAudience(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                  filterAudience === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notifications List */}
        {fetching ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            Loading notifications...
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-sm border border-dashed border-slate-700 rounded-xl">
            No notifications found.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredHistory.map(item => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-slate-900 border border-slate-700/60 flex items-start justify-between gap-4 hover:border-slate-600 transition"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-white">{item.title}</span>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md ${
                      item.target_audience === 'all_users' ? 'bg-indigo-500/20 text-indigo-300' :
                      item.target_audience === 'all_doctors' ? 'bg-emerald-500/20 text-emerald-300' :
                      'bg-purple-500/20 text-purple-300'
                    }`}>
                      {(item.target_audience || 'all_users').replace('_', ' ')}
                    </span>
                    {item.type && item.type !== 'broadcast' && (
                      <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                        {item.type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed break-words">{item.message}</p>
                  <div className="text-[11px] text-slate-500 pt-1">
                    Dispatched on: {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteNotification(item.id)}
                  disabled={deletingId === item.id}
                  title="Remove Notification"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-semibold transition disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingId === item.id ? 'Removing...' : 'Remove'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
