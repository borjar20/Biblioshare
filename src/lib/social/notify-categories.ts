import type { NotificationType } from "./notification-types";

// Categorías de evento por las que se puede pedir aviso de una persona.
// Sin dependencias server-only: la importa tanto la UI (campana) como el
// fan-out del servidor.
export const NOTIFY_CATEGORIES = ["finished", "session", "episode", "added"] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

export const CATEGORY_NOTIFICATION_TYPE: Record<NotifyCategory, NotificationType> = {
  finished: "followed_finished",
  session: "followed_session",
  episode: "followed_episode",
  added: "followed_added",
};

const VALID = new Set<string>(NOTIFY_CATEGORIES);

// Una server action es un endpoint POST público: valida contra el set permitido,
// descarta desconocidos y deduplica. Entrada no-array → lista vacía.
export function parseNotifyCategories(raw: unknown): NotifyCategory[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<NotifyCategory>();
  for (const v of raw) if (typeof v === "string" && VALID.has(v)) seen.add(v as NotifyCategory);
  return [...seen];
}
