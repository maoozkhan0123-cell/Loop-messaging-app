'use client'

import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Search, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toaster'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { useAllProfiles } from '@/hooks/useProfiles'
import { cn } from '@/lib/utils'
import type { Profile } from '@/types/database'

type Tab = 'members' | 'add'

/** Channel members dialog: see and remove current members, or pick people to add. */
export function AddChannelMembersDialog({ channelId, channelName, open, onOpenChange }: { channelId: string; channelName: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { toast } = useToast()
  const { data: profiles = [] } = useAllProfiles()
  const [memberIds, setMemberIds] = useState<Set<string> | null>(null)
  const [canRemove, setCanRemove] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('members')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMemberIds(null); setSelected(new Set()); setQuery(''); setError(null); setTab('members')
    fetch(`/api/channels/${channelId}/members`)
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Unable to load channel members.')
        if (cancelled) return
        setMemberIds(new Set(body.memberIds as string[]))
        setCanRemove(Boolean(body.canRemove))
        setCurrentUserId(body.currentUserId ?? null)
      })
      .catch((cause) => { if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Unable to load channel members.'); setMemberIds(new Set()) } })
    return () => { cancelled = true }
  }, [open, channelId])

  const needle = query.trim().toLowerCase()
  const matches = (profile: Profile) => !needle || `${profile.display_name} ${profile.email ?? ''} ${profile.job_title ?? ''}`.toLowerCase().includes(needle)
  const members = useMemo(() => profiles.filter((profile) => memberIds?.has(profile.id) && matches(profile)).sort((a, b) => a.display_name.localeCompare(b.display_name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, memberIds, needle])
  const candidates = useMemo(() => profiles.filter((profile) => !memberIds?.has(profile.id) && matches(profile)).sort((a, b) => a.display_name.localeCompare(b.display_name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, memberIds, needle])

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const add = async () => {
    if (!selected.size) return
    setSaving(true); setError(null)
    try {
      const response = await fetch(`/api/channels/${channelId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: [...selected] }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Unable to add people.')
      void queryClient.invalidateQueries({ queryKey: ['channels'] })
      toast({ title: `Added to #${channelName}`, description: body.message, type: 'success' })
      setMemberIds((current) => new Set([...(current ?? []), ...selected]))
      setSelected(new Set())
      setTab('members')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add people.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (profile: Profile) => {
    const self = profile.id === currentUserId
    const ok = await confirmDialog(self
      ? { title: `Leave #${channelName}?`, description: 'You will stop seeing this channel until someone adds you back.', confirmLabel: 'Leave' }
      : { title: `Remove ${profile.display_name}?`, description: `They will lose access to #${channelName}.`, confirmLabel: 'Remove' })
    if (!ok) return
    setRemovingId(profile.id); setError(null)
    try {
      const response = await fetch(`/api/channels/${channelId}/members`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: profile.id }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Unable to remove this person.')
      void queryClient.invalidateQueries({ queryKey: ['channels'] })
      toast({ title: body.message, type: 'success' })
      if (self) { onOpenChange(false); router.push('/messages'); return }
      setMemberIds((current) => { const next = new Set(current); next.delete(profile.id); return next })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove this person.')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-[101] flex h-[min(85vh,620px)] w-[min(94vw,480px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] text-[var(--foreground)] shadow-2xl outline-none">
          <header className="flex items-start justify-between gap-3 px-5 pt-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold">#{channelName}</Dialog.Title>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{memberIds ? `${memberIds.size} ${memberIds.size === 1 ? 'member' : 'members'}` : 'Loading members…'}</p>
            </div>
            <Dialog.Close className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]" aria-label="Close"><X size={16} /></Dialog.Close>
          </header>
          <nav className="mt-3 grid grid-cols-2 border-b border-[var(--ui-border)] px-5" aria-label="Channel members">
            {(['members', 'add'] as Tab[]).map((value) => (
              <button key={value} type="button" onClick={() => setTab(value)} aria-current={tab === value ? 'page' : undefined} className={cn('border-b-2 py-2 text-sm font-semibold transition-colors', tab === value ? 'border-[var(--primary)] text-[var(--foreground)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]')}>
                {value === 'members' ? 'Members' : 'Add people'}
              </button>
            ))}
          </nav>
          <div className="px-5 py-3">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-[var(--ui-border)] px-3 focus-within:border-[var(--primary)]">
              <Search size={14} className="text-[var(--muted-foreground)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === 'members' ? 'Search members' : 'Search by name, email or role'} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {memberIds === null ? (
              <div className="grid place-items-center py-10"><Loader2 size={20} className="animate-spin text-[var(--primary)]" /></div>
            ) : tab === 'members' ? (
              members.length ? members.map((profile) => {
                const self = profile.id === currentUserId
                return (
                  <div key={profile.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-[var(--surface-muted)]">
                    <PersonInfo profile={profile} suffix={self ? ' (you)' : ''} />
                    {(self || canRemove) && (
                      <button type="button" disabled={removingId === profile.id} onClick={() => void remove(profile)} className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg border border-[var(--ui-border)] px-3 text-xs font-semibold text-[var(--muted-foreground)] hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                        {removingId === profile.id && <Loader2 size={12} className="animate-spin" />}{self ? 'Leave' : 'Remove'}
                      </button>
                    )}
                  </div>
                )
              }) : <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">{query ? `No members match “${query}”.` : 'No members yet.'}</p>
            ) : candidates.length ? candidates.map((profile) => {
              const checked = selected.has(profile.id)
              return (
                <button key={profile.id} type="button" onClick={() => toggle(profile.id)} aria-pressed={checked} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--surface-muted)]', checked && 'bg-[var(--primary-soft)]')}>
                  <PersonInfo profile={profile} />
                  <span className={cn('grid h-5 w-5 flex-shrink-0 place-items-center rounded-md border', checked ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--ui-border)]')}>{checked && <Check size={13} />}</span>
                </button>
              )
            }) : (
              <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">{query ? `No people match “${query}”.` : 'Everyone is already in this channel.'}</p>
            )}
          </div>
          {error && <p role="alert" className="border-t border-[var(--ui-border)] px-5 py-2 text-xs text-red-600">{error}</p>}
          {tab === 'add' && (
            <footer className="flex items-center justify-between gap-3 border-t border-[var(--ui-border)] px-5 py-3">
              <span className="text-xs text-[var(--muted-foreground)]">{selected.size ? `${selected.size} selected` : 'Select people to add'}</span>
              <button type="button" disabled={!selected.size || saving} onClick={() => void add()} className="flex h-9 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-50">
                {saving && <Loader2 size={14} className="animate-spin" />}Add{selected.size ? ` ${selected.size}` : ''}
              </button>
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PersonInfo({ profile, suffix = '' }: { profile: Profile; suffix?: string }) {
  return <>
    <Avatar src={profile.avatar_url} name={profile.display_name} size={34} status={profile.status} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold">{profile.display_name}{suffix}</span>
      <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{profile.job_title || profile.email}</span>
    </span>
  </>
}
