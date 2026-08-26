import "server-only";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// La puerta de superficie de TODO lo que escribe sobre un target: existe,
// es comentable/reaccionable y con qué tipo de notificación. Extraída de
// interaction-actions.ts para que voice-note-actions.ts la comparta sin
// convertirla en server action.
export async function getInteractionTarget(
  supabase: SupabaseServerClient,
  interactionTargetId: string,
) {
  const { data, error } = await supabase
    .from("interaction_targets")
    .select(
      "id, owner_id, commentable, reactable, comment_notification_type, reaction_notification_type",
    )
    .eq("id", interactionTargetId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("interaction_target_not_found");
  return data;
}
