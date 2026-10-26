'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Channel, ChannelMember, ChannelWithMember, Profile } from '@/types/database'

type MembershipRow = ChannelMember & { channels: unknown }

// ─── useChannels ─────────────────────────────────────────────────────────────
// Before: 1 + N_channels + 2*N_dms sequential queries (up to 21 round trips)
// After:  4 parallel queries total regardless of channel/DM count — O(1) round trips
// ─────────────────────────────────────────────────────────────────────────────
export function useChannels() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return []

      // ── Query 1: memberships + channel data in ONE join ──────────────────
      const { data: memberships, error } = await supabase
        .from('channel_members')
        .select('*, channels(*)')
        .eq('user_id', user.id)

      if (error || !memberships) return []

      const typed = memberships as unknown as MembershipRow[]

      const active = typed.filter((m) => {
        const ch = m.channels as Channel | null
        return ch && !ch.archived_at
      })

      if (active.length === 0) return []

      const dmMemberships = active.filter((m) => {
        const ch = m.channels as Channel
        return ch.type === 'dm' || ch.type === 'group_dm'
      })

      // ── Step 2: Batch DM members and unread messages in parallel (2 queries max) ──
      const channelsWithLastRead = active.filter((m) => m.last_read_at)
      const minLastRead = channelsWithLastRead.length > 0
        ? channelsWithLastRead.reduce((min, m) => (m.last_read_at! < min ? m.last_read_at! : min), channelsWithLastRead[0].last_read_at!)
        : null

      const [unreadRes, dmMemberRes] = await Promise.all([
        // Query 2a: fetch unread messages across ALL channels in ONE query (not N queries)
        minLastRead && channelsWithLastRead.length > 0
          ? supabase
              .from('messages')
              .select('channel_id, created_at')
              .in('channel_id', channelsWithLastRead.map((m) => m.channel_id))
              .is('deleted_at', null)
              .is('parent_id', null)
              .gt('created_at', minLastRead)
          : Promise.resolve({ data: [] }),

        // Query 2b: all DM other-member IDs in ONE query
        dmMemberships.length > 0
          ? supabase
              .from('channel_members')
              .select('channel_id, user_id')
              .in('channel_id', dmMemberships.map((m) => m.channel_id))
              .neq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ])

      // Build unread count map in memory (O(n) in JS, 1ms execution)
      const unreadMap = new Map<string, number>()
      if (unreadRes.data && channelsWithLastRead.length > 0) {
        const lastReadMap = new Map(channelsWithLastRead.map((m) => [m.channel_id, m.last_read_at!]))
        for (const msg of unreadRes.data as Array<{ channel_id: string; created_at: string }>) {
          const lastRead = lastReadMap.get(msg.channel_id)
          if (lastRead && msg.created_at > lastRead) {
            unreadMap.set(msg.channel_id, (unreadMap.get(msg.channel_id) ?? 0) + 1)
          }
        }
      }

      const channelToOtherUserId = new Map<string, string>(
        (dmMemberRes.data as Array<{ channel_id: string; user_id: string }> ?? []).map((r) => [r.channel_id, r.user_id])
      )

      // Fetch profiles for the actual DM other-member IDs
      const dmUserIds = [...new Set(channelToOtherUserId.values())]
      const profileMap = new Map<string, Profile>()
      if (dmUserIds.length > 0) {
        const { data: dmProfiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', dmUserIds)
        for (const p of dmProfiles ?? []) profileMap.set(p.id, p as Profile)
      }

      // ── Assemble results ─────────────────────────────────────────────────
      const channels: ChannelWithMember[] = []

      for (const m of active) {
        const ch = m.channels as unknown as Channel
        const unread_count = unreadMap.get(m.channel_id) ?? 0

        if (ch.type === 'dm' || ch.type === 'group_dm') {
          const otherUserId = channelToOtherUserId.get(m.channel_id)
          const other_member = otherUserId ? profileMap.get(otherUserId) : undefined
          // Skip DMs with no valid other member (deleted accounts etc.)
          if (!other_member?.display_name) continue
          channels.push({ ...ch, channel_members: [m], unread_count, other_member })
        } else {
          channels.push({ ...ch, channel_members: [m], unread_count, other_member: undefined })
        }
      }

      return channels.sort((a, b) => {
        const order: Record<string, number> = { public: 0, private: 1, dm: 2, group_dm: 3 }
        if (a.type !== b.type) return (order[a.type] ?? 9) - (order[b.type] ?? 9)
        const nameA = a.other_member?.display_name ?? a.name ?? ''
        const nameB = b.other_member?.display_name ?? b.name ?? ''
        return nameA.localeCompare(nameB)
      })
    },
    staleTime: 10_000, // 10s — realtime keeps this fresh
    refetchInterval: 60_000, // Fallback poll every 60s (was 30s)
    refetchOnWindowFocus: false,
  })
}

export function useCreateChannel() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, type = 'public', topic }: { name: string; type?: 'public' | 'private'; topic?: string }) => {
      const { data: channelId, error } = await supabase
        .rpc('create_channel', { p_name: name, p_type: type, p_topic: topic ?? null })
      if (error) throw new Error(error.message)
      const { data: channel, error: fetchError } = await supabase
        .from('channels').select('*').eq('id', channelId).single()
      if (fetchError) throw new Error(fetchError.message)
      return channel as Channel
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels'] }),
  })
}

export function useCreateDM() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      // Ensure the auth session is valid before calling the RPC.
      // If the JWT is expired, auth.uid() inside the RPC returns null
      // causing a NOT NULL constraint violation on channel_members.user_id.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        await supabase.auth.refreshSession()
      }
      const { data: channelId, error } = await supabase
        .rpc('create_dm_channel', { target_user_id: targetUserId })
      if (error) throw new Error(error.message)
      return channelId as string
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels'] }),
  })
}

export function useMarkRead() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (channelId: string) => {
      const { error } = await supabase.rpc('mark_channel_read', { p_channel_id: channelId })
      if (error?.code === 'PGRST202' || error?.code === '42883') {
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user
        if (!user) throw new Error('Your session has expired. Please sign in again.')
        const fallback = await supabase
          .from('channel_members')
          .update({ last_read_at: new Date().toISOString() })
          .eq('channel_id', channelId)
          .eq('user_id', user.id)
        if (fallback.error) throw new Error(fallback.error.message)
      } else if (error) {
        throw new Error(error.message)
      }
    },
    onSuccess: (_, channelId) => {
      // Optimistically zero-out the unread count in cache — no full refetch
      queryClient.setQueryData<ChannelWithMember[]>(['channels'], (old) => {
        if (!old) return old
        return old.map((ch) =>
          ch.id === channelId ? { ...ch, unread_count: 0 } : ch
        )
      })
    },
  })
}
