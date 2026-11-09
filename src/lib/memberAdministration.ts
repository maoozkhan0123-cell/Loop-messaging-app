import type { User } from '@supabase/supabase-js'
import type { createAdminClient } from '@/lib/supabase/admin'

type MemberAdminClient = ReturnType<typeof createAdminClient>

export async function listWorkspaceUsers(admin: MemberAdminClient): Promise<User[]> {
  const users: User[] = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) return users
  }
}

type MemberAuditEntry = {
  actor_id: string
  target_id: string | null
  action: 'invite' | 'update' | 'suspend' | 'reactivate' | 'password_reset' | 'delete'
  details?: Record<string, unknown>
}

/** An unavailable audit store must not turn an already completed action into a false failure. */
export async function recordMemberAudit(admin: MemberAdminClient, entry: MemberAuditEntry) {
  try {
    const { error } = await admin.from('member_audit_logs').insert(entry)
    if (error) console.warn('Member audit entry could not be recorded.', error.code || 'unknown')
  } catch {
    console.warn('Member audit entry could not be recorded.', 'transport_error')
  }
}
