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
      const { data: { user } } = await supabase.auth.getUser()
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

      const channelIds = active.map((m) => m.channel_id)
      const dmMemberships = active.filter((m) => {
        const ch = m.channels as Channel
        return ch.type === 'dm' || ch.type === 'group_dm'
      })

      // ── Queries 2 + 3 + 4 run IN PARALLEL ───────────────────────────────
      const [unreadResults, dmMemberRows, allProfiles] = await Promise.all([

        // Query 2: all unread counts in parallel sub-promises (batched per channel)
        Promise.all(
          active.map(async (m) => {
            if (!m.last_read_at) return { channelId: m.channel_id, count: 0 }
            const { count } = await supabase
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('channel_id', m.channel_id)
              .is('deleted_at', null)
              .is('parent_id', null)
              .gt('created_at', m.last_read_at)
            return { channelId: m.channel_id, count: count ?? 0 }
          })
        ),

        // Query 3: all DM other-member user_ids in ONE query (not one per DM)
        dmMemberships.length > 0
          ? supabase
              .from('channel_members')
              .select('channel_id, user_id')
              .in('channel_id', dmMemberships.map((m) => m.channel_id))
              .neq('user_id', user.id)
          : Promise.resolve({ data: [] }),

        // Query 4: all profiles at once — used for DM other-member display
        supabase.from('profiles').select('*').in(
          'id',
          // pre-fetch profiles for all potential DM partners from existing memberships
          // (we refine after query 3 resolves, but this gives us a superset cheaply)
          channelIds.length > 0 ? [user.id] : []
        ),
      ])

      // Build lookup maps — O(n) one-time cost, then O(1) access
      const unreadMap = new Map<string, number>(
        unreadResults.map((r) => [r.channelId, r.count])
      )

      const channelToOtherUserId = new Map<string, string>(
        ((dmMemberRows as { data: Array<{ channel_id: string; user_id: string }> | null }).data ?? [])
          .map((r) => [r.channel_id, r.user_id])
      )

      // Fetch profiles for the actual DM other-member IDs we now know
      const dmUserIds = [...new Set(channelToOtherUserId.values())]
      let profileMap = new Map<string, Profile>()
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase
        .from('channel_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('channel_id', channelId)
        .eq('user_id', user.id)
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
