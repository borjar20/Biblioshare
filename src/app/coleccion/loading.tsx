import {
  SkeletonLine,
  SkeletonCoverGrid,
  LoadingAnnounce,
} from "@/components/ui/skeleton";
import { CollectionOverviewSkeleton } from "@/components/library/collection-skeletons";

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

      <CollectionOverviewSkeleton />

      <SkeletonCoverGrid count={9} />
    </div>
  );
}
