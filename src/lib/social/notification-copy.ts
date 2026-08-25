import type { NotificationContext } from "./notification-context";
import {
  ENRICHED_NOTIFICATION_KEY,
  NOTIFICATION_TYPE_KEY,
  type NotificationType,
} from "./notification-types";

// Lado LECTURA: decide QUÉ clave de traducción usar y con qué valores, a partir
// del contexto guardado. Puro y sin `next-intl` a propósito — devuelve la clave
// y los valores, y quien llama hace el `t()`. Así lo pueden usar igual la
// campana (cliente, `useTranslations`) y el push (servidor, `getTranslations`),
// que hoy coinciden solo por convención y se desincronizarían en cuanto alguien
// tocara una de las dos.

/** Copias agrupadas que ya existían; la agrupación manda sobre el contexto. */
const GROUPED_NOTIFICATION_KEY: Partial<Record<NotificationType, string>> = {
  review_liked: "reviewLikedGrouped",
  club_post_liked: "clubPostLikedGrouped",
  comment_liked: "commentLikedGrouped",
  activity_liked: "activityLikedGrouped",
};

export function notificationCopy(input: {
  type: NotificationType;
  context?: NotificationContext | null;
  name: string;
  extraActorsCount?: number;
  /**
   * Si este dispositivo sabe pintar el emoji. Sin él se asume que sí: es el
   * caso del servidor (el push lo pinta el sistema operativo del móvil, con sus
   * propias fuentes, no nuestro HTML).
   */
  canRenderEmoji?: (emoji: string) => boolean;
}): { key: string; values: Record<string, string | number> } {
  const { type, context, name, extraActorsCount, canRenderEmoji } = input;
  const base = NOTIFICATION_TYPE_KEY[type];

  // Varios actores: el emoji o el extracto de UNO no representa al grupo.
  if (extraActorsCount) {
    return {
      key: GROUPED_NOTIFICATION_KEY[type] ?? base,
      values: { name, count: extraActorsCount },
    };
  }

  const variantes = ENRICHED_NOTIFICATION_KEY[type];
  if (!variantes || !context) return { key: base, values: { name } };

  // El spoiler va PRIMERO: si está marcado, no se cita ni aunque la fila traiga
  // un excerpt (que no debería, pero el JSON no lo impide).
  if (context.spoiler && variantes.spoiler) {
    return { key: variantes.spoiler, values: { name } };
  }
  if (context.excerpt && variantes.excerpt) {
    return { key: variantes.excerpt, values: { name, excerpt: context.excerpt } };
  }
  if (context.emoji && variantes.emoji && (canRenderEmoji?.(context.emoji) ?? true)) {
    return { key: variantes.emoji, values: { name, emoji: context.emoji } };
  }
  if (context.subject && variantes.subject) {
    return { key: variantes.subject, values: { name, subject: context.subject } };
  }

  return { key: base, values: { name } };
}
