import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { SagaMembership } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Pertenencia de un ítem a una saga (para la chip de la ficha). Lectura pura:
// la membresía de películas se persiste en ensureItemEnriched; la de libros, a
// mano. Ver docs/REQUIREMENTS.md §7.34.
export async function getItemSaga(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string
): Promise<SagaMembership | null> {
  const { data } = await supabase
    .from("saga_items")
    .select("position, saga:sagas(id, name)")
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .maybeSingle();

  const saga = data?.saga as { id: string; name: string } | null | undefined;
  if (!saga) return null;

  return { sagaId: saga.id, name: saga.name, position: data?.position ?? null };
}
