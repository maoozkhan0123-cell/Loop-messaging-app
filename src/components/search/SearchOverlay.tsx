'use client'

import { useState, useEffect } from 'react'
import { Search, X, Hash, MessageSquare } from 'lucide-react'
import { useSearch } from '@/hooks/useSearch'
import { formatMessageTime } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import * as Dialog from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import type { SearchResult } from '@/hooks/useSearch'

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 text-[#111827] rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export function SearchOverlay() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const router = useRouter()
  const { data: results, isLoading } = useSearch(query)

  // Listen for Ctrl+F or the sidebar search click
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const navigateToMessage = (msg: SearchResult) => {
    if (!msg.channels) return
    const isDM = msg.channels.type === 'dm' || msg.channels.type === 'group_dm'
    router.push(isDM ? `/dm/${msg.channels.id}` : `/channel/${msg.channels.id}`)
    setOpen(false)
    setQuery('')
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl max-h-[70vh] flex flex-col bg-white rounded-xl shadow-2xl border border-[#E5E7EB] overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-[#E5E7EB] flex-shrink-0">
            <Search size={16} className="text-[#9CA3AF] flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages..."
              className="flex-1 py-4 text-sm focus:outline-none placeholder-[#9CA3AF]"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-[#9CA3AF] hover:text-[#6B7280]">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {!query && (
              <div className="flex items-center justify-center h-32 text-sm text-[#9CA3AF]">
                Type to search messages
              </div>
            )}

            {query && isLoading && (
              <div className="flex items-center justify-center h-32 text-sm text-[#9CA3AF]">
                Searching...
              </div>
            )}

            {query && !isLoading && results?.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-sm text-[#9CA3AF]">
                <p>No results for &quot;{query}&quot;</p>
              </div>
            )}

            {results && results.length > 0 && (
              <div className="py-2">
                <p className="px-4 py-2 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </p>
                {results.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => navigateToMessage(msg)}
                    disabled={!msg.channels}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#F9FAFB] text-left transition-colors border-b border-[#F3F4F6] last:border-0"
                  >
                    <Avatar
                      src={msg.profiles?.avatar_url}
                      name={msg.profiles?.display_name ?? 'Unknown'}
                      size={32}
                      className="flex-shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-[#111827]">
                          {msg.profiles?.display_name ?? 'Unknown'}
                        </span>
                        <span className="text-xs text-[#9CA3AF]">
                          {formatMessageTime(msg.created_at)}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-[#9CA3AF] ml-auto">
                          {msg.channels?.type === 'dm' ? (
                            <MessageSquare size={11} />
                          ) : (
                            <Hash size={11} />
                          )}
                          {msg.channels?.name ?? 'DM'}
                        </span>
                      </div>
                      <p className="text-sm text-[#374151] line-clamp-2 message-body">
                        {highlightMatch(msg.body ?? '', query)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
