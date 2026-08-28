import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { LoadMore } from "@/components/ui/load-more";
import { CARD_GRID_COLS } from "@/lib/ui/layout";

// Pie del índice de sagas. La mecánica (scroll conservado, pendiente, clic con
// modificador) vive en `LoadMore`; aquí solo queda el dibujo de las tarjetas
// fantasma, que es lo único propio de una tarjeta de saga.
export function SagaLoadMore({
  href,
  label,
  showingLabel,
  skeletonCount,
}: {
  href: string;
  label: string;
  showingLabel: string;
  /** Cuántas tarjetas fantasma pintar: lo que de verdad falta por traer. */
  skeletonCount: number;
}) {
  return (
    <LoadMore
      href={href}
      label={label}
      showingLabel={showingLabel}
      pendingPreview={
        skeletonCount > 0 ? (
          <div className={`mt-2.5 grid gap-2.5 ${CARD_GRID_COLS}`}>
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
                <Skeleton className="h-[78px] w-[52px] shrink-0 rounded-md" />
                <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                  <SkeletonLine className="w-2/3" />
                  <SkeletonLine className="h-2.5 w-1/2" />
                  <SkeletonLine className="h-2.5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : null
      }
    />
  );
}
