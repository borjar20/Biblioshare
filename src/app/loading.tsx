import { Skeleton, SkeletonLine, LoadingAnnounce } from "@/components/ui/skeleton";
import { FeedListSkeleton } from "@/components/social/feed-skeleton";

// Skeleton del Inicio (feed). Vive en la raíz, así que además hace de fallback
// genérico para rutas sin `loading.tsx` propio; su forma neutra de tarjetas
// sobre papel encaja como estado de carga por defecto.
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

      <FeedListSkeleton count={3} />
    </div>
  );
}
