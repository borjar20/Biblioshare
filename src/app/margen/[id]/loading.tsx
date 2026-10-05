import { FeedCardSkeleton } from "@/components/social/feed-skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";
import { SHELL_READ } from "@/lib/ui/layout";

// Boundary de /margen/[id]: lectura filtrada por RLS (regla #437, no cacheable),
// así que el shell estático es una tarjeta fantasma con el mismo contenedor.
export default function Loading() {
  return (
    <div className={`mx-auto flex w-full ${SHELL_READ} flex-1 flex-col gap-4 px-5 pt-[18px] pb-[22px] lg:px-7 lg:pt-[26px]`}>
      <LoadingAnnounce />
      <FeedCardSkeleton />
    </div>
  );
}
