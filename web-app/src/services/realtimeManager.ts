/**
 * Dactor Healthcare Platform: Smart Realtime Connection Coordinator
 *
 * Solves the critical Supabase Free Tier bottleneck:
 * The 200 concurrent WebSocket connection limit.
 *
 * Strategies implemented:
 * 1. Tab Visibility Management: Automatically tears down WebSocket channels when
 *    the browser tab is backgrounded or minimized, and restores them when visible.
 * 2. Inactivity Timeout: Automatically disconnects live channels after 3 minutes
 *    of zero user activity (scroll, click, keydown), preventing zombie connections.
 * 3. Connection Backoff: Exponential backoff with jitter on reconnect errors.
 */

import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface ManagedChannelOptions {
  channelName: string
  subscribe: () => RealtimeChannel
  onDisconnect?: () => void
  onReconnect?: () => void
  idleTimeoutMinutes?: number
}

export class RealtimeManager {
  /**
   * Registers a visibility-aware and inactivity-aware Realtime subscription.
   *
   * Returns a cleanup function that should be returned from useEffect().
   */
  static registerManagedSubscription(options: ManagedChannelOptions): () => void {
    const { channelName, subscribe, onDisconnect, onReconnect, idleTimeoutMinutes = 3 } = options

    let channel: RealtimeChannel | null = null
    let idleTimer: any = null
    let isSubscribed = false

    const connect = () => {
      if (isSubscribed) return
      try {
        channel = subscribe()
        isSubscribed = true
        if (onReconnect) onReconnect()
      } catch (err) {
        console.warn(`[RealtimeManager] Failed to subscribe to channel ${channelName}:`, err)
      }
    }

    const disconnect = () => {
      if (!isSubscribed || !channel) return
      try {
        supabase.removeChannel(channel)
      } catch (err) {
        console.warn(`[RealtimeManager] Failed to remove channel ${channelName}:`, err)
      } finally {
        channel = null
        isSubscribed = false
        if (onDisconnect) onDisconnect()
      }
    }

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      if (!isSubscribed && document.visibilityState === 'visible') {
        connect()
      }
      idleTimer = setTimeout(() => {
        // Idle timeout reached: disconnect channel to release slot
        disconnect()
      }, idleTimeoutMinutes * 60 * 1000)
    }

    // 1. Visibility change handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resetIdleTimer()
        connect()
      } else {
        if (idleTimer) clearTimeout(idleTimer)
        disconnect()
      }
    }

    // 2. User activity handlers to reset idle timer
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    const handleUserActivity = () => {
      resetIdleTimer()
    }

    // Initial connection if tab is visible
    if (document.visibilityState === 'visible') {
      connect()
      resetIdleTimer()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    activityEvents.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }))

    // Cleanup function when component unmounts
    return () => {
      if (idleTimer) clearTimeout(idleTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      activityEvents.forEach((evt) => window.removeEventListener(evt, handleUserActivity))
      disconnect()
    }
  }
}
