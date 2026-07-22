import type { createClient } from "@/lib/supabase/server";
import type { ScreenCollection } from "@/lib/catalog/tmdb";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Registra la pertenencia de una película a su colección TMDB (= saga): crea la
// saga si no existe (por tmdb_collection_id) y enlaza este ítem en `saga_items`.
// La lista completa de la colección se completa perezosamente al abrir la ficha
// de saga (ver src/lib/sagas/get-saga.ts). Ver docs/REQUIREMENTS.md §7.34.
// Multi-saga (spec §1.2): la membresía ya no es única por ítem, un ítem puede
// estar en varias sagas a la vez; is_primary marca cuál es la principal.
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

  // Idempotente por saga_items_saga_item_key. is_primary solo si el ítem aún
  // no tiene saga primary (índice parcial saga_items_primary_idx); ante una
  // carrera con otro alta, el índice rechaza el duplicado y se reintenta sin
  // primary.
  //
  // Va por RPC desde el issue #169: la RLS de saga_items exige ahora
  // collaborator+ para escribir, y este alta la dispara cualquier lector al
  // abrir una ficha de película. link_tmdb_saga_item es SECURITY DEFINER, está
  // acotada a sagas TMDB y lleva dentro la lógica de primary y el reintento
  // ante la carrera, que antes vivían aquí.
  const { error: memberError } = await supabase.rpc("link_tmdb_saga_item", {
    p_saga_id: sagaId,
    p_item_id: itemId,
  });
  if (memberError) {
    console.error("link_tmdb_saga_item failed", { sagaId, itemId, error: memberError });
  }
}
