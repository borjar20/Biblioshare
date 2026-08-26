import { FeedCardSkeleton } from "@/components/social/feed-skeleton";
import { LoadingAnnounce } from "@/components/ui/loading-announce";
import { SHELL_POST } from "@/lib/ui/layout";

// Boundary de /post/[id] (#476): el post entero es una lectura filtrada por
// RLS (regla #437, no cacheable), así que el shell estático es la columna de
// conversación con tarjetas fantasma. Mismo contenedor que la página.
export default function Loading() {
  return (
    <div className={`mx-auto w-full ${SHELL_POST} flex-1 px-5 pt-[18px] pb-[22px] lg:px-7 lg:pt-[26px]`}>
      <LoadingAnnounce />
      <div className="post-grid pb-28 min-[1023px]:pb-0">
        <div data-area="conversacion" className="flex min-w-0 flex-col gap-4">
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </div>
      </div>
    </div>
  );
}
