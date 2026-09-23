import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Actividad de series para las estadísticas (fase 4 del rediseño de series,
// decisión D3): las series ya no tienen sesiones, su unidad es el episodio
// visto. Un «día de serie» es el conjunto de episodios de UNA serie marcados
// con el mismo `watched_on` (la fecha LOCAL del visionado desde la fase 4) —
// la misma unidad que el post diario del feed.
//
// Las estadísticas que miden DÍAS (racha, calendarios, semana, hábitos) suman
// estos días a los de sesión. Las que miden MINUTOS no: un episodio marcado no
// trae duración, igual que antes una sesión de serie tampoco la traía.
export type SeriesDay = {
  seriesId: string;
  /** `watched_on`, YYYY-MM-DD. */
  day: string;
  episodes: number;
  /** created_at del primer y último episodio marcado ese día (ISO). */
  firstAt: string;
  lastAt: string;
};

export type WatchRow = { series_id: string; watched_on: string; created_at: string };

// Agrupación pura (testable) de filas de `episode_watches` en días de serie.
export function groupSeriesDays(rows: WatchRow[]): SeriesDay[] {
  const byKey = new Map<string, SeriesDay>();
  for (const r of rows) {
    const key = `${r.series_id}:${r.watched_on}`;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, {
        seriesId: r.series_id,
        day: r.watched_on,
        episodes: 1,
        firstAt: r.created_at,
        lastAt: r.created_at,
      });
      continue;
    }
    cur.episodes += 1;
    if (r.created_at < cur.firstAt) cur.firstAt = r.created_at;
    if (r.created_at > cur.lastAt) cur.lastAt = r.created_at;
  }
  return [...byKey.values()].sort((a, b) =>
    a.day === b.day ? a.firstAt.localeCompare(b.firstAt) : a.day.localeCompare(b.day),
  );
}

// Días de serie del usuario, opcionalmente acotados a [start, endExclusive).
export async function getSeriesDays(
  supabase: SupabaseServerClient,
  userId: string,
  bounds?: { start?: string; endExclusive?: string },
): Promise<SeriesDay[]> {
  let q = supabase
    .from("episode_watches")
    .select("series_id, watched_on, created_at")
    .eq("user_id", userId);
  if (bounds?.start) q = q.gte("watched_on", bounds.start);
  if (bounds?.endExclusive) q = q.lt("watched_on", bounds.endExclusive);
  const { data, error } = await q;
  if (error) throw error;
  return groupSeriesDays((data ?? []) as WatchRow[]);
}
