import {
  anyViewerReacted,
  tallyOf,
  totalReactions,
  type InteractionComment,
  type InteractionSummary,
  type ReactionsByEmoji,
} from "./interactions";

export type InteractionAction =
  | { type: "toggleTarget"; emoji: string }
  | { type: "toggleComment"; id: string; emoji: string }
  | { type: "addComment"; comment: InteractionComment }
  | { type: "deleteComment"; id: string }
  | { type: "editComment"; id: string; body: string }
  | { type: "pinComment"; id: string; pinned: boolean };

// Al quitar la ÚLTIMA reacción de un emoji hay que borrar la clave, no dejarla
// a cero: el mapa es disperso y el ReactionBar pinta lo que hay en él, así que
// un cero superviviente se vería como una píldora vacía.
function toggleEmoji(reactions: ReactionsByEmoji, emoji: string): ReactionsByEmoji {
  const current = tallyOf(reactions, emoji);
  if (!current.viewerReacted) {
    return { ...reactions, [emoji]: { count: current.count + 1, viewerReacted: true } };
  }
  const next = { ...reactions };
  if (current.count <= 1) delete next[emoji];
  else next[emoji] = { count: current.count - 1, viewerReacted: false };
  return next;
}

function derive<T extends { reactions: ReactionsByEmoji }>(x: T): T {
  return {
    ...x,
    reactionCount: totalReactions(x.reactions),
    viewerReacted: anyViewerReacted(x.reactions),
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
      return derive({ ...state, reactions: toggleEmoji(state.reactions, action.emoji) });
    case "toggleComment":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.id
            ? derive({ ...c, reactions: toggleEmoji(c.reactions, action.emoji) })
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
    case "editComment":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.id ? { ...c, body: action.body, edited: true } : c,
        ),
      };
    case "pinComment":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.id
            ? { ...c, pinned: action.pinned }
            : action.pinned
              ? { ...c, pinned: false }
              : c,
        ),
      };
  }
}
