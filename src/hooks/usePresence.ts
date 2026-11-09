'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PresenceUser } from '@/types/database'
import { usePreferences } from '@/hooks/usePreferences'
import { resolvePresenceStatus } from '@/lib/presence'

export function usePresence(channelId: string) {
  const supabase = createClient()
  const { preferences: { availability, onlineStatus }, hydrated } = usePreferences()
  const [onlineUsers, setOnlineUsers] = useState<Map<string, PresenceUser>>(new Map())

  useEffect(() => {
    if (!hydrated || !channelId) return
    let cancelled = false
    let channelInstance: ReturnType<typeof supabase.channel> | undefined
    let publishPresence: (() => void) | undefined

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return

      const channel = supabase.channel(`presence:${channelId}`, {
        config: { presence: { key: user.id } },
      })
      channelInstance = channel
      publishPresence = () => {
        if (cancelled) return
        const status = resolvePresenceStatus(availability, onlineStatus, document.hidden)
        const update = status === 'offline'
          ? channel.untrack()
          : channel.track({ user_id: user.id, status, online_at: new Date().toISOString() })
        void update.catch(() => undefined)
      }
      document.addEventListener('visibilitychange', publishPresence)

      channel
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return
          const state = channel.presenceState()
          const map = new Map<string, PresenceUser>()
          for (const [key, presences] of Object.entries(state)) {
            const list = presences as PresenceUser[]
            if (list.length > 0) {
              map.set(key, list[0])
            }
          }
          setOnlineUsers(map)
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') publishPresence?.()
        })
    }

    setup().catch(() => { /* presence setup failure is non-fatal */ })

    return () => {
      cancelled = true
      if (publishPresence) document.removeEventListener('visibilitychange', publishPresence)
      if (channelInstance) {
        supabase.removeChannel(channelInstance)
      }
    }
  }, [channelId, supabase, hydrated, availability, onlineStatus])

  const getUserStatus = useCallback(
    (userId: string): 'online' | 'away' | 'offline' => {
      const presence = onlineUsers.get(userId)
      return presence?.status ?? 'offline'
    },
    [onlineUsers]
  )

  return { onlineUsers, getUserStatus }
}
