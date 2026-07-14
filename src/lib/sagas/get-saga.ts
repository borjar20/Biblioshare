import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { getCollection } from "@/lib/catalog/tmdb";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import type { Saga, SagaMember } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SagaRow = {
  id: string;
  name: string;
  overview: string | null;
  cover_url: string | null;
  source: string;
  tmdb_collection_id: number | null;
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

    // Resolver todas las partes a filas de catálogo (creándolas si faltan).
    const rows: Array<{
      saga_id: string;
      item_type: "movie";
      item_id: string;
      position: number;
    }> = [];
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
      rows.push({ saga_id: saga.id, item_type: "movie", item_id: itemId, position: position++ });
    }

    // Reconstruir la membresía de la saga de forma determinista (borrar +
    // reinsertar) para garantizar el orden por año en cada visita; la semántica
    // de upsert sobre el índice único no actualizaba la posición de las filas ya
    // existentes (p. ej. la película desde la que se creó la saga).
    await supabase.from("saga_items").delete().eq("saga_id", saga.id);
    await supabase.from("saga_items").insert(rows);
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

export async function getSaga(
  supabase: SupabaseServerClient,
  id: string
): Promise<{ saga: Saga; members: SagaMember[] } | null> {
  const { data: row } = await supabase
    .from("sagas")
    .select("id, name, overview, cover_url, source, tmdb_collection_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;

  await populateTmdbCollection(supabase, row as SagaRow);

  const { data: items } = await supabase
    .from("saga_items")
    .select("item_type, item_id, position")
    .eq("saga_id", id);

  const members = await resolveMembers(
    supabase,
    (items ?? []) as Array<{ item_type: ItemType; item_id: string; position: number | null }>
  );

  return { saga: toSaga(row as SagaRow), members };
}
