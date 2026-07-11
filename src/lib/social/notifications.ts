import type { createClient } from "@/lib/supabase/server";

// Notificaciones in-app (EPIC-05, Bloque D, SD-5). Sin push/email/cron: se lee
// al cargar la app (campana). notify() es un efecto secundario best-effort
// llamado desde otras server actions (follow/aceptar); un fallo aquí no debe
// romper la acción real que lo dispara.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type NotificationType =
  | "follow_request"
  | "new_follower"
  | "follow_accepted";

export type Notification = {
  id: string;
  type: NotificationType;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

const LIST_LIMIT = 20;

export async function notify(
  supabase: SupabaseServerClient,
  params: { userId: string; actorId: string; type: NotificationType },
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    actor_id: params.actorId,
    type: params.type,
  });
  // Best-effort: no se propaga. Una notificación fallida no debe deshacer el
  // follow/accept real que ya se confirmó.
  if (error) console.error("notify() failed", error);
}

export async function getUnreadCount(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
  return count ?? 0;
}

// notifications.actor_id apunta a auth.users, no a profiles → sin embedding de
// PostgREST; se resuelve la identidad del actor en un segundo paso (mismo
// patrón que resolveUsers en follows.ts). Se usa profile_identities (no
// profiles) para cubrir también actores con perfil privado.
export async function listNotifications(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, actor_id, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const actorIds = [...new Set(data.map((n) => n.actor_id))];
  const { data: actors, error: actorsError } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", actorIds);

  if (actorsError) throw actorsError;

  const byId = new Map(
    (actors ?? [])
      .filter(
        (a): a is typeof a & { user_id: string; username: string } =>
          a.user_id != null && a.username != null,
      )
      .map((a) => [a.user_id, a]),
  );

  // Si el actor ya no es resoluble (cuenta borrada, RLS), se descarta la fila:
  // no hay a quién enlazar ni qué nombre mostrar.
  return data
    .map((n): Notification | null => {
      const actor = byId.get(n.actor_id);
      if (!actor) return null;
      return {
        id: n.id,
        type: n.type as NotificationType,
        actorId: n.actor_id,
        actorUsername: actor.username,
        actorDisplayName: actor.display_name,
        actorAvatarUrl: actor.avatar_url,
        readAt: n.read_at,
        createdAt: n.created_at,
      };
    })
    .filter((n): n is Notification => n !== null);
}
