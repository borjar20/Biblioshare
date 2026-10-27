import type { createClient } from "@/lib/supabase/server";
import { deriveSagaMap, type MapLookup } from "./derive-map";
import { deriveTimeline, sortByPublication, type TimelineSection } from "./derive-timeline";
import type { SagaDetail } from "./get-saga-detail";
import { getRouteEntries } from "./get-saga-routes";
import { keyOfRouteEntry } from "./hydrate-route-draft";
import type { SagaGraph } from "./map-types";
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
  // Misma construcción que SagaMapTab para una ruta curada: el grafo derivado
  // con los pasos del itinerario, y la columna por PASOS (spine "route").
  const entries = await getRouteEntries(supabase, row.id);
  const lookup: MapLookup = {
    groupAccent: new Map(detail.groups.map((g) => [g.sagaId, g.accent] as const)),
    groupName: new Map(detail.groups.map((g) => [g.sagaId, g.name] as const)),
  };
  const routeGraph = deriveSagaMap(detail.groups, detail.windows, lookup, entries.map(keyOfRouteEntry));
  return deriveTimeline(routeGraph, { ...opts, spine: "route" });
}
