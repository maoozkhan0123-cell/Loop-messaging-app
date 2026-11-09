'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useSignedAttachmentUrl(objectKey: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['attachment-url', objectKey],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('attachments').createSignedUrl(objectKey, 3600)
      if (error) throw new Error(error.message)
      if (!data?.signedUrl) throw new Error('This file is unavailable. Refresh and try again.')
      return data.signedUrl
    },
    enabled: Boolean(objectKey),
    staleTime: 50 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 50 * 60 * 1000,
  })
}
