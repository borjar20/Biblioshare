import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CuratedRouteRow } from "@/lib/sagas/get-saga-routes";
import { GenerateRouteButton } from "./generate-route-button";

/** Itinerarios de la saga. `getSagaRoutes` consulta `saga_routes`, que SOLO
 *  guarda las rutas CURADAS: las sintéticas (`lectura`/`publicacion`) no se
 *  materializan ahí (no se editan porque se calculan), así que `routes` ya
 *  llega sin ellas — no hace falta filtrar por `synthetic` como haría con el
 *  `SagaRoute[]` de `buildRouteList` (route-types.ts), que sí las incluye.
 *
 *  Sin recuento de pasos: ni `CuratedRouteRow` ni `SagaRoute` exponen uno, y
 *  calcularlo aquí exigiría una consulta extra a `saga_route_entries` por
 *  ruta que nadie ha pedido — nombre y enlace bastan (corrección al brief de
 *  la Task 9, ver informe). */
export async function SequenceItineraries({ sagaId, routes }: { sagaId: string; routes: CuratedRouteRow[] }) {
  const t = await getTranslations("sagaEditor");
  return (
    <section className="rounded-xl border border-border bg-surface p-3.5">
      <h3 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
        {t("itinerariesTitle")}
      </h3>
      {routes.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{t("itinerariesEmpty")}</p>
      ) : (
        <ul>
          {routes.map((r) => (
            <li key={r.slug} className="border-t border-border first:border-t-0">
              <Link href={`/saga/${sagaId}/rutas/${r.slug}/editar`} className="flex items-center gap-2.5 py-2 text-[12.5px]">
                <b className="min-w-0 flex-1 truncate font-semibold">{r.name}</b>
                <span aria-hidden className="text-foreground-faint">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex gap-2">
        <Link
          href={`/saga/${sagaId}/rutas`}
          className="flex-1 rounded-lg border border-border py-1.5 text-center text-[11.5px] font-semibold"
        >
          {t("itineraryCreate")}
        </Link>
        <div className="flex-1">
          <GenerateRouteButton sagaId={sagaId} />
        </div>
      </div>
    </section>
  );
}
