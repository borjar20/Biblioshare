import { getTranslations } from "next-intl/server";
import { getPlannedItems } from "@/lib/library/get-planned-items";
import { PullSpineIcon } from "@/components/ui/icons";
import { RouteMessages } from "@/components/route-messages";
import { SorteoTrigger } from "@/components/rincon/sorteo-trigger";

// «Sacar un lomo» como tarjeta propia de la rejilla móvil del Inicio (<1100).
// Abre la partida en el sitio (spec 2026-11-06): al terminar sigues en el Inicio.
// Sin pendientes no hay nada que sortear, así que no aparece.
export async function HomeDrawTile({ userId }: { userId: string }) {
  const planned = await getPlannedItems(userId);
  if (planned.length === 0) return null;
  const t = await getTranslations("homePanels");
  return (
    <RouteMessages ns={["sorteo"]}>
      <SorteoTrigger className="home-draw-tile">
        <span className="home-preview-name">{t("draw")}</span>
        <span className="home-draw-tile-body">
          <PullSpineIcon aria-hidden className="h-6 w-6 shrink-0 text-accent-ink" />
          <span className="home-preview-meta">{t("drawMeta", { count: planned.length })}</span>
        </span>
      </SorteoTrigger>
    </RouteMessages>
  );
}
