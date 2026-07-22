import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { RawRouteEntry, SagaRoute } from "./route-types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Slugs RESERVADOS de las rutas sintéticas. No se materializan en saga_routes:
// «lectura» es el grafo y «publicacion» se calcula por año, así que una fila
// para ellas sería una segunda fuente de verdad que habría que resincronizar
// en cada edición del grafo — la familia de fallo del #91. El CHECK
// saga_routes_slug_not_reserved impide que una ruta curada los use.
export const SYNTHETIC_SLUGS = ["lectura", "publicacion"] as const;

export type CuratedRouteRow = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  position: number;
};

/**
 * Orden de las rutas curadas: por `position`, y si empatan (la columna no
 * tiene UNIQUE, a diferencia de saga_route_entries.position) por nombre, para
 * que el resultado sea determinista en vez de depender del orden que devuelva
 * la consulta. Único criterio de orden del dominio: lo usan buildRouteList
 * (qué ve el lector en el selector) y computeMovedPositions (qué "arriba/
 * abajo" ve el curador) — así los dos coinciden siempre.
 */
export function compareRoutePosition(a: CuratedRouteRow, b: CuratedRouteRow): number {
  return a.position - b.position || a.name.localeCompare(b.name);
}

/** Orden del selector: lectura → curadas (por position) → publicación. */
export function buildRouteList(
  curated: CuratedRouteRow[],
  labels: { lectura: string; publicacion: string },
  hasGraph: boolean,
): SagaRoute[] {
  const out: SagaRoute[] = [];
  if (hasGraph) {
    out.push({ slug: "lectura", name: labels.lectura, summary: null, synthetic: true });
  }
  for (const c of [...curated].sort(compareRoutePosition)) {
    // El id viaja para que RouteView pueda localizar la fila activa en
    // detail.routes sin volver a consultar saga_routes (hallazgo 3). Las
    // sintéticas de abajo/arriba no llevan id: no tienen fila.
    out.push({ id: c.id, slug: c.slug, name: c.name, summary: c.summary, synthetic: false });
  }
  out.push({ slug: "publicacion", name: labels.publicacion, summary: null, synthetic: true });
  return out;
}

export async function getSagaRoutes(supabase: SupabaseServerClient, sagaId: string) {
  const { data } = await supabase
    .from("saga_routes")
    .select("id, slug, name, summary, position")
    .eq("saga_id", sagaId)
    .order("position", { ascending: true });
  return (data ?? []) as CuratedRouteRow[];
}

/**
 * Nuevas posiciones tras mover una ruta arriba/abajo (brecha de spec
 * 2026-07-22, Task 8: "reordenar" faltaba). Ordena `routes` con el mismo
 * criterio que ve el lector (compareRoutePosition) e intercambia la ruta con
 * su vecina en ESE orden.
 *
 * Renumera TODA la lista a 1..n en el resultado en vez de solo el par movido:
 * `saga_routes.position` no tiene UNIQUE, así que un empate heredado (datos
 * antiguos, o dos `createRoute` concurrentes) podría dejar un simple
 * intercambio de valores sin efecto visible si las dos posiciones ya
 * coincidían. Renumerar es determinista pase lo que pase de partida y deja la
 * tabla sin empates para el siguiente movimiento.
 *
 * Devuelve null si no hay nada que mover: `routeId` no está en `routes` o ya
 * está en el extremo hacia el que se pide mover (no es "error", es "ya está
 * ahí" — el llamador simplemente no escribe nada).
 */
export function computeMovedPositions(
  routes: CuratedRouteRow[],
  routeId: string,
  direction: "up" | "down",
): Array<{ id: string; position: number }> | null {
  const ordered = [...routes].sort(compareRoutePosition);
  const index = ordered.findIndex((r) => r.id === routeId);
  if (index === -1) return null;
  const target = index + (direction === "up" ? -1 : 1);
  if (target < 0 || target >= ordered.length) return null;

  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.map((r, i) => ({ id: r.id, position: i + 1 }));
}

export async function getRouteEntries(
  supabase: SupabaseServerClient,
  routeId: string,
): Promise<RawRouteEntry[]> {
  const { data } = await supabase
    .from("saga_route_entries")
    .select("position, item_type, item_id, child_saga_id, note")
    .eq("route_id", routeId)
    .order("position", { ascending: true });
  return ((data ?? []) as Array<{
    position: number;
    item_type: ItemType | null;
    item_id: string | null;
    child_saga_id: string | null;
    note: string | null;
  }>).map((r) => ({
    position: r.position,
    itemType: r.item_type,
    itemId: r.item_id,
    childSagaId: r.child_saga_id,
    note: r.note,
  }));
}

/** Slug adoptado por el usuario para esta saga, si lo hay. */
export async function getRouteChoice(
  supabase: SupabaseServerClient,
  userId: string,
  sagaId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("saga_route_choices")
    .select("route_slug")
    .eq("user_id", userId)
    .eq("saga_id", sagaId)
    .maybeSingle();
  return (data as { route_slug: string } | null)?.route_slug ?? null;
}
