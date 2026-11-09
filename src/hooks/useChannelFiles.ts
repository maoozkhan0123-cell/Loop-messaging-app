'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Attachment } from '@/types/database'

export type ChannelFile = Attachment & {
  sender_id: string | null
  message_created_at: string
  signed_url: string | null
}

export function useChannelFiles(channelId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['channel-files', channelId],
    enabled: Boolean(channelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*, messages!inner(channel_id, user_id, created_at)')
        .eq('messages.channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw new Error(error.message)
      const rows = (data ?? []) as Array<Attachment & { messages?: { user_id: string | null; created_at: string } }>
      const { data: signed, error: signedError } = rows.length
        ? await supabase.storage.from('attachments').createSignedUrls(rows.map((row) => row.object_key), 3600)
        : { data: [], error: null }
      if (signedError) throw new Error(`Secure file links could not be created: ${signedError.message}`)
      const signedUrls = (signed ?? []) as Array<{ error: string | null; path: string | null; signedUrl: string | null }>
      const urlMap = new Map(signedUrls.filter(item => typeof item.signedUrl === 'string' && item.signedUrl).map(item => [item.path, item.signedUrl]))

      return rows.map((row) => ({
        ...row,
        sender_id: row.messages?.user_id ?? null,
        message_created_at: row.messages?.created_at ?? row.created_at,
        signed_url: urlMap.get(row.object_key) ?? null,
        messages: undefined,
      })) as ChannelFile[]
    },
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 45 * 60 * 1000,
  })
}
