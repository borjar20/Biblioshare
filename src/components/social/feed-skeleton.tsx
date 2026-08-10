import {
  Skeleton,
  SkeletonLine,
  SkeletonAvatar,
} from "@/components/ui/skeleton";

// Una tarjeta de feed fantasma: cabecera (avatar + autor + tiempo) + ítem
// (portada + líneas). Reserva las mismas dimensiones que `FeedCard`.
export function FeedCardSkeleton() {
  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <SkeletonAvatar />
        <SkeletonLine className="w-40" />
        <SkeletonLine className="ml-auto w-8" />
      </div>
      <div className="flex items-start gap-3">
        <Skeleton className="h-[78px] w-[52px] shrink-0 rounded" />
        <div className="flex flex-1 flex-col gap-2">
          <SkeletonLine className="w-3/4" />
          <SkeletonLine className="w-1/3" />
          <SkeletonLine className="mt-1 w-full" />
          <SkeletonLine className="w-5/6" />
        </div>
      </div>
    </article>
  );
}

// Lista de feed fantasma. Fallback de `<Suspense>` del feed y del loading.tsx.
export function FeedListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <FeedCardSkeleton key={i} />
      ))}
    </div>
  );
}
