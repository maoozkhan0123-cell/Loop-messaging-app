'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { Hash, Lock, MessageSquare, Search, X } from 'lucide-react'
import { useChannels } from '@/hooks/useChannels'
import type { ChannelWithMember } from '@/types/database'
import { Avatar } from '@/components/ui/Avatar'
import * as Dialog from '@radix-ui/react-dialog'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const router = useRouter()
  const { data: channels } = useChannels()

  // Listen for Ctrl+K / Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Listen for custom event from sidebar
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('open-search', handler)
    return () => window.removeEventListener('open-search', handler)
  }, [])

  const publicChannels = channels?.filter((c) => c.type === 'public' || c.type === 'private') ?? []
  const dmChannels = channels?.filter((c) => c.type === 'dm' || c.type === 'group_dm') ?? []

  const filteredPublic = query
    ? publicChannels.filter((c) => c.name?.toLowerCase().includes(query.toLowerCase()))
    : publicChannels.slice(0, 8)

  const filteredDMs = query
    ? dmChannels.filter((c) => {
        const other = c.other_member as { display_name: string } | undefined
        return other?.display_name?.toLowerCase().includes(query.toLowerCase())
      })
    : dmChannels.slice(0, 5)

  const navigate = (channel: ChannelWithMember) => {
    const isDM = channel.type === 'dm' || channel.type === 'group_dm'
    router.push(isDM ? `/dm/${channel.id}` : `/channel/${channel.id}`)
    setOpen(false)
    setQuery('')
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg">
          <Command
            className="w-full bg-white rounded-xl shadow-2xl border border-[#E5E7EB] overflow-hidden"
            shouldFilter={false}
          >
            <div className="flex items-center gap-2 px-4 border-b border-[#E5E7EB]">
              <Search size={16} className="text-[#9CA3AF] flex-shrink-0" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Jump to a channel or DM..."
                className="flex-1 py-3.5 text-sm focus:outline-none placeholder-[#9CA3AF]"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-[#9CA3AF] hover:text-[#6B7280]">
                  <X size={14} />
                </button>
              )}
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[#F3F4F6] border border-[#E5E7EB] rounded text-[#6B7280]">
                ESC
              </kbd>
            </div>

            <Command.List className="max-h-80 overflow-y-auto py-1">
              <Command.Empty className="py-8 text-center text-sm text-[#9CA3AF]">
                No results for &quot;{query}&quot;
              </Command.Empty>

              {filteredPublic.length > 0 && (
                <Command.Group
                  heading={
                    <span className="px-4 py-1.5 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider block">
                      Channels
                    </span>
                  }
                >
                  {filteredPublic.map((channel) => (
                    <Command.Item
                      key={channel.id}
                      value={channel.id}
                      onSelect={() => navigate(channel)}
                      className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-[#F3F4F6] data-[selected]:bg-[#EBF0FC] transition-colors"
                    >
                      {channel.type === 'private' ? (
                        <Lock size={14} className="text-[#6B7280] flex-shrink-0" />
                      ) : (
                        <Hash size={14} className="text-[#6B7280] flex-shrink-0" />
                      )}
                      <span className="font-medium text-[#111827]">{channel.name}</span>
                      {channel.topic && (
                        <span className="text-[#9CA3AF] truncate text-xs ml-1">{channel.topic}</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {filteredDMs.length > 0 && (
                <Command.Group
                  heading={
                    <span className="px-4 py-1.5 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider block">
                      Direct Messages
                    </span>
                  }
                >
                  {filteredDMs.map((channel) => {
                    const other = channel.other_member as { display_name: string; avatar_url: string | null; status?: 'online' | 'away' | 'offline' } | undefined
                    return (
                      <Command.Item
                        key={channel.id}
                        value={channel.id}
                        onSelect={() => navigate(channel)}
                        className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-[#F3F4F6] data-[selected]:bg-[#EBF0FC] transition-colors"
                      >
                        <Avatar
                          src={other?.avatar_url}
                          name={other?.display_name ?? 'Unknown'}
                          size={20}
                          status={other?.status}
                        />
                        <span className="font-medium text-[#111827]">{other?.display_name ?? 'Unknown'}</span>
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              )}
            </Command.List>

            <div className="px-4 py-2 border-t border-[#E5E7EB] flex items-center gap-3 text-[10px] text-[#9CA3AF]">
              <span><kbd className="font-mono">↑↓</kbd> Navigate</span>
              <span><kbd className="font-mono">↵</kbd> Open</span>
              <span><kbd className="font-mono">Esc</kbd> Close</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
