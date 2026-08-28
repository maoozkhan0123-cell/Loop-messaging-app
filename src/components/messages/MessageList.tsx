'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Message } from './Message'
import { MessageSkeleton } from '@/components/ui/Skeleton'
import { formatDateDivider, sameDay } from '@/lib/utils'
import { useMessages } from '@/hooks/useMessages'
import type { Message as MessageType } from '@/types/database'
import { Loader2, AlertCircle, RefreshCw, ChevronDown } from 'lucide-react'

interface MessageListProps {
  channelId: string
  currentUserId: string
  onThreadOpen?: (message: MessageType) => void
  parentId?: string
  searchQuery?: string
}

export function MessageList({ channelId, currentUserId, onThreadOpen, parentId, searchQuery }: MessageListProps) {
  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMessages(channelId, parentId, currentUserId)

  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  const allMessages = data?.pages.flatMap((p) => p) ?? []
  const messages = searchQuery?.trim()
    ? allMessages.filter((m) => m.body?.toLowerCase().includes(searchQuery.toLowerCase()))
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

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isAtBottomRef.current = distFromBottom < 100

    if (el.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      const prevHeight = el.scrollHeight
      fetchNextPage().then(() => {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - prevHeight
        })
      })
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 6 }).map((_, i) => <MessageSkeleton key={i} />)}
      </div>
    )
  }

  // Show the actual error so we can diagnose what's wrong
  if (isError) {
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

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[#EBF5FF] flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">💬</span>
          </div>
          <h3 className="font-semibold text-[#111827] mb-1">No messages yet</h3>
          <p className="text-sm text-[#6B7280]">Be the first to send a message!</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto py-2" onScroll={handleScroll}>
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <Loader2 size={16} className="animate-spin text-[#9CA3AF]" />
        </div>
      )}

      <div />

      {messages.map((message, index) => {
        const prev = messages[index - 1]
        const showHeader =
          !prev ||
          prev.user_id !== message.user_id ||
          !sameDay(prev.created_at, message.created_at) ||
          new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000

        const showDateDivider = !prev || !sameDay(prev.created_at, message.created_at)

        return (
          <div key={message.id}>
            {showDateDivider && (
              <div className="text-center my-3 relative">
                <hr className="absolute top-1/2 left-0 right-0 border-t border-[#E5E7EB]" />
                <button
                  type="button"
                  className="relative inline-flex items-center gap-1 bg-white px-3 py-1 rounded-full text-xs text-[#6B7280] border border-[#E5E7EB] shadow-sm hover:bg-[#F9FAFB] hover:border-[#D1D5DB] transition-colors"
                >
                  {formatDateDivider(message.created_at)}
                  <ChevronDown size={11} className="opacity-60" />
                </button>
              </div>
            )}
            <Message
              message={message}
              channelId={channelId}
              currentUserId={currentUserId}
              showHeader={showHeader}
              onThreadOpen={onThreadOpen}
            />
          </div>
        )
      })}

      <div ref={bottomRef} />
    </div>
  )
}
