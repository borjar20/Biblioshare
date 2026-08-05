// Contrato común de notificación (spec 2026-08-05-unified-notifications). Una
// notificación lógica (ya creada en `notifications`) se traduce a un
// NotificationEvent y se reparte por los transportes activos del destinatario.
//
// Sin dependencias server-only: lo importan tanto el dispatcher (servidor) como
// el registro nativo (cliente, para leer type/path del data payload).

import type { NotificationType } from "@/lib/social/notification-types";

export type { NotificationType };

// Espeja el enum public.push_platform (20260828_push_devices.sql). Se declara a
// mano en vez de importar de database.types para no arrastrar ese módulo al
// bundle cliente por un union de tres strings.
export type PushPlatform = "web_push" | "fcm_android" | "apns_ios";

// Categoría de un aviso: gobierna las preferencias (notification_preferences) y
// el canal Android (biblioshare_<category>). Se deriva del tipo, no se pasa
// suelta, para que no puedan divergir — ver NOTIFICATION_CATEGORY.
export type PushCategory = "social" | "clubs" | "progress" | "system";

// El evento lógico. `type: NotificationType` (más fuerte que el `string` de la
// spec); `path` es SIEMPRE una ruta interna ya validada (ver safe-path.ts).
export type NotificationEvent = {
  notificationId?: string;
  recipientUserId: string;
  category: PushCategory;
  type: NotificationType;
  title: string;
  body: string;
  path: string;
  imageUrl?: string;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string;
};

// Lo compartido por todos los destinatarios de un fan-out (post/actividad de
// club): el evento sin los campos por-destinatario. El dispatcher lo expande a
// un NotificationEvent por cada usuario añadiendo recipientUserId + su
// notificationId. Así la resolución de título/cuerpo/ruta se hace UNA vez.
export type PushContent = Omit<NotificationEvent, "recipientUserId" | "notificationId">;

// Subconjunto de una fila de push_devices que un transporte necesita para
// entregar. La salud (last_error, failure_count…) la gestiona el dispatcher.
export type PushDevice = {
  id: string;
  platform: PushPlatform;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  token: string | null;
};

// Resultado de UN intento de entrega a UN dispositivo. El dispatcher lo traduce
// a salud del dispositivo: invalid_token → enabled=false; temporary_error →
// failure_count++; sent → last_success_at.
export type PushDeliveryOutcome =
  | "sent"
  | "invalid_token" // definitivamente inválido: apagar, no reintentar
  | "temporary_error" // transitorio (5xx, red, rate limit): mantener activo
  | "skipped"; // no se intentó (preferencia desactivada)

export type PushDeliveryResult = {
  deviceId: string;
  outcome: PushDeliveryOutcome;
  errorCode?: string;
};

// Transportes separados por canal (spec item 6). El formateo (título, cuerpo,
// categoría, ruta) ya viene resuelto en el NotificationEvent — un transporte
// solo lo pone en el formato de su canal y lo envía.
export interface PushTransport {
  send(device: PushDevice, event: NotificationEvent): Promise<PushDeliveryResult>;
}

// Categoría por tipo. Record (no Partial) a propósito: si se añade un
// NotificationType y se olvida su categoría, esto NO compila. Criterio: se
// clasifica por CONTENIDO, no por quién lo emite (club_event_reminder lo manda
// el sistema pero es contenido de club → clubs).
export const NOTIFICATION_CATEGORY: Record<NotificationType, PushCategory> = {
  follow_request: "social",
  new_follower: "social",
  follow_accepted: "social",
  review_liked: "social",
  review_commented: "social",
  comment_liked: "social",
  activity_liked: "social",
  activity_commented: "social",
  checkpoint_commented: "social",
  mentioned: "social",
  club_invite: "clubs",
  club_invite_accepted: "clubs",
  club_join_request: "clubs",
  club_join_approved: "clubs",
  club_post: "clubs",
  club_post_liked: "clubs",
  club_post_commented: "clubs",
  club_activity_proposed: "clubs",
  club_activity_activated: "clubs",
  club_activity_spawned: "clubs",
  club_event_created: "clubs",
  club_event_reminder: "clubs",
  club_event_updated: "clubs",
  club_event_cancelled: "clubs",
  club_round_proposed: "clubs",
  club_round_commented: "clubs",
  club_round_liked: "clubs",
  followed_finished: "progress",
  followed_session: "progress",
  followed_episode: "progress",
  followed_added: "progress",
};

// Canal de notificación Android por categoría (spec item 8). El registro nativo
// crea estos canales y el FcmAndroidTransport etiqueta cada mensaje con el suyo.
export const ANDROID_CHANNEL_BY_CATEGORY: Record<PushCategory, string> = {
  social: "biblioshare_social",
  clubs: "biblioshare_clubs",
  progress: "biblioshare_progress",
  system: "biblioshare_system",
};
