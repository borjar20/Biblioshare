// §7 del esquema: las estadísticas que solo tienen sentido dentro de un tipo de
// obra. Páginas en libros, minutos en películas, episodios en series — tres
// unidades que no se pueden sumar entre sí, y por eso viven en paneles
// separados en vez de en un total mentiroso.
//
// Van los tres en un getter porque arrancan de la MISMA consulta de pases: los
// terminados del periodo y los pendientes de la pila. Partirlo en tres la
// repetiría tres veces.
//
// Las tallas del catálogo (`books.total_pages`, `movies.duration_minutes`,
// `series.total_episodes`/`episode_runtime_minutes`) se hidratan al abrir la
// ficha, así que MUCHAS filas no las traen. Eso no se disimula: cada bloque
// cuenta aparte cuántas obras se quedaron sin talla (`unknown`), para que el
// panel pueda decir «sobre 12 de 20 con duración en ficha» en lugar de dar una
// media que parece de todas.

import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { type StatsPeriod, periodBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type Extreme = { title: string; value: number } | null;

export type BookFormatStats = {
  finished: number;
  pagesRead: number | null;
  /** Terminados SIN páginas en ficha: el denominador que falta. */
  unknown: number;
  averagePages: number | null;
  longest: Extreme;
  shortest: Extreme;
  /** Páginas que quedan en la pila (solo las que se conocen). */
  pendingPages: number | null;
};

export type MovieFormatStats = {
  finished: number;
  minutesWatched: number | null;
  unknown: number;
  averageMinutes: number | null;
  longest: Extreme;
  shortest: Extreme;
  pendingMinutes: number | null;
};

export type SeriesFormatStats = {
  /** Episodios vistos en el periodo. */
  episodes: number;
  seasonsCompleted: number;
  /** Días con 3 o más episodios del mismo día: el atracón. */
  marathonDays: number;
  /** Media de días entre episodios consecutivos de una misma serie. */
  averageGapDays: number | null;
  dropped: number;
  active: number;
  /** Episodios que faltan para terminar las series en curso. */
  remainingEpisodes: number | null;
  remainingMinutes: number | null;
};

export type FormatStats = {
  books: BookFormatStats;
  movies: MovieFormatStats;
  series: SeriesFormatStats;
};

const MARATHON_EPISODES = 3;

type PassRow = {
  item_type: ItemType;
  item_id: string;
  status: string;
  is_active: boolean;
  finished_on: string | null;
};

type WatchRow = {
  series_id: string;
  season_number: number;
  episode_number: number;
  watched_on: string | null;
};

export async function getFormatStats(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
  now = new Date(),
): Promise<FormatStats> {
  const bounds = periodBounds(period, now);

  // Un solo barrido de pases: de aquí salen los terminados del periodo Y la
  // pila pendiente, que es lo que alimenta las estimaciones.
  const passesQuery = supabase
    .from("passes")
    .select("item_type, item_id, status, is_active, finished_on")
    .eq("user_id", userId);

  let watchQuery = supabase
    .from("episode_watches")
    .select("series_id, season_number, episode_number, watched_on")
    .eq("user_id", userId);
  if (bounds) {
    watchQuery = watchQuery
      .gte("watched_on", bounds.start)
      .lt("watched_on", bounds.endExclusive);
  }

  const [passes, watches] = await Promise.all([passesQuery, watchQuery]);
  if (passes.error) throw passes.error;
  if (watches.error) throw watches.error;

  const passRows = (passes.data ?? []) as PassRow[];
  const watchRows = (watches.data ?? []) as WatchRow[];

  const inPeriod = (iso: string | null) =>
    iso !== null &&
    (!bounds || (iso.slice(0, 10) >= bounds.start && iso.slice(0, 10) < bounds.endExclusive));

  // Obras DISTINTAS por tipo: terminadas en el periodo y pendientes ahora.
  const finishedIds: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  const pendingIds: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  const activeSeriesIds = new Set<string>();
  let droppedSeries = 0;

  for (const row of passRows) {
    if (inPeriod(row.finished_on) || (!bounds && row.status === "completed")) finishedIds[row.item_type].add(row.item_id);
    if (row.is_active && row.status === "planned") pendingIds[row.item_type].add(row.item_id);
    if (row.item_type === "series") {
      if (row.is_active && row.status === "in_progress") activeSeriesIds.add(row.item_id);
      if (row.status === "dropped") droppedSeries++;
    }
  }

  const bookIds = [...finishedIds.book, ...pendingIds.book];
  const movieIds = [...finishedIds.movie, ...pendingIds.movie];
  const seriesIds = [...new Set([...activeSeriesIds, ...watchRows.map((w) => w.series_id)])];

  const [books, movies, seriesRows, episodes] = await Promise.all([
    bookIds.length
      ? supabase.from("books").select("id, title, total_pages").in("id", bookIds)
      : Promise.resolve({ data: [] }),
    movieIds.length
      ? supabase.from("movies").select("id, title, duration_minutes").in("id", movieIds)
      : Promise.resolve({ data: [] }),
    seriesIds.length
      ? supabase
          .from("series")
          .select("id, title, total_episodes, episode_runtime_minutes")
          .in("id", seriesIds)
      : Promise.resolve({ data: [] }),
    // Solo hace falta el catálogo de episodios de las series que se han visto:
    // sirve para saber cuándo una TEMPORADA queda completa.
    watchRows.length
      ? supabase
          .from("series_episodes")
          .select("series_id, season_number")
          .in("series_id", [...new Set(watchRows.map((w) => w.series_id))])
      : Promise.resolve({ data: [] }),
  ]);

  const bookById = new Map(
    ((books.data ?? []) as { id: string; title: string; total_pages: number | null }[]).map(
      (b) => [b.id, b],
    ),
  );
  const movieById = new Map(
    ((movies.data ?? []) as {
      id: string;
      title: string;
      duration_minutes: number | null;
    }[]).map((m) => [m.id, m]),
  );
  const seriesById = new Map(
    ((seriesRows.data ?? []) as {
      id: string;
      title: string;
      total_episodes: number | null;
      episode_runtime_minutes: number | null;
    }[]).map((s) => [s.id, s]),
  );

  return {
    books: bookStats(finishedIds.book, pendingIds.book, bookById),
    movies: movieStats(finishedIds.movie, pendingIds.movie, movieById),
    series: seriesStats(
      watchRows,
      (episodes.data ?? []) as { series_id: string; season_number: number }[],
      activeSeriesIds,
      seriesById,
      droppedSeries,
    ),
  };
}

/** Suma, media y extremos de una talla, contando aparte lo que no la trae. */
function sizeOf(
  ids: Set<string>,
  lookup: (id: string) => { title: string; value: number | null } | undefined,
) {
  let total = 0;
  let known = 0;
  let unknown = 0;
  let longest: Extreme = null;
  let shortest: Extreme = null;

  for (const id of ids) {
    const row = lookup(id);
    if (!row || row.value === null || row.value <= 0) {
      unknown++;
      continue;
    }
    total += row.value;
    known++;
    if (!longest || row.value > longest.value) longest = { title: row.title, value: row.value };
    if (!shortest || row.value < shortest.value) shortest = { title: row.title, value: row.value };
  }

  return {
    total: known > 0 ? total : null,
    average: known > 0 ? Math.round(total / known) : null,
    known,
    unknown,
    longest,
    shortest,
  };
}

function bookStats(
  finished: Set<string>,
  pending: Set<string>,
  byId: Map<string, { title: string; total_pages: number | null }>,
): BookFormatStats {
  const look = (id: string) => {
    const b = byId.get(id);
    return b ? { title: b.title, value: b.total_pages } : undefined;
  };
  const done = sizeOf(finished, look);
  const pila = sizeOf(pending, look);
  return {
    finished: finished.size,
    pagesRead: done.total,
    unknown: done.unknown,
    averagePages: done.average,
    longest: done.longest,
    shortest: done.shortest,
    pendingPages: pila.total,
  };
}

function movieStats(
  finished: Set<string>,
  pending: Set<string>,
  byId: Map<string, { title: string; duration_minutes: number | null }>,
): MovieFormatStats {
  const look = (id: string) => {
    const m = byId.get(id);
    return m ? { title: m.title, value: m.duration_minutes } : undefined;
  };
  const done = sizeOf(finished, look);
  const pila = sizeOf(pending, look);
  return {
    finished: finished.size,
    minutesWatched: done.total,
    unknown: done.unknown,
    averageMinutes: done.average,
    longest: done.longest,
    shortest: done.shortest,
    pendingMinutes: pila.total,
  };
}

function seriesStats(
  watches: WatchRow[],
  catalogEpisodes: { series_id: string; season_number: number }[],
  activeIds: Set<string>,
  byId: Map<
    string,
    { title: string; total_episodes: number | null; episode_runtime_minutes: number | null }
  >,
  dropped: number,
): SeriesFormatStats {
  // Atracones: días en que caen 3 o más episodios. `watched_on` puede ser null
  // (el episodio se marcó sin fecha) y entonces no cuenta para ningún día.
  const perDay = new Map<string, number>();
  for (const w of watches) {
    if (!w.watched_on) continue;
    perDay.set(w.watched_on, (perDay.get(w.watched_on) ?? 0) + 1);
  }
  let marathonDays = 0;
  for (const count of perDay.values()) if (count >= MARATHON_EPISODES) marathonDays++;

  // Temporadas completas: las que tienen vistos tantos episodios como episodios
  // conocidos tiene esa temporada en el catálogo. Sin catálogo no se afirma.
  const seasonSize = new Map<string, number>();
  for (const e of catalogEpisodes) {
    const key = `${e.series_id}:${e.season_number}`;
    seasonSize.set(key, (seasonSize.get(key) ?? 0) + 1);
  }
  const seasonSeen = new Map<string, Set<number>>();
  for (const w of watches) {
    const key = `${w.series_id}:${w.season_number}`;
    const set = seasonSeen.get(key) ?? new Set<number>();
    set.add(w.episode_number);
    seasonSeen.set(key, set);
  }
  let seasonsCompleted = 0;
  for (const [key, seen] of seasonSeen) {
    const size = seasonSize.get(key);
    if (size && seen.size >= size) seasonsCompleted++;
  }

  // Días entre episodios: media de los huecos dentro de cada serie. Se ordena
  // por fecha y se promedian las diferencias; una serie con un solo episodio no
  // aporta ningún hueco.
  const datesBySeries = new Map<string, string[]>();
  for (const w of watches) {
    if (!w.watched_on) continue;
    const list = datesBySeries.get(w.series_id) ?? [];
    list.push(w.watched_on);
    datesBySeries.set(w.series_id, list);
  }
  let gapSum = 0;
  let gapCount = 0;
  for (const dates of datesBySeries.values()) {
    dates.sort();
    for (let i = 1; i < dates.length; i++) {
      const diff =
        (Date.parse(`${dates[i]}T00:00:00Z`) - Date.parse(`${dates[i - 1]}T00:00:00Z`)) /
        86_400_000;
      if (Number.isFinite(diff) && diff >= 0) {
        gapSum += diff;
        gapCount++;
      }
    }
  }

  // Lo que falta para terminar las series en curso. Solo cuenta las que traen
  // `total_episodes`: sin él no hay meta contra la que restar.
  let remainingEpisodes = 0;
  let remainingMinutes = 0;
  let anyRemaining = false;
  let anyRuntime = false;
  for (const id of activeIds) {
    const s = byId.get(id);
    if (!s?.total_episodes) continue;
    const seen = new Set(
      watches.filter((w) => w.series_id === id).map((w) => `${w.season_number}:${w.episode_number}`),
    ).size;
    const left = Math.max(0, s.total_episodes - seen);
    remainingEpisodes += left;
    anyRemaining = true;
    if (s.episode_runtime_minutes) {
      remainingMinutes += left * s.episode_runtime_minutes;
      anyRuntime = true;
    }
  }

  return {
    episodes: watches.length,
    seasonsCompleted,
    marathonDays,
    averageGapDays: gapCount > 0 ? Math.round(gapSum / gapCount) : null,
    dropped,
    active: activeIds.size,
    remainingEpisodes: anyRemaining ? remainingEpisodes : null,
    remainingMinutes: anyRuntime ? remainingMinutes : null,
  };
}
