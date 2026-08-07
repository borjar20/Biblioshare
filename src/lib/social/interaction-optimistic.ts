import {
  REACTION_KINDS,
  type InteractionComment,
  type InteractionSummary,
  type ReactionKind,
  type ReactionsByKind,
} from "./interactions";

export type InteractionAction =
  | { type: "toggleTarget"; kind: ReactionKind }
  | { type: "toggleComment"; id: string; kind: ReactionKind }
  | { type: "addComment"; comment: InteractionComment }
  | { type: "deleteComment"; id: string };

function toggleKind(r: ReactionsByKind, kind: ReactionKind): ReactionsByKind {
  const cur = r[kind];
  const next = { count: cur.count + (cur.viewerReacted ? -1 : 1), viewerReacted: !cur.viewerReacted };
  return { ...r, [kind]: next };
}

function derive<T extends { reactions: ReactionsByKind }>(x: T): T {
  return {
    ...x,
    reactionCount: REACTION_KINDS.reduce((n, k) => n + x.reactions[k].count, 0),
    viewerReacted: REACTION_KINDS.some((k) => x.reactions[k].viewerReacted),
  } as T;
}

// Optimismo de reacciones (multi-emoji) + comentarios de una reseña. Adelanta
// lo que la server action confirmará al revalidar; en error, el estado real
// (props) no cambió y useOptimistic revierte solo. `commentCount` es
// independiente de `comments.length`: los comentarios vienen capados desde el
// servidor, así que se ajusta a mano al añadir/borrar.
export function interactionReducer(
  state: InteractionSummary,
  action: InteractionAction,
): InteractionSummary {
  switch (action.type) {
    case "toggleTarget":
      return derive({ ...state, reactions: toggleKind(state.reactions, action.kind) });
    case "toggleComment":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.id
            ? derive({ ...c, reactions: toggleKind(c.reactions, action.kind) })
            : c,
        ),
      };
    case "addComment":
      return {
        ...state,
        comments: [...state.comments, action.comment],
        commentCount: state.commentCount + 1,
      };
    case "deleteComment":
      return {
        ...state,
        comments: state.comments.filter((c) => c.id !== action.id),
        commentCount: state.commentCount - 1,
      };
  }
}
