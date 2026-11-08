import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { SupportTicket } from '../lib/types'
import {
  Headphones,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Check,
  Copy,
  Mail,
  Phone,
  User,
  Building2,
  Stethoscope,
  Filter,
  MessageSquare,
  ShieldCheck,
  Trash2,
  X,
  Calendar,
  Save,
  LifeBuoy
} from 'lucide-react'

export default function SupportTickets() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'closed'>('all')
  const [roleFilter, setRoleFilter] = useState<'all' | 'clinic' | 'doctor' | 'patient' | 'other'>('all')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  
  // Selected ticket for detailed triage modal
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [modalAdminNotes, setModalAdminNotes] = useState('')
  const [modalStatus, setModalStatus] = useState<'open' | 'in_progress' | 'resolved' | 'closed'>('open')
  const [isSavingResolution, setIsSavingResolution] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('')
  const [saveErrorMsg, setSaveErrorMsg] = useState('')

  useEffect(() => {
    fetchTickets()

    // Setup Supabase Realtime subscription for incoming support tickets
    const channel = supabase
      .channel('admin-support-tickets-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          fetchTickets(false)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchTickets = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true)
    setRefreshing(true)
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .or('type.eq.support_ticket,title.ilike.%[Support%')
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('Error fetching tickets from Supabase:', error)
      }

      const ticketMap = new Map<string, SupportTicket>()

      if (Array.isArray(data)) {
        data.forEach((row: any) => {
          try {
            if (row.message && typeof row.message === 'string' && row.message.trim().startsWith('{')) {
              const parsed = JSON.parse(row.message)
              if (parsed.ticketCode) {
                ticketMap.set(parsed.ticketCode, {
                  ...parsed,
                  id: row.id || parsed.id,
                  status: row.is_read ? (parsed.status === 'open' ? 'resolved' : parsed.status) : parsed.status,
                  createdAt: row.created_at || parsed.createdAt || new Date().toISOString(),
                })
                return
              }
            }

            // Fallback parsing for legacy raw text notifications
            const title = row.title || ''
            const matchCode = title.match(/#([A-Z0-9-]+)/)
            const tCode = matchCode ? matchCode[1] : `DAC-TKT-${(row.id || '').substring(0, 6)}`
            const matchCategory = title.replace(/^\[Support Inquiry\]\s*/i, '').split('-')[0]?.trim() || 'General'

            const msg = row.message || ''
            const emailMatch = msg.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)?.[0] || 'Unknown'
            const phoneMatch = msg.match(/(?:\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b98\d{8}\b/)?.[0] || '–'

            ticketMap.set(tCode, {
              id: row.id,
              ticketCode: tCode,
              name: title.split('-')?.[1]?.split('(')?.[0]?.trim() || 'Valued User',
              email: emailMatch,
              phone: phoneMatch,
              role: 'patient',
              category: matchCategory,
              message: msg,
              status: row.is_read ? 'resolved' : 'open',
              createdAt: row.created_at || new Date().toISOString(),
            })
          } catch (e) {
            console.error('Failed to parse ticket row:', e)
          }
        })
      }

      // Check localStorage fallback
      try {
        const cachedRaw = localStorage.getItem('dactor_support_tickets_v1')
        if (cachedRaw) {
          const cached: SupportTicket[] = JSON.parse(cachedRaw)
          cached.forEach((t) => {
            if (!ticketMap.has(t.ticketCode)) {
              ticketMap.set(t.ticketCode, t)
            }
          })
        }
      } catch {}

      const sorted = Array.from(ticketMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )

      setTickets(sorted)
    } catch (err) {
      console.error('Unexpected error loading support tickets:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2500)
  }

  const handleOpenDetailModal = (ticket: SupportTicket) => {
    setSelectedTicket(ticket)
    setModalAdminNotes(ticket.adminNotes || '')
    setModalStatus(ticket.status || 'open')
    setSaveSuccessMsg('')
    setSaveErrorMsg('')
  }

  const handleSaveResolution = async () => {
    if (!selectedTicket) return
    setIsSavingResolution(true)
    setSaveSuccessMsg('')
    setSaveErrorMsg('')

    const isResolved = modalStatus === 'resolved' || modalStatus === 'closed'
    const nowIso = new Date().toISOString()

    try {
      // 1. Update in Supabase notifications table
      const { data: rows, error: selectErr } = await supabase
        .from('notifications')
        .select('*')
        .ilike('title', `%${selectedTicket.ticketCode}%`)

      if (selectErr) {
        throw selectErr
      }

      if (Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          let updatedMessage = row.message
          if (row.message && typeof row.message === 'string' && row.message.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(row.message)
              parsed.status = modalStatus
              if (isResolved) parsed.resolvedAt = nowIso
              parsed.adminNotes = modalAdminNotes.trim()
              updatedMessage = JSON.stringify(parsed)
            } catch {}
          }

          const { error: updateErr } = await supabase
            .from('notifications')
            .update({
              is_read: isResolved,
              message: updatedMessage,
            })
            .eq('id', row.id)

          if (updateErr) throw updateErr
        }
      } else if (selectedTicket.id) {
        // Direct ID update fallback
        const updatedPayload = {
          ...selectedTicket,
          status: modalStatus,
          adminNotes: modalAdminNotes.trim(),
          resolvedAt: isResolved ? nowIso : selectedTicket.resolvedAt,
        }
        await supabase
          .from('notifications')
          .update({
            is_read: isResolved,
            message: JSON.stringify(updatedPayload),
          })
          .eq('id', selectedTicket.id)
      }

      // 2. Also update local storage cache for sync
      try {
        const cachedRaw = localStorage.getItem('dactor_support_tickets_v1')
        if (cachedRaw) {
          const cached: SupportTicket[] = JSON.parse(cachedRaw)
          const updated = cached.map((t) =>
            t.ticketCode === selectedTicket.ticketCode
              ? {
                  ...t,
                  status: modalStatus,
                  adminNotes: modalAdminNotes.trim(),
                  resolvedAt: isResolved ? nowIso : t.resolvedAt,
                }
              : t
          )
          localStorage.setItem('dactor_support_tickets_v1', JSON.stringify(updated))
        }
      } catch {}

      // 3. Update in-memory tickets state
      setTickets((prev) =>
        prev.map((t) =>
          t.ticketCode === selectedTicket.ticketCode
            ? {
                ...t,
                status: modalStatus,
                adminNotes: modalAdminNotes.trim(),
                resolvedAt: isResolved ? nowIso : t.resolvedAt,
              }
            : t
        )
      )

      setSelectedTicket((prev) =>
        prev
          ? {
              ...prev,
              status: modalStatus,
              adminNotes: modalAdminNotes.trim(),
              resolvedAt: isResolved ? nowIso : prev.resolvedAt,
            }
          : null
      )

      setSaveSuccessMsg('Ticket updated and resolution notes synced successfully!')
      setTimeout(() => setSaveSuccessMsg(''), 4000)
    } catch (err: any) {
      console.error('Error saving ticket resolution:', err)
      setSaveErrorMsg(err?.message || 'Failed to update ticket status in database.')
    } finally {
      setIsSavingResolution(false)
    }
  }

  const handleQuickStatusChange = async (
    ticket: SupportTicket,
    newStatus: 'open' | 'in_progress' | 'resolved' | 'closed'
  ) => {
    const isResolved = newStatus === 'resolved' || newStatus === 'closed'
    const nowIso = new Date().toISOString()

    // Optimistic update
    setTickets((prev) =>
      prev.map((t) =>
        t.ticketCode === ticket.ticketCode
          ? {
              ...t,
              status: newStatus,
              resolvedAt: isResolved ? nowIso : undefined,
            }
          : t
      )
    )

    try {
      const { data: rows } = await supabase
        .from('notifications')
        .select('*')
        .ilike('title', `%${ticket.ticketCode}%`)

      if (Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          let updatedMessage = row.message
          if (row.message && typeof row.message === 'string' && row.message.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(row.message)
              parsed.status = newStatus
              if (isResolved) parsed.resolvedAt = nowIso
              updatedMessage = JSON.stringify(parsed)
            } catch {}
          }
          await supabase
            .from('notifications')
            .update({
              is_read: isResolved,
              message: updatedMessage,
            })
            .eq('id', row.id)
        }
      }

      // Sync localStorage
      try {
        const cachedRaw = localStorage.getItem('dactor_support_tickets_v1')
        if (cachedRaw) {
          const cached: SupportTicket[] = JSON.parse(cachedRaw)
          const updated = cached.map((t) =>
            t.ticketCode === ticket.ticketCode
              ? {
                  ...t,
                  status: newStatus,
                  resolvedAt: isResolved ? nowIso : undefined,
                }
              : t
          )
          localStorage.setItem('dactor_support_tickets_v1', JSON.stringify(updated))
        }
      } catch {}
    } catch (err) {
      console.warn('Failed to update ticket status in Supabase:', err)
      fetchTickets(false)
    }
  }

  const handleDeleteTicket = async (ticket: SupportTicket) => {
    if (!window.confirm(`Are you sure you want to permanently delete ticket ${ticket.ticketCode}?`)) {
      return
    }

    try {
      if (ticket.id) {
        await supabase.from('notifications').delete().eq('id', ticket.id)
      }
      await supabase.from('notifications').delete().ilike('title', `%${ticket.ticketCode}%`)

      setTickets((prev) => prev.filter((t) => t.ticketCode !== ticket.ticketCode))

      try {
        const cachedRaw = localStorage.getItem('dactor_support_tickets_v1')
        if (cachedRaw) {
          const cached: SupportTicket[] = JSON.parse(cachedRaw)
          const updated = cached.filter((t) => t.ticketCode !== ticket.ticketCode)
          localStorage.setItem('dactor_support_tickets_v1', JSON.stringify(updated))
        }
      } catch {}

      if (selectedTicket?.ticketCode === ticket.ticketCode) {
        setSelectedTicket(null)
      }
    } catch (err) {
      console.error('Error deleting ticket:', err)
    }
  }

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Status filter
      if (statusFilter === 'open' && t.status !== 'open') return false
      if (statusFilter === 'in_progress' && t.status !== 'in_progress') return false
      if (statusFilter === 'resolved' && (t.status !== 'resolved' && t.status !== 'closed')) return false
      if (statusFilter === 'closed' && t.status !== 'closed') return false

      // Role filter
      if (roleFilter !== 'all' && t.role !== roleFilter) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchCode = t.ticketCode.toLowerCase().includes(q)
        const matchName = (t.name || '').toLowerCase().includes(q)
        const matchEmail = (t.email || '').toLowerCase().includes(q)
        const matchPhone = (t.phone || '').toLowerCase().includes(q)
        const matchCat = (t.category || '').toLowerCase().includes(q)
        const matchCustom = (t.customReason || '').toLowerCase().includes(q)
        const matchMsg = (t.message || '').toLowerCase().includes(q)
        const matchNotes = (t.adminNotes || '').toLowerCase().includes(q)
        if (!matchCode && !matchName && !matchEmail && !matchPhone && !matchCat && !matchCustom && !matchMsg && !matchNotes) {
          return false
        }
      }

      return true
    })
  }, [tickets, statusFilter, roleFilter, searchQuery])

  // Summary Metrics
  const openCount = tickets.filter((t) => t.status === 'open').length
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length
  const resolvedCount = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            Open
          </span>
        )
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            <Clock className="w-3 h-3 text-cyan-400" />
            In Progress
          </span>
        )
      case 'resolved':
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            {status === 'closed' ? 'Closed' : 'Resolved'}
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-700 text-slate-300">
            {status}
          </span>
        )
    }
  }

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'clinic':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
            <Building2 className="w-3 h-3" /> Clinic Staff
          </span>
        )
      case 'doctor':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
            <Stethoscope className="w-3 h-3" /> Doctor
          </span>
        )
      case 'patient':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/20">
            <User className="w-3 h-3" /> Patient
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/20">
            <LifeBuoy className="w-3 h-3" /> General / Partner
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <span>Support Tickets Desk</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold font-mono">
                  Real-time
                </span>
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">
                Centralized triage for user support inquiries, appointment booking bugs, clinic onboarding help, and OTP assistance.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => fetchTickets(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition disabled:opacity-50"
            title="Refresh tickets from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${refreshing ? 'animate-spin text-purple-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/90 border border-slate-700/80 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Inquiries</p>
              <h3 className="text-2xl font-extrabold text-white mt-1">{loading ? '...' : tickets.length}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-700/60 flex items-center justify-center text-slate-300">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-400">All recorded tickets across Dactor ecosystem</div>
        </div>

        <div className="bg-slate-800/90 border border-amber-500/30 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Pending Triage</p>
              <h3 className="text-2xl font-extrabold text-amber-300 mt-1">{loading ? '...' : openCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-amber-400/80">Requires administrator review or dispatch</div>
        </div>

        <div className="bg-slate-800/90 border border-cyan-500/30 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">In Progress</p>
              <h3 className="text-2xl font-extrabold text-cyan-300 mt-1">{loading ? '...' : inProgressCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-cyan-400/80">Currently assigned or awaiting clinic response</div>
        </div>

        <div className="bg-slate-800/90 border border-emerald-500/30 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Resolved / Closed</p>
              <h3 className="text-2xl font-extrabold text-emerald-300 mt-1">{loading ? '...' : resolvedCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-emerald-400/80">Inquiries successfully addressed with notes</div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ticket code (DAC-TKT-...), user name, phone, email, reason, or keyword..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-700/80 overflow-x-auto">
          {(['all', 'open', 'in_progress', 'resolved'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === st
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {st === 'all' && `All (${tickets.length})`}
              {st === 'open' && `Open (${openCount})`}
              {st === 'in_progress' && `In Progress (${inProgressCount})`}
              {st === 'resolved' && `Resolved (${resolvedCount})`}
            </button>
          ))}
        </div>

        {/* Role Selector */}
        <div className="shrink-0 flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="all">All Roles</option>
            <option value="patient">Patients Only</option>
            <option value="clinic">Clinic Staff Only</option>
            <option value="doctor">Doctors Only</option>
            <option value="other">General / Other</option>
          </select>
        </div>
      </div>

      {/* Tickets List */}
      {loading ? (
        <div className="p-16 flex flex-col items-center justify-center bg-slate-800/40 border border-slate-700/60 rounded-2xl">
          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-200">Loading Support Tickets...</p>
          <p className="text-xs text-slate-400 mt-1">Connecting to Dactor Supabase notifications...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="p-16 flex flex-col items-center justify-center bg-slate-800/40 border border-slate-700/60 rounded-2xl text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mb-3">
            <CheckCircle2 className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-base font-bold text-white">No Support Tickets Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            {searchQuery || statusFilter !== 'all' || roleFilter !== 'all'
              ? 'No tickets match the selected filters or search terms. Try clearing search filters.'
              : 'There are currently no support inquiries or unresolved tickets in the database.'}
          </p>
          {(searchQuery || statusFilter !== 'all' || roleFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('')
                setStatusFilter('all')
                setRoleFilter('all')
              }}
              className="mt-4 px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-medium transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map((ticket) => {
            const formattedDate = new Date(ticket.createdAt).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })

            return (
              <div
                key={ticket.ticketCode}
                className={`bg-slate-800/90 border rounded-2xl p-5 transition hover:border-slate-600 ${
                  ticket.status === 'open'
                    ? 'border-amber-500/40 shadow-sm'
                    : ticket.status === 'in_progress'
                    ? 'border-cyan-500/40'
                    : 'border-slate-700/80'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left Column: Code, Role, Requester & Reason */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Ticket Code with Copy Button */}
                      <button
                        onClick={() => handleCopyCode(ticket.ticketCode)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 hover:bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono font-bold text-purple-300 transition"
                        title="Click to copy ticket code"
                      >
                        <span>#{ticket.ticketCode}</span>
                        {copiedCode === ticket.ticketCode ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400" />
                        )}
                      </button>

                      {/* Status Badge */}
                      {getStatusBadge(ticket.status)}

                      {/* Role Badge */}
                      {getRoleBadge(ticket.role)}

                      {/* Created Date */}
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {formattedDate}
                      </span>
                    </div>

                    {/* Subject / Category & Custom Reason */}
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>{ticket.category}</span>
                        {ticket.customReason && (
                          <span className="text-xs font-normal text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            Spec: {ticket.customReason}
                          </span>
                        )}
                      </h4>

                      {/* Requester Contact Strip */}
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-300">
                        <span className="font-semibold text-white flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {ticket.name || 'Valued User'}
                        </span>

                        {ticket.phone && (
                          <a
                            href={`tel:${ticket.phone}`}
                            className="inline-flex items-center gap-1 text-slate-300 hover:text-cyan-300 transition"
                            title="Call user directly"
                          >
                            <Phone className="w-3.5 h-3.5 text-cyan-400" />
                            <span>{ticket.phone}</span>
                          </a>
                        )}

                        {ticket.email && (
                          <a
                            href={`mailto:${ticket.email}?subject=Dactor Support - Ticket %23${ticket.ticketCode}`}
                            className="inline-flex items-center gap-1 text-slate-300 hover:text-purple-300 transition"
                            title="Send email to user"
                          >
                            <Mail className="w-3.5 h-3.5 text-purple-400" />
                            <span>{ticket.email}</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Message Body */}
                    <div className="bg-slate-900/80 border border-slate-700/60 p-3 rounded-xl text-xs text-slate-300 whitespace-pre-wrap leading-relaxed mt-2">
                      {ticket.message || 'No additional message provided.'}
                    </div>

                    {/* Admin Resolution Notes (if present) */}
                    {ticket.adminNotes && (
                      <div className="bg-emerald-950/30 border border-emerald-500/30 p-2.5 rounded-xl text-xs text-emerald-200 flex items-start gap-2 mt-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-emerald-300">Admin Resolution: </span>
                          <span>{ticket.adminNotes}</span>
                          {ticket.resolvedAt && (
                            <span className="text-[10px] text-emerald-400/70 block mt-0.5">
                              Resolved at: {new Date(ticket.resolvedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Actions & Quick Status */}
                  <div className="flex lg:flex-col items-center lg:items-end justify-between gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-700/60">
                    <div className="flex items-center gap-2">
                      <select
                        value={ticket.status}
                        onChange={(e) => handleQuickStatusChange(ticket, e.target.value as any)}
                        className={`text-xs font-semibold rounded-xl px-3 py-1.5 border focus:outline-none transition cursor-pointer ${
                          ticket.status === 'open'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : ticket.status === 'in_progress'
                            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        }`}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>

                      <button
                        onClick={() => handleOpenDetailModal(ticket)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                      >
                        <span>Triage & Notes</span>
                      </button>

                      <button
                        onClick={() => handleDeleteTicket(ticket)}
                        className="p-1.5 bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-xl transition"
                        title="Delete Ticket"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Triage & Resolution Notes Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/80 bg-slate-850">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Headphones className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Ticket #{selectedTicket.ticketCode}</span>
                    {getStatusBadge(modalStatus)}
                  </h3>
                  <p className="text-xs text-slate-400">Triage & Administration Dispatch</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="w-8 h-8 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Requester Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/80 border border-slate-700/80 p-3.5 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Requester</span>
                  <span className="font-bold text-white mt-0.5 block">{selectedTicket.name || 'Valued User'}</span>
                  <span className="mt-1 block">{getRoleBadge(selectedTicket.role)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Contact Email</span>
                  <a
                    href={`mailto:${selectedTicket.email}`}
                    className="text-purple-300 hover:underline break-all mt-0.5 block"
                  >
                    {selectedTicket.email}
                  </a>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Phone Number</span>
                  <a
                    href={`tel:${selectedTicket.phone}`}
                    className="text-cyan-300 hover:underline mt-0.5 block font-mono"
                  >
                    {selectedTicket.phone}
                  </a>
                </div>
              </div>

              {/* Inquiry Category & Original Message */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Inquiry Reason & Message</label>
                <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-white">
                    <span>{selectedTicket.category}</span>
                    {selectedTicket.customReason && (
                      <span className="text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded text-[11px] border border-amber-500/20">
                        {selectedTicket.customReason}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {selectedTicket.message || 'No additional message provided.'}
                  </p>
                </div>
              </div>

              {/* Quick Communication Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {selectedTicket.phone && (
                  <a
                    href={`tel:${selectedTicket.phone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-medium transition"
                  >
                    <Phone className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Call Requester ({selectedTicket.phone})</span>
                  </a>
                )}
                {selectedTicket.email && (
                  <a
                    href={`mailto:${selectedTicket.email}?subject=Regarding Dactor Ticket %23${selectedTicket.ticketCode}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-medium transition"
                  >
                    <Mail className="w-3.5 h-3.5 text-purple-400" />
                    <span>Send Direct Email</span>
                  </a>
                )}
              </div>

              {/* Status Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Update Ticket Status</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['open', 'in_progress', 'resolved', 'closed'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setModalStatus(st)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                        modalStatus === st
                          ? st === 'open'
                            ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                            : st === 'in_progress'
                            ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                            : 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                          : 'bg-slate-900 text-slate-400 border border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {st === 'open' && 'Open'}
                      {st === 'in_progress' && 'In Progress'}
                      {st === 'resolved' && 'Resolved'}
                      {st === 'closed' && 'Closed'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin Resolution Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Administrator Resolution Notes</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Visible when user checks ticket code online
                  </span>
                </label>
                <textarea
                  rows={3}
                  value={modalAdminNotes}
                  onChange={(e) => setModalAdminNotes(e.target.value)}
                  placeholder="e.g. Investigated booking record. Contacted patient and rescheduled slot to tomorrow 10:00 AM. Verified OTP issue resolved."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition resize-none leading-relaxed"
                />
              </div>

              {/* Status Feedback Messages */}
              {saveSuccessMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}
              {saveErrorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{saveErrorMsg}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-700/80 bg-slate-850 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleDeleteTicket(selectedTicket)}
                className="px-3.5 py-2 text-rose-400 hover:bg-rose-500/10 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Ticket</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedTicket(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveResolution}
                  disabled={isSavingResolution}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/30 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingResolution ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Save Resolution</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
