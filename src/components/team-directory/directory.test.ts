import { describe, expect, it } from 'vitest'
import { filterDirectoryMembers, memberRole, normalizeSearch, sortDirectoryMembers, type DirectoryMember } from './directory'

const members: DirectoryMember[] = [
  { id: '1', display_name: 'Sarah Johnson', email: 'sarah@company.com', avatar_url: null, job_title: 'Software Engineer', status: 'online', created_at: '', department: 'Engineering' },
  { id: '2', display_name: 'Michael Chen', email: 'michael@company.com', avatar_url: null, job_title: 'Product Designer', status: 'away', created_at: '', department: 'Design' },
  { id: '3', display_name: 'Emily Roberts', email: 'emily@company.com', avatar_url: null, job_title: 'Chief Executive Officer and Company Strategy Lead', status: 'offline', created_at: '' },
]

describe('team directory helpers', () => {
  it('normalizes case and repeated whitespace', () => expect(normalizeSearch('  SARAH   Johnson ')).toBe('sarah johnson'))
  it('searches name, email, role, and department', () => {
    expect(filterDirectoryMembers(members, 'sarah', 'all', 'all')).toEqual([members[0]])
    expect(filterDirectoryMembers(members, '@company.com', 'all', 'all')).toHaveLength(3)
    expect(filterDirectoryMembers(members, 'designer', 'all', 'all')).toEqual([members[1]])
    expect(filterDirectoryMembers(members, 'engineering', 'all', 'all')).toEqual([members[0]])
  })
  it('filters by real presence and exact role', () => {
    expect(filterDirectoryMembers(members, '', 'online', 'all')).toEqual([members[0]])
    expect(filterDirectoryMembers(members, '', 'all', 'Product Designer')).toEqual([members[1]])
  })
  it('preserves long role labels and supplies a fallback', () => {
    expect(memberRole(members[2])).toBe('Chief Executive Officer and Company Strategy Lead')
    expect(memberRole({ ...members[0], job_title: null })).toBe('Teammate')
  })
  it('sorts by status and role in either direction', () => {
    expect(sortDirectoryMembers(members, 'status', true).map((member) => member.status)).toEqual(['online', 'away', 'offline'])
    expect(sortDirectoryMembers(members, 'role', false)[0].job_title).toBe('Software Engineer')
  })
})
