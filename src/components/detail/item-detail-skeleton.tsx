import {
  Skeleton,
  SkeletonLine,
} from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";

// Skeleton de la ficha de título (libro/película/serie). Imita el hero
// full-bleed (portada + título + byline + nota) y la fila de pestañas con un
// bloque de contenido, reservando las mismas dimensiones que `ItemHero` +
// `ItemDetailTabs` para que el paso a contenido real no salte.
export function ItemDetailSkeleton() {
  return (
    <div className="flex flex-col">
      <LoadingAnnounce />

      {/* Hero */}
      <div className="border-b border-border">
        <div className="mx-auto w-full max-w-4xl px-4 pt-6 pb-8 sm:px-6">
          <SkeletonLine className="w-16" />
          <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-end">
            <Skeleton className="aspect-[2/3] w-32 shrink-0 rounded-cover sm:w-40" />
            <div className="flex min-w-0 flex-1 flex-col gap-3 pb-1">
              <Skeleton className="h-5 w-24 rounded-chip" />
              <SkeletonLine className="h-8 w-3/4" />
              <SkeletonLine className="w-40" />
              <div className="flex items-center gap-3 pt-1">
                <Skeleton className="h-8 w-12 rounded-chip" />
                <SkeletonLine className="w-28" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ItemTabsSkeleton />
    </div>
  );
}

// Solo la fila de pestañas + un bloque de contenido. Es el fallback del
// <Suspense> que envuelve las pestañas en las fichas: el hero ya está pintado
// con los datos de la obra y solo falta que lleguen créditos, ediciones, pases…
export function ItemTabsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex gap-6 border-b border-border pb-3">
        <SkeletonLine className="w-14" />
        <SkeletonLine className="w-20" />
        <SkeletonLine className="w-16" />
      </div>
      <div className="mt-8 flex flex-col gap-3">
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-5/6" />
        <SkeletonLine className="w-2/3" />
      </div>
    </div>
  );
}
