import { getTranslations } from "next-intl/server";
import type { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import type { ItemType } from "@/lib/catalog/types";
import { sendPushToUser, sendPushToUsers, type PushPayload } from "@/lib/push/send-push";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  NOTIFICATION_TYPE_KEY,
  type Notification,
  type NotificationType,
  type ReviewTargetType,
} from "./notification-types";
import { filterUnblockedUserIds, usersAreBlocked } from "./block-state";

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
    interactionTargetId?: string;
  },
): Promise<void> {
  try {
    if (await usersAreBlocked(supabase, params.userId)) return;
  } catch (blockError) {
    console.error("notify() block check failed", blockError);
    return;
  }

  const notificationWriter = createServiceRoleClient();
  const { error } = await notificationWriter.from("notifications").insert({
    user_id: params.userId,
    actor_id: params.actorId,
    type: params.type,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    interaction_target_id: params.interactionTargetId ?? null,
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

// Construye el payload push (identidad del actor + href del target +
// traducciones) UNA vez — compartido entre la entrega individual (deliverPush)
// y el fan-out en lote (notifyMany), donde el payload es idéntico para todos
// los destinatarios y repetir esta resolución por miembro era el grueso del
// coste.
async function buildPushPayload(
  supabase: SupabaseServerClient,
  params: {
    actorId: string;
    type: NotificationType;
    targetType?: ReviewTargetType;
    targetId?: string;
    interactionTargetId?: string;
  },
): Promise<PushPayload | null> {
  const { data: actor } = await supabase
    .from("profile_identities")
    .select("username, display_name")
    .eq("user_id", params.actorId)
    .maybeSingle();
  if (!actor?.username) return null;

  let href = `/u/${actor.username}`;
  if (params.interactionTargetId) {
    const targetById = await resolveInteractionTargetMetadata(supabase, [
      params.interactionTargetId,
    ]);
    href = targetById.get(params.interactionTargetId)?.href ?? href;
  } else if (params.targetType && params.targetId) {
    const hrefByKey = await resolveTargetHrefs(supabase, [
      { targetType: params.targetType, targetId: params.targetId },
    ]);
    href = hrefByKey.get(`${params.targetType}:${params.targetId}`) ?? href;
  }

  const t = await getTranslations("notifications");
  const tCommon = await getTranslations("common");
  const name = actor.display_name || actor.username;

  return {
    title: tCommon("appName"),
    body: t(NOTIFICATION_TYPE_KEY[params.type], { name }),
    url: href,
  };
}

async function deliverPush(
  supabase: SupabaseServerClient,
  params: {
    userId: string;
    actorId: string;
    type: NotificationType;
    targetType?: ReviewTargetType;
    targetId?: string;
    interactionTargetId?: string;
  },
): Promise<void> {
  const payload = await buildPushPayload(supabase, params);
  if (!payload) return;
  await sendPushToUser(params.userId, payload);
}

// Fan-out a varios destinatarios (post/actividad de club): UNA inserción
// multi-fila para las notificaciones in-app y UNA entrega push en lote, en vez
// de notify() por miembro (que costaba ~5 queries + envíos secuenciales por
// cabeza y bloqueaba la server action del autor en clubes grandes). Mismo
// contrato best-effort que notify(): nunca lanza.
export async function notifyMany(
  supabase: SupabaseServerClient,
  params: {
    userIds: string[];
    actorId: string;
    type: NotificationType;
    targetType?: ReviewTargetType;
    targetId?: string;
    interactionTargetId?: string;
  },
): Promise<string[]> {
  const candidateIds = [...new Set(params.userIds)].filter((id) => id !== params.actorId);
  let userIds: string[];
  try {
    userIds = await filterUnblockedUserIds(supabase, candidateIds);
  } catch (blockError) {
    console.error("notifyMany() block check failed", blockError);
    return [];
  }
  if (userIds.length === 0) return [];

  try {
    const notificationWriter = createServiceRoleClient();
    const { error } = await notificationWriter.from("notifications").insert(
      userIds.map((userId) => ({
        user_id: userId,
        actor_id: params.actorId,
        type: params.type,
        target_type: params.targetType ?? null,
        target_id: params.targetId ?? null,
        interaction_target_id: params.interactionTargetId ?? null,
      })),
    );
    if (error) throw error;
  } catch (writerError) {
    console.error("notifyMany() failed", writerError);
    return [];
  }

  try {
    const payload = await buildPushPayload(supabase, params);
    if (payload) await sendPushToUsers(userIds, payload);
  } catch (pushError) {
    console.error("notifyMany() push delivery failed", pushError);
  }
  return userIds;
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

// Resuelve el enlace de una notificación en batch (una query por tabla
// fuente, no una por notificación). diary_entry ya tiene item_type/item_id
// como columnas propias (§Tarea 9, hub); episode_watch ya guarda series_id
// directo.
// club/club_post/comment se resuelven aquí también ahora (EPIC-05 Bloque F)
// -- antes 'club' vivía como un caso especial duplicado en deliverPush() y
// listNotifications(); se unifica en una sola función para no triplicar la
// resolución de club_post/comment (más compleja que el 'club' original) en
// dos sitios.
async function resolveTargetHrefs(
  supabase: SupabaseServerClient,
  targets: { targetType: string; targetId: string }[],
): Promise<Map<string, string>> {
  const hrefByKey = new Map<string, string>();
  const diaryIds = targets.filter((t) => t.targetType === "diary_entry").map((t) => t.targetId);
  const episodeIds = targets.filter((t) => t.targetType === "episode_watch").map((t) => t.targetId);
  const clubIds = targets.filter((t) => t.targetType === "club").map((t) => t.targetId);
  const clubPostIds = targets.filter((t) => t.targetType === "club_post").map((t) => t.targetId);
  const commentIds = targets.filter((t) => t.targetType === "comment").map((t) => t.targetId);
  const clubActivityIds = targets.filter((t) => t.targetType === "club_activity").map((t) => t.targetId);
  const clubEventIds = targets.filter((t) => t.targetType === "club_event").map((t) => t.targetId);

  if (diaryIds.length > 0) {
    const { data: diaryRows, error } = await supabase
      .from("passes")
      .select("id, item_type, item_id")
      .in("id", diaryIds);
    if (error) throw error;

    for (const d of diaryRows ?? []) {
      hrefByKey.set(
        `diary_entry:${d.id}`,
        `${itemHref(d.item_type as ItemType, d.item_id)}?tab=community`,
      );
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

  if (clubIds.length > 0) {
    const { data: clubRows } = await supabase.from("clubs").select("id, slug").in("id", clubIds);
    for (const c of clubRows ?? []) hrefByKey.set(`club:${c.id}`, `/club/${c.slug}`);
  }

  if (clubPostIds.length > 0) {
    const { data: postRows } = await supabase
      .from("club_posts")
      .select("id, club_id")
      .in("id", clubPostIds);
    const clubIdsForPosts = [...new Set((postRows ?? []).map((p) => p.club_id))];
    const { data: clubRows } = clubIdsForPosts.length
      ? await supabase.from("clubs").select("id, slug").in("id", clubIdsForPosts)
      : { data: [] as { id: string; slug: string }[] };
    const slugByClub = new Map((clubRows ?? []).map((c) => [c.id, c.slug]));
    for (const p of postRows ?? []) {
      const slug = slugByClub.get(p.club_id);
      if (slug) hrefByKey.set(`club_post:${p.id}`, `/club/${slug}`);
    }
  }

  if (clubActivityIds.length > 0) {
    const { data: activityRows } = await supabase
      .from("club_activities")
      .select("id, club_id")
      .in("id", clubActivityIds);
    const clubIdsForActivities = [...new Set((activityRows ?? []).map((a) => a.club_id))];
    const { data: clubRows } = clubIdsForActivities.length
      ? await supabase.from("clubs").select("id, slug").in("id", clubIdsForActivities)
      : { data: [] as { id: string; slug: string }[] };
    const slugByClub = new Map((clubRows ?? []).map((c) => [c.id, c.slug]));
    for (const a of activityRows ?? []) {
      const slug = slugByClub.get(a.club_id);
      if (slug) hrefByKey.set(`club_activity:${a.id}`, `/club/${slug}/actividad/${a.id}`);
    }
  }

  // club_event: misma tabla que club_activity (un evento es una fila de
  // club_activities con kind='evento'), pero sin página de detalle propia por
  // diseño (hasDetailView en kinds/evento.ts) -- así que enlaza a la ficha del
  // club, no a /actividad/[id].
  if (clubEventIds.length > 0) {
    const { data: eventRows } = await supabase
      .from("club_activities")
      .select("id, club_id")
      .in("id", clubEventIds);
    const clubIdsForEvents = [...new Set((eventRows ?? []).map((a) => a.club_id))];
    const { data: clubRows } = clubIdsForEvents.length
      ? await supabase.from("clubs").select("id, slug").in("id", clubIdsForEvents)
      : { data: [] as { id: string; slug: string }[] };
    const slugByClub = new Map((clubRows ?? []).map((c) => [c.id, c.slug]));
    for (const a of eventRows ?? []) {
      const slug = slugByClub.get(a.club_id);
      if (slug) hrefByKey.set(`club_event:${a.id}`, `/club/${slug}`);
    }
  }

  if (commentIds.length > 0) {
    const { data: commentRows } = await supabase
      .from("comments")
      .select("id, target_type, target_id")
      .in("id", commentIds);
    const parentTargets = (commentRows ?? []).map((c) => ({
      targetType: c.target_type,
      targetId: c.target_id,
    }));
    // Recursión de un solo nivel: comments_no_nesting (Task 1) garantiza que
    // el target de un comentario nunca es 'comment', así que esta llamada
    // recursiva termina siempre en su segunda pasada.
    const parentHrefByKey = await resolveTargetHrefs(supabase, parentTargets);
    for (const c of commentRows ?? []) {
      const parentHref = parentHrefByKey.get(`${c.target_type}:${c.target_id}`);
      if (parentHref) hrefByKey.set(`comment:${c.id}`, parentHref);
    }
  }

  return hrefByKey;
}

async function resolveInteractionTargetMetadata(
  supabase: SupabaseServerClient,
  targetIds: string[],
): Promise<
  Map<string, { href: string; reactionNotificationType: NotificationType | null }>
> {
  const uniqueIds = [...new Set(targetIds)];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("interaction_targets")
    .select("id, href, reaction_notification_type")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(
    (data ?? []).map((target) => [
      target.id,
      {
        href: target.href,
        reactionNotificationType: target.reaction_notification_type as NotificationType | null,
      },
    ]),
  );
}

const READ_EXPIRY_MS = 5 * 60 * 1000;
// Las notificaciones que nunca se marcan como leídas no las tocaba ninguna
// limpieza — crecían sin límite. Se purgan por edad, muy por encima de lo que
// la campana llega a mostrar (LIST_LIMIT).
const AGE_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

// notifications.actor_id apunta a auth.users, no a profiles → sin embedding de
// PostgREST; se resuelve la identidad del actor en un segundo paso (mismo
// patrón que resolveUsers en follows.ts). Se usa profile_identities (no
// profiles) para cubrir también actores con perfil privado.
export async function listNotifications(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<Notification[]> {
  // Limpieza perezosa, sin cron (mismo espíritu que la limpieza de
  // suscripciones push caducadas): las notificaciones ya leídas se borran
  // 5 minutos después de marcarse como leídas, en cada carga de la campana,
  // en vez de acumularse indefinidamente en la tabla.
  const readCutoff = new Date(Date.now() - READ_EXPIRY_MS).toISOString();
  const ageCutoff = new Date(Date.now() - AGE_EXPIRY_MS).toISOString();
  const { error: cleanupError } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", userId)
    .or(`and(read_at.not.is.null,read_at.lt."${readCutoff}"),created_at.lt."${ageCutoff}"`);
  if (cleanupError) {
    console.error("listNotifications: cleanup failed", cleanupError);
  }

  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, type, actor_id, target_type, target_id, interaction_target_id, read_at, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const targetById = await resolveInteractionTargetMetadata(
    supabase,
    data
      .map((row) => row.interaction_target_id)
      .filter((id): id is string => id != null),
  );

  // Agrupa varias reacciones del mismo tipo sobre el mismo target (p. ej.
  // varios likes en la misma reseña) en una sola fila representativa — data
  // ya viene ordenado por created_at desc, así que la primera fila vista de
  // cada grupo es automáticamente la más reciente.
  const groups = new Map<string, { row: (typeof data)[number]; extraActorsCount: number }>();
  const groupOrder: string[] = [];
  for (const row of data) {
    const target = row.interaction_target_id
      ? targetById.get(row.interaction_target_id)
      : undefined;
    const key =
      row.interaction_target_id && row.type === target?.reactionNotificationType
        ? `${row.type}:${row.interaction_target_id}`
        : `solo:${row.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.extraActorsCount += 1;
    } else {
      groups.set(key, { row, extraActorsCount: 0 });
      groupOrder.push(key);
    }
  }
  const grouped = groupOrder.map((key) => groups.get(key)!);
  const representativeRows = grouped.map((g) => g.row);

  const actorIds = [...new Set(representativeRows.map((n) => n.actor_id))];
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

  const targets = representativeRows
    .filter(
      (n): n is typeof n & { target_type: string; target_id: string } =>
        n.interaction_target_id == null && n.target_type != null && n.target_id != null,
    )
    .map((n) => ({ targetType: n.target_type, targetId: n.target_id }));
  const hrefByKey = await resolveTargetHrefs(supabase, targets);

  // Si el actor ya no es resoluble (cuenta borrada, RLS), se descarta la fila:
  // no hay a quién enlazar ni qué nombre mostrar.
  return grouped
    .map(({ row: n, extraActorsCount }): Notification | null => {
      const actor = byId.get(n.actor_id);
      if (!actor) return null;
      const href =
        n.interaction_target_id
          ? (targetById.get(n.interaction_target_id)?.href ?? `/u/${actor.username}`)
          : n.target_type && n.target_id
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
        interactionTargetId: n.interaction_target_id ?? undefined,
        readAt: n.read_at,
        createdAt: n.created_at,
        extraActorsCount: extraActorsCount > 0 ? extraActorsCount : undefined,
      };
    })
    .filter((n): n is Notification => n !== null);
}
