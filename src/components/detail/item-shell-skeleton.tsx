import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { SkeletonLine } from "@/components/ui/skeleton";
import { DETAIL_CONTAINER } from "./detail-container";
import { ItemTabsSkeleton } from "./item-tabs-skeleton";

// Espejo de ItemHero (misma rejilla y mismas alturas) para que al llegar la
// ficha no salte nada.
export function ItemShellSkeleton({ itemType }: { itemType: ItemType }) {
  const accent = MEDIA_ACCENT[itemType];

  return (
    <div className="w-full">
      <div className="relative">
        <div
          aria-hidden
          className={`absolute inset-x-0 top-0 h-[240px] sm:h-[280px] lg:h-[420px] ${accent.bgSoft}`}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/75 to-background" />
        </div>
        <div className={`relative ${DETAIL_CONTAINER} pt-3.5 pb-5 lg:pt-[190px] lg:pb-8`}>
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <SkeletonLine className="w-16" />
            <SkeletonLine className="w-20" />
            <span aria-hidden className="h-[34px] w-[34px] shrink-0" />
          </div>
          <div className="mt-[64px] grid grid-cols-[110px_minmax(0,1fr)] items-end gap-x-4 gap-y-4 sm:mt-[48px] sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-x-6 lg:mt-0 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-9 xl:grid-cols-[200px_minmax(0,1fr)_300px]">
            <div
              className={`h-[165px] w-[110px] animate-pulse rounded-[6px] border-2 ${accent.border} bg-surface-muted sm:h-[210px] sm:w-[140px] lg:h-[300px] lg:w-[200px]`}
            />
            <div className="min-w-0 pb-1">
              <SkeletonLine className="w-28" />
              <SkeletonLine className="mt-3 h-7 w-3/4" />
              <SkeletonLine className="mt-2 w-1/2" />
            </div>
            <div className="col-span-2 h-[120px] animate-pulse rounded-[14px] border border-border bg-surface-muted lg:col-span-1 lg:col-start-2 xl:col-start-3" />
          </div>
        </div>
      </div>
      <ItemTabsSkeleton />
    </div>
  );
}
