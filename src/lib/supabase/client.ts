import { createBrowserClient } from '@supabase/ssr'

// Singleton — one client per browser tab. Prevents `useEffect` dependency
// thrash when hooks call createClient() on every render (supabase would be a
// new object reference each time, causing subscriptions to be recreated).
let _client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}
