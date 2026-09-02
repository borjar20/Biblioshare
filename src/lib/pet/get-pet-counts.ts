import type { createClient } from "@/lib/supabase/server";
import { STREAK_MILESTONES } from "@/lib/celebrations/registry";
import { UNTITLED_FALLBACK } from "@/lib/catalog/untitled";
import { pagesForPass } from "@/lib/editions/edition-label";
import { addDaysISO, todayISO, toISODate } from "@/lib/stats/dates";
import { getStreaks } from "@/lib/stats/get-streaks";
import { BALANCE } from "./balance";
import type { PetAttribute } from "./classes";
import {
  countCompletedSagas,
  sessionUnits,
  splitPassHistory,
  type PetCounts,
  type SagaItemRow,
  type SessionRow,
} from "./counts";
import type { MissionCandidate, MissionEligibility } from "./missions/generate";
import { dayCounts, type DayRows, type PetDayCounts } from "./missions/progress";
import { isMissionTemplate, MISSION_ATTR } from "./missions/templates";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface PetCountsResult {
  counts: PetCounts;
  /** Último día "YYYY-MM-DD" con actividad global, o null. */
  lastActivityISO: string | null;
  /** Contadores de hoy y de ayer (las misiones de ayer sin completar se evalúan también). */
  days: { today: PetDayCounts; yesterday: PetDayCounts };
  eligibility: MissionEligibility;
  /** El día LOCAL con el que se han calculado `days` y `eligibility`. Se
   *  devuelve para que quien llama NO vuelva a pedir `todayISO()`: dos lecturas
   *  a los lados de la medianoche darían días distintos en la misma petición. */
  today: string;
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
    missions,
    clubMember,
  ] = await Promise.all([
    supabase
      .from("progress_sessions")
      .select("pass_id, duration_minutes, position, session_date, started_at")
      .eq("user_id", userId),
    supabase
      .from("passes")
      .select("id, item_type, item_id, status, finished_on, rating, created_at, updated_at, position, edition_id")
      .eq("user_id", userId),
    supabase.from("episode_watches").select("id, rating, pass_id, watched_on").eq("user_id", userId),
    supabase.from("notes").select("kind, created_at").eq("user_id", userId),
    supabase.from("club_posts").select("kind, created_at").eq("author_id", userId),
    supabase.from("club_poll_votes").select("voted_at").eq("user_id", userId),
    supabase.from("club_activity_participants").select("activity_id").eq("user_id", userId),
    supabase.from("follows").select("followee_id").eq("follower_id", userId).eq("status", "accepted"),
    supabase.from("profiles").select("daily_goal_minutes").eq("user_id", userId).maybeSingle(),
    getStreaks(supabase, userId),
    supabase.from("saga_follows").select("saga_id").eq("user_id", userId),
    // Las reseñas se leen SIEMPRE por la vista pass_reviews: passes.review no tiene grant select para authenticated a propósito (20260714_passes_review_privacy.sql); leerla en la tabla revienta la consulta entera con 42501.
    supabase.from("pass_reviews").select("id, item_type, item_id, review").eq("user_id", userId),
    supabase.from("pet_daily_missions").select("template, xp").eq("user_id", userId).not("completed_at", "is", null),
    supabase.from("club_members").select("club_id").eq("user_id", userId).eq("status", "active").limit(1),
  ]);

  for (const r of [sessions, passes, episodes, notes, posts, votes, events, follows, profile, sagaFollows, reviewRows, missions, clubMember]) {
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

  // XP de misiones completadas, agrupada por el atributo de la plantilla. Una
  // plantilla retirada del catálogo (isMissionTemplate=false) no suma: su XP se
  // pierde a propósito, igual que un peso que se pone a cero.
  const missionXp: Record<PetAttribute, number> = { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 };
  for (const m of missions.data ?? []) {
    if (isMissionTemplate(m.template)) missionXp[MISSION_ATTR[m.template]] += m.xp;
  }

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
    missionXp,
    missionsCompleted: (missions.data ?? []).length,
    bestStreak: streaks.best,
  };

  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  // `livedPasses` viene de splitPassHistory tipado como PassRow[] (sin `id`),
  // pero son las MISMAS referencias que `passRows` (splitPassHistory no clona
  // filas): identidad de objeto para recuperar el `id` sin tocar counts.ts.
  const livedRefs = new Set<object>(livedPasses);
  const livedIds = new Set(passRows.filter((p) => livedRefs.has(p)).map((p) => p.id));
  const dayRows: DayRows = {
    sessions: sessionRows,
    episodes: (episodes.data ?? []).map((e) => ({ watched_on: e.watched_on, rating: e.rating })),
    passes: passRows.map((p) => ({
      item_type: p.item_type,
      item_id: p.item_id,
      status: p.status,
      finished_on: p.finished_on,
      rating: p.rating,
      created_at: p.created_at,
      updated_at: p.updated_at,
      lived: livedIds.has(p.id),
    })),
    notes: (notes.data ?? []).map((n) => ({ kind: n.kind, created_at: n.created_at })),
    posts: postRows.map((p) => ({ kind: p.kind, created_at: p.created_at })),
    votes: (votes.data ?? []).map((v) => ({ voted_at: v.voted_at })),
    reviewedKeys: (reviewRows.data ?? [])
      .filter((r) => (r.review ?? "").trim().length > 0)
      .map((r) => `${r.item_type}:${r.item_id}`),
  };
  const toDay = (ts: string) => toISODate(new Date(ts));
  const days = { today: dayCounts(dayRows, today, toDay), yesterday: dayCounts(dayRows, yesterday, toDay) };

  const eligibility = await missionEligibility(supabase, {
    passRows,
    livedIds,
    episodeRows: (episodes.data ?? []).map((e) => ({ pass_id: e.pass_id })),
    reviewedKeys: new Set(dayRows.reviewedKeys),
    dailyGoal: goal,
    hasClub: (clubMember.data ?? []).length > 0,
    today,
  });

  return { counts, lastActivityISO: lastDates.at(-1) ?? null, days, eligibility, today };
}

type EligibilityInput = {
  passRows: {
    id: string;
    item_type: string;
    item_id: string;
    status: string;
    finished_on: string | null;
    position: unknown;
    edition_id: string | null;
  }[];
  livedIds: Set<string>;
  episodeRows: { pass_id: string | null }[];
  reviewedKeys: Set<string>;
  dailyGoal: number | null;
  hasClub: boolean;
  today: string;
};

// Qué misiones tienen sentido HOY (spec fase 2 §1.2). Las candidatas de las
// duras salen del estado: libro >= 70 % de sus páginas (regla de páginas =
// pagesForPass: edición del pase o books.total_pages), serie con <= 2
// episodios sin ver (series.total_episodes − vistos del pase), y terminado en
// los últimos 7 días sin reseña. Una consulta por tipo, solo si hay pases abiertos de ese tipo.
async function missionEligibility(supabase: SupabaseServerClient, input: EligibilityInput): Promise<MissionEligibility> {
  const { passRows, livedIds, episodeRows, reviewedKeys, dailyGoal, hasClub, today } = input;
  const open = passRows.filter((p) => p.status === "in_progress");
  const openBooks = open.filter((p) => p.item_type === "book");
  const openSeries = open.filter((p) => p.item_type === "series");

  let finishCandidate: MissionCandidate | null = null;
  let bestRatio = 0;

  if (openBooks.length > 0) {
    const editionIds = openBooks.map((p) => p.edition_id).filter((id): id is string => id != null);
    const [books, editions] = await Promise.all([
      supabase.from("books").select("id, title, total_pages").in("id", openBooks.map((p) => p.item_id)),
      editionIds.length > 0
        ? supabase.from("book_editions").select("id, total_pages").in("id", editionIds)
        : Promise.resolve({ data: [] as { id: string; total_pages: number | null }[], error: null }),
    ]);
    if (books.error) throw books.error;
    if (editions.error) throw editions.error;
    const bookById = new Map((books.data ?? []).map((b) => [b.id, b]));
    const editionPages = new Map((editions.data ?? []).map((e) => [e.id, e.total_pages]));
    for (const p of openBooks) {
      const raw = p.position;
      const page = raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as { page?: unknown }).page === "number" ? (raw as { page: number }).page : null;
      const book = bookById.get(p.item_id);
      const total = pagesForPass(p.edition_id ? { totalUnits: editionPages.get(p.edition_id) ?? null } : null, book?.total_pages);
      if (page == null || !total || total <= 0 || !book) continue;
      const ratio = page / total;
      if (ratio >= BALANCE.missions.finishThreshold && ratio > bestRatio) {
        bestRatio = ratio;
        finishCandidate = { itemType: "book", itemId: p.item_id, title: book.title ?? UNTITLED_FALLBACK };
      }
    }
  }

  if (openSeries.length > 0) {
    const { data: series, error } = await supabase.from("series").select("id, title, total_episodes").in("id", openSeries.map((p) => p.item_id));
    if (error) throw error;
    const watchedByPass = new Map<string, number>();
    for (const e of episodeRows) if (e.pass_id) watchedByPass.set(e.pass_id, (watchedByPass.get(e.pass_id) ?? 0) + 1);
    for (const p of openSeries) {
      const s = (series ?? []).find((x) => x.id === p.item_id);
      if (!s || !s.total_episodes || s.total_episodes <= 0) continue;
      const watched = watchedByPass.get(p.id) ?? 0;
      const left = s.total_episodes - watched;
      const ratio = watched / s.total_episodes;
      if (left >= 0 && left <= BALANCE.missions.seriesEpisodesLeft && ratio > bestRatio) {
        bestRatio = ratio;
        finishCandidate = { itemType: "series", itemId: p.item_id, title: s.title ?? UNTITLED_FALLBACK };
      }
    }
  }

  // review: el terminado más reciente de los últimos 7 días sin reseña (solo vividos).
  const since = addDaysISO(today, -BALANCE.missions.reviewWindowDays);
  const recent = passRows
    .filter((p) => p.status === "completed" && p.finished_on != null && p.finished_on >= since && livedIds.has(p.id))
    .filter((p) => !reviewedKeys.has(`${p.item_type}:${p.item_id}`))
    .sort((a, b) => (b.finished_on ?? "").localeCompare(a.finished_on ?? ""));
  let reviewCandidate: MissionCandidate | null = null;
  if (recent.length > 0) {
    const p = recent[0];
    let data: { title: string | null } | null = null;
    if (p.item_type === "book") {
      const res = await supabase.from("books").select("title").eq("id", p.item_id).maybeSingle();
      if (res.error) throw res.error;
      data = res.data;
    } else if (p.item_type === "movie") {
      const res = await supabase.from("movies").select("title").eq("id", p.item_id).maybeSingle();
      if (res.error) throw res.error;
      data = res.data;
    } else {
      const res = await supabase.from("series").select("title").eq("id", p.item_id).maybeSingle();
      if (res.error) throw res.error;
      data = res.data;
    }
    if (data) reviewCandidate = { itemType: p.item_type, itemId: p.item_id, title: data.title ?? UNTITLED_FALLBACK };
  }

  return { hasClub, hasOpenSeries: openSeries.length > 0, dailyGoal, finishCandidate, reviewCandidate };
}
