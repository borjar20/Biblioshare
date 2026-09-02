// Contadores brutos que alimentan deriveAttributes. Los lee get-pet-counts.ts
// de las tablas existentes; aquí solo la forma, para que la derivación sea pura.
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
  importedRows: number;
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
  importedRows: 0,
};

export type SessionRow = {
  pass_id: string;
  duration_minutes: number | null;
  position: number | null;
  session_date: string;
  started_at: string | null;
};

/** Σ por sesión de max(floor(min/10), floor(páginasAvanzadas/10)). Las páginas
 *  avanzadas son la diferencia de `position` con la sesión anterior del MISMO
 *  pase (position es acumulada); un retroceso vale 0, no resta. */
export function sessionUnits(rows: SessionRow[]): number {
  const byPass = new Map<string, SessionRow[]>();
  for (const r of rows) {
    const list = byPass.get(r.pass_id) ?? [];
    list.push(r);
    byPass.set(r.pass_id, list);
  }
  let units = 0;
  for (const list of byPass.values()) {
    list.sort((a, b) =>
      `${a.session_date}${a.started_at ?? ""}`.localeCompare(`${b.session_date}${b.started_at ?? ""}`),
    );
    let prev = 0;
    for (const r of list) {
      const pages = r.position == null ? 0 : Math.max(0, r.position - prev);
      if (r.position != null) prev = r.position;
      const minutes = r.duration_minutes ?? 0;
      units += Math.max(Math.floor(minutes / 10), Math.floor(pages / 10));
    }
  }
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
