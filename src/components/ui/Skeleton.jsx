export default function Skeleton({ className = '', rounded = 'rounded-2xl' }) {
  return <div className={`skeleton ${rounded} ${className}`} />
}

export function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="w-full aspect-[4/5]" rounded="rounded-3xl" />
      <Skeleton className="h-4 w-2/3" rounded="rounded-lg" />
      <Skeleton className="h-3 w-1/3" rounded="rounded-lg" />
    </div>
  )
}

/**
 * Shared loading placeholders.
 *
 * These mirror the real row geometry (same sizes, same gaps) so content
 * doesn't jump when it swaps in — a skeleton that doesn't match its content
 * is worse than no skeleton.
 */

/** Chat/matches list row: avatar + two lines of text. */
export function ChatRowSkeleton() {
  return (
    <div className="flex items-center gap-3.5 p-2.5">
      <Skeleton className="w-[56px] h-[56px] shrink-0" rounded="rounded-full" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-3.5 w-1/3" rounded="rounded-lg" />
        <Skeleton className="h-3 w-2/3" rounded="rounded-lg" />
      </div>
    </div>
  )
}

/** Horizontal "new matches" rail item: ring-sized circle + name. */
export function StoryRingSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0 w-[70px]">
      <Skeleton className="w-[61px] h-[61px]" rounded="rounded-full" />
      <Skeleton className="h-2.5 w-11" rounded="rounded-lg" />
    </div>
  )
}

/** Explore's 3-up media grid. */
export function GridSkeleton({ count = 12 }) {
  return (
    <div className="grid grid-cols-3 gap-[3px] px-[3px] pb-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square" rounded="rounded-none" />
      ))}
    </div>
  )
}

/** People list row (Explore → People, followers lists). */
export function PersonRowSkeleton() {
  return (
    <div className="flex items-center gap-3.5 p-2.5">
      <Skeleton className="w-11 h-11 shrink-0" rounded="rounded-full" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-3.5 w-2/5" rounded="rounded-lg" />
        <Skeleton className="h-3 w-1/2" rounded="rounded-lg" />
      </div>
    </div>
  )
}

/** Repeats any skeleton n times with a consistent gap. */
export function SkeletonList({ children, count = 6, className = '' }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>{children}</div>
      ))}
    </div>
  )
}
