import type { createClient } from "@/lib/supabase/server";
import { createCuratedOrder } from "./curated-order";
import { deriveSagaMap, type MapLookup } from "./derive-map";
import { deriveTimeline, sortByPublication, type TimelineSection } from "./derive-timeline";
import type { SagaDetail } from "./get-saga-detail";
import { getRouteEntries } from "./get-saga-routes";
import { keyOfRouteEntry } from "./hydrate-route-draft";
import type { SagaGraph } from "./map-types";
import type { SagaRoute } from "./route-types";
import type { DetailMember } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Secciones de la balda según el itinerario activo (spec 2026-10-27 §2/§4).
// Los tres caminos acaban en `TimelineSection[]` para que `deriveShelf` tenga
// UNA sola entrada: el orden curado y los itinerarios ya los calcula
// `deriveTimeline`, y aquí no se recalcula nada, solo se elige.

/** Orden «Publicación»: una sola sección, por año, numerada 1..N. Los nodos
 *  salen del grafo (no se fabrican desde el miembro) para que estado, rol,
 *  portada y opcionalidad sean exactamente los del resto de la ficha. */
export function publicationSections(graph: SagaGraph, members: DetailMember[]): TimelineSection[] {
  if (graph.nodes.length === 0) return [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const rows = sortByPublication(members)
    .map((m) => byId.get(`i:${m.itemType}:${m.itemId}`))
    .filter((n) => n !== undefined)
    .map((node, i) => ({ kind: "entry" as const, no: i + 1, node, branches: [] }));
  if (rows.length === 0) return [];
  return [{ groupSagaId: null, groupName: null, accent: rows[0].node.accent, continuation: false, rows }];
}

/** Rutas que ofrece la BALDA de la ficha. Igual que `detail.routes` salvo en
 *  un caso: con el interruptor del mapa apagado (`hasGraph` false) pero con
 *  orden curado (`shelfGraph` con nodos), `buildRouteList` no ofrece la
 *  sintética «lectura» — y la balda caía en un itinerario curado o en
 *  «Publicación» aunque la saga tuviera orden de lectura. Decisión #3 de la
 *  spec 2026-10-27: el interruptor esconde el MAPA, no el orden. Aquí se
 *  antepone «lectura» con la misma forma que la de `buildRouteList`.
 *
 *  Solo para la ficha: `detail.routes` no cambia porque /como-leerla y el
 *  resto sí deben respetar el interruptor (sin mapa no hay vista «lectura»
 *  que enseñar; allí `?ruta=lectura` degrada a la primera ruta). Si ya hay
 *  «lectura» o un itinerario designado como orden de lectura, no se toca. */
export function shelfRoutesFor(
  detail: Pick<SagaDetail, "routes" | "hasGraph" | "shelfGraph">,
  readingLabel: string,
): SagaRoute[] {
  if (detail.hasGraph || detail.shelfGraph.nodes.length === 0) return detail.routes;
  if (detail.routes.some((r) => r.slug === "lectura" || r.isReadingOrder)) return detail.routes;
  return [
    { slug: "lectura", name: readingLabel, summary: null, synthetic: true, isReadingOrder: false },
    ...detail.routes,
  ];
}

/** Elige las secciones del itinerario activo. Sin `use cache` (regla #437):
 *  `detail` lleva estados del lector. */
export async function getShelfSections(
  supabase: SupabaseServerClient,
  detail: SagaDetail,
  activeRoute: string,
): Promise<TimelineSection[]> {
  const opts = { authenticated: detail.isAuthenticated, showOptional: detail.showOptionalReadings };
  if (activeRoute === "publicacion") {
    return publicationSections(detail.shelfGraph, detail.groups.flatMap((g) => g.members));
  }
  if (activeRoute === "lectura") {
    return deriveTimeline(detail.shelfGraph, opts);
  }
  const row = detail.routes.find((r) => r.slug === activeRoute);
  if (row?.id === undefined) return deriveTimeline(detail.shelfGraph, opts);
  const entries = await getRouteEntries(supabase, row.id);
  return curatedRouteSections(detail, entries.map(keyOfRouteEntry), opts);
}

/** Sustituye cada paso-bloque (`s:<uuid>`) por las obras de esa subsaga en su
 *  orden principal (`i:<tipo>:<uuid>`), quedándose con la primera aparición de
 *  cada obra. `mainOrderOf` es el de `createCuratedOrder`: la MISMA expansión
 *  que hace RouteView vía `resolveRoute`, no un orden nuevo. */
export function expandRouteKeys(routeKeys: string[], mainOrderOf: (sagaId: string) => string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of routeKeys) {
    const expanded = key.startsWith("s:") ? mainOrderOf(key.slice(2)).map((k) => `i:${k}`) : [key];
    for (const k of expanded) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

/** Secciones de un itinerario curado. Misma construcción que SagaMapTab (el
 *  grafo derivado con los pasos del itinerario y la columna por PASOS, spine
 *  "route") con una diferencia: los pasos-bloque se expanden ANTES de derivar.
 *  `deriveSagaMap` ignora a propósito una clave `s:<uuid>` (un bloque nunca es
 *  nodo del mapa), así que un itinerario hecho solo de bloques dejaba la balda
 *  sin una obra y en modo `empty`. Consecuencia: aquí el `step` cuenta obras,
 *  no pasos del itinerario — la balda no pinta ese número. */
export function curatedRouteSections(
  detail: Pick<SagaDetail, "groups" | "windows" | "orderSagas" | "orderMemberships">,
  routeKeys: string[],
  opts: { authenticated: boolean; showOptional: boolean },
): TimelineSection[] {
  const titles = new Map<string, string>(detail.groups.flatMap((g) => g.members).map((m) => [`${m.itemType}:${m.itemId}`, m.title]));
  const mainOrder = createCuratedOrder(detail.orderSagas, detail.orderMemberships, (k) => titles.get(k) ?? "", detail.windows);
  const lookup: MapLookup = {
    groupAccent: new Map(detail.groups.map((g) => [g.sagaId, g.accent] as const)),
    groupName: new Map(detail.groups.map((g) => [g.sagaId, g.name] as const)),
  };
  const routeGraph = deriveSagaMap(detail.groups, detail.windows, lookup, expandRouteKeys(routeKeys, mainOrder));
  return deriveTimeline(routeGraph, { ...opts, spine: "route" });
}
