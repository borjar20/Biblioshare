import type { TargetType as CanonicalTargetType } from "./interaction-targets";

// VOCABULARIO de interacciones (EPIC-05, Bloque B, SD-3): tipos, las cuatro
// reacciones y el vacío canónico. Nada más — y eso es el contrato del fichero,
// no una casualidad: lo importan `reaction-bar.tsx`, `review-interactions.tsx`
// y `post-thread.tsx`, que son componentes de CLIENTE.
//
// Por eso el lector (`getInteractionSummary`) vive aparte, en
// `get-interaction-summary.ts`. Estuvo aquí hasta F1-027 y solo compilaba
// porque su única referencia al servidor era un `import type`, que se borra al
// transpilar: en cuanto necesitó un import de VALOR del módulo de Supabase, el
// build reventó con «This module cannot be imported from a Client Component»
// por cinco caminos distintos. Un fichero que mezcla vocabulario compartido y
// acceso a BD es una bomba de relojería con la mecha en el próximo import.
//
// Las mutaciones, en `interaction-actions.ts` ("use server").

export type TargetType = Exclude<CanonicalTargetType, "comment">;

/**
 * Un emoji del catálogo (`src/lib/social/emoji-catalog.data.ts`). Es un alias
 * documental, no un tipo cerrado: la lista blanca se valida en la acción de
 * servidor, no en el sistema de tipos.
 */
export type ReactionEmoji = string;
export type ReactionTally = { count: number; viewerReacted: boolean };
/**
 * Mapa DISPERSO: hay clave solo si alguien reaccionó con ese emoji. Indexar a
 * pelo (`reactions["🔥"]`) puede dar `undefined` — usa siempre `tallyOf`.
 * El orden de las claves es el de primera aparición, que es lo que
 * `reaction-display.ts` usa como desempate estable; por eso las consultas de
 * reacciones van ordenadas por `created_at`.
 */
export type ReactionsByEmoji = Record<ReactionEmoji, ReactionTally>;

export function emptyReactions(): ReactionsByEmoji {
  return {};
}

export function tallyOf(reactions: ReactionsByEmoji, emoji: string): ReactionTally {
  return reactions[emoji] ?? { count: 0, viewerReacted: false };
}

export function totalReactions(reactions: ReactionsByEmoji): number {
  let total = 0;
  for (const tally of Object.values(reactions)) total += tally.count;
  return total;
}

export function anyViewerReacted(reactions: ReactionsByEmoji): boolean {
  return Object.values(reactions).some((tally) => tally.viewerReacted);
}

export type InteractionComment = {
  id: string;
  interactionTargetId: string;
  authorId: string;
  author: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  initials: string;
  body: string;
  createdAt: string;
  isOwn: boolean;
  canDelete: boolean;
  canEdit: boolean;
  canPin: boolean;
  parentId: string | null;
  isSpoiler: boolean;
  pinned: boolean;
  edited: boolean;
  /**
   * Nota de voz: null en comentarios de texto. `url` es una URL FIRMADA con
   * caducidad 1 h — no cachear más allá del render que la trajo.
   */
  audio: { url: string; durationMs: number; peaks: number[] } | null;
  // reactionCount/viewerReacted se conservan como DERIVADOS (suma de todas
  // las reacciones / si el viewer tiene alguna puesta) para no romper a los 9
  // callers que aún pintan el total sin desglosar por emoji.
  reactionCount: number;
  viewerReacted: boolean;
  reactions: ReactionsByEmoji;
};

export type InteractionSummary = {
  interactionTargetId: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
  reactions: ReactionsByEmoji;
};
