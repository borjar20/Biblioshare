import { SHELL_APP } from "@/lib/ui/layout";
import { StatsWallSkeleton } from "@/components/stats/stats-wall-skeleton";

// Esqueleto de la página de estadísticas completas mientras cargan las
// consultas del muro. La ruta redirige (no hace notFound()), así que loading.tsx
// es válido aquí (regla del plan 00). El muro comparte skeleton con el <Suspense>
// de la página (StatsWallSkeleton) para que no se desincronicen.
export default function Loading() {
  return (
    <div className={`mx-auto w-full ${SHELL_APP} px-4 py-4 pb-24 sm:px-6 lg:px-8`}>
      <header className="mb-4 flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-6 w-32 animate-pulse rounded bg-surface-muted" />
      </header>
      <div className="mb-4 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-16 animate-pulse rounded-full bg-surface-muted" />
        ))}
      </div>
      <StatsWallSkeleton />
    </div>
  );
}
