import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { SkeletonLine } from "@/components/ui/skeleton";
import {
  POSTER_AREA,
  POSTER_BAR,
  POSTER_GRADIENT,
  POSTER_HEADER,
  POSTER_LAYOUT,
} from "./detail-container";
import { ItemTabsSkeleton } from "./item-tabs-skeleton";

// Espejo de ItemShell (misma geometría, compartida en detail-container) para que
// al llegar la ficha no salte nada. Sin tono de obra: usa los tokens de la app.
export function ItemShellSkeleton({ itemType }: { itemType: ItemType }) {
  const accent = MEDIA_ACCENT[itemType];

  return (
    <div className={`w-full flex-1 ${POSTER_LAYOUT}`}>
      <div className={POSTER_AREA}>
        <div aria-hidden className={`absolute inset-0 ${accent.bgSoft}`} />
        <div aria-hidden className={POSTER_GRADIENT} />
        <div className={POSTER_BAR}>
          <SkeletonLine className="w-16" />
          <SkeletonLine className="w-20" />
          <span aria-hidden className="h-[34px] w-[34px] shrink-0" />
        </div>
      </div>
      <div className="relative min-w-0">
        <div className={POSTER_HEADER}>
          <SkeletonLine className="w-28" />
          <SkeletonLine className="mt-3 h-[62px] w-3/4 xl:h-[85px]" />
          <SkeletonLine className="mt-2 w-1/2" />
          <div className="mt-4 h-[120px] max-w-[420px] animate-pulse rounded-[14px] border border-border bg-surface-muted" />
        </div>
        <ItemTabsSkeleton />
      </div>
    </div>
  );
}
