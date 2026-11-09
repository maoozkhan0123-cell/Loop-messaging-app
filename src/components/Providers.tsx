'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useState } from 'react'
import { PreferencesProvider } from '@/contexts/PreferencesProvider'
import { createClient } from '@/lib/supabase/client'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Reuse fresh data, and catch up on changes missed while a page was closed.
            staleTime: 60 * 1000,
            gcTime: 10 * 60 * 1000, // keep data in cache for 10 min
            refetchOnWindowFocus: true,
            refetchOnMount: true,
            retry: 1,
          },
        },
      })
  )

  useEffect(() => {
    let previousUserId: string | null | undefined
    const { data } = createClient().auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      const userId = session?.user.id ?? null
      if (event === 'SIGNED_OUT' || (previousUserId !== undefined && previousUserId !== userId)) {
        queryClient.clear()
      }
      previousUserId = userId
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  return (
    <PreferencesProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </PreferencesProvider>
  )
}
