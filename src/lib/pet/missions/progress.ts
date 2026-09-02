import { forEachSessionAdvance, type SessionRow } from "../counts";
import type { MissionTemplate } from "./templates";

// Contadores de UN día local y progreso de una misión (spec fase 2 §1.4).
// Puros: getPetCounts trae las filas y la función que convierte un timestamp
// en día local (toISODate); aquí no hay fechas del sistema.

export interface PetDayCounts {
  minutes: number;
  pages: number;
  episodes: number;
  /** Obras terminadas ese día, como "tipo:id" (para «Termina X»). */
  finishedKeys: string[];
  notes: number;
  quotes: number;
  ratings: number;
  /** Obras con reseña no vacía AHORA (estado, no día): para «Reseña X». */
  reviewedKeys: string[];
  posts: number;
  votes: number;
  newWorks: number;
}

export const EMPTY_DAY_COUNTS: PetDayCounts = {
  minutes: 0, pages: 0, episodes: 0, finishedKeys: [], notes: 0, quotes: 0, ratings: 0,
  reviewedKeys: [], posts: 0, votes: 0, newWorks: 0,
};

export interface DayRows {
  sessions: SessionRow[];
  episodes: { watched_on: string; rating: number | null }[];
  passes: {
    item_type: string;
    item_id: string;
    status: string;
    finished_on: string | null;
    rating: number | null;
    created_at: string;
    updated_at: string;
    /** false = historial (splitPassHistory): no cuenta como obra nueva ni valoración del día. */
    lived: boolean;
  }[];
  notes: { kind: string; created_at: string }[];
  posts: { kind: string; created_at: string }[];
  votes: { voted_at: string }[];
  reviewedKeys: string[];
}

/** Páginas avanzadas en las sesiones de `dayISO`, con la misma regla que
 *  sessionUnits (diferencia con la sesión anterior del MISMO pase, retroceso =
 *  0 y no baja la referencia), pero sumando solo las del día. */
function pagesOn(rows: SessionRow[], dayISO: string): number {
  let pages = 0;
  forEachSessionAdvance(rows, (r, advanced) => {
    if (r.session_date === dayISO) pages += advanced;
  });
  return pages;
}

export function dayCounts(rows: DayRows, dayISO: string, toDay: (ts: string) => string): PetDayCounts {
  const isDay = (ts: string) => toDay(ts) === dayISO;
  const todaySessions = rows.sessions.filter((s) => s.session_date === dayISO);
  const todayEpisodes = rows.episodes.filter((e) => e.watched_on === dayISO);
  const livedToday = rows.passes.filter((p) => p.lived);
  return {
    minutes: todaySessions.reduce((n, s) => n + (s.duration_minutes ?? 0), 0),
    pages: pagesOn(rows.sessions, dayISO),
    episodes: todayEpisodes.length,
    finishedKeys: rows.passes.filter((p) => p.finished_on === dayISO).map((p) => `${p.item_type}:${p.item_id}`),
    notes: rows.notes.filter((n) => n.kind === "note" && isDay(n.created_at)).length,
    quotes: rows.notes.filter((n) => n.kind === "quote" && isDay(n.created_at)).length,
    ratings:
      livedToday.filter((p) => p.rating != null && isDay(p.updated_at)).length +
      todayEpisodes.filter((e) => e.rating != null).length,
    reviewedKeys: [...rows.reviewedKeys],
    posts: rows.posts.filter((p) => p.kind !== "poll" && isDay(p.created_at)).length,
    votes: rows.votes.filter((v) => isDay(v.voted_at)).length,
    newWorks: new Set(livedToday.filter((p) => isDay(p.created_at)).map((p) => `${p.item_type}:${p.item_id}`)).size,
  };
}

export interface MissionLike {
  template: MissionTemplate;
  target: number;
  item_type: string | null;
  item_id: string | null;
}

export function missionProgress(m: MissionLike, d: PetDayCounts): number {
  const key = m.item_type && m.item_id ? `${m.item_type}:${m.item_id}` : null;
  switch (m.template) {
    case "rating":
      return d.ratings;
    case "vote":
      return d.votes;
    case "new_work":
      return d.newWorks;
    case "any_activity":
      return d.minutes > 0 || d.episodes > 0 || d.finishedKeys.length > 0 || d.notes > 0 || d.quotes > 0 || d.posts > 0 || d.votes > 0 ? 1 : 0;
    case "session_minutes":
    case "daily_goal":
      return d.minutes;
    case "note":
      return d.notes;
    case "quote":
      return d.quotes;
    case "post":
      return d.posts;
    case "session_pages":
      return d.pages;
    case "episodes":
      return d.episodes;
    case "review":
      return key && d.reviewedKeys.includes(key) ? 1 : 0;
    case "finish_pass":
      return key && d.finishedKeys.includes(key) ? 1 : 0;
  }
}
