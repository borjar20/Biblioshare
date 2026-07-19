import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import {
  buildLibrarySagaCards,
  type LibCreator,
  type LibEntry,
  type LibItemMeta,
  type LibMembership,
  type LibNode,
  type LibRating,
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
    .select("id, name, parent_saga_id, accent_color")
    .in("id", frontier);
  for (const r of roots ?? []) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    sagas.push({ id: r.id, name: r.name, parentSagaId: r.parent_saga_id, accentColor: r.accent_color });
  }
  for (let depth = 0; depth < 4 && frontier.length > 0; depth++) {
    const { data: level } = await supabase
      .from("sagas")
      .select("id, name, parent_saga_id, accent_color")
      .in("parent_saga_id", frontier)
      .order("id");
    frontier = [];
    for (const r of level ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      sagas.push({ id: r.id, name: r.name, parentSagaId: r.parent_saga_id, accentColor: r.accent_color });
      frontier.push(r.id);
    }
  }
  const allIds = sagas.map((s) => s.id);

  const [membershipsRes, nodesRes] = await Promise.all([
    supabase
      .from("saga_items")
      .select("saga_id, item_type, item_id, position")
      .in("saga_id", allIds)
      .order("saga_id"),
    supabase
      .from("saga_nodes")
      .select("saga_id, item_type, item_id, child_saga_id, order_no")
      .in("saga_id", allIds)
      .order("id"),
  ]);
  const memberships: LibMembership[] = (membershipsRes.data ?? []).map((m) => ({
    sagaId: m.saga_id,
    itemType: m.item_type as ItemType,
    itemId: m.item_id,
    position: m.position,
  }));
  const nodes: LibNode[] = (nodesRes.data ?? []).map((n) => ({
    sagaId: n.saga_id,
    itemType: (n.item_type as ItemType | null) ?? null,
    itemId: n.item_id,
    childSagaId: n.child_saga_id,
    orderNo: n.order_no,
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
  for (const n of nodes) {
    if (n.itemType === null || n.itemId === null) continue;
    const key = `${n.itemType}:${n.itemId}`;
    if (seenItem.has(key)) continue;
    seenItem.add(key);
    idsByType[n.itemType].push(n.itemId);
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

  // Entradas de biblioteca del usuario (item_id, status, updated_at) por tipo
  // — copiado de get-saga-detail.ts:180-200, con updated_at añadido (aquí
  // hace falta para el bloque «siguiente»/recencia, allí no).
  const entries: LibEntry[] = [];
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from("library_entries")
        .select("item_id, status, updated_at")
        .eq("user_id", userId)
        .eq("item_type", type)
        .in("item_id", idsByType[type]);
      for (const r of data ?? []) {
        entries.push({
          itemType: type,
          itemId: r.item_id,
          status: r.status as string,
          updatedAt: r.updated_at as string,
        });
      }
    }),
  );

  // Pases PROPIOS puntuados (no comunitarios como averageSagaRating de la
  // ficha): mismo filtro de get-saga-detail.ts:229-245 (rating y finished_on
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
  // ficha (get-saga-detail.ts:251-277: credits con roles de autoría), pero
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

  return buildLibrarySagaCards(followedIds, sagas, memberships, nodes, items, entries, ratings, creators);
}
