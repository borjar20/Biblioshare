import type { TurnsState } from "./types";

export function aliveCount(state: TurnsState): number {
  return state.players.length - state.eliminated.length;
}

// Siguiente índice VIVO desde `from` según `direction`. Con un solo vivo
// devuelve `from` (el reducer lo impide antes exigiendo ≥2 vivos).
export function nextAlive(state: TurnsState, from: number, direction: 1 | -1): number {
  const n = state.players.length;
  let i = from;
  do {
    i = (i + direction + n) % n;
  } while (state.eliminated.includes(state.players[i]) && i !== from);
  return i;
}
