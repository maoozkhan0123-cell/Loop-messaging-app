'use client'

import Link from 'next/link'
import { Hash, Lock } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import type { ChannelWithMember } from '@/types/database'

interface ChannelItemProps {
  channel: ChannelWithMember
  isActive: boolean
  href: string
  isDM?: boolean
}

export function ChannelItem({ channel, isActive, href, isDM }: ChannelItemProps) {
  const unread = (channel.unread_count ?? 0) > 0
  const other = channel.other_member as { display_name: string; avatar_url: string | null; status?: 'online' | 'away' | 'offline' } | undefined

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-1.5 px-2.5 h-7.5 rounded-lg text-xs transition-all select-none group',
        isActive
          ? 'bg-white text-black font-bold shadow-xs'
          : unread
          ? 'text-white font-bold hover:bg-white/10'
          : 'text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
      )}
    >
      {isDM ? (
        <Avatar
          src={other?.avatar_url}
          name={other?.display_name ?? 'Unknown'}
          size={18}
          status={other?.status}
          className="flex-shrink-0"
        />
      ) : channel.type === 'private' ? (
        <Lock size={13} className="flex-shrink-0 opacity-70" />
      ) : (
        <Hash size={13} className="flex-shrink-0 opacity-70" />
      )}

      <span className={cn('truncate flex-1', unread && !isActive && 'font-semibold')}>
        {isDM ? other?.display_name ?? 'Unknown' : channel.name}
      </span>

      {unread && !isActive && (
        <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-white text-black text-[10px] font-bold">
          {(channel.unread_count ?? 0) > 99 ? '99+' : channel.unread_count}
        </span>
      )}
    </Link>
  )
}
