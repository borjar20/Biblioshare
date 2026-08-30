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
export function describeEvent(event: ScoreEvent, state: ScoreState): EventDescription {
  switch (event.type) {
    case "game_started":
      return { key: "gameStarted", params: {} };
    case "round_scored":
      // El evento describe la PRÓXIMA ronda si aún no se aplicó, pero en la
      // consola siempre se describe el último evento YA aplicado: la ronda
      // que añadió es la última — su número humano es rounds.length... salvo
      // que el estado no lo incluya todavía (describe de un pending ajeno).
      // Criterio simple y estable: número = rondas actuales + 1 si el evento
      // no está aplicado no es distinguible aquí; se etiqueta con el total
      // actual + 1 para pending y la UI del log histórico no lo usa.
      return { key: "roundScored", params: { round: state.rounds.length + 1 } };
    case "round_edited":
      return { key: "roundEdited", params: { round: event.payload.round + 1 } };
    case "game_finished":
      return { key: "gameFinished", params: {} };
  }
}
