import {
  Skeleton,
  SkeletonLine,
  SkeletonCard,
} from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";

// Skeleton de /club/[slug]: banner + nombre/meta + pestañas + un par de
// tarjetas de contenido (resumen/feed).
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <LoadingAnnounce />

      {/* Banner + cabecera */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[120px] w-full rounded-card" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <SkeletonLine className="h-6 w-2/5" />
            <SkeletonLine className="w-1/3" />
          </div>
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <SkeletonLine className="w-4/5" />
      </div>

      {/* Pestañas */}
      <div className="flex gap-6 border-b border-border pb-3">
        <SkeletonLine className="w-14" />
        <SkeletonLine className="w-24" />
        <SkeletonLine className="w-16" />
      </div>

      {/* Contenido */}
      <SkeletonCard>
        <SkeletonLine className="mb-3 w-32" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonLine className="mb-3 w-24" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="mt-2 w-3/4" />
      </SkeletonCard>
    </div>
  );
}
