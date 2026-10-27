'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Hash, Lock, ChevronDown, Plus, Settings, SquarePen, Search, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChannels, useCreateChannel, useCreateDM } from '@/hooks/useChannels'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useProfile } from '@/hooks/useProfile'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { useMobileNav } from '@/components/AppShell'
import type { Profile } from '@/types/database'

const TEXT_DEFAULT = 'rgba(255,255,255,0.85)'
const TEXT_MUTED = 'rgba(255,255,255,0.50)'

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()

  const { data: channels, isLoading } = useChannels()
  const { data: allProfiles } = useAllProfiles()
  const { data: myProfile } = useProfile()
  const createChannel = useCreateChannel()
  const createDM = useCreateDM()

  const [channelsOpen, setChannelsOpen] = useState(true)
  const [dmsOpen, setDmsOpen] = useState(true)
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [startingDM, setStartingDM] = useState<string | null>(null)
  const [sidebarSearch, setSidebarSearch] = useState('')

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bysync.sidebar-sections') || '{}') as { channels?: boolean; dms?: boolean }
      if (typeof saved.channels === 'boolean') setChannelsOpen(saved.channels)
      if (typeof saved.dms === 'boolean') setDmsOpen(saved.dms)
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('bysync.sidebar-sections', JSON.stringify({ channels: channelsOpen, dms: dmsOpen })) } catch {}
  }, [channelsOpen, dmsOpen])

  const publicChannels = useMemo(() => channels?.filter((c) => c.type === 'public' || c.type === 'private') ?? [], [channels])
  const dmChannels = useMemo(() => channels?.filter((c) => c.type === 'dm' || c.type === 'group_dm') ?? [], [channels])
  const activeId = pathname.match(/\/(channel|dm)\/([^/]+)/)?.[2]

  // Existing DMs by other_member id
  const dmMap = useMemo(() => {
    const map = new Map<string, { channelId: string; unread: number }>()
    dmChannels.forEach((c) => {
      const other = c.other_member as Profile | undefined
      if (other) map.set(other.id, { channelId: c.id, unread: c.unread_count ?? 0 })
    })
    return map
  }, [dmChannels])

  // All profiles (excluding self) for DM list
  const allOtherProfiles = useMemo(() => {
    if (!allProfiles) return []
    return allProfiles.filter((u) => u.id !== myProfile?.id)
  }, [allProfiles, myProfile?.id])

  const q = sidebarSearch.toLowerCase().trim()

  // Filtered results when searching
  const filteredChannels = q
    ? publicChannels.filter((c) => c.name?.toLowerCase().includes(q))
    : publicChannels

  const filteredProfiles = q
    ? allOtherProfiles.filter(
        (u) =>
          u.display_name.toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q)
      )
    : allOtherProfiles

  const isSearching = q.length > 0

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return
    const ch = await createChannel.mutateAsync({ name: newChannelName.trim() })
    setNewChannelName(''); setShowNewChannel(false)
    router.push(`/channel/${ch.id}`)
  }

  const handleOpenDM = async (userId: string) => {
    const existing = dmMap.get(userId)
    if (existing) { router.push(`/dm/${existing.channelId}`); return }
    setStartingDM(userId)
    try {
      const id = await createDM.mutateAsync(userId)
      router.push(`/dm/${id}`)
    } finally { setStartingDM(null) }
  }

  return (
    <div className="flex flex-col h-full border-r border-white/10" style={{ background: '#20234A', width: 260 }}>

      {/* ── Workspace header ── */}
      <div
        className="flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: 49, borderBottom: `1px solid rgba(255,255,255,0.1)` }}
      >
        <button type="button" onClick={() => router.push('/dashboard')} className="flex items-center gap-1.5 min-w-0 text-left hover:opacity-80 transition-opacity">
          <span className="font-bold text-[15px] text-white truncate tracking-wide">BySync Workspace</span>
          <ChevronDown size={14} className="text-white/60 flex-shrink-0" />
        </button>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => window.dispatchEvent(new Event('bysync:open-preferences'))} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors" title="Preferences">
            <Settings size={15} style={{ color: TEXT_MUTED }} />
          </button>
          <button type="button" onClick={() => router.push('/people')} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors" title="New message">
            <SquarePen size={15} style={{ color: TEXT_MUTED }} />
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto sidebar-scroll">

        {/* ── Unified search bar — above channels with gap ── */}
        <div className="px-3 pt-3 pb-4">
          <div
            className="flex items-center gap-2 h-8 px-3 rounded-md transition-all"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: `1px solid ${sidebarSearch ? 'rgba(39,170,225,0.85)' : 'rgba(255,255,255,0.16)'}`,
              boxShadow: sidebarSearch ? '0 0 0 3px rgba(40,158,216,0.14)' : 'none',
            }}
          >
            <Search size={12} style={{ color: TEXT_MUTED, flexShrink: 0 }} />
            <input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search channels & people"
              className="flex-1 bg-transparent text-[12px] text-white placeholder-white/38 focus:outline-none min-w-0"
            />
            {sidebarSearch && (
              <button type="button" onClick={() => setSidebarSearch('')} className="flex-shrink-0">
                <X size={11} style={{ color: TEXT_MUTED }} />
              </button>
            )}
          </div>
        </div>

        {/* ── Search results mode ── */}
        {isSearching ? (
          <div className="pb-2">
            {/* Channels results */}
            {filteredChannels.length > 0 && (
              <div>
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
                  Channels
                </div>
                {filteredChannels.map((c) => {
                  const isActive = c.id === activeId
                  return (
                    <NavLink key={c.id} href={`/channel/${c.id}`} isActive={isActive}>
                      {c.type === 'private'
                        ? <Lock size={13} className="flex-shrink-0 opacity-60" />
                        : <Hash size={13} className="flex-shrink-0 opacity-60" />}
                      <span className={cn('truncate text-[13px]', isActive ? 'font-semibold' : 'font-normal')}>
                        {c.name}
                      </span>
                    </NavLink>
                  )
                })}
              </div>
            )}

            {/* People results */}
            {filteredProfiles.length > 0 && (
              <div className={filteredChannels.length > 0 ? 'mt-3' : ''}>
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
                  People
                </div>
                {filteredProfiles.map((user) => {
                  const dm = dmMap.get(user.id)
                  const isActive = dm?.channelId === activeId
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => { setSidebarSearch(''); void handleOpenDM(user.id) }}
                      disabled={startingDM === user.id}
                      className={cn(
                        'flex items-center gap-2 w-[calc(100%-8px)] mx-1 px-3 h-8 text-sm transition-colors text-left rounded',
                        isActive ? 'bg-[#289ED8]/35' : 'hover:bg-white/10'
                      )}
                    >
                      <Avatar src={user.avatar_url} name={user.display_name} size={20} status={user.status} />
                      <span className={cn('flex-1 truncate text-[13px]', isActive ? 'text-white font-semibold' : 'font-normal')}
                        style={!isActive ? { color: TEXT_DEFAULT } : undefined}>
                        {user.display_name}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {filteredChannels.length === 0 && filteredProfiles.length === 0 && (
              <p className="px-4 py-3 text-[12px]" style={{ color: TEXT_MUTED }}>
                No results for &ldquo;{sidebarSearch}&rdquo;
              </p>
            )}
          </div>
        ) : (
          /* ── Normal mode: full channel + DM sections ── */
          <>
            {/* Channels section */}
            <SidebarSection
              label="Channels"
              isOpen={channelsOpen}
              onToggle={() => setChannelsOpen(v => !v)}
              onNew={() => setShowNewChannel(true)}
            >
              {isLoading
                ? [0,1,2].map(i => <RowSkeleton key={i} />)
                : publicChannels.map((c) => {
                    const isActive = c.id === activeId
                    const hasUnread = (c.unread_count ?? 0) > 0
                    return (
                      <NavLink key={c.id} href={`/channel/${c.id}`} isActive={isActive}>
                        {c.type === 'private'
                          ? <Lock size={14} className="flex-shrink-0 opacity-70" />
                          : <Hash size={14} className="flex-shrink-0 opacity-70" />}
                        <span className={cn('truncate', !isActive && !hasUnread ? 'font-normal' : 'font-semibold')}>
                          {c.name}
                        </span>
                        {hasUnread && !isActive && (
                          <span className="ml-auto flex-shrink-0 h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold text-white text-center" style={{ background: '#27AAE1' }}>
                            {(c.unread_count ?? 0) > 99 ? '99+' : c.unread_count}
                          </span>
                        )}
                      </NavLink>
                    )
                  })
              }
              {showNewChannel ? (
                <div className="px-2 py-0.5">
                  <input
                    autoFocus value={newChannelName}
                    onChange={e => setNewChannelName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') void handleCreateChannel()
                      if (e.key === 'Escape') { setShowNewChannel(false); setNewChannelName('') }
                    }}
                    onBlur={() => { if (!newChannelName.trim()) setShowNewChannel(false) }}
                    placeholder="channel-name"
                    className="w-full h-7 px-2 text-xs rounded text-white focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #27AAE1' }}
                  />
                </div>
              ) : (
                <AddRow label="Add channel" onClick={() => setShowNewChannel(true)} />
              )}
            </SidebarSection>

            {/* Direct Messages section */}
            <SidebarSection
              label="Direct messages"
              isOpen={dmsOpen}
              onToggle={() => setDmsOpen(v => !v)}
            >
              {allOtherProfiles.length === 0 ? (
                <p className="px-4 py-2 text-[11px]" style={{ color: TEXT_MUTED }}>No other users yet.</p>
              ) : (
                allOtherProfiles.map((user) => {
                  const dm = dmMap.get(user.id)
                  const isActive = dm?.channelId === activeId
                  const hasUnread = (dm?.unread ?? 0) > 0

                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => void handleOpenDM(user.id)}
                      disabled={startingDM === user.id}
                      className={cn(
                        'flex items-center gap-2 w-[calc(100%-8px)] mx-1 px-3 h-8 text-sm transition-colors text-left rounded',
                        isActive ? 'bg-[#289ED8]/35' : 'hover:bg-white/10'
                      )}
                    >
                      <div className="flex-shrink-0">
                        <Avatar src={user.avatar_url} name={user.display_name} size={20} status={user.status} />
                      </div>
                      <span
                        className={cn('flex-1 truncate text-[13px]',
                          isActive ? 'text-white font-semibold' :
                          hasUnread ? 'text-white font-bold' : 'font-normal'
                        )}
                        style={!isActive && !hasUnread ? { color: TEXT_DEFAULT } : undefined}
                      >
                        {user.display_name}
                      </span>
                      {hasUnread && !isActive && (
                        <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: '#36D7AE' }}>
                          {(dm?.unread ?? 0) > 9 ? '9+' : dm?.unread}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
              <AddRow label="Add teammates" onClick={() => router.push('/people')} />
            </SidebarSection>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SidebarSection({
  label, isOpen, onToggle, onNew, children,
}: {
  label: string; isOpen: boolean; onToggle: () => void; onNew?: () => void; children: React.ReactNode
}) {
  return (
    <div className="mt-1">
      <div className="flex items-center px-2 group mb-0.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 flex-1 min-w-0 text-left py-1 rounded hover:bg-white/06 transition-colors"
        >
          <ChevronDown
            size={13}
            className={cn('flex-shrink-0 transition-transform duration-150', !isOpen && '-rotate-90')}
            style={{ color: TEXT_MUTED }}
          />
          <span className="text-[13px] font-semibold truncate" style={{ color: TEXT_DEFAULT }}>
            {label}
          </span>
        </button>
        {onNew && (
          <button
            type="button"
            onClick={onNew}
            className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-all"
            style={{ color: TEXT_MUTED }}
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.13 }}
            style={{ overflow: 'hidden' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NavLink({ href, isActive, children }: { href: string; isActive: boolean; children: React.ReactNode }) {
  const { closeMobileMenu } = useMobileNav()
  return (
    <Link
      href={href}
      onClick={closeMobileMenu}
      className={cn(
        'flex items-center gap-2 h-8 px-3 mx-1 text-[13px] rounded transition-colors',
        isActive ? 'bg-[#289ED8]/35 text-white font-semibold shadow-[inset_3px_0_0_#27AAE1]' : 'hover:bg-white/10 font-normal'
      )}
      style={!isActive ? { color: TEXT_DEFAULT } : undefined}
    >
      {children}
    </Link>
  )
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 h-8 px-3 mx-1 w-[calc(100%-8px)] text-[13px] rounded hover:bg-white/10 transition-colors"
      style={{ color: TEXT_MUTED }}
    >
      <Plus size={13} className="flex-shrink-0" />
      <span>{label}</span>
    </button>
  )
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-2 h-8 px-3 mx-1">
      <div className="w-3.5 h-3.5 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.07)' }} />
      <div className="h-3 rounded animate-pulse" style={{ width: '55%', background: 'rgba(255,255,255,0.07)' }} />
    </div>
  )
}
