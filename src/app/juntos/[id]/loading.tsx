import { FeedCardSkeleton } from "@/components/social/feed-skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";
import { SHELL_READ } from "@/lib/ui/layout";

// Boundary de /juntos/[id] (#1220): la página es una lectura filtrada por RLS
// (regla #437, no cacheable), así que el shell estático es una tarjeta fantasma.
// Mismo contenedor que la página. Sin él, Cache Components rechaza el build
// (`blocking-prerender-dynamic`), igual que en /post/[id] (#476).
export default function Loading() {
  return (
    <div className={`mx-auto w-full ${SHELL_READ} flex-1 px-5 pt-[18px] pb-[22px] lg:px-7 lg:pt-[26px]`}>
      <LoadingAnnounce />
      <FeedCardSkeleton />
    </div>
  );
}
