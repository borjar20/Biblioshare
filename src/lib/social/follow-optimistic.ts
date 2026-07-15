import type { FollowState } from "./follows";

export type FollowAction = { type: "toggle"; targetIsPublic: boolean };

// Optimismo del follow: adelanta lo que la server action confirmará al revalidar.
// - Ya sigues (accepted) o has solicitado (pending) → dejar de seguir / cancelar → none.
// - No sigues (none) → público: sigues ya (accepted); privado: solicitud (pending).
// `self` nunca cambia (no hay botón para seguirte a ti mismo).
export function followReducer(
  state: FollowState,
  action: FollowAction,
): FollowState {
  if (state === "self") return state;
  if (state === "accepted" || state === "pending") return "none";
  // state === "none"
  return action.targetIsPublic ? "accepted" : "pending";
}
