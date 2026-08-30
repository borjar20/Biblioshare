import type { EventDescription } from "@/lib/play/core/types";
import type { ScoreEvent } from "./events";
import type { ScoreState } from "./types";

export function totals(state: ScoreState): number[] {
  const out = state.setup.participants.map(() => 0);
  for (const round of state.rounds) {
    for (let seat = 0; seat < out.length; seat++) out[seat] += round[seat];
  }
  return out;
}

// Empate comparte posición y la siguiente salta (1,1,3): mismo criterio que
// finalRanking de mtg. El "mejor" lo decide direction.
export function scoreRanking(state: ScoreState): { seat: number; total: number; position: number }[] {
  const sums = totals(state);
  const orden = sums
    .map((total, seat) => ({ seat, total }))
    .sort((a, b) => (state.setup.direction === "highest" ? b.total - a.total : a.total - b.total));
  let position = 0;
  let previous: number | null = null;
  return orden.map((entry, index) => {
    if (previous === null || entry.total !== previous) {
      position = index + 1;
      previous = entry.total;
    }
    return { ...entry, position };
  });
}

/**
 * INFORMATIVO (spec §2): la UI ofrece finalizar, el reducer lo ignora. Con
 * `points`, alcanzar (>=) el valor dispara en AMBAS direcciones: con highest
 * el que llega gana; con lowest llegar te condena y gana el que menos tiene.
 */
export function limitReached(state: ScoreState): boolean {
  const { target } = state.setup;
  if (!target) return false;
  if (target.kind === "rounds") return state.rounds.length >= target.value;
  return totals(state).some((total) => total >= target.value);
}

// Etiquetas para la consola de deshacer y el log. `round` humano, 1-based.
//
// `game_started`/`game_finished` reusan las claves NEUTRAS de mtg ("started",
// "finished" — "Empieza la partida"/"Fin de la partida" valen igual para una
// puntuación) en vez de duplicar el mismo texto bajo una clave propia
// (tools.ts describe §6).
export function describeEvent(event: ScoreEvent, state: ScoreState): EventDescription {
  switch (event.type) {
    case "game_started":
      return { key: "started", params: {} };
    case "round_scored":
      // El único llamador real (game-sheet/consola) describe SIEMPRE el
      // último evento YA APLICADO sobre el estado que ese mismo evento
      // produjo (game.state tras el commit) — nunca un evento pendiente de
      // aplicar sobre un estado previo. Con esa invariante, la ronda que
      // `round_scored` acaba de añadir es la ÚLTIMA de `state.rounds`, y su
      // número humano es exactamente `state.rounds.length` (1-based porque
      // length ya cuenta la que se acaba de añadir), no `+1`.
      return { key: "roundScored", params: { round: state.rounds.length } };
    case "round_edited":
      return { key: "roundEdited", params: { round: event.payload.round + 1 } };
    case "game_finished":
      return { key: "finished", params: {} };
  }
}
