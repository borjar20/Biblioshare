import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";

// Boundary de /sesion/[passId] (#476): la hoja de registrar sesión cuelga del
// pase (sesión + RLS), así que el shell estático es un fantasma de la hoja en
// la misma columna max-w-lg que la página.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      <LoadingAnnounce />
      <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card">
        <SkeletonLine className="h-4 w-40" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}
