'use client'

import { useEffect, useMemo, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowDownAZ, ArrowUpAZ, Copy, Grid2X2, List, Loader2, Mail, MessageSquare,
  MoreHorizontal, RefreshCw, Search, Settings2, UserPlus, Users, X,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import {
  filterDirectoryMembers, memberRole, sortDirectoryMembers,
  type DirectoryMember, type DirectorySort, type DirectoryStatus, type DirectoryView,
} from './directory'

const VIEW_KEY = 'bysync:team-directory-view'

type Props = {
  members: DirectoryMember[]
  loading: boolean
  error?: string | null
  canInvite: boolean
  messagingMemberId?: string | null
  onRetry: () => void
  onInvite: () => void
  onView: (member: DirectoryMember) => void
  onMessage: (member: DirectoryMember) => void
  onManage: (member: DirectoryMember) => void
  onCopyEmail: (member: DirectoryMember) => void
}

export function TeamDirectory({ members, loading, error, canInvite, messagingMemberId, onRetry, onInvite, onView, onMessage, onManage, onCopyEmail }: Props) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<DirectoryStatus>('all')
  const [role, setRole] = useState('all')
  const [view, setView] = useState<DirectoryView>('grid')
  const [sort, setSort] = useState<DirectorySort>('name')
  const [ascending, setAscending] = useState(true)

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY)
    if (saved === 'grid' || saved === 'table') setView(saved)
  }, [])

  const changeView = (next: DirectoryView) => {
    setView(next)
    window.localStorage.setItem(VIEW_KEY, next)
  }

  const roles = useMemo(() => Array.from(new Set(members.map(memberRole))).sort(), [members])
  const filtered = useMemo(
    () => sortDirectoryMembers(filterDirectoryMembers(members, search, status, role), sort, ascending),
    [ascending, members, role, search, sort, status],
  )
  const active = filtered.filter((member) => member.status === 'online')
  const others = filtered.filter((member) => member.status !== 'online')
  const hasFilters = Boolean(search.trim()) || status !== 'all' || role !== 'all'
  const clearFilters = () => { setSearch(''); setStatus('all'); setRole('all') }

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--app-bg)] text-[var(--foreground)]">
      <header className="shrink-0 border-b border-[var(--ui-border)] bg-[var(--surface)] px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight sm:text-[22px]">Team Directory</h1>
                <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--primary)]">{members.length} {members.length === 1 ? 'member' : 'members'}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Find teammates, view profiles, and start conversations.</p>
            </div>
            {canInvite && <button type="button" onClick={onInvite} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[var(--primary)] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--primary-hover)]"><UserPlus size={15} /><span className="hidden sm:inline">Invite member</span></button>}
          </div>

          <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1 lg:max-w-xl">
              <span className="sr-only">Search team members</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, role, or department" className="h-9 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] pl-9 pr-9 text-xs outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]" />
              {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]"><X size={13} /></button>}
            </label>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <FilterSelect label="Status" value={status} onChange={(value) => setStatus(value as DirectoryStatus)} options={[['all', 'All statuses'], ['online', 'Online'], ['away', 'Away'], ['offline', 'Offline']]} />
              <FilterSelect label="Role" value={role} onChange={setRole} options={[['all', 'All roles'], ...roles.map((item) => [item, item] as [string, string])]} />
              <div className="inline-flex h-9 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] p-0.5" aria-label="Directory view">
                <ViewButton active={view === 'grid'} label="Grid view" onClick={() => changeView('grid')}><Grid2X2 size={14} /></ViewButton>
                <ViewButton active={view === 'table'} label="List view" onClick={() => changeView('table')}><List size={15} /></ViewButton>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-[1600px]">
          {loading ? <DirectorySkeleton /> : error ? <ErrorState message={error} onRetry={onRetry} /> : members.length === 0 ? <EmptyState canInvite={canInvite} onInvite={onInvite} /> : filtered.length === 0 ? <NoResults onClear={clearFilters} /> : view === 'table' ? (
            <MemberTable members={filtered} sort={sort} ascending={ascending} messagingMemberId={messagingMemberId} onSort={(next) => { if (sort === next) setAscending((value) => !value); else { setSort(next); setAscending(true) } }} onView={onView} onMessage={onMessage} onManage={onManage} onCopyEmail={onCopyEmail} />
          ) : (
            <div className="space-y-7">
              {active.length > 0 && <DirectoryGroup title="Active now" count={active.length} tone="online"><MemberGrid members={active} messagingMemberId={messagingMemberId} onView={onView} onMessage={onMessage} onManage={onManage} onCopyEmail={onCopyEmail} /></DirectoryGroup>}
              {others.length > 0 && <DirectoryGroup title="Offline / others" count={others.length} tone="offline"><MemberGrid members={others} messagingMemberId={messagingMemberId} onView={onView} onMessage={onMessage} onManage={onManage} onCopyEmail={onCopyEmail} /></DirectoryGroup>}
            </div>
          )}
          {!loading && !error && filtered.length > 0 && <p className="sr-only" aria-live="polite">Showing {filtered.length} team members{hasFilters ? ' matching your filters' : ''}.</p>}
        </div>
      </main>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="min-w-0"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 max-w-[155px] rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] px-2.5 text-xs font-medium outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]">{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</select></label>
}

function ViewButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} className={cn('grid h-8 w-8 place-items-center rounded-md transition-colors', active ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]')}>{children}</button>
}

function DirectoryGroup({ title, count, tone, children }: { title: string; count: number; tone: 'online' | 'offline'; children: React.ReactNode }) {
  return <section aria-labelledby={`directory-${tone}`}><div className="mb-3 flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', tone === 'online' ? 'bg-emerald-500' : 'bg-slate-400')} /><h2 id={`directory-${tone}`} className="text-[11px] font-semibold uppercase tracking-[.09em] text-[var(--muted-foreground)]">{title}</h2><span className="text-[11px] font-medium text-[var(--muted-foreground)]">{count}</span><div className="h-px flex-1 bg-[var(--ui-border)]" /></div>{children}</section>
}

function MemberGrid({ members, ...actions }: { members: DirectoryMember[] } & MemberActionsProps) {
  return <div className="grid grid-cols-1 gap-3 min-[580px]:grid-cols-2 min-[980px]:grid-cols-3 min-[1320px]:grid-cols-4">{members.map((member) => <MemberCard key={member.id} member={member} {...actions} />)}</div>
}

type MemberActionsProps = {
  messagingMemberId?: string | null
  onView: (member: DirectoryMember) => void
  onMessage: (member: DirectoryMember) => void
  onManage: (member: DirectoryMember) => void
  onCopyEmail: (member: DirectoryMember) => void
}

export function MemberCard({ member, messagingMemberId, onView, onMessage, onManage, onCopyEmail }: { member: DirectoryMember } & MemberActionsProps) {
  return <article className="group relative flex min-h-[104px] items-start gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-200 hover:border-[color-mix(in_srgb,var(--primary)_38%,var(--ui-border))] hover:shadow-[var(--shadow-md)]">
    <button type="button" aria-label={`View ${member.display_name}'s profile`} onClick={() => onView(member)} className="absolute inset-0 rounded-xl" />
    <MemberAvatar member={member} />
    <div className="relative min-w-0 flex-1 pointer-events-none">
      <h3 className="truncate pr-7 text-sm font-semibold leading-5" title={member.display_name}>{member.display_name}</h3>
      <RoleBadge member={member} />
      <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]" title={member.email}>{member.email}</p>
      <button type="button" onClick={(event) => { event.stopPropagation(); onMessage(member) }} disabled={messagingMemberId === member.id || member.suspended} className="pointer-events-auto mt-2 hidden h-7 items-center gap-1.5 rounded-md bg-[var(--primary-soft)] px-2.5 text-[11px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 group-hover:inline-flex group-focus-within:inline-flex sm:inline-flex md:hidden md:group-hover:inline-flex md:group-focus-within:inline-flex">
        {messagingMemberId === member.id ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}Message
      </button>
    </div>
    <div className="relative -mr-1 -mt-1"><MemberActions member={member} busy={messagingMemberId === member.id} onView={onView} onMessage={onMessage} onManage={onManage} onCopyEmail={onCopyEmail} /></div>
  </article>
}

function MemberAvatar({ member, size = 42 }: { member: DirectoryMember; size?: number }) {
  const color = member.status === 'online' ? 'bg-emerald-500' : member.status === 'away' ? 'bg-amber-500' : 'bg-slate-400'
  return <div className="relative shrink-0"><Avatar src={member.avatar_url} name={member.display_name} size={size} /><span aria-hidden className={cn('absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-[var(--surface)]', color)} /><span className="sr-only">{member.status}</span></div>
}

function RoleBadge({ member }: { member: DirectoryMember }) {
  const role = memberRole(member)
  return <span title={role} className={cn('mt-0.5 inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-medium', member.suspended ? 'bg-red-50 text-red-700' : 'bg-[var(--surface-muted)] text-[var(--muted-foreground)]')}><span className="truncate">{member.suspended ? 'Suspended · ' : ''}{role}</span></span>
}

function MemberActions({ member, busy, onView, onMessage, onManage, onCopyEmail }: { member: DirectoryMember; busy: boolean } & Omit<MemberActionsProps, 'messagingMemberId'>) {
  return <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" aria-label={`Actions for ${member.display_name}`} className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]" onClick={(event) => event.stopPropagation()}><MoreHorizontal size={16} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="z-[110] min-w-48 rounded-lg border border-[var(--ui-border)] bg-[var(--surface-raised)] p-1 shadow-[var(--shadow-md)]">
    <MenuItem icon={<Users size={14} />} onSelect={() => onView(member)}>View profile</MenuItem>
    <MenuItem icon={busy ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />} disabled={busy || member.suspended} onSelect={() => onMessage(member)}>Send message</MenuItem>
    <MenuItem icon={<Copy size={14} />} onSelect={() => onCopyEmail(member)}>Copy email</MenuItem>
    {member.canManage && <><DropdownMenu.Separator className="my-1 h-px bg-[var(--ui-border)]" /><MenuItem icon={<Settings2 size={14} />} onSelect={() => onManage(member)}>Manage permissions</MenuItem></>}
  </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
}

function MenuItem({ icon, children, onSelect, disabled }: { icon: React.ReactNode; children: React.ReactNode; onSelect: () => void; disabled?: boolean }) {
  return <DropdownMenu.Item disabled={disabled} onSelect={onSelect} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-xs outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--surface-muted)]">{icon}{children}</DropdownMenu.Item>
}

function MemberTable({ members, sort, ascending, onSort, ...actions }: { members: DirectoryMember[]; sort: DirectorySort; ascending: boolean; onSort: (sort: DirectorySort) => void } & MemberActionsProps) {
  return <div className="overflow-x-auto rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]"><table className="w-full min-w-[720px] border-collapse"><thead className="sticky top-0 z-10 bg-[var(--surface-muted)]"><tr><SortHeader label="Name" field="name" sort={sort} ascending={ascending} onSort={onSort} /><SortHeader label="Role" field="role" sort={sort} ascending={ascending} onSort={onSort} /><th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Email</th><SortHeader label="Status" field="status" sort={sort} ascending={ascending} onSort={onSort} /><th className="w-14"><span className="sr-only">Actions</span></th></tr></thead><tbody>{members.map((member) => <tr key={member.id} className="h-14 border-t border-[var(--ui-border)] transition-colors hover:bg-[var(--surface-muted)]"><td className="px-4"><button type="button" onClick={() => actions.onView(member)} className="flex max-w-[250px] items-center gap-3 text-left"><MemberAvatar member={member} size={34} /><span className="truncate text-xs font-semibold">{member.display_name}</span></button></td><td className="max-w-[220px] px-4"><RoleBadge member={member} /></td><td className="max-w-[260px] truncate px-4 text-xs text-[var(--muted-foreground)]" title={member.email}>{member.email}</td><td className="px-4"><MemberStatus member={member} /></td><td className="px-3"><MemberActions member={member} busy={actions.messagingMemberId === member.id} onView={actions.onView} onMessage={actions.onMessage} onManage={actions.onManage} onCopyEmail={actions.onCopyEmail} /></td></tr>)}</tbody></table></div>
}

function SortHeader({ label, field, sort, ascending, onSort }: { label: string; field: DirectorySort; sort: DirectorySort; ascending: boolean; onSort: (field: DirectorySort) => void }) {
  return <th className="px-4 py-2.5 text-left"><button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] hover:text-[var(--foreground)]">{label}{sort === field && (ascending ? <ArrowDownAZ size={13} /> : <ArrowUpAZ size={13} />)}</button></th>
}

function MemberStatus({ member }: { member: DirectoryMember }) {
  const color = member.status === 'online' ? 'bg-emerald-500' : member.status === 'away' ? 'bg-amber-500' : 'bg-slate-400'
  return <span className="inline-flex items-center gap-1.5 text-xs capitalize text-[var(--muted-foreground)]"><span className={cn('h-2 w-2 rounded-full', color)} />{member.status}</span>
}

function DirectorySkeleton() {
  return <div aria-label="Loading team directory"><div className="mb-3 h-3 w-28 animate-pulse rounded bg-[var(--surface-muted)]" /><div className="grid grid-cols-1 gap-3 min-[580px]:grid-cols-2 min-[980px]:grid-cols-3 min-[1320px]:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="flex min-h-[104px] gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] p-3.5"><div className="h-11 w-11 animate-pulse rounded-full bg-[var(--surface-muted)]" /><div className="flex-1 space-y-2"><div className="h-3.5 w-2/3 animate-pulse rounded bg-[var(--surface-muted)]" /><div className="h-5 w-1/2 animate-pulse rounded-full bg-[var(--surface-muted)]" /><div className="h-3 w-4/5 animate-pulse rounded bg-[var(--surface-muted)]" /></div></div>)}</div></div>
}

function EmptyState({ canInvite, onInvite }: { canInvite: boolean; onInvite: () => void }) { return <StateShell icon={<Users size={22} />} title="Your team directory is empty" description="Invite teammates to start collaborating in BySync.">{canInvite && <button type="button" onClick={onInvite} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--primary)] px-3.5 text-xs font-semibold text-white"><UserPlus size={14} />Invite first member</button>}</StateShell> }
function NoResults({ onClear }: { onClear: () => void }) { return <StateShell icon={<Search size={22} />} title="No matching members" description="Try a different search term or clear the active filters."><button type="button" onClick={onClear} className="mt-4 h-9 rounded-lg border border-[var(--ui-border)] px-3.5 text-xs font-semibold hover:bg-[var(--surface-muted)]">Clear filters</button></StateShell> }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <StateShell icon={<RefreshCw size={22} />} title="Couldn’t load the directory" description={message}><button type="button" onClick={onRetry} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--primary)] px-3.5 text-xs font-semibold text-white"><RefreshCw size={14} />Retry</button></StateShell> }
function StateShell({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children?: React.ReactNode }) { return <div className="mx-auto flex min-h-64 max-w-md flex-col items-center justify-center rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--surface)] px-6 text-center"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">{icon}</span><h2 className="mt-3 text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{description}</p>{children}</div> }

export function ProfileDialog({ member, messaging, onClose, onMessage, onCopyEmail }: { member: DirectoryMember; messaging: boolean; onClose: () => void; onMessage: () => void; onCopyEmail: () => void }) {
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  return <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-labelledby="member-profile-title" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-[var(--ui-border)] bg-[var(--surface-raised)] p-5 shadow-2xl"><div className="flex justify-end"><button type="button" aria-label="Close profile" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]"><X size={16} /></button></div><div className="flex flex-col items-center text-center"><MemberAvatar member={member} size={68} /><h2 id="member-profile-title" className="mt-3 text-lg font-semibold">{member.display_name}</h2><RoleBadge member={member} /><MemberStatus member={member} /><p className="mt-3 text-xs text-[var(--muted-foreground)]">{member.department || 'No department listed'}</p><button type="button" onClick={onCopyEmail} className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--primary)] hover:underline"><Mail size={13} />{member.email}<Copy size={12} /></button></div><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={onCopyEmail} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] text-xs font-semibold hover:bg-[var(--surface-muted)]"><Copy size={14} />Copy email</button><button type="button" disabled={messaging || member.suspended} onClick={onMessage} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] text-xs font-semibold text-white disabled:opacity-50">{messaging ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}Message</button></div></section></div>
}
