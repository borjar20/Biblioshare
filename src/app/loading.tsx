import {
  Skeleton,
  SkeletonLine,
  SkeletonAvatar,
  LoadingAnnounce,
} from "@/components/ui/skeleton";

// Skeleton del Inicio (feed). Vive en la raíz, así que además hace de fallback
// genérico para rutas sin `loading.tsx` propio; su forma neutra de tarjetas
// sobre papel encaja como estado de carga por defecto.
function FeedCardSkeleton() {
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

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <LoadingAnnounce />
      <div className="flex items-baseline justify-between gap-3">
        <SkeletonLine className="h-7 w-40" />
        <SkeletonLine className="w-16" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {["w-14", "w-20", "w-16", "w-20", "w-16"].map((w) => (
          <Skeleton key={w} className={`h-7 rounded-chip ${w}`} />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <FeedCardSkeleton />
        <FeedCardSkeleton />
        <FeedCardSkeleton />
      </div>
    </div>
  );
}
