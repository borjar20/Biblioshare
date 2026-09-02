import type { createClient } from "@/lib/supabase/server";
import { STREAK_MILESTONES } from "@/lib/celebrations/registry";
import { getStreaks } from "@/lib/stats/get-streaks";
import {
  countCompletedSagas,
  sessionUnits,
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
    imports,
    profile,
    streaks,
    sagaFollows,
  ] = await Promise.all([
    supabase
      .from("progress_sessions")
      .select("pass_id, duration_minutes, position, session_date, started_at")
      .eq("user_id", userId),
    supabase
      .from("passes")
      .select("item_type, item_id, status, finished_on, rating, review")
      .eq("user_id", userId),
    supabase.from("episode_watches").select("id, rating").eq("user_id", userId),
    supabase.from("notes").select("kind").eq("user_id", userId),
    supabase.from("club_posts").select("kind, created_at").eq("author_id", userId),
    supabase.from("club_poll_votes").select("voted_at").eq("user_id", userId),
    supabase.from("club_activity_participants").select("activity_id").eq("user_id", userId),
    supabase.from("follows").select("followee_id").eq("follower_id", userId).eq("status", "accepted"),
    supabase.from("pending_import_rows").select("id").eq("user_id", userId).eq("status", "resolved"),
    supabase.from("profiles").select("daily_goal_minutes").eq("user_id", userId).maybeSingle(),
    getStreaks(supabase, userId),
    supabase.from("saga_follows").select("saga_id").eq("user_id", userId),
  ]);

  for (const r of [sessions, passes, episodes, notes, posts, votes, events, follows, imports, profile, sagaFollows]) {
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

  // Objetivo diario: días cuyos minutos (solo sesiones de lectura) alcanzan el
  // objetivo ACTUAL. Se usa el objetivo de hoy para todo el historial: es lo
  // que hay, y rebalancear no exige historia.
  const goal = profile.data?.daily_goal_minutes ?? null;
  let dailyGoalDays = 0;
  if (goal && goal > 0) {
    const minutesByDay = new Map<string, number>();
    for (const s of sessionRows) {
      minutesByDay.set(s.session_date, (minutesByDay.get(s.session_date) ?? 0) + (s.duration_minutes ?? 0));
    }
    for (const m of minutesByDay.values()) if (m >= goal) dailyGoalDays++;
  }

  const completedPasses = passRows.filter((p) => p.status === "completed");
  const completedKeys = new Set(completedPasses.map((p) => `${p.item_type}:${p.item_id}`));

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

  // Géneros distintos y autores: de los libros con pase (cualquier estado para
  // autores/obras = DES "exploración"; solo terminados para géneros = INT).
  const bookIds = [...new Set(passRows.filter((p) => p.item_type === "book").map((p) => p.item_id))];
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
  const lastDates = [
    ...sessionRows.map((s) => s.session_date),
    ...passRows.map((p) => p.finished_on).filter((d): d is string => d != null),
    ...postRows.map((p) => p.created_at.slice(0, 10)),
    ...(votes.data ?? []).map((v) => v.voted_at.slice(0, 10)),
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
    reviews: passRows.filter((p) => (p.review ?? "").trim().length > 0).length,
    ratings:
      passRows.filter((p) => p.rating != null).length +
      (episodes.data ?? []).filter((e) => e.rating != null).length,
    posts: postRows.filter((p) => p.kind !== "poll").length,
    polls: postRows.filter((p) => p.kind === "poll").length,
    votes: (votes.data ?? []).length,
    events: (events.data ?? []).length,
    follows: (follows.data ?? []).length,
    newWorks: new Set(passRows.map((p) => `${p.item_type}:${p.item_id}`)).size,
    newAuthors: authors.size,
    importedRows: (imports.data ?? []).length,
  };

  return { counts, lastActivityISO: lastDates.at(-1) ?? null };
}
