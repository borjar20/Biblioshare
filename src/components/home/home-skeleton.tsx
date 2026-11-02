import { Skeleton } from "@/components/ui/skeleton";
export function HomeSmallSkeleton({ stats = false }: { stats?: boolean }) {
  // `home-small-skeleton`: bajo 1100 el CSS lo coloca en la fila de la semanal.
  return <div aria-hidden className={stats ? undefined : "home-small-skeleton"}><div className={`home-small-mobile-skeleton ${stats ? "stats" : ""}`} /><div className="home-loading-desktop"><Skeleton className={stats ? "h-64 w-full rounded-card" : "h-56 w-full rounded-card"} /></div></div>;
}
