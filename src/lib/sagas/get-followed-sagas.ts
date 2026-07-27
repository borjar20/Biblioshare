import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { SYNTHETIC_SLUGS } from "./get-saga-routes";
import {
  buildLibrarySagaCards,
  type LibCreator,
  type LibEntry,
  type LibItemMeta,
  type LibMembership,
  type LibRating,
  type LibRouteChoice,
  type LibSaga,
  type LibrarySagaCard,
} from "./build-library-saga-cards";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Mismas tablas/columnas de catálogo que get-saga-detail.ts (líneas 18-22 y
// 156-160): copiadas literalmente, no reinventadas.
const CATALOG_TABLE: Record<ItemType, "books" | "movies" | "series"> = {
  book: "books",
  movie: "movies",
  series: "series",
};
const YEAR_COLUMN: Record<ItemType, "published_year" | "release_year"> = {
  book: "published_year",
  movie: "release_year",
  series: "release_year",
};

// Roles "de autoría" en `credits` — misma lista y mismo comentario que
// get-saga-detail.ts:24-29 (fuente del byline del hero de la ficha).
const AUTHORSHIP_ROLES = ["author", "director", "creator"] as const;

// Datos de la pestaña «Sagas» de Mi Biblioteca: consultas planas batched
// multi-raíz (patrón get-saga-detail, riesgo §7.11: nada de una query por
// saga). BFS de descendientes con frontera compartida (4 niveles).
export async function getFollowedSagas(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<LibrarySagaCard[]> {
  const { data: follows } = await supabase
    .from("saga_follows")
    .select("saga_id")
    .eq("user_id", userId);
  const followedIds = (follows ?? []).map((f) => f.saga_id);
  if (followedIds.length === 0) return [];

  // Árbol: seguidas + descendientes (≤4 niveles), frontera multi-raíz.
  const sagas: LibSaga[] = [];
  const seen = new Set<string>();
  let frontier = followedIds;
  const { data: roots } = await supabase
    .from("sagas")
    .select("id, name, parent_saga_id, accent_color, optional_in_parent, position_in_parent, placement_in_parent")
    .in("id", frontier);
  for (const r of roots ?? []) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    sagas.push({
      id: r.id,
      name: r.name,
      parentSagaId: r.parent_saga_id,
      accentColor: r.accent_color,
      optionalInParent: r.optional_in_parent,
      positionInParent: r.position_in_parent,
      placementInParent: r.placement_in_parent,
    });
  }
  for (let depth = 0; depth < 4 && frontier.length > 0; depth++) {
    const { data: level } = await supabase
      .from("sagas")
      .select("id, name, parent_saga_id, accent_color, optional_in_parent, position_in_parent, placement_in_parent")
      .in("parent_saga_id", frontier)
      .order("id");
    frontier = [];
    for (const r of level ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      sagas.push({
        id: r.id,
        name: r.name,
        parentSagaId: r.parent_saga_id,
        accentColor: r.accent_color,
        optionalInParent: r.optional_in_parent,
        positionInParent: r.position_in_parent,
        placementInParent: r.placement_in_parent,
      });
      frontier.push(r.id);
    }
  }
  const allIds = sagas.map((s) => s.id);

  // Fase 3 (Task 4): antes había una segunda consulta aquí, a `saga_nodes`
  // (el grafo viejo) — su propia copia, independiente de la que hacía
  // get-saga-detail.ts, y por eso la card de esta pestaña y la ficha podían
  // discrepar en el orden (issue #203). Con `saga_nodes` retirado del todo,
  // `memberships` (saga_items + sagas.position_in_parent, ya seleccionado
  // arriba) es la ÚNICA fuente de la secuencia — la misma que usa la ficha.
  const { data: membershipsData } = await supabase
    .from("saga_items")
    .select("saga_id, item_type, item_id, position, optional")
    .in("saga_id", allIds)
    .order("saga_id");
  const memberships: LibMembership[] = (membershipsData ?? []).map((m) => ({
    sagaId: m.saga_id,
    itemType: m.item_type as ItemType,
    itemId: m.item_id,
    position: m.position,
    optional: m.optional,
  }));

  // Ítems por tipo → metadatos de catálogo + entradas + ratings + creadores.
  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  const seenItem = new Set<string>();
  for (const m of memberships) {
    const key = `${m.itemType}:${m.itemId}`;
    if (seenItem.has(key)) continue;
    seenItem.add(key);
    idsByType[m.itemType].push(m.itemId);
  }

  // Metadatos de catálogo por tipo, con año real de cada tabla
  // (books.published_year / movies|series.release_year) — copiado de
  // get-saga-detail.ts:152-178.
  const items: LibItemMeta[] = [];
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from(CATALOG_TABLE[type])
        .select(`id, title, cover_url, ${YEAR_COLUMN[type]}`)
        .in("id", idsByType[type]);
      for (const r of data ?? []) {
        const row = r as unknown as Record<string, unknown>;
        items.push({
          itemType: type,
          itemId: row.id as string,
          title: row.title as string,
          coverUrl: (row.cover_url as string | null) ?? null,
          year: (row[YEAR_COLUMN[type]] as number | null) ?? null,
        });
      }
    }),
  );

  // Estado del usuario por ítem, desde PASES (dueños del estado desde el hub
  // §Tarea 9; library_entries quedó congelada y marcaba 0% de avance). Un ítem
  // puede tener varios pases: se agregan en una LibEntry por ítem — status del
  // pase activo, everCompleted si algún pase está completado (relecturas),
  // updated_at máximo para la recencia.
  const entries: LibEntry[] = [];
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from("passes")
        .select("item_id, status, is_active, updated_at")
        .eq("user_id", userId)
        .eq("item_type", type)
        .in("item_id", idsByType[type]);
      const byItem = new Map<string, { status: string; everCompleted: boolean; updatedAt: string }>();
      for (const r of data ?? []) {
        const agg = byItem.get(r.item_id) ?? { status: "", everCompleted: false, updatedAt: "" };
        if (r.is_active) agg.status = r.status as string;
        if (r.status === "completed") agg.everCompleted = true;
        const updatedAt = r.updated_at as string;
        if (updatedAt > agg.updatedAt) agg.updatedAt = updatedAt;
        byItem.set(r.item_id, agg);
      }
      for (const [itemId, agg] of byItem) {
        entries.push({ itemType: type, itemId, ...agg });
      }
    }),
  );

  // Pases PROPIOS puntuados (no comunitarios como averageSagaRating de la
  // ficha): mismo filtro de get-saga-detail.ts:228-254 (rating y finished_on
  // no nulos, status != dropped) más el .eq("user_id", userId) que aquí sí
  // hace falta porque solo interesan las valoraciones del propio usuario.
  const ratings: LibRating[] = [];
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from("passes")
        .select("item_id, rating, finished_on")
        .eq("item_type", type)
        .eq("user_id", userId)
        .in("item_id", idsByType[type])
        .not("rating", "is", null)
        .not("finished_on", "is", null)
        .neq("status", "dropped");
      for (const r of data ?? []) {
        ratings.push({
          itemType: type,
          itemId: r.item_id,
          rating: r.rating as number,
          finishedOn: r.finished_on as string,
        });
      }
    }),
  );

  // Creador/autor dominante — misma fuente que el byline del hero de la
  // ficha (get-saga-detail.ts:257-283: credits con roles de autoría), pero
  // sin agregar aquí: se entrega una fila por crédito y buildLibrarySagaCards
  // hace el mode() por ítem/saga.
  const creators: LibCreator[] = [];
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from("credits")
        .select("person:people(name), role, item_type, item_id")
        .eq("item_type", type)
        .in("item_id", idsByType[type])
        .in("role", AUTHORSHIP_ROLES);
      for (const r of data ?? []) {
        const name = (r.person as { name: string } | null)?.name;
        if (!name) continue;
        creators.push({ itemType: type, itemId: r.item_id, name });
      }
    }),
  );

  // Ruta adoptada por el usuario en cada saga seguida (Task 7). Se guarda el
  // slug (saga_route_choices), no el nombre, así que hay que cruzarlo con
  // saga_routes para pintarlo — y solo si NO es una de las sintéticas
  // (`lectura`/`publicacion`, reservadas y sin fila propia): no aporta nada
  // anunciar «vas por Publicación».
  const { data: choices } = await supabase
    .from("saga_route_choices")
    .select("saga_id, route_slug")
    .eq("user_id", userId)
    .in("saga_id", followedIds);
  const choiceBySaga = new Map(
    ((choices ?? []) as Array<{ saga_id: string; route_slug: string }>).map((c) => [c.saga_id, c.route_slug]),
  );
  const curatedChoiceSagaIds = [...choiceBySaga.entries()]
    .filter(([, slug]) => !(SYNTHETIC_SLUGS as readonly string[]).includes(slug))
    .map(([sagaId]) => sagaId);
  const routeChoices: LibRouteChoice[] = [];
  if (curatedChoiceSagaIds.length > 0) {
    const { data: curatedRoutes } = await supabase
      .from("saga_routes")
      .select("saga_id, slug, name")
      .in("saga_id", curatedChoiceSagaIds);
    for (const r of (curatedRoutes ?? []) as Array<{ saga_id: string; slug: string; name: string }>) {
      // El slug adoptado puede apuntar a una ruta que el curador ya borró
      // (degradación intencional, ver comentario de route-actions.ts): en ese
      // caso no hay fila que la case y routeName se queda en null.
      if (choiceBySaga.get(r.saga_id) === r.slug) routeChoices.push({ sagaId: r.saga_id, routeName: r.name });
    }
  }

  return buildLibrarySagaCards(
    followedIds,
    sagas,
    memberships,
    items,
    entries,
    ratings,
    creators,
    routeChoices,
  );
}
