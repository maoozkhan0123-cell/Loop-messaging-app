import { createClient } from '@/lib/supabase/server'

export const CEO_ROLES = new Set(['ceo'])

export async function getAuthorizedCEO() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, status: 401 as const }
  const role = String(user.app_metadata?.role ?? 'member').toLowerCase()
  if (!CEO_ROLES.has(role)) return { user: null, status: 403 as const }
  return { user, status: 200 as const }
}

export function isCEORole(role: unknown) {
  return CEO_ROLES.has(String(role ?? '').toLowerCase())
}
