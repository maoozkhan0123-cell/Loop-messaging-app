'use client'

import { useEffect, useRef, useCallback, useState, type ReactNode } from 'react'
import { Message } from './Message'
import { MessageSkeleton } from '@/components/ui/Skeleton'
import { formatDateDivider, sameDay } from '@/lib/utils'
import { useMessages } from '@/hooks/useMessages'
import type { Message as MessageType } from '@/types/database'
import { Loader2, AlertCircle, RefreshCw, ArrowDown, SearchX } from 'lucide-react'

interface MessageListProps {
  channelId: string
  currentUserId: string
  onThreadOpen?: (message: MessageType) => void
  onCreateTask?: (message: MessageType) => void
  linkedContext?: MessageType[]
  highlightMessageId?: string
  parentId?: string
  searchQuery?: string
  /** Shown above the first message, e.g. a channel welcome. */
  intro?: ReactNode
}

export function MessageList({ channelId, currentUserId, onThreadOpen, onCreateTask, parentId, searchQuery, intro, linkedContext, highlightMessageId }: MessageListProps) {
  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMessages(channelId, parentId, currentUserId)

  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const focusedMessageRef = useRef<string | null>(null)
  const [showJump, setShowJump] = useState(false)

  const allMessages = linkedContext ?? data?.pages.slice().reverse().flatMap((page) => page) ?? []
  const messages = searchQuery?.trim()
    ? allMessages.filter((m) => m.body?.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : allMessages

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [channelId])

  useEffect(() => {
    if (!highlightMessageId) {
      if (focusedMessageRef.current) {
        focusedMessageRef.current = null
        isAtBottomRef.current = true
        bottomRef.current?.scrollIntoView()
      }
      return
    }
    if (focusedMessageRef.current === highlightMessageId) return
    const element = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []).find((item) => item.dataset.messageId === highlightMessageId)
    if (!element) return
    isAtBottomRef.current = false
    focusedMessageRef.current = highlightMessageId
    element.scrollIntoView({ block: 'center' })
    element.focus({ preventScroll: true })
  }, [highlightMessageId, messages.length, isLoading])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isAtBottomRef.current = distFromBottom < 100
    setShowJump(distFromBottom > 400)

    if (!linkedContext && el.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      const prevHeight = el.scrollHeight
      const prevScrollTop = el.scrollTop
      fetchNextPage().then(() => {
        requestAnimationFrame(() => {
          el.scrollTop = prevScrollTop + el.scrollHeight - prevHeight
        })
      })
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, linkedContext])

  if (isLoading && !linkedContext) {
    return (
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 6 }).map((_, i) => <MessageSkeleton key={i} />)}
      </div>
    )
  }

  // Show the actual error so we can diagnose what's wrong
  if (isError && !linkedContext) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#111827] mb-1">Failed to load messages</p>
          <p className="text-xs text-red-500 mb-4 font-mono bg-red-50 px-2 py-1 rounded">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 mx-auto px-3 h-8 text-xs bg-[#3589FA] text-white rounded hover:bg-[#2558C7] transition-colors"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (messages.length === 0 && searchQuery?.trim()) {
    return (
      <div className="flex-1 px-4 pt-10 sm:px-6">
        <SearchX size={28} className="text-[#D1D5DB]" />
        <h3 className="mt-3 font-semibold text-[#111827]">No messages match &ldquo;{searchQuery.trim()}&rdquo;</h3>
        <p className="mt-1 text-sm text-[#6B7280]">Try a different word or check the spelling.</p>
      </div>
    )
  }

  if (messages.length === 0) {
    return intro ? <div className="flex-1 overflow-y-auto">{intro}</div> : (
      <div className="flex-1 px-4 pt-10 sm:px-6">
        <h3 className="font-semibold text-[#111827] mb-1">No messages yet</h3>
        <p className="text-sm text-[#6B7280]">Be the first to send a message!</p>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
    <div ref={containerRef} role="log" aria-label={parentId ? 'Thread replies' : 'Conversation messages'} className="flex-1 overflow-y-auto pb-2" onScroll={handleScroll}>
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <Loader2 size={16} className="animate-spin text-[#9CA3AF]" />
        </div>
      )}

      {!linkedContext && !hasNextPage && !searchQuery?.trim() && intro}

      {messages.map((message, index) => {
        const prev = messages[index - 1]
        const showHeader =
          !prev ||
          prev.user_id !== message.user_id ||
          !sameDay(prev.created_at, message.created_at) ||
          new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000

        const showDateDivider = !prev || !sameDay(prev.created_at, message.created_at)

        return (
          <div key={message.id} data-message-id={message.id} tabIndex={-1} className={message.id === highlightMessageId ? 'rounded-lg bg-[#EBF5FF] ring-2 ring-inset ring-[#3589FA] outline-none' : 'outline-none'}>
            {showDateDivider && (
              <div className="my-3 flex items-center gap-3 px-4 sm:px-6">
                <span className="h-px flex-1 bg-[#E5E7EB]" />
                <span className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-xs font-semibold text-[#374151] shadow-sm">
                  {formatDateDivider(message.created_at)}
                </span>
                <span className="h-px flex-1 bg-[#E5E7EB]" />
              </div>
            )}
            <Message
              message={message}
              channelId={channelId}
              currentUserId={currentUserId}
              showHeader={showHeader}
              onThreadOpen={onThreadOpen}
              onCreateTask={onCreateTask}
            />
          </div>
        )
      })}

      <div ref={bottomRef} />
    </div>
    {showJump && !linkedContext && (
      <button
        type="button"
        onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
        className="absolute bottom-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#3589FA] px-3.5 text-xs font-semibold text-white shadow-lg hover:bg-[#2575E8]"
      >
        <ArrowDown size={13} /> Jump to latest
      </button>
    )}
    </div>
  )
}
