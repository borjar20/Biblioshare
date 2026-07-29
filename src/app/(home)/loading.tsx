import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";
import { FeedListSkeleton } from "@/components/social/feed-skeleton";
import { TodayBlockSkeleton } from "@/components/stats/today-skeleton";

// Skeleton del Inicio (feed).
//
// Espeja la estructura de `page.tsx`, contenedor incluido: mismo `max-w`, mismo
// padding y mismo reparto en dos columnas de escritorio. Antes usaba un
// envoltorio propio (`gap-6 px-4 py-8`) y se saltaba el bloque de hoy, así que
// al llegar la página de verdad TODO se recolocaba — parte del 0.51 de CLS del
// issue #284. Si cambia el envoltorio de `page.tsx`, cambia este.
//
// Solo cubre el Inicio: vive dentro del grupo `(home)`, que únicamente contiene
// `page.tsx`. (Dejó de ser el fallback genérico de la app cuando se movió aquí;
// no hay `src/app/loading.tsx`.)
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pt-[18px] pb-[22px] lg:max-w-[1080px] lg:px-7 lg:pt-[26px]">
      <LoadingAnnounce />

      {/* Saludo de escritorio (frame B). En móvil no existe. */}
      <div className="hidden pb-2.5 lg:block">
        <Skeleton className="h-[30px] w-72 max-w-full rounded-md" />
        <SkeletonLine className="mt-[5px] h-3 w-48" />
      </div>

      <TodayBlockSkeleton />

      <div className="pt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_312px] lg:items-start lg:gap-7">
        <div className="min-w-0">
          {/* "Novedades" + contador de seguidos: solo móvil. */}
          <div className="flex items-baseline justify-between gap-3 pb-4 lg:hidden">
            <Skeleton className="h-6 w-40 rounded-md" />
            <SkeletonLine className="h-2.5 w-16" />
          </div>

          {/* Rótulo de sección (escritorio) + chips de filtro. */}
          <div className="mb-4 flex items-baseline justify-between gap-4 lg:mb-3.5">
            <SkeletonLine className="hidden h-2.5 w-32 lg:block" />
            <div className="flex flex-wrap gap-2">
              {["w-14", "w-20", "w-16", "w-20", "w-16"].map((w) => (
                <Skeleton key={w} className={`h-7 rounded-chip ${w}`} />
              ))}
            </div>
          </div>

          <FeedListSkeleton count={4} />
        </div>

        <aside className="hidden lg:block" />
      </div>
    </div>
  );
}
