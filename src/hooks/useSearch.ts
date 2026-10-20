'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/types/database'

export type SearchResult = Message & {
  channels: { id: string; name: string | null; type: string } | null
  profiles: { display_name: string; avatar_url?: string | null } | null
}

export function useSearch(query: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      if (!query.trim()) return []

      let { data, error } = await supabase.rpc('search_messages', {
        p_query: query.trim(),
        p_limit: 50,
      })

      // Compatibility fallback while older deployments are awaiting migration 008.
      if (error?.code === 'PGRST202' || error?.code === '42883') {
        const fallback = await supabase
          .from('messages')
          .select('*')
          .is('deleted_at', null)
          .ilike('body', `%${query.trim()}%`)
          .order('created_at', { ascending: false })
          .limit(50)
        data = fallback.data
        error = fallback.error
      }
      if (error) throw new Error(error.message)
      const raw = (data ?? []) as Message[]
      const channelIds = [...new Set(raw.map((m) => m.channel_id))]
      const { data: channelData } = channelIds.length
        ? await supabase.from('channels').select('id, name, type').in('id', channelIds)
        : { data: [] }
      const channels = (channelData ?? []) as Array<{ id: string; name: string | null; type: string }>
      const channelMap = new Map(channels.map((c) => [c.id, c]))
      const msgs = raw.map((m) => ({ ...m, channels: channelMap.get(m.channel_id) }))

      // Fetch profiles separately to avoid FK ambiguity
      const uids = [...new Set(msgs.map((m) => m.user_id).filter(Boolean))] as string[]
      const { data: profiles } = uids.length
        ? await supabase.from('profiles').select('*').in('id', uids)
        : { data: [] }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pm = new Map((profiles ?? []).map((p: any) => [p.id as string, p]))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return msgs.map((m) => ({
        ...m,
        channels: m.channels ?? null,
        profiles: (pm.get(m.user_id ?? '') ?? null) as SearchResult['profiles'],
      })) as SearchResult[]
    },
    enabled: query.length >= 2,
  })
}
