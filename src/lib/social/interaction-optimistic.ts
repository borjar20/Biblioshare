import type { InteractionComment, InteractionSummary } from "./interactions";

export type InteractionAction =
  | { type: "toggleTarget" }
  | { type: "toggleComment"; id: string }
  | { type: "addComment"; comment: InteractionComment }
  | { type: "deleteComment"; id: string };

// Optimismo de likes + comentarios de una reseña. Adelanta lo que la server
// action confirmará al revalidar; en error, el estado real (props) no cambió y
// useOptimistic revierte solo. `commentCount` es independiente de
// `comments.length`: los comentarios vienen capados desde el servidor, así que
// se ajusta a mano al añadir/borrar.
export function interactionReducer(
  state: InteractionSummary,
  action: InteractionAction,
): InteractionSummary {
  switch (action.type) {
    case "toggleTarget": {
      const viewerReacted = !state.viewerReacted;
      return {
        ...state,
        viewerReacted,
        reactionCount: state.reactionCount + (viewerReacted ? 1 : -1),
      };
    }
    case "toggleComment":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.id
            ? {
                ...c,
                viewerReacted: !c.viewerReacted,
                reactionCount: c.reactionCount + (c.viewerReacted ? -1 : 1),
              }
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
