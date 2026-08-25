import type { createClient } from "@/lib/supabase/server";
import { parsePosition } from "@/lib/library/position";
import { getItemTitles, keyFor } from "./get-item-titles";
import { type StatsPeriod, periodBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PaceRow = {
  pass_id: string;
  session_date: string;
  position: unknown;
};

/**
 * Un avance MEDIDO: páginas ganadas entre dos sesiones consecutivas del mismo
 * pase, con la sesión que lo cerró.
 */
type Advance<T extends PaceRow> = { pages: number; session: T };

/**
 * Los avances positivos de página, por pase.
 *
 * Comparte tres decisiones entre páginas/día y páginas/hora, y por eso vive aquí
 * en vez de estar copiada:
 *
 *  · **Agrupa por pase**, no por obra: cada relectura arranca su cursor en cero,
 *    y sin esto un segundo pase que empieza por la página 10 restaría 290 al
 *    primero que terminó en la 300.
 *  · **La PRIMERA sesión de un pase solo fija el cursor.** Es lo que separa una
 *    medida de una inflada: quien empieza a registrar por la página 300 no ha
 *    leído 300 páginas en esa sesión.
 *  · **Un retroceso no resta.** Se ignora y se vuelve a fijar el cursor: releer
 *    hacia atrás no es leer negativo.
 */
function advancesByPass<T extends PaceRow>(rows: T[]): Advance<T>[] {
  const byPass = new Map<string, T[]>();
  for (const row of rows) {
    const list = byPass.get(row.pass_id) ?? [];
    list.push(row);
    byPass.set(row.pass_id, list);
  }

  const out: Advance<T>[] = [];
  for (const sessions of byPass.values()) {
    sessions.sort((a, b) => a.session_date.localeCompare(b.session_date));
    let lastPage: number | null = null;
    for (const session of sessions) {
      const position = parsePosition("book", session.position);
      const page = "page" in position ? position.page : undefined;
      if (page !== undefined && lastPage !== null && page > lastPage) {
        out.push({ pages: page - lastPage, session });
      }
      if (page !== undefined) lastPage = page;
    }
  }
  return out;
}

// Cálculo puro (testable) de páginas/día de media: suma de los avances de página
// positivos (por pase, cada relectura arranca su cursor en 0 — §Tarea 9 hub) /
// los días distintos en que leíste. null si no hay avances medibles.
export function computePagesPerDay(rows: PaceRow[]): number | null {
  const advances = advancesByPass(rows);
  if (advances.length === 0) return null;

  const totalPages = advances.reduce((sum, a) => sum + a.pages, 0);
  const readingDays = new Set(advances.map((a) => a.session.session_date));
  return Math.round(totalPages / readingDays.size);
}

export type SpeedRow = PaceRow & {
  /** La obra del pase. Hace falta para desglosar la velocidad por libro. */
  item_id: string;
  /** Minutos de la sesión. `null` = no se registró, y entonces no promedia. */
  duration_minutes: number | null;
};

export type WorkSpeed = {
  itemId: string;
  /** Lo rellena el getter. El cálculo puro no sabe de títulos. */
  title?: string;
  pagesPerHour: number;
  pages: number;
  minutes: number;
};

export type ReadingSpeed = {
  /** Páginas por hora de LECTURA. `null` si no hay ningún avance cronometrado. */
  pagesPerHour: number | null;
  /** Por obra, de más rápida a más lenta. */
  works: WorkSpeed[];
  /**
   * Avances medidos que quedaron fuera por no traer duración. Se dicen: la media
   * habla solo de las sesiones cronometradas, y no se ve cuáles son.
   */
  withoutDuration: number;
};

/**
 * Velocidad real: páginas por HORA de lectura.
 *
 * `computePagesPerDay` divide por días distintos, así que mezcla una sesión de
 * tres horas con una de diez minutos y contesta a «cuánto avanzas al día», que
 * es una pregunta de constancia. Esta contesta a «a qué velocidad lees», que es
 * una de ritmo, y para eso el denominador tiene que ser tiempo.
 *
 * Solo entran los avances con `duration_minutes`, igual que hace `computeHabits`
 * con su media de sesión. Los demás se cuentan aparte.
 */
export function computeReadingSpeed(rows: SpeedRow[]): ReadingSpeed {
  const advances = advancesByPass(rows);

  let totalPages = 0;
  let totalMinutes = 0;
  let withoutDuration = 0;
  const byWork = new Map<string, { pages: number; minutes: number }>();

  for (const { pages, session } of advances) {
    const minutes = session.duration_minutes;
    if (minutes === null || minutes <= 0) {
      withoutDuration += 1;
      continue;
    }
    totalPages += pages;
    totalMinutes += minutes;
    const acc = byWork.get(session.item_id) ?? { pages: 0, minutes: 0 };
    acc.pages += pages;
    acc.minutes += minutes;
    byWork.set(session.item_id, acc);
  }

  const works: WorkSpeed[] = [...byWork.entries()]
    .map(([itemId, a]) => ({
      itemId,
      pagesPerHour: Math.round((a.pages / a.minutes) * 60),
      pages: a.pages,
      minutes: a.minutes,
    }))
    .sort((a, b) => b.pagesPerHour - a.pagesPerHour);

  return {
    pagesPerHour: totalMinutes > 0 ? Math.round((totalPages / totalMinutes) * 60) : null,
    works,
    withoutDuration,
  };
}

// Páginas/día de media (frame B/G): "34 pág/día". Solo libros — las series se
// miden en episodios. Ver docs/REQUIREMENTS.md §7.14.
export async function getPagesPerDay(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
): Promise<number | null> {
  let query = supabase
    .from("progress_sessions")
    .select("pass_id, session_date, position, passes!inner(item_type)")
    .eq("user_id", userId)
    .eq("passes.item_type", "book");

  const bounds = periodBounds(period);
  if (bounds) {
    query = query
      .gte("session_date", bounds.start)
      .lt("session_date", bounds.endExclusive);
  }

  const { data, error } = await query;

  if (error) throw error;
  return computePagesPerDay((data ?? []) as PaceRow[]);
}

/**
 * Velocidad de lectura, con su desglose por obra.
 *
 * **Sin `use cache`**: depende de `auth.uid()` por RLS (regla #437).
 */
export async function getReadingSpeed(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
): Promise<ReadingSpeed> {
  let query = supabase
    .from("progress_sessions")
    .select("pass_id, session_date, position, duration_minutes, passes!inner(item_type, item_id)")
    .eq("user_id", userId)
    .eq("passes.item_type", "book");

  const bounds = periodBounds(period);
  if (bounds) {
    query = query
      .gte("session_date", bounds.start)
      .lt("session_date", bounds.endExclusive);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows: SpeedRow[] = (
    (data ?? []) as (PaceRow & {
      duration_minutes: number | null;
      passes: { item_id: string } | { item_id: string }[];
    })[]
  ).map((r) => ({
    pass_id: r.pass_id,
    session_date: r.session_date,
    position: r.position,
    duration_minutes: r.duration_minutes,
    // PostgREST devuelve el embed como objeto o como array de uno según cómo
    // resuelva la relación; normalizarlo aquí evita que un cambio de cardinalidad
    // deje `item_id` en `undefined` y agrupe todas las obras en una sola.
    item_id: Array.isArray(r.passes) ? r.passes[0]?.item_id : r.passes?.item_id,
  }));

  const speed = computeReadingSpeed(rows.filter((r) => Boolean(r.item_id)));
  if (speed.works.length === 0) return speed;

  const titles = await getItemTitles(supabase, {
    book: new Set(speed.works.map((w) => w.itemId)),
    movie: new Set(),
    series: new Set(),
  });

  // Las obras que ya no están en catálogo se caen aquí (issue #272).
  const withTitle = speed.works.flatMap((w) => {
    const title = titles.get(keyFor("book", w.itemId));
    return title ? [{ ...w, title }] : [];
  });

  return { ...speed, works: withTitle };
}
