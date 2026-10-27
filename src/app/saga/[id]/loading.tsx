import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";
import { DETAIL_CONTAINER } from "@/components/detail/detail-container";

// Boundary del segmento /saga/[id] y sus subrutas (#476): la ficha de saga
// cuelga entera de la fila (getSagaDetail), así que el shell estático es este
// fantasma con la forma nueva: hero cinemático + balda de pilas y portadas +
// tarjeta «Te toca».
export default function Loading() {
  return (
    <div className="flex w-full flex-col gap-8 pb-12">
      <LoadingAnnounce />
      <Skeleton className="h-[300px] w-full rounded-none" />
      <div className={`${DETAIL_CONTAINER} flex flex-col gap-8`}>
        <div className="flex gap-3 overflow-hidden">
          <Skeleton className="h-40 w-28 shrink-0 rounded-lg" />
          <Skeleton className="h-40 w-28 shrink-0 rounded-lg" />
          <Skeleton className="h-40 w-28 shrink-0 rounded-lg" />
          <Skeleton className="h-40 w-28 shrink-0 rounded-lg" />
          <Skeleton className="h-40 w-28 shrink-0 rounded-lg" />
        </div>
        <div className="flex flex-col gap-2">
          <SkeletonLine className="h-3 w-24" />
          <Skeleton className="h-28 w-full rounded-card" />
        </div>
      </div>
    </div>
  );
}
