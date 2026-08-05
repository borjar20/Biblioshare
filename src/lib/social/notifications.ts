import { getTranslations } from "next-intl/server";
import type { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import type { ItemType } from "@/lib/catalog/types";
import { sendPushToUser, sendPushToUsers } from "@/lib/push/send-push";
import { NOTIFICATION_CATEGORY, type PushContent } from "@/lib/push/types";
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

// notify() (singular) sigue exigiendo actor: todos sus llamantes son acciones de
// una persona. El aviso sin actor va por notifyMany con systemDelivery.
export async function notify(
  supabase: SupabaseServerClient,
  params: {
    userId: string;
    actorId: string;
    type: NotificationType;
    targetType?: ReviewTargetType;
    targetId?: string;
    interactionTargetId?: string;
    // Clave de idempotencia opcional (spec item 9). Si se pasa y ya existe una
    // notificación con esa clave, no se inserta otra NI se manda push. Hoy la
    // usan las reacciones (un relike no debe volver a avisar). Sin clave, el
    // comportamiento es el de siempre (insert normal).
    dedupeKey?: string;
  },
): Promise<void> {
  try {
    if (await usersAreBlocked(supabase, params.userId)) return;
  } catch (blockError) {
    console.error("notify() block check failed", blockError);
    return;
  }

  const notificationWriter = createServiceRoleClient();
  const row = {
    user_id: params.userId,
    actor_id: params.actorId,
    type: params.type,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    interaction_target_id: params.interactionTargetId ?? null,
    dedupe_key: params.dedupeKey ?? null,
  };
  // .select() recupera el id de la fila (viaja en el data payload del push, spec
  // item 8). Con dedupeKey se hace upsert(ignoreDuplicates): si ya existía, no
  // devuelve fila (maybeSingle → null) y se salta también el push.
  const { data: inserted, error } = params.dedupeKey
    ? await notificationWriter
        .from("notifications")
        .upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true })
        .select("id")
        .maybeSingle()
    : await notificationWriter.from("notifications").insert(row).select("id").single();
  // Best-effort: no se propaga. Una notificación fallida no debe deshacer la
  // acción real (follow/accept/reacción/comentario) que ya se confirmó.
  if (error) {
    console.error("notify() failed", error);
    return;
  }
  // Duplicada (dedupeKey ya existía): la notificación no es nueva, no hay push.
  if (params.dedupeKey && !inserted) return;

  // Entrega push (E5.D4), también best-effort — nunca debe afectar a la
  // notificación in-app, que ya se insertó arriba con éxito.
  try {
    await deliverPush(supabase, params, inserted?.id);
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
    actorId: string | null;
    type: NotificationType;
    targetType?: ReviewTargetType;
    targetId?: string;
    interactionTargetId?: string;
  },
): Promise<PushContent | null> {
  // Sin actor (aviso del sistema) no se busca perfil y no se aborta: el enlace sale
  // del target. Con actor que no resuelve sí se aborta, porque la copy por defecto
  // lleva su nombre.
  const { data: actor } = params.actorId
    ? await supabase
        .from("profile_identities")
        .select("username, display_name")
        .eq("user_id", params.actorId)
        .maybeSingle()
    : { data: null };
  if (params.actorId && !actor?.username) return null;

  let href = actor?.username ? `/u/${actor.username}` : "/";
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
  // Sin actor el `{name}` de la copy no tiene con qué rellenarse. Los avisos del
  // sistema siempre traen su propio `pushBody` (que lo sustituye entero), así que
  // este cuerpo por defecto solo es el respaldo de un caso que no debería darse.
  const name = actor?.display_name || actor?.username || tCommon("appName");

  return {
    // La categoría se deriva del tipo (no se pasa suelta): gobierna las
    // preferencias del destinatario y el canal Android.
    category: NOTIFICATION_CATEGORY[params.type],
    type: params.type,
    title: tCommon("appName"),
    body: t(NOTIFICATION_TYPE_KEY[params.type], { name }),
    path: href,
    actorUserId: params.actorId ?? undefined,
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
  notificationId?: string,
): Promise<void> {
  const content = await buildPushPayload(supabase, params);
  if (!content) return;
  await sendPushToUser(params.userId, content, notificationId);
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
    /** null = aviso del sistema, sin persona detrás. Exige systemDelivery. */
    actorId: string | null;
    type: NotificationType;
    targetType?: ReviewTargetType;
    targetId?: string;
    interactionTargetId?: string;
    // Aviso EMITIDO POR EL SISTEMA, no por una persona: hoy solo el recordatorio
    // de evento (spec 2026-08-04), disparado por el trabajo programado. Cambia dos
    // cosas, y las dos por la misma razón — que aquí no hay un actor que actúe:
    //
    //  1. El actor SÍ se notifica a sí mismo. Normalmente no (nadie quiere «has
    //     comentado tu propio post»), pero el actor de un recordatorio es el
    //     organizador solo porque notifications.actor_id es NOT NULL, y el
    //     organizador debe recibir el recordatorio de su propio evento (§18).
    //  2. Se salta el filtro de bloqueos. No es una comodidad: es obligatorio y
    //     además es lo correcto.
    //     - Obligatorio porque `filter_unblocked_user_ids` devuelve un array VACÍO
    //       cuando `auth.uid()` es null, y el barrido corre con service_role, sin
    //       sesión. Sin esto NINGÚN recordatorio se entrega jamás (medido: claimed
    //       3, delivered 0).
    //     - Correcto porque quien recibe el recordatorio LO PIDIÓ al seguir el
    //       evento. El aviso es sobre el evento, no sobre el organizador; que haya
    //       bloqueado a esa persona no es motivo para tragarse un recordatorio que
    //       configuró él mismo.
    //     Nótese que esto NO afloja el filtro para nadie más: el resto de
    //     llamantes lo siguen pasando, y la función SQL sigue igual de estricta.
    systemDelivery?: boolean;
    // pushBody: el cuerpo por defecto se construye desde una clave i18n con solo
    // {name}, y un recordatorio necesita evento, club, hora y tiempo restante
    // (§9.3). Cuando llega, sustituye al cuerpo; el título y el enlace se siguen
    // resolviendo igual.
    pushBody?: string;
  },
): Promise<string[]> {
  const candidateIds = [...new Set(params.userIds)].filter(
    (id) => params.systemDelivery || id !== params.actorId,
  );
  let userIds: string[];
  if (params.systemDelivery) {
    userIds = candidateIds;
  } else {
    try {
      userIds = await filterUnblockedUserIds(supabase, candidateIds);
    } catch (blockError) {
      console.error("notifyMany() block check failed", blockError);
      return [];
    }
  }
  if (userIds.length === 0) return [];

  // Map user_id → notificationId de la fila recién insertada (1:1: cada usuario
  // recibe una sola fila). Viaja en el data payload del push (spec item 8).
  let notificationIdByUser = new Map<string, string>();
  try {
    const notificationWriter = createServiceRoleClient();
    const { data: insertedRows, error } = await notificationWriter
      .from("notifications")
      .insert(
        userIds.map((userId) => ({
          user_id: userId,
          actor_id: params.actorId,
          type: params.type,
          target_type: params.targetType ?? null,
          target_id: params.targetId ?? null,
          interaction_target_id: params.interactionTargetId ?? null,
        })),
      )
      .select("id, user_id");
    if (error) throw error;
    notificationIdByUser = new Map((insertedRows ?? []).map((r) => [r.user_id, r.id]));
  } catch (writerError) {
    console.error("notifyMany() failed", writerError);
    return [];
  }

  try {
    const content = await buildPushPayload(supabase, params);
    // El cuerpo a medida sustituye al de la clave i18n, pero se conserva el
    // título y —sobre todo— la ruta que ya resolvió buildPushPayload: es lo que
    // hace que la notificación abra la ficha correcta.
    if (content) {
      await sendPushToUsers(
        userIds,
        params.pushBody ? { ...content, body: params.pushBody } : content,
        { notificationIdByUser },
      );
    }
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
  // club_activities con kind='evento'), pero su ficha NO es /actividad/[id] --
  // esa ruta sigue devolviendo 404 para eventos (hasDetailView es false, y con
  // razón: ActivityDetailView está montado sobre el pool de ítems, los
  // participantes y las opiniones, que un evento no tiene). Desde la spec
  // 2026-08-04 tiene la suya en /evento/[id], que es donde debe abrir el
  // recordatorio: llevar a la ficha del club dejaría al usuario buscando a mano
  // el evento del que le acabamos de avisar.
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
      if (slug) hrefByKey.set(`club_event:${a.id}`, `/club/${slug}/evento/${a.id}`);
    }
  }

  if (commentIds.length > 0) {
    // El target canónico de un comentario hereda el href de su padre
    // (private.sync_comment_interaction_target), así que basta con leerlo: ya no
    // hace falta recorrer el par polimórfico ni recursar sobre el padre.
    const { data: commentTargets } = await supabase
      .from("interaction_targets")
      .select("source_id, href")
      .eq("kind", "comment")
      .in("source_id", commentIds);
    for (const t of commentTargets ?? []) {
      hrefByKey.set(`comment:${t.source_id}`, t.href);
    }
  }

  const clubRoundIds = targets.filter((t) => t.targetType === "club_round").map((t) => t.targetId);
  if (clubRoundIds.length > 0) {
    // Igual que comment arriba: private.sync_club_round_interaction_target
    // (20260803_club_rounds.sql) ya calcula y guarda
    // '/club/' || slug || '?ronda=' || period_key al insertar la ronda. Se
    // lee de ahí en vez de recalcularlo con un segundo join a clubs -- así
    // los dos caminos no pueden divergir, son literalmente el mismo valor.
    const { data: roundTargets } = await supabase
      .from("interaction_targets")
      .select("source_id, href")
      .eq("kind", "club_round")
      .in("source_id", clubRoundIds);
    for (const t of roundTargets ?? []) {
      hrefByKey.set(`club_round:${t.source_id}`, t.href);
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

  const actorIds = [
    ...new Set(
      representativeRows
        .map((n) => n.actor_id)
        .filter((id): id is string => id != null),
    ),
  ];
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

  // Sin actor_id la notificación la emitió el SISTEMA (recordatorio de evento) y
  // es válida: su enlace sale del target, no del perfil de nadie.
  //
  // Con actor_id que ya no resuelve (cuenta borrada, RLS) SÍ se descarta la fila:
  // ahí sí faltaría el nombre que la copy necesita. Son dos casos distintos y no
  // se pueden colapsar en un solo `if (!actor)`.
  return grouped
    .map(({ row: n, extraActorsCount }): Notification | null => {
      const actor = n.actor_id ? byId.get(n.actor_id) : null;
      if (n.actor_id && !actor) return null;

      const fallbackHref = actor ? `/u/${actor.username}` : "/";
      const href =
        n.interaction_target_id
          ? (targetById.get(n.interaction_target_id)?.href ?? fallbackHref)
          : n.target_type && n.target_id
          ? (hrefByKey.get(`${n.target_type}:${n.target_id}`) ?? fallbackHref)
          : fallbackHref;
      return {
        id: n.id,
        type: n.type as NotificationType,
        actorId: n.actor_id,
        actorUsername: actor?.username ?? null,
        actorDisplayName: actor?.display_name ?? null,
        actorAvatarUrl: actor?.avatar_url ?? null,
        href,
        interactionTargetId: n.interaction_target_id ?? undefined,
        readAt: n.read_at,
        createdAt: n.created_at,
        extraActorsCount: extraActorsCount > 0 ? extraActorsCount : undefined,
      };
    })
    .filter((n): n is Notification => n !== null);
}
