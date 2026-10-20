'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Attachment } from '@/types/database'

export type MyFile = Attachment & {
  sender_id: string | null
  message_created_at: string
  channel_id: string | null
  channel_name: string | null
  channel_type: string | null
  signed_url: string | null
}

export function useMyFiles() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['my-files'],
    queryFn: async () => {
      // RLS ensures only files in channels the user is a member of are returned
      const { data, error } = await supabase
        .from('attachments')
        .select(`
          *,
          messages!inner(
            channel_id,
            user_id,
            created_at,
            channels(name, type)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(300)

      if (error) throw new Error(error.message)

      const rows = (data ?? []) as Array<Attachment & {
        messages?: { user_id: string | null; created_at: string; channel_id: string; channels?: { name: string | null; type: string } | null }
      }>
      const { data: signed } = rows.length
        ? await supabase.storage.from('attachments').createSignedUrls(rows.map((row) => row.object_key), 3600)
        : { data: [] }
      const urlMap = new Map((signed ?? []).map((item: { path: string; signedUrl: string }) => [item.path, item.signedUrl]))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return rows.map((row) => ({
        ...row,
        sender_id: row.messages?.user_id ?? null,
        message_created_at: row.messages?.created_at ?? row.created_at,
        channel_id: row.messages?.channel_id ?? null,
        channel_name: row.messages?.channels?.name ?? null,
        channel_type: row.messages?.channels?.type ?? null,
        signed_url: urlMap.get(row.object_key) ?? null,
        messages: undefined,
      })) as MyFile[]
    },
    staleTime: 30_000,
  })
}
