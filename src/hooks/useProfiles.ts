'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

export function useAllProfiles() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['profiles', 'all'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return []

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user.id)
        .order('display_name', { ascending: true })

      if (error) throw new Error(error.message)
      return (data ?? []) as Profile[]
    },
    staleTime: 60 * 1000,
  })
}
