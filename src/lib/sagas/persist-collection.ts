import type { createClient } from "@/lib/supabase/server";
import type { ScreenCollection } from "@/lib/catalog/tmdb";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Registra la pertenencia de una película a su colección TMDB (= saga): crea la
// saga si no existe (por tmdb_collection_id) y enlaza este ítem en `saga_items`.
// La lista completa de la colección se completa perezosamente al abrir la ficha
// de saga (ver src/lib/sagas/get-saga.ts). Ver docs/REQUIREMENTS.md §7.34.
export async function persistCollectionMembership(
  supabase: SupabaseServerClient,
  itemType: "movie",
  itemId: string,
  collection: ScreenCollection
): Promise<void> {
  let sagaId: string | undefined;

  const { data: existing } = await supabase
    .from("sagas")
    .select("id")
    .eq("tmdb_collection_id", collection.tmdbId)
    .maybeSingle();

  if (existing) {
    sagaId = existing.id;
  } else {
    const { data: inserted, error } = await supabase
      .from("sagas")
      .insert({
        name: collection.name,
        cover_url: collection.coverUrl,
        tmdb_collection_id: collection.tmdbId,
        source: "tmdb",
      })
      .select("id")
      .single();

    if (error) {
      // Carrera (índice único sobre tmdb_collection_id): re-seleccionar.
      const { data: raced } = await supabase
        .from("sagas")
        .select("id")
        .eq("tmdb_collection_id", collection.tmdbId)
        .maybeSingle();
      sagaId = raced?.id;
    } else {
      sagaId = inserted.id;
    }
  }

  if (!sagaId) return;

  // Idempotente por UNIQUE(saga_id, item_type, item_id).
  await supabase
    .from("saga_items")
    .insert({ saga_id: sagaId, item_type: itemType, item_id: itemId });
}
