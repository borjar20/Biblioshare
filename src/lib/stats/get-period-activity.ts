// «Actividad del periodo»: el bloque que preside las dos vistas. Contesta tres
// preguntas de golpe — cuánto llevas, cómo se reparte en el tiempo y si vas
// mejor o peor que el periodo anterior — y lo hace en las DOS magnitudes que el
// esquema pide alternar: obras terminadas y minutos registrados.
//
// La granularidad la manda el periodo, no una opción: siete días se leen por
// día y una década no. Y el periodo anterior es del MISMO tamaño (los 7 días de
// antes, el mes pasado, el año pasado), porque comparar una semana contra un
// año es la forma más fácil de mentir con una flecha verde.

import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { addDaysISO, toISODate } from "./dates";
import type { ItemFilter } from "./filter";
import { type StatsPeriod, periodBounds, previousBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActivityBucket = {
  /** "YYYY-MM-DD", "YYYY-MM" o "YYYY" según la granularidad. */
  key: string;
  works: number;
  minutes: number;
  book: number;
  movie: number;
  series: number;
  /**
   * El cubo cae en el FUTURO: no se ha medido, así que su cero no es un cero.
   * El panel lo pinta como «sin datos» — dibujar la barra a ras de suelo diría
   * que en noviembre no leíste nada, y noviembre aún no ha pasado.
   */
  future?: boolean;
};

export type PeriodActivity = {
  granularity: "day" | "month" | "year";
  buckets: ActivityBucket[];
  works: number;
  minutes: number;
  byType: Record<ItemType, number>;
  /** `null` cuando el periodo es «todo»: no hay un «antes» con el que comparar. */
  previousWorks: number | null;
  previousMinutes: number | null;
};

type PassRow = { finished_on: string; item_type: ItemType };
type SessionRow = { session_date: string; duration_minutes: number | null };

/** Qué grano pide cada periodo. */
export function granularityFor(period: StatsPeriod): PeriodActivity["granularity"] {
  if (period === "week" || period === "month") return "day";
  return typeof period === "number" ? "month" : "year";
}

/** Recorta una fecha ISO a la clave de su cubo. */
function bucketKey(iso: string, grain: PeriodActivity["granularity"]): string {
  return grain === "day" ? iso.slice(0, 10) : grain === "month" ? iso.slice(0, 7) : iso.slice(0, 4);
}

/**
 * Los cubos VACÍOS también existen. Un mes sin actividad vale cero medido, no
 * «sin dato»: se midió y salió cero. Por eso la rejilla se fabrica entera antes
 * de volcar las filas, en vez de dejar que los huecos desaparezcan del eje.
 */
function emptyBuckets(
  grain: PeriodActivity["granularity"],
  bounds: { start: string; endExclusive: string } | null,
  years: number[],
  now: Date,
): ActivityBucket[] {
  const blank = (key: string): ActivityBucket => ({
    key,
    works: 0,
    minutes: 0,
    book: 0,
    movie: 0,
    series: 0,
  });

  if (grain === "year") {
    // Sin límites, el eje son los años con actividad (los trae el llamador).
    return years.map((y) => blank(String(y)));
  }
  if (!bounds) return [];

  const out: ActivityBucket[] = [];
  if (grain === "day") {
    // El día de MAÑANA en adelante no se ha medido, igual que los meses de más
    // abajo. La regla estaba escrita solo para los meses, así que un mes en
    // curso pintaba sus días futuros como ceros: el 4 de agosto, el panel decía
    // «los 31 puntos medidos valen cero» de un mes al que le quedan 27 días.
    // La ventana de «semana» acaba hoy, así que ahí no sobra ninguno.
    const today = toISODate(now);
    for (let d = bounds.start; d < bounds.endExclusive; d = addDaysISO(d, 1)) {
      const bucket = blank(d);
      if (d > today) bucket.future = true;
      out.push(bucket);
    }
    return out;
  }
  // Meses del año: los doce, aunque el año esté a medias.
  const year = Number(bounds.start.slice(0, 4));
  const currentMonth = now.getFullYear() === year ? now.getMonth() + 1 : 12;
  for (let m = 1; m <= 12; m++) {
    const bucket = blank(`${year}-${String(m).padStart(2, "0")}`);
    if (m > currentMonth) bucket.future = true;
    out.push(bucket);
  }
  return out;
}

export async function getPeriodActivity(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
  itemFilter: ItemFilter = "all",
  now = new Date(),
): Promise<PeriodActivity> {
  const grain = granularityFor(period);
  const bounds = periodBounds(period, now);
  const prev = previousBounds(period, now);

  const passSelect = () => {
    let q = supabase
      .from("passes")
      .select("finished_on, item_type")
      .eq("user_id", userId)
      .not("finished_on", "is", null);
    if (itemFilter !== "all") q = q.eq("item_type", itemFilter);
    return q;
  };
  const sessionSelect = () => {
    const columns =
      itemFilter === "all"
        ? "session_date, duration_minutes"
        : "session_date, duration_minutes, passes!inner(item_type)";
    let q = supabase
      .from("progress_sessions")
      .select(columns)
      .eq("user_id", userId);
    if (itemFilter !== "all") q = q.eq("passes.item_type", itemFilter);
    return q;
  };

  let passQuery = passSelect();
  let sessionQuery = sessionSelect();
  if (bounds) {
    passQuery = passQuery
      .gte("finished_on", bounds.start)
      .lt("finished_on", bounds.endExclusive);
    sessionQuery = sessionQuery
      .gte("session_date", bounds.start)
      .lt("session_date", bounds.endExclusive);
  }

  // El periodo anterior solo se consulta si existe: en «todo» sobraría.
  const prevPassQuery = prev
    ? passSelect().gte("finished_on", prev.start).lt("finished_on", prev.endExclusive)
    : null;
  const prevSessionQuery = prev
    ? sessionSelect().gte("session_date", prev.start).lt("session_date", prev.endExclusive)
    : null;

  const [passes, sessions, prevPasses, prevSessions] = await Promise.all([
    passQuery,
    sessionQuery,
    prevPassQuery ?? Promise.resolve({ data: [], error: null }),
    prevSessionQuery ?? Promise.resolve({ data: [], error: null }),
  ]);

  if (passes.error) throw passes.error;
  if (sessions.error) throw sessions.error;
  if (prevPasses.error) throw prevPasses.error;
  if (prevSessions.error) throw prevSessions.error;

  const passRows = (passes.data ?? []) as unknown as PassRow[];
  const sessionRows = (sessions.data ?? []) as unknown as SessionRow[];

  // En «todo» el eje son los años con actividad, así que salen del dato.
  const years = [
    ...new Set([
      ...passRows.map((r) => Number(r.finished_on.slice(0, 4))),
      ...sessionRows.map((r) => Number(r.session_date.slice(0, 4))),
    ]),
  ].sort((a, b) => a - b);

  const buckets = emptyBuckets(grain, bounds, years, now);
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  const byType: Record<ItemType, number> = { book: 0, movie: 0, series: 0 };
  for (const row of passRows) {
    byType[row.item_type] += 1;
    const bucket = byKey.get(bucketKey(row.finished_on, grain));
    if (!bucket) continue;
    bucket.works += 1;
    bucket[row.item_type] += 1;
  }
  let minutes = 0;
  for (const row of sessionRows) {
    const value = row.duration_minutes ?? 0;
    minutes += value;
    const bucket = byKey.get(bucketKey(row.session_date, grain));
    if (!bucket) continue;
    bucket.minutes += value;
  }

  const prevPassRows = (prevPasses.data ?? []) as unknown as PassRow[];
  const prevSessionRows = (prevSessions.data ?? []) as unknown as SessionRow[];

  return {
    granularity: grain,
    buckets,
    works: passRows.length,
    minutes,
    byType,
    previousWorks: prev ? prevPassRows.length : null,
    previousMinutes: prev
      ? prevSessionRows.reduce((s, r) => s + (r.duration_minutes ?? 0), 0)
      : null,
  };
}
