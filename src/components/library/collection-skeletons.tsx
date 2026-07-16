import {
  Skeleton,
  SkeletonLine,
  SkeletonCard,
} from "@/components/ui/skeleton";

// Skeleton del bloque "Ahora mismo · En curso" + Resumen de la colección.
// Compartido entre `coleccion/loading.tsx` (fallback de página) y el fallback
// granular de `<Suspense>` del overview, para que ambos coincidan.
export function CollectionOverviewSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex gap-3 rounded-card border border-border bg-surface p-3 shadow-card"
          >
            <Skeleton className="h-24 w-16 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2 py-1">
              <SkeletonLine className="w-16" />
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="mt-auto w-full" />
            </div>
          </div>
        ))}
      </div>
      <SkeletonCard className="flex flex-col gap-4">
        <SkeletonLine className="h-6 w-16" />
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="flex gap-4">
          <SkeletonLine className="w-24" />
          <SkeletonLine className="w-24" />
        </div>
      </SkeletonCard>
    </>
  );
}

// Skeleton del panel de colas: unas filas arrastrables con portada.
export function QueuesSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-card"
        >
          <Skeleton className="h-16 w-11 shrink-0 rounded" />
          <div className="flex flex-1 flex-col gap-2">
            <SkeletonLine className="w-2/3" />
            <SkeletonLine className="w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
