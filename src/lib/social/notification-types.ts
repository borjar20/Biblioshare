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
  | "club_post"
  | "club_post_liked"
  | "club_post_commented"
  | "comment_liked";

export type ReviewTargetType = "diary_entry" | "episode_watch" | "club" | "club_post" | "comment";

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
  club_post: "clubPost",
  club_post_liked: "clubPostLiked",
  club_post_commented: "clubPostCommented",
  comment_liked: "commentLiked",
};
