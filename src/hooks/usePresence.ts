'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PresenceUser } from '@/types/database'

export function usePresence(channelId: string) {
  const supabase = createClient()
  const [onlineUsers, setOnlineUsers] = useState<Map<string, PresenceUser>>(new Map())

  useEffect(() => {
    let channelInstance: ReturnType<typeof supabase.channel> | undefined

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const channel = supabase.channel(`presence:${channelId}`, {
        config: { presence: { key: user.id } },
      })

      channel
        .on('presence', { event: 'sync' }, () => {
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
        .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              user_id: user.id,
              status: 'online',
              online_at: new Date().toISOString(),
            })
          }
        })

      channelInstance = channel
    }

    setup().catch(() => { /* presence setup failure is non-fatal */ })

    return () => {
      if (channelInstance) {
        supabase.removeChannel(channelInstance)
      }
    }
  }, [channelId, supabase]) // browser client is a stable singleton

  const getUserStatus = useCallback(
    (userId: string): 'online' | 'away' | 'offline' => {
      const presence = onlineUsers.get(userId)
      return presence?.status ?? 'offline'
    },
    [onlineUsers]
  )

  return { onlineUsers, getUserStatus }
}
