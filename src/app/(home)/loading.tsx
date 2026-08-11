import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";
import { FeedListSkeleton } from "@/components/social/feed-skeleton";
import { TodayBlockSkeleton } from "@/components/stats/today-skeleton";
import { SHELL_HOME } from "@/lib/ui/layout";

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
    <div className={`mx-auto flex w-full ${SHELL_HOME} flex-1 flex-col px-5 pt-[18px] pb-[22px] lg:px-7 lg:pt-[26px]`}>
      <LoadingAnnounce />

      {/* Saludo a ancho completo (fantasma del <h1> real), a todos los tamaños. */}
      <div className="pb-3.5 md:pb-4">
        <Skeleton className="h-6 w-56 max-w-full rounded-md md:h-[30px] md:w-72" />
        <SkeletonLine className="mt-1 h-3 w-40 md:mt-[5px] md:w-48" />
      </div>

      <div className="home-grid">
        {/* PERSONAL */}
        <div data-area="personal">
          <TodayBlockSkeleton />
        </div>

        {/* FEED: compositor + rótulo de sección + chips de filtro + lista. */}
        <div data-area="feed">
          {/* Fantasma del disparador de «Pensamiento» (fila propia, ~44px):
              lo pinta el shell de la página, no un <Suspense>, así que sin
              reservarlo aparecería de golpe al reemplazar este loading. */}
          <div className="pb-3.5">
            <Skeleton className="h-11 w-full rounded-card" />
          </div>

          <div className="mb-4 flex items-baseline justify-between gap-4 lg:mb-3.5">
            <SkeletonLine className="h-2.5 w-32" />
            <div className="flex flex-wrap gap-2">
              {/* key por índice: lista estática sin reordenación, y los anchos
                  se repiten (w-20/w-16), así que el valor no sirve de key (#337). */}
              {["w-14", "w-20", "w-16", "w-20", "w-16"].map((w, i) => (
                <Skeleton key={i} className={`h-7 rounded-chip ${w}`} />
              ))}
            </div>
          </div>

          <FeedListSkeleton count={4} />
        </div>

        {/* STATS: vacío — StatsRail real llega tras su <Suspense fallback={null}>. */}
        <aside data-area="stats" />
      </div>
    </div>
  );
}
