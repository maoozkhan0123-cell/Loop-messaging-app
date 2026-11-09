export const PRIMARY_ADMIN_EMAIL = 'loop@bytechsol.com'

export function isWorkspaceAdmin(role: unknown, email?: string | null) {
  const normalizedRole = String(role ?? '').trim().toLowerCase()
  return normalizedRole === 'admin' || normalizedRole === 'ceo' || email?.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL
}

/** Workspace access and channel membership use different role enums. */
export function channelRoleForWorkspaceRole(role: string): 'admin' | 'member' {
  return role === 'admin' || role === 'ceo' ? 'admin' : 'member'
}
