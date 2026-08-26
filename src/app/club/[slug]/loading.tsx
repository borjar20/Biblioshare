import { Skeleton, SkeletonCard, SkeletonLine } from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";

// Boundary del segmento /club/[slug] y sus subrutas (#476): todo el interior
// de un club cuelga de la sesión y de la fila del club (RLS), así que el shell
// estático es este fantasma genérico — cabecera del club + pestañas + un par
// de tarjetas. Sirve también a miembros/calendario/evento/actividad: es
// transitorio y genérico a propósito.
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <LoadingAnnounce />
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-48 rounded-md" />
          <SkeletonLine className="h-3 w-32" />
        </div>
      </div>
      <div className="flex gap-6 border-b border-border pb-3">
        <SkeletonLine className="w-14" />
        <SkeletonLine className="w-20" />
        <SkeletonLine className="w-16" />
      </div>
      <div className="flex flex-col gap-4">
        <SkeletonCard>
          <SkeletonLine className="mb-3 w-32" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonLine className="mb-3 w-24" />
          <SkeletonLine className="w-full" />
          <SkeletonLine className="mt-2 w-3/4" />
        </SkeletonCard>
      </div>
    </div>
  );
}
