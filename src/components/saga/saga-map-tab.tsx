import Image from "next/image";
import Link from "next/link";
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
  const graph = detail.graph;
  const base = sagaHref(detail.saga.id);
  const allMembers = detail.groups.flatMap((g) => g.members);

  // Ruta curada activa (Task 3, fase 3): el mismo mapa derivado, con el paso
  // del itinerario resaltado en cada nodo por el que pasa. `lectura` y
  // `publicacion` (las sintéticas) ya tienen su propia rama más abajo y
  // nunca llegan aquí. Sin mapa (graph === null) no hay nada que resaltar —
  // la pestaña sigue pintando solo la lista de RouteView, como siempre.
  // `graph === null` cubre las dos razones a la vez (fase 3, Task 4-bis,
  // arreglo tras revisión): sin nada curado que dibujar, O con el interruptor
  // `show_map` apagado — `resolveSagaGraph` (get-saga-detail.ts) ya resuelve
  // eso antes de que `detail.graph` llegue aquí, así que este `&& graph` basta
  // para que el panel resaltado NUNCA se pinte con el interruptor apagado, sin
  // que este archivo tenga que consultar `showMap` por su cuenta.
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
            {/* «Como lista lineal» se retira: con el timeline nuevo —que ya
                pinta los cuatro estados y no se deja fuera a los nodos sin
                hueco— era un duplicado de los mismos títulos, uno debajo del
                otro. */}
            <ReadingTimeline sections={deriveTimeline(graph, { authenticated: detail.isAuthenticated })} />
          </div>
          {/* PC: grafo embebido con la leyenda como barra inferior del marco
              (frame E), y el MISMO componente de orden de lectura al pie — el
              impacto gráfico que el móvil recupera, aquí debajo del grafo. */}
          <div className="hidden flex-col lg:flex">
            <div className="overflow-hidden rounded-2xl border border-border">
              <SagaGraphLazy graph={graph} className="h-[640px] w-full" />
            </div>
            <div className="mt-3">
              <GraphLegend graph={graph} />
            </div>
            <div className="mt-4">
              <ReadingTimeline sections={deriveTimeline(graph, { authenticated: detail.isAuthenticated })} />
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
          <RouteView detail={detail} slug={activeRoute} canEdit={canEdit} graph={curatedGraph} />
        </>
      )}
    </div>
  );
}
