// Hechos «lo consumido» y «hábitos» del wrap-up (spec 2026-10-06 §3, bloques A y B).
// Lo corre el cron con service role (se salta RLS): TODA consulta filtra por user_id.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition } from "@/lib/library/position";
import { getHabits } from "@/lib/stats/get-habits";
import { getSeriesDays } from "@/lib/stats/series-days";
import { addDaysISO } from "@/lib/stats/dates";
import { computeTime } from "../compute-time";
import type { ItemRef, WrapUpInputs } from "../types";
import type { WrapUpWindow } from "../windows";

export type WrapUpClient = SupabaseClient<Database>;
export type CoreFacts = Pick<WrapUpInputs, "time" | "activeDays" | "finished" | "inProgress" | "bestStreak"
  | "favoriteWeekday" | "favoriteBandStartHour" | "genres">;
export type FinishedPassRow = { item_type: ItemType; item_id: string; finished_on: string };
type Meta = { title: string; coverUrl: string | null; genres: string[] | null };
type FullMeta = Meta & { runtime: number | null; duration: number | null; totalPages: number | null };

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

async function loadMeta(client: WrapUpClient, refs: { type: ItemType; id: string }[]): Promise<Map<string, FullMeta>> {
  const out = new Map<string, FullMeta>();
  for (const type of ["book", "movie", "series"] as const) {
    const ids = [...new Set(refs.filter((r) => r.type === type).map((r) => r.id))];
    if (ids.length === 0) continue;
    const cols = type === "book" ? "id,title,cover_url,genres,total_pages"
      : type === "movie" ? "id,title,cover_url,genres,duration_minutes"
      : "id,title,cover_url,genres,episode_runtime_minutes";
    const { data, error } = await client.from(TABLE[type]).select(cols).in("id", ids);
    if (error) throw error;
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      out.set(key(type, r.id as string), {
        title: r.title as string, coverUrl: (r.cover_url as string | null) ?? null,
        genres: (r.genres as string[] | null) ?? null,
        runtime: (r.episode_runtime_minutes as number | null) ?? null,
        duration: (r.duration_minutes as number | null) ?? null,
        totalPages: (r.total_pages as number | null) ?? null,
      });
    }
  }
  return out;
}

async function minutesIn(client: WrapUpClient, userId: string, b: { start: string; endExclusive: string }) {
  const [sessions, movies, episodes] = await Promise.all([
    client.from("progress_sessions").select("pass_id, duration_minutes, passes!inner(item_type)")
      .eq("user_id", userId).gte("session_date", b.start).lt("session_date", b.endExclusive),
    client.from("passes").select("id, item_id").eq("user_id", userId).eq("item_type", "movie")
      .eq("status", "completed").gte("finished_on", b.start).lt("finished_on", b.endExclusive),
    client.from("episode_watches").select("series_id").eq("user_id", userId)
      .gte("watched_on", b.start).lt("watched_on", b.endExclusive),
  ]);
  for (const r of [sessions, movies, episodes]) if (r.error) throw r.error;
  const s = (sessions.data ?? []) as unknown as { pass_id: string; duration_minutes: number | null; passes: { item_type: ItemType } }[];
  const m = (movies.data ?? []) as { id: string; item_id: string }[];
  const e = (episodes.data ?? []) as { series_id: string }[];
  const meta = await loadMeta(client, [
    ...m.map((x) => ({ type: "movie" as const, id: x.item_id })),
    ...e.map((x) => ({ type: "series" as const, id: x.series_id })),
  ]);
  return {
    sessions: s.map((x) => ({ item_type: x.passes.item_type, pass_id: x.pass_id, duration_minutes: x.duration_minutes })),
    finishedMovies: m.map((x) => ({ pass_id: x.id, duration_minutes: meta.get(key("movie", x.item_id))?.duration ?? null })),
    episodes: e.map((x) => ({ series_id: x.series_id, episode_runtime_minutes: meta.get(key("series", x.series_id))?.runtime ?? null })),
  };
}

export async function loadCore(client: WrapUpClient, userId: string, w: WrapUpWindow): Promise<CoreFacts> {
  const b = { start: w.start, endExclusive: w.endExclusive };
  // getSeriesDays/getHabits están tipados para el cliente de servidor (cookies);
  // aquí llega el de service role, que habla el mismo API.
  const [now, prev, finishedQ, openQ, sessionDaysQ, seriesDays, habits] = await Promise.all([
    minutesIn(client, userId, b),
    w.previous ? minutesIn(client, userId, w.previous) : Promise.resolve(null),
    client.from("passes").select("item_type, item_id, finished_on").eq("user_id", userId)
      .eq("status", "completed").gte("finished_on", w.start).lt("finished_on", w.endExclusive),
    client.from("passes").select("id, item_type, item_id, position").eq("user_id", userId)
      .eq("status", "in_progress"),
    client.from("progress_sessions").select("session_date, pass_id").eq("user_id", userId)
      .gte("session_date", w.start).lt("session_date", w.endExclusive),
    getSeriesDays(client as never, userId, b),
    getHabits(client as never, userId, w),
  ]);
  for (const r of [finishedQ, openQ, sessionDaysQ]) if (r.error) throw r.error;

  const finishedRows = (finishedQ.data ?? []) as FinishedPassRow[];
  const sessionRows = (sessionDaysQ.data ?? []) as { session_date: string; pass_id: string }[];
  // «En marcha» = pases abiertos que se tocaron en la ventana (con sesión).
  const touched = new Set(sessionRows.map((r) => r.pass_id));
  const openRows = ((openQ.data ?? []) as { id: string; item_type: ItemType; item_id: string; position: unknown }[])
    .filter((r) => touched.has(r.id));

  const meta = await loadMeta(client, [
    ...finishedRows.map((r) => ({ type: r.item_type, id: r.item_id })),
    ...openRows.map((r) => ({ type: r.item_type, id: r.item_id })),
  ]);
  const finished = collapseFinished(finishedRows, meta);
  const inProgress = openRows.flatMap((r) => {
    const m = meta.get(key(r.item_type, r.item_id));
    if (!m) return [];
    // Solo los libros tienen porcentaje: position.page / books.total_pages.
    const pos = r.item_type === "book" ? parsePosition("book", r.position) : null;
    const page = pos && "page" in pos && pos.page !== undefined ? pos.page : null;
    const percent = page != null && m.totalPages ? Math.min(100, Math.round((page / m.totalPages) * 100)) : null;
    return [{ type: r.item_type, id: r.item_id, title: m.title, coverUrl: m.coverUrl, times: 1, percent }];
  });

  const activeDays = [...new Set([
    ...sessionRows.map((r) => r.session_date),
    ...seriesDays.map((d) => d.day),
    ...finishedRows.map((r) => r.finished_on),
  ])].sort();

  const previousMinutes = prev ? (() => {
    const t = computeTime({ ...prev, previousMinutes: null });
    return t.minutes.book + t.minutes.movie + t.minutes.series;
  })() : null;

  return {
    time: computeTime({ ...now, previousMinutes }),
    activeDays, finished, inProgress,
    bestStreak: streakWithin(activeDays),
    favoriteWeekday: habits.favoriteWeekday,
    favoriteBandStartHour: habits.favoriteBand?.startHour ?? null,
    genres: topGenres(finished, meta),
  };
}
