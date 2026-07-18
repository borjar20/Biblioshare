import { SkeletonLine } from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";
import { CollectionsGridSkeleton } from "@/components/library/collection-skeletons";

// Skeleton de /coleccion: h1 + subpestañas (Colecciones · Todo) + cabecera de
// recuento + rejilla de colecciones — el tab por defecto (Colección v2,
// Sesión 1). Misma envoltura que la página real.
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <LoadingAnnounce />
      <SkeletonLine className="h-7 w-40" />

      {/* Subpestañas */}
      <div className="flex gap-6 border-b border-border pb-3">
        {["w-24", "w-14"].map((w) => (
          <SkeletonLine key={w} className={w} />
        ))}
      </div>

      <SkeletonLine className="h-3 w-40" />

      <CollectionsGridSkeleton />
    </div>
  );
}
