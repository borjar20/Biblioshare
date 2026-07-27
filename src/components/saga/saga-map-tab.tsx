import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { deriveSagaMap, type MapLookup } from "@/lib/sagas/derive-map";
import { deriveTimeline, sortByPublication } from "@/lib/sagas/derive-timeline";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { getRouteEntries } from "@/lib/sagas/get-saga-routes";
import { keyOfRouteEntry } from "@/lib/sagas/hydrate-route-draft";
import type { SagaGraph } from "@/lib/sagas/map-types";
import { sagaHref } from "@/lib/catalog/item-href";
import { createClient } from "@/lib/supabase/server";
import { GraphLegend } from "./graph/graph-legend";
import { SagaGraphLazy } from "./graph/saga-graph-lazy";
import { MapCta } from "./map-cta";
import { ReadingTimeline } from "./reading-timeline";
import { RoleChip } from "./role-chip";
import { RouteSelector } from "./route-selector";
import { RouteView } from "./route-view";

// Pestaña «Mapa de lectura» (spec §2.4, frames B/E). Lectura = timeline (móvil)
// + grafo embebido (PC). Publicación = lista lineal por año (ambos). Cualquier
// otra ruta (curada) se delega a RouteView.
export async function SagaMapTab({
  detail,
  activeRoute,
  canEdit,
}: {
  detail: SagaDetail;
  activeRoute: string;
  canEdit?: boolean;
}) {
  const t = await getTranslations("saga");
  const graph = detail.graph;
  const base = sagaHref(detail.saga.id);
  const allMembers = detail.groups.flatMap((g) => g.members);

  // Ruta curada activa (Task 3, fase 3): el mismo mapa derivado, con el paso
  // del itinerario resaltado en cada nodo por el que pasa. `lectura` y
  // `publicacion` (las sintéticas) ya tienen su propia rama más abajo y
  // nunca llegan aquí. Sin mapa (graph === null) no hay nada que resaltar —
  // la pestaña sigue pintando solo la lista de RouteView, como siempre.
  let curatedGraph: SagaGraph | null = null;
  if (activeRoute !== "publicacion" && activeRoute !== "lectura" && graph) {
    const row = detail.routes.find((r) => r.slug === activeRoute);
    if (row?.id !== undefined) {
      const supabase = await createClient();
      const entries = await getRouteEntries(supabase, row.id);
      const routeKeys = entries.map(keyOfRouteEntry);
      // Mismos lookups que construye getSagaDetail para el mapa completo,
      // reconstruidos aquí a partir de detail.groups: deriveSagaMap no exige
      // más que sagaId → accent/name, y no tocamos get-saga-detail.ts para
      // esto (fuera del alcance de la Task 3).
      const lookup: MapLookup = {
        groupAccent: new Map(detail.groups.map((g) => [g.sagaId, g.accent] as const)),
        groupName: new Map(detail.groups.map((g) => [g.sagaId, g.name] as const)),
      };
      curatedGraph = deriveSagaMap(detail.groups, detail.windows, lookup, routeKeys);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-10">
      <RouteSelector base={base} routes={detail.routes} active={activeRoute} />

      {activeRoute === "publicacion" ? (
        <ol className="divide-y divide-border border-t border-border">
          {sortByPublication(allMembers).map((m, i) => (
            <li key={`${m.itemType}-${m.itemId}`}>
              <Link href={m.href} className="flex items-center gap-3 py-2.5">
                <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded">
                  {m.coverUrl && <Image src={m.coverUrl} alt="" fill sizes="30px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{m.title}</span>
                  {m.year !== null && (
                    <span className="block font-mono text-[9px] text-muted-foreground">{m.year}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : activeRoute === "lectura" && graph ? (
        <>
          {/* Móvil: leyenda arriba, CTA al mapa completo y timeline. */}
          <div className="lg:hidden">
            <GraphLegend graph={graph} />
          </div>
          <div className="flex flex-col lg:hidden">
            <MapCta graph={graph} href={`${base}/mapa`} />
            <ReadingTimeline sections={deriveTimeline(graph)} />
            {/* «Como lista lineal» (frame B). Desde #167 ya no es solo la
                columna: incluye también los ítems sin orderNo, al final. */}
            <h3 className="mb-1 mt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {t("asLinearList")}
            </h3>
            <ol className="divide-y divide-border border-t border-border">
              {/* Issue #167: los nodos sin orderNo ya no se filtran. Antes
                  desaparecían de esta lista por completo — una precuela curada
                  simplemente no existía aquí.
                  Pero aparecer no puede significar "tengo un puesto": los
                  sueltos llevan un guion en vez de índice. Numerarlos de
                  corrido (i+1) en una lista titulada «orden de lectura» les
                  atribuiría un orden que nadie curó, y el chip de rol solo lo
                  desmentiría cuando ALGUIEN haya puesto el rol — en los sin
                  clasificar, que son la mitad del problema que ataca #167, no
                  quedaría nada que lo desmintiera.
                  Los numerados no se ven afectados: buildSagaGraph ordena por
                  orderNo con los nulls al final, así que van delante y
                  conservan el número que ya mostraban. */}
              {graph.nodes
                .filter((n) => n.kind === "item")
                .map((n, i) => (
                  <li key={n.id}>
                    <Link href={n.href} className="flex items-center gap-3 py-2.5">
                      <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                        {n.orderNo !== null ? String(i + 1).padStart(2, "0") : "·"}
                      </span>
                      <span className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded">
                        {n.coverUrl && <Image src={n.coverUrl} alt="" fill sizes="30px" className="object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{n.label}</span>
                        {n.role !== null && (
                          <span className="mt-0.5 block">
                            <RoleChip role={n.role} />
                          </span>
                        )}
                        {n.groupName && (
                          <span className="block font-mono text-[9px] text-muted-foreground">{n.groupName}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
            </ol>
          </div>
          {/* PC: grafo embebido con la leyenda como barra inferior del marco (frame E). */}
          <div className="hidden flex-col lg:flex">
            <div className="overflow-hidden rounded-2xl border border-border">
              <SagaGraphLazy graph={graph} className="h-[640px] w-full" />
            </div>
            <div className="mt-3">
              <GraphLegend graph={graph} />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* La pestaña GANA el mapa; no pierde la lista: el grafo derivado
              (con el paso del itinerario resaltado) va encima, RouteView
              sigue pintando debajo tal cual. Solo en PC — igual que la ruta
              «lectura», el móvil no tiene el grafo embebido. */}
          {curatedGraph && (
            <div className="hidden flex-col lg:flex">
              <div className="overflow-hidden rounded-2xl border border-border">
                <SagaGraphLazy graph={curatedGraph} className="h-[640px] w-full" />
              </div>
              <div className="mt-3">
                <GraphLegend graph={curatedGraph} />
              </div>
            </div>
          )}
          <RouteView detail={detail} slug={activeRoute} canEdit={canEdit} />
        </>
      )}
    </div>
  );
}
