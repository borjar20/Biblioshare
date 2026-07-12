// Tipos/constantes de notificaciones sin dependencias server-only. Separado
// de notifications.ts para que componentes cliente (notification-bell.tsx)
// puedan importarlos sin arrastrar send-push.ts (web-push, node:tls/net) al
// bundle del navegador — ver E5.D4.

export type NotificationType =
  | "follow_request"
  | "new_follower"
  | "follow_accepted"
  | "review_liked"
  | "review_commented";

export type ReviewTargetType = "diary_entry" | "episode_watch";

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
};

export const NOTIFICATION_TYPE_KEY: Record<NotificationType, string> = {
  follow_request: "followRequest",
  new_follower: "newFollower",
  follow_accepted: "followAccepted",
  review_liked: "reviewLiked",
  review_commented: "reviewCommented",
};
