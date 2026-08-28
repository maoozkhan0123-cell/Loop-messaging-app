'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getNotificationPref } from '@/lib/notifications'
import { appendMessage, patchCache, profileCache, fetchProfile } from '@/hooks/useMessages'
import type { Message } from '@/types/database'

/**
 * Single global realtime subscription owned by AppShell.
 *
 * Uses channel_id=in.(...) filter — proven reliable, confirmed by notifications
 * firing correctly. The per-channel subscription in useMessages only handles
 * UPDATE (edit/soft-delete), reactions, and attachments.
 *
 * Responsibilities:
 *  1. Append incoming messages to the correct TanStack Query cache key instantly
 *  2. Patch profile once fetched (async, non-blocking)
 *  3. Invalidate channels query to refresh unread badges
 *  4. Fire desktop notification when appropriate
 */
export function useGlobalNotifications(
  currentUserId: string | undefined,
  channelIds: string[]
) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const currentUserIdRef = useRef(currentUserId)
  currentUserIdRef.current = currentUserId

  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const channelIdsKey = channelIds.slice().sort().join(',')

  useEffect(() => {
    if (!currentUserId || channelIds.length === 0) return

    const filter = `channel_id=in.(${channelIds.join(',')})`
    const qc = queryClient

    const sub = supabase
      .channel(`global-notif:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter },
        async (payload: Record<string, unknown>) => {
          const row = payload.new as Message | undefined
          if (!row?.id || !row.channel_id) return

          const isOwnMessage = row.user_id === currentUserIdRef.current

          // ── 1. Update message cache immediately ────────────────────────────
          // Only update cache for others' messages — own messages are optimistically
          // inserted by MessageInput immediately after the send_message RPC returns.
          if (!isOwnMessage) {
            const pid = row.parent_id ?? null
            const cachedProfile = row.user_id ? profileCache.get(row.user_id) : undefined
            const fullMsg: Message = {
              ...row,
              profiles: cachedProfile,
              reactions: [],
              attachments: [],
              reply_count: 0,
            }

            appendMessage(qc, row.channel_id, pid, fullMsg)
            if (pid) appendMessage(qc, row.channel_id, null, fullMsg) // bump root thread list

            // Patch profile in asynchronously if it wasn't in cache yet
            if (row.user_id && !cachedProfile) {
              fetchProfile(supabase, row.user_id).then((profile) => {
                if (!profile) return
                patchCache(qc, ['messages', row.channel_id, pid], (pages) =>
                  pages.map((page) =>
                    page.map((m) => m.id === row.id ? { ...m, profiles: profile } : m)
                  )
                )
                if (pid) {
                  patchCache(qc, ['messages', row.channel_id, null], (pages) =>
                    pages.map((page) =>
                      page.map((m) => m.id === row.id ? { ...m, profiles: profile } : m)
                    )
                  )
                }
              })
            }
          }

          // ── 2. Refresh unread badges in sidebar ────────────────────────────
          if (!isOwnMessage) {
            qc.invalidateQueries({ queryKey: ['channels'] })
          }

          // ── 3. Desktop notification ────────────────────────────────────────
          if (isOwnMessage) return
          if (!getNotificationPref()) return
          if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

          // Suppress only when the user is actively viewing this exact channel
          const activeId = pathnameRef.current?.match(/\/(channel|dm)\/([^/]+)/)?.[2]
          if (row.channel_id === activeId && document.hasFocus()) return

          // Get display name — use in-memory cache first
          let displayName = row.user_id ? profileCache.get(row.user_id)?.display_name : undefined
          if (!displayName && row.user_id) {
            const profile = await fetchProfile(supabase, row.user_id)
            displayName = profile?.display_name
          }

          const n = new Notification(`New message from ${displayName ?? 'Someone'}`, {
            body: row.body?.slice(0, 120) ?? 'Sent an attachment',
            icon: '/loop-logo.svg',
          })
          n.onclick = () => { window.focus(); n.close() }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [currentUserId, channelIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps
}
