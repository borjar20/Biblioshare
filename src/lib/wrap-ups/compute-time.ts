// Tiempo del periodo para el wrap-up (spec 2026-10-06 §4). /estadisticas solo
// suma minutos de sesión; aquí se añade lo que sí sabemos sin inventar: la
// duración de una película vista de un tirón y los episodios con runtime.
import type { ItemType } from "@/lib/catalog/types";
import type { TimeFacts } from "./types";

export type SessionMinutesRow = { item_type: ItemType; pass_id: string; duration_minutes: number | null };
export type FinishedMovieRow = { pass_id: string; duration_minutes: number | null };
export type EpisodeRow = { series_id: string; episode_runtime_minutes: number | null };

export function computeTime(input: {
  sessions: SessionMinutesRow[]; finishedMovies: FinishedMovieRow[]; episodes: EpisodeRow[];
  previousMinutes: number | null;
}): TimeFacts {
  const minutes = { book: 0, movie: 0, series: 0 };
  const passesWithSessions = new Set<string>();
  for (const s of input.sessions) {
    passesWithSessions.add(s.pass_id);
    minutes[s.item_type] += s.duration_minutes ?? 0;
  }
  for (const m of input.finishedMovies) {
    if (passesWithSessions.has(m.pass_id)) continue;
    minutes.movie += m.duration_minutes ?? 0;
  }
  let episodesWithoutRuntime = 0;
  for (const e of input.episodes) {
    if (e.episode_runtime_minutes == null) episodesWithoutRuntime += 1;
    else minutes.series += e.episode_runtime_minutes;
  }
  return { minutes, episodesWithoutRuntime, previousMinutes: input.previousMinutes };
}
