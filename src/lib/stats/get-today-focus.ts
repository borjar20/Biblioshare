import type { createClient } from "@/lib/supabase/server";
import type { LibraryItem } from "@/lib/library/types";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { todayISO } from "./dates";

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

export type TodayPass = {
  item: LibraryItem;
  /** Del pase activo, no de la obra. */
  startedOn: string | null;
  lastSessionDate: string | null;
  /** Sesiones con texto — el "3 notas" del frame. */
  noteCount: number;
  /** "Día 6": días desde que abriste el pase, contando el primero. */
  dayNumber: number | null;
};

export type TodayFocus = {
  featured: TodayPass | null;
  /** El resto, ya ordenado: el carrusel "Continúa donde lo dejaste". */
  rest: TodayPass[];
  /** Todos los en curso, para el "5 · Ver todos ›". */
  total: number;
};

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

  const [passes, sessions] = await Promise.all([
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
  ]);
  if (passes.error) throw passes.error;
  if (sessions.error) throw sessions.error;

  const startedByPass = new Map((passes.data ?? []).map((p) => [p.id, p.started_on]));
  const lastByPass = new Map<string, string>();
  const notesByPass = new Map<string, number>();
  for (const s of sessions.data ?? []) {
    const prev = lastByPass.get(s.pass_id);
    if (!prev || s.session_date > prev) lastByPass.set(s.pass_id, s.session_date);
    if (s.note && s.note.trim() !== "")
      notesByPass.set(s.pass_id, (notesByPass.get(s.pass_id) ?? 0) + 1);
  }

  const today = todayISO();
  const passesToday: TodayPass[] = items.map((item) => {
    const passId = item.activePassId;
    const startedOn = passId ? (startedByPass.get(passId) ?? null) : null;
    return {
      item,
      startedOn,
      lastSessionDate: passId ? (lastByPass.get(passId) ?? null) : null,
      noteCount: passId ? (notesByPass.get(passId) ?? 0) : 0,
      dayNumber: startedOn ? daysBetween(startedOn, today) + 1 : null,
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
