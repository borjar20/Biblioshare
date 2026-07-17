import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";

// Tarjeta de club fantasma: banda de portada + cuerpo (nombre, descripción,
// miembros). Reserva las dimensiones reales de `ClubCard`. Componente puro (sin
// i18n ni "use client"): lo usan tanto `clubes/loading.tsx` (server) como la
// página `/clubes` (client) mientras resuelven sus fetches.
export function ClubCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <Skeleton className="h-[74px] w-full rounded-none" />
      <div className="flex flex-col gap-2 px-4 py-3">
        <SkeletonLine className="w-2/5" />
        <SkeletonLine className="w-4/5" />
        <SkeletonLine className="w-1/3" />
      </div>
    </div>
  );
}

// Lista de tarjetas de club fantasma.
export function ClubListSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <ClubCardSkeleton key={i} />
      ))}
    </div>
  );
}
