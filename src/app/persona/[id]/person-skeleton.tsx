import { Skeleton, SkeletonCover, SkeletonLine } from "@/components/ui/skeleton";

// Las áreas de la ficha en esqueleto. Lo comparten el `fallback` del <Suspense>
// de `page.tsx` y `loading.tsx`: duplicarlo era garantía de que divergieran, y
// entonces la página SALTA al llegar los datos (CLS).
//
// Devuelve las áreas SUELTAS, sin envoltorio: quien lo usa ya está dentro de
// `.person-grid`.
export function PersonSkeleton() {
  return (
    <>
      <div data-area="ficha">
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-[18px]">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="h-7 w-3/4" />
          <SkeletonLine className="w-1/2" />
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-2/3" />
        </div>
      </div>

      <div data-area="obras" className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCover key={i} />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[61px] w-full" />
          ))}
        </div>
      </div>
    </>
  );
}
