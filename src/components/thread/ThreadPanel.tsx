'use client'

import { X, CornerUpRight } from 'lucide-react'
import { Message } from '@/components/messages/Message'
import { MessageList } from '@/components/messages/MessageList'
import { MessageInput } from '@/components/messages/MessageInput'
import type { Message as MessageType } from '@/types/database'

interface ThreadPanelProps {
  message: MessageType
  channelId: string
  currentUserId: string
  onClose: () => void
}

export function ThreadPanel({ message, channelId, currentUserId, onClose }: ThreadPanelProps) {
  return (
    <div className="flex flex-col h-full border-l border-[#E5E7EB] bg-[#F8F9FA] w-[320px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-[#E5E7EB] flex-shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <CornerUpRight size={14} className="text-[#6B7280]" />
          <h2 className="text-sm font-semibold text-[#111827]">Thread</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#F3F4F6] text-[#6B7280] hover:text-[#111827] transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Root message */}
      <div className="px-0 py-2 border-b border-[#E5E7EB] bg-white">
        <Message
          message={message}
          channelId={channelId}
          currentUserId={currentUserId}
          showHeader={true}
        />
      </div>

      <div className="text-xs font-medium text-[#6B7280] px-4 py-2 border-b border-[#E5E7EB]">
        {(message.reply_count ?? 0)} {message.reply_count === 1 ? 'reply' : 'replies'}
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <MessageList
          channelId={channelId}
          currentUserId={currentUserId}
          parentId={message.id}
        />
      </div>

      {/* Reply input */}
      <MessageInput
        channelId={channelId}
        parentId={message.id}
        placeholder="Reply..."
      />
    </div>
  )
}
