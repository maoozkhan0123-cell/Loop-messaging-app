import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isCEORole } from '@/lib/auth/ceo'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  redirect(isCEORole(user.app_metadata?.role) ? '/ceo/dashboard' : '/dashboard')
}
