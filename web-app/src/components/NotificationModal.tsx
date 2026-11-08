import React, { useState, useEffect } from 'react'
import {
  X,
  Bell,
  CheckCheck,
  RefreshCw,
} from 'lucide-react'
import {
  getPatientNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/db'
import { supabase } from '../lib/supabase'
import { DactorNotification } from '../types'

interface NotificationModalProps {
  isOpen: boolean
  onClose: () => void
  clinicId?: string
  onNotificationsChanged?: (unreadCount: number) => void
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  onNotificationsChanged,
}) => {
  const [notifications, setNotifications] = useState<DactorNotification[]>([])
  const [loading, setLoading] = useState(false)

  const fetchNotes = async () => {
    setLoading(true)
    try {
      let trackingCodes: string[] = []
      let userId: string | undefined = undefined
      try {
        trackingCodes = JSON.parse(localStorage.getItem('dactor_patient_tracking_codes') || '[]')
        const sessionRaw = localStorage.getItem('dactor_patient_session')
        if (sessionRaw) {
          const parsed = JSON.parse(sessionRaw)
          if (parsed?.id) userId = parsed.id
        }
      } catch {}

      const data = await getPatientNotifications({ userId, trackingCodes })
      // Strictly use real notifications from Supabase — NO demo-1 or demo-2
      setNotifications(data)
      if (onNotificationsChanged) {
        onNotificationsChanged(data.filter((n) => !n.isRead).length)
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotes()

    const channel = supabase
      .channel('patient-notifications-modal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        fetchNotes()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isOpen])

  const handleMarkOneRead = async (note: DactorNotification) => {
    if (note.isRead) return
    await markNotificationAsRead(note.id)
    const updated = notifications.map((n) => (n.id === note.id ? { ...n, isRead: true } : n))
    setNotifications(updated)
    if (onNotificationsChanged) {
      onNotificationsChanged(updated.filter((n) => !n.isRead).length)
    }
  }

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id)
    if (unreadIds.length === 0) return
    await markAllNotificationsAsRead(unreadIds)
    const updated = notifications.map((n) => ({ ...n, isRead: true }))
    setNotifications(updated)
    if (onNotificationsChanged) {
      onNotificationsChanged(0)
    }
  }

  if (!isOpen) return null

  const unreadCount = notifications.filter((n) => !n.isRead).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/45 backdrop-blur-md animate-in fade-in duration-200">
      <div className="liquid-glass-modal rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-8 shadow-glass-modal border border-white/80 relative max-h-[90vh] flex flex-col">
        {/* Specular Perimeter Line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] rounded-t-3xl bg-gradient-to-r from-transparent via-white/80 to-transparent" aria-hidden="true" />

        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-white/60 gap-2">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-brand-50/80 text-brand-700 flex items-center justify-center border border-brand-200/50 shadow-glass-sm backdrop-blur-md shrink-0">
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">Notifications & Alerts</h3>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                Live queue alerts & confirmations
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="px-2 sm:px-2.5 py-1 sm:py-1.5 text-[10px] sm:text-[11px] font-bold text-brand-700 bg-brand-50/80 hover:bg-brand-100 border border-brand-200/60 rounded-xl transition-all flex items-center gap-1 cursor-pointer shadow-glass-sm active:scale-95 backdrop-blur-md"
                title="Mark all as read"
              >
                <CheckCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Mark Read</span>
              </button>
            )}
            <button
              onClick={fetchNotes}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-brand-600 bg-white/60 hover:bg-white/90 border border-white/60 rounded-full transition-colors cursor-pointer shadow-glass-sm"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 bg-white/60 hover:bg-white/90 border border-white/60 rounded-full transition-colors cursor-pointer shadow-glass-sm"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3.5 pr-1">
          {loading && notifications.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-semibold">
              Loading live notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Bell className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-800">No Notifications Yet</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                When you book an appointment, your queue token approaches, or a clinic broadcasts an alert, it will appear here in real time.
              </p>
            </div>
          ) : (
            notifications.map((note) => (
              <div
                key={note.id}
                onClick={() => handleMarkOneRead(note)}
                className={`p-4 rounded-2xl border transition-all space-y-2.5 cursor-pointer ${
                  note.isRead
                    ? 'liquid-glass-subtle border-white/70 hover:bg-white/70'
                    : 'liquid-glass-base border-brand-300/80 bg-brand-50/70 shadow-glass-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 inline-block ${
                        note.isRead ? 'bg-slate-300' : 'bg-brand-600 animate-pulse'
                      }`}
                    />
                    <span>{note.title}</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap font-medium">
                    {new Date(note.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed font-normal">
                  {note.message}
                </p>

                {/* Template Meta Grid */}
                {(note.leftLabel || note.rightLabel || note.trackingCode) && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-[11px]">
                    {note.leftLabel && (
                      <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block font-medium">{note.leftLabel}</span>
                        <span className="font-bold text-slate-800">{note.leftValue || 'General'}</span>
                      </div>
                    )}

                    {note.rightLabel && (
                      <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block font-medium">{note.rightLabel}</span>
                        <span className="font-bold text-brand-700">{note.rightValue || 'Alert'}</span>
                      </div>
                    )}

                    {note.trackingCode && (
                      <div className="col-span-2 bg-brand-50 px-2.5 py-1.5 rounded-lg border border-brand-200 text-brand-900 font-bold">
                        Tracking Code: #{note.trackingCode}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">
            Powered by Dactor Live Real-Time Alert Engine
          </p>
        </div>
      </div>
    </div>
  )
}
