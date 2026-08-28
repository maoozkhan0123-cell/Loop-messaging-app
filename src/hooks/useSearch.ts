'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/types/database'

export function useSearch(query: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      if (!query.trim()) return []

      const { data, error } = await supabase
        .from('messages')
        .select('*, channels (id, name, type)')
        .ilike('body', `%${query}%`)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw new Error(error.message)
      const msgs = (data ?? []) as (Message & { channels: { id: string; name: string | null; type: string } })[]

      // Fetch profiles separately to avoid FK ambiguity
      const uids = [...new Set(msgs.map((m) => m.user_id).filter(Boolean))] as string[]
      const { data: profiles } = uids.length
        ? await supabase.from('profiles').select('*').in('id', uids)
        : { data: [] }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pm = new Map((profiles ?? []).map((p: any) => [p.id as string, p]))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return msgs.map((m) => ({ ...m, profiles: pm.get(m.user_id ?? '') as any }))
    },
    enabled: query.length >= 2,
  })
}
