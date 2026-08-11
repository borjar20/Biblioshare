import {
  Skeleton,
  SkeletonLine,
  SkeletonCoverGrid,
} from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";
import { COVER_GRID_COLS, SHELL_GRID } from "@/lib/ui/layout";

// Skeleton de /buscar: h1 + conmutador Títulos/Personas + píldoras de tipo +
// barra de búsqueda + rejilla de resultados.
export default function Loading() {
  return (
    <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <LoadingAnnounce />
      <SkeletonLine className="h-7 w-32" />

      {/* Conmutador de modo */}
      <div className="flex gap-6 border-b border-border pb-3">
        <SkeletonLine className="w-16" />
        <SkeletonLine className="w-20" />
      </div>

      {/* Píldoras de tipo */}
      <div className="flex gap-2">
        {["w-20", "w-24", "w-16"].map((w) => (
          <Skeleton key={w} className={`h-9 rounded-full ${w}`} />
        ))}
      </div>

      {/* Barra de búsqueda */}
      <Skeleton className="h-11 w-full rounded-lg" />

      <SkeletonCoverGrid count={16} cols={COVER_GRID_COLS} />
    </div>
  );
}
