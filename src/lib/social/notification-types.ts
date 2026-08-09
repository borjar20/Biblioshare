// Tipos/constantes de notificaciones sin dependencias server-only. Separado
// de notifications.ts para que componentes cliente (notification-bell.tsx)
// puedan importarlos sin arrastrar send-push.ts (web-push, node:tls/net) al
// bundle del navegador — ver E5.D4.

export type NotificationType =
  | "follow_request"
  | "new_follower"
  | "follow_accepted"
  | "review_liked"
  | "review_commented"
  | "club_invite"
  | "club_invite_accepted"
  // Solicitudes de entrada a un club privado. Los dos valores ya existían en el
  // enum de la BD, reservados desde el principio y sin usar hasta ahora.
  | "club_join_request"
  | "club_join_approved"
  | "club_post"
  | "club_post_liked"
  | "club_post_commented"
  | "comment_liked"
  | "activity_liked"
  | "activity_commented"
  | "checkpoint_commented"
  | "club_activity_proposed"
  | "club_activity_activated"
  | "club_activity_spawned"
  | "club_event_created"
  // Los tres del seguimiento de eventos (spec 2026-08-04). `club_event_reminder`
  // es el ÚNICO tipo que no lo dispara una persona: lo manda el trabajo
  // programado. Como notifications.actor_id es NOT NULL, su actor es el
  // organizador del evento — se prefirió eso a hacer nullable una columna del
  // núcleo, que habría obligado a auditar cada lector de la campana y del push.
  | "club_event_reminder"
  | "club_event_updated"
  | "club_event_cancelled"
  | "followed_finished"
  | "followed_session"
  | "followed_episode"
  | "followed_added"
  | "club_round_proposed"
  | "club_round_commented"
  | "club_round_liked"
  | "mentioned"
  // Fase 2 «Pensamiento» (2026-08-06): el disparo ya vive en la migración
  // 20260835_thoughts.sql (comment_notification_type/reaction_notification_type
  // de interaction_targets) — la copia de es.json llegó con la tarjeta (Fase 5).
  | "thought_commented"
  | "thought_liked"
  // Fase «Posts» (2026-08-09): mismo patrón que thought_* — el disparo vive en
  // la migración de posts (comment/reaction_notification_type de
  // interaction_targets). La copia de es.json va con esta tarjeta.
  | "post_commented"
  | "post_liked";

export type ReviewTargetType =
  | "diary_entry"
  | "episode_watch"
  | "club"
  | "club_post"
  | "comment"
  | "club_activity"
  // Igual que club_activity (fila de club_activities) pero para un evento: un
  // evento no tiene página de detalle (/club/[slug]/actividad/[id] da 404 a
  // propósito para kind='evento'), así que necesita su propio target_type para
  // que resolveTargetHrefs() lo resuelva a la ficha del club en vez de a la
  // actividad.
  | "club_event"
  // Una ronda tampoco tiene página propia: resolveTargetHrefs() lee el href
  // directo de interaction_targets (kind='club_round'), el mismo que ya
  // escribe el trigger private.sync_club_round_interaction_target
  // ('/club/'||slug||'?ronda='||period_key) -- no se recalcula, así que no
  // puede divergir de él.
  | "club_round";

export type Notification = {
  id: string;
  type: NotificationType;
  // null = emitida por el SISTEMA, no por una persona (hoy solo el recordatorio
  // de evento). Los cuatro campos de actor van juntos: o hay actor y están los
  // cuatro, o no hay y son null. Ver la migración 20260825.
  actorId: string | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  href: string;
  interactionTargetId?: string;
  readAt: string | null;
  createdAt: string;
  // Cuántos otros actores dispararon el mismo tipo de notificación sobre el
  // mismo target (p. ej. varios likes sobre la misma reseña) — se agrupan en
  // una sola fila al listar, mostrando el actor más reciente + este contador.
  extraActorsCount?: number;
};

export const NOTIFICATION_TYPE_KEY: Record<NotificationType, string> = {
  follow_request: "followRequest",
  new_follower: "newFollower",
  follow_accepted: "followAccepted",
  review_liked: "reviewLiked",
  review_commented: "reviewCommented",
  club_invite: "clubInvite",
  club_invite_accepted: "clubInviteAccepted",
  club_join_request: "clubJoinRequest",
  club_join_approved: "clubJoinApproved",
  club_post: "clubPost",
  club_post_liked: "clubPostLiked",
  club_post_commented: "clubPostCommented",
  comment_liked: "commentLiked",
  activity_liked: "activityLiked",
  activity_commented: "activityCommented",
  checkpoint_commented: "checkpointCommented",
  club_activity_proposed: "clubActivityProposed",
  club_activity_activated: "clubActivityActivated",
  club_activity_spawned: "clubActivitySpawned",
  club_event_created: "clubEventCreated",
  club_event_reminder: "clubEventReminder",
  club_event_updated: "clubEventUpdated",
  club_event_cancelled: "clubEventCancelled",
  followed_finished: "followedFinished",
  followed_session: "followedSession",
  followed_episode: "followedEpisode",
  followed_added: "followedAdded",
  club_round_proposed: "clubRoundProposed",
  club_round_commented: "clubRoundCommented",
  club_round_liked: "clubRoundLiked",
  mentioned: "mentioned",
  thought_commented: "thoughtCommented",
  thought_liked: "thoughtLiked",
  post_commented: "postCommented",
  post_liked: "postLiked",
};
