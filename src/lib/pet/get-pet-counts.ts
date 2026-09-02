import type { createClient } from "@/lib/supabase/server";
import { STREAK_MILESTONES } from "@/lib/celebrations/registry";
import { toISODate } from "@/lib/stats/dates";
import { getStreaks } from "@/lib/stats/get-streaks";
import { BALANCE } from "./balance";
import {
  countCompletedSagas,
  sessionUnits,
  splitPassHistory,
  type PetCounts,
  type SagaItemRow,
  type SessionRow,
} from "./counts";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface PetCountsResult {
  counts: PetCounts;
  /** Último día "YYYY-MM-DD" con actividad global, o null. */
  lastActivityISO: string | null;
}

// Lee los contadores de las tablas que YA existen (spec §8). Es la lectura
// COMPLETA: solo la pide /mascota. El shell usa get-companion-state.ts.
// Cliente de la petición (RLS del usuario): nada de esto se cachea (#437).
export async function getPetCounts(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<PetCountsResult> {
  const [
    sessions,
    passes,
    episodes,
    notes,
    posts,
    votes,
    events,
    follows,
    profile,
    streaks,
    sagaFollows,
    reviewRows,
  ] = await Promise.all([
    supabase
      .from("progress_sessions")
      .select("pass_id, duration_minutes, position, session_date, started_at")
      .eq("user_id", userId),
    supabase
      .from("passes")
      .select("item_type, item_id, status, finished_on, rating, created_at")
      .eq("user_id", userId),
    supabase.from("episode_watches").select("id, rating").eq("user_id", userId),
    supabase.from("notes").select("kind").eq("user_id", userId),
    supabase.from("club_posts").select("kind, created_at").eq("author_id", userId),
    supabase.from("club_poll_votes").select("voted_at").eq("user_id", userId),
    supabase.from("club_activity_participants").select("activity_id").eq("user_id", userId),
    supabase.from("follows").select("followee_id").eq("follower_id", userId).eq("status", "accepted"),
    supabase.from("profiles").select("daily_goal_minutes").eq("user_id", userId).maybeSingle(),
    getStreaks(supabase, userId),
    supabase.from("saga_follows").select("saga_id").eq("user_id", userId),
    // Las reseñas se leen SIEMPRE por la vista pass_reviews: passes.review no tiene grant select para authenticated a propósito (20260714_passes_review_privacy.sql); leerla en la tabla revienta la consulta entera con 42501.
    supabase.from("pass_reviews").select("id, review").eq("user_id", userId),
  ]);

  for (const r of [sessions, passes, episodes, notes, posts, votes, events, follows, profile, sagaFollows, reviewRows]) {
    if (r.error) throw r.error;
  }

  // `progress_sessions.position` es JSONB (ver src/lib/library/position.ts):
  // {page} para libros, {season,episode} para series, {} para películas. El
  // brief de esta tarea asumía `position: number | null`, que no es el tipo
  // real de la columna (database.types.ts). Para "páginas avanzadas" solo
  // tiene sentido para libros; se extrae `page` cuando existe y si no, se
  // trata como sin posición (0 páginas, como si `position` fuera null).
  const sessionRows: SessionRow[] = (sessions.data ?? []).map((s) => {
    const raw = s.position;
    const page =
      raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as { page?: unknown }).page === "number"
        ? (raw as { page: number }).page
        : null;
    return {
      pass_id: s.pass_id,
      duration_minutes: s.duration_minutes,
      position: page,
      session_date: s.session_date,
      started_at: s.started_at,
    };
  });
  const passRows = passes.data ?? [];
  // Historial (importado o con fecha pasada) frente a vivido en la app: el
  // historial solo entra como dote con tope (decisiones.md 2026-09-02). Día
  // de alta LOCAL, misma convención que session_date.
  const { lived: livedPasses, historical: historicalPasses } = splitPassHistory(
    passRows,
    (createdAt) => toISODate(new Date(createdAt)),
    BALANCE.history.burstMin,
  );

  // Objetivo diario: días cuyos minutos de sesión alcanzan el objetivo
  // ACTUAL. Misma regla que earnDailyLoopCelebrations (todas las
  // progress_sessions del día; las series no tienen sesiones). Se usa el
  // objetivo de hoy para todo el historial: es lo que hay, y rebalancear no
  // exige historia.
  const goal = profile.data?.daily_goal_minutes ?? null;
  let dailyGoalDays = 0;
  if (goal && goal > 0) {
    const minutesByDay = new Map<string, number>();
    for (const s of sessionRows) {
      minutesByDay.set(s.session_date, (minutesByDay.get(s.session_date) ?? 0) + (s.duration_minutes ?? 0));
    }
    for (const m of minutesByDay.values()) if (m >= goal) dailyGoalDays++;
  }

  const completedPasses = livedPasses.filter((p) => p.status === "completed");
  // Para cerrar una saga vale cualquier pase terminado, también del historial:
  // seguir la saga ya es un acto en la app y el número de sagas está acotado.
  const completedKeys = new Set(
    passRows.filter((p) => p.status === "completed").map((p) => `${p.item_type}:${p.item_id}`),
  );

  // Sagas completadas: solo las que sigues (spec §2: INT). Ítems de esas sagas
  // y comprobación en JS con el helper puro.
  let completedSagas = 0;
  const sagaIds = (sagaFollows.data ?? []).map((r) => r.saga_id);
  if (sagaIds.length > 0) {
    const { data: items, error } = await supabase
      .from("saga_items")
      .select("saga_id, item_type, item_id, optional")
      .in("saga_id", sagaIds);
    if (error) throw error;
    completedSagas = countCompletedSagas((items ?? []) as SagaItemRow[], completedKeys);
  }

  // Géneros distintos y autores: de los libros con pase VIVIDO (cualquier
  // estado para autores/obras = DES "exploración"; solo terminados para
  // géneros = INT).
  const bookIds = [...new Set(livedPasses.filter((p) => p.item_type === "book").map((p) => p.item_id))];
  const genres = new Set<string>();
  const authors = new Set<string>();
  if (bookIds.length > 0) {
    const completedBookIds = new Set(completedPasses.filter((p) => p.item_type === "book").map((p) => p.item_id));
    const { data: books, error } = await supabase
      .from("books")
      .select("id, author, genres")
      .in("id", bookIds);
    if (error) throw error;
    for (const b of books ?? []) {
      if (b.author) authors.add(b.author.trim().toLowerCase());
      if (completedBookIds.has(b.id)) for (const g of b.genres ?? []) genres.add(g);
    }
  }

  const postRows = posts.data ?? [];
  // timestamptz → día LOCAL, la misma convención que session_date y todayISO()
  const lastDates = [
    ...sessionRows.map((s) => s.session_date),
    ...passRows.map((p) => p.finished_on).filter((d): d is string => d != null),
    ...postRows.map((p) => toISODate(new Date(p.created_at))),
    ...(votes.data ?? []).map((v) => toISODate(new Date(v.voted_at))),
  ].sort();

  const counts: PetCounts = {
    sessionUnits: sessionUnits(sessionRows),
    episodes: (episodes.data ?? []).length,
    activeDays: streaks.activeDays,
    dailyGoalDays,
    streakMilestones: STREAK_MILESTONES.filter((m) => m <= streaks.best).length,
    finishedPasses: completedPasses.length,
    completedSagas,
    distinctGenres: genres.size,
    notes: (notes.data ?? []).filter((n) => n.kind === "note").length,
    quotes: (notes.data ?? []).filter((n) => n.kind === "quote").length,
    reviews: (reviewRows.data ?? []).filter((p) => (p.review ?? "").trim().length > 0).length,
    ratings:
      livedPasses.filter((p) => p.rating != null).length +
      (episodes.data ?? []).filter((e) => e.rating != null).length,
    posts: postRows.filter((p) => p.kind !== "poll").length,
    polls: postRows.filter((p) => p.kind === "poll").length,
    votes: (votes.data ?? []).length,
    events: (events.data ?? []).length,
    follows: (follows.data ?? []).length,
    newWorks: new Set(livedPasses.map((p) => `${p.item_type}:${p.item_id}`)).size,
    newAuthors: authors.size,
    historicalPasses: historicalPasses.filter((p) => p.status === "completed").length,
    historicalWorks: new Set(historicalPasses.map((p) => `${p.item_type}:${p.item_id}`)).size,
  };

  return { counts, lastActivityISO: lastDates.at(-1) ?? null };
}
