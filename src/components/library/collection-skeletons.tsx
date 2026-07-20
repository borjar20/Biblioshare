import {
  Skeleton,
  SkeletonLine,
  SkeletonCard,
} from "@/components/ui/skeleton";

// Skeleton del Resumen de la colección (tab `Todo`). Compartido entre
// `coleccion/loading.tsx` (fallback de página) y el fallback granular de
// `<Suspense>` del overview, para que ambos coincidan. Ya no incluye el
// bloque "Ahora mismo · En curso" — `ContinueStrip` salió de Colección
// (Colección v2, Sesión 1): vive en Inicio/Perfil, no aquí.
export function CollectionOverviewSkeleton() {
  return (
    <SkeletonCard className="flex flex-col gap-4">
      <SkeletonLine className="h-6 w-16" />
      <Skeleton className="h-2 w-full rounded-full" />
      <div className="flex gap-4">
        <SkeletonLine className="w-24" />
        <SkeletonLine className="w-24" />
      </div>
    </SkeletonCard>
  );
}

// Skeleton del grid de Colecciones (frame A, tab por defecto de Mi
// Biblioteca): tarjetas con abanico simulado + nombre + recuento.
export function CollectionsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3.5">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} className="flex flex-col gap-2.5 p-3">
          <Skeleton className="h-[98px] w-full rounded-[5px]" />
          <SkeletonLine className="w-2/3" />
          <SkeletonLine className="h-2.5 w-1/3" />
        </SkeletonCard>
      ))}
    </div>
  );
}

