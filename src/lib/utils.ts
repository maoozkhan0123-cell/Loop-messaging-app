import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, isToday, isYesterday } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr)
  if (isToday(date)) {
    return `Today at ${format(date, 'h:mm a')}`
  }
  if (isYesterday(date)) {
    return `Yesterday at ${format(date, 'h:mm a')}`
  }
  return format(date, 'MMM d at h:mm a')
}

export function formatShortTime(dateStr: string): string {
  const date = new Date(dateStr)
  return format(date, 'h:mm a')
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function groupReactions(reactions: Array<{ emoji: string; user_id: string }>) {
  const map = new Map<string, string[]>()
  for (const r of reactions) {
    if (!map.has(r.emoji)) map.set(r.emoji, [])
    map.get(r.emoji)!.push(r.user_id)
  }
  return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds, count: userIds.length }))
}

export function isImageMime(mimeType: string | null): boolean {
  if (!mimeType) return false
  return mimeType.startsWith('image/')
}

const AVATAR_COLORS = [
  '#3589FA', // Loop blue
  '#36D7AE', // Loop teal
  '#132A42', // Loop navy
  '#7C5CFC', // violet
  '#E67E22', // orange
  '#E74C3C', // coral red
  '#F59E0B', // amber
  '#10B981', // emerald
  '#6366F1', // indigo
  '#EC4899', // pink
  '#0891B2', // cyan
  '#8B5CF6', // purple
]

export function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

export function formatDateDivider(dateStr: string): string {
  const date = new Date(dateStr)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMMM d, yyyy')
}
