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
  for (const c of [...curated].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))) {
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
