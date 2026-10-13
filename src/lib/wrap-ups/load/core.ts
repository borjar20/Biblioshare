// Hechos «lo consumido» y «hábitos» del wrap-up (spec 2026-10-06 §3, bloques A y B).
// Lo corre el cron con service role (se salta RLS): TODA consulta filtra por user_id.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition } from "@/lib/library/position";
import { passPercent } from "@/lib/library/progress";
import { computeHabits, habitRows, seriesDayHabitRows, type HabitSessionRow } from "@/lib/stats/get-habits";
import { groupSeriesDays, type WatchRow } from "@/lib/stats/series-days";
import { addDaysISO } from "@/lib/stats/dates";
import { chunkIds } from "@/lib/supabase/in-chunks";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { computeTime } from "../compute-time";
import type { ItemRef, SeriesProgress, WrapUpInputs } from "../types";
import type { WrapUpWindow } from "../windows";

export type WrapUpClient = SupabaseClient<Database>;
export type CoreFacts = Pick<WrapUpInputs, "time" | "activeDays" | "finished" | "inProgress" | "bestStreak"
  | "favoriteWeekday" | "favoriteBandStartHour" | "genres" | "seriesProgress" | "openTotal" | "byWeekday" | "byBand">;
export type FinishedPassRow = { item_type: ItemType; item_id: string; finished_on: string };
type Meta = { title: string; coverUrl: string | null; genres: string[] | null };
type FullMeta = Meta & { runtime: number | null; duration: number | null; totalPages: number | null; totalEpisodes: number | null };
export type OpenPassRow = {
  id: string; item_type: ItemType; item_id: string; position: unknown;
  status: string; started_on: string | null; finished_on: string | null;
};

const key = (type: ItemType, id: string) => `${type}:${id}`;

export function collapseFinished(rows: FinishedPassRow[], meta: Map<string, Meta>): ItemRef[] {
  const out = new Map<string, ItemRef>();
  for (const r of rows) {
    const k = key(r.item_type, r.item_id);
    const m = meta.get(k);
    if (!m) continue;
    const cur = out.get(k);
    if (cur) cur.times += 1;
    else out.set(k, { type: r.item_type, id: r.item_id, title: m.title, coverUrl: m.coverUrl, times: 1 });
  }
  return [...out.values()];
}

/** Todas las series vistas en la ventana, incluso con pase cerrado o sin pase. */
export function seriesProgressFacts(rows: { series_id: string }[], meta: Map<string, Pick<Meta, "title" | "coverUrl">>): SeriesProgress[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.series_id, (counts.get(row.series_id) ?? 0) + 1);
  return [...counts].flatMap(([id, episodes]) => {
    const m = meta.get(key("series", id));
    return m ? [{ type: "series" as const, id, title: m.title, coverUrl: m.coverUrl, times: 1, episodes }] : [];
  }).sort((a, b) => b.episodes - a.episodes || a.title.localeCompare(b.title, "es") || a.id.localeCompare(b.id));
}

export function streakWithin(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0, run = 0, prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDaysISO(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function topGenres(items: ItemRef[], meta: Map<string, Pick<Meta, "genres">>): { name: string; works: number }[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    for (const g of meta.get(key(it.type, it.id))?.genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...counts].map(([name, works]) => ({ name, works }))
    .sort((a, b) => b.works - a.works || a.name.localeCompare(b.name, "es"));
}

const TABLE: Record<ItemType, "books" | "movies" | "series"> = { book: "books", movie: "movies", series: "series" };

export async function loadMeta(client: WrapUpClient, refs: { type: ItemType; id: string }[]): Promise<Map<string, FullMeta>> {
  const out = new Map<string, FullMeta>();
  for (const type of ["book", "movie", "series"] as const) {
    const ids = [...new Set(refs.filter((r) => r.type === type).map((r) => r.id))];
    if (ids.length === 0) continue;
    const cols = type === "book" ? "id,title,cover_url,genres,total_pages"
      : type === "movie" ? "id,title,cover_url,genres,duration_minutes"
      : "id,title,cover_url,genres,episode_runtime_minutes,total_episodes";
    const rows: Record<string, unknown>[] = [];
    for (const chunk of chunkIds(ids)) {
      const { data, error } = await client.from(TABLE[type]).select(cols).in("id", chunk);
      if (error) throw error;
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    }
    for (const r of rows) {
      out.set(key(type, r.id as string), {
        title: r.title as string, coverUrl: (r.cover_url as string | null) ?? null,
        genres: (r.genres as string[] | null) ?? null,
        runtime: (r.episode_runtime_minutes as number | null) ?? null,
        duration: (r.duration_minutes as number | null) ?? null,
        totalPages: (r.total_pages as number | null) ?? null,
        totalEpisodes: (r.total_episodes as number | null) ?? null,
      });
    }
  }
  return out;
}

type SessionRow = HabitSessionRow & { pass_id: string };
type Bounds = { start: string; endExclusive: string };

/**
 * Los minutos de serie salen SOLO de episode_watches × runtime: las sesiones
 * antiguas de serie (progress_sessions) se excluyen para no contar dos veces.
 */
export function sessionItemType(x: Pick<SessionRow, "passes">): ItemType | undefined {
  return (Array.isArray(x.passes) ? x.passes[0]?.item_type : x.passes?.item_type) as ItemType | undefined;
}

/** Una sesión cuenta como minutos si NO es de serie (ni de tipo desconocido). Regla única: core y anual. */
export function isCountableSession(x: Pick<SessionRow, "passes">): boolean {
  const t = sessionItemType(x);
  return !!t && t !== "series";
}

export function sessionsForMinutes(rows: Pick<SessionRow, "pass_id" | "duration_minutes" | "passes">[]) {
  const out: { item_type: ItemType; pass_id: string; duration_minutes: number | null }[] = [];
  for (const x of rows) {
    if (!isCountableSession(x)) continue;
    out.push({ item_type: sessionItemType(x)!, pass_id: x.pass_id, duration_minutes: x.duration_minutes });
  }
  return out;
}

/**
 * Hechos puros de actividad a partir de las filas crudas de la ventana: los
 * días de serie (groupSeriesDays) alimentan días activos y hábitos igual que en
 * /estadisticas (habitRows).
 */
export function activityFacts(sessions: SessionRow[], watches: WatchRow[], finishedDays: string[]) {
  const seriesDays = groupSeriesDays(watches);
  const activeDays = [...new Set([
    ...sessions.map((r) => r.session_date),
    ...seriesDays.map((d) => d.day),
    ...finishedDays,
  ])].sort();
  const habits = computeHabits(habitRows(sessions, seriesDayHabitRows(seriesDays)));
  return { activeDays, habits };
}

async function loadWindowRows(client: WrapUpClient, userId: string, b: Bounds) {
  const [sessions, watches] = await Promise.all([
    readAllRows<SessionRow>((from, to) => client.from("progress_sessions")
      .select("pass_id, session_date, duration_minutes, started_at, passes(item_type)")
      .eq("user_id", userId).gte("session_date", b.start).lt("session_date", b.endExclusive)
      .order("id").range(from, to) as unknown as PromiseLike<{ data: SessionRow[] | null; error?: unknown }>),
    readAllRows<WatchRow>((from, to) => client.from("episode_watches")
      .select("series_id, watched_on, created_at")
      .eq("user_id", userId).gte("watched_on", b.start).lt("watched_on", b.endExclusive)
      .order("id").range(from, to)),
  ]);
  return { sessions, watches };
}

async function minutesIn(
  client: WrapUpClient, userId: string, b: Bounds,
  rows: { sessions: SessionRow[]; watches: WatchRow[] },
) {
  const m = await readAllRows<{ id: string; item_id: string }>((from, to) => client.from("passes").select("id, item_id")
    .eq("user_id", userId).eq("item_type", "movie")
    .eq("status", "completed").gte("finished_on", b.start).lt("finished_on", b.endExclusive)
    .order("id").range(from, to));
  const meta = await loadMeta(client, [
    ...m.map((x) => ({ type: "movie" as const, id: x.item_id })),
    ...rows.watches.map((x) => ({ type: "series" as const, id: x.series_id })),
  ]);
  return {
    sessions: sessionsForMinutes(rows.sessions),
    finishedMovies: m.map((x) => ({ pass_id: x.id, duration_minutes: meta.get(key("movie", x.item_id))?.duration ?? null })),
    episodes: rows.watches.map((x) => ({ series_id: x.series_id, episode_runtime_minutes: meta.get(key("series", x.series_id))?.runtime ?? null })),
  };
}

/** Abierto el último día de la ventana: sigue abierto, o se terminó después del cierre. Los abandonados no
 *  guardan fecha de abandono: no se puede saber si seguían abiertos, así que no entran. */
export function openAtClose(rows: OpenPassRow[], endExclusive: string): OpenPassRow[] {
  return rows.filter((r) => (r.started_on == null || r.started_on < endExclusive)
    && (r.status === "in_progress" || (r.status === "completed" && r.finished_on != null && r.finished_on >= endExclusive)));
}

/** % de una serie: episodios distintos vistos entre el total; abierto, tope 99 (como passPercent). */
export function seriesPercent(
  watched: { season_number: number; episode_number: number }[], total: number | null, stillOpen: boolean,
): number | null {
  if (!total) return null;
  const distinct = new Set(watched.map((w) => `${w.season_number}:${w.episode_number}`)).size;
  const pct = Math.min(100, Math.round((distinct * 100) / total));
  return stillOpen ? Math.min(99, pct) : pct;
}

export async function loadCore(client: WrapUpClient, userId: string, w: WrapUpWindow): Promise<CoreFacts> {
  const b = { start: w.start, endExclusive: w.endExclusive };
  const [cur, prevRows, finishedRows, openQ, laterQ] = await Promise.all([
    loadWindowRows(client, userId, b),
    w.previous ? loadWindowRows(client, userId, w.previous) : Promise.resolve(null),
    readAllRows<FinishedPassRow>((from, to) => client.from("passes").select("item_type, item_id, finished_on")
      .eq("user_id", userId).eq("status", "completed")
      .gte("finished_on", w.start).lt("finished_on", w.endExclusive).order("id").range(from, to) as unknown as PromiseLike<{ data: FinishedPassRow[] | null; error?: unknown }>),
    // Pases abiertos: pocos por usuario (no pasan del tope de filas).
    client.from("passes").select("id, item_type, item_id, position, status, started_on, finished_on")
      .eq("user_id", userId).eq("status", "in_progress"),
    // Terminados DESPUÉS del cierre: el último día de la ventana seguían abiertos.
    client.from("passes").select("id, item_type, item_id, position, status, started_on, finished_on")
      .eq("user_id", userId).eq("status", "completed").gte("finished_on", w.endExclusive),
  ]);
  if (openQ.error) throw openQ.error;
  if (laterQ.error) throw laterQ.error;
  const [now, prev] = await Promise.all([
    minutesIn(client, userId, b, cur),
    w.previous && prevRows ? minutesIn(client, userId, w.previous, prevRows) : Promise.resolve(null),
  ]);

  // En marcha = abierto al cierre (spec 2026-10-13 §2). `touched`: avanzó en la ventana
  // (sesión del pase, o episodio de esa serie).
  const lastTouch = new Map<string, string>();
  for (const s of cur.sessions) if (s.session_date > (lastTouch.get(s.pass_id) ?? "")) lastTouch.set(s.pass_id, s.session_date);
  const seriesTouch = new Map<string, string>();
  for (const x of cur.watches) if (x.watched_on > (seriesTouch.get(x.series_id) ?? "")) seriesTouch.set(x.series_id, x.watched_on);
  const touchOf = (r: OpenPassRow) => lastTouch.get(r.id) ?? (r.item_type === "series" ? seriesTouch.get(r.item_id) : undefined) ?? null;

  const openRows = openAtClose([
    ...((openQ.data ?? []) as OpenPassRow[]),
    ...((laterQ.data ?? []) as OpenPassRow[]),
  ], w.endExclusive);

  const seriesPassIds = openRows.filter((r) => r.item_type === "series").map((r) => r.id);
  const seriesWatches = seriesPassIds.length === 0 ? [] : await readAllRows<{ pass_id: string | null; season_number: number; episode_number: number }>(
    (from, to) => client.from("episode_watches").select("pass_id, season_number, episode_number")
      .eq("user_id", userId).in("pass_id", seriesPassIds).lt("watched_on", w.endExclusive)
      .order("id").range(from, to));

  const meta = await loadMeta(client, [
    ...finishedRows.map((r) => ({ type: r.item_type, id: r.item_id })),
    ...openRows.map((r) => ({ type: r.item_type, id: r.item_id })),
    ...(w.kind === "week" ? cur.watches.map((r) => ({ type: "series" as const, id: r.series_id })) : []),
  ]);
  const finished = collapseFinished(finishedRows, meta);
  const ordered = openRows.flatMap((r) => {
    const m = meta.get(key(r.item_type, r.item_id));
    if (!m) return [];
    const stillOpen = r.status === "in_progress";
    let percent: number | null = null;
    if (r.item_type === "book" && stillOpen) {
      // Solo con el pase aún abierto: la posición guardada es la de HOY, no la del cierre.
      const pos = parsePosition("book", r.position);
      const page = pos && "page" in pos && pos.page !== undefined ? pos.page : null;
      // passPercent: el 100 solo con la última página leída (668/669 redondeaba a 100 en un pase abierto).
      percent = page != null && m.totalPages ? passPercent(page, m.totalPages) : null;
    } else if (r.item_type === "series") {
      // Toda fila de openAtClose estaba abierta al cierre (aunque se terminara después): tope 99.
      percent = seriesPercent(seriesWatches.filter((x) => x.pass_id === r.id), m.totalEpisodes, true);
    }
    const touch = touchOf(r);
    return [{
      item: { type: r.item_type, id: r.item_id, title: m.title, coverUrl: m.coverUrl, times: 1, percent, touched: touch !== null },
      sortKey: touch ?? r.started_on ?? "",
    }];
  }).sort((a, b) => Number(b.item.touched) - Number(a.item.touched) || b.sortKey.localeCompare(a.sortKey));
  const inProgress = ordered.map((x) => x.item);

  const { activeDays, habits } = activityFacts(cur.sessions, cur.watches, finishedRows.map((r) => r.finished_on));

  const previousMinutes = prev ? (() => {
    const t = computeTime({ ...prev, previousMinutes: null });
    return t.minutes.book + t.minutes.movie + t.minutes.series;
  })() : null;

  return {
    time: computeTime({ ...now, previousMinutes }),
    activeDays, finished, inProgress,
    openTotal: inProgress.length, byWeekday: habits.byWeekday, byBand: habits.byBand,
    seriesProgress: w.kind === "week" ? seriesProgressFacts(cur.watches, meta) : [],
    bestStreak: streakWithin(activeDays),
    favoriteWeekday: habits.favoriteWeekday,
    favoriteBandStartHour: habits.favoriteBand?.startHour ?? null,
    genres: topGenres(finished, meta),
  };
}
