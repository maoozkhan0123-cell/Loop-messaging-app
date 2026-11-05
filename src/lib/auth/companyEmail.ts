// Only company addresses can hold an account. The database enforces the same rule
// (migration 015), so this check is for friendly errors, not the security boundary.
export const COMPANY_EMAIL_DOMAIN = 'bytechsol.com'

export const COMPANY_EMAIL_ERROR = `Only @${COMPANY_EMAIL_DOMAIN} email addresses can join this workspace.`

export function isCompanyEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${COMPANY_EMAIL_DOMAIN}`)
}
