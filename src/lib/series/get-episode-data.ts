import type { createClient } from "@/lib/supabase/server";
import { airedFlags, isSeriesEnded, todayISO } from "./aired";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Una celda de la rejilla comunidad (temporada × episodio). `null` como celda
// significa que ese episodio no existe en esa temporada.
export type GridCell = {
  season: number;
  episode: number;
  title: string | null;
  avgRating: number | null; // 1–10, un decimal; null si nadie lo ha puntuado
  ratingCount: number;
};

// Estado del propio usuario sobre un episodio (para la lista interactiva).
// Dos capas (Tarea 8, hub): `watched`/`rating`/`review` son SIEMPRE del pase
// ACTIVO (el cursor); `seenBefore` señala que el episodio también está visto
// en OTRO pase (un revisionado anterior) o en una fila legado sin pase —
// visto alguna vez, pero no en el pase actual.
export type OwnWatch = {
  watched: boolean;
  rating: number | null;
  review: string | null;
  seenBefore: boolean;
};

export type EpisodeRow = {
  season: number;
  episode: number;
  title: string | null;
  synopsis: string | null;
  stillUrl: string | null;
  airDate: string | null;
  runtimeMinutes: number | null;
  avgRating: number | null;
  ratingCount: number;
  own: OwnWatch;
  // Emitido (catálogo vivo, #1193): los anunciados de TMDB también están en el
  // catálogo, pero no se pueden marcar ni cuentan para progreso, cursor ni
  // auto-cierre. Regla en src/lib/series/aired.ts.
  aired: boolean;
};

export type EpisodeData = {
  // La serie ya no emitirá más (TMDB `Ended`/`Canceled`). false también si no
  // se sabe (serie manual o sin sincronizar).
  ended: boolean;
  seasons: number[]; // ordenadas asc
  // Rejilla: columnas = temporadas, filas = número de episodio (1..max).
  episodeNumbers: number[];
  cells: (GridCell | null)[][]; // [filaEpisodio][columnaTemporada]
  seasonAverages: (number | null)[]; // media por temporada (columna)
  // Lista por temporada para la UI interactiva.
  bySeasons: Map<number, EpisodeRow[]>;
};

function key(season: number, episode: number): string {
  return `${season}:${episode}`;
}

// Filas del catálogo y de visionado tal como llegan de la BD (subset usado por
// la agregación). Separado de la función async para poder testear la lógica.
export type EpisodeCatalogRow = {
  season_number: number;
  episode_number: number;
  title: string | null;
  synopsis: string | null;
  still_url: string | null;
  air_date: string | null;
  runtime_minutes: number | null;
};
export type EpisodeWatchRow = {
  user_id: string;
  season_number: number;
  episode_number: number;
  rating: number | null;
  review: string | null;
  pass_id: string | null;
};

// Lógica pura: agrega catálogo de episodios + visionados en la rejilla de la
// comunidad y la lista por temporada con el estado del propio usuario. Ver
// §7.x. `activePassId` distingue la capa cursor (este pase) de "visto alguna
// vez" (Tarea 8, hub) — null si el usuario no tiene pase activo en la serie.
export function aggregateEpisodeData(
  episodes: EpisodeCatalogRow[],
  allWatches: EpisodeWatchRow[],
  userId: string | null,
  activePassId: string | null,
  // `today` se inyecta para los tests; `ended` sale de `series.tmdb_status`.
  { today = todayISO(), ended = false }: { today?: string; ended?: boolean } = {}
): EpisodeData {
  // Agregado comunidad por episodio.
  const ratingSum = new Map<string, number>();
  const ratingCount = new Map<string, number>();
  for (const w of allWatches) {
    if (w.rating === null) continue;
    const k = key(w.season_number, w.episode_number);
    ratingSum.set(k, (ratingSum.get(k) ?? 0) + w.rating);
    ratingCount.set(k, (ratingCount.get(k) ?? 0) + 1);
  }
  const avgOf = (k: string): number | null => {
    const count = ratingCount.get(k) ?? 0;
    if (count === 0) return null;
    return Math.round(((ratingSum.get(k) ?? 0) / count) * 10) / 10;
  };

  // Estado propio por episodio, agrupando primero las filas propias por
  // episodio: un mismo episodio puede tener varias filas (una por pase en
  // que se vio, más quizá una legado sin pase) desde que la unicidad pasó a
  // ser por pase (migración 20260717_pass_hub_b2_episode_unique.sql). La
  // capa cursor sale de la fila del pase activo si existe; `seenBefore` es
  // true si hay CUALQUIER otra fila (pase distinto o legado).
  const own = new Map<string, OwnWatch>();
  if (userId) {
    const ownByKey = new Map<string, EpisodeWatchRow[]>();
    for (const w of allWatches) {
      if (w.user_id !== userId) continue;
      const k = key(w.season_number, w.episode_number);
      const rows = ownByKey.get(k);
      if (rows) rows.push(w);
      else ownByKey.set(k, [w]);
    }
    for (const [k, rows] of ownByKey) {
      const current = activePassId
        ? rows.find((r) => r.pass_id === activePassId)
        : undefined;
      // Comparar contra `current` (la fila concreta), no contra `activePassId`:
      // si no hay pase activo (o no hay fila para él), `current` es undefined
      // y CUALQUIER fila —incluida una legado con pass_id null— cuenta como
      // "visto alguna vez" (hallazgo de revisión, Tarea 8).
      const seenBefore = rows.some((r) => r !== current);
      own.set(k, {
        watched: Boolean(current),
        rating: current?.rating ?? null,
        review: current?.review ?? null,
        seenBefore,
      });
    }
  }

  const seasons = [...new Set(episodes.map((e) => e.season_number))].sort(
    (a, b) => a - b
  );
  const maxEpisode = episodes.reduce(
    (max, e) => Math.max(max, e.episode_number),
    0
  );
  const episodeNumbers = Array.from({ length: maxEpisode }, (_, i) => i + 1);

  const exists = new Map<string, (typeof episodes)[number]>();
  for (const e of episodes) exists.set(key(e.season_number, e.episode_number), e);

  // Matriz de la rejilla.
  const cells: (GridCell | null)[][] = episodeNumbers.map((epNum) =>
    seasons.map((season) => {
      const k = key(season, epNum);
      const meta = exists.get(k);
      if (!meta) return null;
      return {
        season,
        episode: epNum,
        title: meta.title,
        avgRating: avgOf(k),
        ratingCount: ratingCount.get(k) ?? 0,
      };
    })
  );

  // Media por temporada (solo episodios con al menos un voto).
  const seasonAverages = seasons.map((season) => {
    const rated = episodeNumbers
      .map((epNum) => avgOf(key(season, epNum)))
      .filter((v): v is number => v !== null);
    if (rated.length === 0) return null;
    return Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10;
  });

  // Emitido por episodio. La regla necesita el orden cronológico (un episodio
  // sin fecha se juzga por su posición): se ordena aquí y no se fía del
  // llamante, que puede venir de un fixture.
  const ordered = [...episodes].sort(
    (a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number
  );
  const airedByKey = new Map<string, boolean>();
  airedFlags(
    ordered.map((e) => ({ airDate: e.air_date })),
    today,
    ended
  ).forEach((aired, i) =>
    airedByKey.set(key(ordered[i].season_number, ordered[i].episode_number), aired)
  );

  // Lista por temporada para la UI.
  const bySeasons = new Map<number, EpisodeRow[]>();
  for (const season of seasons) bySeasons.set(season, []);
  for (const e of episodes) {
    const k = key(e.season_number, e.episode_number);
    bySeasons.get(e.season_number)!.push({
      season: e.season_number,
      episode: e.episode_number,
      title: e.title,
      synopsis: e.synopsis,
      stillUrl: e.still_url,
      airDate: e.air_date,
      runtimeMinutes: e.runtime_minutes,
      avgRating: avgOf(k),
      ratingCount: ratingCount.get(k) ?? 0,
      own: own.get(k) ?? { watched: false, rating: null, review: null, seenBefore: false },
      aired: airedByKey.get(k) ?? true,
    });
  }

  return { ended, seasons, episodeNumbers, cells, seasonAverages, bySeasons };
}

// Lee series_episodes + episode_watches (RLS ya filtra a perfiles públicos +
// propios) y delega en aggregateEpisodeData. `activePassId` (Tarea 8, hub)
// es el pase activo del usuario en esta serie, o null si no sigue la serie
// todavía — lo calcula el caller (ya lo necesita para otras cosas). Ver §7.x.
export async function getEpisodeData(
  supabase: SupabaseServerClient,
  seriesId: string,
  userId: string | null,
  activePassId: string | null
): Promise<EpisodeData> {
  const [{ data: catalog }, { data: watches }, { data: series }] = await Promise.all([
    supabase
      .from("series_episodes")
      .select(
        "season_number, episode_number, title, synopsis, still_url, air_date, runtime_minutes"
      )
      .eq("series_id", seriesId)
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true }),
    supabase
      .from("episode_watches")
      .select("user_id, season_number, episode_number, rating, review, pass_id")
      .eq("series_id", seriesId),
    // Mismo viaje, en paralelo: ¿ha terminado la serie? (catálogo vivo).
    supabase.from("series").select("tmdb_status").eq("id", seriesId).maybeSingle(),
  ]);

  return aggregateEpisodeData(catalog ?? [], watches ?? [], userId, activePassId, {
    ended: isSeriesEnded(series?.tmdb_status),
  });
}
