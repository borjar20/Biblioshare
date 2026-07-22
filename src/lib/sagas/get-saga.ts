import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { getCollection } from "@/lib/catalog/tmdb";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import { planCollectionSync, type DesiredPart } from "./collection-sync";
import type { Saga, SagaMember } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SagaRow = {
  id: string;
  name: string;
  overview: string | null;
  cover_url: string | null;
  source: string;
  tmdb_collection_id: number | null;
  parent_saga_id: string | null;
  accent_color: string | null;
};

const CATALOG_TABLE: Record<ItemType, "books" | "movies" | "series"> = {
  book: "books",
  movie: "movies",
  series: "series",
};

function toSaga(row: SagaRow): Saga {
  return {
    id: row.id,
    name: row.name,
    overview: row.overview,
    coverUrl: row.cover_url,
    source: row.source,
    tmdbCollectionId: row.tmdb_collection_id,
    parentSagaId: row.parent_saga_id,
    accentColor: row.accent_color,
  };
}

// Completa perezosamente los miembros de una colección TMDB: al abrir la ficha
// de saga se traen todas las partes de la colección (la respuesta está cacheada
// por Next 24h) y se insertan las que falten en `saga_items`, con su orden por
// año. Reutiliza findOrCreateCatalogItem para no duplicar catálogo. Nunca lanza.
async function populateTmdbCollection(
  supabase: SupabaseServerClient,
  saga: SagaRow
): Promise<void> {
  if (saga.source !== "tmdb" || !saga.tmdb_collection_id) return;
  try {
    const collection = await getCollection(saga.tmdb_collection_id);
    if (!collection || collection.parts.length === 0) return;

    // Partes deseadas en orden por año (posición 1..N).
    const desired: DesiredPart[] = [];
    let position = 1;
    for (const part of collection.parts) {
      const itemId = await findOrCreateCatalogItem(supabase, {
        itemType: "movie",
        externalId: String(part.tmdbId),
        title: part.title,
        subtitle: null,
        coverUrl: part.coverUrl,
        year: part.year,
        synopsis: part.synopsis,
        genres: null,
      });
      desired.push({ itemId, position: position++ });
    }

    // Diff no destructivo (multi-saga, spec §1.2): inserta lo que falte y
    // corrige posiciones, sin tocar miembros manuales. is_primary=false en el
    // bulk: la primary la fija el alta con contexto (persistCollectionMembership
    // o el editor), no el rellenado perezoso.
    //
    // Va por RPC desde el issue #169: la RLS de saga_items exige ahora
    // collaborator+ para escribir, y este camino lo dispara cualquier lector al
    // abrir la ficha. sync_tmdb_saga_items es SECURITY DEFINER y está acotada a
    // sagas TMDB. El diff se sigue calculando aquí para no llamar en vano
    // cuando no hay nada que cambiar (el caso normal: la colección ya está).
    const { data: existingRows } = await supabase
      .from("saga_items")
      .select("item_id, position")
      .eq("saga_id", saga.id)
      .eq("item_type", "movie");
    const plan = planCollectionSync(existingRows ?? [], desired);

    const changed = [...plan.toInsert, ...plan.toUpdate];
    if (changed.length > 0) {
      const { error } = await supabase.rpc("sync_tmdb_saga_items", {
        p_saga_id: saga.id,
        p_items: changed.map((p) => ({ item_id: p.itemId, position: p.position })),
      });
      if (error) throw error;
    }
  } catch (error) {
    console.error("populateTmdbCollection failed", { sagaId: saga.id, error });
  }
}

async function resolveMembers(
  supabase: SupabaseServerClient,
  rows: Array<{ item_type: ItemType; item_id: string; position: number | null }>
): Promise<SagaMember[]> {
  const byType: Record<ItemType, Set<string>> = { book: new Set(), movie: new Set(), series: new Set() };
  for (const r of rows) byType[r.item_type].add(r.item_id);

  const meta = new Map<string, { title: string; coverUrl: string | null }>();
  await Promise.all(
    (Object.keys(byType) as ItemType[]).map(async (type) => {
      const ids = [...byType[type]];
      if (ids.length === 0) return;
      const { data } = await supabase
        .from(CATALOG_TABLE[type])
        .select("id, title, cover_url")
        .in("id", ids);
      for (const row of data ?? []) {
        meta.set(`${type}:${row.id}`, { title: row.title, coverUrl: row.cover_url });
      }
    })
  );

  const members: SagaMember[] = [];
  for (const r of rows) {
    const m = meta.get(`${r.item_type}:${r.item_id}`);
    if (!m) continue;
    members.push({
      itemType: r.item_type,
      itemId: r.item_id,
      title: m.title,
      coverUrl: m.coverUrl,
      href: itemHref(r.item_type, r.item_id),
      position: r.position,
    });
  }

  // Ordenar por position (nulls al final), luego por título.
  return members.sort((a, b) => {
    const pa = a.position ?? Number.MAX_SAFE_INTEGER;
    const pb = b.position ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return a.title.localeCompare(b.title);
  });
}

// Saga + rellenado perezoso TMDB, SIN resolver miembros. getSagaDetail resuelve
// los miembros por su cuenta (con jerarquía y estados) y usaba getSaga solo
// para esto — extraerlo ahorra hasta 4 queries de catálogo por visita (DEFER
// #9 de la revisión final de fase 1).
export async function getSagaBase(
  supabase: SupabaseServerClient,
  id: string,
): Promise<Saga | null> {
  const { data: row } = await supabase
    .from("sagas")
    .select("id, name, overview, cover_url, source, tmdb_collection_id, parent_saga_id, accent_color")
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;

  await populateTmdbCollection(supabase, row as SagaRow);
  return toSaga(row as SagaRow);
}

export async function getSaga(
  supabase: SupabaseServerClient,
  id: string
): Promise<{ saga: Saga; members: SagaMember[] } | null> {
  const saga = await getSagaBase(supabase, id);
  if (!saga) return null;

  const { data: items } = await supabase
    .from("saga_items")
    .select("item_type, item_id, position")
    .eq("saga_id", id);

  const members = await resolveMembers(
    supabase,
    (items ?? []) as Array<{ item_type: ItemType; item_id: string; position: number | null }>
  );

  return { saga, members };
}
