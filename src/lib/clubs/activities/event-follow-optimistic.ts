import { DEFAULT_REMINDER_MINUTES } from "./event-state";

// Optimismo del botón de seguir un evento y orden de la lista de seguidores.
// Reducer puro y separado del componente, igual que follow-optimistic.ts: el
// runner de vitest es node-only (sin jsdom), así que la lógica se prueba aquí y
// el hook (useOptimisticAction) solo es el glue.

export type EventFollowState = {
  following: boolean;
  followersCount: number;
  /** null = sin recordatorio, que es una elección, no un "no ha elegido". */
  remindMinutesBefore: number | null;
};

export type EventFollowAction =
  | { type: "follow" }
  | { type: "unfollow" }
  | { type: "setReminder"; minutes: number | null };

// Cada rama comprueba el estado ACTUAL antes de mover el contador. Así seguir dos
// veces no suma dos: el contador y la lista tienen que contar lo mismo (§21), y
// un contador optimista inflado es una incoherencia que el usuario VE cuando la
// revalidación lo corrige a la baja.
export function eventFollowReducer(
  state: EventFollowState,
  action: EventFollowAction,
): EventFollowState {
  switch (action.type) {
    case "follow":
      if (state.following) return state;
      return {
        following: true,
        followersCount: state.followersCount + 1,
        remindMinutesBefore: DEFAULT_REMINDER_MINUTES,
      };
    case "unfollow":
      if (!state.following) return state;
      return {
        following: false,
        // Math.max por si el contador de partida viene a cero: mejor quedarse en
        // cero que enseñar -1 mientras llega la verdad del servidor.
        followersCount: Math.max(0, state.followersCount - 1),
        remindMinutesBefore: null,
      };
    case "setReminder":
      return { ...state, remindMinutesBefore: action.minutes };
  }
}

export type FollowerRow = {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  followedAt: string;
};

/**
 * Orden estable de la lista de seguidores (§8): primero quien mira, después quien
 * organiza, y el resto por fecha de seguimiento. No se ordena en SQL porque
 * «primero yo» depende de quién pregunta, y meter el viewer en el `order by`
 * obligaría a una consulta distinta por espectador.
 *
 * Es estable de verdad: el desempate final es el userId, así que dos llamadas con
 * los mismos datos dan el mismo orden aunque lleguen en distinto orden de la BD.
 */
export function orderFollowers(
  followers: FollowerRow[],
  { viewerId, organizerId }: { viewerId: string; organizerId: string },
): FollowerRow[] {
  const rango = (f: FollowerRow) =>
    f.userId === viewerId ? 0 : f.userId === organizerId ? 1 : 2;

  return [...followers].sort(
    (a, b) =>
      rango(a) - rango(b) ||
      a.followedAt.localeCompare(b.followedAt) ||
      a.userId.localeCompare(b.userId),
  );
}
