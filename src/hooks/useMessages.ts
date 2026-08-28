'use client'

import { useInfiniteQuery, useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useRef } from 'react'
import type { Message, Reaction, Attachment, Profile } from '@/types/database'


const PAGE_SIZE = 50

// ─── Cache helpers ────────────────────────────────────────────────────────────
// All of these update the TanStack Query cache IN MEMORY — zero network round-trip.
// This is the WhatsApp/Slack approach: treat local cache as source of truth,
// apply surgical diffs, never re-fetch unless something is truly unknown.

type MsgCache = InfiniteData<Message[]>

export function patchCache(
  qc: ReturnType<typeof useQueryClient>,
  key: unknown[],
  fn: (pages: Message[][]) => Message[][]
) {
  qc.setQueryData<MsgCache>(key, (old) => {
    if (!old) return old
    const newPages = fn(old.pages)
    return { ...old, pages: newPages }
  })
}

// O(n) append — never re-fetches all pages
export function appendMessage(qc: ReturnType<typeof useQueryClient>, channelId: string, parentId: string | null, msg: Message) {
  const key = ['messages', channelId, parentId]
  patchCache(qc, key, (pages) => {
    const allIds = new Set(pages.flatMap((p) => p.map((m) => m.id)))
    if (allIds.has(msg.id)) return pages // dedup
    const next = [...pages]
    next[next.length - 1] = [...(next[next.length - 1] ?? []), msg]
    return next
  })
}

// O(n) update — called on edit/delete
function updateMessage(qc: ReturnType<typeof useQueryClient>, channelId: string, parentId: string | null, updatedMsg: Message) {
  const key = ['messages', channelId, parentId]
  patchCache(qc, key, (pages) =>
    pages.map((page) =>
      page.map((m) => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
    )
  )
}

// O(n) reaction toggle — no DB call needed, realtime payload has the full row
function applyReaction(
  qc: ReturnType<typeof useQueryClient>,
  channelId: string,
  reaction: { message_id: string; user_id: string; emoji: string },
  eventType: string
) {
  for (const parentId of [null, undefined]) {
    const key = ['messages', channelId, parentId ?? null]
    patchCache(qc, key, (pages) =>
      pages.map((page) =>
        page.map((m) => {
          if (m.id !== reaction.message_id) return m
          const reactions = m.reactions ?? []
          if (eventType === 'DELETE') {
            return { ...m, reactions: reactions.filter((r) => !(r.user_id === reaction.user_id && r.emoji === reaction.emoji)) }
          }
          // INSERT — avoid duplicates
          const already = reactions.some((r) => r.user_id === reaction.user_id && r.emoji === reaction.emoji)
          if (already) return m
          return { ...m, reactions: [...reactions, reaction as Reaction] }
        })
      )
    )
  }
}

// O(n) attachment append — called when uploader inserts attachment record
function appendAttachment(
  qc: ReturnType<typeof useQueryClient>,
  channelId: string,
  attachment: { message_id: string; id: string; [key: string]: unknown }
) {
  const key = ['messages', channelId, null]
  patchCache(qc, key, (pages) =>
    pages.map((page) =>
      page.map((m) => {
        if (m.id !== attachment.message_id) return m
        const atts = m.attachments ?? []
        if (atts.some((a) => a.id === attachment.id)) return m
        return { ...m, attachments: [...atts, attachment as Attachment] }
      })
    )
  )
}

// Profile mini-cache: shared across hooks — O(1) lookup, never re-fetches same profile
export const profileCache = new Map<string, Profile>()

export async function fetchProfile(supabase: ReturnType<typeof createClient>, userId: string): Promise<Profile | undefined> {
  if (profileCache.has(userId)) return profileCache.get(userId)!
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (data) profileCache.set(userId, data as Profile)
  return (data as Profile) ?? undefined
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useMessages(channelId: string, parentId?: string, currentUserId?: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const queryClientRef = useRef(queryClient)
  queryClientRef.current = queryClient
  const currentUserIdRef = useRef(currentUserId)
  currentUserIdRef.current = currentUserId

  const query = useInfiniteQuery({
    queryKey: ['messages', channelId, parentId ?? null],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      let q = supabase
        .from('messages')
        .select('*, reactions(*), attachments(*)')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (parentId) q = q.eq('parent_id', parentId)
      else q = q.is('parent_id', null)
      if (pageParam) q = q.lt('created_at', pageParam)

      const { data, error } = await q
      if (error) throw new Error(error.message)
      const rawMessages = (data ?? []) as Message[]

      // Batch profile fetch — one query for all unique user IDs (O(1) vs O(n))
      const userIds = [...new Set(rawMessages.map((m) => m.user_id).filter(Boolean))] as string[]
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)
        for (const p of profiles ?? []) profileCache.set(p.id, p as Profile)
      }

      const messages = rawMessages
        .map((m) => ({ ...m, profiles: profileCache.get(m.user_id ?? '') ?? undefined }))
        .reverse()

      // Batch reply counts — one query for all root messages (O(1) vs O(n))
      if (!parentId && messages.length > 0) {
        const ids = messages.map((m) => m.id)
        const { data: replies } = await supabase
          .from('messages').select('parent_id').in('parent_id', ids).is('deleted_at', null)
        const countMap = new Map<string, number>()
        for (const r of replies ?? []) {
          if (r.parent_id) countMap.set(r.parent_id, (countMap.get(r.parent_id) ?? 0) + 1)
        }
        return messages.map((msg) => ({ ...msg, reply_count: countMap.get(msg.id) ?? 0 }))
      }

      return messages
    },
    initialPageParam: null as string | null,
    getNextPageParam: (firstPage) => {
      if (firstPage.length < PAGE_SIZE) return undefined
      return firstPage[0]?.created_at ?? undefined
    },
    staleTime: Infinity, // Cache is authoritative — realtime keeps it fresh
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    const qc = queryClientRef.current

    const channel = supabase
      .channel(`messages:${channelId}:${parentId ?? 'root'}`)
      .on(
        // INSERT is handled by useGlobalNotifications (proven reliable).
        // This subscription only needs to handle edits and soft-deletes (UPDATE).
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload: Record<string, unknown>) => {
          const row = payload.new as Message | undefined
          if (!row) return
          const pid = row.parent_id ?? null
          updateMessage(qc, channelId, pid, row)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions' },
        (payload: Record<string, unknown>) => {
          const eventType = payload.eventType as string
          const row = (payload.new ?? payload.old) as { message_id: string; user_id: string; emoji: string } | undefined
          if (!row) return
          applyReaction(qc, channelId, row, eventType)
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attachments' },
        (payload: Record<string, unknown>) => {
          const att = payload.new as { message_id: string; id: string; [key: string]: unknown } | undefined
          if (att) appendAttachment(qc, channelId, att)
        }
      )
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR') setTimeout(() => channel.subscribe(), 2000)
      })

    return () => { supabase.removeChannel(channel) }
  }, [channelId, parentId]) // eslint-disable-line react-hooks/exhaustive-deps

  return query
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useSendMessage() {
  const supabase = createClient()
  // No queryClient invalidation here — realtime subscription handles cache update
  return useMutation({
    mutationFn: async ({ channelId, body, parentId }: { channelId: string; body: string; parentId?: string }) => {
      const { data: messageId, error } = await supabase.rpc('send_message', {
        p_channel_id: channelId,
        p_body: body || null,
        p_parent_id: parentId ?? null,
      })
      if (error) throw new Error(error.message)
      return messageId as string
    },
    onError: () => { /* surfaces via mutation.error */ },
  })
}

export function useEditMessage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string; channelId: string }) => {
      const { error } = await supabase.rpc('edit_message', { p_message_id: messageId, p_body: body })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_, vars) => {
      // Optimistic: update body in cache immediately
      const qc = queryClient
      patchCache(qc, ['messages', vars.channelId, null], (pages) =>
        pages.map((page) =>
          page.map((m) => m.id === vars.messageId ? { ...m, body: vars.body, edited_at: new Date().toISOString() } : m)
        )
      )
    },
  })
}

export function useDeleteMessage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId }: { messageId: string; channelId: string }) => {
      const { error } = await supabase.rpc('delete_message', { p_message_id: messageId })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_, vars) => {
      // Optimistic: mark deleted in cache immediately
      patchCache(queryClient, ['messages', vars.channelId, null], (pages) =>
        pages.map((page) =>
          page.map((m) => m.id === vars.messageId ? { ...m, deleted_at: new Date().toISOString() } : m)
        )
      )
    },
  })
}
