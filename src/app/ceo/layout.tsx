import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isCEORole } from '@/lib/auth/ceo'
import { CEOShell } from '@/components/ceo/CEOShell'

export default async function CEOLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!isCEORole(user.app_metadata?.role)) redirect('/dashboard?access=denied')
  return <CEOShell name="Maooz KK">{children}</CEOShell>
}
