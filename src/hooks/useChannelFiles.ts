'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Attachment } from '@/types/database'

export type ChannelFile = Attachment & {
  sender_id: string | null
  message_created_at: string
}

export function useChannelFiles(channelId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['channel-files', channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*, messages!inner(channel_id, user_id, created_at)')
        .eq('messages.channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw new Error(error.message)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => ({
        ...row,
        sender_id: row.messages?.user_id ?? null,
        message_created_at: row.messages?.created_at ?? row.created_at,
        messages: undefined,
      })) as ChannelFile[]
    },
    staleTime: 30_000,
  })
}
