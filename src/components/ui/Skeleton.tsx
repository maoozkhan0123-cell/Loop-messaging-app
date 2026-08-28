import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded bg-[#F3F4F6]', className)} />
  )
}

export function MessageSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <Skeleton className="w-9 h-9 rounded flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}

export function ChannelSkeleton() {
  return (
    <div className="flex items-center gap-2 px-3 py-1 h-7">
      <Skeleton className="h-3 w-3 rounded-sm" />
      <Skeleton className="h-3 w-28" />
    </div>
  )
}
