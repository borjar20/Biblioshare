// «Emitido» y «hay que refrescar el catálogo»: las dos reglas puras del
// catálogo vivo de series (spec 2026-09-23-series-flujo-rediseno, fase 1, #1193).
// Sin Supabase ni fechas del sistema dentro: el llamante pasa `today`, así se
// testean sin relojes falsos.

// Estados de TMDB (`/tv/{id}` → `status`) que significan «no saldrán más
// episodios». El resto (`Returning Series`, `In Production`, `Planned`,
// `Pilot`) o null (serie manual / aún sin sincronizar) NO lo son.
const ENDED_STATUSES = new Set(["Ended", "Canceled"]);

export function isSeriesEnded(tmdbStatus: string | null | undefined): boolean {
  return tmdbStatus != null && ENDED_STATUSES.has(tmdbStatus);
}

// Hoy en UTC como `YYYY-MM-DD`, el mismo formato que `series_episodes.air_date`
// (columna `date`): comparar cadenas ISO es comparar fechas.
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Marca cuáles de los episodios (YA ORDENADOS por temporada y episodio) están
// emitidos. TMDB lista también los episodios anunciados, con `air_date` futuro
// o sin fecha: esos no se pueden ver todavía y no cuentan ni para el progreso
// ni para el cursor ni para el auto-cierre.
//
// La regla:
//   - con fecha → emitido si `air_date` ≤ hoy;
//   - sin fecha → emitido si va ANTES del último episodio con fecha ya pasada
//     (temporadas antiguas a las que TMDB no les puso fecha), y no emitido si va
//     después (el «TBA» de una temporada anunciada);
//   - si ningún episodio tiene fecha (serie manual o catálogo pobre) no hay
//     base para decidir: todos cuentan como emitidos, que es lo que había;
//   - una serie terminada no tiene nada pendiente: todo emitido.
export function airedFlags(
  episodes: { airDate: string | null }[],
  today: string,
  ended: boolean,
): boolean[] {
  if (ended || episodes.every((e) => !e.airDate)) return episodes.map(() => true);
  let lastAired = -1;
  episodes.forEach((e, i) => {
    if (e.airDate && e.airDate <= today) lastAired = i;
  });
  return episodes.map((e, i) => (e.airDate ? e.airDate <= today : i <= lastAired));
}

// Cada cuánto se vuelve a preguntar a TMDB por una serie que sigue en emisión
// (decisión D4 de la spec). Antes de ese plazo, solo se adelanta si ya pasó la
// fecha del siguiente episodio anunciado.
export const EPISODE_SYNC_MAX_AGE_DAYS = 7;
const DAY_MS = 86_400_000;

export type EpisodeSyncState = {
  /** Filas en `series_episodes` para la serie. */
  episodeCount: number;
  tmdbStatus: string | null;
  nextEpisodeAirDate: string | null;
  /** ISO timestamp, o null si nunca se sincronizó con la regla nueva. */
  episodesSyncedAt: string | null;
};

// "empty"  → no hay catálogo: hay que traerlo YA, en el render (sin él la
//            pestaña Episodios ni existe).
// "stale"  → hay catálogo pero puede faltarle lo último: se refresca tras la
//            respuesta (`after()`), la visita no espera a TMDB.
// "fresh"  → nada que hacer.
export type EpisodeSyncNeed = "empty" | "stale" | "fresh";

export function episodeSyncNeed(state: EpisodeSyncState, now: Date = new Date()): EpisodeSyncNeed {
  if (state.episodeCount === 0) return "empty";
  // Filas de antes del catálogo vivo: nunca se guardó su estado en TMDB, así
  // que no sabemos ni si ha terminado. Una sincronización y ya.
  if (!state.episodesSyncedAt) return "stale";
  if (isSeriesEnded(state.tmdbStatus)) return "fresh";
  const ageMs = now.getTime() - new Date(state.episodesSyncedAt).getTime();
  // Fecha ilegible (NaN) → mejor refrescar que quedarse congelado para siempre.
  if (!(ageMs < EPISODE_SYNC_MAX_AGE_DAYS * DAY_MS)) return "stale";
  // Ya salió el episodio que estaba anunciado: se adelanta el refresco, pero
  // como mucho uno al día. La respuesta de TMDB va cacheada 24 h (`tmdbGet`), así
  // que una sincronización el mismo día del estreno puede traer aún la foto
  // vieja — con la fecha ya pasada — y sin este tope cada visita volvería a
  // sincronizar hasta que caducara la caché.
  if (
    state.nextEpisodeAirDate &&
    state.nextEpisodeAirDate <= todayISO(now) &&
    ageMs >= DAY_MS
  )
    return "stale";
  return "fresh";
}
