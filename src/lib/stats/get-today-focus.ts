import type { createClient } from "@/lib/supabase/server";
import type { LibraryItem } from "@/lib/library/types";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { getEpisodeData } from "@/lib/series/get-episode-data";
import { todayISO } from "./dates";
import { currentStreak, lastDays } from "./streak";

const EMPTY_DAYS: ReadonlySet<string> = new Set();

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// El bloque "¿Qué has disfrutado hoy?" (plan 01 T5, frame G): lo que tienes a
// medias, con el destacado delante.
//
// **Qué manda para ser el destacado (decisión del usuario, 2026-07-17): la
// sesión más reciente.** Es el dato que ya existe, no cuesta una consulta más y
// es predecible — el usuario sabe por qué ese ítem está ahí. Se descartaron "el
// de la racha viva" (la racha es global, no por ítem: habría que derivarla por
// pase) y "el más cerca de acabar" (deja clavado arriba un libro al 95% que
// llevas meses sin tocar).
//
// OJO: "sesión" no es una tabla, es un concepto. Una SERIE no tiene
// progress_sessions —se mide en episodios (§7.14)—, así que mirar solo
// progress_sessions mandaba TODAS las series al final de la lista y ninguna
// podía ser nunca la destacada. Lo último que tocaste de una serie es su último
// episodio visto, y eso es lo que cuenta aquí.

export type TodayPass = {
  item: LibraryItem;
  /** Del pase activo, no de la obra. */
  startedOn: string | null;
  /** Lo último que tocaste: una sesión (libro) o un episodio visto (serie). */
  lastSessionDate: string | null;
  /** Sesiones con texto — el "3 notas" del frame. */
  noteCount: number;
  /** "Día 6": días desde que abriste el pase, contando el primero. */
  dayNumber: number | null;
  /**
   * Días seguidos CON ESTE PASE, no la racha global del perfil: en una tarjeta
   * que habla de un título concreto, "Racha 6 d" solo puede querer decir seis
   * días seguidos con ESE título. La global sigue en Perfil › Panel y en el
   * rail, donde sí habla de ti y no de una obra.
   */
  streakDays: number;
  /** Los últimos 7 días de ESTE pase, del más antiguo a hoy. */
  week: { date: string; active: boolean }[];
};

export type TodayFocus = {
  featured: TodayPass | null;
  /** El resto, ya ordenado: el carrusel "Continúa donde lo dejaste". */
  rest: TodayPass[];
  /** Todos los en curso, para el "5 · Ver todos ›". */
  total: number;
};

export type NextEpisode = { season: number; episode: number };

// El primer episodio sin ver, en orden (temporada asc, episodio asc) — la
// misma regla que el cursor de la pestaña Episodios, para que "el siguiente"
// signifique lo mismo en los dos sitios.
//
// Solo se resuelve para el DESTACADO: pedir los episodios de cada serie en
// curso costaría una consulta por tarjeta para un dato que las mini ni usan.
// Si la serie aún no tiene episodios cacheados devuelve null y el botón
// desaparece: hidratar desde TMDB no es trabajo de la portada.
export async function getNextEpisode(
  supabase: SupabaseServerClient,
  seriesId: string,
  userId: string,
  activePassId: string | null,
): Promise<NextEpisode | null> {
  const data = await getEpisodeData(supabase, seriesId, userId, activePassId);
  for (const season of data.seasons) {
    for (const ep of data.bySeasons.get(season) ?? []) {
      if (!ep.own.watched) return { season: ep.season, episode: ep.episode };
    }
  }
  return null;
}

function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

export async function getTodayFocus(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<TodayFocus> {
  const items = await getLibraryItems(supabase, userId, { status: "in_progress" });
  if (items.length === 0) return { featured: null, rest: [], total: 0 };

  // Sin pase activo no hay nada que contar (dato huérfano): el ítem sigue
  // saliendo, pero sin "Día N" ni notas.
  const passIds = items
    .map((i) => i.activePassId)
    .filter((id): id is string => id !== null);

  const [passes, sessions, watches] = await Promise.all([
    passIds.length
      ? supabase.from("passes").select("id, started_on").in("id", passIds)
      : Promise.resolve({ data: [] as { id: string; started_on: string | null }[], error: null }),
    passIds.length
      ? supabase
          .from("progress_sessions")
          .select("pass_id, session_date, note")
          .in("pass_id", passIds)
      : Promise.resolve({
          data: [] as { pass_id: string; session_date: string; note: string | null }[],
          error: null,
        }),
    // El equivalente a "sesión" de una serie.
    passIds.length
      ? supabase.from("episode_watches").select("pass_id, watched_on").in("pass_id", passIds)
      : Promise.resolve({ data: [] as { pass_id: string | null; watched_on: string }[], error: null }),
  ]);
  if (passes.error) throw passes.error;
  if (sessions.error) throw sessions.error;
  if (watches.error) throw watches.error;

  const startedByPass = new Map((passes.data ?? []).map((p) => [p.id, p.started_on]));
  const lastByPass = new Map<string, string>();
  const notesByPass = new Map<string, number>();
  // Los días con actividad DE CADA PASE. Salen de las mismas filas que ya
  // trajimos para ordenar, así que la racha por pase no cuesta una consulta
  // más.
  const daysByPass = new Map<string, Set<string>>();
  const touch = (passId: string, date: string) => {
    const prev = lastByPass.get(passId);
    if (!prev || date > prev) lastByPass.set(passId, date);
    const days = daysByPass.get(passId);
    if (days) days.add(date);
    else daysByPass.set(passId, new Set([date]));
  };
  for (const s of sessions.data ?? []) {
    touch(s.pass_id, s.session_date);
    if (s.note && s.note.trim() !== "")
      notesByPass.set(s.pass_id, (notesByPass.get(s.pass_id) ?? 0) + 1);
  }
  for (const w of watches.data ?? []) {
    if (w.pass_id) touch(w.pass_id, w.watched_on);
  }

  const today = todayISO();
  const passesToday: TodayPass[] = items.map((item) => {
    const passId = item.activePassId;
    const startedOn = passId ? (startedByPass.get(passId) ?? null) : null;
    const days = (passId ? daysByPass.get(passId) : null) ?? EMPTY_DAYS;
    return {
      item,
      startedOn,
      lastSessionDate: passId ? (lastByPass.get(passId) ?? null) : null,
      noteCount: passId ? (notesByPass.get(passId) ?? 0) : 0,
      dayNumber: startedOn ? daysBetween(startedOn, today) + 1 : null,
      streakDays: currentStreak(days, today),
      week: lastDays(days, today),
    };
  });

  // Sesión más reciente primero; los que no tienen ninguna van al final (nunca
  // los has tocado, así que no son "donde lo dejaste"). Empate: el pase abierto
  // más recientemente, y el título como último desempate para que el orden sea
  // estable entre renders.
  passesToday.sort((a, b) => {
    if (a.lastSessionDate !== b.lastSessionDate) {
      if (!a.lastSessionDate) return 1;
      if (!b.lastSessionDate) return -1;
      return a.lastSessionDate < b.lastSessionDate ? 1 : -1;
    }
    if (a.startedOn !== b.startedOn) {
      if (!a.startedOn) return 1;
      if (!b.startedOn) return -1;
      return a.startedOn < b.startedOn ? 1 : -1;
    }
    return a.item.title.localeCompare(b.item.title);
  });

  return {
    featured: passesToday[0] ?? null,
    rest: passesToday.slice(1),
    total: passesToday.length,
  };
}
