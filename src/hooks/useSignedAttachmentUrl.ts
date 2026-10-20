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
      return data.signedUrl
    },
    enabled: Boolean(objectKey),
    staleTime: 50 * 60 * 1000,
  })
}
