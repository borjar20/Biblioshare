import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getPlannedItems } from "@/lib/library/get-planned-items";
import { DRAW_HREF } from "@/lib/rincon/draw-href";
import { PullSpineIcon } from "@/components/ui/icons";

// «Sacar un lomo» como tarjeta propia de la rejilla móvil del Inicio (<1100).
// Bajo 1100 «Para más tarde» vive dentro del panel plegado de lo que disfrutas
// y su enlace al Sorteo quedaba a dos gestos; aquí está a la vista. En
// escritorio no se pinta: la estantería ya está abierta y lleva el enlace.
// Sin pendientes no hay nada que sortear, así que no aparece.
export async function HomeDrawTile({ userId }: { userId: string }) {
  const planned = await getPlannedItems(userId);
  if (planned.length === 0) return null;
  const t = await getTranslations("homePanels");
  return (
    <Link href={DRAW_HREF} className="home-draw-tile">
      <span className="home-preview-name">{t("draw")}</span>
      <span className="home-draw-tile-body">
        <PullSpineIcon aria-hidden className="h-6 w-6 shrink-0 text-accent-ink" />
        <span className="home-preview-meta">{t("drawMeta", { count: planned.length })}</span>
      </span>
    </Link>
  );
}
