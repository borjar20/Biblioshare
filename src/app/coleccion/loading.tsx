import {
  Skeleton,
  SkeletonLine,
  SkeletonCard,
  SkeletonCoverGrid,
  LoadingAnnounce,
} from "@/components/ui/skeleton";

// Skeleton de /coleccion: h1 + pestañas de tipo + bloque "en curso" (tarjetas
// continuar) + resumen + rejilla. Misma envoltura que la página real.
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <LoadingAnnounce />
      <SkeletonLine className="h-7 w-40" />

      {/* Pestañas */}
      <div className="flex gap-6 border-b border-border pb-3">
        {["w-16", "w-14", "w-20", "w-14", "w-12"].map((w) => (
          <SkeletonLine key={w} className={w} />
        ))}
      </div>

      {/* En curso (2 tarjetas continuar) */}
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

      {/* Resumen */}
      <SkeletonCard className="flex flex-col gap-4">
        <SkeletonLine className="h-6 w-16" />
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="flex gap-4">
          <SkeletonLine className="w-24" />
          <SkeletonLine className="w-24" />
        </div>
      </SkeletonCard>

      <SkeletonCoverGrid count={9} />
    </div>
  );
}
