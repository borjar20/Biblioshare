import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";

// Mismo alto que el bloque real: sin esto el contenido salta al llegar (#284).
export function HeroSkeleton() {
  return <div aria-hidden="true" className="h-[200px] bg-surface-muted lg:h-[250px]" />;
}
export function FiguresSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-4 gap-2">
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-md lg:h-[52px]" />)}
    </div>
  );
}
export function NowSkeleton() {
  return <Skeleton aria-hidden="true" className="h-[112px] rounded-card" />;
}
export function YearSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-card border border-border bg-surface p-4">
      <div className="flex h-[33px] items-center"><SkeletonLine className="w-24" /></div>
      <Skeleton className="mt-3 h-[70px] rounded-md" />
      <div className="mt-2 flex h-[19px] items-center"><SkeletonLine className="w-3/4" /></div>
    </div>
  );
}
