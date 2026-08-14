import {
  Skeleton,
  SkeletonLine,
  SkeletonCard,
} from "@/components/ui/skeleton";
import { CARD_GRID_COLS, TILE_GRID_COLS } from "@/lib/ui/layout";

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

// Skeleton del grid de Colecciones (frame A): barra de búsqueda/orden y
// tarjetas con abanico simulado + nombre + recuento + desglose por tipo.
//
// Las alturas del abanico y la escalera de columnas tienen que ser LAS MISMAS
// que en `CollectionCard`/`CollectionsBrowser`, o al llegar los datos la
// rejilla salta (es el defecto que cerró la PR #372, esqueleto y contenido con
// rejillas distintas). Por eso `TILE_GRID_COLS` sale de la misma constante.
export function CollectionsGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <Skeleton className="h-9 w-full rounded-full sm:max-w-sm" />
        <Skeleton className="h-6 w-56 rounded-md" />
      </div>
      <div className={`grid gap-4 ${TILE_GRID_COLS}`}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} className="flex flex-col gap-3">
            <Skeleton className="h-[112px] w-full rounded-[5px] sm:h-[150px] lg:h-[168px]" />
            <div className="flex flex-col gap-1.5">
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="h-2.5 w-1/3" />
              <SkeletonLine className="h-2.5 w-1/2" />
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

// Skeleton de la pestaña `Sagas`. Antes su hueco lo tapaba un
// `SkeletonCoverGrid`: una rejilla de PORTADAS verticales donde luego llegaban
// tarjetas horizontales de saga, así que la página se recomponía entera al
// cargar. La silueta de aquí es la de `SagaLibraryCard` — mini-abanico a la
// izquierda, dos líneas de texto, barra de progreso y bloque «siguiente».
export function SagasPanelSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-4 ${CARD_GRID_COLS}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Skeleton className="h-[76px] w-[72px] shrink-0 rounded-[5px]" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SkeletonLine className="w-3/4" />
              <SkeletonLine className="h-2.5 w-1/2" />
              <SkeletonLine className="h-2.5 w-2/3" />
            </div>
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </SkeletonCard>
      ))}
    </div>
  );
}

