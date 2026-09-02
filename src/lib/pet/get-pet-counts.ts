import type { createClient } from "@/lib/supabase/server";
import { STREAK_MILESTONES } from "@/lib/celebrations/registry";
import { UNTITLED_FALLBACK } from "@/lib/catalog/untitled";
import { pagesForPass } from "@/lib/editions/edition-label";
import { addDaysISO, todayISO, toISODate } from "@/lib/stats/dates";
import { bestStreak } from "@/lib/stats/streak";
import { BALANCE } from "./balance";
import type { PetAttribute } from "./classes";
import {
  countCompletedSagas,
  lastActivityFrom,
  petActiveDays,
  sessionUnits,
  splitPassHistory,
  type PetCounts,
  type SagaItemRow,
  type SessionRow,
} from "./counts";
import { finishRemaining, type MissionCandidate, type MissionEligibility } from "./missions/generate";
import { dayCounts, type DayRows, type PetDayCounts } from "./missions/progress";
import { isMissionTemplate, MISSION_ATTR } from "./missions/templates";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface PetCountsResult {
  counts: PetCounts;
  /** Último día "YYYY-MM-DD" con actividad VIVIDA (sesión, pase vivido cerrado,
   *  post o voto), o null. El historial volcado no cuenta (issue #1041): es la
   *  misma regla que los días activos, para que el humor y la salida de la
   *  bellota no dependan de un import. */
  lastActivityISO: string | null;
  /** Contadores de hoy y de ayer (las misiones de ayer sin completar se evalúan también). */
  days: { today: PetDayCounts; yesterday: PetDayCounts };
  /** PEREZOSA y memoizada: cuesta 2-3 consultas más y solo la necesita
   *  `pickDailyMissions`, o sea la primera visita del día (issue #1037). Las
   *  demás visitas no la llaman y no pagan esas consultas. */
  eligibility: () => Promise<MissionEligibility>;
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
      .eq("user_id", userId)
      // Orden estable: la candidata de finish_pass se elige por "menos resto" y
      // en empate gana la primera; sin order, PostgREST no garantiza el orden y
      // dos renders del mismo día podrían congelar misiones distintas.
      .order("id"),
    supabase.from("episode_watches").select("id, rating, pass_id, watched_on").eq("user_id", userId),
    supabase.from("notes").select("kind, created_at").eq("user_id", userId),
    supabase.from("club_posts").select("kind, created_at").eq("author_id", userId),
    supabase.from("club_poll_votes").select("voted_at").eq("user_id", userId),
    supabase.from("club_activity_participants").select("activity_id").eq("user_id", userId),
    supabase.from("follows").select("followee_id").eq("follower_id", userId).eq("status", "accepted"),
    supabase.from("profiles").select("daily_goal_minutes").eq("user_id", userId).maybeSingle(),
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
  const sessionRows: SessionRow[] = (sessions.data ?? []).map((s) => ({
    pass_id: s.pass_id,
    duration_minutes: s.duration_minutes,
    position: pageOf(s.position),
    session_date: s.session_date,
    started_at: s.started_at,
  }));
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
  const openPasses = passRows.filter((p) => p.status === "in_progress");
  const openBooks = openPasses.filter((p) => p.item_type === "book");

  // Segunda tanda, en paralelo: ítems de las sagas seguidas y los libros. Los
  // libros salen en UNA consulta para las dos cosas que los necesitan —
  // géneros/autores de los pases VIVIDOS (INT/DES) y título/páginas de los
  // ABIERTOS para la candidata de finish_pass— en vez de dos lecturas de la
  // misma tabla por visita (issue #1037). Un pase abierto puede ser historial
  // (volcado sin cerrar), así que es la unión, no un subconjunto.
  const sagaIds = (sagaFollows.data ?? []).map((r) => r.saga_id);
  // Va en la URL del GET (~38 bytes por uuid): con varios cientos de libros
  // distintos se acerca al límite del gateway. Hoy el máximo en prod son 158
  // pases; si algún día se supera, trocear el `.in()`.
  const bookIds = [
    ...new Set([...livedPasses.filter((p) => p.item_type === "book"), ...openBooks].map((p) => p.item_id)),
  ];
  const [sagaItems, books] = await Promise.all([
    sagaIds.length > 0
      ? supabase.from("saga_items").select("saga_id, item_type, item_id, optional").in("saga_id", sagaIds)
      : Promise.resolve({ data: [] as SagaItemRow[], error: null }),
    bookIds.length > 0
      ? supabase.from("books").select("id, title, author, genres, total_pages").in("id", bookIds)
      : Promise.resolve({ data: [] as BookRow[], error: null }),
  ]);
  if (sagaItems.error) throw sagaItems.error;
  if (books.error) throw books.error;

  // Sagas completadas: solo las que sigues (spec §2: INT).
  const completedSagas = countCompletedSagas((sagaItems.data ?? []) as SagaItemRow[], completedKeys);

  // Géneros distintos y autores: de los libros con pase VIVIDO (cualquier
  // estado para autores/obras = DES "exploración"; solo terminados para
  // géneros = INT).
  const bookById = new Map<string, BookRow>((books.data ?? []).map((b) => [b.id, b]));
  const genres = new Set<string>();
  const authors = new Set<string>();
  const completedBookIds = new Set(completedPasses.filter((p) => p.item_type === "book").map((p) => p.item_id));
  for (const p of livedPasses) {
    if (p.item_type !== "book") continue;
    const b = bookById.get(p.item_id);
    if (!b) continue;
    if (b.author) authors.add(b.author.trim().toLowerCase());
    if (completedBookIds.has(b.id)) for (const g of b.genres ?? []) genres.add(g);
  }

  const postRows = posts.data ?? [];
  const toDay = (ts: string) => toISODate(new Date(ts));
  // Solo pases VIVIDOS (issue #1041): el historial no es actividad.
  const lastActivityISO = lastActivityFrom(
    { sessions: sessionRows, livedPasses, posts: postRows, votes: votes.data ?? [] },
    toDay,
  );

  // XP de misiones completadas, agrupada por el atributo de la plantilla. Una
  // plantilla retirada del catálogo (isMissionTemplate=false) no suma: su XP se
  // pierde a propósito, igual que un peso que se pone a cero.
  // Días activos y rachas DE LA MASCOTA: solo lo vivido en la app (I3). No sale
  // de getStreaks() —que mira todos los finished_on y sigue siendo la racha del
  // panel de perfil— porque un volcado de 148 lecturas con sus fechas entraría
  // como 148 días activos y con las rachas de otra app.
  const activeDaySet = petActiveDays(sessionRows, livedPasses);
  const petBestStreak = bestStreak(activeDaySet);

  const missionXp: Record<PetAttribute, number> = { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 };
  for (const m of missions.data ?? []) {
    if (isMissionTemplate(m.template)) missionXp[MISSION_ATTR[m.template]] += m.xp;
  }

  const counts: PetCounts = {
    sessionUnits: sessionUnits(sessionRows),
    episodes: (episodes.data ?? []).length,
    activeDays: activeDaySet.size,
    dailyGoalDays,
    streakMilestones: STREAK_MILESTONES.filter((m) => m <= petBestStreak).length,
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
    bestStreak: petBestStreak,
  };

  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const livedIds = new Set(livedPasses.map((p) => p.id));
  const reviewedKeys = (reviewRows.data ?? [])
    .filter((r) => (r.review ?? "").trim().length > 0)
    .map((r) => `${r.item_type}:${r.item_id}`);
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
    reviewedKeys,
  };
  const days = { today: dayCounts(dayRows, today, toDay), yesterday: dayCounts(dayRows, yesterday, toDay) };

  // Memoiza también el fallo: si la elegibilidad revienta, cada llamada de la
  // misma petición relanza el mismo error en vez de repetir las consultas.
  let eligibilityPromise: Promise<MissionEligibility> | null = null;
  const eligibility = () =>
    (eligibilityPromise ??= missionEligibility(supabase, {
      passRows,
      openPasses,
      livedIds,
      bookById,
      episodeRows: (episodes.data ?? []).map((e) => ({ pass_id: e.pass_id })),
      reviewedKeys: new Set(reviewedKeys),
      dailyGoal: goal,
      hasClub: (clubMember.data ?? []).length > 0,
      today,
    }));

  return { counts, lastActivityISO, days, eligibility, today };
}

type BookRow = { id: string; title: string | null; author: string | null; genres: string[] | null; total_pages: number | null };

type PassLite = {
  id: string;
  item_type: string;
  item_id: string;
  status: string;
  finished_on: string | null;
  position: unknown;
  edition_id: string | null;
};

type EligibilityInput = {
  passRows: PassLite[];
  openPasses: PassLite[];
  livedIds: Set<string>;
  bookById: Map<string, BookRow>;
  episodeRows: { pass_id: string | null }[];
  reviewedKeys: Set<string>;
  dailyGoal: number | null;
  hasClub: boolean;
  today: string;
};

/** `page` de una posición JSONB de libro, o null si no la trae. */
function pageOf(raw: unknown): number | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as { page?: unknown }).page === "number"
    ? (raw as { page: number }).page
    : null;
}

// Qué misiones tienen sentido HOY (spec fase 2 §1.2). Las candidatas de las
// duras salen del estado: libro >= 70 % de sus páginas (regla de páginas =
// pagesForPass: edición del pase o books.total_pages), serie con <= 2
// episodios sin ver (series.total_episodes − vistos del pase), y terminado en
// los últimos 7 días sin reseña. Los libros ya vienen leídos (bookById); lo que
// falta —ediciones, series y el título de la candidata a reseña— sale en un
// único viaje, porque no depende entre sí (issue #1037).
async function missionEligibility(supabase: SupabaseServerClient, input: EligibilityInput): Promise<MissionEligibility> {
  const { passRows, openPasses, livedIds, bookById, episodeRows, reviewedKeys, dailyGoal, hasClub, today } = input;
  const openBooks = openPasses.filter((p) => p.item_type === "book");
  const openSeries = openPasses.filter((p) => p.item_type === "series");
  const editionIds = openBooks.map((p) => p.edition_id).filter((id): id is string => id != null);

  // review: el terminado más reciente de los últimos 7 días sin reseña (solo vividos).
  const since = addDaysISO(today, -BALANCE.missions.reviewWindowDays);
  const recent = passRows
    .filter((p) => p.status === "completed" && p.finished_on != null && p.finished_on >= since && livedIds.has(p.id))
    .filter((p) => !reviewedKeys.has(`${p.item_type}:${p.item_id}`))
    .sort((a, b) => (b.finished_on ?? "").localeCompare(a.finished_on ?? ""));
  const reviewPass = recent.at(0) ?? null;

  const none = <T,>(data: T) => Promise.resolve({ data, error: null });
  const [editions, series, reviewTitle] = await Promise.all([
    editionIds.length > 0
      ? supabase.from("book_editions").select("id, total_pages").in("id", editionIds)
      : none([] as { id: string; total_pages: number | null }[]),
    openSeries.length > 0
      ? supabase.from("series").select("id, title, total_episodes").in("id", openSeries.map((p) => p.item_id))
      : none([] as { id: string; title: string | null; total_episodes: number | null }[]),
    reviewPass == null
      ? none<{ title: string | null } | null>(null)
      : reviewPass.item_type === "book"
        ? none<{ title: string | null } | null>(bookById.get(reviewPass.item_id) ?? null)
        : reviewPass.item_type === "movie"
          ? supabase.from("movies").select("title").eq("id", reviewPass.item_id).maybeSingle()
          : supabase.from("series").select("title").eq("id", reviewPass.item_id).maybeSingle(),
  ]);
  if (editions.error) throw editions.error;
  if (series.error) throw series.error;
  if (reviewTitle.error) throw reviewTitle.error;

  // finish_pass: la candidata con MENOS resto en la escala de su tipo
  // (finishRemaining, issue #1036). Empate: la primera encontrada (libros antes).
  let finishCandidate: MissionCandidate | null = null;
  let bestRemaining = Number.POSITIVE_INFINITY;
  const consider = (remaining: number | null, candidate: MissionCandidate) => {
    if (remaining != null && remaining < bestRemaining) {
      bestRemaining = remaining;
      finishCandidate = candidate;
    }
  };

  const editionPages = new Map((editions.data ?? []).map((e) => [e.id, e.total_pages]));
  for (const p of openBooks) {
    const page = pageOf(p.position);
    const book = bookById.get(p.item_id);
    const total = pagesForPass(p.edition_id ? { totalUnits: editionPages.get(p.edition_id) ?? null } : null, book?.total_pages);
    if (page == null || !total || total <= 0 || !book) continue;
    consider(finishRemaining({ kind: "book", ratio: page / total }), {
      itemType: "book",
      itemId: p.item_id,
      title: book.title ?? UNTITLED_FALLBACK,
    });
  }

  const watchedByPass = new Map<string, number>();
  for (const e of episodeRows) if (e.pass_id) watchedByPass.set(e.pass_id, (watchedByPass.get(e.pass_id) ?? 0) + 1);
  const seriesById = new Map((series.data ?? []).map((s) => [s.id, s]));
  for (const p of openSeries) {
    const s = seriesById.get(p.item_id);
    if (!s || !s.total_episodes || s.total_episodes <= 0) continue;
    const left = s.total_episodes - (watchedByPass.get(p.id) ?? 0);
    consider(finishRemaining({ kind: "series", left }), {
      itemType: "series",
      itemId: p.item_id,
      title: s.title ?? UNTITLED_FALLBACK,
    });
  }

  const reviewCandidate: MissionCandidate | null =
    reviewPass && reviewTitle.data
      ? { itemType: reviewPass.item_type, itemId: reviewPass.item_id, title: reviewTitle.data.title ?? UNTITLED_FALLBACK }
      : null;

  return { hasClub, hasOpenSeries: openSeries.length > 0, dailyGoal, finishCandidate, reviewCandidate };
}
