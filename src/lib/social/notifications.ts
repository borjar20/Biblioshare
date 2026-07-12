import { getTranslations } from "next-intl/server";
import type { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import type { ItemType } from "@/lib/catalog/types";
import { sendPushToUser, type PushPayload } from "@/lib/push/send-push";
import {
  NOTIFICATION_TYPE_KEY,
  type Notification,
  type NotificationType,
  type ReviewTargetType,
} from "./notification-types";

export type { NotificationType, ReviewTargetType, Notification };
export { NOTIFICATION_TYPE_KEY };

// Notificaciones in-app (EPIC-05, Bloque D, SD-5). Sin push/email/cron: se lee
// al cargar la app (campana). notify() es un efecto secundario best-effort
// llamado desde otras server actions (follow/aceptar/reaccionar/comentar); un
// fallo aquí no debe romper la acción real que lo dispara.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const LIST_LIMIT = 20;

export async function notify(
  supabase: SupabaseServerClient,
  params: {
    userId: string;
    actorId: string;
    type: NotificationType;
    targetType?: ReviewTargetType;
    targetId?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    actor_id: params.actorId,
    type: params.type,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
  });
  // Best-effort: no se propaga. Una notificación fallida no debe deshacer la
  // acción real (follow/accept/reacción/comentario) que ya se confirmó.
  if (error) {
    console.error("notify() failed", error);
    return;
  }

  // Entrega push (E5.D4), también best-effort — nunca debe afectar a la
  // notificación in-app, que ya se insertó arriba con éxito.
  try {
    await deliverPush(supabase, params);
  } catch (pushError) {
    console.error("notify() push delivery failed", pushError);
  }
}

async function deliverPush(
  supabase: SupabaseServerClient,
  params: {
    userId: string;
    actorId: string;
    type: NotificationType;
    targetType?: ReviewTargetType;
    targetId?: string;
  },
): Promise<void> {
  const { data: actor } = await supabase
    .from("profile_identities")
    .select("username, display_name")
    .eq("user_id", params.actorId)
    .maybeSingle();
  if (!actor?.username) return;

  let href = `/u/${actor.username}`;
  if (params.targetType && params.targetId) {
    const hrefByKey = await resolveReviewHrefs(supabase, [
      { targetType: params.targetType, targetId: params.targetId },
    ]);
    href = hrefByKey.get(`${params.targetType}:${params.targetId}`) ?? href;
  }

  const t = await getTranslations("notifications");
  const tCommon = await getTranslations("common");
  const name = actor.display_name || actor.username;

  const payload: PushPayload = {
    title: tCommon("appName"),
    body: t(NOTIFICATION_TYPE_KEY[params.type], { name }),
    url: href,
  };

  await sendPushToUser(supabase, params.userId, payload);
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

// Resuelve el enlace de las notificaciones de reseña en batch (una query por
// tabla fuente, no una por notificación). diary_entry pasa por library_entries
// para saber item_type/item_id; episode_watch ya guarda series_id directo.
async function resolveReviewHrefs(
  supabase: SupabaseServerClient,
  targets: { targetType: string; targetId: string }[],
): Promise<Map<string, string>> {
  const hrefByKey = new Map<string, string>();
  const diaryIds = targets
    .filter((t) => t.targetType === "diary_entry")
    .map((t) => t.targetId);
  const episodeIds = targets
    .filter((t) => t.targetType === "episode_watch")
    .map((t) => t.targetId);

  if (diaryIds.length > 0) {
    const { data: diaryRows, error } = await supabase
      .from("diary_entries")
      .select("id, library_entry_id")
      .in("id", diaryIds);
    if (error) throw error;

    const libraryEntryIds = [
      ...new Set((diaryRows ?? []).map((d) => d.library_entry_id)),
    ];
    const { data: libraryRows, error: libError } = await supabase
      .from("library_entries")
      .select("id, item_type, item_id")
      .in("id", libraryEntryIds);
    if (libError) throw libError;

    const itemByEntry = new Map(
      (libraryRows ?? []).map((l) => [
        l.id,
        { itemType: l.item_type as ItemType, itemId: l.item_id },
      ]),
    );
    for (const d of diaryRows ?? []) {
      const item = itemByEntry.get(d.library_entry_id);
      if (item) {
        hrefByKey.set(
          `diary_entry:${d.id}`,
          `${itemHref(item.itemType, item.itemId)}?tab=community`,
        );
      }
    }
  }

  if (episodeIds.length > 0) {
    const { data: episodeRows, error } = await supabase
      .from("episode_watches")
      .select("id, series_id")
      .in("id", episodeIds);
    if (error) throw error;
    for (const e of episodeRows ?? []) {
      hrefByKey.set(
        `episode_watch:${e.id}`,
        `${itemHref("series", e.series_id)}?tab=community`,
      );
    }
  }

  return hrefByKey;
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
    .select("id, type, actor_id, target_type, target_id, read_at, created_at")
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

  const reviewTargets = data
    .filter(
      (n): n is typeof n & { target_type: string; target_id: string } =>
        n.target_type != null && n.target_id != null,
    )
    .map((n) => ({ targetType: n.target_type, targetId: n.target_id }));
  const hrefByKey = await resolveReviewHrefs(supabase, reviewTargets);

  // Si el actor ya no es resoluble (cuenta borrada, RLS), se descarta la fila:
  // no hay a quién enlazar ni qué nombre mostrar.
  return data
    .map((n): Notification | null => {
      const actor = byId.get(n.actor_id);
      if (!actor) return null;
      const href =
        n.target_type && n.target_id
          ? (hrefByKey.get(`${n.target_type}:${n.target_id}`) ??
            `/u/${actor.username}`)
          : `/u/${actor.username}`;
      return {
        id: n.id,
        type: n.type as NotificationType,
        actorId: n.actor_id,
        actorUsername: actor.username,
        actorDisplayName: actor.display_name,
        actorAvatarUrl: actor.avatar_url,
        href,
        readAt: n.read_at,
        createdAt: n.created_at,
      };
    })
    .filter((n): n is Notification => n !== null);
}
