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

export type ReactionKind = "like" | "read" | "shock" | "fire";
export const REACTION_KINDS: readonly ReactionKind[] = ["like", "read", "shock", "fire"];
export type ReactionTally = { count: number; viewerReacted: boolean };
export type ReactionsByKind = Record<ReactionKind, ReactionTally>;
export function emptyReactions(): ReactionsByKind {
  return {
    like: { count: 0, viewerReacted: false },
    read: { count: 0, viewerReacted: false },
    shock: { count: 0, viewerReacted: false },
    fire: { count: 0, viewerReacted: false },
  };
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
  // reactionCount/viewerReacted se conservan como DERIVADOS (suma de todos
  // los kinds / algún kind activo del viewer) para no romper a los 9
  // callers que aún pintan el total sin desglosar por emoji.
  reactionCount: number;
  viewerReacted: boolean;
  reactions: ReactionsByKind;
};

export type InteractionSummary = {
  interactionTargetId: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
  reactions: ReactionsByKind;
};
