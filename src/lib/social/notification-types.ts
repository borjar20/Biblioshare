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
  | "club_activity_proposed"
  | "club_activity_activated"
  | "club_activity_spawned"
  | "club_event_created"
  | "mentioned";

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
  | "club_event";

export type Notification = {
  id: string;
  type: NotificationType;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  href: string;
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
  club_activity_proposed: "clubActivityProposed",
  club_activity_activated: "clubActivityActivated",
  club_activity_spawned: "clubActivitySpawned",
  club_event_created: "clubEventCreated",
  mentioned: "mentioned",
};
