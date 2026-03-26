// Shared loading skeletons for all pages

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#1a1a1d] rounded ${className}`} />;
}

export function PageLoading({ title }: { title?: string }) {
  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header skeleton */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Skeleton className="w-20 h-4" />
          <Skeleton className="w-32 h-6 rounded-lg" />
        </div>
        <Skeleton className="w-24 h-6 rounded-lg" />
      </div>
      {/* Content skeleton */}
      <div className="flex gap-3 flex-1 min-h-0">
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </div>
      {title && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            <span className="text-[11px] text-gray-500">{title}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="w-1/3 h-3" />
              <Skeleton className="w-2/3 h-2.5" />
              <Skeleton className="w-1/2 h-2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ cols = 3, count = 6 }: { cols?: number; count?: number }) {
  return (
    <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-lg" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#1e1e21] flex gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="flex-1 h-3" />)}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3 border-b border-[#0a0a0b] flex gap-4">
          {[1, 2, 3, 4].map(j => <Skeleton key={j} className="flex-1 h-2.5" />)}
        </div>
      ))}
    </div>
  );
}

export function SpinnerInline() {
  return <span className="w-3.5 h-3.5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin inline-block" />;
}
