// Contadores brutos que alimentan deriveAttributes. Los lee get-pet-counts.ts
// de las tablas existentes; aquí solo la forma, para que la derivación sea pura.
import type { PetAttribute } from "./classes";

export interface PetCounts {
  /** Σ por sesión de max(floor(min/10), floor(páginas/10)). */
  sessionUnits: number;
  episodes: number;
  activeDays: number;
  dailyGoalDays: number;
  streakMilestones: number;
  finishedPasses: number;
  completedSagas: number;
  distinctGenres: number;
  notes: number;
  quotes: number;
  reviews: number;
  ratings: number;
  posts: number;
  votes: number;
  polls: number;
  events: number;
  follows: number;
  newWorks: number;
  newAuthors: number;
  /** Pases `completed` del historial (no vividos en la app): dote de INT con tope. */
  historicalPasses: number;
  /** Obras distintas con algún pase del historial: dote de DES con tope. */
  historicalWorks: number;
  /** XP ganada con misiones completadas, ya agrupada por el atributo de su plantilla. */
  missionXp: Record<PetAttribute, number>;
  missionsCompleted: number;
  /** Mejor racha de días activos (getStreaks().best). */
  bestStreak: number;
}

export const EMPTY_COUNTS: PetCounts = {
  sessionUnits: 0,
  episodes: 0,
  activeDays: 0,
  dailyGoalDays: 0,
  streakMilestones: 0,
  finishedPasses: 0,
  completedSagas: 0,
  distinctGenres: 0,
  notes: 0,
  quotes: 0,
  reviews: 0,
  ratings: 0,
  posts: 0,
  votes: 0,
  polls: 0,
  events: 0,
  follows: 0,
  newWorks: 0,
  newAuthors: 0,
  historicalPasses: 0,
  historicalWorks: 0,
  missionXp: { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 },
  missionsCompleted: 0,
  bestStreak: 0,
};

export type PassRow = {
  item_type: string;
  item_id: string;
  status: string;
  finished_on: string | null;
  rating: number | null;
  /** timestamptz ISO tal cual viene de `passes.created_at`. */
  created_at: string;
};

/** Genérica en la fila: quien llame con filas que traen más columnas (`id`, por
 *  ejemplo) las recupera tipadas en los dos lados, sin volver a cruzarlas con
 *  el array original. */
export interface PassHistorySplit<T extends PassRow = PassRow> {
  /** Pases que el usuario vivió con la app abierta: suman como actividad. */
  lived: T[];
  /** Pases volcados de otra app o añadidos con fecha pasada: solo dote. */
  historical: T[];
}

/** Separa historial de vivido SIN columna nueva (`passes` no marca el origen).
 *  Un pase es historial si cumple cualquiera de:
 *  - se cerró ANTES del día en que se dio de alta (`finished_on < created_at`):
 *    alguien registró hoy una lectura pasada;
 *  - `created_at` es medianoche UTC exacta: nada in-app inserta sin hora, solo
 *    el importador al fechar relecturas pasadas (`historicalCreatedAt` en
 *    src/lib/import/commit-row.ts);
 *  - su día de alta tiene `burstMin` pases o más: un volcado (importación o
 *    carga manual). Cubre el hueco del importador, que cierra con la fecha del
 *    import los CSV sin *Date Read* y por tanto no parecen retroactivos.
 *  `createdDayOf` convierte el timestamptz al día LOCAL (misma convención que
 *  session_date); se inyecta para que esto siga siendo puro. */
export function splitPassHistory<T extends PassRow>(
  rows: T[],
  createdDayOf: (createdAt: string) => string,
  burstMin: number,
): PassHistorySplit<T> {
  const perDay = new Map<string, number>();
  const dayOf = rows.map((r) => createdDayOf(r.created_at));
  for (const d of dayOf) perDay.set(d, (perDay.get(d) ?? 0) + 1);

  const lived: T[] = [];
  const historical: T[] = [];
  rows.forEach((r, i) => {
    const day = dayOf[i];
    const retroactive = r.finished_on != null && r.finished_on < day;
    const midnightUTC = new Date(r.created_at).getTime() % 86_400_000 === 0;
    const burst = (perDay.get(day) ?? 0) >= burstMin;
    (retroactive || midnightUTC || burst ? historical : lived).push(r);
  });
  return { lived, historical };
}

/** Días LOCALES con actividad VIVIDA en la app, para la CON y las rachas de la
 *  mascota: día de sesión ∪ día de cierre de un pase VIVIDO. Deliberadamente
 *  NO es `getStreaks()` (que sí mira todos los `finished_on`, y así se queda
 *  para el panel de perfil): el historial volcado no es actividad, o quien
 *  importa 148 lecturas con sus fechas entra con 148 días activos y las rachas
 *  de otra app (decisiones.md 2026-09-02). */
export function petActiveDays(
  sessions: readonly { session_date: string }[],
  livedPasses: readonly { finished_on: string | null }[],
): Set<string> {
  const days = new Set<string>();
  for (const s of sessions) days.add(s.session_date);
  for (const p of livedPasses) if (p.finished_on != null) days.add(p.finished_on);
  return days;
}

export type SessionRow = {
  pass_id: string;
  duration_minutes: number | null;
  position: number | null;
  session_date: string;
  started_at: string | null;
};

/** Recorre las sesiones agrupadas por pase en orden cronológico y entrega, por
 *  sesión, las páginas avanzadas con la regla única: diferencia con la sesión
 *  anterior del MISMO pase, retroceso = 0 y no baja la referencia. */
export function forEachSessionAdvance(
  rows: SessionRow[],
  visit: (row: SessionRow, pagesAdvanced: number) => void,
): void {
  const byPass = new Map<string, SessionRow[]>();
  for (const r of rows) {
    const list = byPass.get(r.pass_id) ?? [];
    list.push(r);
    byPass.set(r.pass_id, list);
  }
  for (const list of byPass.values()) {
    list.sort((a, b) =>
      `${a.session_date}${a.started_at ?? ""}`.localeCompare(`${b.session_date}${b.started_at ?? ""}`),
    );
    let prev = 0;
    for (const r of list) {
      const pages = r.position == null ? 0 : Math.max(0, r.position - prev);
      if (r.position != null) prev = Math.max(prev, r.position);
      visit(r, pages);
    }
  }
}

/** Σ por sesión de max(floor(min/10), floor(páginasAvanzadas/10)). Las páginas
 *  avanzadas son la diferencia de `position` con la sesión anterior del MISMO
 *  pase (position es acumulada); un retroceso cuenta 0 páginas y NO baja la
 *  referencia, para que las páginas intermedias no se cuenten dos veces en la
 *  siguiente sesión. */
export function sessionUnits(rows: SessionRow[]): number {
  let units = 0;
  forEachSessionAdvance(rows, (r, pages) => {
    const minutes = r.duration_minutes ?? 0;
    units += Math.max(Math.floor(minutes / 10), Math.floor(pages / 10));
  });
  return units;
}

export type SagaItemRow = {
  saga_id: string;
  item_type: string;
  item_id: string;
  optional: boolean;
};

/** Sagas cuyos ítems NO opcionales están todos en `completedKeys` ("tipo:id"). */
export function countCompletedSagas(
  items: SagaItemRow[],
  completedKeys: ReadonlySet<string>,
): number {
  const required = new Map<string, string[]>();
  for (const it of items) {
    if (it.optional) continue;
    const list = required.get(it.saga_id) ?? [];
    list.push(`${it.item_type}:${it.item_id}`);
    required.set(it.saga_id, list);
  }
  let n = 0;
  for (const keys of required.values()) {
    if (keys.length > 0 && keys.every((k) => completedKeys.has(k))) n++;
  }
  return n;
}

/** Días de calendario entre dos "YYYY-MM-DD" (to − from). */
export function daysBetweenISO(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}
