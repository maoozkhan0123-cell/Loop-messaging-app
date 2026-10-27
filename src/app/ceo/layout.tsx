import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isCEORole } from '@/lib/auth/ceo'
import { CEOShell } from '@/components/ceo/CEOShell'

export default async function CEOLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!isCEORole(user.app_metadata?.role)) redirect('/dashboard?access=denied')
  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
  return <CEOShell name={profile?.display_name ?? user.email ?? 'CEO'}>{children}</CEOShell>
}
