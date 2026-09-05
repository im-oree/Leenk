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
