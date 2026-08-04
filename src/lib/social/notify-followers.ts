import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { TransitionOutcome } from "@/lib/passes/apply-transition";
import { notifyMany, type ReviewTargetType } from "./notifications";
import { CATEGORY_NOTIFICATION_TYPE, type NotifyCategory } from "./notify-categories";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Avisa a los seguidores ACEPTADOS de `actorId` que activaron esta categoría en
// su campana. Best-effort: mismo contrato que notify() — nunca lanza; un fallo
// aquí no debe romper la acción real (cerrar pase, registrar sesión…).
// Lee follows por service-role: es un camino de servidor de confianza y así
// notify_events (preferencia privada del follower) no se expone por RLS al actor.
export async function notifyFollowersOfEvent(
  supabase: SupabaseServerClient,
  actorId: string,
  category: NotifyCategory,
  target: { targetType: ReviewTargetType; targetId: string },
): Promise<void> {
  try {
    const writer = createServiceRoleClient();
    const { data, error } = await writer
      .from("follows")
      .select("follower_id")
      .eq("followee_id", actorId)
      .eq("status", "accepted")
      .contains("notify_events", [category]);
    if (error) throw error;
    const userIds = (data ?? []).map((r) => r.follower_id);
    if (userIds.length === 0) return;
    await notifyMany(supabase, {
      userIds,
      actorId,
      type: CATEGORY_NOTIFICATION_TYPE[category],
      targetType: target.targetType,
      targetId: target.targetId,
    });
  } catch (err) {
    console.error("notifyFollowersOfEvent failed", err);
  }
}

// Azúcar para el enganche de "added": solo dispara si applyTransition INSERTÓ un
// pase nuevo (outcome.created). El evento "added" del feed enlaza al ítem vía el
// pase, así que target_type es 'diary_entry' (resolveTargetHrefs ya lo resuelve).
export async function notifyAdded(
  supabase: SupabaseServerClient,
  actorId: string,
  outcome: TransitionOutcome,
): Promise<void> {
  if (outcome.kind !== "done" || !outcome.created) return;
  await notifyFollowersOfEvent(supabase, actorId, "added", {
    targetType: "diary_entry",
    targetId: outcome.passId,
  });
}
