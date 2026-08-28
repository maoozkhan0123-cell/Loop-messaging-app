'use client'

import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn, getInitials, getAvatarColor } from '@/lib/utils'

interface AvatarProps {
  src?: string | null
  name: string
  size?: number
  className?: string
  status?: 'online' | 'away' | 'offline'
  square?: boolean
}

export function Avatar({ src, name, size = 36, className, status, square }: AvatarProps) {
  const statusColor = { online: '#36D7AE', away: '#F59E0B', offline: 'transparent' }
  const bg = getAvatarColor(name)
  const radius = square ? 6 : size / 2

  return (
    <div className={cn('relative inline-flex flex-shrink-0', className)} style={{ width: size, height: size }}>
      <AvatarPrimitive.Root
        className="flex items-center justify-center overflow-hidden text-white font-semibold select-none"
        style={{ width: size, height: size, borderRadius: radius, background: bg, fontSize: Math.round(size * 0.38) }}
      >
        {src && (
          <AvatarPrimitive.Image src={src} alt={name} className="w-full h-full object-cover" />
        )}
        <AvatarPrimitive.Fallback
          className="flex items-center justify-center w-full h-full"
          style={{ background: bg }}
          delayMs={0}
        >
          {getInitials(name)}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>

      {status && status !== 'offline' && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-2"
          style={{
            width: Math.max(8, size * 0.27),
            height: Math.max(8, size * 0.27),
            background: statusColor[status],
            borderColor: '#132A42',
          }}
        />
      )}
    </div>
  )
}
