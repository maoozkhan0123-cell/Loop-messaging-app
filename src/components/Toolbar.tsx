'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Hash, Lock, MessageSquare, SquarePen, ChevronDown, Users, Menu } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useChannels, useCreateDM } from '@/hooks/useChannels'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useProfile } from '@/hooks/useProfile'
import { useSearch } from '@/hooks/useSearch'
import { useMobileNav } from '@/components/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import type { ChannelWithMember, Profile } from '@/types/database'

type ResultItem =
  | { kind: 'channel'; channel: ChannelWithMember }
  | { kind: 'dm'; channel: ChannelWithMember }
  | { kind: 'person'; profile: Profile }
  | { kind: 'message'; message: { id: string; body: string | null; channel_id: string; channels?: { id: string; name: string | null; type: string } | null; profiles?: { display_name: string } | null } }

export function Toolbar() {
  const router = useRouter()
  const { toggleMobileMenu } = useMobileNav()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { data: channels } = useChannels()
  const { data: myProfile } = useProfile()
  const { data: allProfiles } = useAllProfiles()
  const { data: messageResults } = useSearch(query)
  const createDM = useCreateDM()

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setFocused(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Ctrl+K → focus the inline search (not the modal)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setFocused(true)
      }
      if (e.key === 'Escape' && focused) {
        setFocused(false)
        setQuery('')
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [focused])

  const q = query.toLowerCase().trim()

  const publicChannels = (channels ?? []).filter(
    (c) => c.type === 'public' || c.type === 'private'
  )
  const dmChannels = (channels ?? []).filter(
    (c) => (c.type === 'dm' || c.type === 'group_dm') && (c.other_member as Profile | undefined)?.display_name
  )

  const filteredChannels = q
    ? publicChannels.filter((c) => c.name?.toLowerCase().includes(q))
    : publicChannels.slice(0, 6)

  const filteredDMs = q
    ? dmChannels.filter((c) => {
        const other = c.other_member as Profile | undefined
        return other?.display_name?.toLowerCase().includes(q)
      })
    : dmChannels.slice(0, 5)

  // People without an existing DM (shown only when searching)
  const filteredPeople = q && allProfiles
    ? allProfiles
        .filter((p) => {
          if (p.id === myProfile?.id) return false
          const hasDM = dmChannels.some((c) => (c.other_member as Profile | undefined)?.id === p.id)
          if (hasDM) return false
          return (
            p.display_name.toLowerCase().includes(q) ||
            (p.email ?? '').toLowerCase().includes(q)
          )
        })
        .slice(0, 3)
    : []

  // Message results (only when query >= 2 chars)
  const filteredMessages = q.length >= 2 ? (messageResults ?? []).slice(0, 5) : []

  const allResults: ResultItem[] = [
    ...filteredChannels.map((c) => ({ kind: 'channel' as const, channel: c })),
    ...filteredDMs.map((c) => ({ kind: 'dm' as const, channel: c })),
    ...filteredPeople.map((p) => ({ kind: 'person' as const, profile: p })),
    ...filteredMessages.map((m) => ({ kind: 'message' as const, message: m })),
  ]

  const navigateTo = useCallback(
    async (item: ResultItem) => {
      setFocused(false)
      setQuery('')
      inputRef.current?.blur()
      if (item.kind === 'channel') {
        router.push(`/channel/${item.channel.id}`)
      } else if (item.kind === 'dm') {
        router.push(`/dm/${item.channel.id}`)
      } else if (item.kind === 'message') {
        const ch = item.message.channels
        if (ch) {
          const path = ch.type === 'dm' || ch.type === 'group_dm' ? `/dm/${ch.id}` : `/channel/${ch.id}`
          router.push(path)
        }
      } else {
        const channelId = await createDM.mutateAsync(item.profile.id)
        router.push(`/dm/${channelId}`)
      }
    },
    [router, createDM]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setFocused(false)
      setQuery('')
      inputRef.current?.blur()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, allResults.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && allResults[selectedIdx]) {
      e.preventDefault()
      void navigateTo(allResults[selectedIdx])
    }
  }

  const showDropdown = focused

  return (
    <div
      className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0 px-2 sm:px-4 relative z-30"
      style={{
        height: 41,
        background: '#0D1F31',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* ── Mobile menu toggle button ── */}
      <button
        type="button"
        onClick={toggleMobileMenu}
        className="md:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
        title="Open navigation menu"
      >
        <Menu size={18} />
      </button>

      {/* ── Workspace name ── */}
      <button
        type="button"
        className="flex items-center gap-1 flex-shrink-0 hover:bg-white/10 rounded-lg px-1.5 sm:px-2 py-1 transition-colors"
        onClick={() => router.push('/')}
      >
        <span className="font-bold text-[14px] sm:text-[15px] text-white tracking-tight truncate max-w-[90px] sm:max-w-none">
          StackdSol
        </span>
        <ChevronDown size={13} className="text-white/70 flex-shrink-0" />
      </button>

      <div className="w-px h-5 bg-white/20 flex-shrink-0 hidden sm:block" />


      {/* ── Inline search input ── */}
      <div className="flex-1 max-w-xl mx-auto relative">
        <div
          className="flex items-center gap-2 h-[27px] px-3 rounded transition-all"
          style={{
            background: focused ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.11)',
            border: `1px solid ${focused ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)'}`,
          }}
        >
          <Search size={12} className="text-white/55 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0) }}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search StackdSol"
            className="flex-1 bg-transparent text-[13px] text-white placeholder-white/40 focus:outline-none min-w-0"
          />
          {!query && (
            <span className="text-[10px] text-white/28 flex-shrink-0 hidden sm:block select-none">
              Ctrl K
            </span>
          )}
        </div>

        {/* ── Results dropdown ── */}
        {showDropdown && allResults.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-2xl border border-[#E5E7EB] overflow-hidden"
          >
            {filteredChannels.length > 0 && (
              <ResultSection title="Channels">
                {filteredChannels.map((ch) => (
                  <ResultRow
                    key={ch.id}
                    isSelected={allResults.findIndex(r => r.kind === 'channel' && r.channel.id === ch.id) === selectedIdx}
                    onClick={() => void navigateTo({ kind: 'channel', channel: ch })}
                  >
                    {ch.type === 'private' ? (
                      <Lock size={14} className="text-[#6B7280] flex-shrink-0" />
                    ) : (
                      <Hash size={14} className="text-[#6B7280] flex-shrink-0" />
                    )}
                    <span className="text-[13px] text-[#111827] font-medium truncate">{ch.name}</span>
                    {ch.topic && (
                      <span className="text-[11px] text-[#9CA3AF] truncate ml-1 hidden sm:block">{ch.topic}</span>
                    )}
                  </ResultRow>
                ))}
              </ResultSection>
            )}

            {filteredDMs.length > 0 && (
              <ResultSection title="Direct Messages">
                {filteredDMs.map((ch) => {
                  const other = ch.other_member as Profile | undefined
                  const idx = allResults.findIndex(r => r.kind === 'dm' && r.channel.id === ch.id)
                  return (
                    <ResultRow
                      key={ch.id}
                      isSelected={idx === selectedIdx}
                      onClick={() => void navigateTo({ kind: 'dm', channel: ch })}
                    >
                      <Avatar src={other?.avatar_url} name={other?.display_name ?? ''} size={20} status={other?.status} />
                      <span className="text-[13px] text-[#111827] font-medium truncate">{other?.display_name}</span>
                    </ResultRow>
                  )
                })}
              </ResultSection>
            )}

            {filteredPeople.length > 0 && (
              <ResultSection title="People">
                {filteredPeople.map((p) => {
                  const idx = allResults.findIndex(r => r.kind === 'person' && r.profile.id === p.id)
                  return (
                    <ResultRow
                      key={p.id}
                      isSelected={idx === selectedIdx}
                      onClick={() => void navigateTo({ kind: 'person', profile: p })}
                    >
                      <Avatar src={p.avatar_url} name={p.display_name} size={20} status={p.status} />
                      <span className="text-[13px] text-[#111827] font-medium truncate">{p.display_name}</span>
                      <span className="text-[11px] text-[#9CA3AF] ml-auto flex-shrink-0">Open DM</span>
                    </ResultRow>
                  )
                })}
              </ResultSection>
            )}

            {filteredMessages.length > 0 && (
              <ResultSection title="Messages">
                {filteredMessages.map((msg) => {
                  const idx = allResults.findIndex(r => r.kind === 'message' && r.message.id === msg.id)
                  const channelName = msg.channels?.name ?? 'Direct Message'
                  const senderName = msg.profiles?.display_name ?? ''
                  return (
                    <ResultRow
                      key={msg.id}
                      isSelected={idx === selectedIdx}
                      onClick={() => void navigateTo({ kind: 'message', message: msg as { id: string; body: string | null; channel_id: string; channels?: { id: string; name: string | null; type: string } | null; profiles?: { display_name: string } | null } })}
                    >
                      <MessageSquare size={14} className="text-[#6B7280] flex-shrink-0" />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[12px] text-[#111827] truncate">{msg.body}</span>
                        <span className="text-[10px] text-[#9CA3AF]">{senderName} in #{channelName}</span>
                      </div>
                    </ResultRow>
                  )
                })}
              </ResultSection>
            )}

            <div className="px-3 py-1.5 border-t border-[#F3F4F6] flex items-center gap-3 text-[10px] text-[#9CA3AF]">
              <span>↑↓ Navigate</span>
              <span>↵ Open</span>
              <span>Esc Close</span>
            </div>
          </div>
        )}

        {/* Empty state when focused but no results */}
        {showDropdown && allResults.length === 0 && query && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-2xl border border-[#E5E7EB] py-6 text-center">
            <p className="text-[13px] text-[#9CA3AF]">No results for &ldquo;{query}&rdquo;</p>
          </div>
        )}
      </div>

      {/* ── Right actions ── */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          title="New message"
          onClick={() => router.push('/people')}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-white/90 hover:bg-white/15 transition-colors text-[13px] font-medium"
        >
          <SquarePen size={14} />
          <span className="hidden sm:inline">New&nbsp;message</span>
        </button>
        <button
          type="button"
          title="People"
          onClick={() => router.push('/people')}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/15 transition-colors"
        >
          <Users size={15} />
        </button>
      </div>
    </div>
  )
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 pt-2.5 pb-0.5 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
        {title}
      </div>
      {children}
    </div>
  )
}

function ResultRow({
  isSelected,
  onClick,
  children,
}: {
  isSelected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3 py-2 transition-colors text-left"
      style={{ background: isSelected ? '#EBF0FC' : undefined }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#F3F4F6'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = ''
      }}
    >
      {children}
    </button>
  )
}
