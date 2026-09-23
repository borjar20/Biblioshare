import type { MediaStatus } from "@/lib/library/types";
import { isSeriesEnded } from "./aired";

// Estado DERIVADO de seguimiento de una serie (fase 2 del rediseño, decisión
// D1 de docs/superpowers/specs/2026-09-23-series-flujo-rediseno-design.md): no
// se guarda en `passes.status`, sale del pase + catálogo emitido + TMDB.
//
// «Al día» = viendo, con TODO lo emitido visto, y la serie sigue en emisión.
// Cuando TMDB publica un episodio nuevo, `aired` sube y vuelve sola a «Viendo»,
// sin escribir nada.
//
// El estado de TMDB tiene que ser CONOCIDO: sin él (serie manual o sin
// sincronizar) no se puede afirmar que siga en emisión, y el auto-cierre de
// siempre sigue siendo quien decide (ver rollSeriesProgress).
export function isUpToDate({
  status,
  watched,
  aired,
  tmdbStatus,
}: {
  status: MediaStatus | null;
  /** Episodios vistos EN EL PASE ACTIVO. */
  watched: number;
  /** Episodios emitidos de la serie. */
  aired: number;
  tmdbStatus: string | null;
}): boolean {
  return (
    status === "in_progress" &&
    aired > 0 &&
    watched >= aired &&
    tmdbStatus !== null &&
    !isSeriesEnded(tmdbStatus)
  );
}

// ¿Hay episodios emitidos DESPUÉS del más avanzado que vi en este pase? Es la
// condición de «Seguir con la temporada nueva» sobre un pase ya dado por visto:
// una serie que terminaste y a la que le han salido episodios. Se mira por
// POSICIÓN, no por recuento: un pase marcado «Vista» de un toque (sin episodios)
// no tiene posición y no debe ofrecer «seguir» — no hay por dónde seguir.
export function hasNewEpisodesAfter(
  episodes: { season: number; episode: number; aired: boolean; watched: boolean }[],
): boolean {
  let furthest = -1;
  episodes.forEach((e, i) => {
    if (e.watched) furthest = i;
  });
  if (furthest === -1) return false;
  return episodes.slice(furthest + 1).some((e) => e.aired);
}

type MarkableEpisode = { season: number; episode: number; aired: boolean; watched: boolean };

// «Vistos hasta aquí»: todo lo EMITIDO y sin ver desde el principio hasta el
// episodio elegido, incluido. Los episodios van en orden cronológico. Es la
// forma de dar de alta de un gesto una serie que ya llevabas vista (H8).
export function episodesUpTo<T extends MarkableEpisode>(
  episodes: T[],
  target: { season: number; episode: number },
): T[] {
  const end = episodes.findIndex(
    (e) => e.season === target.season && e.episode === target.episode,
  );
  if (end === -1) return [];
  return episodes.slice(0, end + 1).filter((e) => e.aired && !e.watched);
}

// «Marcar temporada vista»: lo emitido y sin ver de esa temporada.
export function seasonToMark<T extends MarkableEpisode>(episodes: T[], season: number): T[] {
  return episodes.filter((e) => e.season === season && e.aired && !e.watched);
}
