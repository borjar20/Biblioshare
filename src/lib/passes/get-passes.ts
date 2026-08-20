import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Pass } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Pases del usuario para una obra: el abierto primero, luego cerrados de más
// reciente a más antiguo (orden que espera el diario para el delta). review
// y dropped_reason/dropped_reason_note se leen SIEMPRE por la vista
// pass_reviews (privacidad aplicada); como la vista enmascara estas dos
// últimas por dueño y esta función solo se llama con el propio userId (ver
// libro|pelicula|serie/[id]/page.tsx), siempre llegan con valor real.
export async function getPasses(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string,
  userId: string
): Promise<Pass[]> {
  const { data } = await supabase
    .from("pass_reviews")
    .select(
      "id, status, is_active, position, started_on, finished_on, rating, review, is_public, edition_id, pinned_order, dropped_reason, dropped_reason_note"
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
    droppedReason: r.dropped_reason as Pass["droppedReason"],
    droppedReasonNote: r.dropped_reason_note,
  }));
}

// ¿Puede un gesto lateral AUTO-cerrar este pase? Solo si sigue abierto
// (`planned` / `in_progress`). Un `dropped` lo dejó el usuario a propósito y un
// `completed` ya está cerrado: que puntuar un episodio o registrar una sesión
// los mueva a `completed` con `finished_on` = hoy es un efecto colateral que
// nadie pidió (#716). Reabrir un pase cerrado sigue siendo posible, pero por
// donde debe: la decisión explícita de StatusSegments.
export async function isAutoCloseable(
  supabase: SupabaseServerClient,
  passId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("passes")
    .select("status")
    .eq("id", passId)
    .eq("user_id", userId)
    .maybeSingle();

  return data?.status === "in_progress" || data?.status === "planned";
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
