import { Skeleton } from "@/components/ui/skeleton";
export function HomeSmallSkeleton({ stats = false }: { stats?: boolean }) {
  return <div aria-hidden><div className={`home-small-mobile-skeleton ${stats ? "stats" : ""}`} /><div className="home-loading-desktop"><Skeleton className={stats ? "h-64 w-full rounded-card" : "h-56 w-full rounded-card"} /></div></div>;
}
