import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AppPage() {
  const supabase = await createClient()
  // Middleware already validates the token; reading the cookie session avoids
  // a second Auth API round trip during the same navigation.
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) {
    redirect('/login')
  }

  // Find first channel the user is a member of
  const { data: membership } = await supabase
    .from('channel_members')
    .select('channel_id, channels(type, archived_at)')
    .eq('user_id', user.id)
    .limit(20)

  const first = membership?.find((m) => {
    const ch = m.channels as unknown as { type: string; archived_at: string | null }
    return (ch.type === 'public' || ch.type === 'private') && !ch.archived_at
  })

  if (first) {
    redirect(`/channel/${first.channel_id}`)
  }

  // No channels yet
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-[#EBF0FC] rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">👋</span>
        </div>
        <h2 className="text-lg font-semibold text-[#111827] mb-2">Welcome to Loop</h2>
        <p className="text-sm text-[#6B7280]">
          You aren&apos;t in any channels yet. Create a channel using the sidebar to get started.
        </p>
      </div>
    </div>
  )
}
