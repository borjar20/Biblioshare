import {
  Skeleton,
  SkeletonLine,
  SkeletonAvatar,
  SkeletonCard,
} from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";

// Skeleton del perfil: cabecera (avatar + nombre + counts + chips) + subtabs +
// un par de tarjetas de panel. Misma envoltura que la página real.
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <LoadingAnnounce />

      {/* Cabecera */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-4">
          <SkeletonAvatar className="size-[60px]" />
          <div className="flex flex-1 flex-col gap-2">
            <SkeletonLine className="h-6 w-40" />
            <SkeletonLine className="w-24" />
          </div>
        </div>
        <div className="flex gap-4">
          <SkeletonLine className="w-24" />
          <SkeletonLine className="w-24" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["w-20", "w-16", "w-24", "w-20"].map((w) => (
            <Skeleton key={w} className={`h-6 rounded-full ${w}`} />
          ))}
        </div>
      </div>

      {/* Subtabs */}
      <div className="flex gap-6 border-b border-border pb-3">
        <SkeletonLine className="w-16" />
        <SkeletonLine className="w-20" />
        <SkeletonLine className="w-16" />
      </div>

      {/* Contenido (tarjetas de panel/actividad) */}
      <SkeletonCard>
        <SkeletonLine className="mb-4 w-32" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </SkeletonCard>
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonCard>
          <SkeletonLine className="mb-3 w-16" />
          <SkeletonLine className="h-8 w-12" />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonLine className="mb-3 w-20" />
          <SkeletonLine className="h-8 w-12" />
        </SkeletonCard>
      </div>
    </div>
  );
}
