// Lógica pura de la rejilla de episodios de la hoja de sesión.

// Índice del primer episodio sin ver de la temporada: es donde debe
// posicionarse el scroll al abrir la hoja. Si vas por el E15 de una T2, abrir
// la rejilla en E1 no sirve de nada. Si están todos vistos no hay a dónde
// saltar y se queda arriba.
export function firstUnwatchedIndex(episodes: { watched: boolean }[]): number {
  const index = episodes.findIndex((e) => !e.watched);
  return index === -1 ? 0 : index;
}

// Los tres estados que pinta cada tile. `before` es lo que ya estaba visto al
// ABRIR la hoja; `session` es lo que has marcado ahora. La distinción es lo
// que permite que el footer cuente solo los episodios nuevos.
export type EpisodeState = "before" | "session" | "unseen";

export function episodeState(
  episode: number,
  initialWatched: Set<number>,
  selected: Set<number>,
): EpisodeState {
  if (!selected.has(episode)) return "unseen";
  return initialWatched.has(episode) ? "before" : "session";
}
