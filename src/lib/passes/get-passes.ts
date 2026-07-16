import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Pass } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Pases del usuario para una obra: el abierto primero, luego cerrados de más
// reciente a más antiguo (orden que espera el diario para el delta). review
// se lee SIEMPRE por la vista pass_reviews (privacidad aplicada); como la
// vista solo enseña filas visibles, para el diario propio devuelve todo.
export async function getPasses(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string,
  userId: string
): Promise<Pass[]> {
  const { data } = await supabase
    .from("pass_reviews")
    .select(
      "id, status, is_active, position, started_on, finished_on, rating, review, is_public, edition_id, pinned_order"
    )
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .order("finished_on", { ascending: false, nullsFirst: true });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as Pass["status"],
    isActive: r.is_active as boolean,
    position: r.position as Pass["position"],
    startedOn: r.started_on,
    finishedOn: r.finished_on,
    rating: r.rating,
    review: r.review,
    isPublic: r.is_public as boolean,
    editionId: r.edition_id,
    pinnedOrder: r.pinned_order,
  }));
}

export async function getActivePass(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string,
  userId: string
): Promise<Pass | null> {
  const passes = await getPasses(supabase, itemType, itemId, userId);
  return passes.find((p) => p.isActive) ?? null;
}
