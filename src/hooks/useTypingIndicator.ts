'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TypingState {
  user_id: string
  display_name: string
  typing: boolean
}

export function useTypingIndicator(channelId: string) {
  const supabase = createClient()
  const [typingUsers, setTypingUsers] = useState<TypingState[]>([])
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const currentUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      currentUserIdRef.current = user.id

      const ch = supabase.channel(`typing:${channelId}`)
      channelRef.current = ch

      ch.on('broadcast', { event: 'typing' }, ({ payload }: { payload: TypingState }) => {
        if (payload.user_id === user.id) return

        setTypingUsers((prev) => {
          const filtered = prev.filter((u) => u.user_id !== payload.user_id)
          if (payload.typing) {
            return [...filtered, payload]
          }
          return filtered
        })

        // Auto-clear after 4 seconds
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.user_id !== payload.user_id))
        }, 4000)
      })

      ch.subscribe()
    }

    setup()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [channelId, supabase])

  const sendTyping = useCallback(
    async (displayName: string) => {
      if (!channelRef.current || !currentUserIdRef.current) return

      // Send typing = true
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user_id: currentUserIdRef.current,
          display_name: displayName,
          typing: true,
        },
      })

      // Clear previous timer
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)

      // After 3s of no keystrokes, send typing = false
      typingTimerRef.current = setTimeout(() => {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            user_id: currentUserIdRef.current!,
            display_name: displayName,
            typing: false,
          },
        })
      }, 3000)
    },
    []
  )

  return { typingUsers, sendTyping }
}
