'use client'

import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, ChevronDown, Plus, Search, Settings, UserRound } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Avatar } from '@/components/ui/Avatar'
import { useChannels, useMarkRead } from '@/hooks/useChannels'
import { useUpdateProfile } from '@/hooks/useProfile'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

export function greetingForHour(hour: number) { return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening' }
export function firstNameOf(name?: string | null) { return name?.trim().split(/\s+/)[0] || 'there' }

export function DashboardHeader({ user, query, onQueryChange, onNewTask, onNewMessage }: { user?: Profile | null; query: string; onQueryChange: (value: string) => void; onNewTask: () => void; onNewMessage: () => void }) {
  const router = useRouter()
  const { data: channels = [] } = useChannels()
  const markRead = useMarkRead()
  const updateProfile = useUpdateProfile()
  const unread = channels.filter((channel) => (channel.unread_count ?? 0) > 0)
  const totalUnread = unread.reduce((sum, channel) => sum + (channel.unread_count ?? 0), 0)
  const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K'

  const markAllRead = async () => { await Promise.all(unread.map((channel) => markRead.mutateAsync(channel.id))) }
  const signOut = async () => { await createClient().auth.signOut(); router.push('/login') }

  return <header className="flex min-h-14 items-center justify-end border-b border-[var(--ui-border)] bg-[var(--surface)] px-4 py-2 sm:px-6 lg:px-7">
    <div className="flex items-center gap-2">
      <label className="relative hidden lg:block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" size={14} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search tasks and projects" className="h-9 w-60 rounded-lg border border-[var(--ui-border)] bg-[var(--surface-muted)] pl-9 pr-12 text-xs outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]" /><button type="button" onClick={() => window.dispatchEvent(new Event('open-search'))} className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[var(--ui-border)] bg-[var(--surface)] px-1.5 py-0.5 text-[9px] text-[var(--muted-foreground)]">{shortcut}</button></label>

      <Popover.Root><Popover.Trigger asChild><button type="button" aria-label={`Notifications${totalUnread ? `, ${totalUnread} unread` : ''}`} title="Notifications" className="relative grid h-9 w-9 place-items-center rounded-lg border border-[var(--ui-border)] hover:bg-[var(--surface-muted)]"><Bell size={16} />{totalUnread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--danger)] ring-2 ring-[var(--surface)]" />}</button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={8} className="z-[90] w-[min(360px,calc(100vw-24px))] rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] p-2 shadow-xl"><div className="flex items-center justify-between px-2 py-2"><div><p className="text-sm font-semibold">Notifications</p><p className="text-[11px] text-[var(--muted-foreground)]">Unread conversations</p></div>{unread.length > 0 && <button type="button" onClick={() => void markAllRead()} className="flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)]"><CheckCheck size={13} />Mark all read</button>}</div><div className="max-h-72 overflow-y-auto">{unread.length ? unread.map((channel) => <button key={channel.id} type="button" onClick={() => { void markRead.mutateAsync(channel.id); router.push(`/${channel.type === 'dm' || channel.type === 'group_dm' ? 'dm' : 'channel'}/${channel.id}`) }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--surface-muted)]"><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{channel.name || (channel.other_member as Profile | undefined)?.display_name || 'Conversation'}</span><span className="text-[10px] text-[var(--muted-foreground)]">Unread messages</span></span><span className="rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-bold text-white">{channel.unread_count}</span></button>) : <div className="px-4 py-8 text-center"><Bell size={20} className="mx-auto text-[var(--muted-foreground)]" /><p className="mt-2 text-xs font-semibold">You&apos;re all caught up</p></div>}</div></Popover.Content></Popover.Portal></Popover.Root>

      <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-white"><Plus size={14} />New<ChevronDown size={12} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={8} className="z-[90] min-w-44 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] p-1 shadow-xl"><MenuItem onSelect={onNewTask}>New task</MenuItem><MenuItem onSelect={onNewMessage}>New message</MenuItem><DropdownMenu.Item disabled className="rounded-md px-3 py-2 text-xs text-[var(--muted-foreground)] opacity-60 outline-none">New event · unavailable</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>

      <Popover.Root><Popover.Trigger asChild><button type="button" aria-label="Open profile menu" className="rounded-full"><Avatar name={user?.display_name || 'Member'} src={user?.avatar_url} status={user?.status} size={34} /></button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={8} className="z-[90] w-64 rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] p-2 shadow-xl"><div className="flex items-center gap-3 px-2 py-2"><Avatar name={user?.display_name || 'Member'} src={user?.avatar_url} status={user?.status} size={38} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{user?.display_name || 'Team member'}</p><p className="truncate text-[11px] text-[var(--muted-foreground)]">{user?.email}</p></div></div><div className="my-1 h-px bg-[var(--ui-border)]" /><p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Set presence</p>{(['online','away','offline'] as const).map((status) => <button key={status} type="button" onClick={() => updateProfile.mutate({ status })} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs capitalize hover:bg-[var(--surface-muted)]"><span className={`h-2 w-2 rounded-full ${status === 'online' ? 'bg-emerald-500' : status === 'away' ? 'bg-amber-500' : 'bg-slate-400'}`} />{status === 'online' ? 'Active' : status}</button>)}<div className="my-1 h-px bg-[var(--ui-border)]" /><button type="button" onClick={() => router.push('/profile')} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-[var(--surface-muted)]"><UserRound size={14} />View profile</button><button type="button" onClick={() => window.dispatchEvent(new Event('bysync:open-preferences'))} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-[var(--surface-muted)]"><Settings size={14} />Preferences</button><button type="button" onClick={() => void signOut()} className="mt-1 w-full rounded-md px-2 py-2 text-left text-xs text-red-600 hover:bg-red-50">Sign out</button></Popover.Content></Popover.Portal></Popover.Root>
    </div>
  </header>
}

function MenuItem({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) { return <DropdownMenu.Item onSelect={onSelect} className="cursor-pointer rounded-md px-3 py-2 text-xs outline-none data-[highlighted]:bg-[var(--surface-muted)]">{children}</DropdownMenu.Item> }
