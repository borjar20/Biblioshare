import type { NotificationType } from "./notification-types";
import { POST_KINDS, type PostKind } from "./post-kinds";

// Dos ejes distintos, y mezclarlos fue el error del modelo anterior:
//
//   NotifyCategory  — lo que la persona ACTIVA en la campana de un perfil. Tres
//                     valores, agrupados por naturaleza del post.
//   NotificationType — lo que decide el TEXTO del aviso. Uno por post.kind, para
//                     que la campana diga "terminó Dune" y no "publicó un hito".
//
// Sin dependencias server-only: lo importan la campana (cliente) y el fan-out
// (servidor).
export const NOTIFY_CATEGORIES = ["milestone", "progress", "thought"] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

export const CATEGORY_FOR_POST_KIND: Record<PostKind, NotifyCategory> = {
  started: "milestone",
  finished: "milestone",
  dropped: "milestone",
  progressed: "progress",
  watched: "progress",
  thought: "thought",
};

// Record (no Partial) a propósito, igual que NOTIFICATION_CATEGORY en push:
// si se añade un post.kind y se olvida su tipo, esto NO compila.
export const POST_KIND_NOTIFICATION_TYPE: Record<PostKind, NotificationType> = {
  // Los tres que ya existían se reutilizan: mismos textos, mismo mapeo de push.
  finished: "followed_finished",
  progressed: "followed_session",
  watched: "followed_episode",
  started: "followed_started",
  dropped: "followed_dropped",
  thought: "followed_thought",
};

const VALID = new Set<string>(NOTIFY_CATEGORIES);

// Una server action es un endpoint POST público: valida contra el set permitido,
// descarta desconocidos y deduplica. Entrada no-array → lista vacía.
//
// Esto es además el colador de las categorías del modelo viejo
// ('finished'|'session'|'episode'|'added'): si alguna fila se quedara sin migrar,
// se lee como lista vacía en vez de romper la campana.
export function parseNotifyCategories(raw: unknown): NotifyCategory[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<NotifyCategory>();
  for (const v of raw) if (typeof v === "string" && VALID.has(v)) seen.add(v as NotifyCategory);
  return [...seen];
}

export { POST_KINDS, type PostKind };
