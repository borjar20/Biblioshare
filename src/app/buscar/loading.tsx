import {
  Skeleton,
  SkeletonLine,
  SkeletonCoverGrid,
  LoadingAnnounce,
} from "@/components/ui/skeleton";

// Skeleton de /buscar: h1 + conmutador Títulos/Personas + píldoras de tipo +
// barra de búsqueda + rejilla de resultados.
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
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

      <SkeletonCoverGrid count={10} />
    </div>
  );
}
