import type { Profile } from '@/types/database'

export type DirectoryView = 'grid' | 'table'
export type DirectoryStatus = 'all' | Profile['status']
export type DirectorySort = 'name' | 'role' | 'status'

export type DirectoryMember = Profile & {
  workspaceRole?: 'member' | 'admin' | 'ceo'
  suspended?: boolean
  canManage?: boolean
}

export function normalizeSearch(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function memberRole(member: DirectoryMember) {
  return member.job_title?.trim() || 'Teammate'
}

export function filterDirectoryMembers(
  members: DirectoryMember[],
  search: string,
  status: DirectoryStatus,
  role: string,
) {
  const query = normalizeSearch(search)
  return members.filter((member) => {
    if (status !== 'all' && member.status !== status) return false
    if (role !== 'all' && memberRole(member) !== role) return false
    if (!query) return true
    return normalizeSearch([
      member.display_name,
      member.email,
      memberRole(member),
      member.department ?? '',
    ].join(' ')).includes(query)
  })
}

const statusOrder: Record<Profile['status'], number> = { online: 0, away: 1, offline: 2 }

export function sortDirectoryMembers(members: DirectoryMember[], sort: DirectorySort, ascending: boolean) {
  const direction = ascending ? 1 : -1
  return [...members].sort((left, right) => {
    if (sort === 'status') return (statusOrder[left.status] - statusOrder[right.status]) * direction
    const a = sort === 'role' ? memberRole(left) : left.display_name
    const b = sort === 'role' ? memberRole(right) : right.display_name
    return a.localeCompare(b, undefined, { sensitivity: 'base' }) * direction
  })
}
