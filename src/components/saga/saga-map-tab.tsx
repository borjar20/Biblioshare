import Image from "next/image";
import Link from "next/link";
import { countRoles } from "@/lib/sagas/count-roles";
import { deriveSagaMap, type MapLookup } from "@/lib/sagas/derive-map";
import { deriveTimeline, sortByPublication } from "@/lib/sagas/derive-timeline";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { getRouteEntries } from "@/lib/sagas/get-saga-routes";
import { keyOfRouteEntry } from "@/lib/sagas/hydrate-route-draft";
import type { SagaGraph } from "@/lib/sagas/map-types";
import type { SagaItemRole } from "@/lib/sagas/types";
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
  activeRole,
}: {
  detail: SagaDetail;
  activeRoute: string;
  canEdit?: boolean;
  /** Lente por rol (`?rol=`), ya validada contra el vocabulario en la página. */
  activeRole: SagaItemRole | null;
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

  // Cuántas opcionales tiene la saga, contadas sobre el GRAFO y no sobre las
  // filas del timeline: contadas sobre lo visible, apagar el interruptor haría
  // desaparecer el propio interruptor y no habría forma de volver.
  const optionalCount = graph === null ? 0 : graph.nodes.filter((n) => n.kind === "item" && n.optional).length;

  // Contado sobre el GRAFO, igual que optionalCount y por el mismo motivo: la
  // barra tiene que seguir listando todos los roles mientras uno está activo, o
  // no habría forma de volver.
  const roleCounts = graph === null ? [] : countRoles(graph);
  // Los enlaces del filtro conservan la pestaña y la ruta activa: la lente no
  // puede sacarte del mapa ni cambiarte de itinerario.
  const baseHref = `${base}?tab=mapa&ruta=${encodeURIComponent(activeRoute)}`;

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
            <ReadingTimeline
              sections={deriveTimeline(graph, {
                authenticated: detail.isAuthenticated,
                showOptional: detail.showOptionalReadings,
                roleFilter: activeRole,
              })}
              sagaId={detail.isAuthenticated ? detail.saga.id : null}
              showOptional={detail.showOptionalReadings}
              optionalCount={optionalCount}
              roleCounts={roleCounts}
              activeRole={activeRole}
              baseHref={baseHref}
            />
          </div>
          {/* PC: grafo embebido con la leyenda como barra inferior del marco
              (frame E), y el MISMO componente de orden de lectura al pie — el
              impacto gráfico que el móvil recupera, aquí debajo del grafo. */}
          <div className="hidden flex-col lg:flex">
            <div className="overflow-hidden rounded-2xl border border-border">
              {/* La lente de rol llega también al grafo (fase 6): la fase 5 la
                  dejó gobernando solo el timeline, y con `?rol=` puesto las dos
                  mitades de la misma pestaña contaban cosas distintas. Aquí
                  ATENÚA, no filtra. */}
              <SagaGraphLazy graph={graph} className="h-[640px] w-full" activeRole={activeRole} />
            </div>
            <div className="mt-3">
              <GraphLegend graph={graph} />
            </div>
            <div className="mt-4">
              <ReadingTimeline
              sections={deriveTimeline(graph, {
                authenticated: detail.isAuthenticated,
                showOptional: detail.showOptionalReadings,
                roleFilter: activeRole,
              })}
              sagaId={detail.isAuthenticated ? detail.saga.id : null}
              showOptional={detail.showOptionalReadings}
              optionalCount={optionalCount}
              roleCounts={roleCounts}
              activeRole={activeRole}
              baseHref={baseHref}
            />
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
                <SagaGraphLazy graph={curatedGraph} className="h-[640px] w-full" activeRole={activeRole} />
              </div>
              <div className="mt-3">
                <GraphLegend graph={curatedGraph} />
              </div>
            </div>
          )}
          <RouteView
            detail={detail}
            slug={activeRoute}
            canEdit={canEdit}
            graph={curatedGraph}
            activeRole={activeRole}
          />
        </>
      )}
    </div>
  );
}
