import type { createClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/social/notifications";

// Fan-out a los miembros activos del club, excepto el actor, vía notifyMany()
// (un INSERT multi-fila + push en lote). Best-effort: mismo patrón que
// notifyNewPost (Bloque F).
//
// Vive en su propio módulo PLANO (sin "use server") a propósito: lo usan
// core.ts y propose.ts, ambos módulos de server actions, donde todo export debe
// ser una función asíncrona expuesta al cliente. Este helper recibe el cliente
// de Supabase por parámetro, así que no es —ni debe ser— una server action.
export async function notifyClub(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  actorId: string,
  type: "club_activity_proposed" | "club_activity_activated",
  activityId: string,
): Promise<void> {
  try {
    const { data: members } = await supabase
      .from("club_members")
      .select("user_id")
      .eq("club_id", clubId)
      .eq("status", "active")
      .neq("user_id", actorId);

    await notifyMany(supabase, {
      userIds: (members ?? []).map((member) => member.user_id),
      actorId,
      type,
      targetType: "club_activity",
      targetId: activityId,
    });
  } catch (error) {
    console.error("notifyClub failed", error);
  }
}
