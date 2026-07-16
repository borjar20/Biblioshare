import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";
import { ClubCardSkeleton } from "@/components/clubs/club-skeletons";

// Skeleton de /clubes: h1 + buscador + eyebrow de sección + tarjetas de club
// (banda de portada + cuerpo). Misma envoltura que la página real.
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <LoadingAnnounce />
      <div className="flex items-center justify-between">
        <SkeletonLine className="h-7 w-28" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />

      <div className="flex flex-col gap-3">
        <SkeletonLine className="w-24" />
        <ClubCardSkeleton />
        <ClubCardSkeleton />
      </div>
      <div className="flex flex-col gap-3">
        <SkeletonLine className="w-24" />
        <ClubCardSkeleton />
      </div>
    </div>
  );
}
