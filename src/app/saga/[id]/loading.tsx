import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";

// Boundary del segmento /saga/[id] y sus subrutas (#476): la ficha de saga
// cuelga entera de la fila (getSagaDetail), así que el shell estático es este
// fantasma — hero (portada ancha + título) + pestañas + bloque de contenido.
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <LoadingAnnounce />
      <div className="flex items-start gap-4">
        <Skeleton className="h-32 w-24 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-7 w-64 max-w-full rounded-md" />
          <SkeletonLine className="h-3 w-40" />
          <SkeletonLine className="mt-2 h-3 w-full" />
          <SkeletonLine className="h-3 w-5/6" />
        </div>
      </div>
      <div className="flex gap-6 border-b border-border pb-3">
        <SkeletonLine className="w-16" />
        <SkeletonLine className="w-16" />
      </div>
      <Skeleton className="h-64 w-full rounded-card" />
    </div>
  );
}
